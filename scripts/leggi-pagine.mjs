/* Lettore di pagine web generico.
   Riceve in env URLS un elenco di indirizzi separati da virgola, li apre con
   Chromium (supera i muri di consenso) e stampa nel log il testo della pagina:
   serve a leggere classifiche e menu che la rete della sessione non raggiunge. */
import { chromium } from 'playwright';

const URLS = (process.env.URLS || '').split(',').map(u => u.trim()).filter(Boolean);
if (!URLS.length) { console.log('URLS mancante'); process.exit(1); }
const MAX = parseInt(process.env.MAXCHARS || '60000', 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'it-IT',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
});
const CONSENSO = [
  '#onetrust-accept-btn-handler', '.iubenda-cs-accept-btn', '.cmplz-accept',
  'button:has-text("Accetta tutti")', 'button:has-text("Accetta tutto")',
  'button:has-text("Accetta")', 'button:has-text("Accept all")', 'button:has-text("ACCETTO")'
];

for (const url of URLS) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    for (const sel of CONSENSO) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 400 })) { await el.click({ timeout: 1500 }); await page.waitForTimeout(1500); break; }
      } catch { /* assente */ }
    }
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 2600); await page.waitForTimeout(500); }
    const testo = await page.evaluate(() => document.body.innerText || '');
    console.log('\n===== PAGINA: ' + url + ' =====');
    console.log(testo.slice(0, MAX));
    console.log('===== FINE (' + testo.length + ' caratteri totali) =====');
  } catch (e) {
    console.log('\n===== ERRORE ' + url + ': ' + String(e.message || e).slice(0, 120) + ' =====');
  } finally {
    await page.close();
  }
}
await browser.close();
