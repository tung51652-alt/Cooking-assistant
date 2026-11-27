import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Key } from '@phosphor-icons/react';
import type { AssistantAction, AssistantSession, CreateSession, LlmUserConfig, RecipeDocument, SessionActionRequest, SessionMessageRequest } from '../types';
import * as api from '../lib/api';
import { RecipeContent } from './RecipeContent';

const STORAGE = 'cooklens.assistant.session';
const RESEND_CODES = new Set(['ASSISTANT_PROVIDER_UNAVAILABLE', 'ASSISTANT_PROVIDER_TIMEOUT', 'ASSISTANT_RATE_LIMITED']);
const labels = { start: 'Bắt đầu nấu', previous: 'Bước trước', next: 'Bước tiếp', finish: 'Kết thúc nấu' };
type Pending = { kind: 'create'; body: CreateSession } | { kind: 'action'; id: string; body: SessionActionRequest } | { kind: 'message'; id: string; body: SessionMessageRequest };
type Saved = { id: string; recipeId: string };
const CONFIG_ERROR_CODES = new Set([
  'ASSISTANT_NOT_CONFIGURED',
  'ASSISTANT_PROVIDER_AUTH_FAILED',
  'ASSISTANT_MODEL_INVALID',
  'ASSISTANT_PROVIDER_UNSUPPORTED',
  'VALIDATION_ERROR',
]);

export default function AssistantPage({ document, llmConfig, onOpenLlmSettings, onRecipes }: {
  document: RecipeDocument | null;
  llmConfig: LlmUserConfig | null;
  onOpenLlmSettings: (mode?: 'default' | 'custom') => void;
  onRecipes: () => void;
}) {
  const [session, setSession] = useState<AssistantSession | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorTarget, setErrorTarget] = useState<'session' | 'message' | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [retry, setRetry] = useState<Pending | null>(null);
  const [draft, setDraft] = useState('');
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const creation = useRef(crypto.randomUUID());
  const input = useRef<HTMLTextAreaElement>(null);
  const focusReply = useRef(false);
  const log = useRef<HTMLDivElement>(null);

  function saved(): Saved | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (value && typeof value === 'object' && 'id' in value && 'recipeId' in value
        && typeof value.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
        && typeof value.recipeId === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.recipeId)) return { id: value.id, recipeId: value.recipeId };
    } catch { setStorageWarning(true); }
    return null;
  }
  function accept(value: AssistantSession) {
    if (sessionRef.current?.id === value.id && value.version < sessionRef.current.version) return;
    sessionRef.current = value; setSession(value); setUnavailable(false);
    try { localStorage.setItem(STORAGE, JSON.stringify({ id: value.id, recipeId: value.recipe.id })); }
    catch { setStorageWarning(true); }
  }
  async function run(work: (signal: AbortSignal) => Promise<AssistantSession | null>, operation?: Pending) {
    if (active.current) return null;
    const controller = new AbortController(), ticket = generation.current;
    active.current = controller; setBusy(true); setError(null); setErrorCode(null); setErrorTarget(null); if (operation) setRetry(null);
    if (operation?.kind === 'message') focusReply.current = true;
    const live = () => !controller.signal.aborted && ticket === generation.current;
    try {
      const value = await work(controller.signal);
      if (live() && value) {
        accept(value);
        if (operation?.kind === 'message') setDraft(current => current.trim() === operation.body.text ? '' : current);
        return value;
      }
    } catch (failure) {
      if (!live()) return null;
      const known = failure instanceof api.ApiError ? failure : null;
      setError(known?.message || 'Chưa kết nối được trợ lý. Hãy kiểm tra phiên trước khi thử lại.');
      setErrorCode(known?.code ?? null);
      setErrorTarget(operation?.kind === 'message' ? 'message' : 'session');
      if (known?.status === 404 || known?.status === 410) setUnavailable(true);
      if (operation && (!known?.code || known.code === 'ASSISTANT_REQUEST_IN_PROGRESS')) setRetry(operation);
      if (known?.code === 'SESSION_VERSION_CONFLICT' && sessionRef.current) {
        try {
          const latest = await api.getSession(sessionRef.current.id, controller.signal, sessionRef.current.version);
          if (live()) {
            accept(latest);
            setError('Phiên đã được cập nhật. Hãy xem lại bước và hội thoại trước khi gửi lại.');
            setErrorCode(null);
          }
        } catch { /* Keep the original error and the user's text; refresh remains available. */ }
      }
    } finally {
      if (active.current === controller) { active.current = null; if (live()) setBusy(false); }
    }
  }
  function perform(operation: Pending) {
    return run(signal => operation.kind === 'create' ? api.createSession(operation.body, signal)
      : operation.kind === 'action' ? api.sessionAction(operation.id, operation.body, signal)
      : api.sessionMessage(operation.id, operation.body, signal, llmConfig), operation);
  }
  function createBody(source: RecipeDocument, id = crypto.randomUUID()): Pending {
    return { kind: 'create', body: { recipe_id: source.recipe.id, corpus_version: source.corpus_version, operation_id: id } };
  }
  function load() {
    const previous = saved();
    if (document && (!previous || previous.recipeId !== document.recipe.id))
      return;
    if (!previous) return;
    return run(async signal => {
      try {
        const restored = await api.getSession(previous.id, signal);
        if (restored.recipe.id !== previous.recipeId) throw new api.ApiError('Phiên trả về không khớp công thức đã chọn.');
        if (document && (restored.corpus_version !== document.corpus_version || restored.recipe_version !== document.recipe.updated_at || restored.status === 'finished'))
          return null;
        return restored;
      } catch (failure) {
        if (document && failure instanceof api.ApiError && (failure.status === 404 || failure.status === 410))
          return null;
        throw failure;
      }
    });
  }
  useEffect(() => {
    generation.current++; void load();
    return () => { generation.current++; active.current?.abort(); active.current = null; };
  }, [document?.recipe.id, document?.corpus_version]);
  useEffect(() => { if (!busy && focusReply.current && !retry) { focusReply.current = false; input.current?.focus(); } }, [busy, retry]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [session?.messages.length]);

  function refresh() {
    const current = sessionRef.current;
    if (current) void run(signal => api.getSession(current.id, signal, current.version));
    else void load();
  }
  function newSession() {
    const current = sessionRef.current;
    const source = document || (current ? { corpus_version: current.corpus_version, recipe: current.recipe } : null);
    if (source) void perform(createBody(source)).then(value => { if (value) setDraft(''); });
  }
  async function ensureSession() {
    if (active.current || unavailable || retry) return null;
    if (sessionRef.current) return sessionRef.current;
    return document ? perform(createBody(document, creation.current)) : null;
  }
  async function act(action: AssistantAction) {
    const current = await ensureSession();
    if (!current || sessionRef.current !== current || active.current) return;
    void perform({ kind: 'action', id: current.id, body: { action, expected_version: current.version, operation_id: crypto.randomUUID() } });
  }
  async function send() {
    const text = draft.trim();
    if (!text) return;
    const current = await ensureSession();
    if (!current || sessionRef.current !== current || active.current || current.status === 'finished') return;
    void perform({ kind: 'message', id: current.id, body: { text, expected_version: current.version, operation_id: crypto.randomUUID() } });
  }
  const step = session?.recipe.instructions.find(item => item.step === session.current_step);
  const closed = (!session && !document) || session?.status === 'finished' || unavailable;
  const quota = (session?.messages.length || 0) >= 60;
  const canResend = !retry && !closed && !quota && !!draft.trim() && !!errorCode && RESEND_CODES.has(errorCode);
  const inlineChatError = !!session && (errorTarget === 'message' || retry?.kind === 'message');
  const isNotConfigured = errorCode === 'ASSISTANT_NOT_CONFIGURED';
  const errorBanner = (error || retry) && <div className={inlineChatError ? 'error-message error-message-inline' : 'error-message'} role="alert"><div className="assistant-error-copy">
    {isNotConfigured ? <>
      <p><strong>Máy chủ chưa bật tính năng hỏi đáp.</strong> Bạn vẫn có thể xem các bước nấu và điều khiển từng bước ở khung bên cạnh.</p>
      <p>Để tiếp tục đặt câu hỏi, bạn có thể chọn <strong>Dùng khóa API riêng</strong> bên dưới hoặc <strong>liên hệ người quản lý hệ thống</strong>. Nội dung chưa gửi vẫn được giữ trong ô hỏi.</p>
    </> : <>
      <p>{error || 'Yêu cầu trước chưa được xác nhận. Thử lại cùng yêu cầu hoặc bỏ yêu cầu đang chờ trước khi tiếp tục.'}</p>
      <p>Nội dung chưa gửi vẫn được giữ trong ô hỏi.</p>
    </>}
  </div><div className="assistant-error-actions">
    {errorCode && CONFIG_ERROR_CODES.has(errorCode) && <button type="button" className="secondary-btn" onClick={() => onOpenLlmSettings('custom')}><Key size={16} aria-hidden="true" /> Dùng khóa API riêng</button>}
    {retry && <button className="secondary-btn" disabled={busy} onClick={() => void perform(retry)}>Thử lại yêu cầu</button>}
    {canResend && <button className="secondary-btn" disabled={busy} onClick={send}>Gửi lại câu hỏi</button>}
    <button className="text-btn" disabled={busy} onClick={refresh}>Kiểm tra phiên</button>
    {retry && <button className="text-btn" disabled={busy} onClick={() => { setRetry(null); setDraft(''); refresh(); }}>Bỏ câu hỏi đang chờ</button>}
  </div></div>;
  return <section className="assistant-page" aria-label="Hỏi CookLens">
    {storageWarning && <p className="assistant-notice" role="status">Trình duyệt chưa lưu được phiên. Bạn vẫn có thể nấu, nhưng có thể cần chọn lại công thức khi tải lại trang.</p>}
    {!inlineChatError && errorBanner}
    {busy && <p role="status" className="assistant-notice">{session ? 'Đang xử lý yêu cầu…' : 'Đang mở phiên nấu…'}</p>}
    {!document && !session && !busy && <div className="empty-state"><h2>{unavailable ? 'Phiên không còn khả dụng' : 'Chưa có phiên nấu'}</h2><p>Chọn một công thức để mở trợ lý. Phiên gần nhất sẽ được khôi phục khi còn hiệu lực.</p><button className="primary-btn" onClick={onRecipes}>Chọn món</button></div>}
    {(session || document) && <div className="assistant-grid">
      {!document && session && <button className="text-btn" onClick={onRecipes}>Đổi món</button>}
      {session ? <aside className="assistant-cooking recipe-card" aria-labelledby="cooking-title">
        <p className="assistant-eyebrow">Công thức đang nấu</p><h2 id="cooking-title">{session.recipe.title}</h2>
        <p className="assistant-step-count">Bước {session.current_step}/{session.total_steps}</p>
        <progress aria-label="Tiến độ nấu" value={session.current_step} max={session.total_steps} />
        <div className="assistant-current-step" aria-live="polite"><h3>{unavailable ? 'Phiên đã hết hạn hoặc không còn khả dụng' : session.status === 'finished' ? 'Đã kết thúc phiên nấu' : step ? `Bước ${step.step}` : 'Sẵn sàng vào bếp'}</h3><p>{step?.text || 'Bấm Bắt đầu nấu để xem bước đầu tiên.'}</p></div>
        <div className="assistant-controls" aria-label="Điều khiển bước nấu">
          {session.status === 'ready' ? <button className="primary-btn" disabled={busy || unavailable || !!retry} onClick={() => act('start')}>{labels.start}</button> : <>
            <button className="secondary-btn" disabled={busy || closed || !!retry || session.current_step <= 1 || session.history.length >= 99} onClick={() => act('previous')}>{labels.previous}</button>
            <button className="primary-btn" disabled={busy || closed || !!retry || session.current_step >= session.total_steps || session.history.length >= 99} onClick={() => act('next')}>{labels.next}</button>
            <button className="text-btn" disabled={busy || closed || !!retry} onClick={() => act('finish')}>{labels.finish}</button>
          </>}
        </div>
        {!document && <details className="assistant-original"><summary>Xem công thức {session.recipe.title}</summary>
          <RecipeContent detail={session.recipe} />
        </details>}
        {session.status === 'finished' && <button className="secondary-btn" disabled={busy} onClick={newSession}>Nấu lại</button>}
      </aside> : <div className="assistant-start">
        {['Cần chuẩn bị gì?', 'Bắt đầu từ đâu?'].map(question => <button key={question} type="button" className="recipe-chat-prompt"
          disabled={busy || !!retry || unavailable} onClick={() => { setDraft(question); input.current?.focus(); }}>{question}</button>)}
        <button className="secondary-btn" onClick={() => void act('start')} disabled={busy || !!retry || unavailable}>Bắt đầu nấu</button>
      </div>}
      <div className="assistant-conversation recipe-card">
        <div ref={log} className="assistant-messages" role="log" tabIndex={0} aria-label="Hội thoại nấu ăn" aria-live="polite" aria-relevant="additions text" aria-busy={busy} hidden={!session?.messages.length}>
          {!session?.messages.length && <p className="assistant-empty-chat">Bạn có thể hỏi về nguyên liệu, cách làm hoặc bước đang nấu.</p>}
          {session?.messages.map((message, i) => <article key={i} className={`assistant-message assistant-message-${message.role}`} aria-label={message.role === 'user' ? 'Câu hỏi của bạn' : 'Câu trả lời của CookLens'}><strong>{message.role === 'user' ? 'Bạn' : 'CookLens'}</strong><p>{message.text}</p></article>)}
        </div>
        {quota && <p className="assistant-notice">Phiên đã đạt giới hạn 30 lượt hỏi. Bạn vẫn có thể dùng các nút bước nấu.</p>}
        {inlineChatError && errorBanner}
        <form className="assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
          <label htmlFor="assistant-question">Câu hỏi về công thức</label><textarea id="assistant-question" ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={1} disabled={busy || closed || quota || !!retry} placeholder="Hỏi về công thức…" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
          <button className="primary-btn assistant-send" aria-label="Gửi câu hỏi" disabled={busy || closed || quota || !!retry || !draft.trim()}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>}
  </section>;
}
