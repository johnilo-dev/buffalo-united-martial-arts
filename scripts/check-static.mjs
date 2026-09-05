import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = ['index.html', 'styles.css', 'app.js', 'knowledge.js'];
const errors = [];

for (const file of requiredFiles) {
  try {
    await stat(resolve(root, file));
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

const html = await readFile(resolve(root, 'index.html'), 'utf8');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
const worker = await readFile(resolve(root, 'worker/src/index.js'), 'utf8');
const combined = `${html}\n${app}\n${worker}`;

for (const localReference of [...html.matchAll(/(?:src|href)="(?!https?:|mailto:|tel:|#)([^"?#]+)[^"]*"/g)].map((match) => match[1])) {
  try {
    await stat(resolve(root, localReference));
  } catch {
    errors.push(`Broken local reference: ${localReference}`);
  }
}

if (/sk-[a-z0-9]{16,}/i.test(combined)) errors.push('Possible API key found in tracked source');
if (/[↗↘↓]/.test(html)) errors.push('Directional Unicode glyph found; use CSS icons to avoid emoji rendering on iOS');
if (!html.includes('type="module" src="app.js"')) errors.push('app.js must load as an ES module');
if (!worker.includes("model: 'deepseek-v4-flash'")) errors.push('Worker is not configured for deepseek-v4-flash');
if (!html.includes('noindex, nofollow')) errors.push('Temporary personal preview must remain noindex');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Static checks passed.');
}
