import type { Dish, Prediction, RecipeDetail, RecipeSummary, RecipeSource } from '../types';

export class ApiError extends Error {}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || (finite(value) && value > 0);
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const dish = (value: unknown): value is Dish => record(value)
  && Number.isInteger(value.class_id) && finite(value.class_id) && value.class_id >= 0
  && typeof value.normalized_dish === 'string' && /^[a-z][a-z0-9_]*$/.test(value.normalized_dish)
  && typeof value.display_name === 'string' && value.display_name.length > 0;
const source = (value: unknown): value is RecipeSource => record(value)
  && ['name', 'url', 'license', 'attribution'].every(key => typeof value[key] === 'string');
const recipeBase = (value: unknown) => record(value)
  && typeof value.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.id)
  && typeof value.title === 'string' && value.title.trim().length > 0 && typeof value.normalized_dish === 'string'
  && nullableNumber(value.servings) && nullableNumber(value.prep_time_minutes)
  && nullableNumber(value.cook_time_minutes) && source(value.source);

function malformed(): never { throw new ApiError('Dữ liệu trả về chưa đúng định dạng. Vui lòng thử lại sau.'); }

async function request(path: string, signal: AbortSignal, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`/api${path}`, { ...init, signal: controller.signal });
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
    if (!record(data) || data.api_version !== '1.0.0') malformed();
    return data;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new ApiError('Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Không kết nối được dịch vụ. Hãy kiểm tra kết nối và thử lại.');
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export async function predict(file: File, signal: AbortSignal): Promise<Prediction[]> {
  const body = new FormData();
  body.append('file', file);
  const data = await request('/vision/predict', signal, { method: 'POST', body }, 25_000);
  if (!Array.isArray(data.predictions) || data.predictions.length !== 3) malformed();
  const result: Prediction[] = [];
  for (const value of data.predictions) {
    if (!dish(value) || !record(value) || !finite(value.confidence)
      || value.confidence < 0 || value.confidence > 1 || value.rank !== result.length + 1) malformed();
    result.push(value as unknown as Prediction);
  }
  if (new Set(result.map(item => item.class_id)).size !== 3
    || result.reduce((sum, item) => sum + item.confidence, 0) > 1.000001
    || result.some((item, index) => index > 0 && item.confidence > result[index - 1].confidence)) malformed();
  return result;
}

export async function getDishes(signal: AbortSignal): Promise<Dish[]> {
  const data = await request('/dishes', signal);
  if (!Array.isArray(data.dishes) || data.dishes.length === 0 || !data.dishes.every(dish)) malformed();
  return data.dishes;
}

export async function searchRecipes(confirmedDish: string, signal: AbortSignal): Promise<RecipeSummary[]> {
  const data = await request('/recipes/search', signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed_dish: confirmedDish, top_k: 3 }),
  });
  if (!Array.isArray(data.recipes) || data.recipes.length > 3
    || !data.recipes.every(value => recipeBase(value) && record(value)
      && typeof value.preview === 'string' && value.normalized_dish === confirmedDish)) malformed();
  return data.recipes as RecipeSummary[];
}

export async function getRecipe(id: string, confirmedDish: string, signal: AbortSignal): Promise<RecipeDetail> {
  const data = await request(`/recipes/${encodeURIComponent(id)}`, signal);
  const value = data.recipe;
  if (!record(value) || !recipeBase(value) || value.id !== id || value.normalized_dish !== confirmedDish
    || !Array.isArray(value.ingredients) || value.ingredients.length === 0
    || !value.ingredients.every(item => record(item) && typeof item.name === 'string' && item.name.trim().length > 0
      && nullableNumber(item.quantity) && nullableString(item.unit) && nullableString(item.note))
    || !Array.isArray(value.instructions) || value.instructions.length === 0
    || !value.instructions.every((item, index) => record(item) && item.step === index + 1
      && typeof item.text === 'string' && item.text.trim().length > 0 && nullableNumber(item.duration_minutes))) malformed();
  return value as unknown as RecipeDetail;
}
