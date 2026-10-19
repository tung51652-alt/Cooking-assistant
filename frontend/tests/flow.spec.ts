// Contract fixtures are test-only. No mock model results or recipe data ship in the app.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function captureBaseline(page: Page, name: string) {
  if (process.env.COOKLENS_CAPTURE_BASELINES !== '1') return;
  await mkdir('docs', { recursive: true });
  await page.screenshot({ path: `docs/${name}.png`, fullPage: true });
}

const png = { name: 'mon-an.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQTPf6DwADUQHSSaoLLQAAAABJRU5ErkJggg==', 'base64') };
const predictions = [
  { rank: 1, class_id: 28, normalized_dish: 'pho', display_name: 'Phở', confidence: 0.7 },
  { rank: 2, class_id: 14, normalized_dish: 'bun_bo_hue', display_name: 'Bún bò Huế', confidence: 0.15 },
  { rank: 3, class_id: 3, normalized_dish: 'banh_canh', display_name: 'Bánh canh', confidence: 0.05 },
];
const source = { name: 'Nguồn fixture kiểm thử', url: 'https://example.com/recipe', license: 'test-only', attribution: 'Fixture, không dùng trong production' };
const summary = { id: 'test_pho', title: 'Phở bò · fixture kiểm thử', normalized_dish: 'pho', servings: null, prep_time_minutes: null, cook_time_minutes: null, preview: 'Nội dung chỉ phục vụ kiểm thử giao diện.', source };
const detail = { ...summary, ingredients: [{ name: 'Nguyên liệu fixture', quantity: null, unit: null, note: null }], instructions: [{ step: 1, text: 'Bước fixture để kiểm tra layout, không phải hướng dẫn nấu.', duration_minutes: null }] };
const json = (data: object) => ({ contentType: 'application/json', body: JSON.stringify({ api_version: '1.0.0', request_id: 'test-request', ...data }) });

async function upload(page: Page) {
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(png);
  await expect(page.locator('#previewImage')).toBeVisible();
}

test('upload, manual Top-3 selection, search, detail and image reset', async ({ page }, testInfo) => {
  const searchBodies: object[] = [];
  await page.route('**/api/vision/predict', async route => {
    expect(await route.request().headerValue('content-type')).toContain('multipart/form-data');
    await route.fulfill(json({ predictions }));
  });
  await page.route('**/api/recipes/search', async route => {
    searchBodies.push(route.request().postDataJSON());
    await route.fulfill(json({ recipes: [summary] }));
  });
  await page.route('**/api/recipes/test_pho', route => route.fulfill(json({ recipe: detail })));
  await upload(page);
  await page.getByRole('button', { name: 'Nhận diện món', exact: true }).click();
  await expect(page).toHaveURL(/recognition\.html$/);
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Xác nhận món' })).toBeDisabled();
  if (testInfo.project.name === 'desktop') await captureBaseline(page, 'recognition-desktop');
  expect(searchBodies).toHaveLength(0);
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByRole('heading', { name: summary.title })).toBeVisible();
  expect(searchBodies).toEqual([{ confirmed_dish: 'pho', top_k: 3 }]);
  await page.getByRole('button', { name: `Xem công thức ${summary.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu', exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có thông tin', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('link', { name: source.name })).toHaveAttribute('rel', 'noopener noreferrer');
  if (testInfo.project.name === 'desktop') await captureBaseline(page, 'recipe-desktop');
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa ảnh' }).click();
  await page.getByRole('link', { name: 'Nhận diện', exact: true }).click();
  await expect(page.getByText('Chưa có kết quả nhận diện', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Công thức', exact: true }).click();
  await expect(page.getByText('Bạn muốn nấu món gì?', { exact: true })).toBeVisible();
});

test('local upload validation and truthful service failure', async ({ page }) => {
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
  await expect(page.getByRole('alert')).toContainText('JPG hoặc PNG');
  await expect(page.locator('#predictBtn')).toBeDisabled();
  await page.locator('#imageInput').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('10 MiB');
  await page.route('**/api/vision/predict', route => route.fulfill({ status: 503, ...json({ code: 'DEPENDENCY_NOT_READY' }) }));
  await page.locator('#imageInput').setInputFiles(png);
  await page.getByRole('button', { name: 'Nhận diện món', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('chưa sẵn sàng');
  await expect(page).not.toHaveURL(/recognition\.html$/);
  await expect(page.locator('#predictBtn')).toBeEnabled();
});

test('replacing an image cancels a pending prediction and clears stale data', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const routeFinished = new Promise<void>(resolve => { finished = resolve; });
  await page.route('**/api/vision/predict', async route => {
    started(); await wait;
    try { await route.fulfill(json({ predictions })); } catch { /* The replaced image cancels this request. */ }
    finally { finished(); }
  });
  await upload(page);
  await page.getByRole('button', { name: 'Nhận diện món', exact: true }).click();
  await requestStarted;
  await expect(page.locator('#predictBtn')).toHaveText('Đang nhận diện…');
  try { await page.locator('#imageInput').setInputFiles({ ...png, name: 'anh-moi.png' }); }
  finally { release(); }
  await routeFinished;
  await expect(page.getByText('anh-moi.png', { exact: true })).toBeVisible();
  await expect(page.locator('#predictBtn')).toBeEnabled();
  await page.getByRole('link', { name: 'Nhận diện', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText('Chưa có kết quả nhận diện', { exact: true })).toBeVisible();
});

test('a recipe response for another dish is rejected instead of shown', async ({ page }) => {
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: [{ ...summary, normalized_dish: 'bun_bo_hue' }] })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByRole('alert')).toContainText('đúng định dạng');
  await expect(page.getByRole('heading', { name: summary.title })).toHaveCount(0);
});

test('catalog correction, empty recipes and malformed predictions', async ({ page }) => {
  let good = false;
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions: good ? predictions : predictions.slice(0, 1) })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await expect(page.getByRole('alert')).toContainText('đúng định dạng');
  good = true;
  await page.locator('#predictBtn').click();
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: predictions })));
  await page.route('**/api/recipes/search', async route => {
    expect(route.request().postDataJSON().confirmed_dish).toBe('banh_canh');
    await route.fulfill(json({ recipes: [] }));
  });
  await page.getByRole('button', { name: 'Sửa món trong danh mục' }).click();
  await page.getByLabel('Chọn món khác').selectOption('banh_canh');
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByText('Chưa có công thức phù hợp', { exact: true })).toBeVisible();
});

test('responsive navigation, direct entry and no chatbot or external assets', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('blob:')) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tải ảnh món ăn', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Chat|Hỏi CookLens|Chế độ nấu/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureBaseline(page, `upload-${testInfo.project.name}`);
  await page.goto('/recognition.html');
  await expect(page.getByRole('heading', { name: 'Chưa có kết quả nhận diện' })).toBeVisible();
  await page.goto('/recipe.html');
  await expect(page.getByRole('heading', { name: 'Bạn muốn nấu món gì?' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('recipe content is escaped and unsafe source links are not clickable', async ({ page }) => {
  const unsafe = { ...summary, title: '<img src=x onerror=alert(1)>', source: { ...source, url: 'javascript:alert(1)' } };
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: [unsafe] })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByRole('heading', { name: unsafe.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: source.name })).toHaveCount(0);
  await expect(page.locator('.recipe-list img')).toHaveCount(0);
});
