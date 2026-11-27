import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LLM_CONFIG_STORAGE_KEY,
  LLM_PRESETS,
  createLlmConfigStore,
  formatLlmBadge,
  isProviderPreset,
  normalizeLlmConfig,
  validateApiKey,
  validateBaseUrl,
  validateModelName,
} from './llm-config.ts';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItemAsync: async key => (map.has(key) ? map.get(key) : null),
    setItemAsync: async (key, value) => { map.set(key, value); },
    deleteItemAsync: async key => { map.delete(key); },
  };
}

test('presets and provider guard cover gemini, openai, nvidia, and custom', () => {
  for (const id of ['gemini', 'openai', 'nvidia', 'custom']) {
    assert.equal(isProviderPreset(id), true);
    assert.equal(LLM_PRESETS[id].id, id);
  }
  assert.equal(isProviderPreset('other'), false);
  assert.equal(isProviderPreset(null), false);
});

test('validateApiKey checks required format, length, ASCII, and prefix warning', () => {
  assert.equal(validateApiKey('gemini', '').valid, false);
  assert.equal(validateApiKey('gemini', '   ').valid, false);
  assert.equal(validateApiKey('gemini', 'AIza short').valid, false);
  assert.equal(validateApiKey('gemini', 'AIza123').valid, false);
  assert.equal(validateApiKey('gemini', 'khóa-không-ascii').valid, false);

  const geminiOk = validateApiKey('gemini', 'AIzaTestKey123');
  assert.equal(geminiOk.valid, true);
  assert.equal(geminiOk.warning, undefined);

  const geminiWarn = validateApiKey('gemini', 'other-key-1234');
  assert.equal(geminiWarn.valid, true);
  assert.ok(geminiWarn.warning?.includes('AIza'));

  const customOk = validateApiKey('custom', 'custom-key-1234');
  assert.equal(customOk.valid, true);
  assert.equal(customOk.warning, undefined);
});

test('validateModelName accepts valid model identifiers and rejects invalid ones', () => {
  assert.equal(validateModelName('').valid, false);
  assert.equal(validateModelName('   ').valid, false);
  assert.equal(validateModelName('-invalid').valid, false);
  assert.equal(validateModelName('model with space').valid, false);
  assert.equal(validateModelName('gemini-2.5-flash').valid, true);
  assert.equal(validateModelName('meta/llama-3.1-8b-instruct').valid, true);
  assert.equal(validateModelName('qwen:2.5_72b').valid, true);
});

test('validateBaseUrl requires public HTTPS and valid OpenAI-compatible path for custom', () => {
  assert.equal(validateBaseUrl('gemini', '').valid, true);
  assert.equal(validateBaseUrl('openai', 'ignored').valid, true);

  assert.equal(validateBaseUrl('custom', '').valid, false);
  assert.equal(validateBaseUrl('custom', 'not-a-url').valid, false);
  assert.equal(validateBaseUrl('custom', 'http://example.com/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'http://localhost:8080/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'http://127.0.0.1:11434/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://localhost/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://127.0.0.1/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://10.255.255.1/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://169.254.169.254/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://192.168.1.10/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://100.64.0.1/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://[::1]/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://[::ffff:127.0.0.1]/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://api.internal/v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com/api').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com/v1?x=1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com/v1#frag').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com/../v1').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com/%761').valid, false);
  assert.equal(validateBaseUrl('custom', 'https://example.com//v1').valid, false);
  const urlWithAuth = 'https://' + 'demo' + ':' + 'secret' + '@example.com/v1';
  assert.equal(validateBaseUrl('custom', urlWithAuth).valid, false);

  assert.equal(validateBaseUrl('custom', 'https://llm.example.com/v1').valid, true);
  assert.equal(validateBaseUrl('custom', 'https://llm.example.com/proxy/v1/').valid, true);
  assert.equal(validateBaseUrl('custom', 'https://llm.example.com/v1beta/openai').valid, true);
  assert.equal(validateBaseUrl('custom', 'https://llm.example.com/openai').valid, true);
});

test('normalizeLlmConfig enforces preset base_url and trims model', () => {
  const normalized = normalizeLlmConfig({
    provider: 'openai',
    base_url: 'https://evil.example/v1',
    model: '  gpt-4o-mini  ',
    api_key: 'sk-test-key-123',
  });
  assert.deepEqual(normalized, {
    provider: 'openai',
    base_url: LLM_PRESETS.openai.baseUrl,
    model: 'gpt-4o-mini',
    api_key: 'sk-test-key-123',
  });
  assert.equal(formatLlmBadge(normalized), 'OpenAI · gpt-4o-mini');
  assert.equal(normalizeLlmConfig({ provider: 'custom', base_url: 'http://remote.example/v1', model: 'm', api_key: 'custom-key-1234' }), null);
});

test('createLlmConfigStore saves, loads, clears, and rejects invalid configs', async () => {
  const storage = memoryStorage();
  const store = createLlmConfigStore(storage);

  assert.equal(await store.read(), null);

  const saved = await store.write({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    api_key: 'AIzaTestKey123',
  });
  assert.equal(saved, true);
  assert.ok(storage.map.has(LLM_CONFIG_STORAGE_KEY));
  assert.deepEqual(await store.read(), {
    provider: 'gemini',
    base_url: LLM_PRESETS.gemini.baseUrl,
    model: 'gemini-2.5-flash',
    api_key: 'AIzaTestKey123',
  });

  const invalidWrite = await store.write({
    provider: 'custom',
    base_url: 'http://example.com/v1',
    model: 'my-model',
    api_key: 'custom-key-1234',
  });
  assert.equal(invalidWrite, false);

  assert.equal(await store.clear(), true);
  assert.equal(await store.read(), null);
});

test('createLlmConfigStore handles corrupt payloads and storage errors without throwing', async () => {
  const storage = memoryStorage();
  const store = createLlmConfigStore(storage);

  storage.map.set(LLM_CONFIG_STORAGE_KEY, '{not-json');
  assert.equal(await store.read(), null);

  storage.map.set(LLM_CONFIG_STORAGE_KEY, JSON.stringify({ provider: 'openai', model: '', api_key: 'short' }));
  assert.equal(await store.read(), null);

  const failingStorage = {
    getItemAsync: async () => { throw new Error('secure store locked'); },
    setItemAsync: async () => { throw new Error('secure store full'); },
    deleteItemAsync: async () => { throw new Error('secure store error'); },
  };
  const failingStore = createLlmConfigStore(failingStorage);
  assert.equal(await failingStore.read(), null);
  assert.equal(await failingStore.write({
    provider: 'nvidia',
    model: 'meta/llama-3.1-8b-instruct',
    api_key: 'nvapi-test-123',
  }), false);
  assert.equal(await failingStore.clear(), false);
});

test('createLlmConfigStore serializes concurrent write and clear calls', async () => {
  const storage = memoryStorage();
  const store = createLlmConfigStore(storage);
  const originalSet = storage.setItemAsync;
  const gate = Promise.withResolvers();
  storage.setItemAsync = async (key, value) => {
    if (value.includes('first-model')) await gate.promise;
    await originalSet(key, value);
  };

  const first = store.write({
    provider: 'custom',
    base_url: 'https://llm.example.com/v1',
    model: 'first-model',
    api_key: 'custom-key-1234',
  });
  const second = store.write({
    provider: 'custom',
    base_url: 'https://llm.example.com/v1',
    model: 'second-model',
    api_key: 'custom-key-5678',
  });
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal((await store.read())?.model, 'second-model');
});
