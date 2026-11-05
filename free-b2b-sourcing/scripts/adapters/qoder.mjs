/**
 * Qoder browser-use adapter for sourcing.mjs
 *
 * Wraps a Qoder browser-use Tab object into the minimal adapter interface
 * required by runSourcingWithAdapter(). Other platforms should implement
 * the same interface — see INTERFACE.md.
 *
 * Usage (inside Qoder Node REPL, after browser-use skill is loaded):
 *
 *   var { createBrowserAgent } = await import('@qoder-space/browser-use');
 *   var agent   = await createBrowserAgent();
 *   var browser = await agent.browsers.get(browserId);
 *   var tab     = await browser.tabs.new();
 *
 *   var { runSourcing } = await import('<SKILL_DIR>/scripts/sourcing.mjs');
 *   var out = await runSourcing(tab, { query: 'ceramic coffee mugs wholesale' });
 *   // runSourcing internally calls createQoderAdapter(tab)
 *
 *   // Or use the adapter directly:
 *   var { createQoderAdapter } = await import('<SKILL_DIR>/scripts/adapters/qoder.mjs');
 *   var { runSourcingWithAdapter } = await import('<SKILL_DIR>/scripts/sourcing.mjs');
 *   var out2 = await runSourcingWithAdapter(createQoderAdapter(tab), { query: '...' });
 */

/**
 * @param {object} tab  Qoder browser-use Tab (from browser.tabs.new() or browser.user.claimTab())
 * @returns {object} Adapter implementing the interface in INTERFACE.md
 */
export function createQoderAdapter(tab) {
  return {
    // ── Navigation ──────────────────────────────────────────────────────────
    goto: (url) => tab.goto(url),
    url: () => tab.playwright.url(),

    // ── Element finding ─────────────────────────────────────────────────────
    // Returns Playwright-compatible locator objects.
    locator: (selector) => tab.playwright.locator(selector),
    frameLocator: (selector) => tab.playwright.frameLocator(selector),
    getByRole: (role, opts) => tab.playwright.getByRole(role, opts),
    getByText: (text, opts) => tab.playwright.getByText(text, opts),

    // ── Waiting ─────────────────────────────────────────────────────────────
    waitForTimeout: (ms) => tab.playwright.waitForTimeout(ms),

    // ── Accessibility tree (AX fallback path) ───────────────────────────────
    axState: () => tab.ax.get('state', { disableDiffing: true }),

    // ── User handoff for login or sensitive steps ───────────────────────────
    requestManualHandoff: () => tab.requestManualHandoff(),

    // ── Coordinate-based interaction (CUA) ──────────────────────────────────
    // Used for composer focus and send-button click when semantic locators
    // are insufficient.
    cuaClick: (x, y) => tab.cua.click({ x, y }),
    cuaType: (text) => tab.cua.type({ text }),
  };
}
