# Buffalo United Martial Arts website concept

A responsive, dependency-free website concept for Buffalo United Martial Arts Academy. Open `index.html` directly or serve this folder with any static web server.

## Included

- Responsive editorial landing page using imagery currently published by the academy
- Programs, published schedule, instructor team, review proof and location/contact sections
- Bottom-right “Ask BUMA” assistant with local retrieval over a curated knowledge base
- Grounded source links on every retrieved answer
- Explicit handling of uncertain information, including unpublished prices and the two phone numbers found across the official page and Google listing
- Keyboard navigation, semantic landmarks, reduced-motion support and mobile layout

## RAG architecture

The prototype implements retrieval locally in `knowledge.js` and `app.js`: questions are normalized, matched to weighted academy passages and answered only from the highest-scoring evidence. This makes the demo functional without an API key and prevents invented prices or policies.

For production, keep `knowledge.js` as the seed corpus but move retrieval and generation behind a server endpoint. Recommended flow:

1. Crawl approved official pages and owner-supplied documents.
2. Chunk and embed them in a vector database.
3. Retrieve the top relevant chunks with metadata.
4. Generate an answer with a strict “use only retrieved context” prompt.
5. Return citations and a low-confidence fallback to contact the academy.

Never expose an LLM API key in browser JavaScript.

## Research caveats

- Verified against the official site and contact page on September 5, 2026.
- Published class times may change; the UI tells visitors to confirm.
- The current official page displays `(716) 671-7197`, but its `tel:` link and the provided Google listing use `(716) 563-0720`.
- Current pricing and trial terms were not found on the official pages and are intentionally not asserted.

## Primary sources

- [Official home](https://buffalounitedmartialarts.com/home)
- [Official contact page](https://buffalounitedmartialarts.com/contact-us)
- [Google Maps listing](https://www.google.com/maps/search/?api=1&query=Buffalo+United+Martial+Arts+Academy+359+Ganson+St+Buffalo+NY)
