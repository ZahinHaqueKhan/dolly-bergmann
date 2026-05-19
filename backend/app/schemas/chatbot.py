from pydantic import BaseModel, Field


class ChatbotMessage(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str | None = None


class ChatbotResponse(BaseModel):
    answer: str
    sources: list[str] = Field(default_factory=list)
