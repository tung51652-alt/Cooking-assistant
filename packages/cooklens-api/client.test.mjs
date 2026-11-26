import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createApi, normalizeBaseUrl, recipeSourceHref } from './index.ts';

const requestId = () => '11111111-1111-4111-8111-111111111111';
const taxonomy = JSON.parse(readFileSync(new URL('../../data/processed/30vnfoods-label-map.json', import.meta.url)));
const corpus = JSON.parse(readFileSync(new URL('../../data/recipes/corpus.json', import.meta.url)));
const api = createApi('http://localhost:8080/api', requestId);
const envelope = value => ({ api_version: '1.0.0', request_id: requestId(), ...value });
function response(data, status = 200) {
  return new Response(JSON.stringify(envelope(data)), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId() } });
}

test('recipe source links allow recipe pages and suppress GitHub pull requests', () => {
  const { source } = corpus.find(recipe => new URL(recipe.source.url).hostname === 'vi.wikibooks.org');
  assert.equal(recipeSourceHref(source.url), new URL(source.url).href);
  const credentialed = new URL('https://example.com/recipe');
  credentialed.username = 'name';
  credentialed.password = 'password';
  for (const url of [
    'https://github.com/owner/recipes/pull/10',
    'https://github.com/owner/recipes/pull/10/files#diff',
    credentialed.href,
    'javascript:alert(1)',
    '/recipe',
  ]) {
    assert.equal(recipeSourceHref(url), null, url);
  }
});

const sessionId='22222222-2222-4222-8222-222222222222';
const startOperation='33333333-3333-4333-8333-333333333333';
const nextOperation='44444444-4444-4444-8444-444444444444';
function chatSession() {
  const recipe=corpus.find(item => item.instructions.length>=2);
  const timestamp='2026-11-22T00:00:00Z';
  return { id: sessionId, corpus_version: 'test-corpus', recipe_version: recipe.updated_at, recipe,
    status: 'cooking', current_step: 2, total_steps: recipe.instructions.length, version: 3,
    created_at: timestamp, updated_at: timestamp, expires_at: '2026-11-23T00:00:00Z',
    history: [
      { operation_id: startOperation, action: 'start', version: 1, current_step: 1, created_at: timestamp },
      { operation_id: nextOperation, action: 'next', version: 3, current_step: 2, created_at: timestamp },
    ], messages: [{ role: 'user', text: 'Giải thích bước này' }, { role: 'assistant', text: 'Theo công thức…' }] };
}

test('assistant accepts mixed chat/action revisions, canonicalizes IDs and preserves retry payload', async t => {
  const value=chatSession();
  const operation='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  t.mock.method(globalThis,'fetch',async (url, init) => {
    assert.equal(url,`http://localhost:8080/api/assistant/sessions/${sessionId}/messages`);
    assert.deepEqual(JSON.parse(init.body),{ text:'Giải thích bước này', expected_version:1, operation_id:operation.toLowerCase() });
    return response({ session:value });
  });
  const result=await api.sessionMessage(sessionId.toUpperCase(),{ text:'Giải thích bước này', expected_version:1, operation_id:operation },new AbortController().signal);
  assert.deepEqual(result,value);
});

test('assistant rejects broken message pairs, impossible revisions and invalid cooking history', async t => {
  let value=chatSession();
  t.mock.method(globalThis,'fetch',async () => response({ session:value }));
  const mutations=[
    s => { s.messages.pop(); },
    s => { s.messages.reverse(); },
    s => { s.messages[1].text=' '; },
    s => { s.messages[0].text='x'.repeat(2001); },
    s => { s.messages=Array.from({length:31},()=>s.messages).flat(); s.version=33; },
    s => { s.version=4; },
    s => { s.history[1].version=1; },
    s => { s.history.reverse(); },
    s => { s.history[1].operation_id=s.history[0].operation_id; },
    s => { s.history[1].current_step=1; },
    s => { s.history[0].action='next'; },
    s => { s.history[1].action='finish'; s.status='finished'; s.version=4; s.messages.push(...s.messages); },
  ];
  for (const mutate of mutations) {
    value=structuredClone(chatSession()); mutate(value);
    await assert.rejects(api.getSession(sessionId,new AbortController().signal));
  }
});

test('assistant rejects wrong session and stale successful replies', async t => {
  let value=chatSession();
  t.mock.method(globalThis,'fetch',async () => response({ session:value }));
  await assert.rejects(api.getSession(sessionId,new AbortController().signal,4));
  value.id=startOperation;
  await assert.rejects(api.getSession(sessionId,new AbortController().signal));
});

test('assistant still accepts legacy action-only sessions', async t => {
  const value=chatSession();
  value.messages=[]; value.version=2; value.history[1].version=2;
  t.mock.method(globalThis,'fetch',async () => response({ session:value }));
  assert.deepEqual(await api.getSession(sessionId,new AbortController().signal),value);
});

test('assistant persistence errors retain their machine-readable code', async t => {
  for (const [status,code] of [[409,'ASSISTANT_REQUEST_IN_PROGRESS'],[409,'SESSION_MESSAGE_LIMIT'],[503,'ASSISTANT_OUTCOME_UNKNOWN'],[504,'ASSISTANT_PROVIDER_TIMEOUT'],
    [503,'ASSISTANT_PROVIDER_AUTH_FAILED'],[503,'ASSISTANT_PROVIDER_UNSUPPORTED'],[429,'ASSISTANT_RATE_LIMITED'],[503,'ASSISTANT_BUDGET_EXCEEDED'],[422,'ASSISTANT_CONTEXT_TOO_LARGE']]) {
    t.mock.method(globalThis,'fetch',async () => response({ code, message:'Không lộ nội dung provider' },status));
    await assert.rejects(api.getSession(sessionId,new AbortController().signal),error => error.code===code && error.status===status);
  }
});

test('absolute gateway URL rejects credentials, query strings and non-API paths', () => {
  assert.equal(normalizeBaseUrl('http://localhost:8080/api/'), 'http://localhost:8080/api');
  assert.equal(normalizeBaseUrl('/api'), '/api');
  const credentialUrl = new URL('http://localhost/api'); credentialUrl.username = 'name'; credentialUrl.password = 'password';
  for (const url of [credentialUrl.href, 'file:///api', 'http://localhost/api?key=x', 'http://localhost/vision']) {
    assert.throws(() => normalizeBaseUrl(url));
  }
});
test('canonical taxonomy is accepted and duplicate catalog data is rejected', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ taxonomy_version: '1.0.0', dishes: taxonomy.labels }));
  assert.equal((await api.getDishes(new AbortController().signal)).length, 30);
  globalThis.fetch = async () => response({ taxonomy_version: '1.0.0', dishes: Array(30).fill(taxonomy.labels[0]) });
  await assert.rejects(api.getDishes(new AbortController().signal));
});
test('real recipe schema is accepted; a response from a different dish is rejected', async t => {
  const recipe = corpus[0];
  t.mock.method(globalThis, 'fetch', async () => response({ corpus_version: 'cooklens-recipes-v1', recipe }));
  assert.equal((await api.getRecipe(recipe.id, recipe.normalized_dish, new AbortController().signal)).id, recipe.id);
  await assert.rejects(api.getRecipe(recipe.id, 'different_dish', new AbortController().signal));
});
test('request ID and API version mismatches are rejected', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ api_version: 'unsupported', taxonomy_version: '1.0.0', dishes: taxonomy.labels }));
  await assert.rejects(api.getDishes(new AbortController().signal));
  globalThis.fetch = async () => new Response(JSON.stringify(envelope({ taxonomy_version: '1.0.0', dishes: taxonomy.labels })), { headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'mismatch' } });
  await assert.rejects(api.getDishes(new AbortController().signal));
});
test('cancellation rejects a late response even when the transport ignores abort', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { controller.abort(); return response({ taxonomy_version: '1.0.0', dishes: taxonomy.labels }); });
  await assert.rejects(api.getDishes(controller.signal), error => error.name === 'AbortError');
});
test('network and unavailable errors produce user-facing messages', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('transport failed'); });
  await assert.rejects(api.getDishes(new AbortController().signal), /kiểm tra kết nối/);
  globalThis.fetch = async () => response({}, 503);
  await assert.rejects(api.getDishes(new AbortController().signal), /chưa sẵn sàng/);
});

// React Native preserves URI parts; Node's FormData converts them to strings.
class NativeBody extends FormData {
  constructor(parts) { super(); this.parts = parts; }
  getAll(name) { return name === 'file' ? this.parts : super.getAll(name); }
}
const predictionResponse = () => response({
  model_version: 'test-model', taxonomy_version: taxonomy.taxonomy_version,
  predictions: taxonomy.labels.slice(0, 3).map((label, index) => ({ ...label, rank: index + 1, confidence: .5 - index * .2 })),
});

test('native image transport preserves file, request ID and response validation; other requests use fetch', async t => {
  const file = { uri: 'file:///cache/food.jpg', name: 'food.jpg', type: 'image/jpeg' };
  const uploader = t.mock.fn(async (url, part, id, signal) => {
    assert.equal(url, 'http://localhost:8080/api/vision/predict');
    assert.equal(part, file);
    assert.equal(id, requestId());
    assert.equal(signal.aborted, false);
    return predictionResponse();
  });
  const fetch = t.mock.method(globalThis, 'fetch', async () => response({ taxonomy_version: '1.0.0', dishes: taxonomy.labels }));
  const nativeApi = createApi('http://localhost:8080/api', requestId, uploader);
  assert.equal((await nativeApi.predict(new NativeBody([file]), new AbortController().signal)).length, 3);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal((await nativeApi.getDishes(new AbortController().signal)).length, 30);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(uploader.mock.callCount(), 1);
});

test('native image cancellation reaches the uploader and rejects a late success', async () => {
  const controller = new AbortController();
  const nativeApi = createApi('http://localhost:8080/api', requestId, async (_url, _file, _id, signal) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    return predictionResponse();
  });
  await assert.rejects(nativeApi.predict(new NativeBody([{ uri: 'file:///cache/food.jpg' }]), controller.signal), error => error.name === 'AbortError');
});

test('native image upload maps HTTP failures and rejects invalid URI parts before upload', async t => {
  const uploader = t.mock.fn(async () => response({}, 503));
  const nativeApi = createApi('http://localhost:8080/api', requestId, uploader);
  await assert.rejects(nativeApi.predict(new NativeBody([{ uri: 'file:///cache/food.jpg' }]), new AbortController().signal), /chưa sẵn sàng/);
  for (const parts of [[], [{ uri: '' }], [{ uri: 1 }], [{ uri: 'file:///cache/food.jpg' }, { uri: 'file:///cache/other.jpg' }]]) {
    await assert.rejects(nativeApi.predict(new NativeBody(parts), new AbortController().signal), /đúng định dạng/);
  }
  assert.equal(uploader.mock.callCount(), 1);
});
