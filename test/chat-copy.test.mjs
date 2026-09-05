import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, retrieve } from '../worker/src/index.js';
test('teacher questions retrieve the known instructor information', () => {
  assert.ok(retrieve('Who teaches judo?').some(item => item.id === 'coaches'));
});
import { customerReply, followupQuery } from '../chat-copy.js';

test('a new topic does not inherit an earlier price question', () => {
  assert.equal(followupQuery('Who teaches judo?', [{role:'user',content:'How much are kids classes?'}]), 'Who teaches judo?');
});
test('follow-up retains boxing without claiming a Saturday class', () => {
  const query = followupQuery('What about Saturday?', [{role:'user',content:'When is Sunday boxing?'}]);
  assert.match(customerReply(query.toLowerCase()).answer, /not that day/);
});
test('schedule and price are answered together', () => {
  const reply = customerReply('when are kids classes and how much do they cost');
  assert.match(reply.answer, /5:30 PM/);
  assert.match(reply.answer, /don’t have current prices/);
});

async function answer(message) {
  const result = await handleRequest(new Request('http://localhost/chat', {
    method: 'POST', headers: { Origin: 'http://localhost:4173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  }), { BUMA_RATE_LIMITER: { limit: async () => ({success: true}) } });
  return result.json();
}
test('new visitor receives both beginner guidance and a gear uncertainty answer', async () => {
  const result = await answer('I am completely new. Which class should I start with, and what should I bring?');
  assert.match(result.answer, /Beginners are welcome/);
  assert.match(result.answer, /what to wear or bring/);
  assert.doesNotMatch(result.answer, /approved|verified/);
});
test('pricing survives booking intent and does not promise a reservation', async () => {
  const result = await answer('I want to book my first class. How much does it cost?');
  assert.match(result.answer, /don’t have current prices/);
  assert.match(result.answer, /doesn’t book a place/);
});
test('shy child reply avoids unsupported endorsements and age eligibility', async () => {
  const result = await answer('My 8-year-old is shy and has never trained. Is this a good fit?');
  assert.match(result.answer, /confidence, teamwork/);
  assert.match(result.answer, /age and comfort level/);
  assert.doesNotMatch(result.answer, /many parents|great fit|pricing/i);
});
test('safety routing remains ahead of enrollment and beginner copy', async () => {
  const result = await answer('I am new and injured. Can I book my first class?');
  assert.match(result.answer, /medical advice/);
  assert.doesNotMatch(result.answer, /Request first class/);
});
test('browser fallback and worker use identical common replies', async () => {
  const question = 'how much does membership cost';
  const result = await answer(question);
  assert.equal(result.answer, customerReply(question).answer);
});
test('identity disclosure names provider only when asked', async () => {
  assert.doesNotMatch((await answer('Are you a bot?')).answer, /DeepSeek/);
  assert.match((await answer('Do you use DeepSeek?')).answer, /DeepSeek/);
});
