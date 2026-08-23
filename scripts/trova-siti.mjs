/* Caccia ai siti ufficiali mancanti.
   Cerca ogni locale su Bing (l'unico motore che i runner riescono ad aprire) e
   legge l'indirizzo mostrato sotto ogni risultato — non il link, che Bing
   avvolge in un proprio redirect. Salva solo domini che richiamano il nome del
   locale e che non siano aggregatori o social. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DA = parseInt(process.env.DA || '0', 10);
const QUANTI = parseInt(process.env.QUANTI || '400', 10);

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
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`write ${id}: HTTP ${res.status}`);
}

const VIETATI = /bing\.|duckduckgo|mojeek|google\.|yandex|tripadvisor|thefork|quandoo|deliveroo|justeat|just-eat|glovo|ubereats|facebook|instagram|twitter|tiktok|youtube|linkedin|yelp|foursquare|wikipedia|50toppizza|gamberorosso|italiangourmet|dissapore|scattidigusto|puntarellarossa|reddit|pinterest|amazon|booking\.|expedia|paginegialle|virgilio|misterdelivery|restaurantguru|giallozafferano|top-rated|menu\.it|prenota/i;

function semplifica(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 }, locale: 'it-IT',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
});
const page = await ctx.newPage();

async function cerca(q) {
  try {
    await page.goto('https://www.bing.com/search?setlang=it&cc=IT&q=' + encodeURIComponent(q),
      { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
    return await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('li.b_algo').forEach(function (li) {
        const cite = li.querySelector('cite');                 // l'indirizzo mostrato in chiaro
        const h2 = li.querySelector('h2');
        if (cite && cite.innerText) out.push({ cite: cite.innerText.trim(), titolo: h2 ? h2.innerText : '' });
      });
      return out.slice(0, 8);
    });
  } catch { return []; }
}

const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted') && !gs(d.f, 'website'));
const lista = tutti.slice(DA, DA + QUANTI);
console.log(`Locali senza sito da cercare: ${lista.length}\n`);

let trovati = 0, nulla = 0;
for (const d of lista) {
  const nome = gs(d.f, 'n') || d.id;
  const comune = (gs(d.f, 't') || '').split('(')[0].trim();
  const parole = nome.split(/[^A-Za-zÀ-ú0-9]+/).filter(w => w.length > 2).map(semplifica);
  let scelto = null;

  for (const q of [`${nome} ${comune} sito ufficiale`, `${nome} pizzeria ${comune}`]) {
    const res = await cerca(q);
    for (const r of res) {
      let host = r.cite.replace(/^https?:\/\//i, '').split(/[\/\s›]/)[0].toLowerCase();
      if (!host || !host.includes('.') || VIETATI.test(host)) continue;
      const hs = semplifica(host);
      // il dominio deve richiamare il nome del locale (o il nome richiamare il dominio)
      const somiglia = parole.some(w => w.length > 3 && hs.includes(w)) ||
                       (parole.length && hs.includes(parole.join('')));
      if (somiglia) { scelto = 'https://' + host.replace(/^www\./, 'www.'); break; }
    }
    if (scelto) break;
  }

  if (scelto) {
    try {
      await patchDoc(d.id, { website: { stringValue: scelto }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`✓ ${nome} (${comune}) → ${scelto}`);
      trovati++;
    } catch (e) { console.log(`✗ ${nome}: ${String(e.message).slice(0, 60)}`); }
  } else {
    console.log(`· ${nome} (${comune}) — nessun sito riconoscibile`);
    nulla++;
  }
  await new Promise(r => setTimeout(r, 700));
}
await browser.close();
console.log(`\nRisultato: ${trovati} siti ufficiali trovati · ${nulla} senza esito.`);
