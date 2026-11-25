import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(ROOT, '.env') });

export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');
export const INBOX_DIR = path.join(DATA_DIR, 'inbox');
export const ORIGINALS_DIR = path.join(DATA_DIR, 'originals');
export const COMPRESSED_DIR = path.join(DATA_DIR, 'compressed');

export const SERVER_PORT = Number(process.env.SERVER_PORT || 4789);
export const UPLOAD_HOST = process.env.UPLOAD_HOST || '127.0.0.1';
export const SERVER_TOKEN = process.env.SERVER_TOKEN || '';
export const OCR_LANG = process.env.OCR_LANG || 'fra';
export const OCR_PROVIDER = process.env.OCR_PROVIDER || 'tesseract';
export const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
export const MISTRAL_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

export const EXPENSE_SITE_URL = process.env.EXPENSE_SITE_URL || '';
export const EXPENSE_USERNAME = process.env.EXPENSE_USERNAME || '';
export const EXPENSE_PASSWORD = process.env.EXPENSE_PASSWORD || '';
export const EXPENSE_HEADLESS = process.env.EXPENSE_HEADLESS !== 'false';

export const SELECTORS_FILE = path.join(ROOT, 'config', 'selectors.json');

export function ensureDirs() {
  for (const d of [DATA_DIR, INBOX_DIR, ORIGINALS_DIR, COMPRESSED_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function loadSelectors() {
  if (!fs.existsSync(SELECTORS_FILE)) {
    throw new Error(`config/selectors.json introuvable. Copie config/selectors.example.json et adapte-le à ton site : ${SELECTORS_FILE}`);
  }
  return JSON.parse(fs.readFileSync(SELECTORS_FILE, 'utf8'));
}
