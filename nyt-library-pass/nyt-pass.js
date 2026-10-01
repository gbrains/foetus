#!/usr/bin/env node
// One-click NYT access through a public-library pass.
//
//   1. Open the library page that issues the NYT pass/code.
//   2. Enter the library card number (and PIN if asked).
//   3. Follow the library -> NYTimes.com redemption hand-off.
//   4. Uncheck every newsletter / marketing / "send me updates" opt-in.
//   5. Log in with the NYTimes.com account and redeem the pass.
//   6. Finish on https://www.nytimes.com/ and leave the browser open.
//
// Library and NYT pages vary, so each step finds fields and buttons by their
// labels rather than fixed IDs. selectors.json can pin exact selectors when a
// page is unusual (see selectors.example.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NYT_HOME = 'https://www.nytimes.com/';

const OPT_IN_WORDS = /newsletter|marketing|promot|offer|update|news ?alert|special|partner|e-?mail me|send me|subscribe|sign me up|keep me (posted|informed)|morning briefing|the morning|recommend/i;
const START_WORDS = /new york times|nytimes|nyt|get (a |your |the )?(pass|code|access)|claim|redeem|activate|access now|get started/i;
const SUBMIT_WORDS = /^(submit|continue|next|go|get (pass|code|access)|redeem|claim|log ?in|sign ?in|request|verify|activate)\b/i;
const NYT_ACTION_WORDS = /^(redeem|claim|activate|continue|next|start reading|get started|go to (the )?(home ?page|nytimes)|start (my|your) access|accept( (pass|access|gift))?)\b/i;
const NYT_LOGIN_LINK = /^(log ?in|sign ?in|already have an account|already a subscriber)/i;
// Never click anything that would start a paid subscription.
const NEVER_CLICK = /subscribe|subscription|\$|per (week|month|year)|\/(wk|week|mo|month|yr)|trial|upgrade|all access|buy|purchase|payment|google|apple|facebook/i;
const SUCCESS_TEXT = /you('| a)re all set|you now have (full )?access|access (has been )?(granted|activated|redeemed)|enjoy (your )?(access|reading)|successfully redeemed|your pass is active|thanks? (you )?for (redeeming|claiming)/i;
const CAPTCHA_FRAME = /captcha|datadome|recaptcha|hcaptcha|arkoselabs|funcaptcha|challenges\.cloudflare/i;

export function loadConfig(env = process.env) {
  const cfg = {
    libraryUrl: env.LIBRARY_PASS_URL?.trim(),
    card: env.LIBRARY_CARD_NUMBER?.trim(),
    pin: env.LIBRARY_PIN?.trim() || '',
    nytEmail: env.NYT_EMAIL?.trim(),
    nytPassword: env.NYT_PASSWORD ?? '',
    headless: /^(1|true|yes)$/i.test(env.HEADLESS ?? ''),
    stepTimeout: Number(env.STEP_TIMEOUT_MS) || 45000,
    profileDir: path.resolve(HERE, env.PROFILE_DIR || '.browser-profile'),
    selectors: {},
  };
  const selFile = path.resolve(HERE, env.SELECTORS_FILE || 'selectors.json');
  if (fs.existsSync(selFile)) cfg.selectors = JSON.parse(fs.readFileSync(selFile, 'utf8'));

  const missing = [
    ['LIBRARY_PASS_URL', cfg.libraryUrl],
    ['LIBRARY_CARD_NUMBER', cfg.card],
    ['NYT_EMAIL', cfg.nytEmail],
    ['NYT_PASSWORD', cfg.nytPassword],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')} — copy .env.example to .env and fill it in.`);
  }
  return cfg;
}

const log = (step, msg) => console.log(`[${new Date().toLocaleTimeString()}] ${step}: ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNyt = (url) => { try { return /(^|\.)nytimes\.com$/i.test(new URL(url).hostname); } catch { return false; } };

// ---------- generic page helpers ----------

async function visible(locator) {
  try { return await locator.first().isVisible(); } catch { return false; }
}

async function firstVisible(page, selectors) {
  for (const sel of selectors.filter(Boolean)) {
    const loc = page.locator(sel);
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) if (await visible(loc.nth(i))) return loc.nth(i);
  }
  return null;
}

// Score visible text-like inputs by how well their name/id/label/placeholder match `hint`.
async function findInput(page, hint, { exclude } = {}) {
  const inputs = page.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button])');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    if (!(await visible(el))) continue;
    const text = await el.evaluate((node) => {
      const lab = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`) : null;
      return [node.name, node.id, node.placeholder, node.getAttribute('aria-label'), node.autocomplete, node.type,
        lab?.textContent, node.closest('label')?.textContent].filter(Boolean).join(' ');
    });
    if (exclude && exclude.test(text)) continue;
    if (hint.test(text)) return el;
  }
  return null;
}

async function clickByName(page, pattern, { roles = ['button', 'link'] } = {}) {
  for (const role of roles) {
    const loc = page.getByRole(role, { name: pattern });
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await visible(el))) continue;
      const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label')) || '').trim();
      if (NEVER_CLICK.test(label)) continue;
      if (!(await el.isEnabled().catch(() => true))) continue;
      await el.click();
      return label || String(pattern);
    }
  }
  return null;
}

// Uncheck newsletter / marketing opt-ins (checkboxes and toggle switches).
async function uncheckOptIns(page) {
  let count = 0;
  const boxes = page.locator('input[type=checkbox], [role=checkbox], [role=switch]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const box = boxes.nth(i);
    const info = await box.evaluate((node) => {
      const lab = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`) : null;
      const text = [node.name, node.id, node.getAttribute('aria-label'), lab?.textContent,
        node.closest('label')?.textContent, node.parentElement?.textContent].filter(Boolean).join(' ');
      const checked = node.matches('input') ? node.checked : node.getAttribute('aria-checked') === 'true';
      return { text: text.replace(/\s+/g, ' ').slice(0, 200), checked };
    }).catch(() => null);
    if (!info?.checked || !OPT_IN_WORDS.test(info.text)) continue;
    try {
      await box.uncheck({ timeout: 3000 });
    } catch {
      // Styled checkboxes often hide the real input; click its label instead.
      await box.evaluate((node) => (node.closest('label') || document.querySelector(`label[for="${node.id}"]`) || node).click());
    }
    count++;
    log('opt-out', `unchecked "${info.text.trim().slice(0, 70)}"`);
  }
  return count;
}

async function waitForCaptchaIfAny(page) {
  const hasCaptcha = () => page.frames().some((f) => CAPTCHA_FRAME.test(f.url()));
  if (!hasCaptcha()) return;
  log('captcha', 'A CAPTCHA/robot check appeared — please solve it in the browser window. Waiting up to 5 minutes…');
  const until = Date.now() + 5 * 60_000;
  while (hasCaptcha() && Date.now() < until) await sleep(1000);
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}

// ---------- step 1 + 2: library ----------

async function libraryStep(context, page, cfg) {
  log('1/6 library', `opening ${cfg.libraryUrl}`);
  await page.goto(cfg.libraryUrl, { waitUntil: 'domcontentloaded' });
  await settle(page);

  const S = cfg.selectors;
  const cardSelectors = [S.libraryCardInput];
  const cardHint = /card|barcode|patron|library|borrower|account|user ?(name|id)|number/i;

  // Some library pages need a click ("Get your NYT pass") before the card form appears,
  // possibly in a new tab. Follow up to three such hops.
  for (let hop = 0; hop < 3; hop++) {
    if (isNyt(page.url())) return page;
    if ((await firstVisible(page, cardSelectors)) || (await findInput(page, cardHint, { exclude: /search|pin|password/i }))) break;
    const popup = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
    const clicked = S.libraryStartButton
      ? (await page.locator(S.libraryStartButton).first().click().then(() => S.libraryStartButton).catch(() => null))
      : await clickByName(page, START_WORDS);
    if (!clicked) break;
    log('1/6 library', `clicked "${clicked}"`);
    const newPage = await popup;
    if (newPage) page = newPage;
    await settle(page);
  }
  if (isNyt(page.url())) return page;

  const card = (await firstVisible(page, cardSelectors)) || (await findInput(page, cardHint, { exclude: /search|pin|password/i }));
  if (!card) throw new Error('Could not find the library card field. Add "libraryCardInput" to selectors.json.');
  log('2/6 card', 'entering library card number');
  await card.fill(cfg.card);

  const pin = (await firstVisible(page, [S.libraryPinInput])) || (await findInput(page, /pin|password|passcode/i));
  if (pin && cfg.pin) await pin.fill(cfg.pin);
  else if (pin && !cfg.pin) log('2/6 card', 'page has a PIN/password field but LIBRARY_PIN is empty');

  const popup = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  if (S.librarySubmit) await page.locator(S.librarySubmit).first().click();
  else if (!(await clickByName(page, SUBMIT_WORDS, { roles: ['button'] }))) await card.press('Enter');
  const newPage = await popup;
  if (newPage) page = newPage;
  await settle(page);
  return page;
}

// ---------- step 3: hand-off to nytimes.com ----------

async function reachNyt(context, page, cfg) {
  const deadline = Date.now() + cfg.stepTimeout;
  let code = null;
  while (Date.now() < deadline) {
    const nytPage = context.pages().find((p) => isNyt(p.url()));
    if (nytPage) return { page: nytPage, code };

    // Library may show a code and a link instead of redirecting.
    if (!code) {
      const body = await page.locator('body').innerText().catch(() => '');
      code = body.match(/\b(?:code|pass|gift)\b[^A-Za-z0-9]{0,20}([A-Z0-9]{3,}(?:-[A-Z0-9]{3,})+|[A-Z0-9]{10,})\b/)?.[1] ?? null;
      if (code) log('3/6 handoff', `library issued code ${code.slice(0, 4)}…`);
    }
    const link = page.locator('a[href*="nytimes.com"]').filter({ hasNotText: NEVER_CLICK });
    if (await visible(link)) {
      log('3/6 handoff', 'following the library link to NYTimes.com');
      const popup = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
      await link.first().click();
      const p = await popup;
      if (p) page = p;
      await settle(page);
      continue;
    }
    const err = await page.locator('[role=alert], .error, .alert-danger, .errors').first().innerText().catch(() => '');
    if (err.trim()) throw new Error(`Library page reported: ${err.trim().slice(0, 200)}`);
    await sleep(1000);
  }
  throw new Error('Never reached NYTimes.com after submitting the library card. Check the card number, or set selectors.json.');
}

// ---------- steps 3-5: redeem on nytimes.com + log in ----------

async function nytStep(page, cfg, code) {
  log('3/6 nyt', `on ${new URL(page.url()).hostname}${new URL(page.url()).pathname}`);
  const deadline = Date.now() + cfg.stepTimeout * 3;
  const clicks = new Map();
  let idle = 0;

  while (Date.now() < deadline) {
    await settle(page);
    await waitForCaptchaIfAny(page);
    await uncheckOptIns(page);

    const body = await page.locator('body').innerText().catch(() => '');
    if (SUCCESS_TEXT.test(body)) { log('4/6 redeem', 'NYT confirmed the pass is active'); return; }

    // Cookie / consent banners.
    await clickByName(page, /^(accept all|accept|agree|i agree|got it)$/i, { roles: ['button'] });

    const codeInput = await findInput(page, /code|gift|pass|voucher|redeem/i, { exclude: /email|password|zip|postal/i });
    if (codeInput && code && !(await codeInput.inputValue())) {
      log('4/6 redeem', 'entering library code'); await codeInput.fill(code); idle = 0; continue;
    }

    const email = await findInput(page, /email|username/i);
    if (email && !(await email.inputValue())) {
      log('5/6 login', 'entering NYT email');
      await email.fill(cfg.nytEmail);
      await uncheckOptIns(page);
      if (!(await clickByName(page, /^(continue|next|log ?in|sign ?in)/i, { roles: ['button'] }))) await email.press('Enter');
      idle = 0; continue;
    }

    const pwd = page.locator('input[type=password]');
    if (await visible(pwd) && !(await pwd.first().inputValue())) {
      log('5/6 login', 'entering NYT password');
      await pwd.first().fill(cfg.nytPassword);
      await uncheckOptIns(page);
      if (!(await clickByName(page, /^(log ?in|sign ?in|continue)/i, { roles: ['button'] }))) await pwd.first().press('Enter');
      idle = 0; continue;
    }

    // Logged-out redeem pages offer "Log in" alongside "Create account".
    const loggedOut = /log ?in|sign ?in/i.test(body) && !/log ?out|sign ?out|my account/i.test(body);
    if (loggedOut && (clicks.get('login') ?? 0) < 2) {
      const clicked = await clickByName(page, NYT_LOGIN_LINK);
      if (clicked) { clicks.set('login', (clicks.get('login') ?? 0) + 1); log('5/6 login', `clicked "${clicked}"`); idle = 0; continue; }
    }

    const urlBefore = page.url();
    const clicked = cfg.selectors.nytRedeemButton && (await visible(page.locator(cfg.selectors.nytRedeemButton)))
      ? (await page.locator(cfg.selectors.nytRedeemButton).first().click(), cfg.selectors.nytRedeemButton)
      : await clickByName(page, NYT_ACTION_WORDS, { roles: ['button', 'link'] });
    if (clicked) {
      const key = `${clicked}@${urlBefore}`;
      clicks.set(key, (clicks.get(key) ?? 0) + 1);
      log('4/6 redeem', `clicked "${clicked}"`);
      if (clicks.get(key) > 3) throw new Error(`"${clicked}" keeps reappearing on ${urlBefore} — something on the page needs attention.`);
      idle = 0; continue;
    }

    // Redirected to an article/home page while logged in → redemption finished.
    if (!/redeem|activate|gift|pass|subscription|auth|login|account|campaign/i.test(new URL(page.url()).pathname + new URL(page.url()).search) && !loggedOut) {
      log('4/6 redeem', 'NYT redirected away from the redemption flow — treating as done'); return;
    }
    if (++idle > 8) throw new Error(`Stuck on ${page.url()} — nothing recognizable to click. Finish it by hand in the open window.`);
    await sleep(1500);
  }
  throw new Error('Timed out during NYT redemption/login.');
}

// ---------- main ----------

export async function run(cfg, { onContext } = {}) {
  fs.mkdirSync(cfg.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(cfg.profileDir, {
    headless: cfg.headless,
    viewport: null,
    args: ['--start-maximized'],
  });
  context.setDefaultTimeout(cfg.stepTimeout);
  if (onContext) await onContext(context);
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    let current = await libraryStep(context, page, cfg);
    const { page: nytPage, code } = await reachNyt(context, current, cfg);
    current = nytPage;
    await current.bringToFront();
    await nytStep(current, cfg, code);

    log('6/6 home', `opening ${NYT_HOME}`);
    await current.goto(NYT_HOME, { waitUntil: 'domcontentloaded' });
    for (const p of context.pages()) if (p !== current) await p.close().catch(() => {});
    log('done', 'You are on NYTimes.com. Close the browser window when finished reading.');
    return { context, page: current };
  } catch (err) {
    const shots = path.join(HERE, 'screenshots');
    fs.mkdirSync(shots, { recursive: true });
    const file = path.join(shots, `failure-${Date.now()}.png`);
    await context.pages().at(-1)?.screenshot({ path: file, fullPage: true }).catch(() => {});
    err.message += `\n(screenshot: ${file})`;
    Object.defineProperty(err, 'context', { value: context, enumerable: false });
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  dotenv.config({ path: path.join(HERE, '.env') });
  let cfg;
  try { cfg = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  run(cfg)
    .then(({ context }) => new Promise((resolve) => context.on('close', resolve)))
    .catch((err) => {
      console.error(`\n✗ ${err.message}\nThe browser stays open so you can finish by hand.`);
      if (!err.context) process.exit(1);
      err.context.on('close', () => process.exit(1));
    });
}
