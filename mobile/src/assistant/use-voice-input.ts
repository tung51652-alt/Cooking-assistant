import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { voiceDurationMs, voiceFileLimit } from '../../../packages/cooklens-api';
import type { NativeUploadPart } from '../../../packages/cooklens-api';

type Capture = { abort: AbortController; recording: boolean; timer?: ReturnType<typeof setTimeout> };
type Stage = 'idle' | 'opening' | 'recording' | 'transcribing';
type Transcribe = (body: FormData, signal: AbortSignal) => Promise<string>;

function removeClip(uri: string | null) {
  if (!uri) return;
  try { const file = new File(uri); if (file.exists) file.delete(); }
  catch { /* The operating system can also clean its recording cache. */ }
}

export function useVoiceInput({ disabled, context, transcribe, onText }: {
  disabled: boolean; context?: string; transcribe: Transcribe; onText: (text: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const active = useRef<Capture | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const stopping = useRef(false);
  const opening = useRef(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [notice, setNotice] = useState('');

  async function stopRecorder() {
    stopping.current = true;
    try { await recorder.stop(); return recorder.uri; }
    finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      stopping.current = false;
    }
  }

  function discard() {
    const current = active.current;
    active.current = null;
    if (!current) return;
    current.abort.abort();
    clearTimeout(current.timer);
    if (current.recording) void stopRecorder().then(removeClip, () => {});
  }

  function cancel() { discard(); setStage('idle'); }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background' || (state === 'inactive' && active.current?.recording)) cancel();
    });
    return () => { subscription.remove(); discard(); };
  }, [recorder]);
  useEffect(() => { if (active.current) cancel(); }, [context]);
  useEffect(() => { if (disabled && active.current) cancel(); }, [disabled]);

  async function finish(current: Capture, captureContext: string | undefined) {
    if (active.current !== current || !current.recording) return;
    current.recording = false;
    clearTimeout(current.timer);
    setStage('transcribing');
    let uri: string | null = null;
    try {
      uri = await stopRecorder();
      if (active.current !== current) return;
      if (!uri) throw Error('Chưa thu được âm thanh. Hãy thử lại.');
      const file = new File(uri);
      if (!file.size || file.size > voiceFileLimit) throw Error('Bản ghi trống hoặc quá lớn. Hãy thử nói ngắn hơn.');
      const part: NativeUploadPart = { uri, type: 'audio/mp4', name: 'cau-hoi.m4a' };
      const body = new FormData();
      body.append('file', part as unknown as Blob);
      const text = await transcribe(body, current.abort.signal);
      if (active.current === current && captureContext === contextRef.current) {
        onText(text);
        setNotice('Bạn có thể sửa chữ vừa nhận trước khi gửi.');
      }
    } catch (error) {
      if (active.current === current) setNotice(error instanceof Error ? error.message : 'Chưa chuyển được giọng nói thành chữ.');
    } finally {
      removeClip(uri);
      if (active.current === current) cancel();
    }
  }

  async function toggle() {
    if (disabled || stopping.current || (opening.current && !active.current)) return;
    if (active.current) {
      if (active.current.recording) void finish(active.current, context);
      else { cancel(); setNotice(''); }
      return;
    }
    const current: Capture = { abort: new AbortController(), recording: false };
    active.current = current;
    opening.current = true;
    setNotice(''); setStage('opening');
    let configured = false;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (active.current !== current) return;
      if (!permission.granted) throw Error('Hãy cấp quyền mic trong Cài đặt hoặc gõ câu hỏi.');
      await setAudioModeAsync({ allowsRecording: true });
      configured = true;
      if (active.current !== current) return;
      await recorder.prepareToRecordAsync();
      if (active.current !== current) { await stopRecorder().then(removeClip, () => {}); return; }
      recorder.record();
      current.recording = true;
      current.timer = setTimeout(() => void finish(current, context), voiceDurationMs);
      setStage('recording');
    } catch (error) {
      if (active.current === current) {
        setNotice(error instanceof Error ? error.message : 'Không mở được mic. Bạn vẫn có thể gõ câu hỏi.');
        cancel();
      }
    } finally {
      if (configured && !current.recording && !active.current) await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      opening.current = false;
    }
  }

  const label = stage === 'recording' ? 'Dừng ghi âm' : stage === 'idle' ? 'Nhập bằng giọng nói' : 'Hủy nhập giọng nói';
  const feedback = stage === 'recording' ? 'Đang nghe tiếng Việt…' : stage === 'opening' ? 'Đang mở mic…'
    : stage === 'transcribing' ? 'Đang chuyển thành chữ…' : notice;
  return { stage, label, feedback, toggle };
}
