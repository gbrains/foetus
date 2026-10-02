// End-to-end check against mock library + NYT pages (no real network, no real accounts).
// Run: npm test
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { run } from '../nyt-pass.js';

const REDEEM_URL = 'https://www.nytimes.com/subscription/redeem?campaignId=LIB&gift_code=ABCD-EFGH-IJKL';
const state = { loggedIn: false, redeemed: false, optIns: [], subscribeClicked: false, cardSeen: null };
const html = (title, body) => `<!doctype html><title>${title}</title><body><header>${state.loggedIn ? '<a href="/account">Account</a>' : '<a href="https://www.nytimes.com/login">Log in</a>'}</header>${body}</body>`;

function library(url) {
  if (url.pathname === '/nyt') {
    return html('Library', `<h1>New York Times access</h1><a href="/nyt/form">Get your NYT pass</a>`);
  }
  if (url.pathname === '/nyt/form') {
    // Shaped like an ASP.NET WebForms page: one form around everything, header search box first.
    return html('Library', `<form action="/nyt/issue" id="aspnetForm"><input type="text" name="ctl00$q" placeholder="Search the catalog"><input type="submit" value="Search" name="ctl00$go" formaction="/search">
      <h2>The New York Times – Homewood</h2><label for="ctl00_Main_txtBarcode">Library Card Number</label><input id="ctl00_Main_txtBarcode" name="barcode">
      <label for="ctl00_Main_txtPin">PIN</label><input id="ctl00_Main_txtPin" name="pin" type="password"><input type="submit" value="Submit" name="ctl00$Main$btnSubmit"></form>`);
  }
  if (url.pathname === '/nyt/issue') {
    state.cardSeen = url.searchParams.get('barcode');
    assert.equal(url.searchParams.get('pin'), '1234');
    assert.equal(url.searchParams.get('ctl00$q'), '', 'catalog search box left empty');
    if (state.cardSeen !== '21234000999999') return html('Library', '<div role="alert">Invalid card</div>');
    return { redirect: REDEEM_URL };
  }
}

function nyt(url) {
  const p = url.pathname;
  if (p === '/subscription/redeem') {
    if (!state.loggedIn) {
      return html('Redeem', `<p>Your library is giving you access.</p><a href="/subscribe">Subscribe for $1/week</a><a href="/register">Create account</a> <a href="/login?redirect=redeem">Log in</a>`);
    }
    return html('Redeem', `<form action="/subscription/redeem/confirm"><label><input type="checkbox" name="offers" checked> Send me updates and special offers</label><button>Redeem</button></form>`);
  }
  if (p === '/subscription/redeem/confirm') {
    if (url.searchParams.get('offers')) state.optIns.push('offers');
    state.redeemed = true;
    return html('Done', `<h1>You're all set!</h1><p>You now have access.</p>`);
  }
  if (p === '/login') {
    return html('Log in', `<form action="/login/password"><label for="e">Email address</label><input id="e" type="email" name="email"><label><input type="checkbox" name="morning" checked> Sign me up for The Morning newsletter</label><button>Continue</button></form>`);
  }
  if (p === '/login/password') {
    if (url.searchParams.get('morning')) state.optIns.push('morning');
    assert.equal(url.searchParams.get('email'), 'reader@example.com');
    return html('Password', `<form action="/login/submit"><input type="password" name="pw"><button>Log in</button></form>`);
  }
  if (p === '/login/submit') {
    assert.equal(url.searchParams.get('pw'), 's3cret');
    state.loggedIn = true;
    return { redirect: REDEEM_URL };
  }
  if (p === '/subscribe') { state.subscribeClicked = true; return html('Subscribe', 'pay'); }
  if (p === '/') return html('NYT', '<h1>The New York Times</h1>');
}

function resetState() {
  Object.assign(state, { loggedIn: false, redeemed: false, optIns: [], subscribeClicked: false, cardSeen: null });
}

// Serves the mock library over real HTTP, so its NYT hand-off is a genuine 302 redirect.
function startLibraryServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const out = library(url);
    if (!out) { res.writeHead(404).end('not found'); return; }
    if (out.redirect) { res.writeHead(302, { location: out.redirect }).end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(out);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function scenario(name, { handoff, libraryUrl = 'https://library.example/nyt' }) {
  resetState();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyt-pass-'));
  const cfg = {
    libraryUrl,
    card: '21234000999999', pin: '1234',
    nytEmail: 'reader@example.com', nytPassword: 's3cret',
    headless: true, stepTimeout: 15000, profileDir, selectors: {}, handoff,
  };
  const opened = [];
  const nytLoads = [];
  const result = await run(cfg, {
    openUrl: (u) => opened.push(u),
    onContext: (ctx) => ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith('nytimes.com')) {
        nytLoads.push(url.href);
        if (handoff) return route.fallback(); // let the hand-off handler see it
      }
      const res = url.hostname === 'library.example' ? library(url) : url.hostname.endsWith('nytimes.com') ? nyt(url) : undefined;
      if (res === undefined) return route.fallback();
      if (!res) return route.fulfill({ status: 404, body: 'not found' });
      if (res.redirect) return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(res.redirect)})</script>` });
      return route.fulfill({ status: 200, contentType: 'text/html', body: res });
    }),
  });

  try {
    assert.equal(state.cardSeen, cfg.card, 'library card submitted');
    if (handoff) {
      assert.deepEqual(opened, [REDEEM_URL], 'NYT redeem link opened in the normal browser');
      assert.equal(result.context, null, 'automated browser closed');
      assert.ok(nytLoads.length <= 1, 'NYT never loaded in the automated browser (at most one aborted request)');
      assert.equal(state.redeemed, false, 'automated browser did not touch NYT');
    } else {
      assert.ok(state.loggedIn, 'logged in to NYT');
      assert.ok(state.redeemed, 'pass redeemed');
      assert.deepEqual(state.optIns, [], 'no newsletter/marketing opt-ins submitted');
      assert.equal(state.subscribeClicked, false, 'never clicked a paid subscribe link');
      assert.equal(result.page.url(), 'https://www.nytimes.com/', 'ended on NYT home page');
    }
    console.log(`✓ ${name}`);
  } finally {
    await result.context?.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

await scenario('hand-off: script-redirect library -> opens redeem link in normal browser', { handoff: true });
const server = await startLibraryServer();
try {
  await scenario('hand-off: HTTP 302 library -> opens redeem link in normal browser', {
    handoff: true, libraryUrl: `http://127.0.0.1:${server.address().port}/nyt`,
  });
} finally {
  server.close();
}
await scenario('full auto (NYT_FULL_AUTO=true): redeem, opt out, log in, home page', { handoff: false });
console.log('\nall mock scenarios passed');
