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
const BAD_IMAGE = /logo|icon|favicon|sprite|placeholder|badge|avatar|banner-cookie|whatsapp|tripadvisor|gambero[_-]?rosso/i;

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

function abs(u, base) { try { return new URL(u, base).href; } catch { return null; } }
function httpsify(u) { return u && u.startsWith('http://') ? 'https://' + u.slice(7) : u; }

/* Candidati in ordine di affidabilità:
   1) og:image / twitter:image   2) JSON-LD schema.org "image"
   3) link rel=image_src         4) scansione <img> grandi (anti-logo) */
function collectCandidates(html, baseUrl) {
  const strong = [], scan = [];
  const metas = html.match(/<meta\s[^>]*>/gi) ?? [];
  const wanted = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];
  const found = {};
  for (const tag of metas) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!key || !wanted.includes(key) || found[key]) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) found[key] = content.trim();
  }
  for (const k of wanted) if (found[k]) strong.push(abs(found[k], baseUrl));

  for (const m of html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    const body = m.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
          if (k === 'image') {
            const vals = Array.isArray(v) ? v : [v];
            for (const x of vals) {
              const u = typeof x === 'string' ? x : x?.url;
              if (u) strong.push(abs(u, baseUrl));
            }
          } else walk(v);
        }
      };
      walk(JSON.parse(body));
    } catch { /* JSON-LD malformato: ignora */ }
  }

  const linkSrc = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1];
  if (linkSrc) strong.push(abs(linkSrc, baseUrl));

  for (const tag of (html.match(/<img\s[^>]*>/gi) ?? []).slice(0, 60)) {
    const src = tag.match(/(?:data-lazy-src|data-src|src)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const u = abs(src, baseUrl);
    if (!u || !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
    if (BAD_IMAGE.test(u)) continue;
    scan.push(u);
    if (scan.length >= 8) break;
  }
  const seen = new Set();
  const uniq = a => a.filter(Boolean).map(httpsify).filter(u => u.startsWith('https:') && !seen.has(u) && seen.add(u));
  return { strong: uniq(strong), scan: uniq(scan) };
}

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow' }); }
  finally { clearTimeout(t); }
}

async function imageInfo(url) {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/') || ct.includes('svg')) { res.body?.cancel?.(); return null; }
    const clh = parseInt(res.headers.get('content-length') || '0', 10);
    if (clh > 8_000_000) { res.body?.cancel?.(); return null; }
    let size = clh;
    if (!size) { size = (await res.arrayBuffer()).byteLength; }
    else res.body?.cancel?.();
    return { size };
  } catch { return null; }
}
async function pickImage(cands) {
  for (const u of cands.strong) {
    if (!BAD_IMAGE.test(u) && await imageInfo(u)) return u; // anche le anteprime possono essere loghi/avatar
  }
  for (const u of cands.scan) {
    const info = await imageInfo(u);
    if (info && info.size >= 25000) return u;              // dalla pagina: solo immagini "vere" (no loghini)
  }
  return null;
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
    const html = (await res.text()).slice(0, 500000);
    const cands = collectCandidates(html, res.url || sito);
    const img = await pickImage(cands);
    if (!img) { console.log(`— ${nome}: nessuna immagine utilizzabile (${cands.strong.length + cands.scan.length} candidate)`); senzaOg++; continue; }
    await setPhotoUrl(d.id, img);
    console.log(`✓ ${nome}: ${img.slice(0, 90)}`);
    trovate++;
  } catch (e) {
    console.log(`✗ ${nome}: ${String(e.message || e).slice(0, 80)}`);
    errori++;
  }
}
console.log(`\nRisultato: ${trovate} foto trovate · ${senzaOg} siti senza anteprima · ${errori} errori · ${saltati} saltati (senza sito o già con foto).`);
