"""Internal vision API: uvicorn ai.cv.inference.main:app, one worker/process."""

from contextlib import asynccontextmanager
import logging
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .errors import VisionError
from .guard import RequestGuard, Runtime
from .images import decode_upload
from .inference import predict_image
from .model import load_model
from .schemas import PredictionResponse

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    runtime = Runtime()

    @asynccontextmanager
    async def lifespan(application):
        try:
            runtime.model = load_model()
        except Exception:
            logger.error('Vision startup failed; check model and taxonomy artifacts')
            raise RuntimeError('Vision startup failed: invalid model or taxonomy artifact') from None
        try:
            yield
        finally:
            runtime.model = None

    application = FastAPI(title='CookLens Vision API', version='1.0.0', lifespan=lifespan)
    application.state.runtime = runtime
    application.add_middleware(RequestGuard, runtime=runtime)

    def error_response(request, status, code, message):
        request_id = getattr(request.state, 'request_id', str(uuid4()))
        return JSONResponse({'code': code, 'message': message, 'request_id': request_id}, status_code=status,
                            headers={'X-Request-ID': request_id})

    @application.exception_handler(VisionError)
    async def vision_error(request: Request, error: VisionError):
        return error_response(request, error.status, error.code, error.message)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error):
        return error_response(request, 422, 'VALIDATION_ERROR', 'Cần đúng một trường file ảnh hợp lệ.')

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, error):
        code = 'INVALID_IMAGE' if error.status_code == 400 else 'VALIDATION_ERROR'
        return error_response(request, error.status_code, code, 'Yêu cầu không hợp lệ.')

    @application.exception_handler(Exception)
    async def internal_error(request: Request, error):
        logger.error('Unexpected vision request failure')
        return error_response(request, 500, 'INTERNAL_ERROR', 'Không xử lý được ảnh. Vui lòng thử lại.')

    @application.get('/')
    def root():
        return {'service': 'CookLens vision', 'docs': '/docs'}

    @application.get('/health/live')
    def live():
        return {'status': 'alive'}

    @application.get('/health/ready')
    @application.get('/health', deprecated=True, include_in_schema=False)
    def ready():
        if runtime.model is None:
            return JSONResponse({'status': 'not_ready', 'code': 'DEPENDENCY_NOT_READY'}, status_code=503)
        return {'status': 'ready', 'model_version': runtime.model.model_version,
                'taxonomy_version': runtime.model.taxonomy_version}

    async def validate_upload_form(request: Request):
        form = await request.form()
        if len(form.multi_items()) != 1 or form.multi_items()[0][0] != 'file':
            raise VisionError(422, 'VALIDATION_ERROR', 'Cần đúng một trường file ảnh hợp lệ.')

    @application.post('/predict', response_model=PredictionResponse, dependencies=[Depends(validate_upload_form)])
    def predict(request: Request, file: UploadFile = File(...)):
        # Middleware holds the single work slot until the complete response is sent.
        image = decode_upload(file)
        try:
            predictions = predict_image(image, runtime.model)
            return {'model_version': runtime.model.model_version,
                    'taxonomy_version': runtime.model.taxonomy_version, 'predictions': predictions}
        except Exception:
            logger.error('Vision inference failed')
            raise VisionError(500, 'INTERNAL_ERROR', 'Không xử lý được ảnh. Vui lòng thử lại.') from None
        finally:
            image.close()

    return application


app = create_app()
