/* Via le foto prese dai portali e dalle testate, dentro quelle dei siti
   ufficiali dei locali.
   Tre gruppi di lavoro:
   1) foto linkate da TripAdvisor, RestaurantGuru, TheFork, blog e riviste:
      vanno sostituite sempre. Se sul sito del locale non si trova niente,
      il link si cancella comunque (non è roba nostra da mostrare).
   2) foto del locale ma troppo piccole o che non si caricano: si riprova,
      e si sostituisce solo se si trova qualcosa di meglio.
   3) locali senza nessuna foto: si cerca sul sito.
   Le foto caricate da voi (photo) non si toccano mai.
   SCRIVI=0 fa solo la prova, senza salvare niente. */
import { chromium } from 'playwright';

const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SCRIVI = process.env.SCRIVI !== '0';
const SOLO = (process.env.SOLO || '').trim();      // un nome per provare su un solo locale
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const UA_TEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const APP = 'https://stucchiluca4.github.io';

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
  if (!SCRIVI) return;
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('write HTTP ' + r.status);
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const radice = h => h.split('.').slice(-2).join('.');

/* portali, testate, social e domini da buttare: la foto non è loro da dare */
const PORTALI = /tripadvisor|restaurantguru|thefork|quandoo|deliveroo|just-?eat|glovo|ubereats|sluurpy|piatti\.menu|menuweb|menu\.sluurpy|yelp|foursquare|facebook|fbcdn|instagram|cdninstagram|googleusercontent|gstatic|lucianopignataro|scattidigusto|italiaatavola|gamberorosso|dissapore|puntarellarossa|reportergourmet|identitagolose|cibotoday|agrodolce|garage\.pizza|thegreat\.pizza|50toppizza|pizzaontheroad|wanderlog|wanderboat|atly\.com|findmeglutenfree|forbes\.|lofficiel|where-e\.com|finedininglovers|archilovers|playstyle\.tv|invalcavallina|tourismmedia|michelin|pkvdominoqq|nuovaopinione|restaurantpro|apetime|bestogoo|mindtrip|happycow|celiaquita|glutoapp/i;
/* piattaforme che ospitano il sito del locale: contano come "suo" */
const PIATTAFORME = /wixstatic|squarespace|shopify|website-files|cdn-website|website\.dish\.co|qromo\.io|globaluserfiles|amazonaws|java-injection|vercel\.app|netlify|github\.io|altervista|imgix|cloudfront|b-cdn\.net|r2\.dev|sirv\.com|firebasestorage|storage\.googleapis|cloudinary/i;

function provenienza(photoUrl, website) {
  const h = host(photoUrl), hs = host(website || '');
  if (PORTALI.test(h)) return 'portale';
  if (hs && radice(h) === radice(hs)) return 'locale';
  if (PIATTAFORME.test(h)) return 'piattaforma del locale';
  return 'altro';
}

async function immagineBuona(u, minLarghezza, minPeso) {
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': UA_TEL, Accept: 'image/*,*/*;q=0.8', Referer: APP + '/stasera-dove/', Origin: APP } });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/') || ct.includes('svg')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < (minPeso || 25000) || buf.length > 8_000_000) return null;
    return { peso: buf.length };
  } catch { return null; }
}

const CONSENSO = [
  '#onetrust-accept-btn-handler', '.iubenda-cs-accept-btn', '.cmplz-accept',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  'button:has-text("Accetta tutti")', 'button:has-text("Accetta tutto")',
  'button:has-text("Accetta")', 'button:has-text("ACCETTA")',
  'button:has-text("Accept all")', 'button:has-text("Accept")',
  'a:has-text("Accetta")', 'button:has-text("Ho capito")', 'button:has-text("OK")'
];
const BRUTTE = /logo|icon|favicon|sprite|placeholder|badge|payoff|whatsapp|tripadvisor|avatar|banner-?cookie/i;

/* cerca una foto sul sito del locale: og:image -> immagine piu grande ->
   sfondo piu grande -> schermata della sua homepage */
async function cercaFoto(ctx, sito) {
  const page = await ctx.newPage();
  try {
    let su = false;
    for (let t = 0; t < 2 && !su; t++) {
      try { await page.goto(sito, { waitUntil: 'domcontentloaded', timeout: 40000 }); su = true; }
      catch (e) { if (t === 1) throw e; }
    }
    await page.waitForTimeout(3200);
    for (const sel of CONSENSO) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 300 })) { await el.click({ timeout: 1000 }); await page.waitForTimeout(600); break; }
      } catch { /* assente */ }
    }
    await page.mouse.wheel(0, 500); await page.waitForTimeout(1200);
    await page.mouse.wheel(0, -500); await page.waitForTimeout(700);

    let c = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
      return m?.content || null;
    });
    if (c) { try { c = new URL(c, page.url()).href.replace(/^http:/, 'https:'); } catch { c = null; } }
    if (c && BRUTTE.test(c)) c = null;
    if (c && !(await immagineBuona(c, 700, 25000))) c = null;
    if (c) return { url: c, come: 'og:image' };

    c = await page.evaluate(() => {
      const bad = /logo|icon|favicon|sprite|placeholder|whatsapp|tripadvisor|badge|payoff|avatar/i;
      return [...document.images]
        .map(i => ({ src: i.currentSrc || i.src, a: i.naturalWidth * i.naturalHeight, w: i.naturalWidth, h: i.naturalHeight }))
        .filter(x => x.src && x.src.startsWith('https') && x.w >= 700 && x.h >= 400 && !bad.test(x.src))
        .sort((a, b) => b.a - a.a)[0]?.src || null;
    });
    if (c && !(await immagineBuona(c, 700, 25000))) c = null;
    if (c) return { url: c, come: 'foto del sito' };

    c = await page.evaluate(() => {
      let best = null, area = 0; const bad = /logo|icon|sprite/i;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width < 700 || r.height < 350) continue;
        const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(https:[^"')]+)["']?\)/);
        if (m && !bad.test(m[1]) && r.width * r.height > area) { area = r.width * r.height; best = m[1]; }
      }
      return best;
    });
    if (c && !(await immagineBuona(c, 700, 25000))) c = null;
    if (c) return { url: c, come: 'sfondo del sito' };

    /* ultima possibilità: la schermata della loro homepage */
    const coperta = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=iubenda i],[id*=onetrust i]')) {
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        if (s.display !== 'none' && s.visibility !== 'hidden' && r.width * r.height > 0.25 * innerWidth * innerHeight) return true;
      }
      return false;
    });
    const spazzatura = await page.evaluate(() =>
      /attendi che la tua richiesta|checking the site connection|sito web scaduto|suspected phishing|access denied|are you a robot|domain (is )?for sale/i.test(document.body?.innerText || ''));
    if (coperta || spazzatura) return null;
    const buf = await page.screenshot({ type: 'jpeg', quality: 68, clip: { x: 0, y: 0, width: 1200, height: 675 } });
    if (buf.length < 25000) return null;
    const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
    if (dataUrl.length > 900000) return null;
    return { dataUrl, come: 'schermata del sito' };
  } catch (e) {
    return { errore: String(e.message || e).slice(0, 70) };
  } finally { await page.close(); }
}

/* ---------- lavoro ---------- */
const tutti = (await listLocali()).filter(d => !gb(d.f, 'deleted'));
const lavoro = [];
for (const d of tutti) {
  if (gs(d.f, 'photo')) continue;                  // foto vostra: non si tocca
  if (SOLO && (gs(d.f, 'n') || '') !== SOLO) continue;
  const purl = gs(d.f, 'photoUrl');
  const sito = gs(d.f, 'website');
  if (!purl) { lavoro.push({ d, motivo: 'senza foto', togliSempre: false }); continue; }
  const prov = provenienza(purl, sito);
  if (prov === 'portale') lavoro.push({ d, motivo: 'foto da portale', togliSempre: true, prov });
}
console.log(`Locali attivi: ${tutti.length} · da sistemare: ${lavoro.length}`);
console.log(`  (${lavoro.filter(x => x.togliSempre).length} con foto da portali o testate, ${lavoro.filter(x => !x.togliSempre).length} senza foto)`);
console.log(SCRIVI ? 'Modalità: salvo su Firestore\n' : 'Modalità: solo prova, non salvo\n');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, userAgent: UA, locale: 'it-IT' });

let sostituite = 0, nuove = 0, tolte = 0, invariate = 0;
for (const { d, motivo, togliSempre } of lavoro) {
  const nome = gs(d.f, 'n') || d.id;
  const sito = gs(d.f, 'website');
  if (!sito) {
    if (togliSempre) {
      await patchDoc(d.id, { photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`✂ ${nome} — ${motivo}, nessun sito ufficiale: foto rimossa`); tolte++;
    } else { console.log(`— ${nome} — ${motivo}, nessun sito ufficiale`); invariate++; }
    continue;
  }
  const r = await cercaFoto(ctx, sito);
  if (r && (r.url || r.dataUrl)) {
    const campi = { updatedAt: { integerValue: String(Date.now()) } };
    if (r.url) { campi.photoUrl = { stringValue: r.url }; campi.photo = { nullValue: null }; }
    else { campi.photo = { stringValue: r.dataUrl }; campi.photoUrl = { nullValue: null }; }
    try {
      await patchDoc(d.id, campi);
      console.log(`✓ ${nome} — ${motivo} → ${r.come}${r.url ? ': ' + r.url.slice(0, 80) : ''}`);
      if (togliSempre) sostituite++; else nuove++;
    } catch (e) { console.log(`✗ ${nome}: ${e.message}`); invariate++; }
  } else {
    const perche = r?.errore ? 'sito non raggiungibile (' + r.errore + ')' : 'niente di buono sul sito';
    if (togliSempre) {
      await patchDoc(d.id, { photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`✂ ${nome} — ${motivo}, ${perche}: foto rimossa, resta la copertina`); tolte++;
    } else { console.log(`— ${nome} — ${motivo}, ${perche}`); invariate++; }
  }
  await new Promise(r2 => setTimeout(r2, 250));
}
await browser.close();
console.log(`\nRisultato: ${sostituite} foto di portali sostituite con una del sito · ${nuove} foto nuove a chi non ne aveva · ${tolte} rimosse senza sostituto · ${invariate} invariate.`);
