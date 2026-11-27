import { useEffect, useRef, useState } from 'react';
import { Microphone, Stop, X } from '@phosphor-icons/react';
import { voiceDurationMs, voiceFileLimit } from '../../../packages/cooklens-api';
import { transcribe } from '../lib/api';

type Capture = {
  abort: AbortController;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setTimeout>;
};

const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
type Stage = 'idle' | 'opening' | 'recording' | 'transcribing';

function release(capture: Capture) {
  capture.abort.abort();
  clearTimeout(capture.timer);
  if (capture.recorder && capture.recorder.state !== 'inactive') capture.recorder.stop();
  capture.stream?.getTracks().forEach(track => track.stop());
}

export default function VoiceInput({ disabled, onText, onBusy }: {
  disabled: boolean;
  onText: (text: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const active = useRef<Capture | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [notice, setNotice] = useState('');

  function cancel() {
    const capture = active.current;
    active.current = null;
    if (capture) release(capture);
    setStage('idle');
    onBusy(false);
  }

  useEffect(() => {
    const suspend = () => { if (document.hidden && active.current) cancel(); };
    const close = () => { if (active.current) cancel(); };
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pagehide', close);
    return () => {
      document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('pagehide', close);
      const capture = active.current;
      active.current = null;
      if (capture) release(capture);
    };
  }, []);
  useEffect(() => { if (disabled && active.current) cancel(); }, [disabled]);

  async function finish(capture: Capture, chunks: Blob[], mime: string) {
    if (active.current !== capture) return;
    capture.stream?.getTracks().forEach(track => track.stop());
    clearTimeout(capture.timer);
    setStage('transcribing');
    try {
      const clip = new Blob(chunks, { type: mime.split(';')[0] });
      if (!clip.size || clip.size > voiceFileLimit) throw Error('Bản ghi trống hoặc quá lớn. Hãy thử nói ngắn hơn.');
      const body = new FormData();
      body.append('file', clip, mime.startsWith('audio/mp4') ? 'cau-hoi.m4a' : 'cau-hoi.webm');
      const text = await transcribe(body, capture.abort.signal);
      if (active.current === capture) {
        onText(text);
        setNotice('Bạn có thể sửa chữ vừa nhận trước khi gửi.');
      }
    } catch (error) {
      if (active.current === capture) setNotice(error instanceof Error ? error.message : 'Chưa chuyển được giọng nói thành chữ.');
    } finally {
      if (active.current === capture) cancel();
    }
  }

  async function toggle() {
    const capture = active.current;
    if (capture) {
      if (stage === 'recording' && capture.recorder?.state === 'recording') {
        capture.recorder.stop();
      } else {
        cancel(); setNotice('');
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Không mở được mic. Hãy dùng HTTPS hoặc mở CookLens trên localhost để thử.');
      return;
    }
    const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
    if (!mimeType) {
      setNotice('Trình duyệt chưa hỗ trợ ghi âm cho CookLens. Bạn vẫn có thể gõ câu hỏi.');
      return;
    }
    const next: Capture = { abort: new AbortController() };
    active.current = next;
    setStage('opening'); setNotice(''); onBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      next.stream = stream;
      if (active.current !== next) { release(next); return; }
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      const chunks: Blob[] = [];
      next.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { void finish(next, chunks, recorder.mimeType || mimeType); };
      recorder.onerror = () => {
        if (active.current !== next) return;
        setNotice('Mic đã dừng. Bạn có thể thử lại hoặc gõ câu hỏi.');
        cancel();
      };
      recorder.start();
      next.timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, voiceDurationMs);
      setStage('recording');
    } catch (error) {
      if (active.current !== next) return;
      setNotice(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Hãy cấp quyền mic hoặc gõ câu hỏi.' : 'Không mở được mic. Bạn có thể thử lại hoặc gõ.');
      cancel();
    }
  }

  const label = stage === 'recording' ? 'Dừng ghi âm' : stage === 'idle' ? 'Nhập bằng giọng nói' : 'Hủy nhập giọng nói';
  return <>
    <button type="button" className={`voice-button voice-${stage}`} aria-label={label} title={label}
      disabled={disabled} onClick={() => void toggle()}>
      {stage === 'recording' ? <Stop aria-hidden="true" /> : stage === 'idle' ? <Microphone aria-hidden="true" /> : <X aria-hidden="true" />}
    </button>
    {(notice || stage !== 'idle') && <p className="voice-notice" role="status">
      {stage === 'recording' ? 'Đang nghe tiếng Việt…' : stage === 'opening' ? 'Đang mở mic…'
        : stage === 'transcribing' ? 'Đang chuyển thành chữ…' : notice}
    </p>}
  </>;
}
