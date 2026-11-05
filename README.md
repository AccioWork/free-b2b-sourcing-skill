# free-b2b-sourcing

A free B2B sourcing skill for AI agents. It drives the free web version of [Accio Work](https://www.accio.com/work/app) (agent `accio-com-buyer-assistant`) through a connected browser and returns structured product / supplier data — no paid API, no keys, no scraping of raw SERPs.

## What you get

One natural-language sourcing request in, structured JSON out:

- `layout: "suppliers"` — supplier cards: name, source (Alibaba.com), years, region/country, store rating, reorder rate, on-time delivery, certifications, main categories, and 3 sample products with price + MOQ.
- `layout: "products"` — product cards: title, price(s), min order, supplier name/years/country/rating, verified flag, and how many of your requirements matched.
- `layout: "text"` — free-form answer for market/trend style questions.

## Requirements

- An agent runtime with browser automation compatible with the Qoder `browser-use` skill (connected Chrome/Edge via Qoder Browser Connector).
- A browser profile signed in at www.accio.com (Google or email). The free tier is enough; non-logged-in runs return `LOGIN_REQUIRED` so the agent can hand the tab to a human.

## Install

Copy the `free-b2b-sourcing/` folder into your skills directory:

- project: `.qoder/skills/free-b2b-sourcing/`
- user: `~/.qoder/skills/free-b2b-sourcing/`

Then reload skills (`/skills reload`) or restart the session.

## Use

```js
// in the Qoder Node REPL, after browser-use connected a tab
var mod = await import('<SKILL_DIR>/scripts/sourcing.mjs');
var out = await mod.runSourcing(tab, {
  query: 'Find 5 suppliers of stainless steel insulated water bottles, MOQ under 500, with price ranges',
});
nodeRepl.write({ ok: out.ok, layout: out.layout, items: out.items });
```

See `free-b2b-sourcing/SKILL.md` for the full agent workflow, output schema and error codes.

## How it works

1. Opens `accio.com/work/app` with the sourcing agent preselected.
2. Writes the query into the chat composer (dispatched paste event — the Lexical editor ignores synthetic fill/keypress) and submits.
3. Waits for the agent run to settle (result cards stream into `iframe[src*="buyer-agent-chatui-message"]`).
4. Reads the card slot text and parses it into the schemas above; falls back to the accessibility-tree transcript when no card slot is rendered.

## Limits

- One run takes ~30–120 s; the free tier has a credit balance, so batch queries sensibly.
- Cards expose no deep links (click-driven UI); prices are as displayed (often CN¥).
- UI changes inside Accio Work can break parsing; `out.raw` always contains the untouched text for manual repair.
