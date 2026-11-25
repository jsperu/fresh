import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';

const TOKEN = 'test-token';

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndf-srv-'));
  const store = new Store(path.join(dir, 'db.json'));
  const compressedDir = path.join(dir, 'compressed');
  fs.mkdirSync(compressedDir, { recursive: true });
  const ingest = async (filePath) => {
    const receipt = store.add({ hash: 'h-' + path.basename(filePath), merchant: 'TEST', amountTTC: 1.5, compressedPath: path.join(compressedDir, 'x.jpg') });
    fs.rmSync(filePath, { force: true });
    return { receipt, duplicate: false };
  };
  const app = createApp({ store, token: TOKEN, ingest, compressedDir });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, store };
}

test('upload sans token -> 401, avec token -> 201 et ticket créé', async (t) => {
  const { server, base, store } = await startServer();
  t.after(() => server.close());

  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();

  let res = await fetch(`${base}/upload/raw`, { method: 'POST', body: png });
  assert.equal(res.status, 401);

  res = await fetch(`${base}/upload/raw`, {
    method: 'POST',
    headers: { 'x-token': TOKEN, 'content-type': 'image/png' },
    body: png,
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.receipt.merchant, 'TEST');
  assert.equal(store.all().length, 1);

  res = await fetch(`${base}/api/receipts`);
  const list = await res.json();
  assert.equal(list.receipts.length, 1);
  assert.equal(list.receipts[0].rawText, undefined);
});

test('approve change le statut', async (t) => {
  const { server, base, store } = await startServer();
  t.after(() => server.close());
  const r = store.add({ hash: 'h2', merchant: 'A' });
  const res = await fetch(`${base}/api/approve/${r.id}`, { method: 'POST' });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.receipt.status, 'approved');
});
