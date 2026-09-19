from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from .auth import AuthenticatedUser, require_user
from .config import get_settings
from .graph import GraphStore
from .llm import answer_question, cited_documents
from .models import ChatRequest, ChatResponse, Source


settings = get_settings()
graph = GraphStore(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        graph.verify()
        graph.bootstrap()
    except Exception:
        # Health and chat return explicit failures while Neo4j starts.
        pass
    yield
    graph.close()


app = FastAPI(title="Where Winds Meet Knowledge API", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    try:
        graph.verify()
        return {"status": "ok", "documents": graph.count()}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Neo4j chưa sẵn sàng.") from exc


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, _: AuthenticatedUser = Depends(require_user)) -> ChatResponse:
    try:
        documents = graph.retrieve(payload.question, limit=settings.retrieval_limit)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Kho tri thức chưa sẵn sàng.") from exc

    answer = await answer_question(settings, payload.question, documents)
    cited = cited_documents(answer, documents)
    cited_ids = {document.id for document in cited}
    sources = [
        Source(
            id=document.id,
            citation=index,
            title=document.title,
            url=document.url,
            source=document.source,
        )
        for index, document in enumerate(documents, start=1)
        if document.id in cited_ids
    ]
    return ChatResponse(answer=answer, sources=sources)
