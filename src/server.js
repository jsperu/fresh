import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ingestFile } from './pipeline.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function checkToken(req, res, next) {
  const expected = req.app.locals.token;
  if (!expected) return res.status(500).json({ ok: false, error: 'SERVER_TOKEN non configuré' });
  const given = req.get('x-token') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'token invalide' });
  }
  next();
}

export function createApp({ store, token, ingest, compressedDir, onSubmit } = {}) {
  const app = express();
  app.locals.token = token;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 5 } });

  const doIngest = ingest || (async (filePath, opts) => ingestFile(filePath, opts));

  async function handleBuffer(buf, filename, res) {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const tmp = path.join(os.tmpdir(), `upload-${crypto.randomUUID()}${path.extname(filename || '.jpg')}`);
    fs.writeFileSync(tmp, buf);
    try {
      const { receipt, duplicate } = await doIngest(tmp, {
        store,
        originalsDir: path.join(path.dirname(store.file), 'originals'),
        compressedDir,
        lang: app.locals.ocrLang,
      });
      return res.status(duplicate ? 200 : 201).json({ ok: true, duplicate, receipt: publicReceipt(receipt) });
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  app.post('/upload', checkToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'champ "file" manquant' });
    await handleBuffer(req.file.buffer, req.file.originalname, res);
  });

  app.post('/upload/raw', checkToken, express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'corps vide' });
    await handleBuffer(req.body, req.get('x-filename') || 'photo.jpg', res);
  });

  app.get('/api/receipts', (req, res) => {
    res.json({ ok: true, receipts: store.all().map(publicReceipt) });
  });

  app.post('/api/approve/:id', (req, res) => {
    const r = store.update(req.params.id, { status: 'approved' });
    res.json({ ok: Boolean(r), receipt: r && publicReceipt(r) });
  });

  app.post('/api/reject/:id', (req, res) => {
    const r = store.update(req.params.id, { status: 'rejected' });
    res.json({ ok: Boolean(r), receipt: r && publicReceipt(r) });
  });

  app.post('/api/submit', async (req, res) => {
    if (!onSubmit) return res.status(501).json({ ok: false, error: 'soumission non configurée' });
    res.status(202).json({ ok: true, message: 'soumission lancée en arrière-plan' });
    onSubmit().catch((e) => console.error('submit:', e));
  });

  app.get('/files/:name', (req, res) => {
    const name = path.basename(req.params.name);
    res.sendFile(path.join(compressedDir, name));
  });

  app.get('/', (req, res) => {
    const rows = store.all().map((r) => {
      const short = r.id.slice(0, 8);
      const img = r.compressedPath ? `<img src="/files/${path.basename(r.compressedPath)}" style="max-width:120px">` : '';
      return `<tr>
        <td>${short}</td>
        <td>${img}</td>
        <td>${escapeHtml(r.merchant || '?')}</td>
        <td>${escapeHtml(r.date || '?')}</td>
        <td>${r.amountTTC != null ? r.amountTTC.toFixed(2) + ' €' : '?'}</td>
        <td>${escapeHtml(r.category || '?')}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>
          ${r.status === 'pending' ? `<form method="post" action="/api/approve/${r.id}" style="display:inline"><button>Approuver</button></form>
          <form method="post" action="/api/reject/${r.id}" style="display:inline"><button>Rejeter</button></form>` : ''}
          ${r.status === 'error' ? `<small>${escapeHtml(r.error || '')}</small>` : ''}
          ${r.status === 'submitted' ? `<small>réf: ${escapeHtml(r.externalRef || '')}</small>` : ''}
        </td>
      </tr>`;
    }).join('\n');
    res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="15">
      <title>Notes de frais</title></head><body>
      <h1>Tickets en attente de traitement</h1>
      <form method="post" action="/api/submit"><button>Soumettre les approuvés sur le site</button></form>
      <table border="1" cellpadding="6"><thead><tr><th>ID</th><th>Photo</th><th>Commerçant</th><th>Date</th><th>Montant</th><th>Catégorie</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
  });

  return app;
}

export function publicReceipt(r) {
  const { rawText, ...rest } = r;
  return rest;
}
