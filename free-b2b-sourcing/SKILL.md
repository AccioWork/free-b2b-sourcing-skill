---
name: free-b2b-sourcing
description: Free B2B product and supplier sourcing through Accio Work's free web AI agent, driven via a connected browser (browser-use). Use when an agent or user needs suppliers, manufacturers, wholesalers, price ranges, MOQ, ratings or product-sourcing results for a keyword without paid APIs or keys. Returns structured JSON of supplier cards or product cards. Requires a browser connector and a signed-in accio.com session in the connected browser.
---

# Free B2B Sourcing (Accio Work)

## Overview

Drive the free Accio Work web sourcing agent (`accio-com-buyer-assistant`) in a connected browser and return structured results. No API keys and no paid tier: it reuses the signed-in accio.com session of the connected browser profile.

## Prerequisites

- Qoder browser connector with Chrome/Edge connected (load the `browser-use` skill first).
- The connected browser profile is signed in at www.accio.com (Google or email login). The free tier is sufficient.
- If `runSourcing` returns `LOGIN_REQUIRED`, call `await tab.requestManualHandoff()`, ask the user to sign in in the real browser tab, wait for their next message, then re-run. Never type or infer credentials yourself.

## Workflow

1. Connect per the browser-use skill: `createBrowserAgent()` → `agent.browsers.list()` → `agent.browsers.get(id)` → `browser.tabs.new()`.
2. Run the bundled driver (replace `<SKILL_DIR>` with this skill's directory):

   ```js
   var mod = await import('<SKILL_DIR>/scripts/sourcing.mjs');
   var out = await mod.runSourcing(tab, { query: 'Find 5 suppliers of stainless steel insulated water bottles, MOQ under 500, with price ranges' });
   nodeRepl.write({ ok: out.ok, layout: out.layout, items: out.items });
   ```

3. On `ok: true`, consume `out.items`; keep `out.raw` to verify or repair parsing.
4. Leave the tab to normal browser-use cleanup (agent tabs auto-close), or `markDeliverable()` if the user should inspect it.

## Query style

Pass one complete natural-language sourcing request. Constraints (MOQ, target price, certification, country, verified supplier) are honored by the agent and surfaced per item (`requirement_match`). Product-finding queries return `layout: 'products'`; supplier-finding queries return `layout: 'suppliers'`; market/trend questions return `layout: 'text'`.

## Output schema

`{ ok, query, layout, query_echo, items[], raw }`

- `layout: 'suppliers'` → item: `{ type, name, source, verified, years, region, country, metrics: { 'Store rating', 'Reorder rate', 'On-time delivery', Certifications }, main_categories[], products: [{ price, min_order }] }`
- `layout: 'products'` → item: `{ type, title, prices[], min_order, supplier, supplier_years, supplier_country, supplier_verified, supplier_rating: { value, reviews }, requirement_match }`
- `layout: 'text'` → free-form answer in `out.text`.
- Errors: `LOGIN_REQUIRED`, `SUBMIT_FAILED`, `TIMEOUT`, `COMPOSER_NOT_FOUND`, `MISSING_QUERY`.

## Notes and limits

- `runSourcing` handles the composer internally (dispatched paste event + Enter): the Lexical editor ignores Playwright `fill()`/`press()` text and CUA typing depends on OS window focus, so never type into it yourself.
- Results render in `iframe[src*="buyer-agent-chatui-message"]`; the driver reads its innerText and parses it. If the UI changes and parsing degrades, fall back to `out.raw` and parse manually.
- One run takes ~30–120 s end to end. Reuse one tab for sequential queries. Batch keywords and avoid tight loops; the free tier has a visible credit balance (top-right of the app).
- Prices are as displayed (often CN¥); convert yourself when needed.
- Cards are click-driven: the DOM exposes no product/supplier hrefs. To open one, click its `Chat now` button inside the frame.
