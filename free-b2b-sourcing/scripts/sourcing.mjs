/**
 * free-b2b-sourcing: drive Accio Work web (free tier) through a connected
 * browser tab and return structured sourcing results.
 *
 * Runs inside the Qoder Node REPL (browser-use skill). The REPL already holds
 * a trusted session; this module only needs the `tab` object.
 *
 *   var mod = await import('<SKILL_DIR>/scripts/sourcing.mjs');
 *   var out = await mod.runSourcing(tab, { query: 'ceramic coffee mugs wholesale' });
 */

const APP_URL =
  'https://www.accio.com/work/app?src=f_seo-github-skill&defaultAgent=accio-com-buyer-assistant&language=en';
const FRAME_SEL = 'iframe[src*="buyer-agent-chatui-message"]';

/**
 * Opt-in suffix that asks the Accio agent to mirror its result cards as a
 * fenced JSON block. Best-effort: it makes runs slower (the agent adds tool
 * steps) and is not guaranteed, so card parsing remains the default path.
 */
const JSON_SUFFIX =
  '\n\nAfter the result cards, also output ONE fenced ```json code block: an array with one object per card shown, using exactly these field names where present: type, name, title, source, verified, years, region, country, metrics, main_categories, products, prices, min_order, supplier, supplier_rating, requirement_match. No prose inside the block.';

/** Read the last fenced JSON array the agent rendered, if any. */
async function extractAgentJson(tab) {
  const blocks = tab.playwright.locator('pre, code');
  const n = await blocks.count().catch(() => 0);
  for (let i = n - 1; i >= 0; i--) {
    const t = String((await blocks.nth(i).innerText().catch(() => '')) || '').trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        const v = JSON.parse(t);
        if (Array.isArray(v) && v.length) return v;
      } catch {
        /* not json */
      }
    }
  }
  return null;
}

const PRICE_RE = /(CN¥|US\s?\$|€|£|\$)\s?[\d.,]+(\s?[-–]\s?[\d.,]+)?/;
const MIN_ORDER_RE = /^(Min\. order|MOQ)\s*[:：]?\s*(.+)$/i;
const YRS_RE = /^(\d+)\s*yrs?$/i;
const RATING_RE = /^\d+(\.\d+)?$/;
const FLAG_RE = /^(Verified|Verified Manufacturer|Verified Supplier)$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;

function isMetaLine(line) {
  return (
    FLAG_RE.test(line) ||
    YRS_RE.test(line) ||
    COUNTRY_RE.test(line) ||
    line === '/' ||
    RATING_RE.test(line) ||
    line === 'Chat now' ||
    line === 'Select' ||
    line === 'Alibaba.com' ||
    line === '1688.com'
  );
}

/** Split flat innerText into per-card segments using the 'Chat now' boundary. */
function splitCards(lines) {
  const segments = [];
  let cur = [];
  for (const line of lines) {
    if (line === 'Chat now') {
      segments.push({ body: cur, tail: [] });
      cur = [];
    } else if (segments.length && cur.length === 0 && /^Matches \d+\/\d+/.test(line)) {
      segments[segments.length - 1].tail.push(line);
    } else {
      cur.push(line);
    }
  }
  if (cur.length) segments.push({ body: cur, tail: [] });
  return segments.filter((s) => s.body.length > 1);
}

function readRating(lines, startIdx) {
  // pattern: <num> '/' <num>  or  <num> '/' <num> '(n)'
  for (let i = startIdx; i < lines.length - 2; i++) {
    if (RATING_RE.test(lines[i]) && lines[i + 1] === '/' && RATING_RE.test(lines[i + 2])) {
      const reviewMatch = lines[i + 3] && lines[i + 3].match(/^\((\d+)\)$/);
      return {
        rating: `${lines[i]}/${lines[i + 2]}`,
        reviews: reviewMatch ? Number(reviewMatch[1]) : null,
        consumed: reviewMatch ? 4 : 3,
        at: i,
      };
    }
  }
  return null;
}

function parseProductCard(seg) {
  const lines = seg.body;
  const item = { type: 'product' };
  const prices = [];
  let minOrder = null;
  let supplier = null;
  let years = null;
  let country = null;
  let verified = false;
  let rating = null;
  const rest = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const mo = line.match(MIN_ORDER_RE);
    if (mo) {
      minOrder = mo[2].trim();
      continue;
    }
    if (FLAG_RE.test(line)) {
      verified = true;
      continue;
    }
    const yr = line.match(YRS_RE);
    if (yr) {
      years = Number(yr[1]);
      continue;
    }
    if (COUNTRY_RE.test(line)) {
      country = line;
      continue;
    }
    if (PRICE_RE.test(line) && !/Matches/.test(line)) {
      prices.push(line);
      continue;
    }
    rest.push({ line, idx: i });
  }

  const r = readRating(lines, 0);
  if (r) rating = { value: r.rating, reviews: r.reviews };

  // title = first rest line; supplier = first rest line after the minOrder line
  const minOrderIdx = lines.findIndex((l) => MIN_ORDER_RE.test(l));
  const restLines = rest.map((x) => x.line);
  if (restLines.length) item.title = restLines[0];
  const afterMo = rest.find((x) => x.idx > minOrderIdx && !isMetaLine(x.line));
  if (afterMo) supplier = afterMo.line;
  else if (restLines.length > 1) supplier = restLines[restLines.length - 1];

  const matches = seg.tail.find((t) => /^Matches \d+\/\d+/.test(t));
  return {
    ...item,
    prices,
    min_order: minOrder,
    supplier: supplier || null,
    supplier_years: years,
    supplier_country: country,
    supplier_verified: verified,
    supplier_rating: rating,
    requirement_match: matches ? matches.replace(/^Matches\s*/, '') : null,
  };
}

function parseSupplierCard(seg) {
  const lines = seg.body;
  const item = { type: 'supplier' };
  item.name = lines[0] || null;
  item.source = lines.includes('Alibaba.com') ? 'Alibaba.com' : lines.includes('1688.com') ? '1688.com' : null;
  item.verified = lines.some((l) => FLAG_RE.test(l));
  const yr = lines.find((l) => YRS_RE.test(l));
  item.years = yr ? Number(yr.match(YRS_RE)[1]) : null;
  const cnIdx = lines.findIndex((l) => COUNTRY_RE.test(l));
  item.region = cnIdx > 0 ? lines[cnIdx - 1].replace(/,$/, '').trim() : null;
  item.country = cnIdx >= 0 ? lines[cnIdx] : null;

  const metrics = {};
  const metricLabels = ['Store rating', 'Reorder rate', 'On-time delivery', 'Certifications'];
  for (let i = 0; i < lines.length; i++) {
    if (metricLabels.includes(lines[i]) && lines[i + 1] && !metricLabels.includes(lines[i + 1])) {
      let val = lines[i + 1];
      const rev = lines[i + 2] && lines[i + 2].match(/^\((\d+)\)$/);
      if (lines[i] === 'Store rating' && rev) {
        val = `${val} (${rev[1]})`;
        i += 1;
      }
      metrics[lines[i]] = val;
      i += 1;
    }
  }
  item.metrics = metrics;

  const catIdx = lines.indexOf('Main categories');
  const firstPriceIdx = lines.findIndex((l) => PRICE_RE.test(l));
  item.main_categories =
    catIdx >= 0 ? lines.slice(catIdx + 1, firstPriceIdx > catIdx ? firstPriceIdx : undefined).filter((l) => !metricLabels.includes(l)) : [];

  const products = [];
  for (let i = firstPriceIdx >= 0 ? firstPriceIdx : lines.length; i < lines.length; i++) {
    if (PRICE_RE.test(lines[i])) {
      const mo = lines[i + 1] && lines[i + 1].match(MIN_ORDER_RE);
      products.push({ price: lines[i], min_order: mo ? mo[2].trim() : null });
      if (mo) i += 1;
    }
  }
  item.products = products;
  return item;
}

/** Parse the flat innerText of the sourcing content slot. */
export function parseSourcingText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return { layout: 'empty', items: [] };

  const hasMinOrder = lines.some((l) => MIN_ORDER_RE.test(l));
  const hasSupplierMetrics = lines.some((l) => l === 'Store rating' || l === 'Main categories');
  const queryEcho = lines[0];
  // The content slot echoes the query as its first line; drop it so the
  // first card segment starts at a real card field.
  const body = lines.slice(1);

  if (hasMinOrder && !hasSupplierMetrics) {
    const items = splitCards(body).map(parseProductCard);
    return { layout: 'products', query_echo: queryEcho, items };
  }
  if (hasSupplierMetrics) {
    const items = splitCards(body).map(parseSupplierCard);
    return { layout: 'suppliers', query_echo: queryEcho, items };
  }
  return { layout: 'text', query_echo: queryEcho, items: [], text: lines.join('\n') };
}

function composerOf(tab) {
  return tab.playwright.locator('[contenteditable="true"]').first();
}

/**
 * Put text into the Lexical composer. fill()/press() never reach its editor
 * state and CUA typing depends on OS window focus, but a dispatched paste
 * event with a DataTransfer is consumed reliably.
 */
async function pasteType(tab, text) {
  const ed = composerOf(tab);
  await ed.click({ timeout: 5000 }).catch(() => {});
  await ed.evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}
async function transcriptFallback(tab, query) {
  const state = await tab.ax.get('state', { disableDiffing: true }).catch(() => '');
  const s = typeof state === 'string' ? state : JSON.stringify(state);
  const lines = s
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\s/, '').trim())
    .filter(Boolean);
  const idx = lines.findIndex((l) => l.includes(query.slice(0, 40)));
  const tail = idx >= 0 ? lines.slice(idx + 1) : lines;
  return tail.join('\n');
}

async function detectLogin(tab) {
  const probes = ['Continue with Google', 'Sign in', 'Log in', 'Sign up'];
  for (const p of probes) {
    const n = await tab.playwright
      .getByText(p, { exact: false })
      .count()
      .catch(() => 0);
    if (n > 0) return p;
  }
  return null;
}

/**
 * Run one sourcing query end-to-end on the given tab.
 * @param {object} tab  browser-use tab (already created via browser.tabs.new())
 * @param {object} opts { query, waitMs=180000, pollMs=4000, settleRounds=2 }
 * @returns {object} { ok, layout, items, raw, ... } or { ok:false, error }
 */
export async function runSourcing(tab, opts = {}) {
  const { query, waitMs = 180000, pollMs = 3000, settleRounds = 3, jsonMode = false } = opts;
  if (!query) return { ok: false, error: 'MISSING_QUERY' };
  const sentQuery = jsonMode ? query + JSON_SUFFIX : query;

  await tab.goto(APP_URL);
  // The app route can bounce to the /work marketing page on a cold profile;
  // retry navigation until the composer (or a login dialog) appears.
  let navTries = 0;
  for (;;) {
    try {
      await composerOf(tab).waitFor({ state: 'visible', timeout: 20000 });
      break;
    } catch {
      const url = await tab.playwright.url().catch(() => '');
      if (!/\/work\/app/.test(url) && navTries < 3) {
        navTries += 1;
        await tab.goto(APP_URL);
        continue;
      }
      const login = await detectLogin(tab);
      if (login) {
        return {
          ok: false,
          error: 'LOGIN_REQUIRED',
          hint: 'Accio Work shows a login dialog ("' + login + '"). Ask the user to sign in manually in the real browser tab (Google or email), then re-run.',
        };
      }
      return { ok: false, error: 'COMPOSER_NOT_FOUND' };
    }
  }

  const composerText = async () => {
    try {
      return (await composerOf(tab).innerText()).trim();
    } catch {
      return null;
    }
  };
  const runStarted = async () => {
    const t = await composerText();
    if (t === '') return true;
    if ((await tab.playwright.getByRole('button', { name: 'Retry' }).count().catch(() => 0)) > 0) return true;
    return (await tab.playwright.locator(FRAME_SEL).count().catch(() => 0)) > 0;
  };
  // The send button has no accessible name and its DOM position shifts, so
  // find it geometrically: rightmost button in the composer footer band.
  const sendIndex = async () => {
    const cb = await composerOf(tab).boundingBox().catch(() => null);
    if (!cb) return -1;
    const btns = tab.playwright.locator('button');
    const n = await btns.count().catch(() => 0);
    let best = -1;
    let bestX = -1;
    for (let i = 0; i < n; i++) {
      const bb = await btns.nth(i).boundingBox().catch(() => null);
      if (
        bb &&
        bb.y >= cb.y + cb.height - 8 &&
        bb.y <= cb.y + cb.height + 90 &&
        bb.x >= cb.x &&
        bb.x <= cb.x + cb.width &&
        bb.x > bestX
      ) {
        bestX = bb.x;
        best = i;
      }
    }
    return best;
  };

  await pasteType(tab, sentQuery);
  let filled = false;
  const fillDeadline = Date.now() + 40000;
  while (Date.now() < fillDeadline && !filled) {
    await pasteType(tab, sentQuery);
    await tab.playwright.waitForTimeout(1500);
    filled = (await composerText()) === sentQuery.trim();
  }
  if (!filled) return { ok: false, error: 'COMPOSER_NOT_FOUND' };

  // Clicking the geometric send button is the reliable submit; Enter is the
  // fallback (it is flaky on cold tabs).
  let submitted = false;
  const submitDeadline = Date.now() + 40000;
  let round = 0;
  while (Date.now() < submitDeadline && !submitted) {
    if (round % 2 === 0) {
      const idx = await sendIndex();
      if (idx >= 0) {
        await tab.playwright
          .locator('button')
          .nth(idx)
          .click({ force: true, timeout: 2000 })
          .catch(() => {});
      }
    } else {
      await composerOf(tab).press('Enter').catch(() => {});
    }
    round += 1;
    await tab.playwright.waitForTimeout(2000);
    submitted = await runStarted();
  }
  if (!submitted) return { ok: false, error: 'SUBMIT_FAILED' };

  const deadline = Date.now() + waitMs;
  let last = '';
  let stable = 0;
  let finalText = '';
  while (Date.now() < deadline) {
    await tab.playwright.waitForTimeout(pollMs);
    const frameCount = await tab.playwright.locator(FRAME_SEL).count().catch(() => 0);
    if (frameCount === 0) continue;
    const txt = String(
      (await tab.playwright
        .frameLocator(FRAME_SEL)
        .locator('body')
        .innerText()
        .catch(() => '')) || ''
    ).trim();
    if (txt && txt === last) {
      stable += 1;
      if (stable >= settleRounds) {
        finalText = txt;
        break;
      }
    } else {
      stable = 0;
      last = txt;
    }
  }
  if (!finalText) {
    if (jsonMode) {
      const aj = await extractAgentJson(tab);
      if (aj) return { ok: true, query, layout: 'agent-json', items: aj, source: 'agent-json', raw: '' };
    }
    const fb = await transcriptFallback(tab, query);
    if (fb.trim()) {
      const parsed = parseSourcingText(fb);
      return { ok: true, query, ...parsed, raw: fb, source: 'ax-fallback' };
    }
    return { ok: false, error: 'TIMEOUT', raw: last };
  }

  const parsed = parseSourcingText(finalText);
  if (jsonMode) {
    const aj = await extractAgentJson(tab);
    if (aj) return { ok: true, query, layout: 'agent-json', items: aj, source: 'agent-json', raw: finalText };
  }
  return { ok: true, query, ...parsed, raw: finalText, source: 'content-slot' };
}
