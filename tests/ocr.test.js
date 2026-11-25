import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ocrWithMistral } from '../src/ocr-mistral.js';
import { ocrImage } from '../src/ocr.js';

function tmpImage() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ndf-ocr-')), 'img.jpg');
  fs.writeFileSync(f, Buffer.from('ffd8ffe0fakejpeg'));
  return f;
}

test('ocrWithMistral envoie l image en base64 avec le bearer et retourne le markdown', async () => {
  const file = tmpImage();
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return {
      ok: true,
      json: async () => ({ pages: [{ markdown: 'TOTAL TTC 15,95 €' }, { markdown: 'MERCI' }] }),
    };
  };
  const text = await ocrWithMistral(file, { apiKey: 'sk-test', model: 'mistral-ocr-latest', fetchImpl });
  assert.equal(text, 'TOTAL TTC 15,95 €\nMERCI');
  assert.equal(seen.url, 'https://api.mistral.ai/v1/ocr');
  assert.equal(seen.init.headers.authorization, 'Bearer sk-test');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'mistral-ocr-latest');
  assert.ok(body.document.image_url.startsWith('data:image/jpeg;base64,'));
  assert.ok(!seen.init.body.includes('sk-test'), 'la clé ne doit pas apparaître dans le corps de la requête logué');
});

test('ocrWithMistral lève sur HTTP non-OK', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(() => ocrWithMistral(tmpImage(), { apiKey: 'sk-x', fetchImpl }), /HTTP 401/);
});

test('ocrWithMistral exige une clé', async () => {
  await assert.rejects(() => ocrWithMistral(tmpImage(), { apiKey: '' }), /MISTRAL_API_KEY/);
});

test('ocrImage provider=tesseract appelle tesseract', async () => {
  const text = await ocrImage(tmpImage(), { provider: 'tesseract', tesseractImpl: async () => 'texte local' });
  assert.equal(text, 'texte local');
});

test('ocrImage provider=mistral replie sur tesseract si mistral échoue', async () => {
  const warnings = [];
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const text = await ocrImage(tmpImage(), {
    provider: 'mistral',
    apiKey: 'sk-test',
    fetchImpl,
    tesseractImpl: async () => 'repli local',
    log: (m) => warnings.push(m),
  });
  assert.equal(text, 'repli local');
  assert.equal(warnings.length, 1);
});

test('ocrImage provider=mistral retourne le texte mistral si OK', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ pages: [{ markdown: 'via mistral' }] }) });
  const text = await ocrImage(tmpImage(), { provider: 'mistral', apiKey: 'sk-test', fetchImpl, tesseractImpl: async () => 'ne doit pas servir' });
  assert.equal(text, 'via mistral');
});
