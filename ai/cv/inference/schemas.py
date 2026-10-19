"""Internal vision DTO; public API envelope belongs to the Spring gateway."""

from pydantic import BaseModel, Field


class Prediction(BaseModel):
    rank: int = Field(ge=1, le=3)
    class_id: int = Field(ge=0, le=29)
    normalized_dish: str
    display_name: str
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class PredictionResponse(BaseModel):
    model_version: str
    taxonomy_version: str
    predictions: list[Prediction] = Field(min_length=3, max_length=3)
