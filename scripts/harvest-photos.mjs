/* Raccoglitore foto di "Stasera Dove?".
   Gira su GitHub Actions (internet libero): per ogni locale con sito
   ufficiale ma senza foto, apre la homepage, estrae l'immagine di
   anteprima (og:image / twitter:image), la valida e salva l'URL in
   Firestore (photoUrl). Le foto caricate dagli utenti hanno precedenza
   e non vengono mai toccate. */

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

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

function extractOgImage(html, baseUrl) {
  const metas = html.match(/<meta\s[^>]*>/gi) ?? [];
  const wanted = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];
  const found = {};
  for (const tag of metas) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!key || !wanted.includes(key) || found[key]) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) found[key] = content.trim();
  }
  for (const k of wanted) {
    if (found[k]) {
      try { return new URL(found[k], baseUrl).href; } catch { /* prova il prossimo */ }
    }
  }
  return null;
}

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow' }); }
  finally { clearTimeout(t); }
}

async function validImage(url) {
  if (!/^https:/i.test(url)) return false;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA }, method: 'GET' });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    res.body?.cancel?.();
    return ct.startsWith('image/');
  } catch { return false; }
}

async function setPhotoUrl(id, url) {
  const u = `${BASE}/locali/${encodeURIComponent(id)}?updateMask.fieldPaths=photoUrl&updateMask.fieldPaths=updatedAt&key=${API_KEY}`;
  const res = await fetch(u, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      photoUrl: { stringValue: url },
      updatedAt: { integerValue: String(Date.now()) }
    } })
  });
  if (!res.ok) throw new Error(`write ${id}: HTTP ${res.status}`);
}

const locali = await listLocali();
let trovate = 0, saltati = 0, senzaOg = 0, errori = 0;
for (const d of locali) {
  const nome = gs(d.f, 'n') ?? d.id;
  const sito = gs(d.f, 'website');
  if (gb(d.f, 'deleted') || !sito || gs(d.f, 'photo') || gs(d.f, 'photoUrl')) { saltati++; continue; }
  try {
    const res = await fetchWithTimeout(sito, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    if (!res.ok) { console.log(`✗ ${nome}: homepage HTTP ${res.status}`); errori++; continue; }
    const html = (await res.text()).slice(0, 400000);
    const img = extractOgImage(html, res.url || sito);
    if (!img) { console.log(`— ${nome}: nessuna og:image`); senzaOg++; continue; }
    if (!(await validImage(img))) { console.log(`✗ ${nome}: og:image non valida (${img.slice(0, 80)})`); errori++; continue; }
    await setPhotoUrl(d.id, img);
    console.log(`✓ ${nome}: ${img.slice(0, 90)}`);
    trovate++;
  } catch (e) {
    console.log(`✗ ${nome}: ${String(e.message || e).slice(0, 80)}`);
    errori++;
  }
}
console.log(`\nRisultato: ${trovate} foto trovate · ${senzaOg} siti senza anteprima · ${errori} errori · ${saltati} saltati (senza sito o già con foto).`);
