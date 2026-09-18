from app.graph import _lucene_query, normalize_documents
from app.llm import _citations_are_valid


def test_lucene_query_removes_punctuation_and_stop_words():
    query = _lucene_query("Cách giải Blind to the World: chuông thế nào?")
    assert '"blind"' in query
    assert '"world"' in query
    assert '"chuông"' in query
    assert "thế" not in query


def test_citations_must_reference_supplied_context():
    assert _citations_are_valid("Làm theo thứ tự này. [S1]", 2)
    assert not _citations_are_valid("Nguồn không tồn tại. [S3]", 2)
    assert not _citations_are_valid("Không có trích nguồn.", 2)


def test_normalization_deduplicates_and_compacts_content():
    documents = normalize_documents(
        [
            {
                "id": "one",
                "title": "  Blind   to the World ",
                "content": "Step one.\n\n Step two.",
                "aliases": [" 紅塵無眼 "],
                "region": " Qinghe ",
                "regions": [],
                "topics": ["quest", "quest"],
                "links": [],
            },
            {"id": "one", "title": "duplicate", "content": "ignored"},
        ]
    )
    assert len(documents) == 1
    assert documents[0]["title"] == "Blind to the World"
    assert documents[0]["content"] == "Step one.\nStep two."
    assert documents[0]["regions"] == ["Qinghe"]
