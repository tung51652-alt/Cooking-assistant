"""Internal Vietnamese transcription service for short audio clips."""
from array import array
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import wave


MODEL = Path('/opt/cooklens/ggml-base-q5_1.bin')
MAX_BYTES = 512 * 1024
RATE, MAX_SECONDS = 16_000, 15
FORMATS = {
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'matroska',
    'audio/mp4': 'mov', 'audio/m4a': 'mov', 'audio/x-m4a': 'mov',
}


class AudioError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def transcribe(data, media_type):
    with TemporaryDirectory(prefix='cooklens-audio-') as directory:
        work = Path(directory)
        encoded, wav, result = work / 'recording', work / 'clip.wav', work / 'result'
        encoded.write_bytes(data)
        decoded = subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
            '-f', FORMATS[media_type], '-i', str(encoded), '-map', '0:a:0',
            '-t', str(MAX_SECONDS + 1), '-ac', '1', '-ar', str(RATE), '-f', 's16le', 'pipe:1',
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3, check=True).stdout
        if len(decoded) > 2 * RATE * MAX_SECONDS:
            raise AudioError(413, 'AUDIO_TOO_LONG')
        samples = array('h', decoded)
        if not samples or sum(value * value for value in samples) < len(samples) * 65 ** 2:
            raise AudioError(422, 'NO_SPEECH_DETECTED')
        with wave.open(str(wav), 'wb') as audio:
            audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            audio.writeframes(decoded)
        try:
            subprocess.run([
                'whisper-cli', '-m', str(MODEL), '-f', str(wav), '-l', 'vi', '-t', '2',
                '-np', '-oj', '-of', str(result),
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=True)
            transcription = json.loads(result.with_suffix('.json').read_text(encoding='utf-8'))
            text = ' '.join(segment['text'].strip() for segment in transcription['transcription']).strip()
        except (subprocess.CalledProcessError, OSError, ValueError, KeyError, TypeError) as error:
            raise AudioError(503, 'DEPENDENCY_NOT_READY') from error
        if not any(character.isalnum() for character in text) or (text.startswith('[') and text.endswith(']')):
            raise AudioError(422, 'NO_SPEECH_DETECTED')
        # The public message limit is measured in UTF-16 code units.
        return text.encode('utf-16-le')[:4000].decode('utf-16-le', errors='ignore').strip()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(3)

    def log_message(self, format, *args):
        pass

    def response(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != '/health':
            self.response(404, {'code': 'NOT_FOUND'})
            return
        if MODEL.is_file():
            self.response(200, {'status': 'ready'})
        else:
            self.response(503, {'code': 'DEPENDENCY_NOT_READY'})

    def do_POST(self):
        if self.path != '/transcribe':
            self.response(404, {'code': 'NOT_FOUND'})
            return
        media_type = self.headers.get_content_type()
        try:
            if not MODEL.is_file():
                raise AudioError(503, 'DEPENDENCY_NOT_READY')
            if media_type not in FORMATS:
                raise AudioError(415, 'UNSUPPORTED_MEDIA_TYPE')
            length = int(self.headers.get('Content-Length', '0'))
            if length > MAX_BYTES:
                raise AudioError(413, 'UPLOAD_TOO_LARGE')
            if length <= 0:
                raise AudioError(400, 'INVALID_AUDIO')
            data = self.rfile.read(length)
            if len(data) != length:
                raise AudioError(400, 'INVALID_AUDIO')
            text = transcribe(data, media_type)
        except AudioError as error:
            self.response(error.status, {'code': error.code})
        except (subprocess.TimeoutExpired, TimeoutError):
            self.response(504, {'code': 'DEPENDENCY_TIMEOUT'})
        except (subprocess.CalledProcessError, ValueError):
            self.response(400, {'code': 'INVALID_AUDIO'})
        except OSError:
            self.response(503, {'code': 'DEPENDENCY_NOT_READY'})
        else:
            self.response(200, {'text': text})


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8002), Handler).serve_forever()
