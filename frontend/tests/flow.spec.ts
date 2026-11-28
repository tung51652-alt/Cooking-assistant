// Contract fixtures are test-only. No mock model results or recipe data ship in the app.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const source = { retrieved_at: '2026-10-19', revision_url: null, modifications: 'Fixture chỉ dùng kiểm thử', name: 'Nguồn fixture kiểm thử', url: 'https://example.com/recipe', license: 'test-only', attribution: 'Fixture, không dùng trong production' };
const summary = { language: 'vi', cuisine: 'vietnamese', rank: 1, retrieval_score: .8, id: 'test_pho', title: 'Phở bò · fixture kiểm thử', normalized_dish: 'pho', servings: null, prep_time_minutes: null, cook_time_minutes: null, preview: 'Nội dung chỉ phục vụ kiểm thử giao diện.', source };
const detail = { ...summary, tags: ['test-only'], created_at: '2026-10-19', updated_at: '2026-10-19', ingredients: [{ normalized_name: 'nguyen_lieu_fixture', optional: false, name: 'Nguyên liệu fixture', quantity: null, unit: null, note: null }], instructions: [{ step: 1, text: 'Bước fixture để kiểm tra layout, không phải hướng dẫn nấu.', duration_minutes: null }] };
const taxonomy = JSON.parse(readFileSync('../data/processed/30vnfoods-label-map.json', 'utf8')).labels.map(({ class_id, normalized_dish, display_name }: { class_id: number; normalized_dish: string; display_name: string }) => ({ class_id, normalized_dish, display_name }));
const visionManifest = JSON.parse(readFileSync('../deploy/artifacts/manifest.json', 'utf8'));
const json = (data: object) => {
  const identifier = randomUUID();
  return { contentType: 'application/json', headers: { 'X-Request-ID': identifier }, body: JSON.stringify({ api_version: '1.0.0', request_id: identifier,
    model_version: 'test-model', taxonomy_version: '1.0.0', corpus_version: 'test-corpus', embedding_version: 'test-embedding', confirmed_dish: 'pho', ...data }) };
};

async function upload(page: Page) {
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles(png);
  await expect(page.locator('#previewImage')).toBeVisible();
}

async function confirmedRecipes(page: Page, list = [summary], recipe = detail) {
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: list })));
  await page.route(`**/api/recipes/${recipe.id}`, route => route.fulfill(json({ recipe })));
  await upload(page);
  await page.getByRole('button', { name: 'Nhận diện món', exact: true }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByRole('button', { name: `Xem công thức ${list[0].title}` })).toBeVisible();
}

test('recipe detail opens in a scrollable dialog and restores focus when closed', async ({ page }) => {
  const recipe = { ...detail, instructions: Array.from({ length: 30 }, (_, index) => ({
    ...detail.instructions[0], step: index + 1,
  })) };
  await confirmedRecipes(page, [summary], recipe);
  const open = page.getByRole('button', { name: `Xem công thức ${recipe.title}` });
  await open.click();
  const dialog = page.getByRole('dialog', { name: recipe.title });
  await dialog.locator('#recipeSteps li').last().scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Đóng công thức' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('assistant keeps its active recipe and draft when opened again or filtered', async ({ page }) => {
  await confirmedRecipes(page);
  await expect(page.getByRole('heading', { name: 'Trợ lý nấu ăn' })).toBeVisible();
  const question = page.getByRole('textbox', { name: 'Câu hỏi về công thức' });
  await question.fill('Cần chuẩn bị gì cho món này?');
  await page.getByRole('link', { name: 'Trợ lý', exact: true }).click();
  await expect(question).toHaveValue('Cần chuẩn bị gì cho món này?');

  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: [] })));
  await page.locator('.recipe-chat-filter summary').click();
  await page.getByLabel('Ưu tiên nguyên liệu hoặc cách nấu (không bắt buộc)').fill('Không có kết quả');
  await page.getByRole('button', { name: 'Tìm công thức', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có công thức phù hợp' })).toBeVisible();
  await expect(question).toHaveValue('Cần chuẩn bị gì cho món này?');
  await page.getByRole('button', { name: `Xem công thức ${summary.title}`, exact: true }).click();
  await expect(page.getByRole('dialog').locator('#ingredients')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chọn công thức này' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Trợ lý nấu ăn' })).toBeVisible();
  await expect(question).toBeVisible();
  await page.getByRole('button', { name: 'Ảnh mới', exact: true }).click();
  await page.locator('#imageInput').setInputFiles(png);
  await page.getByRole('link', { name: 'Trợ lý', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có phiên nấu' })).toBeVisible();
});

test('invalid or unavailable recipe storage leaves the normal selection flow usable', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('cooklens.recipes.confirmed-dish', '{invalid'));
  await page.goto('/recipe.html');
  await expect(page.getByRole('heading', { name: 'Chọn món', exact: true })).toBeVisible();
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', {
    get() { throw new DOMException('Storage blocked', 'SecurityError'); },
  }));
  await confirmedRecipes(page);
});

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
  await expect(page).toHaveURL(/assistant\.html$/);
  await expect(page.getByAltText('Ảnh món ăn đã gửi')).toBeVisible();
  await expect(page.getByRole('button', { name: `Xem công thức ${summary.title}` })).toBeVisible();
  expect(searchBodies).toEqual([{ confirmed_dish: 'pho', top_k: 3 }]);
  await page.getByRole('button', { name: `Xem công thức ${summary.title}` }).click();
  const detailDialog = page.getByRole('dialog');
  await expect(detailDialog.getByRole('heading', { name: 'Nguyên liệu', exact: true })).toBeVisible();
  await expect(detailDialog.getByText('Chưa có thông tin', { exact: true })).toHaveCount(3);
  await expect(detailDialog.getByRole('link', { name: source.name })).toHaveAttribute('rel', 'noopener noreferrer');
  if (testInfo.project.name === 'desktop') await captureBaseline(page, 'recipe-desktop');
  await detailDialog.getByRole('button', { name: 'Đóng công thức' }).click();
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa ảnh' }).click();
  await page.goto('/recognition.html');
  await expect(page.getByText('Chưa có kết quả nhận diện', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Chọn món', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chọn món', exact: true })).toBeVisible();
});

test('corpus bun dau renders extracted quantities and verified servings', async ({ page }) => {
  const corpus = JSON.parse(readFileSync('../data/recipes/corpus.json', 'utf8'));
  const recipe = corpus.find((item: { id: string }) => item.id === 'wb_bun_dau_mam_tom');
  const dish = taxonomy.find((item: { normalized_dish: string }) => item.normalized_dish === recipe.normalized_dish);
  const recipeSummary = { id: recipe.id, title: recipe.title, normalized_dish: recipe.normalized_dish,
    language: recipe.language, cuisine: recipe.cuisine, servings: recipe.servings,
    prep_time_minutes: recipe.prep_time_minutes, cook_time_minutes: recipe.cook_time_minutes,
    preview: 'Công thức từ corpus', source: recipe.source, rank: 1, retrieval_score: .8 };
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions: [
    { ...dish, rank: 1, confidence: .9 },
    { ...predictions[0], rank: 2, confidence: .07 },
    { ...predictions[1], rank: 3, confidence: .03 },
  ] })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ confirmed_dish: dish.normalized_dish, recipes: [recipeSummary] })));
  await page.route(`**/api/recipes/${recipe.id}`, route => route.fulfill(json({ recipe })));
  await upload(page);
  await page.getByRole('button', { name: 'Nhận diện món', exact: true }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await page.getByRole('button', { name: `Xem công thức ${recipe.title}` }).click();
  const noodles = page.locator('#ingredients li').filter({ has: page.getByText('Bún lá', { exact: true }) });
  await expect(noodles.locator('strong')).toHaveText('1,2 kg');
  const sauce = page.locator('#ingredients li').filter({ has: page.getByText('Mắm tôm', { exact: true }) });
  await expect(sauce.locator('strong')).toHaveText('1 bát');
  await expect(page.locator('#recipeInfo')).toContainText('4 người');
  await expect(page.locator('#recipeInfo').getByText('Chưa có thông tin', { exact: true })).toHaveCount(2);
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
  await page.goto('/recognition.html');
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
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
  await page.route('**/api/recipes/search', async route => {
    expect(route.request().postDataJSON().confirmed_dish).toBe('banh_canh');
    await route.fulfill(json({ confirmed_dish: 'banh_canh', recipes: [] }));
  });
  await page.getByRole('button', { name: 'Sửa món trong danh mục' }).click();
  await page.getByLabel('Chọn món khác').selectOption('banh_canh');
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByText('Chưa có công thức phù hợp', { exact: true })).toBeVisible();
});

test('responsive navigation, direct entry and no chatbot or external assets', async ({ page, baseURL }, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('blob:') && new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chụp món ngon. Tìm cách nấu.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nhận diện', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Chat|Hỏi CookLens|Chế độ nấu/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureBaseline(page, `upload-${testInfo.project.name}`);
  await page.goto('/recognition.html');
  await expect(page.getByRole('heading', { name: 'Chưa có kết quả nhận diện' })).toBeVisible();
  await page.goto('/recipe.html');
  await expect(page.getByRole('heading', { name: 'Chọn món', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('recipe content is escaped and unsafe source links are not clickable', async ({ page }) => {
  const unsafe = { ...summary, title: '<img src=x onerror=alert(1)>', source: { ...source, url: 'javascript:alert(1)' } };
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: [unsafe] })));
  await page.route('**/api/recipes/test_pho', route => route.fulfill(json({ recipe: { ...detail, title: unsafe.title, source: unsafe.source } })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await page.getByRole('button', { name: `Xem công thức ${unsafe.title}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: unsafe.title, exact: true })).toBeVisible();
  await expect(dialog.getByText(source.name, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: source.name })).toHaveCount(0);
  await expect(page.locator('.recipe-chat-cards img')).toHaveCount(0);
});

test('AI-authored recipe credit is visible without linking to the pull request', async ({ page }) => {
  const aiSource = { ...source, name: 'CookLens — công thức do AI biên soạn', license: 'CC-BY-4.0',
    url: 'https://github.com/tung51652-alt/Cooking-assistant/pull/10/files' };
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ recipes: [{ ...summary, source: aiSource }] })));
  await page.route(`**/api/recipes/${summary.id}`, route => route.fulfill(json({ recipe: { ...detail, source: aiSource } })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();

  const card = page.getByRole('button', { name: `Xem công thức ${summary.title}` });
  await expect(card).toContainText(aiSource.name);
  await expect(card).toContainText(aiSource.license);

  await card.click();
  await expect(page.getByRole('heading', { name: 'Nguyên liệu', exact: true })).toBeVisible();
  const credit = page.getByRole('dialog').locator('.source-info');
  await expect(credit).toContainText(aiSource.name);
  await expect(credit.getByRole('link')).toHaveCount(0);
  await credit.locator('summary').click();
  await expect(credit.getByText(aiSource.attribution, { exact: true })).toBeVisible();
});


test('navigation cancels a late prediction instead of changing the current page', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/vision/predict', async route => {
    started(); await pending;
    try { await route.fulfill(json({ predictions })); } catch { /* Expected abort after navigation. */ }
  });
  await upload(page);
  await page.locator('#predictBtn').click(); await ready;
  await page.getByRole('link', { name: 'Chọn món', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'Chọn món', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/recipe\.html$/);
  await page.goto('/recognition.html');
  await expect(page.getByRole('heading', { name: 'Chưa có kết quả nhận diện' })).toBeVisible();
});

test('upload timeout has a retry path without inventing predictions', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/vision/predict', async route => {
    started(); await pending;
    try { await route.fulfill(json({ predictions })); } catch { /* Expected timeout abort. */ }
  });
  await upload(page); await page.locator('#predictBtn').click(); await ready;
  await page.clock.fastForward(26000);
  await expect(page.getByRole('alert')).toContainText('quá nhiều thời gian');
  await expect(page.locator('#predictBtn')).toBeEnabled();
  release();
  await expect(page).not.toHaveURL(/recognition\.html$/);
});

test('changing the confirmed dish discards a late recipe response', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  const other = { ...summary, id: 'test_bun', title: 'Bún bò Huế fixture', normalized_dish: 'bun_bo_hue' };
  await page.route('**/api/recipes/search', async route => {
    const dish = route.request().postDataJSON().confirmed_dish;
    if (dish === 'pho') {
      started(); await pending;
      try { await route.fulfill(json({ recipes: [summary] })); } catch { /* Superseded request. */ }
    } else await route.fulfill(json({ confirmed_dish: dish, recipes: [other] }));
  });
  await upload(page); await page.locator('#predictBtn').click();
  await page.getByRole('radio').first().check(); await page.locator('#confirmButton').click(); await ready;
  await page.getByRole('button', { name: 'Đổi món', exact: true }).click();
  await page.getByRole('radio').nth(1).check(); await page.locator('#confirmButton').click();
  await expect(page.getByRole('button', { name: `Xem công thức ${other.title}` })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: summary.title })).toHaveCount(0);
});

test('vision recovery errors hide dish suggestions and offer re-upload', async ({ page }) => {
  for (const [code, text] of [
    ['IMAGE_BLURRY', 'Ảnh bị mờ'], ['LOW_CONFIDENCE_PREDICTION', 'Chưa xác định được món'],
    ['OTHER_FOOD', 'ngoài danh mục'], ['NON_FOOD', 'không phải ảnh món ăn'],
  ] as const) {
    await page.route('**/api/vision/predict', route => route.fulfill({ status: 422, ...json({ code }) }));
    await upload(page);
    await page.locator('#predictBtn').scrollIntoViewIfNeeded();
    await page.locator('#predictBtn').click();
    const alert = page.getByRole('alert');
    const changeBtn = page.getByRole('button', { name: 'Chọn / tải ảnh khác' });
    await expect(alert).toContainText(text);
    await expect(alert).toBeInViewport();
    await expect(changeBtn).toBeInViewport();
    await expect(page.locator('#predictBtn')).toBeDisabled();
    await expect(page).not.toHaveURL(/recognition\.html$/);
    await expect(page.getByRole('radio')).toHaveCount(0);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      changeBtn.click(),
    ]);
    await expect(page.locator('#previewImage')).toBeVisible();
    await chooser.setFiles(png);
    await expect(alert).toHaveCount(0);
    await expect(page.locator('#predictBtn')).toBeEnabled();
  }
});

test('epoch 5 lists plausible dishes with percentages and without a primary suggestion below 54%', async ({ page }) => {
  await page.route('**/api/vision/predict', route => route.fulfill(json({
    model_version: visionManifest.vision_candidate.model_version,
    predictions: predictions.map((prediction, index) => ({ ...prediction, confidence: [0.49, 0.15, 0.05][index] })),
  })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await expect(page.getByRole('heading', { name: 'Các món có khả năng', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Món gợi ý', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByText('49%', { exact: true })).toBeVisible();
  await expect(page.getByText('15%', { exact: true })).toBeVisible();
  await expect(page.locator('#confirmButton')).toBeDisabled();
  await page.getByRole('radio').first().check();
  await expect(page.locator('#confirmButton')).toBeEnabled();
});

test('epoch 5 shows a parenthesized label on the primary dish and a percentage on alternatives', async ({ page }) => {
  for (const [score, label] of [[0.54, 'Phở'], [0.70, 'Phở (Khả năng cao)'], [0.90, 'Phở (Khả năng rất cao)']] as const) {
    await page.route('**/api/vision/predict', route => route.fulfill(json({
      model_version: visionManifest.vision_candidate.model_version,
      predictions: predictions.map((prediction, index) => ({ ...prediction, confidence: [score, 0.07, 0.02][index] })),
    })));
    await upload(page);
    await page.locator('#predictBtn').click();
    await expect(page.getByRole('heading', { name: 'Món gợi ý', exact: true })).toBeVisible();
    await expect(page.locator('#mainResult')).toContainText(label);
    await expect(page.locator('#mainResult')).not.toContainText('%');
    await expect(page.locator('#topResults')).toContainText('7%');
    await expect(page.getByRole('radio')).toHaveCount(2);
    await page.unroute('**/api/vision/predict');
  }
});

test('epoch 5 offers the manual catalog when all dishes score below 7%', async ({ page }) => {
  await page.route('**/api/vision/predict', route => route.fulfill(json({
    model_version: visionManifest.vision_candidate.model_version,
    predictions: predictions.map((prediction, index) => ({ ...prediction, confidence: [0.069, 0.05, 0.049][index] })),
  })));
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await expect(page.getByRole('alert')).toContainText('Chưa xác định được món');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chọn món từ danh mục' }).click();
  await expect(page.getByRole('group', { name: 'Danh mục 30 món Việt' })).toBeVisible();
});

test('defensive UI guard hides suggestions and confirmation when top-1 confidence is below 65%', async ({ page }, testInfo) => {
  const lowPredictions = [
    { rank: 1, class_id: 28, normalized_dish: 'pho', display_name: 'Phở', confidence: 0.631 },
    { rank: 2, class_id: 14, normalized_dish: 'bun_bo_hue', display_name: 'Bún bò Huế', confidence: 0.24 },
    { rank: 3, class_id: 3, normalized_dish: 'banh_canh', display_name: 'Bánh canh', confidence: 0.10 },
  ];
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions: lowPredictions })));
  await upload(page);
  await page.locator('#predictBtn').click();
  await expect(page).toHaveURL(/recognition\.html$/);
  await expect(page.getByRole('alert')).toContainText('Chưa xác định được món');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('#confirmButton')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sửa món trong danh mục' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn món từ danh mục' })).toBeVisible();
  if (process.env.COOKLENS_SCREENSHOT_DIR && testInfo.project.name === 'desktop') {
    await page.screenshot({ path: `${process.env.COOKLENS_SCREENSHOT_DIR}/recognition-low-confidence.png` });
  }
  await page.getByRole('button', { name: 'Chọn / tải ảnh khác' }).click();
  await expect(page).toHaveURL(/index\.html$/);
});

test('choose dish directly from 30-dish catalog without an image, filter accent-insensitively, and confirm to assistant', async ({ page }) => {
  const searchBodies: object[] = [];
  const bunSummary = { ...summary, id: 'test_bun', title: 'Bún bò Huế · fixture kiểm thử', normalized_dish: 'bun_bo_hue' };
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
  await page.route('**/api/recipes/search', async route => {
    const body = route.request().postDataJSON();
    searchBodies.push(body);
    const chosenSummary = body.confirmed_dish === 'bun_bo_hue' ? bunSummary : summary;
    await route.fulfill(json({ confirmed_dish: body.confirmed_dish, recipes: [chosenSummary] }));
  });
  await page.route('**/api/recipes/test_pho', route => route.fulfill(json({ recipe: detail })));

  await page.goto('/');
  await page.getByRole('link', { name: 'Chọn món', exact: true }).click();
  await expect(page).toHaveURL(/recipe\.html$/);
  await expect(page.getByRole('heading', { name: 'Chọn món', exact: true })).toBeVisible();

  await expect(page.getByText('Chưa có kết quả nhận diện')).toHaveCount(0);

  const catalogGroup = page.getByRole('group', { name: 'Danh mục 30 món Việt' });
  await expect(catalogGroup.getByRole('button')).toHaveCount(30);
  await expect(page.getByRole('button', { name: 'Xác nhận món' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const searchInput = page.getByLabel('Tìm món ăn theo tên');
  await searchInput.fill('pho');
  await expect(catalogGroup.getByRole('button')).toHaveCount(1);
  await expect(catalogGroup.getByRole('button', { name: 'Phở', exact: true })).toBeVisible();

  await searchInput.fill('bun dau');
  await expect(catalogGroup.getByRole('button')).toHaveCount(1);
  await expect(catalogGroup.getByRole('button', { name: 'Bún đậu mắm tôm', exact: true })).toBeVisible();

  await searchInput.fill('pizza');
  await expect(page.getByText('Không tìm thấy món ăn nào khớp với “pizza”.')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await expect(searchInput).toHaveValue('');
  await expect(catalogGroup.getByRole('button')).toHaveCount(30);

  await searchInput.fill('pho');
  const phoBtn = catalogGroup.getByRole('button', { name: 'Phở', exact: true });
  await phoBtn.click();
  await expect(phoBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Xác nhận món' })).toBeEnabled();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();

  await expect(page).toHaveURL(/assistant\.html$/);
  await expect(page.getByRole('button', { name: `Xem công thức ${summary.title}` })).toBeVisible();
  expect(searchBodies).toEqual([{ confirmed_dish: 'pho', top_k: 3 }]);

  await page.getByRole('button', { name: 'Đổi món' }).click();
  await page.getByLabel('Tìm món ăn theo tên').fill('bun bo hue');
  await catalogGroup.getByRole('button', { name: 'Bún bò Huế', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page.getByRole('button', { name: `Xem công thức ${bunSummary.title}` })).toBeVisible();
  expect(searchBodies).toEqual([
    { confirmed_dish: 'pho', top_k: 3 },
    { confirmed_dish: 'bun_bo_hue', top_k: 3 },
  ]);
});

test('low-confidence recognition keeps defensive guard while allowing manual dish catalog selection', async ({ page }) => {
  const lowPredictions = [
    { rank: 1, class_id: 28, normalized_dish: 'pho', display_name: 'Phở', confidence: 0.42 },
    { rank: 2, class_id: 14, normalized_dish: 'bun_bo_hue', display_name: 'Bún bò Huế', confidence: 0.31 },
    { rank: 3, class_id: 3, normalized_dish: 'banh_canh', display_name: 'Bánh canh', confidence: 0.12 },
  ];
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions: lowPredictions })));
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
  await page.route('**/api/recipes/search', async route => {
    expect(route.request().postDataJSON()).toEqual({ confirmed_dish: 'pho', top_k: 3 });
    await route.fulfill(json({ confirmed_dish: 'pho', recipes: [summary] }));
  });

  await upload(page);
  await page.locator('#predictBtn').click();
  await expect(page).toHaveURL(/recognition\.html$/);
  await expect(page.getByRole('alert')).toContainText('Chưa xác định được món');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('#confirmButton')).toHaveCount(0);

  await page.getByRole('button', { name: 'Chọn món từ danh mục' }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('#confirmButton')).toHaveCount(0);

  await page.getByLabel('Tìm món ăn theo tên').fill('pho');
  await page.getByRole('group', { name: 'Danh mục 30 món Việt' }).getByRole('button', { name: 'Phở', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page).toHaveURL(/assistant\.html$/);
  await expect(page.getByRole('button', { name: `Xem công thức ${summary.title}` })).toBeVisible();
});

test('blurry and low-confidence upload errors allow continuing via the 30-dish catalog', async ({ page }) => {
  for (const code of ['IMAGE_BLURRY', 'LOW_CONFIDENCE_PREDICTION'] as const) {
    await page.route('**/api/vision/predict', route => route.fulfill({ status: 422, ...json({ code }) }));
    await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
    await page.route('**/api/recipes/search', async route => {
      expect(route.request().postDataJSON()).toEqual({ confirmed_dish: 'pho', top_k: 3 });
      await route.fulfill(json({ confirmed_dish: 'pho', recipes: [summary] }));
    });

    await upload(page);
    await page.locator('#predictBtn').click();
    const catalogBtn = page.getByRole('button', { name: 'Chọn món từ danh mục' });
    await expect(catalogBtn).toBeVisible();
    await catalogBtn.click();

    await expect(page).toHaveURL(/recipe\.html$/);
    await page.getByLabel('Tìm món ăn theo tên').fill('pho');
    await page.getByRole('group', { name: 'Danh mục 30 món Việt' }).getByRole('button', { name: 'Phở', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận món' }).click();
    await expect(page.getByRole('button', { name: `Xem công thức ${summary.title}` })).toBeVisible();
  }
});

test('recognition page without an image allows choosing a dish directly from the catalog', async ({ page }) => {
  const banhDucSummary = { ...summary, id: 'test_banh_duc', title: 'Bánh đúc · fixture kiểm thử', normalized_dish: 'banh_duc' };
  await page.route('**/api/dishes', route => route.fulfill(json({ dishes: taxonomy })));
  await page.route('**/api/recipes/search', async route => {
    expect(route.request().postDataJSON()).toEqual({ confirmed_dish: 'banh_duc', top_k: 3 });
    await route.fulfill(json({ confirmed_dish: 'banh_duc', recipes: [banhDucSummary] }));
  });

  await page.goto('/recognition.html');
  await expect(page.getByRole('heading', { name: 'Chưa có kết quả nhận diện' })).toBeVisible();
  await page.getByRole('button', { name: 'Chọn món từ danh mục' }).click();
  await page.getByLabel('Tìm món ăn theo tên').fill('banh duc');
  await page.getByRole('group', { name: 'Danh mục 30 món Việt' }).getByRole('button', { name: 'Bánh đúc', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận món' }).click();
  await expect(page).toHaveURL(/assistant\.html$/);
  await expect(page.getByRole('button', { name: `Xem công thức ${banhDucSummary.title}` })).toBeVisible();
});

test('navigating from a scrolled upload page to recognition starts below the sticky header', async ({ page }) => {
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions })));
  await upload(page);
  await page.locator('#predictBtn').scrollIntoViewIfNeeded();
  await page.locator('#predictBtn').click();
  await expect(page).toHaveURL(/recognition\.html$/);
  await expect(page.locator('.recognition-photo')).toBeVisible();
  const positions = await page.evaluate(() => {
    const header = document.querySelector('.header')!.getBoundingClientRect();
    const title = document.querySelector('#recognition-title')!.getBoundingClientRect();
    const photo = document.querySelector('.recognition-photo')!.getBoundingClientRect();
    return { scrollY: window.scrollY, headerBottom: header.bottom, titleTop: title.top, photoTop: photo.top };
  });
  expect(positions.scrollY).toBe(0);
  expect(positions.titleTop).toBeGreaterThanOrEqual(positions.headerBottom);
  expect(positions.photoTop).toBeGreaterThanOrEqual(positions.headerBottom);
});
