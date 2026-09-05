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
    body: options.method === 'OPTIONS' ? undefined : JSON.stringify({ message }),
  });
}

test('retrieval prioritizes kids schedule information', () => {
  const results = retrieve('When are kids classes?');
  assert.equal(results[0].id, 'kids');
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
  assert.equal(payload.mode, 'retrieval');
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

test('answers CORS preflight for the preview origin', async () => {
  const response = await handleRequest(request('', { method: 'OPTIONS' }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
});
