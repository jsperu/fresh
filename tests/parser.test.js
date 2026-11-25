import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, toNumber, findDate } from '../src/parser.js';

const SAMPLE = `CARREFOUR CITY
12 RUE DE LA REPUBLIQUE
75011 PARIS
Tel 01 23 45 67 89
12/03/2025 14:32
1 x CAFE 2,50 EUR
2 x SANDWICH 12,00 EUR
Sous-total 14,50 EUR
TVA 10% 1,45 EUR
TOTAL TTC 15,95 EUR
MERCI`;

test('toNumber gère virgule, point, espaces et milliers', () => {
  assert.equal(toNumber('15,95'), 15.95);
  assert.equal(toNumber('1 234,56'), 1234.56);
  assert.equal(toNumber('1 234.56'), 1234.56);
  assert.equal(toNumber('42'), 42);
});

test('findDate gère JJ/MM/AAAA et années courtes', () => {
  assert.equal(findDate('le 05/11/2025'), '2025-11-05');
  assert.equal(findDate('le 5/11/25'), '2025-11-05');
  assert.equal(findDate('12 mars 2025'), '2025-03-12');
  assert.equal(findDate('3 décembre 2024'), '2024-12-03');
});

test('parseReceiptText extrait les champs d un ticket français', () => {
  const r = parseReceiptText(SAMPLE);
  assert.equal(r.merchant, 'CARREFOUR CITY');
  assert.equal(r.date, '2025-03-12');
  assert.equal(r.amountTTC, 15.95);
  assert.equal(r.vatRate, 10);
  assert.equal(r.vatAmount, 1.45);
  assert.equal(r.category, 'Courses');
});

test('parseReceiptText prend le max si pas de ligne TOTAL', () => {
  const r = parseReceiptText('TAXI PARIS\n01/06/2025\ncourse 18,40 EUR\nfrais 2,00 EUR');
  assert.equal(r.amountTTC, 18.4);
  assert.equal(r.category, 'Transport');
});

test('parseReceiptText gère un montant avec milliers', () => {
  const r = parseReceiptText('HOTEL IBIS\n10/01/2025\nTOTAL TTC 1 234,56 EUR\nTVA 20%');
  assert.equal(r.amountTTC, 1234.56);
  assert.equal(r.vatRate, 20);
  assert.equal(r.category, 'Hébergement');
});
