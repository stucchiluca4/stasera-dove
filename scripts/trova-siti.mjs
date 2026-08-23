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
  /* Niente selettori: la struttura di Bing cambia spesso. Leggo il testo della
     pagina ed estraggo gli indirizzi e il telefono che mostra in chiaro. */
  try {
    await page.goto('https://www.bing.com/search?setlang=it&cc=IT&q=' + encodeURIComponent(q),
      { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
    const testo = await page.evaluate(() => document.body ? document.body.innerText : '');
    const indirizzi = [];
    const re = /https?:\/\/[^\s"'<>)\]]+/gi;
    let m;
    while ((m = re.exec(testo)) !== null) indirizzi.push(m[0]);
    const tel = (testo.match(/\+39[\s.\-]?[0-9][0-9\s.\-]{7,16}/) || [null])[0];
    return { indirizzi, tel: tel ? tel.trim().replace(/[\s.\-]+/g, ' ') : null };
  } catch { return { indirizzi: [], tel: null }; }
}

const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted') && (!gs(d.f, 'website') || !gs(d.f, 'phone')));
const lista = tutti.slice(DA, DA + QUANTI);
console.log(`Locali da completare (sito o telefono): ${lista.length}\n`);

let trovati = 0, nulla = 0, telefoni = 0;
for (const d of lista) {
  const nome = gs(d.f, 'n') || d.id;
  const comune = (gs(d.f, 't') || '').split('(')[0].trim();
  const parole = nome.split(/[^A-Za-zÀ-ú0-9]+/).filter(w => w.length > 2).map(semplifica);
  let scelto = null;

  let telTrovato = null;
  for (const q of [`${nome} ${comune} sito ufficiale`, `${nome} pizzeria ${comune}`]) {
    const res = await cerca(q);
    if (!telTrovato && res.tel) telTrovato = res.tel;
    for (const ind of res.indirizzi) {
      let host = '';
      try { host = new URL(ind).hostname.toLowerCase(); } catch { continue; }
      if (!host.includes('.') || VIETATI.test(host)) continue;
      if (host.startsWith('xn--')) continue;                    // versione punycode: preferisco quella leggibile
      const hs = semplifica(host);
      const somiglia = parole.some(w => w.length > 3 && hs.includes(w)) ||
                       (parole.length > 1 && hs.includes(parole.join('')));
      if (somiglia) { scelto = 'https://' + host; break; }
    }
    if (scelto) break;
  }

  if (scelto) {
    try {
      const agg = { website: { stringValue: scelto }, updatedAt: { integerValue: String(Date.now()) } };
      if (telTrovato && !gs(d.f, 'phone')) { agg.phone = { stringValue: telTrovato }; telefoni++; }
      await patchDoc(d.id, agg);
      console.log(`✓ ${nome} (${comune}) → ${scelto}${telTrovato ? ' · ' + telTrovato : ''}`);
      trovati++;
    } catch (e) { console.log(`✗ ${nome}: ${String(e.message).slice(0, 60)}`); }
  } else {
    if (telTrovato && !gs(d.f, 'phone')) {
      try {
        await patchDoc(d.id, { phone: { stringValue: telTrovato }, updatedAt: { integerValue: String(Date.now()) } });
        telefoni++;
        console.log(`· ${nome} (${comune}) — niente sito, ma telefono ${telTrovato}`);
      } catch {}
    } else console.log(`· ${nome} (${comune}) — nessun sito riconoscibile`);
    nulla++;
  }
  await new Promise(r => setTimeout(r, 700));
}
await browser.close();
console.log(`\nRisultato: ${trovati} siti ufficiali · ${telefoni} telefoni · ${nulla} senza sito.`);
