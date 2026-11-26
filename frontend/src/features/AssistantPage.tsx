import { useEffect, useRef, useState } from 'react';
import type { AssistantAction, AssistantSession, CreateSession, RecipeDocument, SessionActionRequest, SessionMessageRequest } from '../types';
import * as api from '../lib/api';
import { Source } from './RecipePage';

const STORAGE = 'cooklens.assistant.session';
const RESEND_CODES = new Set(['ASSISTANT_PROVIDER_UNAVAILABLE', 'ASSISTANT_PROVIDER_TIMEOUT', 'ASSISTANT_RATE_LIMITED']);
const labels: Record<AssistantAction, string> = { start: 'Bắt đầu nấu', previous: 'Bước trước', repeat: 'Nhắc lại', next: 'Bước tiếp', finish: 'Kết thúc nấu' };
type Pending = { kind: 'create'; body: CreateSession } | { kind: 'action'; id: string; body: SessionActionRequest } | { kind: 'message'; id: string; body: SessionMessageRequest };
type Saved = { id: string; recipeId: string };

export default function AssistantPage({ document, onRecipes }: { document: RecipeDocument | null; onRecipes: () => void }) {
  const [session, setSession] = useState<AssistantSession | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
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
    if (active.current) return;
    const controller = new AbortController(), ticket = generation.current;
    active.current = controller; setBusy(true); setError(null); setErrorCode(null); if (operation) setRetry(null);
    if (operation?.kind === 'message') focusReply.current = true;
    const live = () => !controller.signal.aborted && ticket === generation.current;
    try {
      const value = await work(controller.signal);
      if (live() && value) {
        accept(value);
        if (operation?.kind === 'message') setDraft(current => current.trim() === operation.body.text ? '' : current);
        if (operation?.kind === 'create') setDraft('');
      }
    } catch (failure) {
      if (!live()) return;
      const known = failure instanceof api.ApiError ? failure : null;
      setError(known?.message || 'Chưa kết nối được trợ lý. Hãy kiểm tra phiên trước khi thử lại.');
      setErrorCode(known?.code ?? null);
      if (known?.status === 404 || known?.status === 410) setUnavailable(true);
      if (operation && (!known?.code || known.code === 'ASSISTANT_REQUEST_IN_PROGRESS')) setRetry(operation);
      if (known?.code === 'SESSION_VERSION_CONFLICT' && sessionRef.current) {
        try {
          const latest = await api.getSession(sessionRef.current.id, controller.signal, sessionRef.current.version);
          if (live()) { accept(latest); setError('Phiên đã được cập nhật. Hãy xem lại bước và hội thoại trước khi gửi lại.'); }
        } catch { /* Keep the original error and the user's text; refresh remains available. */ }
      }
    } finally {
      if (active.current === controller) { active.current = null; if (live()) setBusy(false); }
    }
  }
  function perform(operation: Pending) {
    return run(signal => operation.kind === 'create' ? api.createSession(operation.body, signal)
      : operation.kind === 'action' ? api.sessionAction(operation.id, operation.body, signal)
      : api.sessionMessage(operation.id, operation.body, signal), operation);
  }
  function createBody(source: RecipeDocument, id = crypto.randomUUID()): Pending {
    return { kind: 'create', body: { recipe_id: source.recipe.id, corpus_version: source.corpus_version, operation_id: id } };
  }
  function load() {
    const previous = saved();
    if (document && (!previous || previous.recipeId !== document.recipe.id)) return perform(createBody(document, creation.current));
    if (!previous) return;
    return run(async signal => {
      try {
        const restored = await api.getSession(previous.id, signal);
        if (restored.recipe.id !== previous.recipeId) throw new api.ApiError('Phiên trả về không khớp công thức đã chọn.');
        if (document && (restored.corpus_version !== document.corpus_version || restored.recipe_version !== document.recipe.updated_at))
          return api.createSession((createBody(document, creation.current) as Extract<Pending, { kind: 'create' }>).body, signal);
        return restored;
      } catch (failure) {
        if (document && failure instanceof api.ApiError && (failure.status === 404 || failure.status === 410))
          return api.createSession((createBody(document, creation.current) as Extract<Pending, { kind: 'create' }>).body, signal);
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
    if (source) void perform(createBody(source));
  }
  function act(action: AssistantAction) {
    const current = sessionRef.current;
    if (!current || active.current || unavailable || retry) return;
    void perform({ kind: 'action', id: current.id, body: { action, expected_version: current.version, operation_id: crypto.randomUUID() } });
  }
  function send() {
    const current = sessionRef.current, text = draft.trim();
    if (!current || !text || active.current || retry || unavailable || current.status === 'finished') return;
    void perform({ kind: 'message', id: current.id, body: { text, expected_version: current.version, operation_id: crypto.randomUUID() } });
  }
  const step = session?.recipe.instructions.find(item => item.step === session.current_step);
  const closed = !session || session.status === 'finished' || unavailable;
  const quota = (session?.messages.length || 0) >= 60;
  const canResend = !retry && !closed && !quota && !!draft.trim() && !!errorCode && RESEND_CODES.has(errorCode);
  return <section className="section assistant-page" aria-labelledby="assistant-title">
    <div className="section-title"><h1 id="assistant-title">Trợ lý nấu ăn</h1><p>Hỏi về công thức đã chọn và tự điều khiển từng bước nấu.</p></div>
    <div className="assistant-toolbar"><button className="text-btn" onClick={onRecipes}>← Chọn công thức khác</button>{session && <button className="text-btn" disabled={busy} onClick={newSession}>Tạo phiên mới</button>}</div>
    {storageWarning && <p className="assistant-notice" role="status">Trình duyệt chưa lưu được phiên. Bạn vẫn có thể nấu, nhưng có thể cần chọn lại công thức khi tải lại trang.</p>}
    {(error || retry) && <div className="error-message" role="alert"><div><p>{error || 'Yêu cầu trước chưa được xác nhận. Thử lại cùng yêu cầu hoặc bỏ yêu cầu đang chờ trước khi tiếp tục.'}</p><p>Nội dung chưa gửi vẫn được giữ trong ô hỏi.</p></div><div className="assistant-error-actions">
      {retry && <button className="secondary-btn" disabled={busy} onClick={() => void perform(retry)}>Thử lại yêu cầu</button>}
      {canResend && <button className="secondary-btn" disabled={busy} onClick={send}>Gửi lại câu hỏi</button>}
      <button className="text-btn" disabled={busy} onClick={refresh}>Kiểm tra phiên</button>
      {retry && <button className="text-btn" disabled={busy} onClick={() => { setRetry(null); setDraft(''); refresh(); }}>Bỏ câu hỏi đang chờ</button>}
    </div></div>}
    {busy && <p role="status" className="assistant-notice">{session ? 'Đang xử lý yêu cầu…' : 'Đang mở phiên nấu…'}</p>}
    {!session && !busy && <div className="empty-state"><h2>{unavailable ? 'Phiên không còn khả dụng' : 'Chưa có phiên nấu'}</h2><p>Chọn một công thức để mở trợ lý. Phiên gần nhất sẽ được khôi phục khi còn hiệu lực.</p><button className="primary-btn" onClick={onRecipes}>Chọn công thức</button></div>}
    {session && <div className="assistant-grid">
      <aside className="assistant-cooking recipe-card" aria-labelledby="cooking-title">
        <p className="assistant-eyebrow">Công thức đang nấu</p><h2 id="cooking-title">{session.recipe.title}</h2>
        <p className="assistant-step-count">Bước {session.current_step}/{session.total_steps}</p>
        <progress aria-label="Tiến độ nấu" value={session.current_step} max={session.total_steps} />
        <div className="assistant-current-step" aria-live="polite"><h3>{unavailable ? 'Phiên đã hết hạn hoặc không còn khả dụng' : session.status === 'finished' ? 'Đã kết thúc phiên nấu' : step ? `Bước ${step.step}` : 'Sẵn sàng vào bếp'}</h3><p>{step?.text || 'Bấm Bắt đầu nấu để xem bước đầu tiên.'}</p></div>
        <div className="assistant-controls" aria-label="Điều khiển bước nấu">
          {session.status === 'ready' ? <button className="primary-btn" disabled={busy || unavailable || !!retry} onClick={() => act('start')}>{labels.start}</button> : <>
            <button className="secondary-btn" disabled={busy || closed || !!retry || session.current_step <= 1 || session.history.length >= 99} onClick={() => act('previous')}>{labels.previous}</button>
            <button className="secondary-btn" disabled={busy || closed || !!retry || session.history.length >= 99} onClick={() => act('repeat')}>{labels.repeat}</button>
            <button className="primary-btn" disabled={busy || closed || !!retry || session.current_step >= session.total_steps || session.history.length >= 99} onClick={() => act('next')}>{labels.next}</button>
            <button className="text-btn" disabled={busy || closed || !!retry} onClick={() => act('finish')}>{labels.finish}</button>
          </>}
        </div>
        <details className="assistant-original"><summary>Xem công thức gốc</summary><h3>Nguyên liệu</h3><ul>{session.recipe.ingredients.map((item, i) => <li key={i}>{item.name}: {item.quantity === null ? 'Chưa có định lượng' : `${new Intl.NumberFormat('vi-VN').format(item.quantity)} ${item.unit || ''}`}{item.note && ` — ${item.note}`}</li>)}</ul><h3>Các bước thực hiện</h3><ol>{session.recipe.instructions.map(item => <li key={item.step}>{item.text}</li>)}</ol><Source source={session.recipe.source} /></details>
      </aside>
      <div className="assistant-conversation recipe-card"><h2>Hỏi CookLens</h2><p className="muted">“Theo công thức” là nội dung từ công thức gốc; “Gợi ý thêm” là thông tin tham khảo.</p>
        <div ref={log} className="assistant-messages" role="log" tabIndex={0} aria-label="Hội thoại nấu ăn" aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
          {session.messages.length === 0 && <p className="assistant-empty-chat">Bạn có thể hỏi về nguyên liệu, cách làm hoặc bước đang nấu.</p>}
          {session.messages.map((message, i) => <article key={i} className={`assistant-message assistant-message-${message.role}`} aria-label={message.role === 'user' ? 'Câu hỏi của bạn' : 'Câu trả lời của CookLens'}><strong>{message.role === 'user' ? 'Bạn' : 'CookLens'}</strong><p>{message.text}</p></article>)}
        </div>
        {quota && <p className="assistant-notice">Phiên đã đạt giới hạn 30 lượt hỏi. Bạn vẫn có thể dùng các nút bước nấu.</p>}
        <form className="assistant-form" onSubmit={event => { event.preventDefault(); send(); }}>
          <label htmlFor="assistant-question">Câu hỏi về công thức</label><textarea id="assistant-question" ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={3} disabled={busy || closed || quota || !!retry} placeholder="Ví dụ: Bước này cần lưu ý điều gì?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
          <div className="assistant-compose-footer"><small>Enter để gửi · Shift + Enter để xuống dòng</small><button className="primary-btn" disabled={busy || closed || quota || !!retry || !draft.trim()}>Gửi câu hỏi</button></div>
        </form>
      </div>
    </div>}
  </section>;
}
