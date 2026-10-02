/* La guida 50 Top Pizza pubblica, nella scheda di ogni pizzeria, il campo
   "pizza gluten free: si/no". È il dato più attendibile che esista per le
   pizzerie in classifica, quindi lo leggiamo da lì invece di indovinarlo.
   - "si" -> gf 1 (lo dichiara la guida)
   - "no" -> non mettiamo nessuna etichetta, ma salviamo la nota: così in app
     si legge "non fanno la pizza senza glutine" invece del nulla.
   Non tocchiamo chi ha già un dato più forte (1 o 2) salvo per confermarlo. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SCRIVI = process.env.SCRIVI !== '0';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const gs = (f, k) => (f?.[k] && 'stringValue' in f[k]) ? f[k].stringValue : null;
const gi = (f, k) => (f?.[k] && 'integerValue' in f[k]) ? parseInt(f[k].integerValue, 10) : null;
const gb = (f, k) => !!f?.[k]?.booleanValue;
const ga = (f, k) => (f?.[k]?.arrayValue?.values ?? []).map(v => v.stringValue).filter(Boolean);

const slug = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function listLocali() {
  let out = [], token = null;
  do {
    const u = `${BASE}/locali?pageSize=300&key=${API_KEY}` + (token ? `&pageToken=${encodeURIComponent(token)}` : '');
    const r = await fetch(u); if (!r.ok) throw new Error('locali HTTP ' + r.status);
    const d = await r.json();
    for (const doc of d.documents ?? []) out.push({ id: doc.name.split('/').pop(), f: doc.fields ?? {} });
    token = d.nextPageToken ?? null;
  } while (token);
  return out;
}
async function patchDoc(id, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('write HTTP ' + r.status);
}

/* 1) tutte le schede della guida, dalle sitemap */
const schede = [];
for (const n of ['', '2', '3', '4', '5', '6']) {
  const u = `https://www.50toppizza.it/referenza-sitemap${n}.xml`;
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log(`  sitemap${n}: HTTP ${r.status}`); continue; }
    const xml = await r.text();
    for (const m of xml.matchAll(/<loc>([^<]*\/referenza\/[^<]*)<\/loc>/g)) schede.push(m[1]);
  } catch (e) { console.log(`  sitemap${n}: ${String(e.message).slice(0, 60)}`); }
}
const uniche = [...new Set(schede)];
console.log(`Schede 50 Top Pizza trovate: ${uniche.length}`);
const perSlug = uniche.map(u => {
  const s = u.replace(/\/$/, '').split('/').pop();
  return { url: u, slug: s, base: s.replace(/-(?:\d{1,4}|20\d\d)$/, '') };
});

/* 2) i nostri locali senza un dato forte */
const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted'));
const nostri = tutti.filter(d => {
  const g = gi(d.f, 'gf') || 0;
  return g === 0 || g === 3;            // chi è 1 o 2 ha già un dato migliore
});
console.log(`Locali da confrontare: ${nostri.length} (di ${tutti.length})\n`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'it-IT', userAgent: UA });
const page = await ctx.newPage();

let si = 0, no = 0, senza = 0;
for (const d of nostri) {
  const nome = gs(d.f, 'n') || d.id;
  const citta = gs(d.f, 't') || '';
  const sn = slug(nome);
  if (sn.length < 3) { senza++; continue; }
  /* la scheda giusta è quella il cui slug comincia come il nome del locale */
  const cand = perSlug.filter(p => p.base === sn || p.base.startsWith(sn + '-') || p.slug === sn)
    .concat(perSlug.filter(p => p.base.length > 5 && sn.startsWith(p.base)));
  if (!cand.length) { senza++; console.log(`  ${nome} (${citta}) — nessuna scheda in guida`); continue; }

  let esito = null, usata = null;
  for (const c of cand.slice(0, 4)) {
    let testo = '';
    try {
      await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(800);
      testo = await page.evaluate(() => document.body.innerText || '');
    } catch { continue; }
    const m = testo.match(/pizza\s+gluten\s+free\s*:\s*(si|s[ìi]|no)/i);
    if (!m) continue;
    /* controllo che la scheda sia davvero la nostra: città o nome nel testo */
    const t = testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cittaBase = citta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[(,]/)[0].trim();
    if (cittaBase && cittaBase.length > 3 && !t.includes(cittaBase)) continue;
    esito = /no/i.test(m[1]) ? 'no' : 'si'; usata = c.url; break;
  }
  if (!esito) { senza++; console.log(`  ${nome} (${citta}) — scheda senza il campo o città diversa`); continue; }

  const agg = { updatedAt: { integerValue: String(Date.now()) } };
  if (esito === 'si') {
    agg.gf = { integerValue: '1' };
    agg.gfNote = { stringValue: 'La guida 50 Top Pizza indica la pizza senza glutine in questo locale. Non è un locale interamente senza glutine: chiedi come gestiscono la contaminazione.' };
    si++; console.log(`✓ ${nome} (${citta}) — la guida dice sì`);
  } else {
    const prima = gi(d.f, 'gf') || 0;
    agg.gf = { integerValue: String(prima === 3 ? 3 : 0) };
    agg.gfNote = { stringValue: 'Secondo la scheda 50 Top Pizza qui non fanno la pizza senza glutine.' };
    no++; console.log(`· ${nome} (${citta}) — la guida dice no`);
  }
  if (SCRIVI) { try { await patchDoc(d.id, agg); } catch (e) { console.log(`  ✗ scrittura ${nome}: ${e.message}`); } }
  await new Promise(r => setTimeout(r, 250));
}
await browser.close();
console.log(`\nRisultato: ${si} con pizza senza glutine · ${no} senza · ${senza} non trovati in guida.`);
