// These tests use the actual Docker gateway, CV, E5 and Qdrant. No route mocks.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const photo = resolve('../ai/cv/inference/tests/fixtures/food.png');
async function capture(page: Page, name: string) {
  if (process.env.COOKLENS_CAPTURE_BASELINES === '1') {
    await page.evaluate(() => document.fonts.ready);
    const directory = process.env.COOKLENS_CAPTURE_DIRECTORY || 'docs';
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
  }
}
async function recognize(page: Page, imagePath = photo) {
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(imagePath);
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

for (const [name, variable] of [['out-of-domain', 'COOKLENS_OOD_IMAGE'], ['multiple-dish', 'COOKLENS_MULTI_IMAGE']]) {
  test(`${name} photo keeps model limitations and explicit confirmation`, async ({ page }) => {
    test.skip(!process.env[variable], 'External acceptance photo supplied only by the acceptance runner');
    await recognize(page, process.env[variable]!);
    await expect(page.locator('.privacy-note')).toContainText('Model hỗ trợ 30 món Việt');
    await expect(page.locator('.privacy-note')).toContainText('ngoài danh mục');
    await expect(page.locator('#confidence')).toContainText('không phải xác nhận món ăn');
    await expect(page.locator('#confirmButton')).toBeDisabled();
    await page.getByRole('button', { name: 'Sửa món trong danh mục' }).click();
    await expect(page.locator('#dishSelect option')).toHaveCount(31);
  });
}

test('real assistant photo to chat, cooking controls, reload and finish', async ({ page }, info) => {
  test.skip(process.env.COOKLENS_REAL_ASSISTANT !== '1', 'Requires the Phase 10/11 candidate and a backend LLM key');
  test.setTimeout(90_000);
  await recognize(page);
  await page.getByRole('radio').first().check(); await page.locator('#confirmButton').click();
  await page.getByRole('button', { name: /^Xem công thức / }).first().click();
  await page.getByRole('button', { name: 'Hỏi CookLens & bắt đầu nấu' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu nấu', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Bắt đầu nấu', exact: true }).click();
  await expect(page.locator('.assistant-step-count')).toHaveText(/^Bước 1\//);
  const input = page.getByLabel('Câu hỏi về công thức', { exact: true });
  await input.fill('Theo công thức, bước đầu tiên cần làm gì?');
  const reply = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
  await input.press('Enter'); const response = await reply; expect(response.status()).toBe(200);
  const result = await response.json(); expect(result.session.messages).toHaveLength(2);
  await expect(page.getByRole('article', { name: 'Câu trả lời của CookLens' })).toBeVisible();
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Bước tiếp', exact: true }).click();
  await expect(page.locator('.assistant-step-count')).toHaveText(/^Bước 2\//);
  await capture(page, `assistant-${info.project.name}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.locator('.assistant-step-count')).toHaveText(/^Bước 2\//);
  await page.getByRole('button', { name: 'Kết thúc nấu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã kết thúc phiên nấu' })).toBeVisible();
  await expect(input).toBeDisabled();
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
