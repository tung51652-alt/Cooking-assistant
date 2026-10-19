"""Safe internal errors and image input limits."""

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 11 * 1024 * 1024
MAX_PIXELS = 25_000_000


class VisionError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)
