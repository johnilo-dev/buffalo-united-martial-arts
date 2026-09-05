import { BUMA_KNOWLEDGE } from './knowledge.js';
import { customerReply, followupQuery } from './chat-copy.js';

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
const leadFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLScYcTIzDHbRcFVRJTI1JtdCgfYV2vMvzbOH8dSxOxXzUO1vUA/viewform?usp=publish-editor';
let busy = false;
const conversationHistory = [];

function chatVisitorId() {
  const storageKey = 'buma-chat-visitor-id';
  try {
    const current = localStorage.getItem(storageKey);
    if (current && /^[a-z0-9-]{12,80}$/i.test(current)) return current;
    const generated = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return 'anonymous';
  }
}

function buffaloTime() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelayFor(text) {
  return Math.min(2200, Math.max(950, 700 + text.length * 11));
}

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

const stopWords = new Set('a about an and are as at be by can do does for from how i in is it me my no not of on or our the their there this to use what when where which who with you your'.split(' '));
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
  service: 'program',
  services: 'programs',
  offerings: 'programs',
};
const genericTerms = new Set(['class', 'classes', 'program', 'programs', 'training']);

function normalize(text) {
  let output = text.toLowerCase();
  Object.entries(aliases).forEach(([from, to]) => { output = output.replaceAll(from, to); });
  return output.replace(/[^a-z0-9:\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function retrieve(query) {
  const normalized = normalize(query);
  const terms = normalized.split(' ').filter((word) => word.length > 1 && !stopWords.has(word));
  return BUMA_KNOWLEDGE.map((document) => {
    const titleWords = new Set(normalize(document.title).split(' '));
    const documentWords = new Set(normalize(`${document.title} ${document.text} ${document.keywords.join(' ')}`).split(' '));
    let score = 0;
    terms.forEach((term) => {
      if (genericTerms.has(term)) return;
      if (document.keywords.some((keyword) => normalize(keyword) === term)) score += 4;
      if (titleWords.has(term)) score += 3;
      if (documentWords.has(term)) score += 1;
    });
    document.keywords.forEach((keyword) => {
      if (normalized.includes(normalize(keyword)) && normalize(keyword).includes(' ')) score += 7;
    });
    if (/\b(saturday|sunday|weekend)\b/.test(normalized) && document.id === 'weekend') score += 6;
    if (normalized.includes('schedule') && document.category === 'schedule') score += 2;
    if ((normalized.includes('beginner') || normalized.includes('new')) && document.id === 'overview') score += 6;
    return { ...document, score };
  }).filter((document) => document.score >= 4).sort((a, b) => b.score - a.score).slice(0, 3);
}

function composeLocal(query, documents) {
  const normalized = normalize(query);
  if (/\b(911|emergency|unconscious|not breathing|severe bleeding|immediate danger)\b/.test(normalized)) {
    return 'This assistant cannot provide emergency help. Call 911 or your local emergency services now. Do not wait for a response from the academy.';
  }
  if (/\b(injury|injured|pain|medical|diagnose|concussion|medicine)\b/.test(normalized)) {
    return 'I can’t provide medical advice. For urgent symptoms, contact emergency services. Otherwise, speak with a qualified healthcare professional and contact the academy directly before training.';
  }
  const friendly = customerReply(normalized);
  if (friendly) return friendly.answer;
  if (/\b(what time is it|current time|time now|today's date|todays date|what day is it|current date)\b/.test(normalized)) {
    return `It’s ${buffaloTime()} in Buffalo. If you’re checking class timing, I can show the published schedule too.`;
  }
  if (/\b(weather|temperature|raining|snowing|forecast)\b/.test(normalized)) {
    return "I can’t check live weather from here, but I can help with BUMA’s class times, location and contact info. If weather might affect your trip, it’s best to call before heading over.";
  }
  if (/\b(how are you|how's it going|hows it going|how are things)\b/.test(normalized)) {
    return "I’m doing well, thanks for asking. I’m here to help you find the right BUMA class, check published times, or get directions when you’re ready.";
  }
  if (/\b(can you help|help me|what can you do)\b/.test(normalized)) {
    return "Absolutely. I can help with BUMA’s programs, class times, instructors, location, contact info and first-visit questions. If something isn’t published yet, I’ll point you to the academy instead of guessing.";
  }
  if (/\b(where are you|where is buma|located|location|address|directions|get there)\b/.test(normalized)) {
    return 'Buffalo United Martial Arts is at 359 Ganson Street, Buffalo, New York 14203, in the Buffalo RiverWorks area downtown.';
  }
  if (/\b(services|offerings|programs)\b/.test(normalized) || /\bwhat (class|classes|training)\b/.test(normalized) || /\bwhat do you (offer|teach)\b/.test(normalized)) {
    return 'Of course. Buffalo United offers Brazilian Jiu-Jitsu, Muay Thai, MMA, kids martial arts, Judo, Sambo, boxing, submission wrestling and Kru Fit cardio. Want me to show the class times next?';
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)( there)?$/.test(normalized)) {
    return 'Hi, welcome to Buffalo United. I can help with programs, class times, instructors, location and getting ready for a first visit. What would you like to check first?';
  }
  if (!documents.length) {
    return "I don’t have that detail yet. Could you tell me which class or part of your visit you mean?";
  }
  if (normalized.includes('beginner') || normalized.includes('never trained') || normalized.includes('new')) {
    return 'BUMA’s published information says its programs serve beginners through experienced martial artists. Fundamentals and all-level sessions are listed, but contact the academy before your first visit so staff can recommend the right class.';
  }
  if (normalized.includes('price') || normalized.includes('cost') || normalized.includes('membership') || normalized.includes('trial')) {
    return "Current prices and trial terms aren’t published in the approved information, so I don’t want to guess. If you send a first-class request, BUMA can follow up with the current rates and the best option for the program you’re interested in.";
  }
  if (normalized.includes('book') || normalized.includes('reserve') || normalized.includes('appointment')) {
    return 'Great — the easiest way to get started is to fill out the first-class request form. Just click “Request first class,” share the basics, and BUMA can follow up with the right program, timing and next steps.';
  }
  if (normalized.includes('phone') || normalized.includes('number') || normalized.includes('contact')) {
    return 'BUMA’s website lists (716) 671-7197 and info@fightfamily.com. Google Maps lists a different number, (716) 563-0720; I can’t confirm which is current. Email is another way to reach the team.';
  }
  if (normalized.includes('schedule') && documents.length > 1) {
    return `Published schedule highlights: ${documents.map((document) => document.text).join(' ')} Schedules can change, so confirm before your first visit.`;
  }
  return `${documents[0].text}${documents[0].category === 'schedule' ? ' Schedules can change, so confirm before your first visit.' : ''}`;
}

function localActions(query, documents) {
  const normalized = normalize(query);
  const categories = new Set(documents.map((document) => document.category));
  if (/\b(book|booking|reserve|reservation|appointment|register|registration|enroll|enrollment|join|sign up|signup|first class|try a class|try class|interested|price|pricing|cost|membership|trial|fee|discount)\b/.test(normalized)) {
    return [
      { label: 'Request first class', href: leadFormUrl },
      { label: 'Call the academy', href: 'tel:+17166717197' },
      { label: 'Email BUMA', href: 'mailto:info@fightfamily.com' },
    ];
  }
  if (categories.has('schedule')) {
    return [
      { label: 'View class schedule', href: '#schedule' },
      { label: 'Request first class', href: leadFormUrl },
      { label: 'Call the academy', href: 'tel:+17166717197' },
    ];
  }
  if (categories.has('programs') || categories.has('about')) {
    return [
      { label: 'Request first class', href: leadFormUrl },
      { label: 'View class schedule', href: '#schedule' },
      { label: 'Call the academy', href: 'tel:+17166717197' },
    ];
  }
  return [];
}

function safeActionHref(href) {
  try {
    const url = new URL(href, location.href);
    return ['https:', 'http:', 'tel:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function appendMessage(text, role, sources = [], note = '', actions = []) {
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
  if (role === 'assistant' && actions.length) {
    const actionList = document.createElement('div');
    actionList.className = 'chat-actions';
    actions.slice(0, 3).forEach((action) => {
      const href = safeActionHref(action?.href || '');
      if (!href || typeof action?.label !== 'string') return;
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.textContent = action.label.slice(0, 40);
      if (href.startsWith('http')) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
      actionList.appendChild(anchor);
    });
    if (actionList.children.length) messages.appendChild(actionList);
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

async function requestAssistant(message, history) {
  if (!endpoint) throw new Error('No assistant endpoint configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, visitorId: chatVisitorId() }),
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
  const priorHistory = conversationHistory.slice(-6);
  appendMessage(clean, 'user');
  conversationHistory.push({ role: 'user', content: clean });
  input.value = '';
  input.style.height = 'auto';
  suggestions.style.display = 'none';
  const typing = document.createElement('div');
  typing.className = 'message assistant typing';
  typing.innerHTML = '<p aria-label="Assistant is responding">•••</p>';
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;
  setBusy(true, 'One moment…');
  const minimumReplyDelay = wait(typingDelayFor(clean));

  try {
    const result = await requestAssistant(clean, priorHistory);
    await minimumReplyDelay;
    typing.remove();
    const note = '';
    appendMessage(result.answer, 'assistant', result.sources || [], note, result.actions || []);
    conversationHistory.push({ role: 'assistant', content: result.answer.slice(0, 500) });
    setBusy(false, 'Ready');
  } catch {
    const contextQuery = followupQuery(clean, priorHistory);
    const documents = retrieve(contextQuery);
    const fallback = composeLocal(contextQuery, documents);
    await minimumReplyDelay;
    typing.remove();
    const safety = /\b(911|emergency|unconscious|not breathing|severe bleeding|immediate danger|injury|injured|pain|medical|diagnose|concussion|medicine)\b/.test(normalize(clean));
    const friendly = safety ? null : customerReply(normalize(contextQuery));
    const fallbackSources = safety ? [] : friendly ? BUMA_KNOWLEDGE.filter(item => friendly.sourceIds.includes(item.id)) : documents.slice(0, 1);
    const actionOptions = { leadForm: {label: 'Request first class', href: leadFormUrl}, call: {label: 'Call the academy', href: 'tel:+17166717197'}, schedule: {label: 'View class schedule', href: '#schedule'} };
    const fallbackActions = safety ? [] : friendly ? friendly.actions.map(key => actionOptions[key]).filter(Boolean) : localActions(clean, documents);
    appendMessage(fallback, 'assistant', fallbackSources, 'Connection interrupted. Here’s what I can tell you from the website.', fallbackActions);
    conversationHistory.push({ role: 'assistant', content: fallback.slice(0, 500) });
    setBusy(false, 'Ready');
  }
  if (widget.classList.contains('open')) input.focus();
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
  conversationHistory.length = 0;
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
messages.addEventListener('click', (event) => {
  const link = event.target.closest('.chat-actions a');
  if (link && new URL(link.href, location.href).hash === '#schedule') setChat(false);
});
