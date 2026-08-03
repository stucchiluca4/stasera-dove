/* Lettore di liste condivise Google Maps.
   Apre il link (env LISTA_URL) con Chromium, supera il muro di consenso,
   scorre il pannello per caricare tutte le voci e stampa nel log il testo
   della pagina: i nomi dei luoghi vengono poi estratti a valle. */
import { chromium } from 'playwright';

const URL_LISTA = process.env.LISTA_URL;
if (!URL_LISTA) { console.log('LISTA_URL mancante'); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'it-IT',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
});
const page = await ctx.newPage();
await page.goto(URL_LISTA, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4000);

// muro di consenso Google (consent.google.com o dialog in pagina)
for (const sel of ['button:has-text("Accetta tutto")', 'button:has-text("Accept all")', 'button[aria-label*="Accetta"]', 'form[action*="consent"] button']) {
  try {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 800 })) { await el.click({ timeout: 2000 }); await page.waitForTimeout(3000); break; }
  } catch { /* assente */ }
}
console.log('URL finale:', page.url());
console.log('Titolo:', await page.title());

// scorri il pannello-lista per caricare tutte le voci (lazy load)
for (let i = 0; i < 12; i++) {
  const mosso = await page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]') ||
      [...document.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 300);
    if (feed) { feed.scrollBy(0, 1200); return true; }
    window.scrollBy(0, 1200); return false;
  });
  await page.waitForTimeout(1200);
  if (!mosso && i > 4) break;
}

const testo = await page.evaluate(() => document.body.innerText || '');
console.log('--- INIZIO TESTO PAGINA ---');
console.log(testo.slice(0, 24000));
console.log('--- FINE TESTO PAGINA ---');
await browser.close();
