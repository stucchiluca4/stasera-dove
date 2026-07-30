/* Robot notifiche push di "Stasera Dove?".
   Gira su GitHub Actions ogni ~10 minuti: legge da Firestore le novità
   (locali aggiunti, recensioni) successive all'ultimo controllo e invia
   una Web Push a ogni dispositivo iscritto, saltando l'autore stesso.
   Richiede il secret VAPID_PRIVATE_KEY (la chiave pubblica è nell'app). */
const PROJECT = 'stasera-dove';
const API_KEY = 'AIzaSyB-m2ee3o0HVsy2aLanPPZUgBlJNQO8qUw';
const VAPID_PUBLIC = 'BMdBwSfv_nCRC2ESLVmExIhjKXmMWfsyU60dmtKe02lczG2mzvY1OYR8HkGsi6KSm57sVeI0AIlKHVY1YrBg68Y';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (!PRIVATE) {
  console.log('Secret VAPID_PRIVATE_KEY assente: nessun invio (configuralo nelle impostazioni del repository).');
  process.exit(0);
}
const webpush = (await import('web-push')).default;
webpush.setVapidDetails('mailto:noreply@stasera-dove.local', VAPID_PUBLIC, PRIVATE);

const gs = (f, k) => (f?.[k] && 'stringValue' in f[k]) ? f[k].stringValue : null;
const gi = (f, k) => parseInt(f?.[k]?.integerValue ?? '0', 10) || 0;
const gb = (f, k) => !!f?.[k]?.booleanValue;

async function listCol(col) {
  let out = [], token = null;
  do {
    const u = `${BASE}/${col}?pageSize=300&key=${API_KEY}` + (token ? `&pageToken=${encodeURIComponent(token)}` : '');
    const res = await fetch(u);
    if (!res.ok) throw new Error(`${col}: HTTP ${res.status}`);
    const d = await res.json();
    for (const doc of d.documents ?? []) out.push({ id: doc.name.split('/').pop(), f: doc.fields ?? {} });
    token = d.nextPageToken ?? null;
  } while (token);
  return out;
}
async function getMeta() {
  const res = await fetch(`${BASE}/meta/push?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`meta: HTTP ${res.status}`);
  return gi((await res.json()).fields, 'lastTs');
}
async function setMeta(ts) {
  const res = await fetch(`${BASE}/meta/push?key=${API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { lastTs: { integerValue: String(ts) } } })
  });
  if (!res.ok) throw new Error(`meta write: HTTP ${res.status}`);
}

const scanStart = Date.now();
let lastTs;
try {
  lastTs = await getMeta();
} catch (err) {
  if (String(err.message).includes('403')) {
    console.log('Le regole Firestore non includono ancora meta/push_subs: nessun invio per ora.');
    process.exit(0);
  }
  throw err;
}
if (lastTs === null) {
  await setMeta(scanStart);
  console.log('Prima esecuzione: inizializzo il segnalibro senza inviare nulla.');
  process.exit(0);
}

const locali = await listCol('locali');
const nomi = Object.fromEntries(locali.map(d => [d.id, gs(d.f, 'n') ?? 'un locale']));
const eventi = [];
for (const d of locali) {
  const by = gs(d.f, 'addedBy'), ts = gi(d.f, 'createdAt');
  if (by && ts > lastTs && !gb(d.f, 'deleted'))
    eventi.push({ ts, by, text: `📍 ${by} ha aggiunto ${gs(d.f, 'n')}` });
}
for (const d of await listCol('recensioni')) {
  const by = gs(d.f, 'by'), ts = gi(d.f, 'updatedAt'), rating = gi(d.f, 'rating');
  if (by && ts > lastTs && rating > 0 && !gb(d.f, 'deleted'))
    eventi.push({ ts, by, text: `⭐ ${by} ha recensito ${nomi[gs(d.f, 'rid')] ?? 'un locale'} ${'★'.repeat(rating)}` });
}

if (!eventi.length) {
  await setMeta(scanStart);
  console.log('Nessuna novità dall\'ultimo controllo.');
  process.exit(0);
}
console.log(`${eventi.length} novità da notificare.`);

const subs = await listCol('push_subs');
let inviate = 0, rimosse = 0;
for (const s of subs) {
  const owner = gs(s.f, 'owner') ?? '';
  const miei = eventi.filter(e => e.by !== owner);   // non notificare l'autore a se stesso
  if (!miei.length) continue;
  const body = miei.length === 1 ? miei[0].text : `${miei.length} novità nel gruppo — apri per vederle`;
  try {
    await webpush.sendNotification(
      { endpoint: gs(s.f, 'endpoint'), keys: { p256dh: gs(s.f, 'p256dh'), auth: gs(s.f, 'auth') } },
      JSON.stringify({ title: 'Stasera Dove?', body })
    );
    inviate++;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await fetch(`${BASE}/push_subs/${s.id}?key=${API_KEY}`, { method: 'DELETE' }).catch(() => {});
      rimosse++;
    } else {
      console.log(`invio fallito (${err.statusCode ?? err.message})`);
    }
  }
}
await setMeta(scanStart);
console.log(`Inviate ${inviate} notifiche · ${rimosse} iscrizioni scadute rimosse · ${subs.length} dispositivi iscritti.`);
