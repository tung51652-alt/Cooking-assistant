// Assistant transport fixtures stay in tests, never in the shipped application.
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const storage = 'cooklens.assistant.session';
const date = '2026-11-22T10:00:00Z';
const recipe = {
  id: 'test_pho', title: 'Phở bò · fixture trợ lý', normalized_dish: 'pho', language: 'vi', cuisine: 'vietnamese',
  servings: null, prep_time_minutes: null, cook_time_minutes: null, tags: ['test-only'], created_at: date, updated_at: date,
  source: { name: 'Nguồn kiểm thử', url: 'https://example.com/recipe', license: 'test-only', attribution: 'Fixture', retrieved_at: '2026-11-22', revision_url: null, modifications: 'Test only' },
  ingredients: [{ name: 'Nguyên liệu kiểm thử', normalized_name: 'fixture', quantity: 200, unit: 'g', optional: false, note: null }],
  instructions: [1, 2, 3].map(step => ({ step, text: `Hướng dẫn kiểm thử bước ${step}.`, duration_minutes: null })),
};
function initial() {
  return { id: randomUUID(), corpus_version: 'test-corpus', recipe_version: date, recipe, version: 0,
    status: 'ready', current_step: 0, total_steps: 3, created_at: date, updated_at: date, expires_at: '2026-11-23T10:00:00Z',
    history: [] as { action: string; operation_id: string; version: number; current_step: number; created_at: string }[],
    messages: [] as { role: string; text: string }[] };
}
type Session = ReturnType<typeof initial>;
function action(value: Session, name: string, operation = randomUUID()) {
  value.version++;
  if (name === 'start') { value.status = 'cooking'; value.current_step = 1; }
  if (name === 'next') value.current_step++;
  if (name === 'previous') value.current_step--;
  if (name === 'finish') value.status = 'finished';
  value.history.push({ action: name, operation_id: operation, version: value.version, current_step: value.current_step, created_at: date });
}
function message(value: Session, text: string, answer = 'Theo công thức: dùng 200 g nguyên liệu kiểm thử.') {
  value.version++; value.messages.push({ role: 'user', text }, { role: 'assistant', text: answer });
}
function json(data: object, status = 200) {
  const id = randomUUID();
  return { status, contentType: 'application/json', headers: { 'X-Request-ID': id }, body: JSON.stringify({
    api_version: '1.0.0', request_id: id, corpus_version: 'test-corpus', ...data,
  }) };
}
async function restored(page: Page, state = initial()) {
  await page.addInitScript(({ key, id, recipeId }) => localStorage.setItem(key, JSON.stringify({ id, recipeId })),
    { key: storage, id: state.id, recipeId: state.recipe.id });
  await page.route('**/api/assistant/sessions/*', route => route.fulfill(json({ session: state })));
  return state;
}
async function open(page: Page) {
  await page.goto('/assistant.html');
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible();
}
const question = (page: Page) => page.getByLabel('Câu hỏi về công thức', { exact: true });

test('restores, cooks through all controls, chats, reloads and finishes', async ({ page }) => {
  const state = await restored(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/assistant/sessions/*/actions', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    expect(body.expected_version).toBe(state.version); action(state, body.action, body.operation_id);
    await route.fulfill(json({ session: state }));
  });
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    expect(body.expected_version).toBe(state.version); message(state, body.text);
    await route.fulfill(json({ session: state }));
  });
  await open(page);
  await page.getByRole('button', { name: 'Bắt đầu nấu', exact: true }).click();
  await expect(page.getByText('Bước 1/3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bước trước', exact: true })).toBeDisabled();
  await question(page).fill('Cần bao nhiêu nguyên liệu?'); await question(page).press('Enter');
  await expect(page.getByRole('log')).toContainText('200 g'); await expect(question(page)).toBeFocused();
  await page.getByRole('button', { name: 'Bước tiếp', exact: true }).click();
  await page.getByRole('button', { name: 'Nhắc lại', exact: true }).click();
  await page.getByRole('button', { name: 'Bước trước', exact: true }).click();
  await expect(page.getByText('Bước 1/3', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('log')).toContainText('Cần bao nhiêu nguyên liệu?');
  await expect(page.getByText('Bước 1/3', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storage)).toEqual({ id: state.id, recipeId: recipe.id });
  await page.getByRole('button', { name: 'Kết thúc nấu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã kết thúc phiên nấu' })).toBeVisible();
  await expect(question(page)).toBeDisabled();
  expect(new Set(bodies.map(b => b.operation_id)).size).toBe(bodies.length);
  await page.getByText('Xem công thức gốc', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Nguồn kiểm thử' })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('lost response retries only manually with the same operation and blocks double submit', async ({ page }) => {
  const state = await restored(page); const bodies: object[] = [];
  let first = true;
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (first) { first = false; message(state, body.text); await route.abort('failed'); }
    else await route.fulfill(json({ session: state }));
  });
  await open(page); await question(page).fill('Định lượng?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Thử lại yêu cầu' })).toBeVisible();
  expect(bodies).toHaveLength(1); await expect(question(page)).toHaveValue('Định lượng?');
  await page.getByRole('button', { name: 'Kiểm tra phiên' }).click();
  await expect(page.getByRole('log')).toContainText('200 g');
  await expect(question(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Thử lại yêu cầu' }).click();
  await expect(question(page)).toHaveValue(''); expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
  await expect(page.getByRole('article')).toHaveCount(2);
});

for (const code of ['ASSISTANT_NOT_CONFIGURED', 'ASSISTANT_PROVIDER_UNAVAILABLE', 'ASSISTANT_BUDGET_EXCEEDED']) {
  test(`${code} retains the draft and deterministic cooking still works`, async ({ page }) => {
    const state = await restored(page);
    await page.route('**/api/assistant/sessions/*/messages', route => route.fulfill(json({ code }, 503)));
    await page.route('**/api/assistant/sessions/*/actions', route => {
      const body = route.request().postDataJSON(); action(state, body.action, body.operation_id); return route.fulfill(json({ session: state }));
    });
    await open(page);
    await question(page).scrollIntoViewIfNeeded();
    await question(page).fill('Giữ câu hỏi này'); await question(page).press('Enter');
    const inlineAlert = page.locator('.assistant-conversation').getByRole('alert');
    await expect(inlineAlert).toBeVisible();
    await expect(inlineAlert).toBeInViewport();
    await expect(question(page)).toHaveValue('Giữ câu hỏi này');
    await expect(page.getByRole('button', { name: 'Thử lại yêu cầu' })).toHaveCount(0);
    if (code === 'ASSISTANT_PROVIDER_UNAVAILABLE') await expect(page.getByRole('button', { name: 'Gửi lại câu hỏi' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Gửi lại câu hỏi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Bắt đầu nấu', exact: true }).click();
    await expect(page.getByText('Bước 1/3', { exact: true })).toBeVisible();
  });
}

test('provider unavailable offers resend with a fresh operation ID and clears draft on success', async ({ page }) => {
  const state = await restored(page);
  const bodies: { text: string; operation_id: string }[] = [];
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (bodies.length === 1) return route.fulfill(json({ code: 'ASSISTANT_PROVIDER_UNAVAILABLE' }, 503));
    message(state, body.text);
    return route.fulfill(json({ session: state }));
  });
  await open(page); await question(page).fill('Hỏi lại sau 503'); await question(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Gửi lại câu hỏi' })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi lại câu hỏi' }).click();
  await expect(page.getByRole('log')).toContainText('200 g');
  await expect(question(page)).toHaveValue('');
  expect(bodies).toHaveLength(2);
  expect(bodies[1].text).toBe('Hỏi lại sau 503');
  expect(bodies[1].operation_id).not.toBe(bodies[0].operation_id);
});

test('version conflict refreshes server state and preserves unsent text', async ({ page }) => {
  const state = await restored(page);
  await page.route('**/api/assistant/sessions/*/messages', route => {
    action(state, 'start'); return route.fulfill(json({ code: 'SESSION_VERSION_CONFLICT' }, 409));
  });
  await open(page); await question(page).fill('Bước nào?'); await question(page).press('Enter');
  await expect(page.getByText('Bước 1/3', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Phiên đã được cập nhật');
  await expect(question(page)).toHaveValue('Bước nào?');
});

test('expired session has a truthful recovery route and no enabled chat', async ({ page }) => {
  await restored(page);
  await page.route('**/api/assistant/sessions/*', route => route.fulfill(json({ code: 'SESSION_EXPIRED' }, 410)));
  await page.goto('/assistant.html');
  await expect(page.getByRole('heading', { name: 'Phiên không còn khả dụng' })).toBeVisible();
  await expect(question(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Chọn công thức', exact: true }).click();
  await expect(page).toHaveURL(/recipe.html$/);
});

test('model HTML and dangerous links render as inert text', async ({ page }) => {
  const state = initial();
  const malicious = '<img src=x onerror="window.modelExecuted=true"><script>window.modelExecuted=true</script> [Mở](javascript:alert(1))';
  message(state, 'Kiểm tra hiển thị', malicious); await restored(page, state); await open(page);
  await expect(page.getByRole('log')).toContainText(malicious);
  await expect(page.getByRole('log').locator('img, script, a')).toHaveCount(0);
  expect(await page.evaluate(() => 'modelExecuted' in window)).toBe(false);
});

test('leaving during a pending reply ignores the stale response and restores server state', async ({ page }) => {
  const state = await restored(page); let release!: () => void; let started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    started(); await waiting; message(state, route.request().postDataJSON().text);
    try { await route.fulfill(json({ session: state })); } catch { /* Navigation aborts the transport. */ }
  });
  await open(page); await question(page).fill('Câu hỏi đang chờ'); await question(page).press('Enter'); await pending;
  await page.getByRole('link', { name: 'Trang chủ', exact: true }).click(); release();
  await expect(page.getByRole('heading', { name: 'Chụp món ngon. Tìm cách nấu.' })).toBeVisible();
  await expect(page.getByRole('log')).toHaveCount(0);
  await expect.poll(() => state.messages.length).toBe(2);
  await page.getByRole('link', { name: 'Trợ lý', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Câu hỏi đang chờ');
});

test('wrong session response is rejected', async ({ page }) => {
  const state = await restored(page);
  await page.route('**/api/assistant/sessions/*', route => route.fulfill(json({ session: { ...state, id: randomUUID() } })));
  await page.goto('/assistant.html'); await expect(page.getByRole('alert')).toContainText('đúng định dạng');
  await expect(page.getByRole('heading', { name: recipe.title })).toHaveCount(0);
});

test('chat quota disables questions while leaving cooking controls available', async ({ page }) => {
  const state = initial(); for (let i = 0; i < 30; i++) message(state, `Câu hỏi ${i}`);
  await restored(page, state); await open(page);
  await expect(question(page)).toBeDisabled(); await expect(page.getByText(/đạt giới hạn 30 lượt/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bắt đầu nấu', exact: true })).toBeEnabled();
});

test('recipe entry creates the chosen snapshot, then selecting another recipe creates an isolated session', async ({ page }) => {
  const other = { ...recipe, id: 'test_pho_other', title: 'Phở khác · fixture trợ lý' };
  const recipes = [recipe, other]; const creates: Record<string, string>[] = [];
  let current = initial(); const sessions = new Map<string, Session>();
  await page.route('**/api/vision/predict', route => route.fulfill(json({ predictions: [
    { rank: 1, class_id: 28, normalized_dish: 'pho', display_name: 'Phở', confidence: .8 },
    { rank: 2, class_id: 14, normalized_dish: 'bun_bo_hue', display_name: 'Bún bò Huế', confidence: .1 },
    { rank: 3, class_id: 3, normalized_dish: 'banh_canh', display_name: 'Bánh canh', confidence: .05 },
  ], model_version: 'test-model', taxonomy_version: '1.0.0' })));
  await page.route('**/api/recipes/search', route => route.fulfill(json({ confirmed_dish: 'pho', taxonomy_version: '1.0.0', embedding_version: 'test-embedding', recipes: recipes.map((r, i) => ({ ...r, rank: i + 1, retrieval_score: .8 - i * .1, preview: 'Fixture' })) })));
  for (const r of recipes) await page.route(`**/api/recipes/${r.id}`, route => route.fulfill(json({ recipe: r })));
  await page.route('**/api/assistant/sessions', route => {
    const body = route.request().postDataJSON(); creates.push(body);
    const existing = sessions.get(body.operation_id);
    if (existing) current = existing;
    else { current = { ...initial(), recipe: recipes.find(r => r.id === body.recipe_id)! }; sessions.set(body.operation_id, current); }
    return route.fulfill(json({ session: current }));
  });
  await page.route('**/api/assistant/sessions/*', route => route.fulfill(json({ session: current })));
  await page.goto('/');
  await page.locator('#imageInput').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQTPf6DwADUQHSSaoLLQAAAABJRU5ErkJggg==', 'base64') });
  await page.locator('#predictBtn').click(); await page.getByRole('radio').first().check(); await page.locator('#confirmButton').click();
  await page.getByRole('button', { name: `Xem công thức ${recipe.title}` }).click();
  await page.getByRole('button', { name: 'Hỏi CookLens & bắt đầu nấu' }).click();
  await expect(page.getByRole('heading', { name: recipe.title })).toBeVisible(); const original = current.id;
  expect(creates[0].corpus_version).toBe('test-corpus'); expect(creates[0].recipe_id).toBe(recipe.id);
  await page.getByRole('button', { name: '← Chọn công thức khác' }).click();
  await page.getByRole('button', { name: '← Danh sách công thức' }).click();
  await page.getByRole('button', { name: `Xem công thức ${other.title}` }).click();
  await page.getByRole('button', { name: 'Hỏi CookLens & bắt đầu nấu' }).click();
  await expect(page.getByRole('heading', { name: other.title })).toBeVisible(); expect(current.id).not.toBe(original);
  expect(current.messages).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('LLM settings modal validates inputs, tests hello, saves to localStorage, sends BYOK headers and clears', async ({ page }, testInfo) => {
  const state = await restored(page);
  const sentHeaders: Record<string, string>[] = [];
  await page.route('**/api/assistant/llm/test', async route => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      provider: 'openai',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      api_key: 'sk-test-valid-12345',
    });
    await route.fulfill(json({ ok: true, provider: 'openai', model: 'gpt-4o-mini', reply: 'Hello! Tôi sẵn sàng hỗ trợ bạn nấu ăn.', latency_ms: 88 }));
  });
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    sentHeaders.push(route.request().headers());
    const body = route.request().postDataJSON();
    if (sentHeaders.length === 1) {
      await route.fulfill(json({ code: 'ASSISTANT_NOT_CONFIGURED' }, 503));
      return;
    }
    message(state, body.text);
    await route.fulfill(json({ session: state }));
  });

  await open(page);
  await expect(page.locator('.llm-status-badge')).toHaveCount(0);
  await expect(page.locator('.llm-nav-btn')).toHaveText('Cài đặt trợ lý');

  await page.locator('.llm-nav-btn').click();
  const defaultDialog = page.getByRole('dialog', { name: 'Cài đặt trợ lý' });
  await expect(defaultDialog).toBeVisible();
  await expect(defaultDialog).not.toContainText('BYOK');
  await expect(defaultDialog).not.toContainText('LLM');
  await expect(defaultDialog.getByRole('radio', { name: /Mặc định hệ thống/ })).toHaveAttribute('aria-checked', 'true');
  await expect(defaultDialog).toContainText('Hỏi đáp hoạt động khi máy chủ đã được cấu hình');
  await expect(defaultDialog).toContainText('vẫn có thể xem các bước nấu');
  await expect(defaultDialog).toContainText('liên hệ người quản lý hệ thống');
  await expect(defaultDialog.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  await expect(defaultDialog.getByRole('textbox', { name: /^Khóa API/ })).toHaveCount(0);
  await defaultDialog.getByRole('radio', { name: /Dùng khóa API riêng/ }).click();
  await expect(defaultDialog.getByRole('textbox', { name: /^Khóa API/ })).toBeVisible();
  await expect(defaultDialog).not.toContainText('HTTPS header');
  await expect(defaultDialog.getByRole('button', { name: /Cài đặt nâng cao/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(defaultDialog.getByLabel('Base URL (OpenAI-compatible)')).toHaveCount(0);
  await defaultDialog.getByRole('button', { name: 'Quay về mặc định' }).click();
  await expect(defaultDialog.getByRole('textbox', { name: /^Khóa API/ })).toHaveCount(0);
  await defaultDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(defaultDialog).toHaveCount(0);

  await question(page).fill('Mấy phút sôi?');
  await question(page).press('Enter');
  const notConfiguredAlert = page.getByRole('alert');
  await expect(notConfiguredAlert).toContainText('Máy chủ chưa bật tính năng hỏi đáp');
  await expect(notConfiguredAlert).toContainText('vẫn có thể xem các bước nấu');
  await expect(notConfiguredAlert).toContainText('Dùng khóa API riêng');
  await expect(notConfiguredAlert).toContainText('liên hệ người quản lý hệ thống');
  await notConfiguredAlert.getByRole('button', { name: 'Dùng khóa API riêng', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Cài đặt trợ lý' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Dùng khóa API riêng/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByLabel('Base URL (OpenAI-compatible)')).toHaveCount(0);

  await dialog.getByRole('radio', { name: /Nhà cung cấp tùy chỉnh/ }).click();
  await expect(dialog.getByRole('button', { name: /Cài đặt nâng cao/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByLabel('Base URL (OpenAI-compatible)')).toBeEditable();
  await dialog.getByLabel('Base URL (OpenAI-compatible)').fill('http://evil.example/api');
  await expect(dialog).toContainText('HTTPS');

  await dialog.getByRole('radio', { name: /OpenAI\s/ }).first().click();
  await expect(dialog.getByRole('button', { name: /Cài đặt nâng cao/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByLabel('Base URL (OpenAI-compatible)')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Cài đặt nâng cao/ }).click();
  await expect(dialog.getByRole('button', { name: /Cài đặt nâng cao/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByLabel('Base URL (OpenAI-compatible)')).toHaveValue('https://api.openai.com/v1');
  await expect(dialog).toContainText('HTTPS header');

  const keyInput = dialog.getByRole('textbox', { name: /^Khóa API/ });
  await keyInput.fill('bad key');
  await expect(dialog).toContainText('không được chứa khoảng trắng');
  await keyInput.fill('sk-test-valid-12345');
  await expect(dialog).toContainText('Định dạng API key hợp lệ');

  await dialog.getByRole('button', { name: 'Hiện khóa API' }).click();
  await expect(keyInput).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Ẩn khóa API' }).click();
  await expect(keyInput).toHaveAttribute('type', 'password');

  await dialog.getByRole('textbox', { name: 'Tên Model' }).fill('bad model!');
  await expect(dialog).toContainText('tối đa 200 ký tự');
  await dialog.getByRole('button', { name: 'gpt-4o-mini' }).click();
  await expect(dialog).toContainText('Tên model hợp lệ.');

  await dialog.getByRole('button', { name: 'Kiểm tra kết nối' }).click();
  await expect(dialog).toContainText('Kết nối thành công');
  await expect(dialog).toContainText('Hello! Tôi sẵn sàng hỗ trợ bạn nấu ăn.');
  if (process.env.COOKLENS_SCREENSHOT_DIR && testInfo.project.name === 'desktop') {
    await page.screenshot({ path: `${process.env.COOKLENS_SCREENSHOT_DIR}/llm-settings-hello-ok.png` });
  }

  await dialog.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.llm-status-badge')).toContainText('Khóa riêng: OpenAI · gpt-4o-mini');

  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByRole('log')).toContainText('Theo công thức');
  expect(sentHeaders[1]['x-llm-provider']).toBe('openai');
  expect(sentHeaders[1]['x-llm-base-url']).toBe('https://api.openai.com/v1');
  expect(sentHeaders[1]['x-llm-model']).toBe('gpt-4o-mini');
  expect(sentHeaders[1]['x-llm-api-key']).toBe('sk-test-valid-12345');

  await page.locator('.llm-nav-btn').click();
  await page.getByRole('button', { name: 'Quay về mặc định' }).click();
  await expect(page.locator('.llm-status-badge')).toHaveCount(0);
  await question(page).fill('Câu hỏi mặc định');
  await question(page).press('Enter');
  await expect(page.getByRole('log')).toContainText('Câu hỏi mặc định');
  expect(sentHeaders[2]['x-llm-api-key']).toBeUndefined();
});

test('LLM settings modal moves focus inside on open, traps Tab and Shift+Tab, and restores focus on Escape', async ({ page }) => {
  await page.goto('/');
  const opener = page.locator('.llm-nav-btn');
  await opener.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Cài đặt trợ lý' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('.llm-modal');
    return !!panel && panel.contains(document.activeElement);
  })).toBe(true);

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.querySelector('.llm-modal')?.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(() => !!document.querySelector('.llm-modal')?.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  await page.locator('.llm-modal').focus();
  await page.keyboard.press('Shift+Tab');
  const stayedInsideAfterPanelFocus = await page.evaluate(() => {
    const panel = document.querySelector('.llm-modal');
    const active = document.activeElement;
    return !!panel && panel.contains(active) && active !== panel;
  });
  expect(stayedInsideAfterPanelFocus).toBe(true);

  await dialog.getByRole('radio', { name: /Dùng khóa API riêng/ }).click();
  await dialog.getByRole('button', { name: /Cài đặt nâng cao/ }).click();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.querySelector('.llm-modal')?.contains(document.activeElement));
    expect(inside).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
