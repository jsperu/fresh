import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMockSite } from '../scripts/mock-site.mjs';

async function startMock() {
  const received = [];
  const app = createMockSite({ log: (...args) => received.push(args.join(' ')) });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}`, received };
}

test('le mock expose les sélecteurs attendus et traite login + note de frais', async (t) => {
  const { server, base, received } = await startMock();
  t.after(() => server.close());

  const login = await (await fetch(`${base}/login`)).text();
  for (const id of ['u', 'p', 'login-btn']) assert.ok(login.includes(`id="${id}"`), `id ${id} présent`);

  const home = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ u: 'x', p: 'y' }) });
  assert.ok((await home.text()).includes('Déconnexion'));

  const form = await (await fetch(`${base}/expense/new`)).text();
  for (const id of ['date', 'amount', 'merchant', 'cat', 'comment', 'file', 'submit']) {
    assert.ok(form.includes(`id="${id}"`), `id ${id} présent`);
  }

  const fd = new FormData();
  fd.append('date', '2025-03-12');
  fd.append('amount', '15,95');
  fd.append('merchant', 'CARREFOUR CITY');
  fd.append('cat', 'Courses');
  fd.append('comment', 'Ticket abcdef12');
  fd.append('justif', new Blob([fs.readFileSync('package.json')], { type: 'image/jpeg' }), 'ticket.jpg');
  const res = await fetch(`${base}/expense/new`, { method: 'POST', body: fd });
  const html = await res.text();
  assert.ok(html.includes('class="ok"'));
  assert.ok(html.includes('NDF-TEST-0001'));
  assert.equal(received.length, 1);
  assert.ok(received[0].includes('CARREFOUR CITY'));
  assert.ok(received[0].includes('ticket.jpg'));
});
