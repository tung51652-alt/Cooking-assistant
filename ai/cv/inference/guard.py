"""Bound concurrent work and multipart bytes before Starlette parses uploads."""

import asyncio
from dataclasses import dataclass, field
from threading import BoundedSemaphore
from uuid import UUID, uuid4

from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from .errors import MAX_REQUEST_BYTES
from .model import LoadedModel


@dataclass
class Runtime:
    model: LoadedModel | None = None
    slot: BoundedSemaphore = field(default_factory=lambda: BoundedSemaphore(1))


class RequestGuard:
    def __init__(self, app, runtime: Runtime):
        self.app, self.runtime = app, runtime

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        raw_id = headers.get('x-request-id', '')
        try:
            request_id = str(UUID(raw_id)) if len(raw_id) == 36 else str(uuid4())
        except ValueError:
            request_id = str(uuid4())
        scope.setdefault('state', {})['request_id'] = request_id

        async def tagged_send(message):
            if message['type'] == 'http.response.start':
                message = dict(message)
                message['headers'] = [(k, v) for k, v in message.get('headers', []) if k.lower() != b'x-request-id']
                message['headers'].append((b'x-request-id', request_id.encode('ascii')))
            await send(message)

        async def reject(status, code, message):
            response = JSONResponse({'code': code, 'message': message, 'request_id': request_id}, status_code=status)
            await response(scope, receive, tagged_send)

        if scope['path'] != '/predict' or scope['method'] != 'POST':
            return await self.app(scope, receive, tagged_send)
        if self.runtime.model is None:
            return await reject(503, 'DEPENDENCY_NOT_READY', 'Model chưa sẵn sàng.')
        if not self.runtime.slot.acquire(blocking=False):
            return await reject(503, 'SERVICE_BUSY', 'Dịch vụ đang xử lý ảnh khác. Vui lòng thử lại.')
        try:
            if headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'multipart/form-data':
                return await reject(415, 'UNSUPPORTED_MEDIA_TYPE', 'Yêu cầu phải là multipart/form-data.')
            length = headers.get('content-length')
            if length is not None:
                try:
                    declared = int(length)
                    if declared < 0:
                        raise ValueError
                except ValueError:
                    return await reject(400, 'INVALID_IMAGE', 'Kích thước request không hợp lệ.')
                if declared > MAX_REQUEST_BYTES:
                    return await reject(413, 'UPLOAD_TOO_LARGE', 'Request ảnh vượt giới hạn cho phép.')
            body = bytearray()
            try:
                async with asyncio.timeout(15):
                    while True:
                        message = await receive()
                        if message['type'] == 'http.disconnect':
                            return
                        block = message.get('body', b'')
                        if len(body) + len(block) > MAX_REQUEST_BYTES:
                            return await reject(413, 'UPLOAD_TOO_LARGE', 'Request ảnh vượt giới hạn cho phép.')
                        body.extend(block)
                        if not message.get('more_body', False):
                            break
            except TimeoutError:
                return await reject(504, 'DEPENDENCY_TIMEOUT', 'Quá thời gian nhận ảnh. Vui lòng thử lại.')
            delivered = False

            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()

            await self.app(scope, buffered_receive, tagged_send)
        finally:
            self.runtime.slot.release()
