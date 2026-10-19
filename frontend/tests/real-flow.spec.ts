// These tests use the actual Docker gateway, CV, E5 and Qdrant. No route mocks.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

const photo = resolve('../ai/cv/inference/tests/fixtures/food.png');
async function capture(page: Page, name: string) {
  if (process.env.COOKLENS_CAPTURE_BASELINES === '1') {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/${name}.png`, fullPage: true });
  }
}
async function recognize(page: Page) {
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(photo);
  const response = page.waitForResponse(r => r.url().endsWith('/api/vision/predict') && r.request().method() === 'POST');
  await page.locator('#predictBtn').click();
  const result = await response;
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.model_version).toBeTruthy();
  expect(data.request_id).toBe(result.headers()['x-request-id']);
  await expect(page.getByRole('radio')).toHaveCount(3);
  return data;
}

test('real photo, explicit second prediction, recipes and complete detail', async ({ page }, info) => {
  const data = await recognize(page);
  expect(await page.getByRole('radio').evaluateAll(inputs => inputs.every(input => !(input as HTMLInputElement).checked))).toBe(true);
  await expect(page.locator('#confirmButton')).toBeDisabled();
  if (info.project.name === 'desktop') await capture(page, 'recognition-desktop');
  const selected = data.predictions[1];
  await page.getByRole('radio').nth(1).check();
  const searchRequest = page.waitForRequest(r => r.url().endsWith('/api/recipes/search'));
  await page.locator('#confirmButton').click();
  expect((await searchRequest).postDataJSON().confirmed_dish).toBe(selected.normalized_dish);
  await expect(page.locator('.recipe-toolbar')).toContainText(selected.display_name);
  await expect(page.locator('.recipe-list-item').first()).toBeVisible();
  await page.getByRole('button', { name: /^Xem công thức / }).first().click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu', exact: true })).toBeVisible();
  await expect(page.locator('#recipeSteps li').first()).toBeVisible();
  expect(await page.locator('#ingredients li').count()).toBeGreaterThan(0);
  const source = page.locator('.source-info > a');
  await expect(source).toHaveAttribute('href', /^https?:/);
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  await page.locator('.source-info summary').click();
  await expect(page.locator('.source-info details')).toHaveAttribute('open', '');
  if (info.project.name === 'desktop') await capture(page, 'recipe-desktop');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('real catalog correction, scoped query, and disclosed AI-authored recipe', async ({ page }) => {
  await recognize(page);
  await page.getByRole('button', { name: 'Sửa món trong danh mục' }).click();
  await expect(page.locator('#dishSelect option')).toHaveCount(31);
  await page.locator('#dishSelect').selectOption('pho');
  await page.locator('#confirmButton').click();
  await expect(page.locator('.recipe-list-item').first()).toBeVisible();
  await page.getByLabel('Ưu tiên nguyên liệu hoặc cách nấu (không bắt buộc)').fill('bò ninh xương');
  const search = page.waitForRequest(r => r.url().endsWith('/api/recipes/search'));
  await page.getByRole('button', { name: 'Tìm công thức', exact: true }).click();
  expect((await search).postDataJSON()).toEqual({ confirmed_dish: 'pho', top_k: 3, query: 'bò ninh xương' });
  await expect(page.locator('.recipe-toolbar')).toContainText('Phở');
  await expect(page.locator('.recipe-list-item')).toHaveCount(2);
  await page.getByRole('link', { name: 'Nhận diện', exact: true }).click();
  await page.locator('#dishSelect').selectOption('banh_can');
  await page.locator('#confirmButton').click();
  await expect(page.locator('.recipe-list-item')).toHaveCount(1);
  await expect(page.locator('.source-info')).toContainText('AI biên soạn');
  await expect(page.locator('.source-info')).toContainText('CC-BY-4.0');
  await page.getByRole('button', { name: /^Xem công thức / }).click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu', exact: true })).toBeVisible();
});

test('local assets, accessible navigation, responsive layout and fresh deep links', async ({ page }, info) => {
  const failures: string[] = [], external: string[] = [];
  const origin = new URL(process.env.COOKLENS_BASE_URL || 'http://127.0.0.1:5173').origin;
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/*', route => {
    const address = new URL(route.request().url());
    if (address.protocol.startsWith('http') && address.origin !== origin) {
      external.push(address.hostname); return route.abort();
    }
    return route.continue();
  });
  const response = await page.goto('/'); expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 20px "Epilogue Variable"'))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Chụp món ngon. Tìm cách nấu.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Chat|Saved|Collections|Cook Mode/ })).toHaveCount(0);
  await expect(page.locator('#predictBtn')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, `upload-${info.project.name}`);
  await page.keyboard.press('Tab'); await expect(page.getByText('Đến nội dung chính')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#main')).toBeFocused();
  await page.goto('/recognition.html');
  await expect(page.getByRole('heading', { name: 'Chưa có kết quả nhận diện' })).toBeVisible();
  await page.goto('/recipe.html');
  await expect(page.getByRole('heading', { name: 'Bạn muốn nấu món gì?' })).toBeVisible();
  expect(external).toEqual([]); expect(failures).toEqual([]);
});
