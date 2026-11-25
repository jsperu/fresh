import { createWorker } from 'tesseract.js';
import { OCR_LANG, OCR_PROVIDER, MISTRAL_API_KEY, MISTRAL_OCR_MODEL } from './config.js';
import { ocrWithMistral } from './ocr-mistral.js';

let workerPromise = null;

function getWorker(lang) {
  if (!workerPromise) workerPromise = createWorker(lang);
  return workerPromise;
}

async function ocrWithTesseract(file, lang) {
  const worker = await getWorker(lang);
  const { data } = await worker.recognize(file);
  return data.text;
}

export async function ocrImage(file, opts = {}) {
  const o = typeof opts === 'string' ? { lang: opts } : opts;
  const {
    lang = OCR_LANG,
    provider = OCR_PROVIDER,
    apiKey = MISTRAL_API_KEY,
    model = MISTRAL_OCR_MODEL,
    fetchImpl = fetch,
    tesseractImpl = ocrWithTesseract,
    log = console.warn,
  } = o;
  if (provider === 'mistral') {
    try {
      return await ocrWithMistral(file, { apiKey, model, fetchImpl });
    } catch (e) {
      log(`Mistral OCR indisponible (${e.message}) — repli sur Tesseract local`);
      return tesseractImpl(file, lang);
    }
  }
  return tesseractImpl(file, lang);
}

export async function shutdownOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    workerPromise = null;
    await worker.terminate();
  }
}
