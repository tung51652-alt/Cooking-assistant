import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionPointerStore } from './session-pointer.ts';

const gateway = 'https://cooklens.example/api';
const first = { gateway, sessionId: '11111111-1111-4111-8111-111111111111' };
const second = { gateway, sessionId: '22222222-2222-4222-8222-222222222222' };

function fixture() {
  let value = null;
  return {
    getItemAsync: async () => value,
    setItemAsync: async (_key, next) => { value = next; },
    deleteItemAsync: async () => { value = null; },
  };
}

test('restores only a valid pointer for the configured gateway', async () => {
  const storage = fixture();
  const store = createSessionPointerStore(storage);
  await store.write({ ...first, gateway: gateway + '/' });
  assert.deepEqual(await store.read(gateway), first);
  assert.equal(await store.read('https://other.example/api'), null);
  assert.equal(await store.read('/api'), null);
  for (const value of ['{', JSON.stringify({ ...first, sessionId: 'invalid' })]) {
    await storage.setItemAsync('', value);
    assert.equal(await store.read(gateway), null);
  }
});

test('late cleanup cannot remove a newer pointer', async () => {
  const storage = fixture();
  const store = createSessionPointerStore(storage);
  const write = storage.setItemAsync;
  const delayed = Promise.withResolvers();
  storage.setItemAsync = async (key, value) => {
    if (value.includes(first.sessionId)) await delayed.promise;
    await write(key, value);
  };
  const writes = [store.write(first), store.write(second), store.clear(gateway, first.sessionId)];
  delayed.resolve();
  await Promise.all(writes);
  assert.deepEqual(await store.read(gateway), second);
  await store.clear(gateway, second.sessionId);
  assert.equal(await store.read(gateway), null);
});

test('reports storage failures and keeps the queue usable', async () => {
  const storage = fixture();
  const store = createSessionPointerStore(storage);
  const write = storage.setItemAsync;
  storage.setItemAsync = async () => { throw Error('storage unavailable'); };
  await assert.rejects(store.write(first), /storage unavailable/);
  storage.setItemAsync = write;
  await store.write(second);
  storage.getItemAsync = async () => { throw Error('storage unavailable'); };
  await assert.rejects(store.read(gateway), /storage unavailable/);
});
