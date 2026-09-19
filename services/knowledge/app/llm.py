import re

import httpx

from .config import Settings
from .models import RetrievedDocument


SYSTEM_PROMPT = """Bạn là trợ lý giải đố Where Winds Meet bằng tiếng Việt.
Quy tắc bắt buộc:
1. Chỉ dùng dữ kiện có trong NGỮ CẢNH. Không dùng trí nhớ riêng và không suy đoán chi tiết còn thiếu.
2. Gắn mã nguồn [S1], [S2] ngay sau câu chứa dữ kiện. Không dùng mã nguồn không tồn tại.
3. Nếu ngữ cảnh không đủ, nói rõ chưa tìm thấy thông tin đủ chắc chắn và hỏi người dùng thêm tên nhiệm vụ, khu vực hoặc trạng thái bị kẹt.
4. Phân biệt tên Global, CN/HMT và tên phiên âm. Không khẳng định chúng giống nhau nếu nguồn không nói vậy.
5. Trả lời ngắn, ưu tiên từng bước có thể làm ngay. Cảnh báo khi một bước phụ thuộc phiên bản, thời gian, thời tiết hoặc trạng thái nhiệm vụ.
6. Không dùng dấu em dash hoặc en dash. Dùng dấu gạch nối thường hoặc dấu chấm.
"""


def _context(documents: list[RetrievedDocument]) -> str:
    blocks: list[str] = []
    for index, document in enumerate(documents, start=1):
        aliases = ", ".join(document.aliases[:10]) or "không có"
        blocks.append(
            f"[S{index}]\n"
            f"Tiêu đề: {document.title}\n"
            f"Nguồn: {document.source}\n"
            f"Loại: {document.kind}\n"
            f"Khu vực: {document.region or 'không nêu'}\n"
            f"Tên khác: {aliases}\n"
            f"Nội dung:\n{document.content[:3500]}"
        )
    return "\n\n".join(blocks)


def _fallback(documents: list[RetrievedDocument]) -> str:
    if not documents:
        return (
            "Mình chưa tìm thấy thông tin đủ chắc chắn trong kho tri thức. "
            "Bạn hãy gửi tên nhiệm vụ, khu vực, NPC hoặc mô tả bước đang bị kẹt."
        )
    lines = ["Mình chưa thể tổng hợp câu trả lời đã kiểm chứng. Các nguồn gần nhất là:"]
    for index, document in enumerate(documents[:3], start=1):
        excerpt = re.sub(r"\s+", " ", document.content).strip()[:220]
        lines.append(f"- {document.title}: {excerpt} [S{index}]")
    return "\n".join(lines)


def _citations_are_valid(answer: str, document_count: int) -> bool:
    citations = [int(value) for value in re.findall(r"\[S(\d+)]", answer)]
    if not citations:
        return "chưa tìm thấy" in answer.casefold() or "không đủ" in answer.casefold()
    return all(1 <= citation <= document_count for citation in citations)


def cited_documents(answer: str, documents: list[RetrievedDocument]) -> list[RetrievedDocument]:
    selected: list[RetrievedDocument] = []
    seen: set[int] = set()
    for value in re.findall(r"\[S(\d+)]", answer):
        index = int(value) - 1
        if index < 0 or index >= len(documents) or index in seen:
            continue
        seen.add(index)
        selected.append(documents[index])
    return selected


async def answer_question(settings: Settings, question: str, documents: list[RetrievedDocument]) -> str:
    if not documents:
        return _fallback(documents)

    if settings.openai_api_key:
        api_key = settings.openai_api_key
        base_url = settings.openai_base_url
        model = settings.openai_model
        provider_headers: dict[str, str] = {}
    else:
        api_key = settings.openrouter_api_key
        base_url = settings.openrouter_base_url
        model = settings.openrouter_model
        provider_headers = {
            "HTTP-Referer": "https://map.protexa.cloud",
            "X-Title": "Where Winds Meet Companion",
        }

    if not api_key:
        return _fallback(documents)

    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 850,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"CÂU HỎI:\n{question}\n\nNGỮ CẢNH:\n{_context(documents)}",
            },
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=settings.openrouter_timeout) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    **provider_headers,
                },
                json=payload,
            )
            response.raise_for_status()
            answer = str(response.json()["choices"][0]["message"]["content"]).strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return _fallback(documents)

    if not answer or not _citations_are_valid(answer, len(documents)):
        return _fallback(documents)
    return answer.replace("—", "-").replace("–", "-")
