import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { submitApproved, formatAmount } from '../src/automation.js';

const SELECTORS = {
  loginPath: '/login',
  username: '#u',
  password: '#p',
  loginSubmit: '#login-btn',
  loggedInIndicator: '#logout',
  newExpensePath: '/expense/new',
  fields: { date: '#date', amount: '#amount', merchant: '#merchant', category: '#cat', comment: '#comment' },
  fileInput: '#file',
  submitExpense: '#submit',
  successIndicator: '.ok',
  reference: '.ref',
  decimalSeparator: ',',
};

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndf-auto-'));
  return new Store(path.join(dir, 'db.json'));
}

function fakeBrowser({ failOnSubmit = false } = {}) {
  const calls = [];
  const page = {
    setDefaultTimeout() {},
    async goto(url) { calls.push(['goto', url]); },
    async fill(sel, val) { calls.push(['fill', sel, val]); },
    async click(sel) {
      calls.push(['click', sel]);
      if (failOnSubmit && sel === '#submit') throw new Error('timeout waiting for .ok');
    },
    async waitForSelector(sel) {
      calls.push(['wait', sel]);
      if (failOnSubmit && sel === '.ok') throw new Error('timeout waiting for .ok');
    },
    async selectOption() { calls.push(['selectOption']); },
    async setInputFiles(sel, file) { calls.push(['file', sel, path.basename(file)]); },
    async textContent(sel) { return sel === '.ref' ? 'NDF-2025-0042' : null; },
  };
  return {
    calls,
    browser: {
      async newContext() { return { async newPage() { return page; }, async close() {} }; },
      async close() {},
    },
  };
}

test('formatAmount', () => {
  assert.equal(formatAmount(15.95, ','), '15,95');
  assert.equal(formatAmount(1234.5, '.'), '1234.50');
  assert.equal(formatAmount(null), '');
});

test('soumission d un ticket approuvé: champs remplis, statut submitted + réf', async () => {
  const store = makeStore();
  const r = store.add({ hash: 'h', merchant: 'CARREFOUR CITY', date: '2025-03-12', amountTTC: 15.95, category: 'Courses', vatRate: 10, compressedPath: '/tmp/x.jpg' });
  store.update(r.id, { status: 'approved' });
  const { browser, calls } = fakeBrowser();
  const res = await submitApproved({
    store,
    siteUrl: 'http://site.local',
    username: 'u',
    password: 'p',
    selectors: SELECTORS,
    launch: async () => browser,
    log: () => {},
  });
  assert.equal(res.submitted.length, 1);
  assert.equal(res.submitted[0].ref, 'NDF-2025-0042');
  const updated = store.get(r.id);
  assert.equal(updated.status, 'submitted');
  assert.equal(updated.externalRef, 'NDF-2025-0042');
  const fills = Object.fromEntries(calls.filter((c) => c[0] === 'fill').map((c) => [c[1], c[2]]));
  assert.equal(fills['#u'], 'u');
  assert.equal(fills['#p'], 'p');
  assert.equal(fills['#date'], '2025-03-12');
  assert.equal(fills['#amount'], '15,95');
  assert.equal(fills['#merchant'], 'CARREFOUR CITY');
  assert.ok(calls.some((c) => c[0] === 'file' && c[2] === 'x.jpg'));
});

test('échec de soumission -> statut error, le ticket reste traité', async () => {
  const store = makeStore();
  const r = store.add({ hash: 'h2', merchant: 'X', amountTTC: 5, compressedPath: '/tmp/y.jpg' });
  store.update(r.id, { status: 'approved' });
  const { browser } = fakeBrowser({ failOnSubmit: true });
  const res = await submitApproved({
    store, siteUrl: 'http://site.local', username: 'u', password: 'p',
    selectors: SELECTORS, launch: async () => browser, log: () => {},
  });
  assert.equal(res.failed.length, 1);
  assert.equal(store.get(r.id).status, 'error');
});

test('aucun ticket approuvé -> rien à faire', async () => {
  const store = makeStore();
  store.add({ hash: 'h3', merchant: 'X' });
  const res = await submitApproved({
    store, siteUrl: 'http://site.local', username: 'u', password: 'p',
    selectors: SELECTORS, launch: async () => { throw new Error('ne devrait pas lancer'); }, log: () => {},
  });
  assert.deepEqual(res, { submitted: [], failed: [] });
});
