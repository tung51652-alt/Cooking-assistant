import type { Dish } from '../../packages/cooklens-api/types';

/** Normalize Vietnamese text for accent- and case-insensitive dish filtering. */
export function normalizeVietnameseSearch(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ');
}

/** Filter dish catalog entries by display name using normalized Vietnamese matching. */
export function filterDishes<T extends Pick<Dish, 'display_name'>>(
  dishes: readonly T[],
  query: string,
): T[] {
  const normalized = normalizeVietnameseSearch(query);
  if (!normalized) return [...dishes];
  return dishes.filter(dish => normalizeVietnameseSearch(dish.display_name).includes(normalized));
}
