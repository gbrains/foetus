// End-to-end check against mock library + NYT pages (no real network, no real accounts).
// Run: npm test
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../nyt-pass.js';

const state = { loggedIn: false, redeemed: false, optIns: [], subscribeClicked: false, cardSeen: null };
const html = (title, body) => `<!doctype html><title>${title}</title><body><header>${state.loggedIn ? '<a href="/account">Account</a>' : '<a href="https://www.nytimes.com/login">Log in</a>'}</header>${body}</body>`;

function library(url) {
  if (url.pathname === '/nyt') {
    return html('Library', `<h1>New York Times access</h1><a href="/nyt/form">Get your NYT pass</a>`);
  }
  if (url.pathname === '/nyt/form') {
    return html('Library', `<form action="/nyt/issue"><label for="bc">Library card number</label><input id="bc" name="barcode"><button type="submit">Submit</button></form>`);
  }
  if (url.pathname === '/nyt/issue') {
    state.cardSeen = url.searchParams.get('barcode');
    if (state.cardSeen !== '21234000999999') return html('Library', '<div role="alert">Invalid card</div>');
    return { redirect: 'https://www.nytimes.com/subscription/redeem?campaignId=LIB&gift_code=ABCD-EFGH-IJKL' };
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
    return { redirect: 'https://www.nytimes.com/subscription/redeem?campaignId=LIB&gift_code=ABCD-EFGH-IJKL' };
  }
  if (p === '/subscribe') { state.subscribeClicked = true; return html('Subscribe', 'pay'); }
  if (p === '/') return html('NYT', '<h1>The New York Times</h1>');
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyt-pass-'));
const cfg = {
  libraryUrl: 'https://library.example/nyt',
  card: '21234000999999', pin: '',
  nytEmail: 'reader@example.com', nytPassword: 's3cret',
  headless: true, stepTimeout: 15000, profileDir, selectors: {},
};

const { context, page } = await run(cfg, {
  onContext: (ctx) => ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const res = url.hostname === 'library.example' ? library(url) : url.hostname.endsWith('nytimes.com') ? nyt(url) : null;
    if (!res) return route.fulfill({ status: 404, body: 'not found' });
    if (res.redirect) return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(res.redirect)})</script>` });
    return route.fulfill({ status: 200, contentType: 'text/html', body: res });
  }),
});

try {
  assert.equal(state.cardSeen, cfg.card, 'library card submitted');
  assert.ok(state.loggedIn, 'logged in to NYT');
  assert.ok(state.redeemed, 'pass redeemed');
  assert.deepEqual(state.optIns, [], 'no newsletter/marketing opt-ins submitted');
  assert.equal(state.subscribeClicked, false, 'never clicked a paid subscribe link');
  assert.equal(page.url(), 'https://www.nytimes.com/', 'ended on NYT home page');
  console.log('\n✓ mock end-to-end flow passed');
} finally {
  await context.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
}
