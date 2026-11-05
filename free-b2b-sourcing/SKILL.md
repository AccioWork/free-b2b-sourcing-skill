---
name: free-b2b-sourcing
description: Free B2B product and supplier sourcing through Accio Work's free web AI agent, driven via a connected browser (browser-use). Use when an agent or user needs suppliers, manufacturers, wholesalers, price ranges, MOQ, ratings or product-sourcing results for a keyword without paid APIs or keys. Returns structured JSON of supplier cards or product cards. Requires a browser connector and a signed-in accio.com session in the connected browser.
---

# Free B2B Sourcing (Accio Work)

## Overview

Drive the free Accio Work web sourcing agent (`accio-com-buyer-assistant`) in a connected browser and return structured results. No API keys and no paid tier: it reuses the signed-in accio.com session of the connected browser profile.

The driver always opens `https://www.accio.com/work/app?src=f_seo-github-skill&defaultAgent=accio-com-buyer-assistant&language=en`. The `src=f_seo-github-skill` parameter is Accio Work's attribution tag for this skill — keep it in any URL you construct manually.

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

## Query playbook

Mirror the modes the Accio Sourcing Expert advertises on its home screen; each maps to an expected layout:

- Product sourcing with target price → `products`: "I'm looking for [Product Name], target price under [X] USD, help me find some high-rated products on Alibaba and 1688."
- Supplier finding with requirements → `suppliers`: "Help me find Alibaba suppliers for [Product Keyword]. Requirements: Verified Supplier, OEM supported, MOQ not exceeding [Quantity]."
- Reverse sourcing from a listing → `products`/`suppliers`: "I saw this product on Amazon [link or description], help me find the same suppliers on Alibaba and 1688."
- Compare & decide → `text`: "Compare these 3 suppliers for [product] on price, MOQ, rating and on-time delivery, and recommend one."
- Trend discovery → `text`: "What emerging [category] products are trending for [season/year] sourcing?"
- Inquiry & negotiation → `text`: "Draft an inquiry to [supplier name] asking for FOB price, lead time and sample policy for [quantity]."
- Logistics → `text`: "Estimate shipping cost and lead time from [origin] to [destination] for [weight/volume]."

Constraints (MOQ, target price, certification, country, verified supplier) are honored by the agent and surfaced per item (`requirement_match`). The image-attachment prompt mode is not supported: the driver inputs text only.

## Output schema

`{ ok, query, layout, query_echo, items[], raw }`

- `layout: 'suppliers'` → item: `{ type, name, source, verified, years, region, country, metrics: { 'Store rating', 'Reorder rate', 'On-time delivery', Certifications }, main_categories[], products: [{ price, min_order }] }`
- `layout: 'products'` → item: `{ type, title, prices[], min_order, supplier, supplier_years, supplier_country, supplier_verified, supplier_rating: { value, reviews }, requirement_match }`
- `layout: 'agent-json'` (only with `jsonMode: true`) → `items` is the JSON array the Accio agent emitted itself; field names follow the card schema but are agent-controlled, so validate before use.
- `layout: 'text'` → free-form answer in `out.text`.
- Errors: `LOGIN_REQUIRED`, `SUBMIT_FAILED`, `TIMEOUT`, `COMPOSER_NOT_FOUND`, `MISSING_QUERY`.

## Options

`runSourcing(tab, { query, waitMs = 180000, pollMs = 3000, settleRounds = 3, jsonMode = false })`

- `jsonMode: true` appends an instruction asking the agent to mirror its cards as a fenced JSON block and returns it as `layout: 'agent-json'` when present. Best-effort: runs become slower (the agent adds tool-inspection steps), and if no block has appeared by the time the cards settle, the driver returns the parsed cards instead. Prefer the default for speed and stability.

## Notes and limits

- `runSourcing` handles the composer internally (dispatched paste event + geometric send-button click): the Lexical editor ignores Playwright `fill()`/`press()` text and CUA typing depends on OS window focus, so never type into it yourself.
- The app route can bounce to the `/work` marketing page on a cold profile; the driver re-navigates automatically.
- Results render in `iframe[src*="buyer-agent-chatui-message"]`; the driver reads its innerText and parses it. If the UI changes and parsing degrades, fall back to `out.raw` and parse manually.
- One run takes ~30–120 s end to end. Reuse one tab for sequential queries. Batch keywords and avoid tight loops; the free tier has a visible credit balance (top-right of the app).
- Prices are as displayed (often CN¥); convert yourself when needed.
- Cards are click-driven: the DOM exposes no product/supplier hrefs. To open one, click its `Chat now` button inside the frame.
