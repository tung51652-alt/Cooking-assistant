import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterDishes, normalizeVietnameseSearch } from './dishes.ts';

const dishes = [
  { class_id: 28, normalized_dish: 'pho', display_name: 'Phở' },
  { class_id: 14, normalized_dish: 'bun_bo_hue', display_name: 'Bún bò Huế' },
  { class_id: 15, normalized_dish: 'bun_dau_mam_tom', display_name: 'Bún đậu mắm tôm' },
  { class_id: 2, normalized_dish: 'banh_mi', display_name: 'Bánh mì' },
  { class_id: 22, normalized_dish: 'com_tam', display_name: 'Cơm tấm' },
];

test('normalizeVietnameseSearch folds accents, d-stroke, case, and outer spacing', () => {
  assert.equal(normalizeVietnameseSearch('  Phở  '), 'pho');
  assert.equal(normalizeVietnameseSearch('Bún đậu mắm tôm'), 'bun dau mam tom');
  assert.equal(normalizeVietnameseSearch('ĐẬU HŨ'), 'dau hu');
});

test('filterDishes matches accentless queries including pho and bun dau', () => {
  assert.deepEqual(filterDishes(dishes, 'pho').map(d => d.normalized_dish), ['pho']);
  assert.deepEqual(filterDishes(dishes, 'PHỞ').map(d => d.normalized_dish), ['pho']);
  assert.deepEqual(filterDishes(dishes, '  pho  ').map(d => d.normalized_dish), ['pho']);
  assert.deepEqual(filterDishes(dishes, 'bun dau').map(d => d.normalized_dish), ['bun_dau_mam_tom']);
  assert.deepEqual(filterDishes(dishes, 'banh mi').map(d => d.normalized_dish), ['banh_mi']);
  assert.deepEqual(filterDishes(dishes, '   ').length, dishes.length);
  assert.deepEqual(filterDishes(dishes, 'pizza'), []);
});
