"""Run from the repository root: uvicorn ai.cv.inference.main:app."""

from contextlib import asynccontextmanager
from io import BytesIO
import logging
import warnings

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from .inference import predict_image
from .model import load_model


logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Runs once per server process, before any requests are accepted.
    application.state.model = load_model()
    try:
        yield
    finally:
        application.state.model = None


app = FastAPI(title="Food Classification API", lifespan=lifespan)
app.state.model = None


class Prediction(BaseModel):
    label: str
    class_id: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)


@app.get("/")
def root():
    return {"message": "Food Classification API is running"}


@app.get("/health")
def health(request: Request):
    if request.app.state.model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    return {"status": "ok", "model_loaded": True}


@app.post("/predict", response_model=Prediction)
def predict(request: Request, file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.lower().startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    model = request.app.state.model
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    contents = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image must not exceed 10 MiB")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(contents)) as source:
                source.verify()
            with Image.open(BytesIO(contents)) as source:
                image = source.convert("RGB")
    except (
        UnidentifiedImageError, OSError, ValueError, SyntaxError,
        Image.DecompressionBombError, Image.DecompressionBombWarning,
    ) as error:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image") from error

    try:
        return predict_image(image, model)
    except Exception as error:
        logger.exception("Food classification inference failed")
        raise HTTPException(status_code=500, detail="Model inference failed") from error
    finally:
        image.close()
