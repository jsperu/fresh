import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { compressImage, pdfFirstPageToJpeg } from './image.js';
import { ocrImage } from './ocr.js';
import { parseReceiptText } from './parser.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.bmp']);

export function isSupportedFile(name) {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase()) || path.extname(name).toLowerCase() === '.pdf';
}

export async function ingestFile(filePath, { store, originalsDir, compressedDir, lang = 'fra', ocr = ocrImage } = {}) {
  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = store.findByHash(hash);
  if (existing) return { receipt: existing, duplicate: true };

  fs.mkdirSync(originalsDir, { recursive: true });
  fs.mkdirSync(compressedDir, { recursive: true });

  const base = hash.slice(0, 16);
  const originalPath = path.join(originalsDir, `${base}${path.extname(filePath).toLowerCase()}`);
  fs.renameSync(filePath, originalPath);

  const compressedPath = path.join(compressedDir, `${base}.jpg`);
  const ext = path.extname(originalPath).toLowerCase();
  if (ext === '.pdf') {
    await pdfFirstPageToJpeg(originalPath, compressedPath);
  } else {
    await compressImage(originalPath, compressedPath);
  }

  const text = await ocr(compressedPath, lang);
  const parsed = parseReceiptText(text);

  const receipt = store.add({
    hash,
    merchant: parsed.merchant,
    date: parsed.date,
    amountTTC: parsed.amountTTC,
    amountHT: parsed.amountHT,
    vatRate: parsed.vatRate,
    vatAmount: parsed.vatAmount,
    category: parsed.category,
    rawText: parsed.rawText,
    originalPath,
    compressedPath,
  });
  return { receipt, duplicate: false };
}

export async function ingestInbox({ store, inboxDir, originalsDir, compressedDir, lang, ocr, log = console.log } = {}) {
  fs.mkdirSync(inboxDir, { recursive: true });
  const files = fs.readdirSync(inboxDir).filter((f) => isSupportedFile(f));
  const results = [];
  for (const f of files) {
    const full = path.join(inboxDir, f);
    try {
      const { receipt, duplicate } = await ingestFile(full, { store, originalsDir, compressedDir, lang, ocr });
      results.push({ file: f, receipt, duplicate });
      log(`${duplicate ? 'doublon ignoré' : 'ingéré'} : ${f} -> ${receipt.id.slice(0, 8)} ${receipt.merchant || '?'} ${receipt.amountTTC ?? '?'} €`);
    } catch (e) {
      log(`ERREUR sur ${f}: ${e.message}`);
      results.push({ file: f, error: e.message });
    }
  }
  return results;
}
