# Browser Adapter Interface

`runSourcingWithAdapter(adapter, opts)` requires an adapter object with the
methods below. The Qoder implementation is in `qoder.mjs`; other platforms
should provide an equivalent.

## Required adapter methods

| Method | Signature | Purpose |
|---|---|---|
| `goto` | `(url: string) => Promise<void>` | Navigate to URL |
| `url` | `() => Promise<string>` | Return current page URL |
| `locator` | `(selector: string) => Locator` | Find elements by CSS selector |
| `frameLocator` | `(selector: string) => FrameLocator` | Access cross-origin iframes |
| `getByRole` | `(role: string, opts?) => Locator` | Find by ARIA role |
| `getByText` | `(text: string, opts?) => Locator` | Find by visible text |
| `waitForTimeout` | `(ms: number) => Promise<void>` | Wait |
| `axState` | `() => Promise<string>` | Accessibility tree snapshot (fallback path) |
| `requestManualHandoff` | `() => Promise<void>` | Hand off to user for login |
| `cuaClick` | `(x: number, y: number) => Promise<void>` | Click at viewport coordinates |
| `cuaType` | `(text: string) => Promise<void>` | Type at current focus |

## Locator interface

Objects returned by `locator()`, `frameLocator()`, `getByRole()`, `getByText()`
must support:

| Method | Purpose |
|---|---|
| `count()` | Number of matching elements |
| `nth(i)` | Nth matching element |
| `first()` | First matching element |
| `innerText(opts?)` | Visible text content |
| `boundingBox(opts?)` | Viewport rect `{x, y, width, height}` or null |
| `click(opts?)` | Click the element |
| `fill(value, opts?)` | Replace element value |
| `press(key, opts?)` | Press a key while focused |
| `evaluate(fn, arg?)` | Run JS in element scope (used for paste dispatch) |
| `isVisible()` | Whether element is visible |
| `waitFor(opts?)` | Wait for element state |
| `getAttribute(name, opts?)` | Read an attribute |
| `locator(selector)` | Descendant locator |
| `getByRole(role, opts?)` | Descendant by ARIA role |
| `getByText(text, opts?)` | Descendant by text |

## Platform notes

### Grok Bot (cloud browser)

Grok Bot runs a persistent cloud computer with a browser. The adapter maps to
its computer-use API:

- `goto` / `url` → browser navigation commands
- `locator` / `frameLocator` → Playwright calls through its browser tool
- `axState` → accessibility snapshot from its computer-use interface
- `requestManualHandoff` → Grok Bot's Secure Form or manual takeover flow
- `cuaClick` / `cuaType` → its coordinate-based computer-use actions

Accio login must be completed by the user in the Grok Bot browser before first
use. The session persists across runs (Grok Bot shares browser cookies across
all Bots on the same account).

### OpenClaw

Use OpenClaw's `existing-session` browser mode to reuse the user's signed-in
Chrome. The adapter maps to its browser MCP tool:

- `locator` / `frameLocator` → Playwright calls through the browser tool
- `axState` → accessibility snapshot
- `requestManualHandoff` → surface a message asking the user to sign in

OpenClaw's managed browser profile does **not** inherit the user's Chrome
login; `existing-session` mode is required.

### Claude Code / Desktop

Wrap a local Playwright instance in an MCP server. The adapter runs in the MCP
server process:

- `locator` / `frameLocator` → standard Playwright calls
- `axState` → `page.accessibility.snapshot()` or equivalent
- `requestManualHandoff` → return a message to the user via MCP response

Claude Desktop's remote MCP connector runs in Anthropic's cloud and does
**not** have access to the user's local browser. Use a local stdio MCP server
instead.

### Cursor

Cursor's built-in browser is workspace-isolated and does **not** inherit the
user's Chrome login. A separate Accio sign-in flow is required on first use.

## parseSourcingText

`parseSourcingText(text)` is a pure function with no platform dependency.
Any adapter can call it directly on raw iframe text to get structured items:

```js
import { parseSourcingText } from '<SKILL_DIR>/scripts/sourcing.mjs';
const result = parseSourcingText(rawIframeText);
// result: { layout, query_echo, items }
```

## validateConstraints

`validateConstraints(items, constraints)` is also a pure function:

```js
import { validateConstraints } from '<SKILL_DIR>/scripts/sourcing.mjs';
const { items: filtered, excluded } = validateConstraints(result.items, {
  maxMOQ: 500,
  verifiedOnly: true,
  minRating: 4.0,
});
```
