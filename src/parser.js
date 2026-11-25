const FR_MONTHS = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

export function toNumber(raw) {
  let s = String(raw).replace(/[\s  ]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const sep = Math.max(lastComma, lastDot);
  if (sep === -1) return Number.parseInt(s, 10);
  const intPart = s.slice(0, sep).replace(/[.,]/g, '');
  const frac = s.slice(sep + 1).replace(/[.,]/g, '');
  return Number.parseFloat(`${intPart}.${frac}`);
}

const AMOUNT_RE = /(\d[\d\s  ]*[.,]\d{2}|\d+)\s*(?:€|EUR|euros?)\b/gi;

function amountsIn(line) {
  const out = [];
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(line)) !== null) out.push(toNumber(m[1]));
  return out;
}

export function findDate(text) {
  let m = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/.exec(text);
  if (m) {
    let [, d, mo, y] = m;
    d = Number(d); mo = Number(mo);
    y = Number(y);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  m = /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/i.exec(text);
  if (m) {
    const mo = FR_MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function findAmounts(text, lines) {
  let total = null;
  let vatRate = null;
  let vatAmount = null;
  let net = null;
  let maxAmount = null;

  for (const line of lines) {
    const amounts = amountsIn(line);
    for (const a of amounts) {
      if (maxAmount === null || a > maxAmount) maxAmount = a;
    }
    if (/total|ttc|à payer|a payer|montant/i.test(line) && amounts.length) {
      total = amounts[amounts.length - 1];
    }
    if (/tva|taxe/i.test(line)) {
      const pct = /(\d{1,2}(?:[.,]\d)?)\s*%/.exec(line);
      if (pct) vatRate = toNumber(pct[1]);
      if (amounts.length) vatAmount = amounts[amounts.length - 1];
    }
    if (/\bht\b|hors taxe/i.test(line) && amounts.length) {
      net = amounts[amounts.length - 1];
    }
  }
  if (total === null) total = maxAmount;
  return { total, vatRate, vatAmount, net };
}

export function guessMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.replace(/[:#].*$/, '').trim();
    if (/[a-zA-Zàâäéèêëîïôöùûüç]{3,}/.test(cleaned) && cleaned.length <= 60) {
      return cleaned.replace(/\s+\d+$/, '').trim();
    }
  }
  return null;
}

const CATEGORIES = [
  ['Repas', /restaurant|resto|brasserie|café|cafe|pizza|burger|sandwich|uber ?eats|deliveroo|traiteur|boulangerie|pâtisserie|patisserie|mc ?do|mcdonald|quick|kebab|sushi|bistrot/i],
  ['Courses', /carrefour|leclerc|auchan|lidl|intermarché|intermarche|monoprix|franprix|casino|market|épicerie|epicerie|supermarché|supermarche/i],
  ['Carburant', /essence|carburant|totalenergies|total ?station|shell|\bbp\b|avia|station[- ]service/i],
  ['Transport', /sncf|ouigo|inoui|uber|taxi|bolt|free now|blablacar|péage|peage|parking|avion|air france|easyjet|trainline|flixbus|flixbus/i],
  ['Hébergement', /hôtel|hotel|airbnb|booking\.com|auberges|ibis|novotel|mercure/i],
  ['Fournitures', /amazon|fnac|darty|boulanger|papeterie|bureau|ikea|decathlon|castorama|leroy/i],
  ['Télécom', /orange|free|sfr|bouygues|red|sosh|ovh|ovhcloud/i],
  ['Santé', /pharmacie|docteur|médecin|medecin|laboratoire|opticien|dentiste/i],
];

export function guessCategory(text, merchant = null) {
  if (merchant) {
    for (const [name, re] of CATEGORIES) {
      if (re.test(merchant)) return name;
    }
  }
  for (const [name, re] of CATEGORIES) {
    if (re.test(text)) return name;
  }
  return 'Autre';
}

export function parseReceiptText(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const date = findDate(text);
  const { total, vatRate, vatAmount, net } = findAmounts(text, lines);
  const merchant = guessMerchant(lines);
  return {
    merchant,
    date,
    amountTTC: total,
    amountHT: net,
    vatRate,
    vatAmount,
    category: guessCategory(text, merchant),
    rawText: text,
  };
}
