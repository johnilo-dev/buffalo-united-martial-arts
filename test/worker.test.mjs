import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, retrieve } from '../worker/src/index.js';

const origin = 'https://johnilo-dev.github.io';

function request(message, options = {}) {
  return new Request('https://buma-chat-api.example.test', {
    method: options.method || 'POST',
    headers: {
      Origin: options.origin || origin,
      'Content-Type': options.contentType || 'application/json',
    },
    body: options.method === 'OPTIONS' ? undefined : JSON.stringify({ message, history: options.history }),
  });
}

test('retrieval prioritizes kids schedule information', () => {
  const results = retrieve('When are kids classes?');
  assert.equal(results[0].id, 'kids');
});

test('retrieval uses whole words and avoids irrelevant substring citations', () => {
  assert.deepEqual(retrieve('Someone is not breathing'), []);
  assert.deepEqual(retrieve("What color is the owner's car?"), []);
  assert.deepEqual(retrieve('Do you use DeepSeek?'), []);
  assert.deepEqual(retrieve('What should I wear to my first class?'), []);
});

test('acts as a receptionist for greetings combined with a services question', async () => {
  const response = await handleRequest(request('Hello, what are your services?'), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /Brazilian Jiu-Jitsu|Muay Thai/);
  assert.deepEqual(payload.sources.map((source) => source.id), ['programs']);
  assert.ok(payload.actions.some((action) => action.label === 'View class schedule'));
});

test('answers assistant identity questions truthfully without unrelated citations', async () => {
  const response = await handleRequest(request('Do you use DeepSeek?'), {});
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /DeepSeek/);
  assert.deepEqual(payload.sources, []);
});

test('greets visitors without requiring knowledge retrieval', async () => {
  const response = await handleRequest(request('Hello'), {});
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /virtual receptionist/i);
});

test('handles first-visit unknowns without inventing facts or citing unrelated pages', async () => {
  const response = await handleRequest(request('What should I wear to my first class?'), {});
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /isn’t included|don't want to guess/i);
  assert.deepEqual(payload.sources, []);
  assert.ok(payload.actions.some((action) => action.label === 'Call the academy'));
});

test('provides a grounded location answer with a directions action', async () => {
  const response = await handleRequest(request('Where are you located?'), {});
  const payload = await response.json();
  assert.match(payload.answer, /359 Ganson Street/);
  assert.deepEqual(payload.sources.map((source) => source.id), ['location']);
  assert.ok(payload.actions.some((action) => action.label === 'Get directions'));
});

test('routes the schedule shortcut to a useful receptionist action', async () => {
  const response = await handleRequest(request('Show the class schedule'), {});
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /published class schedule/i);
  assert.ok(payload.actions.some((action) => action.href === '#schedule'));
});

test('prioritizes weekend facts and keeps the first supporting citation', async () => {
  assert.equal(retrieve('What about Saturday?')[0].id, 'weekend');
  const response = await handleRequest(request('What about Saturday?'), {});
  const payload = await response.json();
  assert.match(payload.answer, /Saturday published classes/);
  assert.deepEqual(payload.sources.map((source) => source.id), ['weekend']);
});

test('returns a safe health response when opened in a browser', async () => {
  const response = await handleRequest(new Request('https://buma-chat-api.example.test/', { method: 'GET' }), {
    DEEPSEEK_API_KEY: 'must-not-be-exposed',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, 'BUMA Chat API');
  assert.equal(payload.status, 'ok');
  assert.doesNotMatch(JSON.stringify(payload), /must-not-be-exposed/);
});

test('returns grounded retrieval answer when API secret is absent', async () => {
  const response = await handleRequest(request('When is Sunday boxing?'), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, 'retrieval');
  assert.match(payload.answer, /Sunday|12 PM/i);
  assert.ok(payload.sources.length > 0);
});

test('blocks unapproved origins', async () => {
  const response = await handleRequest(request('Hello', { origin: 'https://attacker.example' }), {});
  assert.equal(response.status, 403);
});

test('rejects oversized messages', async () => {
  const response = await handleRequest(request('x'.repeat(501)), {});
  assert.equal(response.status, 413);
});

test('handles emergency language without contacting a model', async () => {
  const response = await handleRequest(request('Someone is not breathing, is this an emergency?'), {
    DEEPSEEK_API_KEY: 'test-only-placeholder',
  });
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /911/);
});

test('uses the configured DeepSeek model without exposing the secret', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: 'Sunday boxing is published at 12 PM.', sourceIds: ['weekend'] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await handleRequest(request('When is Sunday boxing?'), {
      DEEPSEEK_API_KEY: 'test-secret-value',
    });
    const payload = await response.json();
    assert.equal(payload.mode, 'ai');
    assert.equal(upstreamRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(upstreamRequest.options.headers.Authorization, 'Bearer test-secret-value');
    const upstreamBody = JSON.parse(upstreamRequest.options.body);
    assert.equal(upstreamBody.model, 'deepseek-v4-flash');
    assert.doesNotMatch(JSON.stringify(payload), /test-secret-value/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the Cloudflare rate-limit binding when configured', async () => {
  let calls = 0;
  const response = await handleRequest(request('When is Sunday boxing?'), {
    BUMA_RATE_LIMITER: {
      limit: async () => {
        calls += 1;
        return { success: false };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 429);
});

test('uses limited recent conversation to resolve a follow-up', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    upstreamBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: 'Saturday Muay Thai is published at 9 AM.', sourceIds: ['weekend'] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await handleRequest(request('What about Saturday?', {
      history: [
        { role: 'user', content: 'When is Sunday boxing?' },
        { role: 'assistant', content: 'Sunday boxing is at 12 PM.' },
      ],
    }), { DEEPSEEK_API_KEY: 'test-secret-value' });
    const payload = await response.json();
    assert.equal(payload.mode, 'ai');
    assert.match(upstreamBody.messages[1].content, /When is Sunday boxing/);
    assert.deepEqual(payload.sources.map((source) => source.id), ['weekend']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back instead of attaching unrelated sources when the model cites nothing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ answer: 'Uncited answer', sourceIds: [] }) } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await handleRequest(request('When is Sunday boxing?'), {
      DEEPSEEK_API_KEY: 'test-secret-value',
    });
    const payload = await response.json();
    assert.equal(payload.mode, 'retrieval');
    assert.doesNotMatch(payload.answer, /Uncited answer/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('answers CORS preflight for the preview origin', async () => {
  const response = await handleRequest(request('', { method: 'OPTIONS' }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});
