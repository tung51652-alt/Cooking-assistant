import { createApi } from '../../../packages/cooklens-api';
export { ApiError } from '../../../packages/cooklens-api';
const api = createApi('/api', () => crypto.randomUUID());
export const { getDishes, searchRecipes, getRecipe } = api;
export function predict(file: File, signal: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  return api.predict(body, signal);
}
