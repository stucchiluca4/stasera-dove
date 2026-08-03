/* Raccoglitore foto "di secondo livello" di Stasera Dove?.
   Per i siti che il raccoglitore leggero non riesce a leggere (pagine
   costruite in JavaScript, protezioni anti-bot, foto come sfondi):
   apre la homepage in un browser vero (Chromium/Playwright), gestisce i
   banner cookie, e in ordine prova: og:image dal DOM renderizzato →
   immagine più grande visibile → sfondo più grande → screenshot della
   homepage (solo se pulita da banner). Le foto degli utenti non vengono
   mai toccate. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const gs = (f, k) => (f?.[k] && 'stringValue' in f[k]) ? f[k].stringValue : null;
const gb = (f, k) => !!f?.[k]?.booleanValue;

async function listLocali() {
  let out = [], token = null;
  do {
    const u = `${BASE}/locali?pageSize=300&key=${API_KEY}` + (token ? `&pageToken=${encodeURIComponent(token)}` : '');
    const res = await fetch(u);
    if (!res.ok) throw new Error(`locali: HTTP ${res.status}`);
    const d = await res.json();
    for (const doc of d.documents ?? []) out.push({ id: doc.name.split('/').pop(), f: doc.fields ?? {} });
    token = d.nextPageToken ?? null;
  } while (token);
  return out;
}
async function patchDoc(id, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`write ${id}: HTTP ${res.status}`);
}
async function urlIsImage(u, minBytes) {
  try {
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/') || ct.includes('svg')) { res.body?.cancel?.(); return false; }
    const size = parseInt(res.headers.get('content-length') || '0', 10) || (await res.arrayBuffer()).byteLength;
    return size >= (minBytes || 1) && size <= 8_000_000;
  } catch { return false; }
}

const CONSENT = [
  '#onetrust-accept-btn-handler', '.iubenda-cs-accept-btn', '.cmplz-accept',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  'button:has-text("Accetta tutti")', 'button:has-text("Accetta tutto")',
  'button:has-text("Accetta")', 'button:has-text("ACCETTA")',
  'button:has-text("Accept all")', 'button:has-text("Accept")',
  'a:has-text("Accetta")', 'button:has-text("Ho capito")', 'button:has-text("OK")'
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  locale: 'it-IT'
});

const APP_ORIGIN = 'https://stucchiluca4.github.io';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

/* Fase 0 — verifica delle photoUrl esistenti come le vedrebbe un telefono
   (con Referer/Origin dell'app): le bloccate dall'hotlink-protection ma
   scaricabili vengono incorporate come dataURL; le morte vengono ripulite
   e il locale torna alla copertina illustrata. */
async function fetchImage(u, withRef) {
  const headers = { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' };
  if (withRef) { headers['Referer'] = APP_ORIGIN + '/stasera-dove/'; headers['Origin'] = APP_ORIGIN; }
  try {
    const res = await fetch(u, { redirect: 'follow', headers });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/') || ct.includes('svg')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? { buf, ct: ct.split(';')[0] } : null;
  } catch { return null; }
}
const locali0 = await listLocali();
let urlOk = 0, incorporate = 0, ripulite = 0;
for (const d of locali0) {
  const purl = gs(d.f, 'photoUrl');
  if (!purl || gb(d.f, 'deleted') || gs(d.f, 'photo')) continue;
  const nome = gs(d.f, 'n') ?? d.id;
  if (await fetchImage(purl, true)) { urlOk++; continue; }   // il telefono la vedrà
  const libera = await fetchImage(purl, false);              // bloccata solo con referer?
  if (libera && libera.buf.length <= 600000) {
    const dataUrl = `data:${libera.ct};base64,` + libera.buf.toString('base64');
    await patchDoc(d.id, { photo: { stringValue: dataUrl }, photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
    console.log(`⇩ ${nome}: hotlink bloccato, foto incorporata (${Math.round(libera.buf.length / 1024)}KB)`);
    incorporate++;
  } else {
    await patchDoc(d.id, { photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
    console.log(`✂ ${nome}: photoUrl irraggiungibile${libera ? ' (troppo pesante)' : ''}, torna la copertina`);
    ripulite++;
  }
}
console.log(`Verifica photoUrl: ${urlOk} ok · ${incorporate} incorporate · ${ripulite} ripulite.\n`);

const locali = await listLocali();
let viaUrl = 0, viaShot = 0, niente = 0, saltati = 0;
for (const d of locali) {
  const nome = gs(d.f, 'n') ?? d.id;
  const sito = gs(d.f, 'website');
  if (gb(d.f, 'deleted') || !sito || gs(d.f, 'photo') || gs(d.f, 'photoUrl')) { saltati++; continue; }
  const page = await ctx.newPage();
  try {
    let caricata = false;
    for (let tent = 0; tent < 2 && !caricata; tent++) {
      try { await page.goto(sito, { waitUntil: 'domcontentloaded', timeout: 40000 }); caricata = true; }
      catch (e) { if (tent === 1) throw e; }
    }
    await page.waitForTimeout(3500);
    for (const sel of CONSENT) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 300 })) { await el.click({ timeout: 1000 }); await page.waitForTimeout(500); break; }
      } catch { /* selettore assente */ }
    }
    await page.mouse.wheel(0, 400); await page.waitForTimeout(1200);
    await page.mouse.wheel(0, -400); await page.waitForTimeout(800);

    // 1) og:image dal DOM renderizzato
    let cand = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
      return m?.content || null;
    });
    if (cand) { try { cand = new URL(cand, page.url()).href.replace(/^http:/, 'https:'); } catch { cand = null; } }
    if (cand && /logo|icon|favicon|sprite|placeholder|badge/i.test(cand)) cand = null; // og:image che è solo un logo
    if (cand && !(await urlIsImage(cand, 25000))) cand = null;

    // 2) immagine più grande effettivamente caricata
    if (!cand) {
      cand = await page.evaluate(() => {
        const bad = /logo|icon|favicon|sprite|placeholder|whatsapp|tripadvisor|badge|payoff/i;
        return [...document.images]
          .map(i => ({ src: i.currentSrc || i.src, a: i.naturalWidth * i.naturalHeight, w: i.naturalWidth, h: i.naturalHeight }))
          .filter(x => x.src && x.src.startsWith('https') && x.w >= 500 && x.h >= 300 && !bad.test(x.src))
          .sort((a, b) => b.a - a.a)[0]?.src || null;
      });
      if (cand && !(await urlIsImage(cand, 25000))) cand = null;
    }

    // 3) sfondo (hero) più grande
    if (!cand) {
      cand = await page.evaluate(() => {
        let best = null, area = 0;
        const bad = /logo|icon|sprite/i;
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width < 600 || r.height < 300) continue;
          const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(https:[^"')]+)["']?\)/);
          if (m && !bad.test(m[1]) && r.width * r.height > area) { area = r.width * r.height; best = m[1]; }
        }
        return best;
      });
      if (cand && !(await urlIsImage(cand, 25000))) cand = null;
    }

    if (cand) {
      await patchDoc(d.id, { photoUrl: { stringValue: cand }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`✓ ${nome} (url): ${cand.slice(0, 85)}`);
      viaUrl++;
    } else {
      // 4) screenshot della homepage, solo se non coperta da banner
      const coperta = await page.evaluate(() => {
        for (const el of document.querySelectorAll('[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=iubenda i],[class*=iubenda i],[id*=onetrust i]')) {
          const s = getComputedStyle(el); const r = el.getBoundingClientRect();
          if (s.display !== 'none' && s.visibility !== 'hidden' && r.width * r.height > 0.25 * innerWidth * innerHeight) return true;
        }
        return false;
      });
      const spazzatura = await page.evaluate(() =>
        /attendi che la tua richiesta|checking the site connection|sito web scaduto|suspected phishing|access denied|are you a robot/i.test(document.body?.innerText || ''));
      if (coperta || spazzatura) { console.log(`— ${nome}: pagina non genuina (banner/anti-bot/scaduto), niente screenshot`); niente++; }
      else {
        const buf = await page.screenshot({ type: 'jpeg', quality: 68, clip: { x: 0, y: 0, width: 1200, height: 675 } });
        const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
        if (buf.length < 25000) { console.log(`— ${nome}: screenshot quasi vuoto, scartato`); niente++; }
        else if (dataUrl.length < 900000) {
          await patchDoc(d.id, { photo: { stringValue: dataUrl }, updatedAt: { integerValue: String(Date.now()) } });
          console.log(`✓ ${nome} (screenshot ${Math.round(buf.length / 1024)}KB)`);
          viaShot++;
        } else { console.log(`— ${nome}: screenshot troppo pesante`); niente++; }
      }
    }
  } catch (e) {
    console.log(`✗ ${nome}: ${String(e.message || e).slice(0, 90)}`);
    niente++;
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`\nRisultato: ${viaUrl} foto da URL · ${viaShot} da screenshot · ${niente} senza esito · ${saltati} saltati (già con foto o senza sito).`);
