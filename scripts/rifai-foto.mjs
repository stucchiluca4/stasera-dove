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
/* PICCOLE=1: invece dei portali, rifà le foto del sito del locale che sono
   troppo piccole (spesso un logo o una miniatura). Sostituisce solo se trova
   di meglio e non cancella mai niente. */
const PICCOLE = process.env.PICCOLE === '1';
/* SCHERMATE=1: rifà le schermate di homepage salvate come foto, che con il
   vecchio metodo mostravano menu e scritte del sito */
const SCHERMATE = process.env.SCHERMATE === '1';
/* larghezza e altezza di un JPEG in data URL, lette dall'intestazione */
function dimJpeg(dataUrl) {
  try {
    const b = Buffer.from(dataUrl.split(',')[1], 'base64');
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xC0 && m <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  } catch {}
  return null;
}
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
const PORTALI = /tripadvisor|restaurantguru|thefork|quandoo|deliveroo|just-?eat|glovo|ubereats|sluurpy|piatti\.menu|menuweb|menu\.sluurpy|yelp|foursquare|facebook|fbcdn|instagram|cdninstagram|googleusercontent|gstatic|lucianopignataro|scattidigusto|italiaatavola|gamberorosso|dissapore|puntarellarossa|reportergourmet|identitagolose|cibotoday|agrodolce|garage\.pizza|thegreat\.pizza|50toppizza|pizzaontheroad|wanderlog|wanderboat|atly\.com|findmeglutenfree|forbes\.|lofficiel|where-e\.com|finedininglovers|archilovers|invalcavallina|tourismmedia|michelin|pkvdominoqq|nuovaopinione|restaurantpro|apetime|bestogoo|mindtrip|happycow|celiaquita|glutoapp/i;
/* piattaforme che ospitano il sito del locale: contano come "suo" */
const PIATTAFORME = /playstyle\.tv|wixstatic|squarespace|shopify|website-files|cdn-website|website\.dish\.co|qromo\.io|globaluserfiles|amazonaws|java-injection|vercel\.app|netlify|github\.io|altervista|imgix|cloudfront|b-cdn\.net|r2\.dev|sirv\.com|firebasestorage|storage\.googleapis|cloudinary/i;

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
/* elementi di grafica: sfondi, texture, trame, pagine in costruzione, badge
   dei premi e logo esportati. Niente di tutto questo è una foto del locale */
const GRAFICA = /(^|[^a-z])bgs?[-_.]|background|texture|pattern|overlay|gradient|noise|watermark|divider|separator|under-construction|\/plugins\/|50-?top|gambero|award|premio|classifica|marchio|risorsa[-_]?\d|asset[-_]?\d/i;
/* un candidato buono deve stare sul sito del locale (o sulla piattaforma che
   lo ospita) ed essere una fotografia: niente portali, niente PNG di grafica */
function candidatoAmmesso(u, sito, permettiPng) {
  if (!u) return false;
  let h = '', percorso = '';
  try { const x = new URL(u); h = x.hostname.toLowerCase(); percorso = decodeURIComponent(x.pathname + x.search); }
  catch { return false; }
  if (PORTALI.test(h)) return false;
  const hs = host(sito || '');
  const suo = (hs && radice(h.replace(/^www\./, '')) === radice(hs)) || PIATTAFORME.test(h);
  if (!suo) return false;                                   // foto di un altro sito: non è sua
  const fotografia = /\.(jpe?g|webp|avif)(\?|$|&)/i.test(percorso);
  const senzaEstensione = !/\.[a-z0-9]{2,5}(\?|$|&)/i.test(percorso);
  if (!fotografia && !senzaEstensione && !permettiPng) return false;   // PNG e GIF: solo se grandi (vedi sotto)
  return !BRUTTE.test(decodeURIComponent(u)) && !GRAFICA.test(decodeURIComponent(u));
}

/* cerca una foto sul sito del locale: og:image -> immagine piu grande ->
   sfondo piu grande -> schermata della sua homepage */
async function cercaFoto(ctx, sito) {
  const page = await ctx.newPage();
  try {
    let su = false;
    for (let t = 0; t < 3 && !su; t++) {
      try { await page.goto(sito, { waitUntil: 'domcontentloaded', timeout: 30000 + t * 20000 }); su = true; }
      catch (e) { if (t === 2) throw e; await page.waitForTimeout(1500); }
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
    if (c) {
      const pesante = await immagineBuona(c, 700, 80000);
      if (!candidatoAmmesso(c, sito, !!pesante)) c = null;
      else if (!pesante && !(await immagineBuona(c, 700, 25000))) c = null;
    }
    if (c) return { url: c, come: 'og:image' };

    const grandi = await page.evaluate(() => {
      const bad = /logo|icon|favicon|sprite|placeholder|whatsapp|tripadvisor|badge|payoff|avatar/i;
      return [...document.images]
        .map(i => ({ src: i.currentSrc || i.src, a: i.naturalWidth * i.naturalHeight, w: i.naturalWidth }))
        .filter(x => x.src && x.src.startsWith('https') && x.w >= 700 && !bad.test(x.src))
        .sort((a, b) => b.a - a.a).slice(0, 6);
    });
    for (const g of grandi) {
      if (!candidatoAmmesso(g.src, sito, g.w >= 1000)) continue;
      if (!(await immagineBuona(g.src, 700, g.w >= 1000 ? 40000 : 25000))) continue;
      return { url: g.src, come: 'foto del sito' };
    }
    c = null;

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
    if (c && !candidatoAmmesso(c, sito)) c = null;
    if (c && !(await immagineBuona(c, 700, 25000))) c = null;
    if (c) return { url: c, come: 'sfondo del sito' };

    /* ultima possibilità: la schermata della loro homepage */
    /* togliamo di mezzo banner e sovrapposizioni, così la schermata è pulita */
    await page.evaluate(() => {
      const sospetti = '[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=iubenda i],[id*=onetrust i],[class*=cmplz i],[id*=gdpr i],[class*=gdpr i],[class*=modal i],[class*=popup i],[class*=overlay i]';
      for (const el of document.querySelectorAll(sospetti)) { try { el.remove(); } catch {} }
      for (const el of document.querySelectorAll('body *')) {
        const st = getComputedStyle(el), r = el.getBoundingClientRect();
        if ((st.position === 'fixed' || st.position === 'sticky') && r.width * r.height > 0.3 * innerWidth * innerHeight) {
          try { el.remove(); } catch {}
        }
      }
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
    });
    await page.waitForTimeout(600);
    const spazzatura = await page.evaluate(() =>
      /attendi che la tua richiesta|checking the site connection|sito web scaduto|suspected phishing|access denied|are you a robot|domain (is )?for sale/i.test(document.body?.innerText || ''));
    if (spazzatura) return null;
    /* la schermata deve sembrare una foto, non una pagina web: si nascondono
       menu, barre, scritte, pulsanti e loghi, e restano le immagini */
    const resta = await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const st = getComputedStyle(el), r = el.getBoundingClientRect();
        if ((st.position === 'fixed' || st.position === 'sticky') && r.top < 160 && r.height < 220) { try { el.remove(); } catch {} }
      }
      const css = document.createElement('style');
      css.textContent = 'nav,[role=navigation],h1,h2,h3,h4,h5,h6,p,a,button,li,label,span,small,strong,em,b,i,blockquote,' +
        'input,select,textarea,form,svg,iframe,[class*=logo i],[id*=logo i]{visibility:hidden!important}' +
        'img,picture,video,canvas{visibility:visible!important}' +
        'img[src*=logo i],img[alt*=logo i],img[class*=logo i]{visibility:hidden!important}';
      document.head.appendChild(css);
      /* c'è davvero un'immagine grande in alto? altrimenti la schermata
         sarebbe un rettangolo vuoto: meglio niente */
      const area = (r) => Math.max(0, Math.min(r.right, 1200) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, 675) - Math.max(r.top, 0));
      let meglio = 0;
      for (const el of document.querySelectorAll('img,picture,video,canvas,body *')) {
        const r = el.getBoundingClientRect(); const a = area(r); if (a < 1) continue;
        const st = getComputedStyle(el);
        const media = /^(IMG|PICTURE|VIDEO|CANVAS)$/.test(el.tagName) || /url\(/.test(st.backgroundImage);
        if (media && st.visibility !== 'hidden' && a > meglio) meglio = a;
      }
      return meglio / (1200 * 675);
    });
    await page.waitForTimeout(500);
    if (resta < 0.35) return null;
    const buf = await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 1200, height: 675 } });
    if (buf.length < 25000) return null;
    const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
    if (dataUrl.length > 900000) return null;
    return { dataUrl, come: 'schermata del sito' };
  } catch (e) {
    return { errore: String(e.message || e).slice(0, 70) };
  } finally { await page.close(); }
}

/* apre un'immagine nel browser e ne legge larghezza, altezza e peso */
async function misura(ctx, url) {
  const p = await ctx.newPage();
  try {
    const resp = await p.goto(url, { waitUntil: 'load', timeout: 25000 });
    const ct = resp ? (resp.headers()['content-type'] || '') : '';
    if (!resp || resp.status() >= 400 || !/image/i.test(ct)) return null;
    let peso = 0; try { peso = (await resp.body()).length; } catch {}
    const d = await p.evaluate(() => { const i = document.images[0]; return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; });
    return d ? { ...d, peso } : null;
  } catch { return null; } finally { await p.close(); }
}
const piccola = m => !m || m.w < 700 || m.peso < 25000;
/* un logo o un'icona: minuscolo, leggerissimo o quadratino */
const quasiLogo = m => !m || m.w < 400 || m.peso < 15000 || (m.w <= 320 && Math.abs(m.w - m.h) < 40);

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

if (SCHERMATE) {
  const vecchie = tutti.filter(d => {
    const ph = gs(d.f, 'photo');
    if (!ph || !gs(d.f, 'website') || !/^data:image\/jpeg/.test(ph)) return false;
    const dm = dimJpeg(ph);
    return dm && dm.w === 1200 && dm.h === 675;     // solo le schermate fatte da noi: le foto vostre hanno altre misure
  }).filter(d => !SOLO || gs(d.f, 'n') === SOLO);
  console.log(`Schermate di homepage da rifare: ${vecchie.length}\n`);
  let rifatte = 0, tenute = 0;
  for (const d of vecchie) {
    const nome = gs(d.f, 'n') || d.id;
    const r = await cercaFoto(ctx, gs(d.f, 'website'));
    if (r?.url || r?.dataUrl) {
      const campi = { updatedAt: { integerValue: String(Date.now()) } };
      if (r.url) { campi.photoUrl = { stringValue: r.url }; campi.photo = { nullValue: null }; }
      else { campi.photo = { stringValue: r.dataUrl }; }
      try { await patchDoc(d.id, campi); rifatte++; console.log(`✓ ${nome} → ${r.come}`); }
      catch (e) { tenute++; console.log(`✗ ${nome}: ${e.message}`); }
    } else { tenute++; console.log(`— ${nome}: ${r?.errore ? 'il sito non ha risposto' : 'in alto non c’è un’immagine grande'}, tenuta la vecchia`); }
    await new Promise(r2 => setTimeout(r2, 250));
  }
  await browser.close();
  console.log(`\nRisultato: ${rifatte} schermate rifatte · ${tenute} tenute com'erano.`);
  process.exit(0);
}

if (PICCOLE) {
  const candidati = tutti.filter(d => !gs(d.f, 'photo') && gs(d.f, 'photoUrl') && gs(d.f, 'website') &&
    provenienza(gs(d.f, 'photoUrl'), gs(d.f, 'website')) !== 'portale' &&
    (!SOLO || gs(d.f, 'n') === SOLO));
  console.log(`Foto dal sito del locale da misurare: ${candidati.length}\n`);
  let migliorate = 0, tenute = 0, ok = 0;
  for (const d of candidati) {
    const nome = gs(d.f, 'n') || d.id, sito = gs(d.f, 'website'), ora = gs(d.f, 'photoUrl');
    const m = await misura(ctx, ora);
    if (!piccola(m)) { ok++; continue; }
    const descr = m ? `${m.w}×${m.h}, ${Math.round(m.peso / 1024)} KB` : 'non si carica';
    const r = await cercaFoto(ctx, sito);
    let meglio = false, come = '';
    if (r?.url && r.url !== ora) {
      const n = await misura(ctx, r.url);
      /* più larga di almeno un terzo e comunque da 700 px in su */
      /* più larga di almeno un terzo, da 700 px in su, e non un volantino:
         un'immagine alta più di 1,6 volte la larghezza è quasi sempre un menu o una locandina */
      if (n && n.w >= 700 && n.w >= (m ? m.w : 0) * 1.3 && n.peso >= 25000 && n.h <= n.w * 1.6) { meglio = true; come = `${r.come} ${n.w}×${n.h}`; }
      else if (n && n.h > n.w * 1.6) come = 'scartata: sembra un volantino';
    } else if (r?.dataUrl && quasiLogo(m)) {
      meglio = true; come = 'schermata del sito';           // meglio la loro homepage che un logo
    }
    if (meglio) {
      const campi = { updatedAt: { integerValue: String(Date.now()) } };
      if (r.url) { campi.photoUrl = { stringValue: r.url }; }
      else { campi.photo = { stringValue: r.dataUrl }; campi.photoUrl = { nullValue: null }; }
      try { await patchDoc(d.id, campi); migliorate++; console.log(`✓ ${nome} — era ${descr} → ${come}`); }
      catch (e) { console.log(`✗ ${nome}: ${e.message}`); tenute++; }
    } else {
      tenute++;
      console.log(`— ${nome} — ${descr}: ${r?.errore ? 'il sito non ha risposto' : 'sul sito niente di più grande'}, tenuta`);
    }
    await new Promise(r2 => setTimeout(r2, 250));
  }
  await browser.close();
  console.log(`\nRisultato: ${migliorate} foto piccole sostituite con una più grande · ${tenute} tenute com'erano · ${ok} già buone.`);
  process.exit(0);
}

let sostituite = 0, nuove = 0, tolte = 0, invariate = 0, daRiprovare = 0;
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
  if (PORTALI.test(host(sito))) {
    console.log(`— ${nome} — il "sito" salvato è la pagina di un portale (${host(sito)}), non un sito ufficiale`);
    invariate++; continue;
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
  } else if (r?.errore) {
    /* il sito non ha risposto: può essere un problema di rete di passaggio.
       Non si cancella niente, si riprova a un giro successivo. */
    console.log(`? ${nome} — ${motivo}, il sito non ha risposto (${r.errore}): lasciato com'è, da riprovare`);
    daRiprovare++;
  } else {
    if (togliSempre) {
      await patchDoc(d.id, { photoUrl: { nullValue: null }, updatedAt: { integerValue: String(Date.now()) } });
      console.log(`✂ ${nome} — ${motivo}, sul sito non c'è una foto usabile: foto rimossa, resta la copertina`); tolte++;
    } else { console.log(`— ${nome} — ${motivo}, sul sito non c'è una foto usabile`); invariate++; }
  }
  await new Promise(r2 => setTimeout(r2, 250));
}
await browser.close();
console.log(`\nRisultato: ${sostituite} foto di portali sostituite con una del sito · ${nuove} foto nuove a chi non ne aveva · ${tolte} rimosse perché sul sito non c'è niente · ${daRiprovare} da riprovare (sito muto) · ${invariate} invariate.`);
