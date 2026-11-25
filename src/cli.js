import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, DATA_DIR, DB_FILE, INBOX_DIR, ORIGINALS_DIR, COMPRESSED_DIR,
  SERVER_PORT, UPLOAD_HOST, SERVER_TOKEN, OCR_LANG,
  EXPENSE_SITE_URL, EXPENSE_USERNAME, EXPENSE_PASSWORD, EXPENSE_HEADLESS,
  ensureDirs, loadSelectors,
} from './config.js';
import { Store } from './store.js';
import { ingestInbox } from './pipeline.js';
import { shutdownOcr } from './ocr.js';
import { createApp } from './server.js';
import { submitApproved } from './automation.js';

const [, , cmd, ...args] = process.argv;

function getStore() {
  ensureDirs();
  return new Store(DB_FILE);
}

function printReceipt(r) {
  const short = r.id.slice(0, 8);
  const amount = r.amountTTC != null ? `${r.amountTTC.toFixed(2)} €` : '?';
  console.log(`${short}  [${r.status}]  ${r.date || '?'}  ${amount.padStart(10)}  ${r.category || '?'}  ${r.merchant || '?'}${r.externalRef ? `  (réf: ${r.externalRef})` : ''}${r.error ? `  ERREUR: ${r.error.split('\n')[0]}` : ''}`);
}

async function cmdInit() {
  ensureDirs();
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(path.join(ROOT, '.env.example'), envFile);
    fs.chmodSync(envFile, 0o600);
    console.log('.env créé (chmod 600) — remplis EXPENSE_SITE_URL, EXPENSE_USERNAME, EXPENSE_PASSWORD et SERVER_TOKEN');
  } else {
    console.log('.env existe déjà');
  }
  const selFile = path.join(ROOT, 'config', 'selectors.json');
  if (!fs.existsSync(selFile)) {
    fs.copyFileSync(path.join(ROOT, 'config', 'selectors.example.json'), selFile);
    console.log('config/selectors.json créé — adapte les sélecteurs à ton site');
  }
}

async function cmdIngest() {
  const watch = args.includes('--watch');
  const store = getStore();
  const opts = { store, inboxDir: INBOX_DIR, originalsDir: ORIGINALS_DIR, compressedDir: COMPRESSED_DIR, lang: OCR_LANG };
  await ingestInbox(opts);
  if (!watch) await shutdownOcr();
  if (watch) {
    console.log(`surveillance de ${INBOX_DIR} (Ctrl+C pour quitter)...`);
    let timer = null;
    fs.watch(INBOX_DIR, () => {
      clearTimeout(timer);
      timer = setTimeout(() => ingestInbox(opts).catch(console.error), 1000);
    });
    await new Promise(() => {});
  }
}

async function cmdList() {
  const statusIdx = args.indexOf('--status');
  const status = statusIdx !== -1 ? args[statusIdx + 1] : null;
  const store = getStore();
  const rows = store.all(status ? { status } : {});
  if (!rows.length) console.log('aucun ticket');
  for (const r of rows) printReceipt(r);
}

async function cmdShow() {
  const store = getStore();
  const r = store.get(args[0] || '');
  if (!r) return console.error('ticket introuvable');
  console.log(JSON.stringify(r, null, 2));
}

function cmdStatus(action) {
  const store = getStore();
  const target = args[0];
  if (!target) return console.error(`usage: ${action} <id|all>`);
  const rows = target === 'all' ? store.all() : [store.get(target)].filter(Boolean);
  if (!rows.length) return console.error('aucun ticket correspondant');
  for (const r of rows) {
    store.update(r.id, { status: action === 'approve' ? 'approved' : 'rejected' });
    printReceipt(store.get(r.id));
  }
}

async function cmdSubmit() {
  const store = getStore();
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 10;
  const selectors = loadSelectors();
  const res = await submitApproved({
    store,
    siteUrl: EXPENSE_SITE_URL,
    username: EXPENSE_USERNAME,
    password: EXPENSE_PASSWORD,
    headless: EXPENSE_HEADLESS,
    selectors,
    limit,
  });
  console.log(`soumis: ${res.submitted.length}, échecs: ${res.failed.length}`);
  for (const f of res.failed) console.error(`échec ${f.id.slice(0, 8)}: ${f.error.split('\n')[0]}`);
}

async function cmdServe() {
  ensureDirs();
  const store = getStore();
  const app = createApp({
    store,
    token: SERVER_TOKEN,
    compressedDir: COMPRESSED_DIR,
    onSubmit: async () => {
      const selectors = loadSelectors();
      await submitApproved({
        store: getStore(),
        siteUrl: EXPENSE_SITE_URL,
        username: EXPENSE_USERNAME,
        password: EXPENSE_PASSWORD,
        headless: EXPENSE_HEADLESS,
        selectors,
      });
    },
  });
  app.locals.ocrLang = OCR_LANG;
  app.listen(SERVER_PORT, UPLOAD_HOST, () => {
    console.log(`UI de revue: http://${UPLOAD_HOST}:${SERVER_PORT}/`);
    console.log(`Upload iPhone: POST http://${UPLOAD_HOST}:${SERVER_PORT}/upload (en-tête X-Token, champ "file")`);
  });
}

const commands = {
  init: cmdInit,
  ingest: cmdIngest,
  list: cmdList,
  show: cmdShow,
  approve: () => cmdStatus('approve'),
  reject: () => cmdStatus('reject'),
  submit: cmdSubmit,
  serve: cmdServe,
};

if (!commands[cmd]) {
  console.log(`usage: node src/cli.js <commande>
  init                 créer .env (chmod 600) et config/selectors.json
  ingest [--watch]     traiter les photos déposées dans data/inbox
  list [--status X]    lister les tickets (pending|approved|submitted|rejected|error)
  show <id>            afficher le détail (OCR brut inclus)
  approve <id|all>     approuver pour soumission
  reject <id|all>      rejeter
  submit [--limit N]   saisir les tickets approuvés via Playwright
  serve                serveur local d'upload + UI de revue`);
  process.exit(cmd ? 1 : 0);
}

await commands[cmd]();
