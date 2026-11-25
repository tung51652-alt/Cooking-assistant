"""Bound reads and inspect actual format/frames/pixels before inference."""

from io import BytesIO
import warnings

from PIL import Image, UnidentifiedImageError
from starlette.datastructures import UploadFile

from .errors import MAX_PIXELS, MAX_UPLOAD_BYTES, VisionError


def decode_upload(file: UploadFile) -> Image.Image:
    allowed = {'image/jpeg': 'JPEG', 'image/png': 'PNG'}
    content_type = (file.content_type or '').lower()
    if content_type not in allowed:
        raise VisionError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ hỗ trợ ảnh JPEG hoặc PNG.')
    contents = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise VisionError(413, 'UPLOAD_TOO_LARGE', 'Ảnh không được vượt quá 10 MiB.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(contents)) as source:
                if source.format != allowed[content_type]:
                    raise VisionError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Định dạng ảnh không khớp JPEG/PNG đã khai báo.')
                if source.width * source.height > MAX_PIXELS or getattr(source, 'n_frames', 1) != 1:
                    raise VisionError(400, 'INVALID_IMAGE', 'Ảnh phải có một khung hình và tối đa 25 triệu pixel.')
                source.verify()
            with Image.open(BytesIO(contents)) as source:
                return source.convert('RGB')
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise VisionError(400, 'INVALID_IMAGE', 'Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG hợp lệ.') from None
