import sharp from 'sharp';

const lines = [
  'CARREFOUR CITY',
  '12 RUE DE LA REPUBLIQUE',
  '75011 PARIS',
  '',
  '12/03/2025 14:32',
  '1 x CAFE                2,50 EUR',
  '2 x SANDWICH           12,00 EUR',
  'Sous-total             14,50 EUR',
  'TVA 10%                 1,45 EUR',
  'TOTAL TTC              15,95 EUR',
  '',
  'MERCI DE VOTRE VISITE',
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${lines.length * 34 + 40}">
  <rect width="100%" height="100%" fill="white"/>
  ${lines.map((l, i) => `<text x="30" y="${50 + i * 34}" font-family="Roboto Mono, Courier New, monospace" font-size="22" fill="black">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('\n')}
</svg>`;

const out = process.argv[2] || 'data/inbox/demo-ticket.png';
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`ticket de démo généré: ${out}`);
