import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApiError } from '../../../packages/cooklens-api/index.ts';
import { createCookingSessionController } from './session-controller.ts';

const gateway = 'https://cooklens.example/api';
const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const [recipe, otherRecipe] = JSON.parse(readFileSync(new URL('../../../data/recipes/corpus.json', import.meta.url)));
const document = { recipe, corpus_version: 'cooklens-recipes-v1' };
const state = (version = 0, extra = {}) => ({
  id, recipe, corpus_version: document.corpus_version, recipe_version: recipe.updated_at, status: version ? 'cooking' : 'ready',
  version, current_step: version ? 1 : 0, total_steps: recipe.instructions.length, history: [], messages: [],
  ...extra,
});

function fixture(overrides = {}, storeOverrides = {}, options = {}) {
  const calls = [];
  let pointer = null;
  let counter = 0;
  const api = {
    createSession: async body => { calls.push(['create', body]); return state(); },
    getSession: async (sessionId, _signal, version) => { calls.push(['get', sessionId, version]); return state(version); },
    sessionAction: async (_id, body) => { calls.push(['action', body]); return state(1); },
    ...overrides,
  };
  const store = {
    read: async () => pointer,
    write: async next => { pointer = next; },
    clear: async (_gateway, sessionId) => { if (pointer?.sessionId === sessionId) pointer = null; },
    ...storeOverrides,
  };
  const controller = createCookingSessionController({ api, store, gateway, operationId: () => 'operation-' + ++counter, ...options });
  return { controller, calls, store, pointer: () => pointer };
}

test('creates from recipe identity and accepts a replay that already started', async () => {
  let body;
  const { controller, pointer } = fixture({ createSession: async input => { body = input; return state(1); } });
  await controller.openRecipe(document);
  assert.deepEqual(body, { recipe_id: recipe.id, corpus_version: document.corpus_version, operation_id: 'operation-1' });
  assert.equal(controller.getSnapshot().session.version, 1);
  assert.deepEqual(pointer(), { gateway, sessionId: id });
});

test('selecting a recipe waits for the first send and preserves its typed draft', async () => {
  let sent;
  const { controller, calls } = fixture({
    sessionMessage: async (_id, body) => {
      sent = body;
      return state(1, { status: 'ready', current_step: 0, messages: [
        { role: 'user', text: body.text }, { role: 'assistant', text: 'Theo công thức.' },
      ] });
    },
  });
  await controller.prepareRecipe(document);
  assert.equal(controller.getSnapshot().session, null);
  assert.equal(controller.getSnapshot().canSend, true);
  assert.deepEqual(calls, []);
  controller.setDraft('Cần bao nhiêu đậu phụ?');
  await controller.sendMessage();
  assert.equal(calls[0][0], 'create');
  assert.equal(sent.text, 'Cần bao nhiêu đậu phụ?');
  assert.equal(controller.getSnapshot().draft, '');
});

test('rapid duplicate taps send one action and explicit retry reuses its exact body', async () => {
  const delayed = Promise.withResolvers();
  const bodies = [];
  const { controller } = fixture({ sessionAction: async (_id, body) => {
    bodies.push(body);
    return bodies.length === 1 ? delayed.promise : state(1);
  } });
  await controller.openRecipe(document);
  const request = controller.act('start');
  await controller.act('start');
  assert.equal(bodies.length, 1);
  delayed.reject(new ApiError('timeout'));
  await request;
  await controller.act('finish');
  assert.equal(bodies.length, 1);
  await controller.retry();
  assert.deepEqual(bodies, [bodies[0], bodies[0]]);
  assert.equal(controller.getSnapshot().session.version, 1);
});

test('conflict fetches once and a failed refresh blocks new actions until GET succeeds', async () => {
  const calls = [];
  let failRead = true;
  const { controller } = fixture({
    sessionAction: async () => {
      calls.push('POST');
      throw new ApiError('conflict', 409, 'SESSION_VERSION_CONFLICT');
    },
    getSession: async () => {
      calls.push('GET');
      if (failRead) throw new ApiError('offline');
      return state(2);
    },
  });
  await controller.openRecipe(document);
  await controller.act('start');
  assert.deepEqual(calls, ['POST', 'GET']);
  assert.equal(controller.getSnapshot().canAct, false);
  await controller.act('finish');
  failRead = false;
  await controller.retry();
  assert.deepEqual(calls, ['POST', 'GET', 'GET']);
  assert.equal(controller.getSnapshot().session.version, 2);
  assert.equal(controller.getSnapshot().canAct, true);
});

test('ignores a late create and rejects a stale foreground read', async () => {
  const delayed = Promise.withResolvers();
  const started = Promise.withResolvers();
  let signal;
  const { controller, pointer } = fixture({
    createSession: async (body, requestSignal) => {
      if (body.recipe_id === otherRecipe.id) return state(2, { id: otherId, recipe: otherRecipe });
      signal = requestSignal;
      started.resolve();
      return delayed.promise;
    },
    getSession: async () => state(1, { id: otherId, recipe: otherRecipe }),
  });
  const old = controller.openRecipe(document);
  await started.promise;
  controller.leave();
  assert.equal(signal.aborted, true);
  await controller.openRecipe({ ...document, recipe: otherRecipe });
  delayed.resolve(state());
  await old;
  await controller.foreground();
  assert.equal(controller.getSnapshot().session.id, otherId);
  assert.equal(controller.getSnapshot().session.version, 2);
  assert.equal(pointer().sessionId, otherId);
});

test('resume reads the server snapshot and clears only an expired or missing pointer', async () => {
  let response = state(1, { corpus_version: 'older-corpus' });
  const reads = [];
  const { controller, store, pointer, calls } = fixture({ getSession: async sessionId => {
    reads.push(sessionId);
    if (response instanceof Error) throw response;
    return response;
  } });
  await store.write({ gateway, sessionId: id });
  await controller.resume();
  assert.equal(controller.getSnapshot().session.corpus_version, 'older-corpus');
  controller.leave();
  response = new ApiError('offline', 503, 'ASSISTANT_STORAGE_UNAVAILABLE');
  await controller.resume();
  assert.equal(pointer().sessionId, id);
  response = new ApiError('expired', 410, 'SESSION_EXPIRED');
  await controller.retry();
  assert.equal(pointer(), null);
  assert.equal(controller.getSnapshot().session, null);
  assert.deepEqual(reads, [id, id, id]);
  assert.deepEqual(calls, []);
});

test('an unrecognized gateway 404 cannot clear or replace a valid session pointer', async () => {
  const { controller, calls, store, pointer } = fixture({ getSession: async () => { throw new ApiError('gateway', 404); } });
  await store.write({ gateway, sessionId: id });
  await controller.resume();
  assert.equal(pointer().sessionId, id);
  assert.equal(controller.getSnapshot().error.retryable, true);
  controller.leave();
  await controller.openRecipe(document);
  assert.equal(pointer().sessionId, id);
  assert.deepEqual(calls, []);
});

test('foreground restarts an interrupted initial restore by GET without submitting writes', async () => {
  for (const open of [controller => controller.resume(), controller => controller.openRecipe(document)]) {
    const delayed = Promise.withResolvers();
    const started = Promise.withResolvers();
    const reads = [];
    const { controller, store, calls } = fixture({ getSession: async (_id, signal) => {
      reads.push(signal);
      if (reads.length > 1) return state(2);
      started.resolve();
      return delayed.promise;
    } });
    await store.write({ gateway, sessionId: id });
    const opening = open(controller);
    await started.promise;
    controller.suspend();
    assert.equal(reads[0].aborted, true);
    await controller.foreground();
    assert.equal(reads.length, 2);
    delayed.resolve(state(1));
    await opening;
    assert.equal(controller.getSnapshot().session.version, 2);
    assert.deepEqual(calls, []);
  }
});

test('background aborts the request and foreground reconciles a committed action via GET only', async () => {
  const delayed = Promise.withResolvers();
  let signal;
  let operation;
  let actionCount = 0;
  const { controller } = fixture({
    sessionAction: async (_id, body, requestSignal) => {
      signal = requestSignal;
      operation = body.operation_id;
      actionCount++;
      return delayed.promise;
    },
    getSession: async () => state(1, { history: [{ operation_id: operation }] }),
  });
  await controller.openRecipe(document);
  const action = controller.act('start');
  controller.suspend();
  assert.equal(signal.aborted, true);
  await controller.foreground();
  delayed.resolve(state(1));
  await action;
  await controller.retry();
  assert.equal(actionCount, 1);
  assert.equal(controller.getSnapshot().canAct, true);
});

test('failure to save a pointer does not prevent cooking in memory', async () => {
  const { controller } = fixture({}, { write: async () => { throw Error('storage failed'); } });
  await controller.openRecipe(document);
  assert.ok(controller.getSnapshot().storageWarning);
  await controller.act('start');
  assert.equal(controller.getSnapshot().session.version, 1);
});

test('leaving and reopening an existing session uses GET without starting a fresh session', async () => {
  const { controller, calls } = fixture();
  await controller.openRecipe(document);
  controller.leave();
  assert.equal(controller.getSnapshot().session, null);
  await controller.resume();
  assert.deepEqual(calls.map(([method]) => method), ['create', 'get']);
  assert.equal(controller.getSnapshot().session.id, id);
});

test('opening the same recipe from detail resumes the saved session by GET', async () => {
  const { controller, calls } = fixture();
  await controller.openRecipe(document);
  controller.leave();
  await controller.openRecipe(document);
  assert.deepEqual(calls.map(([method]) => method), ['create', 'get']);
  assert.equal(controller.getSnapshot().session.id, id);
});

test('returning to the app refreshes visible sessions without resetting the last known version', async () => {
  const { controller, calls } = fixture();
  await controller.openRecipe(document);
  await controller.act('start');
  const reenter = controller.foreground;
  await reenter();
  assert.deepEqual(calls.at(-1), ['get', id, 1]);
  assert.equal(controller.getSnapshot().session.version, 1);
  controller.leave();
  await reenter();
  assert.deepEqual(calls.map(([method]) => method), ['create', 'action', 'get']);
});

const question = 'Bước này cần lưu ý gì?';
const answer = [{ role: 'user', text: question }, { role: 'assistant', text: 'Làm theo bước trong công thức.' }];

test('a chat appends the authoritative exchange and increments the version used by the next action', async () => {
  const calls = [];
  const { controller } = fixture({
    sessionMessage: async (_id, body) => { calls.push(body); return state(1, { messages: answer }); },
    sessionAction: async (_id, body) => { calls.push(body); return state(2, { messages: answer }); },
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  await controller.sendMessage();
  assert.deepEqual(controller.getSnapshot().session.messages, answer);
  assert.equal(controller.getSnapshot().draft, '');
  await controller.act('next');
  assert.deepEqual(calls, [
    { text: question, expected_version: 0, operation_id: 'operation-2' },
    { action: 'next', expected_version: 1, operation_id: 'operation-3' },
  ]);
});

test('a command sent through chat accepts an action snapshot without appending a reply', async () => {
  const { controller } = fixture({ sessionMessage: async (_id, body) => state(1, {
    history: [{ action: 'start', operation_id: body.operation_id }],
  }) });
  await controller.openRecipe(document);
  controller.setDraft('bắt đầu');
  await controller.sendMessage();
  assert.equal(controller.getSnapshot().session.status, 'cooking');
  assert.deepEqual(controller.getSnapshot().session.messages, []);
  assert.equal(controller.getSnapshot().draft, '');
});

test('a lost response gives an explicit GET before a replay with the same body and no double sends', async () => {
  const delayed = Promise.withResolvers();
  const calls = [];
  const { controller } = fixture({
    sessionMessage: async (_id, body) => {
      calls.push(body);
      return calls.length === 1 ? delayed.promise : state(1, { messages: answer });
    },
    getSession: async () => { calls.push('GET'); return state(); },
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  const request = controller.sendMessage();
  await controller.sendMessage();
  await controller.act('start');
  assert.equal(calls.length, 1);
  delayed.reject(new ApiError('network'));
  await request;
  assert.equal(controller.getSnapshot().canAct, false);
  await controller.retry();
  assert.deepEqual(calls, [calls[0], 'GET']);
  assert.equal(controller.getSnapshot().canDiscardMessage, true);
  await controller.retry();
  assert.deepEqual(calls[2], calls[0]);
  assert.equal(controller.getSnapshot().draft, '');
});

test('known provider timeout refreshes and retains the draft for a new deliberate send', async () => {
  const calls = [];
  const { controller } = fixture({
    sessionMessage: async (_id, body) => {
      calls.push(body);
      if (calls.length === 1) throw new ApiError('timeout', 504, 'ASSISTANT_PROVIDER_TIMEOUT');
      return state(1, { messages: answer });
    },
    getSession: async () => { calls.push('GET'); return state(); },
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  await controller.sendMessage();
  assert.deepEqual(calls, [calls[0], 'GET']);
  const snap = controller.getSnapshot();
  assert.equal(snap.draft, question);
  assert.equal(snap.canAct, true);
  assert.equal(snap.refreshRequired, false);
  assert.equal(snap.canResend, true);
  assert.equal(snap.error.retryable, false);
  assert.equal(snap.error.message.includes('tải lại phiên'), false);
  await controller.retry();
  assert.equal(calls.length, 2);
  await controller.sendMessage();
  assert.notEqual(calls[2].operation_id, calls[0].operation_id);
});

test('failed refresh after provider timeout exposes refreshRequired retry and recovers to resend action', async () => {
  let failGet = true;
  const calls = [];
  const { controller } = fixture({
    sessionMessage: async (_id, body) => {
      calls.push(body);
      if (calls.length === 1) throw new ApiError('Hãy tải lại phiên', 504, 'ASSISTANT_PROVIDER_TIMEOUT');
      return state(1, { messages: answer });
    },
    getSession: async () => {
      calls.push('GET');
      if (failGet) throw new ApiError('network error');
      return state();
    },
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  await controller.sendMessage();
  assert.equal(controller.getSnapshot().refreshRequired, true);
  assert.equal(controller.getSnapshot().canAct, false);
  assert.equal(controller.getSnapshot().canResend, false);
  assert.equal(controller.getSnapshot().error.retryable, true);
  failGet = false;
  await controller.retry();
  const recovered = controller.getSnapshot();
  assert.deepEqual(calls, [calls[0], 'GET', 'GET']);
  assert.equal(recovered.refreshRequired, false);
  assert.equal(recovered.canAct, true);
  assert.equal(recovered.canResend, true);
  assert.equal(recovered.draft, question);
  assert.equal(recovered.error.message.includes('tải lại phiên'), false);
});

test('auto-refresh after timeout clears draft and error when the question was already committed', async () => {
  const { controller } = fixture({
    sessionMessage: async () => {
      throw new ApiError('timeout', 504, 'ASSISTANT_PROVIDER_TIMEOUT');
    },
    getSession: async () => state(1, { messages: answer }),
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  await controller.sendMessage();
  const snap = controller.getSnapshot();
  assert.deepEqual(snap.session.messages, answer);
  assert.equal(snap.draft, '');
  assert.equal(snap.error, null);
  assert.equal(snap.canResend, false);
});

test('quota and configuration errors preserve steps and do not replay chat', async () => {
  const errors = [
    new ApiError('quota', 409, 'SESSION_MESSAGE_LIMIT'),
    new ApiError('offline', 503, 'ASSISTANT_NOT_CONFIGURED'),
  ];
  for (const error of errors) {
    const { controller } = fixture({ sessionMessage: async () => { throw error; } });
    await controller.openRecipe(document);
    controller.setDraft(question);
    await controller.sendMessage();
    assert.equal(controller.getSnapshot().error.code, error.code);
    assert.equal(controller.getSnapshot().draft, question);
    assert.equal(controller.getSnapshot().canAct, true);
    assert.equal(controller.getSnapshot().error.retryable, false);
    await controller.act('start');
    assert.equal(controller.getSnapshot().session.version, 1);
  }
});

test('foreground recovers a committed reply without replay, but preserves the draft if another action won', async () => {
  for (const messages of [answer, []]) {
    const delayed = Promise.withResolvers();
    const calls = [];
    const { controller } = fixture({
      sessionMessage: async (_id, _body, signal) => { calls.push(signal); return delayed.promise; },
      getSession: async () => state(1, { messages }),
    });
    await controller.openRecipe(document);
    controller.setDraft(question);
    const request = controller.sendMessage();
    controller.suspend();
    assert.equal(calls[0].aborted, true);
    await controller.foreground();
    delayed.resolve(state(2, { messages: answer }));
    await request;
    await controller.retry();
    assert.equal(calls.length, 1);
    assert.deepEqual(controller.getSnapshot().session.messages, messages);
    assert.equal(controller.getSnapshot().draft, messages.length ? '' : question);
  }
});

test('a reply after leaving and opening another recipe cannot affect its draft or session', async () => {
  const delayed = Promise.withResolvers();
  const { controller } = fixture({
    createSession: async body => body.recipe_id === otherRecipe.id ? state(0, { id: otherId, recipe: otherRecipe }) : state(),
    sessionMessage: async () => delayed.promise,
  });
  await controller.openRecipe(document);
  controller.setDraft(question);
  const request = controller.sendMessage();
  controller.leave();
  await controller.openRecipe({ ...document, recipe: otherRecipe });
  controller.setDraft('Câu hỏi mới');
  delayed.resolve(state(1, { messages: answer }));
  await request;
  assert.equal(controller.getSnapshot().session.id, otherId);
  assert.equal(controller.getSnapshot().draft, 'Câu hỏi mới');
});

test('passes custom llmConfig to sessionMessage and omits it when cleared back to default', async () => {
  const customConfig = {
    provider: 'openai',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    api_key: 'sk-test-key-123',
  };
  let activeConfig = customConfig;
  const seen = [];
  const { controller } = fixture({
    sessionMessage: async (...args) => {
      const [_id, body, _signal, llmConfig] = args;
      seen.push({ text: body.text, argCount: args.length, llmConfig });
      const nextVersion = body.expected_version + 1;
      return state(nextVersion, {
        status: 'ready',
        current_step: 0,
        messages: Array.from({ length: nextVersion }, (_, i) => [
          { role: 'user', text: `Q${i + 1}` },
          { role: 'assistant', text: `A${i + 1}` },
        ]).flat(),
      });
    },
  }, {}, { getLlmConfig: () => activeConfig });

  await controller.openRecipe(document);
  controller.setDraft('Hỏi với khóa riêng');
  await controller.sendMessage();
  assert.equal(seen[0].argCount, 4);
  assert.deepEqual(seen[0].llmConfig, customConfig);

  activeConfig = null;
  controller.setDraft('Hỏi bằng mặc định');
  await controller.sendMessage();
  assert.equal(seen[1].argCount, 3);
  assert.equal(seen[1].llmConfig, undefined);
});

test('setLlmConfig updates and clears the llmConfig passed to sessionMessage', async () => {
  const geminiConfig = {
    provider: 'gemini',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    api_key: 'AIzaTestKey123',
  };
  const configs = [];
  const { controller } = fixture({
    sessionMessage: async (_id, body, _signal, llmConfig) => {
      configs.push(llmConfig);
      const nextVersion = body.expected_version + 1;
      return state(nextVersion, {
        status: 'ready',
        current_step: 0,
        messages: Array.from({ length: nextVersion }, (_, i) => [
          { role: 'user', text: `Q${i + 1}` },
          { role: 'assistant', text: `A${i + 1}` },
        ]).flat(),
      });
    },
  });

  await controller.openRecipe(document);
  controller.setLlmConfig(geminiConfig);
  controller.setDraft('Câu hỏi 1');
  await controller.sendMessage();
  assert.deepEqual(configs[0], geminiConfig);

  controller.setLlmConfig(null);
  controller.setDraft('Câu hỏi 2');
  await controller.sendMessage();
  assert.equal(configs[1], undefined);
});
