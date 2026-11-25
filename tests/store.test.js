import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndf-store-'));
  return new Store(path.join(dir, 'db.json'));
}

test('ajout, dédup par hash, mise à jour de statut', () => {
  const s = tmpStore();
  const a = s.add({ hash: 'abc', merchant: 'X', amountTTC: 10 });
  assert.equal(a.status, 'pending');
  assert.equal(s.findByHash('abc').id, a.id);
  const b = s.update(a.id.slice(0, 8), { status: 'approved' });
  assert.equal(b.status, 'approved');
  assert.equal(s.all({ status: 'approved' }).length, 1);
  assert.equal(s.all({ status: 'pending' }).length, 0);
});

test('persistance sur disque', () => {
  const s = tmpStore();
  const a = s.add({ hash: 'h1', merchant: 'Y' });
  const s2 = new Store(s.file);
  assert.equal(s2.get(a.id).merchant, 'Y');
});
