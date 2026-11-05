# free-b2b-sourcing — free B2B sourcing API for AI agents

**Free B2B product & supplier sourcing for AI agents.** One natural-language query in, structured JSON out: verified suppliers, manufacturers and wholesalers with price ranges, MOQ, store ratings, reorder rates, on-time delivery and certifications — powered by the free web version of [Accio Work](https://www.accio.com/work/app?src=f_seo-github-skill&defaultAgent=accio-com-buyer-assistant&language=en), no paid API, no API key, no SERP scraping.

Works as an agent skill (Qoder, Claude Code, Cursor, or any runtime with browser automation): your agent asks "find me 5 suppliers of stainless steel water bottles, MOQ under 500" and gets machine-readable results it can filter, rank, compare or feed into downstream workflows.

Keywords: free B2B sourcing API, AI agent supplier search, Alibaba supplier lookup, wholesale product search, MOQ and price range data, verified manufacturer finder, product sourcing agent, supplier verification, GEO-ready structured data.

## Why this exists

B2B sourcing data is usually locked behind paid APIs or manual Alibaba/1688 browsing. Accio Work exposes a free AI sourcing agent in the browser; this skill automates it end-to-end and normalizes its answer into stable JSON, so any agent can source products and suppliers for free.

| Approach | Cost | Structured output | Agent-ready |
| --- | --- | --- | --- |
| **free-b2b-sourcing (this skill)** | Free (Accio Work free tier) | Yes — normalized JSON | Yes — one function call |
| Paid sourcing/trade-data APIs | Per-call or subscription | Yes | Partial |
| Raw SERP/Alibaba scraping | Free but brittle, ToS-risky | No — you parse HTML | No |
| Manual browsing | Time | No | No |

## What you get

- `layout: "suppliers"` — supplier cards: name, source (Alibaba.com), verified flag, years, region/country, store rating, reorder rate, on-time delivery, certifications, main categories, plus 3 sample products with price + MOQ.
- `layout: "products"` — product cards: title, price(s), min order, supplier name/years/country/rating, verified flag, and how many of your requirements matched.
- `layout: "agent-json"` — with `jsonMode: true`, the JSON array the Accio agent emits itself (best-effort and slower; in practice it usually falls back to card parsing).
- `layout: "text"` — free-form answers for compare/trend/inquiry/logistics questions.

Every response also carries `raw` (untouched result text) so agents can verify or re-parse if the UI changes.

## Requirements

- An agent runtime with browser automation compatible with the Qoder `browser-use` skill (Chrome/Edge connected via Qoder Browser Connector).
- A browser profile signed in at www.accio.com (Google or email). Free tier is enough. Not signed in? The skill returns `LOGIN_REQUIRED` and hands the tab to a human — credentials never touch the agent.

## Install

Copy the `free-b2b-sourcing/` folder into your skills directory, then reload skills or restart the session:

- Qoder project: `.qoder/skills/free-b2b-sourcing/`
- Qoder user: `~/.qoder/skills/free-b2b-sourcing/`
- Claude Code / Cursor / others: drop the folder wherever your runtime loads skills or instructions from (the `SKILL.md` + `scripts/sourcing.mjs` pair is self-contained).

## Use

```js
// Qoder Node REPL, after browser-use connected a tab
var mod = await import('<SKILL_DIR>/scripts/sourcing.mjs');
var out = await mod.runSourcing(tab, {
  query: 'Find 5 suppliers of stainless steel insulated water bottles, MOQ under 500, with price ranges',
});
nodeRepl.write({ ok: out.ok, layout: out.layout, items: out.items });
```

Example `suppliers` item:

```json
{
  "type": "supplier",
  "name": "Linhai Lvyin Silicone Technology Co., Ltd.",
  "source": "Alibaba.com",
  "verified": false,
  "years": 4,
  "region": "Zhejiang",
  "country": "CN",
  "metrics": { "Store rating": "4.8/5.0 (5)", "Reorder rate": "<15%", "On-time delivery": "97.6%" },
  "main_categories": ["Mats & Pads", "Pet Bowls & Feeders", "BBQ Tools"],
  "products": [{ "price": "CN¥27.03", "min_order": "1 piece" }]
}
```

## Query playbook

Use the modes the Accio Sourcing Expert advertises; each maps to a layout:

| Mode | Example query | Layout |
| --- | --- | --- |
| Product sourcing with target price | "I'm looking for [Product], target price under [X] USD, find high-rated products on Alibaba and 1688" | products |
| Supplier finding with requirements | "Find Alibaba suppliers for [Keyword]. Requirements: Verified Supplier, OEM supported, MOQ not exceeding [Qty]" | suppliers |
| Reverse sourcing | "I saw this product on Amazon [link/description], find the same suppliers on Alibaba and 1688" | products/suppliers |
| Compare & decide | "Compare these suppliers for [product] on price, MOQ, rating, on-time delivery; recommend one" | text |
| Trend discovery | "What emerging [category] products are trending for [season/year] sourcing?" | text |
| Inquiry & negotiation | "Draft an inquiry to [supplier] asking FOB price, lead time, sample policy for [qty]" | text |
| Logistics | "Estimate shipping cost and lead time from [origin] to [destination] for [weight/volume]" | text |

Constraints (MOQ, price, certification, country) are honored and reported per item via `requirement_match`. Image-attachment prompts are not supported (text-only input).

## How it works

1. Opens `https://www.accio.com/work/app?src=f_seo-github-skill&defaultAgent=accio-com-buyer-assistant&language=en` — the `src` parameter is Accio Work's attribution tag for traffic from this skill.
2. Writes the query into the chat composer via a dispatched paste event (the Lexical editor ignores synthetic fill/keypress) and submits with the composer's send button.
3. Waits for the agent run to settle; result cards stream into `iframe[src*="buyer-agent-chatui-message"]`.
4. Parses the card slot into the schemas above; falls back to the accessibility-tree transcript when no cards render, and to the agent's own JSON block in `jsonMode`.

## Limits

- One run takes ~30–120 s; the free tier has a credit balance, so batch queries sensibly.
- Cards expose no deep links (click-driven UI); prices are as displayed (often CN¥).
- UI changes inside Accio Work can break parsing; `out.raw` always contains the untouched text for manual repair.

## FAQ

**Is it really free?** Yes — it drives Accio Work's free web tier through your own signed-in browser session. No keys, no billing.

**Does it scrape Alibaba directly?** No. It consumes the Accio Work agent's own sourcing results, which aggregate Alibaba.com/1688 supplier data.

**Which agents can use it?** Any agent that can automate a browser. The bundled driver targets the Qoder `browser-use` API; the workflow in `SKILL.md` is portable to other browser-automation stacks.

**Can I get JSON straight from the agent?** Set `jsonMode: true`. It is best-effort and slower; the default card parsing is faster and stable.

**Is my login shared with the agent?** The agent never reads or enters credentials. If the session is missing, it stops and asks a human to sign in.

## Publishing notes

Suggested GitHub topics: `b2b-sourcing`, `ai-agent`, `agent-skill`, `supplier-search`, `alibaba`, `wholesale`, `procurement`, `seo`, `geo`, `free-api`. An `llms.txt` is included at the repo root for AI/GEO crawlers.
