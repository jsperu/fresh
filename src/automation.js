import { chromium } from 'playwright';

export function formatAmount(amount, separator = ',') {
  if (amount == null) return '';
  return Number(amount).toFixed(2).replace('.', separator);
}

export async function submitApproved({ store, siteUrl, username, password, headless = true, selectors, limit = 10, log = console.log, launch = (opts) => chromium.launch(opts) } = {}) {
  if (!siteUrl || !username || !password) {
    throw new Error('EXPENSE_SITE_URL, EXPENSE_USERNAME et EXPENSE_PASSWORD requis (voir .env)');
  }
  const approved = store.all({ status: 'approved' }).slice(0, limit);
  if (!approved.length) return { submitted: [], failed: [] };

  const browser = await launch({ headless });
  const results = { submitted: [], failed: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(new URL(selectors.loginPath || '/login', siteUrl).href);
    await page.fill(selectors.username, username);
    await page.fill(selectors.password, password);
    await page.click(selectors.loginSubmit);
    await page.waitForSelector(selectors.loggedInIndicator);
    log('connecté au site de notes de frais');

    for (const r of approved) {
      const short = r.id.slice(0, 8);
      try {
        await page.goto(new URL(selectors.newExpensePath, siteUrl).href);
        if (selectors.fields.date && r.date) await page.fill(selectors.fields.date, r.date);
        if (selectors.fields.amount && r.amountTTC != null) {
          await page.fill(selectors.fields.amount, formatAmount(r.amountTTC, selectors.decimalSeparator || ','));
        }
        if (selectors.fields.merchant && r.merchant) await page.fill(selectors.fields.merchant, r.merchant);
        if (selectors.fields.category && r.category) {
          await page.selectOption(selectors.fields.category, { label: r.category }).catch(() => {});
        }
        if (selectors.fields.comment) {
          await page.fill(selectors.fields.comment, `Ticket ${short}${r.vatRate != null ? ` - TVA ${r.vatRate}%` : ''}`);
        }
        if (selectors.fileInput && r.compressedPath) {
          await page.setInputFiles(selectors.fileInput, r.compressedPath);
        }
        await page.click(selectors.submitExpense);
        await page.waitForSelector(selectors.successIndicator);
        let ref = null;
        if (selectors.reference) {
          ref = (await page.textContent(selectors.reference).catch(() => null))?.trim() || null;
        }
        store.update(r.id, { status: 'submitted', externalRef: ref, submittedAt: new Date().toISOString() });
        results.submitted.push({ id: r.id, ref });
        log(`soumis: ${short} ${r.merchant || ''} ${r.amountTTC ?? ''} € (réf: ${ref || 'n/a'})`);
      } catch (e) {
        const msg = String(e.message || e).slice(0, 500);
        store.update(r.id, { status: 'error', error: msg });
        results.failed.push({ id: r.id, error: msg });
        log(`ÉCHEC: ${short}: ${msg.split('\n')[0]}`);
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return results;
}
