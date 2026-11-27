import type { Dish } from '../types';

const STORAGE = 'cooklens.recipes.confirmed-dish';

export function loadConfirmedDish(): Dish | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (value && typeof value === 'object' && 'class_id' in value && 'normalized_dish' in value && 'display_name' in value
      && typeof value.class_id === 'number' && Number.isInteger(value.class_id) && value.class_id >= 0 && value.class_id < 30
      && typeof value.normalized_dish === 'string' && /^[a-z0-9][a-z0-9_]{0,79}$/.test(value.normalized_dish)
      && typeof value.display_name === 'string' && value.display_name.trim() === value.display_name
      && value.display_name.length > 0 && value.display_name.length <= 120) {
      return { class_id: value.class_id, normalized_dish: value.normalized_dish, display_name: value.display_name };
    }
  } catch { /* Storage may be unavailable or contain an older, invalid value. */ }
  return null;
}

export function saveConfirmedDish(dish: Dish | null) {
  try {
    if (dish) sessionStorage.setItem(STORAGE, JSON.stringify({
      class_id: dish.class_id, normalized_dish: dish.normalized_dish, display_name: dish.display_name,
    }));
    else sessionStorage.removeItem(STORAGE);
  } catch { /* The current in-memory flow still works when storage is blocked. */ }
}
