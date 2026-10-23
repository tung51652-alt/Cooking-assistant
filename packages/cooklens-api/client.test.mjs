import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createApi, normalizeBaseUrl } from './index.ts';

const requestId = () => '11111111-1111-4111-8111-111111111111';
const taxonomy = JSON.parse(readFileSync(new URL('../../data/processed/30vnfoods-label-map.json', import.meta.url)));
const corpus = JSON.parse(readFileSync(new URL('../../data/recipes/corpus.json', import.meta.url)));
const api = createApi('http://localhost:8080/api', requestId);
const envelope = value => ({ api_version: '1.0.0', request_id: requestId(), ...value });
function response(data, status = 200) {
  return new Response(JSON.stringify(envelope(data)), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId() } });
}

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
