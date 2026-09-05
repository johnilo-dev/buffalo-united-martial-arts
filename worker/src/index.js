import { BUMA_KNOWLEDGE } from '../../knowledge.js';

const MAX_MESSAGE_LENGTH = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const requestBuckets = new Map();
const aliases = {
  'brazilian jiu jitsu': 'bjj',
  'jiu-jitsu': 'bjj',
  'jiu jitsu': 'bjj',
  'no-gi': 'no gi',
  nogi: 'no gi',
  children: 'kids',
  child: 'kids',
  youth: 'kids',
  fees: 'price',
  rates: 'price',
  hours: 'schedule',
};
const stopWords = new Set('a an and are as at be by can do does for from how i in is it me my of on or our the their there this to what when where which who with you your'.split(' '));

function normalize(text) {
  let output = text.toLowerCase();
  Object.entries(aliases).forEach(([from, to]) => { output = output.replaceAll(from, to); });
  return output.replace(/[^a-z0-9:\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function retrieve(query, limit = 4) {
  const normalized = normalize(query);
  const terms = normalized.split(' ').filter((word) => word.length > 1 && !stopWords.has(word));
  return BUMA_KNOWLEDGE.map((document) => {
    const haystack = normalize(`${document.title} ${document.text} ${document.keywords.join(' ')}`);
    let score = 0;
    terms.forEach((term) => {
      if (document.keywords.some((keyword) => normalize(keyword) === term)) score += 4;
      if (normalize(document.title).includes(term)) score += 3;
      if (haystack.includes(term)) score += 1;
    });
    document.keywords.forEach((keyword) => {
      const normalizedKeyword = normalize(keyword);
      if (normalizedKeyword.includes(' ') && normalized.includes(normalizedKeyword)) score += 7;
    });
    return { ...document, score };
  }).filter((document) => document.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

function directSafetyAnswer(message) {
  const normalized = normalize(message);
  if (/\b(911|emergency|unconscious|not breathing|severe bleeding|immediate danger)\b/.test(normalized)) {
    return 'This assistant cannot provide emergency help. Call 911 or your local emergency services now. Do not wait for a response from the academy.';
  }
  if (/\b(injury|injured|pain|medical|diagnose|concussion|medicine)\b/.test(normalized)) {
    return 'I can’t provide medical advice. For urgent symptoms, contact emergency services. Otherwise, speak with a qualified healthcare professional and contact the academy directly before training.';
  }
  if (/\b(book|booking|reserve|reservation|appointment)\b/.test(normalized)) {
    return 'I can’t confirm a reservation or booking. The currently verified next step is to contact the academy directly about attending your first class.';
  }
  if (/\b(price|pricing|cost|membership|trial|fee|discount)\b/.test(normalized)) {
    return "Current prices and trial terms are not published in the approved information, so I don't want to guess. Contact the academy directly for current rates and eligibility.";
  }
  return '';
}

function deterministicAnswer(message, documents) {
  const safetyAnswer = directSafetyAnswer(message);
  if (safetyAnswer) return safetyAnswer;
  if (!documents.length) return "I couldn't verify that from the published academy information. Please contact the academy directly rather than relying on an unverified answer.";
  const normalized = normalize(message);
  if (/\b(phone|number|contact)\b/.test(normalized)) {
    return 'The current official site displays (716) 671-7197 and info@fightfamily.com. Its click-to-call link and the supplied Google listing use (716) 563-0720, so the primary number still needs owner confirmation.';
  }
  const suffix = documents[0].category === 'schedule' ? ' Schedules can change, so confirm before your first visit.' : '';
  return `${documents[0].text}${suffix}`;
}

function sourceView(documents) {
  return [...new Map(documents.map((document) => [document.url, {
    id: document.id,
    source: document.source,
    url: document.url,
  }])).values()];
}

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function healthResponse() {
  return new Response(JSON.stringify({
    service: 'BUMA Chat API',
    status: 'ok',
    message: 'The chat service is online. Chat requests are accepted from the approved BUMA website.',
  }, null, 2), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function response(body, status, origin, allowed) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, allowed) });
}

function allowedOrigin(origin, env) {
  const configured = (env.ALLOWED_ORIGINS || 'https://johnilo-dev.github.io,http://localhost:4173,http://127.0.0.1:4173')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return configured.includes(origin);
}

function withinRateLimit(request) {
  const key = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestBuckets.set(key, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  if (requestBuckets.size > 500) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (now - bucket.startedAt >= RATE_WINDOW_MS) requestBuckets.delete(bucketKey);
    }
  }
  return current.count <= RATE_LIMIT;
}

async function generateAnswer(message, documents, apiKey) {
  const context = documents.map((document) => ({
    id: document.id,
    title: document.title,
    content: document.text,
    source: document.source,
    sourceUrl: document.url,
  }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: 'You are the automated information assistant for Buffalo United Martial Arts. Answer only from the supplied approved public context. Never invent prices, schedules, policies, credentials, medical advice, or successful bookings. Clearly say when information is unavailable or conflicting. Do not ask for or repeat sensitive personal or medical information. Keep the answer under 90 words. Return JSON with exactly two fields: answer (string) and sourceIds (array of context IDs actually used).',
          },
          {
            role: 'user',
            content: `Approved public context:\n${JSON.stringify(context)}\n\nVisitor question:\n${message}`,
          },
        ],
        thinking: { type: 'disabled' },
        max_tokens: 240,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`DeepSeek upstream status ${upstream.status}`);
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) throw new Error('DeepSeek response did not contain an answer');
    const allowedIds = new Set(documents.map((document) => document.id));
    const sourceIds = Array.isArray(parsed.sourceIds) ? parsed.sourceIds.filter((id) => allowedIds.has(id)) : [];
    return { answer: parsed.answer.trim().slice(0, 1000), sourceIds };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return healthResponse();
  }
  const origin = request.headers.get('Origin') || '';
  const originAllowed = allowedOrigin(origin, env);
  if (request.method === 'OPTIONS') {
    return originAllowed ? new Response(null, { status: 204, headers: corsHeaders(origin, true) }) : response({ error: 'Origin not allowed' }, 403, origin, false);
  }
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin, originAllowed);
  if (!originAllowed) return response({ error: 'Origin not allowed' }, 403, origin, false);
  if (!withinRateLimit(request)) return response({ error: 'Too many requests. Please wait and try again.' }, 429, origin, true);
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return response({ error: 'Content-Type must be application/json' }, 415, origin, true);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid JSON body' }, 400, origin, true);
  }
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message) return response({ error: 'Message is required' }, 400, origin, true);
  if (message.length > MAX_MESSAGE_LENGTH) return response({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, 413, origin, true);

  const documents = retrieve(message);
  const directAnswer = directSafetyAnswer(message);
  if (directAnswer || !env.DEEPSEEK_API_KEY || !documents.length) {
    return response({
      answer: directAnswer || deterministicAnswer(message, documents),
      sources: sourceView(documents),
      mode: 'retrieval',
    }, 200, origin, true);
  }

  try {
    const generated = await generateAnswer(message, documents, env.DEEPSEEK_API_KEY);
    const cited = generated.sourceIds.length
      ? documents.filter((document) => generated.sourceIds.includes(document.id))
      : documents;
    return response({ answer: generated.answer, sources: sourceView(cited), mode: 'ai' }, 200, origin, true);
  } catch {
    return response({
      answer: deterministicAnswer(message, documents),
      sources: sourceView(documents),
      mode: 'retrieval',
    }, 200, origin, true);
  }
}

export default { fetch: handleRequest };
