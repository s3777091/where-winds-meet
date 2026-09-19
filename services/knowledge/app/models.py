from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1200)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        return " ".join(value.split())


class Source(BaseModel):
    id: str
    citation: int
    title: str
    url: str
    source: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


class RetrievedDocument(BaseModel):
    id: str
    title: str
    url: str
    source: str
    kind: str
    content: str
    aliases: list[str] = Field(default_factory=list)
    region: str = ""
    score: float = 0
