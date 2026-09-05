import { BUMA_KNOWLEDGE } from './knowledge.js';

const scheduleData = {
  weekday: [
    ['6:00 AM', 'Early BJJ', 'Mon / Wed / Fri · all-level gi', 'All levels'],
    ['6:00 AM', 'Early No-Gi', 'Tue / Thu', 'All levels'],
    ['5:30 PM', 'Kids Program', 'Mon / Wed BJJ · Tue / Thu Muay Thai', 'Kids'],
    ['7:30 PM', 'No-Gi BJJ', 'Tuesday / Thursday evenings', 'All levels'],
  ],
  saturday: [
    ['9:00 AM', 'Muay Thai', 'Striking class', 'All levels'],
    ['10:00 AM', 'Fundamental BJJ', 'Family class', 'Fundamentals'],
    ['10:00 AM', 'Kids BJJ', 'Family class', 'Kids'],
    ['11:00 AM', 'BJJ', 'All-level gi', 'All levels'],
  ],
  sunday: [
    ['8:00 AM', 'Competition Class', 'Focused competition training', 'Competitors'],
    ['12:00 PM', 'Boxing', 'Technical boxing class', 'All levels'],
  ],
};

const panel = document.querySelector('#schedule-panel');
const dayTabs = [...document.querySelectorAll('.day-tab')];

function renderSchedule(day) {
  panel.replaceChildren(...scheduleData[day].map(([time, title, detail, level]) => {
    const article = document.createElement('article');
    article.className = 'class-row';
    const timeElement = document.createElement('time');
    timeElement.textContent = time;
    const description = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = detail;
    const badge = document.createElement('span');
    badge.textContent = level;
    description.append(heading, copy);
    article.append(timeElement, description, badge);
    return article;
  }));
}

function activateDay(tab) {
  dayTabs.forEach((item) => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  renderSchedule(tab.dataset.day);
}

dayTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateDay(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + dayTabs.length) % dayTabs.length;
    if (event.key === 'ArrowRight') next = (index + 1) % dayTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = dayTabs.length - 1;
    activateDay(dayTabs[next]);
    dayTabs[next].focus();
  });
});
activateDay(dayTabs[0]);

const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
nav.querySelectorAll('a').forEach((anchor) => anchor.addEventListener('click', () => {
  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation');
}));

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
}

const widget = document.querySelector('.chat-widget');
const launcher = document.querySelector('.chat-launcher');
const closeChat = document.querySelector('.chat-close');
const resetChat = document.querySelector('.chat-reset');
const messages = document.querySelector('#chat-messages');
const form = document.querySelector('#chat-form');
const input = document.querySelector('#chat-input');
const submitButton = form.querySelector('button[type="submit"]');
const suggestions = document.querySelector('#chat-suggestions');
const homeTab = document.querySelector('.chat-home');
const messagesTab = document.querySelector('.chat-messages-tab');
const scheduleTab = document.querySelector('.chat-schedule-tab');
const visitTab = document.querySelector('.chat-visit');
const statusLine = document.querySelector('#chat-status');
const endpoint = document.querySelector('meta[name="buma-chat-api"]')?.content.trim() || '';
let busy = false;

function setChat(open) {
  widget.classList.toggle('open', open);
  widget.setAttribute('aria-hidden', String(!open));
  launcher.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('chat-open', open && innerWidth < 650);
  if (open) setTimeout(() => input.focus(), 220);
  else launcher.focus();
}

launcher.addEventListener('click', () => setChat(true));
closeChat.addEventListener('click', () => setChat(false));
document.querySelectorAll('.ask-buma').forEach((button) => button.addEventListener('click', () => setChat(true)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && widget.classList.contains('open')) setChat(false);
});

const stopWords = new Set('a an and are as at be by can do does for from how i in is it me my of on or our the their there this to what when where which who with you your'.split(' '));
const aliases = {
  'brazilian jiu jitsu': 'bjj',
  'jiu-jitsu': 'bjj',
  'jiu jitsu': 'bjj',
  'no-gi': 'no gi',
  nogi: 'no gi',
  children: 'kids',
  child: 'kids',
  youth: 'kids',
  teacher: 'instructor',
  trainers: 'instructor',
  coaches: 'instructor',
  fees: 'price',
  rates: 'price',
  hours: 'schedule',
};

function normalize(text) {
  let output = text.toLowerCase();
  Object.entries(aliases).forEach(([from, to]) => { output = output.replaceAll(from, to); });
  return output.replace(/[^a-z0-9:\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function retrieve(query) {
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
      if (normalized.includes(normalize(keyword)) && normalize(keyword).includes(' ')) score += 7;
    });
    if (normalized.includes('schedule') && document.category === 'schedule') score += 2;
    if ((normalized.includes('beginner') || normalized.includes('new')) && document.id === 'overview') score += 6;
    return { ...document, score };
  }).filter((document) => document.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

function composeLocal(query, documents) {
  const normalized = normalize(query);
  if (/\b(911|emergency|unconscious|not breathing|severe bleeding|immediate danger)\b/.test(normalized)) {
    return 'This assistant cannot provide emergency help. Call 911 or your local emergency services now. Do not wait for a response from the academy.';
  }
  if (/\b(injury|injured|pain|medical|diagnose|concussion|medicine)\b/.test(normalized)) {
    return 'I can’t provide medical advice. For urgent symptoms, contact emergency services. Otherwise, speak with a qualified healthcare professional and contact the academy directly before training.';
  }
  if (!documents.length) {
    return "I couldn't verify that from the published academy information. I can help with programs, published class times, instructors, location and contact details. For anything else, contact the academy directly.";
  }
  if (normalized.includes('beginner') || normalized.includes('never trained') || normalized.includes('new')) {
    return 'BUMA’s published information says its programs serve beginners through experienced martial artists. Fundamentals and all-level sessions are listed, but contact the academy before your first visit so staff can recommend the right class.';
  }
  if (normalized.includes('price') || normalized.includes('cost') || normalized.includes('membership') || normalized.includes('trial')) {
    return "Current prices and trial terms are not published in the approved information, so I don't want to guess. Contact the academy directly for current rates and eligibility.";
  }
  if (normalized.includes('book') || normalized.includes('reserve') || normalized.includes('appointment')) {
    return 'I can’t confirm a reservation or booking. The currently verified next step is to contact the academy directly about attending your first class.';
  }
  if (normalized.includes('phone') || normalized.includes('number') || normalized.includes('contact')) {
    return 'The current official site displays (716) 671-7197 and info@fightfamily.com. Its click-to-call link and the supplied Google listing use (716) 563-0720, so the primary number still needs owner confirmation.';
  }
  if (normalized.includes('schedule') && documents.length > 1) {
    return `Published schedule highlights: ${documents.map((document) => document.text).join(' ')} Schedules can change, so confirm before your first visit.`;
  }
  return `${documents[0].text}${documents[0].category === 'schedule' ? ' Schedules can change, so confirm before your first visit.' : ''}`;
}

function appendMessage(text, role, sources = [], note = '') {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  wrap.appendChild(paragraph);
  messages.appendChild(wrap);
  if (role === 'assistant' && sources.length) {
    const sourceList = document.createElement('div');
    sourceList.className = 'source-list';
    [...new Map(sources.map((source) => [source.url, source])).values()].forEach((source) => {
      const anchor = document.createElement('a');
      anchor.href = source.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = `Source: ${source.source}`;
      sourceList.appendChild(anchor);
    });
    messages.appendChild(sourceList);
  }
  if (note) {
    const noteElement = document.createElement('p');
    noteElement.className = 'chat-response-note';
    noteElement.textContent = note;
    messages.appendChild(noteElement);
  }
  messages.scrollTop = messages.scrollHeight;
}

function setBusy(nextBusy, status = 'Ready') {
  busy = nextBusy;
  form.setAttribute('aria-busy', String(nextBusy));
  input.disabled = nextBusy;
  submitButton.disabled = nextBusy;
  statusLine.textContent = status;
}

async function requestAssistant(message) {
  if (!endpoint) throw new Error('No assistant endpoint configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Assistant returned ${response.status}`);
    const payload = await response.json();
    if (typeof payload.answer !== 'string' || !payload.answer.trim()) throw new Error('Assistant returned an invalid answer');
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function ask(question) {
  const clean = question.trim().slice(0, 500);
  if (!clean || busy) return;
  widget.classList.add('in-conversation');
  appendMessage(clean, 'user');
  input.value = '';
  input.style.height = 'auto';
  suggestions.style.display = 'none';
  const typing = document.createElement('div');
  typing.className = 'message assistant typing';
  typing.innerHTML = '<p aria-label="Assistant is responding">•••</p>';
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
  setBusy(true, 'Checking approved information…');

  try {
    const result = await requestAssistant(clean);
    typing.remove();
    appendMessage(result.answer, 'assistant', result.sources || [], result.mode === 'retrieval' ? 'Answered from verified site information.' : 'AI-assisted answer checked against retrieved sources.');
    setBusy(false, 'Ready');
  } catch {
    typing.remove();
    const documents = retrieve(clean);
    appendMessage(composeLocal(clean, documents), 'assistant', documents, 'Live assistant unavailable; using the on-page verified information.');
    setBusy(false, 'Ready · local information mode');
  }
  input.focus();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value);
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 90)}px`;
});
suggestions.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => ask(button.textContent)));

function returnHome() {
  if (busy) return;
  messages.replaceChildren();
  widget.classList.remove('in-conversation');
  suggestions.style.display = 'grid';
  input.value = '';
  input.style.height = 'auto';
  statusLine.textContent = 'Ready';
  input.focus();
}

resetChat.addEventListener('click', returnHome);
homeTab.addEventListener('click', returnHome);
messagesTab.addEventListener('click', () => {
  if (messages.children.length) {
    widget.classList.add('in-conversation');
    messages.scrollTop = messages.scrollHeight;
  } else input.focus();
});
scheduleTab.addEventListener('click', () => ask('Show the class schedule'));
visitTab.addEventListener('click', () => setChat(false));
