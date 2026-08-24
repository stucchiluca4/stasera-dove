/* Senza glutine + siti ufficiali mancanti.
   Per ogni locale dell'archivio:
   1) se manca il sito web, lo cerca (scartando aggregatori e social) e lo salva;
   2) legge il sito ufficiale (home + eventuale pagina del menu) e cerca le
      parole del senza glutine; se il sito non dice nulla, guarda i risultati
      di ricerca (dove finiscono anche le recensioni che lo menzionano).
   Esito salvato su ogni locale: gf = 1 (sì), 0 (no).
   Nessuno scraping di TripAdvisor/Google: solo siti ufficiali e risultati di
   ricerca pubblici. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DA = parseInt(process.env.DA || '0', 10);
const QUANTI = parseInt(process.env.QUANTI || '400', 10);
const SOLO_SENZA = process.env.SOLO_SENZA === '1';
const VERBOSE = process.env.VERBOSE === '1';   // solo quelli non ancora controllati

const gs = (f, k) => (f?.[k] && 'stringValue' in f[k]) ? f[k].stringValue : null;
const gi = (f, k) => (f?.[k] && 'integerValue' in f[k]) ? parseInt(f[k].integerValue, 10) : null;
const gb = (f, k) => !!f?.[k]?.booleanValue;
const ga = (f, k) => (f?.[k]?.arrayValue?.values ?? []).map(v => v.stringValue).filter(Boolean);

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

/* indirizzi da non salvare mai come "sito ufficiale" del locale */
const AGGREGATORI = /bing\.|duckduckgo|mojeek|brave\.com|ecosia|startpage|yandex|baidu|search\?|tripadvisor|thefork|quandoo|deliveroo|justeat|just-eat|glovo|ubereats|facebook|instagram|twitter|tiktok|youtube|linkedin|google\.|yelp|foursquare|wikipedia|50toppizza|gamberorosso|italiangourmet|misterdelivery|dishcovery|restaurantguru|menuonline|paginegialle|virgilio|misterdelivery|booking\.com|expedia|scattidigusto|puntarellarossa|dissapore|reddit|pinterest|amazon|prenotazione|thefork/i;
const GLUTINE = /senza glutine|senzaglutine|no[\s-]?glutine|gluten[\s-]?free|glutenfree|celiac|celiach|per celiaci|aic\b|impasto senza glutine|pizza senza glutine/i;
const TIPI_NATURALMENTE_SG = new Set(['Ristorante', 'Carne', 'Pesce', 'Griglieria', 'Galletto']);

let motoriMorti = 0;   // dai runner i motori spesso rispondono con un blocco
async function cercaWeb(page, q) {
  if (motoriMorti >= 4) return [];
  /* più motori in fila: dai datacenter alcuni rispondono con una schermata di
     controllo, quindi si prova finché uno non restituisce risultati veri */
  const motori = [
    { url: 'https://www.mojeek.com/search?q=', parse: () => {
        const out = [];
        document.querySelectorAll('ul.results-standard li, .results li').forEach(function(li){
          const a = li.querySelector('a.title, h2 a');
          const p = li.querySelector('p.s, .s');
          if (a) out.push({ url: a.href || '', titolo: a.innerText || '', testo: p ? p.innerText : '' });
        });
        return out;
      } },
    { url: 'https://lite.duckduckgo.com/lite/?q=', parse: () => {
        const out = [];
        document.querySelectorAll('a.result-link').forEach(function(a){
          const tr = a.closest('tr');
          const sn = tr && tr.parentElement ? tr.parentElement.querySelector('.result-snippet') : null;
          out.push({ url: a.href || '', titolo: a.innerText || '', testo: sn ? sn.innerText : '' });
        });
        return out;
      } },
    { url: 'https://html.duckduckgo.com/html/?q=', parse: () => {
        const out = [];
        document.querySelectorAll('.result').forEach(function(r){
          const a = r.querySelector('a.result__a');
          const sn = r.querySelector('.result__snippet');
          if (a) out.push({ url: a.href || '', titolo: a.innerText || '', testo: sn ? sn.innerText : '' });
        });
        return out;
      } },
    { url: 'https://www.bing.com/search?setlang=it&q=', parse: () => {
        const out = [];
        document.querySelectorAll('li.b_algo').forEach(function(li){
          const a = li.querySelector('h2 a');
          const p = li.querySelector('.b_caption p, .b_algoSlug');
          if (a) out.push({ url: a.href || '', titolo: a.innerText || '', testo: p ? p.innerText : '' });
        });
        return out;
      } },
    { url: 'https://search.brave.com/search?q=', parse: () => {
        const out = [];
        document.querySelectorAll('#results .snippet').forEach(function(r){
          const a = r.querySelector('a[href^="http"]');
          if (a) out.push({ url: a.href || '', titolo: a.innerText || '', testo: r.innerText || '' });
        });
        return out;
      } }
  ];
  for (const m of motori) {
    try {
      await page.goto(m.url + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 9000 });
      await page.waitForTimeout(600);
      let res = await page.evaluate(m.parse);
      res = (res || []).map(function(r){
        let u = r.url || '';
        const mm = u.match(/uddg=([^&]+)/);              // DuckDuckGo incapsula il link
        if (mm) { try { u = decodeURIComponent(mm[1]); } catch (e) {} }
        return { url: u, titolo: r.titolo || '', testo: r.testo || '' };
      }).filter(function(r){ return /^https?:\/\//i.test(r.url); });
      if (res.length) { motoriMorti = 0; return res.slice(0, 8); }
    } catch { /* motore non disponibile: passo al prossimo */ }
  }
  motoriMorti++;
  return [];
}
async function testoPagina(page, url, seguiMenu) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 14000 });
    await page.waitForTimeout(900);
    for (const sel of ['#onetrust-accept-btn-handler', '.iubenda-cs-accept-btn', '.cmplz-accept',
                       'button:has-text("Accetta")', 'button:has-text("Accept")']) {
      try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 250 })) { await el.click({ timeout: 900 }); break; } } catch {}
    }
    let t = await page.evaluate(() => document.body ? document.body.innerText : '');
    if (!seguiMenu || GLUTINE.test(t)) return t;
    // la pizza senza glutine di solito sta nel menu: seguo un link plausibile
    const link = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(function (x) {
        return /menu|men[uù]|carta|pizze|le nostre pizze|impasti/i.test((x.innerText || '') + ' ' + (x.getAttribute('href') || ''));
      });
      return a ? a.href : null;
    });
    if (link && /^https?:/i.test(link)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(800);
        t += '\n' + await page.evaluate(() => document.body ? document.body.innerText : '');
      } catch {}
    }
    return t;
  } catch { return ''; }
}
function frase(testo) {
  const m = testo.split(/[\n.;•|]/).find(r => GLUTINE.test(r) && r.trim().length > 8 && r.trim().length < 160);
  return m ? m.trim().replace(/\s+/g, ' ') : null;
}

/* OpenStreetMap (dati aperti): spesso ha sito, telefono e perfino il campo
   diet:gluten_free compilato dalla comunità. */
async function osmCerca(nome, comune) {
  const esc = t => t.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
  const paroleNome = nome.replace(/["\\]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(esc).join('.*');
  const citta = comune.split('(')[0].trim().replace(/["\\]/g, ' ');
  const q = `[out:json][timeout:18];
    area["name"="${citta}"]["boundary"="administrative"]->.a;
    nwr["name"~"${paroleNome}",i](area.a);
    out tags 6;`;
  for (let tent = 0; tent < 2; tent++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'StaseraDove/1.0 (app di gruppo per scegliere dove cenare)'
        },
        body: 'data=' + encodeURIComponent(q)
      });
      if (res.status === 429 || res.status === 504) { await new Promise(r => setTimeout(r, 3000)); continue; }
      if (!res.ok) { if (VERBOSE) console.log(`    osm HTTP ${res.status} · ${nome}`); return null; }
      const d = await res.json();
      const els = d.elements || [];
      if (VERBOSE) console.log(`    osm ${nome} (${citta}): ${els.length} risultati`);
      const el = els.find(e => e.tags && (e.tags.amenity === 'restaurant' || e.tags.amenity === 'fast_food' || e.tags.amenity === 'cafe' || e.tags.cuisine)) || els[0];
      return el ? el.tags : null;
    } catch (e) {
      if (VERBOSE) console.log(`    osm errore · ${nome}: ${String(e.message || e).slice(0, 60)}`);
      await new Promise(r => setTimeout(r, 2500));
    }
  }
  return null;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 }, locale: 'it-IT',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
});
const page = await ctx.newPage();

const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted'));
const lista = tutti.filter(d => !SOLO_SENZA || gi(d.f, 'gf') === null).slice(DA, DA + QUANTI);
console.log(`Locali da controllare: ${lista.length} (di ${tutti.length} totali)\n`);

let sitiTrovati = 0, gfSi = 0, gfNo = 0, telefoni = 0;
for (const d of lista) {
  const nome = gs(d.f, 'n') || d.id;
  const comune = gs(d.f, 't') || '';
  let sito = gs(d.f, 'website');
  const agg = {};

  if (!sito) {
    const res = await cercaWeb(page, `"${nome}" ${comune} ristorante pizzeria sito ufficiale`);
    const parole = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const buono = res.find(function(r){
      if (!r.url || !/^https?:\/\//i.test(r.url) || AGGREGATORI.test(r.url)) return false;
      let host = ''; try { host = new URL(r.url).hostname.toLowerCase().replace(/[^a-z0-9]/g, ''); } catch { return false; }
      return parole.some(w => host.indexOf(w.replace(/[^a-z0-9]/g, '')) > -1);   // il dominio richiama il nome
    });
    if (buono) {
      try { sito = new URL(buono.url).origin; } catch { sito = buono.url; }
      agg.website = { stringValue: sito };
      sitiTrovati++;
      console.log(`  sito trovato · ${nome}: ${sito}`);
    }
  }

  let gf = 0;
  const osm = await osmCerca(nome, comune);
  if (osm) {
    if (!sito && (osm.website || osm['contact:website'])) {
      sito = osm.website || osm['contact:website'];
      agg.website = { stringValue: sito }; sitiTrovati++;
      console.log(`  sito da OpenStreetMap · ${nome}: ${sito}`);
    }
    if (!gs(d.f, 'phone') && (osm.phone || osm['contact:phone'])) {
      agg.phone = { stringValue: osm.phone || osm['contact:phone'] };
      telefoni++;
    }
    const dg = osm['diet:gluten_free'];
    if (dg === 'yes' || dg === 'only' || dg === 'limited') gf = 1;
  }
  if (!gf && sito) {
    const t = await testoPagina(page, sito, true);
    if (GLUTINE.test(t)) gf = 1;
  }
  if (!gf) {
    const res = await cercaWeb(page, `"${nome}" ${comune} senza glutine`);
    const cita = res.filter(r => GLUTINE.test(r.titolo + ' ' + r.testo));
    if (cita.length) gf = 1;
  }
  if (!gf) {
    const tipi = ga(d.f, 'ty');
    const etnico = tipi.includes('Cinese') || tipi.includes('Giapponese');
    if (!etnico && tipi.some(t => TIPI_NATURALMENTE_SG.has(t))) gf = 1;
  }
  agg.gf = { integerValue: String(gf) };
  agg.updatedAt = { integerValue: String(Date.now()) };
  try { await patchDoc(d.id, agg); } catch (e) { console.log(`  ✗ ${nome}: ${String(e.message).slice(0, 60)}`); }

  await new Promise(r => setTimeout(r, 400));
  if (gf === 1) { gfSi++; console.log(`✓ ${nome} (${comune}) — sì`); }
  else { gfNo++; console.log(`· ${nome} (${comune}) — no`); }
}
await browser.close();
console.log(`\nRisultato: ${gfSi} sì · ${gfNo} no · ${sitiTrovati} siti recuperati · ${telefoni} telefoni recuperati.`);
