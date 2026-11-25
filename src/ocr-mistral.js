import fs from 'node:fs';

export async function ocrWithMistral(file, { apiKey, model = 'mistral-ocr-latest', fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('MISTRAL_API_KEY manquante (voir .env)');
  const b64 = fs.readFileSync(file).toString('base64');
  const res = await fetchImpl('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      document: { type: 'image_url', image_url: `data:image/jpeg;base64,${b64}` },
      include_image_base64: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Mistral OCR HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const pages = Array.isArray(data.pages) ? data.pages : [];
  return pages.map((p) => p.markdown ?? p.text ?? '').join('\n');
}
