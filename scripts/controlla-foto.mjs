/* Controllo delle foto dell'archivio.
   Per ogni locale con una foto presa da un link esterno (photoUrl) apre
   l'immagine in un browser vero e riporta: se si carica, quanto pesa, quanto
   è grande e se il link sta sul sito del locale o su un sito di terzi
   (TripAdvisor, portali, blog). Le foto caricate dagli utenti (photo) non si
   toccano mai.
   SCRIVI=1 cancella il link delle foto che non si caricano più: meglio
   nessuna foto che un riquadro rotto. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SCRIVI = process.env.SCRIVI === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const gs = (f, k) => (f?.[k] && 'stringValue' in f[k]) ? f[k].stringValue : null;
const gb = (f, k) => !!f?.[k]?.booleanValue;

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
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const radice = h => h.split('.').slice(-2).join('.');
/* portali e testate: la foto non è loro da dare, e spesso bloccano il link */
const TERZI = /tripadvisor|restaurantguru|thefork|quandoo|deliveroo|justeat|glovo|ubereats|sluurpy|piatti\.menu|menuweb|restaurantpro|yelp|foursquare|facebook|fbcdn|instagram|cdninstagram|googleusercontent|gstatic|lucianopignataro|scattidigusto|italiaatavola|gamberorosso|dissapore|puntarellarossa|reportergourmet|identitagolose|cibotoday|agrodolce|garage\.pizza|thegreat\.pizza|50toppizza|pizzaontheroad|wanderlog|wanderboat|atly|findmeglutenfree/i;

const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted'));
const conLink = tutti.filter(d => gs(d.f, 'photoUrl') && !gs(d.f, 'photo'));
const utente = tutti.filter(d => gs(d.f, 'photo')).length;
const nessuna = tutti.filter(d => !gs(d.f, 'photo') && !gs(d.f, 'photoUrl'));
console.log(`Locali attivi: ${tutti.length} · foto caricate dagli utenti: ${utente} · foto da link: ${conLink.length} · senza foto: ${nessuna.length}\n`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, userAgent: UA, locale: 'it-IT' });
const page = await ctx.newPage();

let ok = 0, rotte = 0, piccole = 0, propri = 0, diTerzi = 0, altri = 0;
const daSistemare = [];
for (const d of conLink) {
  const nome = gs(d.f, 'n') || d.id;
  const url = gs(d.f, 'photoUrl');
  const sito = gs(d.f, 'website');
  const hFoto = host(url), hSito = host(sito || '');
  let origine = 'altro sito';
  if (hSito && (radice(hFoto) === radice(hSito))) { origine = 'sito del locale'; propri++; }
  else if (TERZI.test(hFoto)) { origine = 'portale/testata'; diTerzi++; }
  else altri++;

  let stato = 'non si carica', w = 0, h = 0, peso = 0;
  try {
    /* il Referer del sito del locale: senza di esso molti CDN rifiutano */
    await ctx.setExtraHTTPHeaders(sito ? { Referer: sito } : {});
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 25000 });
    const code = resp ? resp.status() : 0;
    const ct = resp ? (resp.headers()['content-type'] || '') : '';
    if (code >= 200 && code < 300 && /image/i.test(ct)) {
      try { peso = (await resp.body()).length; } catch { peso = 0; }
      const dim = await page.evaluate(() => {
        const i = document.images[0];
        return i ? { w: i.naturalWidth, h: i.naturalHeight } : { w: 0, h: 0 };
      });
      w = dim.w; h = dim.h;
      if (w >= 600 && peso >= 20000) { stato = 'ok'; ok++; }
      else { stato = 'troppo piccola'; piccole++; }
    } else { stato = `HTTP ${code}${ct ? ' · ' + ct.split(';')[0] : ''}`; rotte++; }
  } catch (e) { stato = 'errore: ' + String(e.message || e).slice(0, 40); rotte++; }

  const riga = `${stato === 'ok' ? '✓' : '✗'} ${nome} — ${stato}` +
    (w ? ` (${w}×${h}, ${Math.round(peso / 1024)} KB)` : '') + ` · ${origine} · ${hFoto}`;
  console.log(riga);
  if (stato !== 'ok') daSistemare.push({ id: d.id, nome, url, stato, origine });
  await new Promise(r => setTimeout(r, 150));
}

console.log(`\nFoto da link: ${ok} buone · ${piccole} troppo piccole · ${rotte} non si caricano.`);
console.log(`Provenienza: ${propri} dal sito del locale · ${diTerzi} da portali o testate · ${altri} da altri siti.`);
if (nessuna.length) {
  console.log(`\nSenza nessuna foto (${nessuna.length}):`);
  for (const d of nessuna) console.log(`  ${gs(d.f, 'n')} (${gs(d.f, 't') || ''}) — ${gs(d.f, 'website') || 'nessun sito'}`);
}
if (SCRIVI) {
  const rotti = daSistemare.filter(x => x.stato !== 'troppo piccola');
  for (const x of rotti) {
    try {
      await patchDoc(x.id, { photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`  pulito il link rotto di ${x.nome}`);
    } catch (e) { console.log(`  ✗ ${x.nome}: ${e.message}`); }
  }
  console.log(`\nLink rotti cancellati: ${rotti.length}`);
}
await browser.close();
