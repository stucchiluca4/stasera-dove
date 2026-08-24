/* Applica in modo ripetibile le verifiche manuali del 24/08/2026.
   Il dato senza glutine è volutamente binario: sì oppure no.

   Anteprima (nessuna scrittura): node scripts/applica-verifica-ristoranti.mjs
   Applica:                       node scripts/applica-verifica-ristoranti.mjs --apply
*/
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const API_KEY = html.match(/apiKey:'([^']+)'/)?.[1];
if (!API_KEY) throw new Error('Chiave Firestore non trovata in index.html');

const BASE = 'https://firestore.googleapis.com/v1/projects/stasera-dove/databases/(default)/documents';
const APPLICA = process.env.APPLICA === '1' || process.argv.includes('--apply');
const NATURAL_TYPES = new Set(['Ristorante', 'Carne', 'Pesce', 'Griglieria', 'Galletto']);

const GF_YES = new Set([
  's2','s5','s9','s12','s13','s17','s26','s27','s29','s35','s36','s38','s39',
  's43','s45','s47','s51','s52','u1787053923311'
]);

const PHOTOS = {
  s1:'https://ciucciue.it/wp-content/uploads/2021/11/Progetto-senza-titolo-1-768x1024.png',
  s10:'https://static.goto-where.com/6085-albums-1.jpg',
  s12:'https://img3.restaurantguru.com/w550/h367/ra08-MURUMURU-CAFE-design-2025-09.jpg',
  s14:'https://www.italiaatavola.net/images/contenutiarticoli/BASSI_CASA_ROMANO_sala.jpg',
  s19:'https://img02.restaurantguru.com/c210-Restaurant-La-Pizza-a-Modo-Mio-Dario-De-Santis-interior.jpg',
  s32:'https://cdn.thefork.com/tf-lab/image/upload/restaurant/a9f694a5-6bbf-4fe1-a479-c169249f43b7/1e8c747b-dc9b-493c-a61d-9cbadb23277b.jpg',
  s39:'https://www.italiaatavola.net/images/contenutiarticoli/bottega_8.jpg',
  s43:'https://barbagrill.it/wp-content/uploads/2024/05/pranzo-di-lavoro-al-barbagrill.webp',
  s44:'https://cdn.archilovers.com/projects/ea989c49-9815-4691-8f05-3a24c8a58999.jpg',
  s47:'https://invalcavallina.it/wp-content/uploads/2025/01/Alibi-2-Trescore.jpg',
  u1787053923311:'https://www.ristoranteciaoamore.it/img/Hero-home-1920-rit2.webp'
};

const gs = (f, k) => f?.[k]?.stringValue ?? null;
const gi = (f, k) => f?.[k]?.integerValue == null ? null : Number(f[k].integerValue);
const gb = (f, k) => !!f?.[k]?.booleanValue;
const ga = (f, k) => (f?.[k]?.arrayValue?.values ?? []).map(v => v.stringValue).filter(Boolean);

async function listLocali() {
  const res = await fetch(`${BASE}/locali?pageSize=300&key=${API_KEY}`);
  if (!res.ok) throw new Error(`Lettura locali: HTTP ${res.status}`);
  return (await res.json()).documents ?? [];
}

async function patchDoc(id, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fields})
  });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} ${await res.text()}`);
}

let senzaGlutineSi = 0, foto = 0, invariati = 0;
for (const doc of await listLocali()) {
  const id = doc.name.split('/').pop();
  const f = doc.fields ?? {};
  if (gb(f, 'deleted')) continue;
  const patch = {};
  const livelloAttuale = gi(f, 'gf') ?? 0;
  const tipi = ga(f, 'ty');
  const etnico = tipi.includes('Cinese') || tipi.includes('Giapponese');
  const haPiattiSg = !etnico && tipi.some(t => NATURAL_TYPES.has(t));
  const rispostaSi = livelloAttuale > 0 || GF_YES.has(id) || haPiattiSg;
  if (rispostaSi && livelloAttuale !== 1) {
    patch.gf = {integerValue:'1'};
    senzaGlutineSi++;
  }
  if (PHOTOS[id] && !gs(f, 'photo') && !gs(f, 'photoUrl')) {
    patch.photoUrl = {stringValue:PHOTOS[id]};
    foto++;
  }
  if (!Object.keys(patch).length) { invariati++; continue; }
  patch.updatedAt = {integerValue:String(Date.now())};
  const nome = gs(f, 'n') ?? id;
  console.log(`${APPLICA ? 'APPLICO' : 'ANTEPRIMA'} · ${nome} · ${Object.keys(patch).filter(k => k !== 'updatedAt').join(', ')}`);
  if (APPLICA) await patchDoc(id, patch);
}

console.log(`\n${APPLICA ? 'Applicati' : 'Da applicare'}: ${senzaGlutineSi} valori senza glutine = sì · ${foto} foto · ${invariati} invariati.`);
