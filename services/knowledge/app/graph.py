import re
from collections.abc import Iterable

from neo4j import GraphDatabase, Query

from .config import Settings
from .models import RetrievedDocument


STOP_WORDS = {
    "cách",
    "cho",
    "của",
    "đang",
    "được",
    "giải",
    "làm",
    "mình",
    "nào",
    "như",
    "thế",
    "trong",
    "với",
    "what",
    "where",
    "how",
    "the",
    "and",
}


def _lucene_query(question: str) -> str:
    words = re.findall(r"[\w\u3400-\u9fff]+", question.casefold(), flags=re.UNICODE)
    terms: list[str] = []
    for word in words:
        if len(word) < 2 or word in STOP_WORDS or word in terms:
            continue
        terms.append(word)
        if len(terms) == 14:
            break
    if not terms:
        return re.sub(r"[^\w\u3400-\u9fff ]", " ", question).strip()
    return " OR ".join(f'"{term}"' for term in terms)


class GraphStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
            connection_timeout=8,
            connection_acquisition_timeout=8,
            max_transaction_retry_time=4,
        )

    def close(self) -> None:
        self.driver.close()

    def verify(self) -> None:
        self.driver.verify_connectivity()

    def _run(self, cypher: str, parameters: dict | None = None, *, database: str | None = None) -> list[dict]:
        records, _, _ = self.driver.execute_query(
            Query(cypher, timeout=self.settings.neo4j_query_timeout),
            parameters_=parameters or {},
            database_=database or self.settings.neo4j_database,
        )
        return [record.data() for record in records]

    def bootstrap(self) -> None:
        statements = [
            "CREATE CONSTRAINT knowledge_id IF NOT EXISTS FOR (n:Knowledge) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT source_key IF NOT EXISTS FOR (s:Source) REQUIRE s.key IS UNIQUE",
            "CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE",
            "CREATE CONSTRAINT region_name IF NOT EXISTS FOR (r:Region) REQUIRE r.name IS UNIQUE",
            "CREATE INDEX knowledge_url IF NOT EXISTS FOR (n:Knowledge) ON (n.url)",
            "CREATE FULLTEXT INDEX knowledge_search IF NOT EXISTS FOR (n:Knowledge) "
            "ON EACH [n.title, n.aliases_text, n.content, n.region, n.kind]",
        ]
        for statement in statements:
            self._run(statement)
        try:
            self._run("CALL db.awaitIndexes(120)")
        except Exception:
            # Community editions can differ in the accepted awaitIndexes signature.
            pass

    def replace_all(self, documents: list[dict], *, batch_size: int = 250) -> int:
        self.bootstrap()
        self._run("MATCH (n:Knowledge {dataset: 'where-winds-meet'}) DETACH DELETE n")
        self._run("MATCH (s:Source {dataset: 'where-winds-meet'}) DETACH DELETE s")
        self._run("MATCH (t:Topic {dataset: 'where-winds-meet'}) DETACH DELETE t")
        self._run("MATCH (r:Region {dataset: 'where-winds-meet'}) DETACH DELETE r")

        cypher = """
        UNWIND $documents AS row
        MERGE (n:Knowledge {id: row.id})
        SET n.dataset = 'where-winds-meet',
            n.title = row.title,
            n.url = row.url,
            n.source = row.source,
            n.source_key = row.source_key,
            n.kind = row.kind,
            n.content = row.content,
            n.aliases = row.aliases,
            n.aliases_text = row.aliases_text,
            n.region = row.region,
            n.released_global = row.released_global,
            n.updated_at = row.updated_at
        MERGE (s:Source {key: row.source_key})
        SET s.dataset = 'where-winds-meet', s.name = row.source, s.url = row.source_url
        MERGE (s)-[:PUBLISHES]->(n)
        FOREACH (topic IN row.topics |
          MERGE (t:Topic {name: topic})
          SET t.dataset = 'where-winds-meet'
          MERGE (n)-[:ABOUT]->(t)
        )
        FOREACH (region IN row.regions |
          MERGE (r:Region {name: region})
          SET r.dataset = 'where-winds-meet'
          MERGE (n)-[:IN_REGION]->(r)
        )
        """
        for start in range(0, len(documents), batch_size):
            self._run(cypher, {"documents": documents[start : start + batch_size]})

        links = [
            {"source": document["id"], "target_url": url}
            for document in documents
            for url in document.get("links", [])
        ]
        link_query = """
        UNWIND $links AS link
        MATCH (a:Knowledge {id: link.source})
        MATCH (b:Knowledge {url: link.target_url})
        WHERE a <> b
        MERGE (a)-[:REFERENCES]->(b)
        """
        for start in range(0, len(links), batch_size * 2):
            self._run(link_query, {"links": links[start : start + batch_size * 2]})
        return len(documents)

    def count(self) -> int:
        rows = self._run("MATCH (n:Knowledge {dataset: 'where-winds-meet'}) RETURN count(n) AS count")
        return int(rows[0]["count"]) if rows else 0

    def retrieve(self, question: str, *, limit: int) -> list[RetrievedDocument]:
        query = _lucene_query(question)
        if not query:
            return []
        rows = self._run(
            """
            CALL db.index.fulltext.queryNodes('knowledge_search', $query, {limit: $candidate_limit})
            YIELD node, score
            WHERE node.dataset = 'where-winds-meet'
            OPTIONAL MATCH (node)-[:ABOUT|IN_REGION|REFERENCES*1..2]-(related:Knowledge)
            WHERE related.dataset = 'where-winds-meet'
            WITH node, score, collect(DISTINCT related)[..2] AS neighbors
            UNWIND [node] + neighbors AS result
            WITH result, max(CASE WHEN result = node THEN score ELSE score * 0.42 END) AS final_score
            RETURN result.id AS id, result.title AS title, result.url AS url,
                   result.source AS source, result.kind AS kind, result.content AS content,
                   coalesce(result.aliases, []) AS aliases, coalesce(result.region, '') AS region,
                   final_score AS score
            ORDER BY final_score DESC
            LIMIT $limit
            """,
            {"query": query, "candidate_limit": max(limit * 2, 12), "limit": limit},
        )
        return [RetrievedDocument.model_validate(row) for row in rows]


def normalize_documents(documents: Iterable[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen: set[str] = set()
    for document in documents:
        identifier = str(document.get("id", "")).strip()
        title = " ".join(str(document.get("title", "")).split())
        content = "\n".join(line.strip() for line in str(document.get("content", "")).splitlines() if line.strip())
        if not identifier or not title or identifier in seen:
            continue
        seen.add(identifier)
        aliases = [" ".join(str(value).split()) for value in document.get("aliases", []) if str(value).strip()]
        region = " ".join(str(document.get("region", "")).split())
        regions = [" ".join(str(value).split()) for value in document.get("regions", []) if str(value).strip()]
        if region and region not in regions:
            regions.append(region)
        normalized.append(
            {
                **document,
                "id": identifier,
                "title": title[:500],
                "content": content[:20000],
                "aliases": aliases[:30],
                "aliases_text": " | ".join(aliases)[:3000],
                "region": region[:300],
                "regions": regions[:20],
                "topics": list(dict.fromkeys(str(value).strip() for value in document.get("topics", []) if str(value).strip()))[:30],
                "links": list(dict.fromkeys(str(value).strip() for value in document.get("links", []) if str(value).strip()))[:100],
                "released_global": document.get("released_global"),
                "updated_at": str(document.get("updated_at", "")),
            }
        )
    return normalized
