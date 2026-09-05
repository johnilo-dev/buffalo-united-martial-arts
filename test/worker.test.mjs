import test from 'node:test';
import assert from 'node:assert/strict';
import { BumaUsageBudget, handleRequest, retrieve } from '../worker/src/index.js';

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
  assert.match(payload.answer, /welcome to Buffalo United/i);
});

test('answers harmless receptionist small talk locally without DeepSeek', async () => {
  let aiRateCalls = 0;
  const response = await handleRequest(request('What time is it?'), {
    DEEPSEEK_API_KEY: 'test-secret-value',
    BUMA_AI_RATE_LIMITER: {
      limit: async () => {
        aiRateCalls += 1;
        return { success: true };
      },
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, / in Buffalo/);
  assert.doesNotMatch(payload.answer, /\b(EST|EDT)\b/);
  assert.equal(aiRateCalls, 0);
});

test('answers live weather questions from the National Weather Service without DeepSeek', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let aiRateCalls = 0;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/points/')) {
      return new Response(JSON.stringify({
        properties: { forecastHourly: 'https://api.weather.gov/gridpoints/BUF/40,40/forecast/hourly' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      properties: {
        periods: [{
          temperature: 72,
          temperatureUnit: 'F',
          shortForecast: 'Mostly Cloudy',
          windSpeed: '8 mph',
          windDirection: 'W',
        }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = {
      DEEPSEEK_API_KEY: 'test-secret-value',
      BUMA_AI_RATE_LIMITER: {
        limit: async () => {
          aiRateCalls += 1;
          return { success: true };
        },
      },
    };
    const first = await handleRequest(request('What is the weather like there?'), env);
    const second = await handleRequest(request('Is it raining at BUMA?'), env);
    const firstPayload = await first.json();
    const secondPayload = await second.json();
    assert.equal(first.status, 200);
    assert.equal(firstPayload.mode, 'receptionist');
    assert.match(firstPayload.answer, /Near the academy, it’s about 72° and mostly cloudy/);
    assert.doesNotMatch(firstPayload.answer, /8 mph|wind W/);
    assert.deepEqual(firstPayload.sources.map((source) => source.id), ['weather']);
    assert.equal(secondPayload.answer, firstPayload.answer);
    assert.equal(calls.length, 2);
    assert.equal(aiRateCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('handles first-visit unknowns without inventing facts or citing unrelated pages', async () => {
  const response = await handleRequest(request('What should I wear to my first class?'), {});
  const payload = await response.json();
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /don’t have confirmed details/i);
  assert.deepEqual(payload.sources, []);
  assert.ok(payload.actions.some((action) => action.label === 'Call the academy'));
});

test('routes pricing and trial questions to the first-class request form without DeepSeek', async () => {
  let aiRateCalls = 0;
  const response = await handleRequest(request('How much does membership cost and do you have a trial?'), {
    DEEPSEEK_API_KEY: 'test-secret-value',
    BUMA_AI_RATE_LIMITER: {
      limit: async () => {
        aiRateCalls += 1;
        return { success: true };
      },
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /don’t want to guess|first-class request/i);
  assert.deepEqual(payload.sources.map((source) => source.id), ['pricing']);
  assert.ok(payload.actions.some((action) => action.label === 'Request first class' && action.href.includes('docs.google.com/forms')));
  assert.equal(aiRateCalls, 0);
});

test('routes booking, registration and enrollment intent to the first-class request form', async () => {
  const response = await handleRequest(request('How do I register and enroll?'), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'receptionist');
  assert.match(payload.answer, /Great|Request first class|first-class request/i);
  assert.deepEqual(payload.sources, []);
  assert.ok(payload.actions.some((action) => action.label === 'Request first class'));
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
  assert.match(payload.answer, /View class schedule/i);
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

test('does not spend an AI-rate check on deterministic receptionist answers', async () => {
  let aiRateCalls = 0;
  const response = await handleRequest(request('Hello, what are your services?'), {
    DEEPSEEK_API_KEY: 'test-secret-value',
    BUMA_AI_RATE_LIMITER: {
      limit: async () => {
        aiRateCalls += 1;
        return { success: true };
      },
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'receptionist');
  assert.equal(aiRateCalls, 0);
});

test('falls back to retrieval when the AI-rate limit is reached', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: 'Should not spend this call', sourceIds: ['weekend'] }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await handleRequest(request('When is Sunday boxing?'), {
      DEEPSEEK_API_KEY: 'test-secret-value',
      BUMA_AI_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.mode, 'retrieval');
    assert.equal(payload.limited, true);
    assert.equal(upstreamCalls, 0);
    assert.doesNotMatch(payload.answer, /chat budget|AI-assisted|retrieval/i);
    assert.match(payload.answer, /Sunday|12 PM/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('records daily AI usage in the Durable Object budget', async () => {
  const store = new Map();
  const budget = new BumaUsageBudget({
    storage: {
      get: async (key) => store.get(key),
      put: async (key, value) => store.set(key, value),
    },
  });
  const first = await budget.checkAndRecord({
    visitorKey: 'visitor-123456',
    ip: '203.0.113.5',
    now: Date.parse('2026-09-05T12:00:00Z'),
    browserLimit: 2,
    ipLimit: 3,
    globalLimit: 4,
  });
  const second = await budget.checkAndRecord({
    visitorKey: 'visitor-123456',
    ip: '203.0.113.5',
    now: Date.parse('2026-09-05T12:01:00Z'),
    browserLimit: 1,
    ipLimit: 3,
    globalLimit: 4,
  });
  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.usage.browser, 2);
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
