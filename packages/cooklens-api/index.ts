import type {
  Dish, Prediction, RecipeDetail, RecipeDocument, RecipeSummary, RecipeSource,
  AssistantSession, CreateSession, SessionActionRequest, SessionMessageRequest,
  LlmProviderPreset, LlmUserConfig, LlmTestResult,
} from './types';

export type { LlmProviderPreset, LlmUserConfig, LlmTestResult };

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message); this.status = status; this.code = code;
  }
}
export const voiceDurationMs = 14_000;
export const voiceFileLimit = 512 * 1024;
const transcriptionPath = '/assistant/transcriptions';

export function appendTranscription(draft: string, transcript: string, limit = 2000) {
  return [draft.trimEnd(), transcript].filter(Boolean).join(' ').slice(0, limit);
}

export interface NativeUploadPart { uri: string; name?: string; type?: string }
export type NativeFileUploader = (url: string, file: NativeUploadPart, requestId: string, signal: AbortSignal) => Promise<Response>;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const nativeUploadPart = (v: unknown): v is NativeUploadPart => record(v) && text(v.uri);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const nullableNumber = (v: unknown) => v === null || (finite(v) && v > 0);
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const dish = (v: unknown): v is Dish => record(v) && Number.isInteger(v.class_id) && finite(v.class_id)
  && v.class_id >= 0 && v.class_id < 30 && typeof v.normalized_dish === 'string' && /^[a-z][a-z0-9_]*$/.test(v.normalized_dish) && text(v.display_name);
const source = (v: unknown): v is RecipeSource => record(v)
  && ['name', 'url', 'license', 'attribution', 'retrieved_at'].every(key => text(v[key]))
  && nullableString(v.revision_url) && typeof v.modifications === 'string';
const recipeBase = (v: unknown) => record(v) && typeof v.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(v.id)
  && text(v.title) && text(v.normalized_dish) && v.language === 'vi' && v.cuisine === 'vietnamese'
  && nullableNumber(v.servings) && nullableNumber(v.prep_time_minutes) && nullableNumber(v.cook_time_minutes) && source(v.source);
function malformed(): never { throw new ApiError('Dữ liệu trả về chưa đúng định dạng. Vui lòng thử lại sau.'); }
function canonicalUuid(value: string): string {
  if (!uuid(value)) malformed();
  return value.toLowerCase();
}

export function recipeSourceHref(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    // Show attribution alone for GitHub pull requests.
    if (['github.com', 'www.github.com'].includes(url.hostname)
      && /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function createApi(baseUrl: string, requestId: () => string, nativeFileUploader?: NativeFileUploader) {
  baseUrl = normalizeBaseUrl(baseUrl);
async function request(path: string, signal: AbortSignal, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const headers = new Headers(init.headers);
  headers.set('X-Request-ID', requestId());
  try {
    let response: Response;
    if ((path === '/vision/predict' || path === transcriptionPath) && nativeFileUploader && init.body instanceof FormData) {
      const parts = init.body.getAll('file');
      if (parts.length !== 1 || !nativeUploadPart(parts[0])) malformed();
      response = await nativeFileUploader(`${baseUrl}${path}`, parts[0],
        headers.get('X-Request-ID')!, controller.signal);
    } else {
      response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG hợp lệ.',
        413: 'Ảnh quá lớn. Vui lòng chọn ảnh không quá 10 MiB.',
        415: 'Định dạng chưa hỗ trợ. Hãy chọn ảnh JPG hoặc PNG.',
        422: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra ảnh hoặc món đã chọn.',
        404: 'Công thức này không còn tồn tại. Hãy chọn công thức khác.',
        409: 'Phiên đã thay đổi hoặc thao tác không phù hợp. Hãy tải lại phiên.',
        410: 'Phiên nấu ăn đã hết hạn. Hãy tạo phiên mới.',
        503: 'Dịch vụ chưa sẵn sàng. Bạn có thể thử lại sau.',
        504: 'Dịch vụ phản hồi quá lâu. Vui lòng thử lại.',
      };
      if (path === transcriptionPath) {
        messages[400] = 'Không đọc được bản ghi âm.';
        messages[413] = 'Bản ghi quá dài hoặc quá lớn. Hãy thử nói ngắn hơn.';
        messages[415] = 'Trình duyệt hoặc thiết bị dùng định dạng ghi âm chưa được hỗ trợ.';
        messages[422] = 'Chưa nhận được lời nói. Vui lòng thử lại.';
        messages[503] = 'Nhập giọng nói chưa sẵn sàng. Bạn vẫn có thể gõ.';
        messages[504] = 'Chuyển giọng nói mất quá lâu. Vui lòng thử lại.';
      }
      if (path.startsWith('/assistant/')) {
        const error: unknown = await response.json().catch(() => null);
        const assistantErrors: Record<string, string> = {
          SESSION_NOT_FOUND: 'Không tìm thấy phiên nấu ăn. Hãy tạo phiên mới.',
          SESSION_EXPIRED: messages[410],
          SESSION_VERSION_CONFLICT: messages[409],
          OPERATION_CONFLICT: 'Mã thao tác đã được dùng. Hãy tải lại phiên trước khi tiếp tục.',
          RECIPE_VERSION_MISMATCH: 'Phiên bản công thức đã thay đổi. Hãy tải lại công thức.',
          INVALID_SESSION_ACTION: 'Thao tác không phù hợp với trạng thái phiên.',
          SESSION_FINISHED: 'Phiên nấu ăn đã kết thúc. Hãy tạo phiên mới.',
          SESSION_HISTORY_LIMIT: 'Phiên đã đạt giới hạn thao tác. Hãy tạo phiên mới.',
          ASSISTANT_NOT_CONFIGURED: 'Tính năng hỏi đáp trên máy chủ chưa được cấu hình. Bạn vẫn có thể xem các bước nấu, hoặc chọn Dùng khóa API riêng hay liên hệ người quản lý hệ thống.',
          ASSISTANT_STORAGE_UNAVAILABLE: 'Kho lưu phiên chưa sẵn sàng. Vui lòng thử lại sau.',
          ASSISTANT_REQUEST_IN_PROGRESS: 'Trợ lý đang trả lời. Hãy đợi rồi tải lại phiên.',
          SESSION_MESSAGE_LIMIT: 'Phiên đã đạt giới hạn hỏi đáp. Bạn vẫn có thể điều khiển bước nấu.',
          ASSISTANT_OUTCOME_UNKNOWN: 'Chưa xác định được kết quả hỏi đáp. Hãy tải lại phiên trước khi thử lại.',
          ASSISTANT_PROVIDER_UNAVAILABLE: 'Trợ lý chưa trả lời được. Vui lòng thử lại sau.',
          ASSISTANT_PROVIDER_TIMEOUT: 'Trợ lý phản hồi quá lâu. Hãy tải lại phiên trước khi thử lại.',
          ASSISTANT_PROVIDER_AUTH_FAILED: 'Cấu hình xác thực trợ lý chưa hợp lệ. Bạn vẫn có thể điều khiển bước nấu.',
          ASSISTANT_PROVIDER_UNSUPPORTED: 'Nhà cung cấp trợ lý này chưa được hỗ trợ.',
          ASSISTANT_RATE_LIMITED: 'Trợ lý đang giới hạn lượt hỏi. Vui lòng thử lại sau.',
          ASSISTANT_BUDGET_EXCEEDED: 'Trợ lý đã hết ngân sách. Bạn vẫn có thể điều khiển bước nấu.',
          ASSISTANT_CONTEXT_TOO_LARGE: 'Ngữ cảnh hỏi đáp quá dài. Hãy rút ngắn câu hỏi hoặc chọn công thức khác.',
          ASSISTANT_MODEL_INVALID: 'Model không hợp lệ hoặc không được nhà cung cấp hỗ trợ.',
          VALIDATION_ERROR: 'Thông tin cấu hình hoặc yêu cầu chưa hợp lệ. Vui lòng kiểm tra lại.',
          INVALID_AUDIO: 'Không đọc được bản ghi âm.',
          AUDIO_TOO_LONG: 'Hãy nói trong tối đa 15 giây.',
          NO_SPEECH_DETECTED: 'Chưa nghe rõ lời nói. Hãy thử lại hoặc gõ câu hỏi.',
          SERVICE_BUSY: 'Dịch vụ đang bận. Vui lòng thử lại.',
        };
        if (record(error) && error.api_version === '1.0.0' && uuid(error.request_id)
          && response.headers.get('X-Request-ID') === error.request_id && typeof error.code === 'string'
          && Object.hasOwn(assistantErrors, error.code)) {
          throw new ApiError(assistantErrors[error.code], response.status, error.code);
        }
      }
      if (path === '/vision/predict') {
        const error: unknown = await response.json().catch(() => null);
        const visionErrors: Record<string, string> = {
          IMAGE_BLURRY: 'Ảnh bị mờ, không đủ rõ nét để nhận diện món ăn. Vui lòng chụp hoặc chọn ảnh rõ nét hơn.',
          LOW_CONFIDENCE_PREDICTION: 'Ảnh có vấn đề hoặc không nhận diện được món ăn Việt phù hợp (độ tin cậy dưới 50%). Vui lòng chọn ảnh món ăn rõ nét hơn.',
        };
        if (record(error) && error.api_version === '1.0.0' && uuid(error.request_id)
          && response.headers.get('X-Request-ID') === error.request_id && typeof error.code === 'string'
          && Object.hasOwn(visionErrors, error.code)) {
          throw new ApiError(visionErrors[error.code], response.status, error.code);
        }
      }
      throw new ApiError(messages[response.status] || 'Chưa xử lý được yêu cầu. Vui lòng thử lại sau.', response.status);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) malformed();
    const data: unknown = await response.json().catch(() => malformed());
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!record(data) || data.api_version !== '1.0.0' || !uuid(data.request_id)) malformed();
    if (response.headers.get('X-Request-ID') !== data.request_id) malformed();
    return data;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new ApiError('Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Không kết nối được dịch vụ. Hãy kiểm tra kết nối và thử lại.');
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}
async function predict(body: FormData, signal: AbortSignal): Promise<Prediction[]> {
  const data = await request('/vision/predict', signal, { method: 'POST', body }, 25_000);
  if (!text(data.model_version) || !text(data.taxonomy_version) || !Array.isArray(data.predictions) || data.predictions.length !== 3) malformed();
  const result: Prediction[] = [];
  for (const v of data.predictions) {
    if (!record(v) || !finite(v.confidence) || v.confidence < 0 || v.confidence > 1 || v.rank !== result.length + 1 || !dish(v)) malformed();
    result.push(v as Prediction);
  }
  if (new Set(result.map(p => p.class_id)).size !== 3 || new Set(result.map(p => p.normalized_dish)).size !== 3
    || result.reduce((sum,p) => sum+p.confidence,0) > 1.000001
    || result.some((p,i) => i>0 && (p.confidence > result[i-1].confidence || (p.confidence === result[i-1].confidence && p.class_id < result[i-1].class_id)))) malformed();
  return result;
}
async function getDishes(signal: AbortSignal): Promise<Dish[]> {
  const data = await request('/dishes', signal);
  if (!text(data.taxonomy_version) || !Array.isArray(data.dishes) || data.dishes.length !== 30 || !data.dishes.every(dish)
    || data.dishes.some((d,i) => d.class_id !== i) || new Set(data.dishes.map(d => d.normalized_dish)).size !== 30) malformed();
  return data.dishes;
}
async function searchRecipes(confirmedDish: string, signal: AbortSignal, query = ''): Promise<RecipeSummary[]> {
  const data = await request('/recipes/search', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed_dish: confirmedDish, top_k: 3, ...(query.trim() ? { query: query.trim().normalize('NFC') } : {}) }) });
  if (!text(data.corpus_version) || !text(data.embedding_version) || !text(data.taxonomy_version) || data.confirmed_dish !== confirmedDish
    || !Array.isArray(data.recipes) || data.recipes.length > 3 || !data.recipes.every((v,i) => recipeBase(v) && record(v)
      && typeof v.preview === 'string' && [...v.preview].length <= 240 && v.normalized_dish === confirmedDish && v.rank === i+1
      && finite(v.retrieval_score) && v.retrieval_score >= -1 && v.retrieval_score <= 1)) malformed();
  const results = data.recipes as RecipeSummary[];
  if (new Set(results.map(r => r.id)).size !== results.length || results.some((r,i) => i>0 && (r.retrieval_score > results[i-1].retrieval_score
    || (r.retrieval_score === results[i-1].retrieval_score && r.id < results[i-1].id)))) malformed();
  return results;
}
async function getRecipeDocument(id: string, confirmedDish: string, signal: AbortSignal): Promise<RecipeDocument> {
  const data = await request(`/recipes/${encodeURIComponent(id)}`, signal);
  const v = data.recipe;
  if (!text(data.corpus_version) || !record(v) || !recipeBase(v) || v.id !== id || v.normalized_dish !== confirmedDish
    || !Array.isArray(v.ingredients) || v.ingredients.length === 0 || !v.ingredients.every(item => record(item) && text(item.name)
      && text(item.normalized_name) && typeof item.optional === 'boolean' && nullableNumber(item.quantity) && nullableString(item.unit) && nullableString(item.note))
    || !Array.isArray(v.instructions) || v.instructions.length === 0 || !v.instructions.every((item,i) => record(item) && item.step === i+1
      && text(item.text) && nullableNumber(item.duration_minutes)) || !Array.isArray(v.tags) || !v.tags.every(text) || !text(v.created_at) || !text(v.updated_at)) malformed();
  return { corpus_version: data.corpus_version, recipe: v as RecipeDetail };
}
async function getRecipe(id: string, confirmedDish: string, signal: AbortSignal): Promise<RecipeDetail> {
  return (await getRecipeDocument(id, confirmedDish, signal)).recipe;
}

function session(data: Record<string, unknown>, id?: string, minimumVersion = 0): AssistantSession {
  const v = data.session;
  if (!record(v) || !uuid(v.id) || (id !== undefined && v.id !== id) || !text(v.corpus_version) || !text(v.recipe_version)
    || !record(v.recipe) || !recipeBase(v.recipe) || v.recipe_version !== v.recipe.updated_at
    || !Array.isArray(v.recipe.instructions) || v.recipe.instructions.length === 0
    || !v.recipe.instructions.every((step,i) => record(step) && step.step === i+1 && text(step.text) && nullableNumber(step.duration_minutes))
    || !Array.isArray(v.recipe.ingredients) || v.recipe.ingredients.length === 0
    || !v.recipe.ingredients.every(item => record(item) && text(item.name) && text(item.normalized_name)
      && typeof item.optional === 'boolean' && nullableNumber(item.quantity) && nullableString(item.unit) && nullableString(item.note))
    || !Array.isArray(v.recipe.tags) || !v.recipe.tags.every(text) || !text(v.recipe.created_at) || !text(v.recipe.updated_at)
    || !Number.isSafeInteger(v.version) || !finite(v.version) || v.version < minimumVersion
    || !Number.isInteger(v.current_step) || !finite(v.current_step) || v.current_step < 0
    || v.total_steps !== v.recipe.instructions.length || v.current_step > v.recipe.instructions.length
    || !['ready', 'cooking', 'finished'].includes(v.status as string)
    || (v.status === 'ready' && v.current_step !== 0) || (v.status === 'cooking' && v.current_step === 0)
    || ![v.created_at, v.updated_at, v.expires_at].every(t => typeof t === 'string' && Number.isFinite(Date.parse(t)))
    || !Array.isArray(v.history) || v.history.length > 100
    || !v.history.every(event => record(event) && uuid(event.operation_id) && Number.isSafeInteger(event.version)
      && finite(event.version) && event.version > 0 && event.version <= (v.version as number)
      && ['start', 'next', 'previous', 'repeat', 'finish'].includes(event.action as string)
      && Number.isInteger(event.current_step) && finite(event.current_step) && event.current_step >= 0
      && event.current_step <= (v.total_steps as number) && typeof event.created_at === 'string' && Number.isFinite(Date.parse(event.created_at)))
    || !Array.isArray(v.messages) || v.messages.length > 60 || v.messages.length % 2 !== 0
    || v.version !== v.history.length + v.messages.length / 2
    || !v.messages.every((message,i) => record(message) && message.role === (i % 2 === 0 ? 'user' : 'assistant')
      && text(message.text) && message.text.length <= (i % 2 === 0 ? 2000 : 16384))) malformed();
  let previousVersion = 0, step = 0, status = 'ready';
  const operations = new Set<string>();
  for (const [index, event] of v.history.entries()) {
    if (event.version <= previousVersion || operations.has(event.operation_id.toLowerCase()) || status === 'finished'
      || (index === 99 && event.action !== 'finish')) malformed();
    operations.add(event.operation_id.toLowerCase()); previousVersion = event.version;
    switch (event.action) {
      case 'start': if (status !== 'ready') malformed(); status = 'cooking'; step = 1; break;
      case 'finish': status = 'finished'; if (event.version !== v.version) malformed(); break;
      default:
        if (status !== 'cooking') malformed();
        if (event.action === 'next') step = Math.min(step + 1, v.total_steps as number);
        if (event.action === 'previous') step = Math.max(step - 1, 1);
    }
    if (event.current_step !== step) malformed();
  }
  if (v.current_step !== step || v.status !== status) malformed();
  return v as AssistantSession;
}
async function createSession(body: CreateSession, signal: AbortSignal): Promise<AssistantSession> {
  const payload = { ...body, operation_id: canonicalUuid(body.operation_id) };
  const result = session(await request('/assistant/sessions', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  if (result.recipe.id !== body.recipe_id || result.corpus_version !== body.corpus_version) malformed();
  return result;
}
async function getSession(id: string, signal: AbortSignal, minimumVersion = 0): Promise<AssistantSession> {
  id = canonicalUuid(id);
  return session(await request(`/assistant/sessions/${encodeURIComponent(id)}`, signal), id, minimumVersion);
}
async function sessionAction(id: string, body: SessionActionRequest, signal: AbortSignal): Promise<AssistantSession> {
  id = canonicalUuid(id);
  const payload = { ...body, operation_id: canonicalUuid(body.operation_id) };
  return session(await request(`/assistant/sessions/${encodeURIComponent(id)}/actions`, signal,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), id, payload.expected_version + 1);
}
async function sessionMessage(id: string, body: SessionMessageRequest, signal: AbortSignal, llmConfig?: LlmUserConfig | null): Promise<AssistantSession> {
  id = canonicalUuid(id);
  const payload = { ...body, operation_id: canonicalUuid(body.operation_id) };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (llmConfig && llmConfig.api_key.trim()) {
    headers['X-LLM-Provider'] = llmConfig.provider;
    if (llmConfig.base_url?.trim()) headers['X-LLM-Base-Url'] = llmConfig.base_url.trim();
    headers['X-LLM-Model'] = llmConfig.model.trim();
    headers['X-LLM-Api-Key'] = llmConfig.api_key;
  }
  return session(await request(`/assistant/sessions/${encodeURIComponent(id)}/messages`, signal,
    { method: 'POST', headers, body: JSON.stringify(payload) }, 25_000), id, payload.expected_version + 1);
}
async function testLlmConfig(config: LlmUserConfig, signal: AbortSignal): Promise<LlmTestResult> {
  const payload: Record<string, string> = {
    provider: config.provider,
    model: config.model.trim(),
    api_key: config.api_key,
  };
  if (config.base_url?.trim()) payload.base_url = config.base_url.trim();
  const data = await request('/assistant/llm/test', signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 25_000);
  if (data.ok !== true || !text(data.provider) || !text(data.model)
    || typeof data.reply !== 'string' || !finite(data.latency_ms) || data.latency_ms < 0) {
    malformed();
  }
  return {
    ok: data.ok,
    provider: data.provider,
    model: data.model,
    reply: data.reply,
    latency_ms: data.latency_ms,
  };
}
async function transcribe(body: FormData, signal: AbortSignal): Promise<string> {
  const data = await request(transcriptionPath, signal, { method: 'POST', body }, 25_000);
  if (!text(data.text) || data.text.length > 2000) malformed();
  return data.text;
}
return { transcribe, predict, getDishes, searchRecipes, getRecipe, getRecipeDocument, createSession, getSession, sessionAction, sessionMessage, testLlmConfig };
}

export function normalizeBaseUrl(value: string): string {
  if (value === '/api') return value;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        && !url.search && !url.hash && url.pathname.replace(/\/$/, '') === '/api') {
      return url.origin + '/api';
    }
  } catch { /* Invalid configuration is reported before making a request. */ }
  throw new ApiError('Địa chỉ máy chủ phải dùng HTTP(S) và kết thúc bằng /api.');
}
