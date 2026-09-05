# Buffalo United Martial Arts website

A responsive website and guarded information assistant for Buffalo United Martial Arts Academy. Serve the folder with a static web server; the frontend uses ES modules and should not be opened through `file://`.

## Included

- Responsive editorial landing page using imagery currently published by the academy
- Programs, published schedule, instructor team, review proof and location/contact sections
- Bottom-right “Ask BUMA” virtual receptionist with deterministic answers and local retrieval over a curated knowledge base
- Grounded source links on every retrieved answer
- Explicit handling of uncertain information, including unpublished prices and the two phone numbers found across the official page and Google listing
- Live Buffalo-area weather responses through the National Weather Service, cached server-side
- AI budget protection with request limits before DeepSeek is called
- Keyboard navigation, semantic landmarks, reduced-motion support and mobile layout

## Local development

```sh
python -m http.server 4173
```

Then open `http://localhost:4173/`. Run `npm run verify` before committing.

## Assistant architecture

The browser calls a Cloudflare Worker through the configured Worker URL. The Worker retrieves relevant passages from `knowledge.js` and uses `deepseek-v4-flash` only when the encrypted `DEEPSEEK_API_KEY` secret is present. If the model or provider is unavailable, it returns a deterministic answer from the retrieved public information.

Request flow:

1. Crawl approved official pages and owner-supplied documents.
2. Retrieve the most relevant approved public passages on the Worker.
3. Handle greetings, assistant identity, services, emergencies, medical questions, prices and bookings through deterministic receptionist routes.
4. Use a maximum of six recent in-memory messages to resolve follow-up questions; conversation history is not persisted.
5. Generate a short receptionist answer using only retrieved context when the model is available.
6. Return validated citations, useful call/email/schedule/directions actions, or a grounded deterministic fallback.

The Worker uses layered limits so common questions do not drain the DeepSeek balance:

1. General chat requests are limited to 20 requests per minute.
2. DeepSeek-eligible requests are separately limited to 5 AI attempts per minute.
3. A Durable Object tracks daily AI usage across the Worker: 25 AI calls per browser, 40 per IP address and 250 total AI calls per day by default.
4. The browser sends a random local visitor ID for budget tracking. It is not a login, lead record or chat transcript.
5. If an AI limit is reached, the assistant returns the deterministic retrieved answer and explains that AI-assisted answers are being limited.

The in-memory limiters are retained only as local-development fallbacks.

Weather questions are answered by the Worker through the National Weather Service API and cached for 10 minutes. Weather responses do not use DeepSeek.

Never expose an LLM API key in browser JavaScript.

### Worker deployment

`wrangler.toml` contains non-secret configuration. Add a newly generated key directly to Cloudflare—not to chat, source files or command history:

```sh
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

The personal GitHub Pages deployment is intentionally marked `noindex` while it is used for stakeholder testing. Remove that directive only when the final domain and content are approved.

## Research caveats

- Verified against the official site and contact page on September 5, 2026.
- Published class times may change; the UI tells visitors to confirm.
- The current official page displays `(716) 671-7197`, but its `tel:` link and the provided Google listing use `(716) 563-0720`.
- Current pricing and trial terms were not found on the official pages and are intentionally not asserted.

## Primary sources

- [Official home](https://buffalounitedmartialarts.com/home)
- [Official contact page](https://buffalounitedmartialarts.com/contact-us)
- [Google Maps listing](https://www.google.com/maps/search/?api=1&query=Buffalo+United+Martial+Arts+Academy+359+Ganson+St+Buffalo+NY)
- [National Weather Service API](https://www.weather.gov/documentation/services-web-API)
