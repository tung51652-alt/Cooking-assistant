"""CookLens internal recipe API. The public /api envelope belongs to the gateway."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import re
import threading
import unicodedata
from uuid import UUID, uuid4

import anyio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import httpx
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr, field_validator
from starlette.exceptions import HTTPException

from ai.rag.embeddings.local import Encoder
from ai.rag.ingestion.bundle import Bundle
from ai.rag.retrieval.store import Store


class Failure(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


class Search(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed_dish: StrictStr
    top_k: StrictInt = 3
    query: StrictStr | None = None

    @field_validator("top_k")
    @classmethod
    def top_k_range(cls, value):
        if not 1 <= value <= 3:
            raise ValueError("top_k range")
        return value

    @field_validator("query")
    @classmethod
    def query_length(cls, value):
        if value is None:
            return None
        value = unicodedata.normalize("NFC", value.strip())
        if len(value) > 200:
            raise ValueError("query length")
        return value or None


def create_app(bundle=None, encoder=None, store=None):
    @asynccontextmanager
    async def lifespan(app):
        nonlocal bundle, encoder, store
        bundle = bundle or Bundle(Path(os.getenv("RECIPES_BUNDLE_DIR", "/opt/cooklens/recipes")))
        encoder = encoder or Encoder(Path(os.getenv("EMBEDDING_MODEL_DIR", "/opt/cooklens/models/multilingual-e5-small")))
        store = store or Store(os.getenv("QDRANT_URL", "http://qdrant:6333"), bundle)
        try:
            # If Qdrant is reachable, refuse corrupt preexisting versions at startup.
            store.validate_collection(points=True)
        except httpx.HTTPError:
            pass  # Process is live; readiness/search remain unavailable until init succeeds.
        yield
        store.close()

    app = FastAPI(title="CookLens Recipes", version="1.0.0", lifespan=lifespan)
    slots = threading.BoundedSemaphore(4)

    @app.middleware("http")
    async def request_id(request, call_next):
        try:
            identifier = str(UUID(request.headers.get("X-Request-ID", "")))
        except (ValueError, AttributeError):
            identifier = str(uuid4())
        request.state.request_id = identifier
        try:
            response = await call_next(request)
        except Exception:
            logging.getLogger("cooklens.recipes").error("request_failed request_id=%s", identifier)
            response = error(request, 500, "INTERNAL_ERROR", "Không xử lý được yêu cầu.")
        response.headers["X-Request-ID"] = identifier
        return response

    def error(request, status, code, message):
        return JSONResponse(status_code=status, content={"code": code, "message": message,
                                                       "request_id": request.state.request_id})

    @app.exception_handler(Failure)
    async def failure_handler(request, exc):
        return error(request, exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        return error(request, 422, "VALIDATION_ERROR", "Dữ liệu yêu cầu không hợp lệ.")

    @app.exception_handler(HTTPException)
    async def http_handler(request, exc):
        return error(request, exc.status_code, "VALIDATION_ERROR", "Yêu cầu không hợp lệ.")

    def ensure_ready():
        try:
            store.ready()
        except httpx.TimeoutException:
            raise Failure(504, "DEPENDENCY_TIMEOUT", "Dịch vụ công thức phản hồi quá chậm.") from None
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise Failure(503, "DEPENDENCY_NOT_READY", "Dữ liệu công thức chưa sẵn sàng.") from None

    @app.get("/health/live")
    def live():
        return {"status": "live"}

    @app.get("/health/ready")
    async def ready():
        try:
            async with asyncio.timeout(2):
                await store.ready_async()
        except (TimeoutError, httpx.HTTPError, ValueError, KeyError, TypeError):
            return JSONResponse(status_code=503, content={"status": "not_ready", "code": "DEPENDENCY_NOT_READY"})
        return {"status": "ready", **bundle.versions}

    @app.get("/dishes")
    def dishes():
        return {"taxonomy_version": "1.0.0", "dishes": [
            {k: d[k] for k in ("class_id", "normalized_dish", "display_name")}
            for d in sorted(bundle.dishes.values(), key=lambda d: d["class_id"])]}

    def perform_search(search):
        ensure_ready()
        dish = bundle.dishes[search.confirmed_dish]
        vector = encoder.encode([search.query or dish["display_name"]], query=True)[0]
        try:
            ranked = store.search(search.confirmed_dish, vector, search.top_k)
        except httpx.TimeoutException:
            raise Failure(504, "DEPENDENCY_TIMEOUT", "Dịch vụ công thức phản hồi quá chậm.") from None
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise Failure(503, "DEPENDENCY_NOT_READY", "Dữ liệu công thức chưa sẵn sàng.") from None
        recipes = []
        for rank, (recipe, score) in enumerate(ranked, 1):
            preview = " ".join(step["text"] for step in recipe["instructions"])[:240]
            recipes.append({**{k: recipe[k] for k in ("id", "title", "normalized_dish", "language", "cuisine", "servings",
                                                     "prep_time_minutes", "cook_time_minutes", "source")},
                            "preview": preview, "rank": rank, "retrieval_score": score})
        return {**bundle.versions, "confirmed_dish": search.confirmed_dish, "recipes": recipes}

    @app.post("/search", openapi_extra={"requestBody": {"required": True, "content": {
        "application/json": {"schema": Search.model_json_schema()}}}})
    async def search(request: Request):
        if not slots.acquire(blocking=False):
            raise Failure(503, "SERVICE_BUSY", "Dịch vụ đang bận, vui lòng thử lại.")
        try:
            if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                raise Failure(415, "UNSUPPORTED_MEDIA_TYPE", "Yêu cầu cần có định dạng JSON.")
            body = bytearray()
            try:
                async with asyncio.timeout(5):
                    async for chunk in request.stream():
                        if len(body) + len(chunk) > 8192:
                            raise Failure(413, "UPLOAD_TOO_LARGE", "Yêu cầu vượt quá giới hạn.")
                        body.extend(chunk)
            except TimeoutError:
                raise Failure(504, "DEPENDENCY_TIMEOUT", "Hết thời gian nhận yêu cầu.") from None
            try:
                value = Search.model_validate(json.loads(body.decode("utf-8")))
            except (ValueError, TypeError, UnicodeError):
                raise Failure(422, "VALIDATION_ERROR", "Dữ liệu yêu cầu không hợp lệ.") from None
            if value.confirmed_dish not in bundle.dishes:
                raise Failure(422, "INVALID_DISH", "Món ăn không thuộc danh mục hỗ trợ.")
            return await anyio.to_thread.run_sync(perform_search, value)
        finally:
            slots.release()

    @app.get("/recipes/{recipe_id}")
    async def detail(recipe_id: str):
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", recipe_id):
            raise Failure(422, "VALIDATION_ERROR", "Mã công thức không hợp lệ.")
        if not slots.acquire(blocking=False):
            raise Failure(503, "SERVICE_BUSY", "Dịch vụ đang bận, vui lòng thử lại.")
        try:
            await anyio.to_thread.run_sync(ensure_ready)
            if recipe_id not in bundle.by_id:
                raise Failure(404, "RECIPE_NOT_FOUND", "Không tìm thấy công thức.")
            return {"corpus_version": bundle.versions["corpus_version"], "recipe": bundle.by_id[recipe_id]}
        finally:
            slots.release()

    return app


app = create_app()
