import argparse
import asyncio
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .config import get_settings
from .graph import GraphStore, normalize_documents


USER_AGENT = "WhereWindsMeetKB/1.0 (+https://map.protexa.cloud)"
SOURCE_URLS = {
    "windsmeet-wiki": "https://windsmeet.wiki",
    "wwm-compendium": "https://wwm-compendium.wiki",
    "windsmeet-guide": "https://windsmeetguide.com",
}
WIKI_KINDS = {
    "items": "item",
    "skills": "skill",
    "quests": "quest",
    "places": "place",
    "buffs": "buff",
    "cosmetics": "cosmetic",
    "regions": "region",
}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _identifier(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:{digest}"


def _text(soup: BeautifulSoup) -> str:
    for element in soup.select("script, style, nav, footer, form, noscript"):
        element.decompose()
    return "\n".join(line.strip() for line in soup.get_text("\n").splitlines() if line.strip())


async def _get(client: httpx.AsyncClient, url: str) -> str:
    last_error: httpx.HTTPError | None = None
    for attempt in range(3):
        try:
            response = await client.get(url, timeout=httpx.Timeout(20.0, connect=8.0))
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
    assert last_error is not None
    raise last_error


async def collect_compendium(client: httpx.AsyncClient) -> list[dict]:
    response = await client.get(f"{SOURCE_URLS['wwm-compendium']}/api/compendium")
    response.raise_for_status()
    payload = response.json()
    documents: list[dict] = []
    for section in payload.get("sections", []):
        for category in section.get("categories", []):
            for subcategory in category.get("subcategories", []):
                for group in subcategory.get("groups", []):
                    for entry in group.get("entries", []):
                        obtaining = entry.get("obtaining") or {}
                        aliases = [entry.get("nameCN"), entry.get("aiTranslation")]
                        content_parts = [
                            obtaining.get("translated"),
                            obtaining.get("original"),
                            entry.get("claudeExplained"),
                            entry.get("buggedStatus"),
                        ]
                        region = str(entry.get("region") or "")
                        areas = [value.strip() for value in str(entry.get("areas") or "").split(",") if value.strip()]
                        documents.append(
                            {
                                "id": f"wwm-compendium:{entry.get('id')}",
                                "title": entry.get("nameGlobal") or entry.get("nameCN") or f"Compendium {entry.get('id')}",
                                "url": SOURCE_URLS["wwm-compendium"],
                                "source": "WWM Compendium Wiki",
                                "source_key": "wwm-compendium",
                                "source_url": SOURCE_URLS["wwm-compendium"],
                                "kind": "compendium",
                                "content": "\n".join(str(value) for value in content_parts if value),
                                "aliases": [value for value in aliases if value],
                                "region": region,
                                "regions": [region, *areas],
                                "topics": [section.get("name", ""), category.get("name", ""), subcategory.get("name", ""), group.get("name", "")],
                                "links": [],
                                "released_global": entry.get("releasedInGlobal"),
                                "updated_at": _now(),
                            }
                        )
    print(f"Compendium: {len(documents)} entries", flush=True)
    return documents


async def collect_guide(client: httpx.AsyncClient) -> list[dict]:
    base = SOURCE_URLS["windsmeet-guide"]
    sitemap = await _get(client, f"{base}/sitemap.xml")
    urls = [
        value.strip()
        for value in re.findall(r"<loc>([^<]+)</loc>", sitemap)
        if "/where-winds-meet" in value and "/api/" not in value
    ]
    semaphore = asyncio.Semaphore(4)

    async def fetch_page(url: str) -> dict | None:
        async with semaphore:
            try:
                html = await _get(client, url)
            except httpx.HTTPError:
                return None
        soup = BeautifulSoup(html, "lxml")
        title_node = soup.select_one("h1") or soup.select_one("title")
        title = title_node.get_text(" ", strip=True) if title_node else urlparse(url).path.rsplit("/", 1)[-1]
        links = []
        for anchor in soup.select("a[href]"):
            target = urljoin(url, str(anchor.get("href")))
            if target.startswith(base + "/where-winds-meet"):
                links.append(target.split("#", 1)[0])
        path_parts = [part for part in urlparse(url).path.split("/") if part]
        relative_parts = path_parts[1:] if path_parts and path_parts[0] == "where-winds-meet" else path_parts
        topics = relative_parts[:-1] if len(relative_parts) > 1 else relative_parts
        return {
            "id": _identifier("windsmeet-guide", url),
            "title": title,
            "url": url,
            "source": "WindsMeetGuide",
            "source_key": "windsmeet-guide",
            "source_url": base,
            "kind": topics[0] if topics else "guide",
            "content": _text(soup),
            "aliases": [],
            "region": "",
            "regions": [],
            "topics": topics,
            "links": links,
            "released_global": None,
            "updated_at": _now(),
        }

    results = await asyncio.gather(*(fetch_page(url) for url in urls))
    documents = [result for result in results if result]
    print(f"WindsMeetGuide: {len(documents)} pages", flush=True)
    return documents


async def collect_wiki(client: httpx.AsyncClient, *, detail_limit: int) -> list[dict]:
    base = SOURCE_URLS["windsmeet-wiki"]
    documents: list[dict] = []
    semaphore = asyncio.Semaphore(4)

    async def fetch_sitemap(url: str) -> str:
        async with semaphore:
            return await _get(client, url)

    sitemap_index = await _get(client, f"{base}/sitemap.xml")
    sitemap_urls = [
        value
        for value in re.findall(r"<loc>([^<]+)</loc>", sitemap_index)
        if re.fullmatch(r"https://windsmeet\.wiki/sitemap/\d+\.xml", value)
    ]
    sitemap_pages = await asyncio.gather(*(fetch_sitemap(url) for url in sitemap_urls))
    entry_pattern = re.compile(r"^https://windsmeet\.wiki/db/(item|skill|quest|place|buff|cosmetic)/(.+)$")
    seen_urls: set[str] = set()
    by_kind: dict[str, list[str]] = {kind: [] for kind in WIKI_KINDS.values()}
    for xml in sitemap_pages:
        for url in re.findall(r"<loc>([^<]+)</loc>", xml):
            match = entry_pattern.match(url)
            if not match or url in seen_urls:
                continue
            seen_urls.add(url)
            singular, slug = match.groups()
            by_kind[singular].append(url)
            decoded_slug = unquote(slug).rstrip("/").rsplit("/", 1)[-1]
            title = re.sub(r"--[0-9a-f]{8}$", "", decoded_slug).replace("-", " ").replace("_", " ").strip().title()
            plural = next(name for name, value in WIKI_KINDS.items() if value == singular)
            documents.append(
                {
                    "id": _identifier("windsmeet-wiki", url),
                    "title": title,
                    "url": url,
                    "source": "windsmeet.wiki",
                    "source_key": "windsmeet-wiki",
                    "source_url": base,
                    "kind": singular,
                    "content": f"{title}. Loại dữ liệu: {singular}.",
                    "aliases": [],
                    "region": "",
                    "regions": [],
                    "topics": [plural],
                    "links": [],
                    "released_global": None,
                    "updated_at": _now(),
                }
            )

    regions_html = await _get(client, f"{base}/db/regions")
    regions_soup = BeautifulSoup(regions_html, "lxml")
    for anchor in regions_soup.select("a.region-object[href]"):
        title_node = anchor.select_one("h2")
        if not title_node:
            continue
        title = title_node.get_text(" ", strip=True)
        url = urljoin(base, str(anchor.get("href")))
        documents.append(
            {
                "id": _identifier("windsmeet-wiki", f"region:{title}"),
                "title": title,
                "url": url,
                "source": "windsmeet.wiki",
                "source_key": "windsmeet-wiki",
                "source_url": base,
                "kind": "region",
                "content": f"{title}. Khu vực trên bản đồ Where Winds Meet.",
                "aliases": [],
                "region": title,
                "regions": [title],
                "topics": ["regions"],
                "links": [],
                "released_global": None,
                "updated_at": _now(),
            }
        )
        by_kind["region"].append(url)

    for cosmetic_group in ("hair", "model"):
        listing_url = f"{base}/db/cosmetics/{cosmetic_group}"
        first_html = await _get(client, listing_url)
        first_soup = BeautifulSoup(first_html, "lxml")
        page_numbers = [1]
        for anchor in first_soup.select(".collection-pagination a[href]"):
            match = re.search(r"[?&]page=(\d+)", str(anchor.get("href")))
            if match:
                page_numbers.append(int(match.group(1)))
        remaining = await asyncio.gather(
            *(fetch_sitemap(f"{listing_url}?page={page}") for page in range(2, max(page_numbers) + 1))
        )
        for html in [first_html, *remaining]:
            soup = BeautifulSoup(html, "lxml")
            for anchor in soup.select("a.colour-card-link[href^='/db/cosmetic/']"):
                url = urljoin(base, str(anchor.get("href")))
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                label = anchor.select_one("strong")
                slug = unquote(urlparse(url).path).rstrip("/").rsplit("/", 1)[-1]
                title = label.get_text(" ", strip=True) if label else slug.replace("_", " ").strip().title()
                documents.append(
                    {
                        "id": _identifier("windsmeet-wiki", url),
                        "title": title,
                        "url": url,
                        "source": "windsmeet.wiki",
                        "source_key": "windsmeet-wiki",
                        "source_url": base,
                        "kind": "cosmetic",
                        "content": f"{title}. Nhóm cosmetic: {cosmetic_group}. Mã tài nguyên: {slug}.",
                        "aliases": [slug],
                        "region": "",
                        "regions": [],
                        "topics": ["cosmetics", cosmetic_group],
                        "links": [],
                        "released_global": None,
                        "updated_at": _now(),
                    }
                )
                by_kind["cosmetic"].append(url)

    for kind, urls in by_kind.items():
        print(f"windsmeet.wiki {kind}: {len(urls)} sitemap entries", flush=True)

    detail_urls: list[str] = []
    per_kind = max(1, detail_limit // len(by_kind)) if detail_limit else 0
    for kind, urls in by_kind.items():
        if kind == "region":
            continue
        detail_urls.extend(sorted(urls, key=len)[:per_kind])
    detail_urls = detail_urls[:detail_limit]

    async def fetch_detail(url: str) -> tuple[str, str, list[str]] | None:
        async with semaphore:
            try:
                html = await _get(client, url)
            except httpx.HTTPError:
                return None
        soup = BeautifulSoup(html, "lxml")
        links = [urljoin(url, str(anchor.get("href"))).split("#", 1)[0] for anchor in soup.select("a[href]")]
        aliases = [anchor.get_text(" ", strip=True) for anchor in soup.select(".database-language-links a") if anchor.get_text(" ", strip=True) != "English"]
        return url, _text(soup), aliases

    details = await asyncio.gather(*(fetch_detail(url) for url in detail_urls))
    detail_map = {
        result[0]: (result[1], result[2])
        for result in details
        if result is not None
    }
    for document in documents:
        if document["url"] in detail_map:
            content, aliases = detail_map[document["url"]]
            document["content"] = content
            document["aliases"] = aliases
    print(f"windsmeet.wiki: {len(documents)} entries, {len(detail_map)} detailed pages", flush=True)
    return documents


async def collect_all(detail_limit: int) -> list[dict]:
    timeout = httpx.Timeout(45.0, connect=12.0)
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en,vi;q=0.8"}
    async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=True) as client:
        compendium, guide, wiki = await asyncio.gather(
            collect_compendium(client),
            collect_guide(client),
            collect_wiki(client, detail_limit=detail_limit),
        )
    return normalize_documents([*compendium, *guide, *wiki])


def write_jsonl(path: Path, documents: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for document in documents:
            handle.write(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync public Where Winds Meet sources into the isolated Neo4j KB")
    parser.add_argument("--output", type=Path, default=Path("data/kb/knowledge.jsonl"))
    parser.add_argument("--wiki-detail-limit", type=int, default=180)
    parser.add_argument("--collect-only", action="store_true")
    parser.add_argument("--load-only", action="store_true")
    args = parser.parse_args()

    if args.collect_only and args.load_only:
        parser.error("--collect-only and --load-only are mutually exclusive")

    if args.load_only:
        documents = read_jsonl(args.output)
    else:
        documents = asyncio.run(collect_all(max(0, args.wiki_detail_limit)))
        write_jsonl(args.output, documents)
        print(f"Collected {len(documents)} documents into {args.output}")

    if not args.collect_only:
        graph = GraphStore(get_settings())
        try:
            count = graph.replace_all(documents)
            print(f"Loaded {count} documents into Neo4j")
        finally:
            graph.close()


if __name__ == "__main__":
    main()
