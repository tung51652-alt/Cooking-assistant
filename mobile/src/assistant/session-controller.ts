import type { createApi } from '../../../packages/cooklens-api';
import type {
  AssistantAction, AssistantSession, CreateSession, RecipeDocument, SessionActionRequest, SessionMessageRequest,
} from '../../../packages/cooklens-api/types';
import type { SessionPointerStore } from './session-pointer';

type SessionApi = Pick<ReturnType<typeof createApi>, 'createSession' | 'getSession' | 'sessionAction' | 'sessionMessage'>;
type Mutation = { kind: 'create'; body: CreateSession }
  | { kind: 'action'; sessionId: string; body: SessionActionRequest }
  | { kind: 'message'; sessionId: string; body: SessionMessageRequest };
type Busy = Mutation['kind'] | 'restore' | 'refresh';
type SessionError = { message: string; code?: string; retryable: boolean; relatedToMessage?: boolean };
type Snapshot = {
  session: AssistantSession | null;
  busy: Busy | null;
  error: SessionError | null;
  storageWarning: string | null;
  canAct: boolean;
  canSend: boolean;
  canDiscardMessage: boolean;
  canResend: boolean;
  refreshRequired: boolean;
  draft: string;
};
type Request = { signal: AbortSignal; active: () => boolean };

export const messageLimit = 2_000;
const empty: Snapshot = {
  session: null, busy: null, error: null, storageWarning: null,
  canAct: false, canSend: false, canDiscardMessage: false, canResend: false, refreshRequired: false, draft: '',
};
const interrupted = 'Kết nối bị gián đoạn. Hãy thử lại để tiếp tục.';
const pendingMessage = 'Câu hỏi trước chưa được xác nhận. Bạn có thể thử lại yêu cầu đó hoặc tiếp tục nấu.';
const storageWarning = 'Không lưu được phiên trên thiết bị. Bạn vẫn có thể nấu khi ứng dụng đang mở.';
const resendCodes = new Set(['ASSISTANT_PROVIDER_TIMEOUT', 'ASSISTANT_OUTCOME_UNKNOWN']);
const syncedTimeoutMessage = 'Trợ lý phản hồi quá lâu và câu hỏi chưa được ghi nhận. Nội dung đã được giữ lại để bạn gửi lại.';
const syncedUnknownMessage = 'Chưa nhận được phản hồi cho câu hỏi vừa rồi và câu hỏi chưa được ghi nhận. Nội dung đã được giữ lại để bạn gửi lại.';

function errorStatus(error: unknown) {
  return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

function sessionError(error: unknown, retryable: boolean): SessionError {
  return {
    message: error instanceof Error ? error.message : 'Chưa xử lý được phiên nấu. Vui lòng thử lại.',
    code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    retryable,
  };
}

function sessionIsGone(error: unknown) {
  const status = errorStatus(error);
  const code = sessionError(error, false).code;
  return (status === 404 && code === 'SESSION_NOT_FOUND') || (status === 410 && code === 'SESSION_EXPIRED');
}

function sameRecipe(current: AssistantSession | null, result: AssistantSession) {
  return !current || (result.recipe.id === current.recipe.id
    && result.corpus_version === current.corpus_version && result.recipe_version === current.recipe_version);
}

function includesQuestion(result: AssistantSession, body: SessionMessageRequest) {
  if (result.history.some(event => event.operation_id === body.operation_id)) return true;
  // Public snapshots expose versions for cooking events but no operation IDs for chat turns.
  const version = body.expected_version + 1;
  const actionsThroughVersion = result.history.filter(event => event.version <= version).length;
  const message = result.messages[(version - actionsThroughVersion - 1) * 2];
  return !result.history.some(event => event.version === version) && message?.text === body.text;
}

export function createCookingSessionController({ api, store, gateway, operationId }: {
  api: SessionApi; store: SessionPointerStore; gateway: string; operationId: () => string;
}) {
  let snapshot = empty;
  let flight: AbortController | null = null;
  let pending: Mutation | null = null;
  let needsRefresh = false;
  let retryWork: (() => Promise<void>) | null = null;
  let foregroundRestore: (() => Promise<void>) | null = null;
  const listeners = new Set<() => void>();

  function update(change: Partial<Snapshot>) {
    const next = { ...snapshot, ...change };
    next.canAct = !!next.session && next.session.status !== 'finished' && !next.busy && !pending && !needsRefresh;
    next.canSend = next.canAct && (next.session?.messages.length ?? 0) < 60;
    next.canDiscardMessage = pending?.kind === 'message' && !next.busy && !needsRefresh;
    next.refreshRequired = needsRefresh;
    next.canResend = next.canSend
      && !!next.error?.relatedToMessage
      && !next.refreshRequired
      && !next.canDiscardMessage
      && resendCodes.has(next.error.code ?? '')
      && !!next.draft.trim();
    snapshot = next;
    listeners.forEach(listener => listener());
  }

  async function run(busy: Busy, work: (request: Request) => Promise<void>) {
    if (flight) return;
    const controller = new AbortController();
    flight = controller;
    const request = { signal: controller.signal, active: () => flight === controller };
    update({ busy, error: null });
    try {
      await work(request);
    } finally {
      if (request.active()) {
        flight = null;
        foregroundRestore = null;
        update({ busy: null });
      }
    }
  }

  async function clearExpired(error: unknown, sessionId: string, request: Request): Promise<boolean> {
    if (!sessionIsGone(error)) return false;
    pending = null;
    needsRefresh = false;
    retryWork = null;
    update({ session: null, error: sessionError(error, false) });
    try {
      await store.clear(gateway, sessionId);
    } catch {
      if (request.active()) update({ storageWarning: 'Không xóa được phiên cũ trên thiết bị.' });
    }
    return true;
  }

  async function read(
    sessionId: string,
    version: number,
    request: Request,
    priorError?: SessionError,
    submittedMessage?: SessionMessageRequest,
  ) {
    try {
      const result = await api.getSession(sessionId, request.signal, version);
      if (!request.active()) return;
      if (result.id !== sessionId || result.version < version || !sameRecipe(snapshot.session, result))
        throw Error('Chưa tải được trạng thái phiên mới nhất.');
      needsRefresh = false;
      let draft = snapshot.draft;
      if (pending && pending.kind !== 'create' && (
        result.status === 'finished' || result.version !== pending.body.expected_version
      )) {
        if (pending.kind === 'message' && includesQuestion(result, pending.body)) draft = '';
        pending = null;
      }
      const retry = pending;
      retryWork = retry ? () => mutate(retry) : null;
      let resolvedError: SessionError | null = null;
      if (retry) {
        resolvedError = {
          message: retry.kind === 'message' ? pendingMessage : interrupted,
          retryable: true,
          relatedToMessage: retry.kind === 'message',
        };
      } else if (priorError) {
        if (submittedMessage && includesQuestion(result, submittedMessage)) {
          if (draft.trim() === submittedMessage.text) draft = '';
        } else if (priorError.code === 'ASSISTANT_PROVIDER_TIMEOUT') {
          resolvedError = { ...priorError, message: syncedTimeoutMessage, retryable: false };
        } else if (priorError.code === 'ASSISTANT_OUTCOME_UNKNOWN') {
          resolvedError = { ...priorError, message: syncedUnknownMessage, retryable: false };
        } else {
          resolvedError = priorError;
        }
      }
      update({ session: result, draft, error: resolvedError });
    } catch (error) {
      if (!request.active() || await clearExpired(error, sessionId, request)) return;
      if (!request.active()) return;
      retryWork = () => refreshSession(sessionId, version, priorError, submittedMessage);
      update({ error: { ...sessionError(error, true), relatedToMessage: pending?.kind === 'message' || priorError?.relatedToMessage } });
    }
  }

  function refreshSession(
    sessionId: string,
    version: number,
    priorError?: SessionError,
    submittedMessage?: SessionMessageRequest,
  ) {
    return run('refresh', request => {
      needsRefresh = true;
      retryWork = () => refreshSession(sessionId, version, priorError, submittedMessage);
      return read(sessionId, version, request, priorError, submittedMessage);
    });
  }

  function mutate(mutation: Mutation) {
    return run(mutation.kind, request => submit(mutation, request));
  }

  async function submit(mutation: Mutation, request: Request) {
    pending = mutation;
    retryWork = () => mutate(mutation);
    try {
      const result = mutation.kind === 'create'
        ? await api.createSession(mutation.body, request.signal)
        : mutation.kind === 'action'
          ? await api.sessionAction(mutation.sessionId, mutation.body, request.signal)
          : await api.sessionMessage(mutation.sessionId, mutation.body, request.signal);
      if (!request.active()) return;
      if (mutation.kind !== 'create' && (
        result.id !== mutation.sessionId || result.version <= mutation.body.expected_version
        || result.version < (snapshot.session?.version ?? 0) || !sameRecipe(snapshot.session, result)
      )) throw Error('Chưa tải được trạng thái phiên mới nhất.');
      pending = null;
      retryWork = null;
      update({ session: result, draft: mutation.kind === 'message' ? '' : snapshot.draft });
      if (mutation.kind === 'create') {
        try {
          await store.write({ gateway, sessionId: result.id });
        } catch {
          if (request.active()) update({ storageWarning });
        }
      }
    } catch (error) {
      if (!request.active()) return;
      const status = errorStatus(error);
      if (mutation.kind !== 'create') {
        if (await clearExpired(error, mutation.sessionId, request) || !request.active()) return;
        const failure = { ...sessionError(error, false), relatedToMessage: mutation.kind === 'message' };
        const version = snapshot.session?.version ?? mutation.body.expected_version;
        const { sessionId } = mutation;
        const uncertainMessage = mutation.kind === 'message' && (status === undefined
          || (status >= 500 && !failure.code) || failure.code === 'ASSISTANT_REQUEST_IN_PROGRESS'
          || failure.code === 'ASSISTANT_STORAGE_UNAVAILABLE');
        if (uncertainMessage) {
          needsRefresh = true;
          retryWork = () => refreshSession(sessionId, version);
          update({ error: { ...failure, retryable: true } });
          return;
        }
        if ((status === 409 && failure.code !== 'SESSION_MESSAGE_LIMIT')
          || failure.code === 'ASSISTANT_PROVIDER_TIMEOUT' || failure.code === 'ASSISTANT_OUTCOME_UNKNOWN') {
          const submittedMessage = mutation.kind === 'message' ? mutation.body : undefined;
          pending = null;
          needsRefresh = true;
          retryWork = () => refreshSession(sessionId, version, failure, submittedMessage);
          update({ busy: 'refresh' });
          await read(sessionId, version, request, failure, submittedMessage);
          return;
        }
        if (mutation.kind === 'message') {
          pending = null;
          retryWork = null;
          update({ error: failure });
          return;
        }
      }
      const retryable = status === undefined || status >= 500 || status === 429;
      if (!retryable) {
        pending = null;
        retryWork = null;
      }
      update({ error: sessionError(error, retryable) });
    }
  }

  function suspend() {
    if (!flight) return;
    flight.abort();
    flight = null;
    if (pending?.kind === 'message') {
      const { sessionId, body } = pending;
      needsRefresh = true;
      retryWork = () => refreshSession(sessionId, body.expected_version);
    }
    update({ busy: null, error: { message: interrupted, retryable: retryWork !== null, relatedToMessage: pending?.kind === 'message' } });
  }

  function leave() {
    suspend();
    pending = null;
    needsRefresh = false;
    retryWork = null;
    foregroundRestore = null;
    update(empty);
  }

  function openRecipe(document: RecipeDocument, allowCreate = true) {
    if (flight || pending) return Promise.resolve();
    leave();
    return run('restore', async request => {
      retryWork = () => openRecipe(document);
      foregroundRestore = () => openRecipe(document, false);
      let pointer;
      try {
        pointer = await store.read(gateway);
      } catch {
        if (request.active()) update({ storageWarning: 'Không đọc được phiên đã lưu trên thiết bị.' });
      }
      if (!request.active()) return;
      if (pointer) {
        try {
          const saved = await api.getSession(pointer.sessionId, request.signal, 0);
          if (!request.active()) return;
          if (saved.id !== pointer.sessionId) throw Error('Chưa tải được phiên đã lưu.');
          if (saved.recipe.id === document.recipe.id && saved.status !== 'finished') {
            retryWork = null;
            update({ session: saved });
            return;
          }
        } catch (error) {
          if (!request.active()) return;
          if (!sessionIsGone(error)) {
            update({ error: sessionError(error, true) });
            return;
          }
        }
      }
      if (!allowCreate) {
        update({ error: { message: 'Phiên chưa được mở. Hãy thử lại để bắt đầu nấu.', retryable: true } });
        return;
      }
      foregroundRestore = null;
      retryWork = null;
      update({ busy: 'create' });
      await submit({ kind: 'create', body: {
        recipe_id: document.recipe.id, corpus_version: document.corpus_version, operation_id: operationId(),
      } }, request);
    });
  }

  function resume() {
    return run('restore', async request => {
      retryWork = resume;
      foregroundRestore = resume;
      let pointer;
      try {
        pointer = await store.read(gateway);
      } catch {
        if (request.active()) update({ error: { message: 'Không đọc được phiên đã lưu trên thiết bị.', retryable: true } });
        return;
      }
      if (!request.active()) return;
      if (!pointer) {
        retryWork = null;
        update({ error: { message: 'Chưa có phiên nấu đã lưu trên máy chủ này.', retryable: false } });
        return;
      }
      await read(pointer.sessionId, 0, request);
    });
  }

  return {
    openRecipe,
    resume,
    foreground: () => {
      if (flight) return Promise.resolve();
      if (snapshot.session) return refreshSession(snapshot.session.id, snapshot.session.version);
      const restore = foregroundRestore;
      foregroundRestore = null;
      return restore?.() ?? Promise.resolve();
    },
    setDraft: (draft: string) => {
      if (snapshot.canSend) update({ draft: draft.slice(0, messageLimit) });
    },
    sendMessage: () => {
      const { session, canSend, draft } = snapshot;
      const text = draft.trim();
      if (!session || !canSend || !text) return Promise.resolve();
      return mutate({ kind: 'message', sessionId: session.id, body: {
        text, expected_version: session.version, operation_id: operationId(),
      } });
    },
    discardPendingMessage: () => {
      if (!snapshot.canDiscardMessage) return;
      pending = null;
      retryWork = null;
      update({ error: null });
    },
    act: (action: AssistantAction) => {
      const { session, canAct } = snapshot;
      if (!session || !canAct) return Promise.resolve();
      return mutate({ kind: 'action', sessionId: session.id, body: {
        action, expected_version: session.version, operation_id: operationId(),
      } });
    },
    retry: () => retryWork?.() ?? Promise.resolve(),
    suspend,
    leave,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
