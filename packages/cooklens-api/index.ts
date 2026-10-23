import type { Dish, Prediction, RecipeDetail, RecipeSummary, RecipeSource } from './types';

export class ApiError extends Error {}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
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

export function createApi(baseUrl: string, requestId: () => string) {
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
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG hợp lệ.',
        413: 'Ảnh quá lớn. Vui lòng chọn ảnh không quá 10 MiB.',
        415: 'Định dạng chưa hỗ trợ. Hãy chọn ảnh JPG hoặc PNG.',
        422: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra ảnh hoặc món đã chọn.',
        404: 'Công thức này không còn tồn tại. Hãy chọn công thức khác.',
        503: 'Dịch vụ chưa sẵn sàng. Bạn có thể thử lại sau.',
        504: 'Dịch vụ phản hồi quá lâu. Vui lòng thử lại.',
      };
      throw new ApiError(messages[response.status] || 'Chưa xử lý được yêu cầu. Vui lòng thử lại sau.');
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
async function getRecipe(id: string, confirmedDish: string, signal: AbortSignal): Promise<RecipeDetail> {
  const data = await request(`/recipes/${encodeURIComponent(id)}`, signal);
  const v = data.recipe;
  if (!text(data.corpus_version) || !record(v) || !recipeBase(v) || v.id !== id || v.normalized_dish !== confirmedDish
    || !Array.isArray(v.ingredients) || v.ingredients.length === 0 || !v.ingredients.every(item => record(item) && text(item.name)
      && text(item.normalized_name) && typeof item.optional === 'boolean' && nullableNumber(item.quantity) && nullableString(item.unit) && nullableString(item.note))
    || !Array.isArray(v.instructions) || v.instructions.length === 0 || !v.instructions.every((item,i) => record(item) && item.step === i+1
      && text(item.text) && nullableNumber(item.duration_minutes)) || !Array.isArray(v.tags) || !v.tags.every(text) || !text(v.created_at) || !text(v.updated_at)) malformed();
  return v as RecipeDetail;
}

return { predict, getDishes, searchRecipes, getRecipe };
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
