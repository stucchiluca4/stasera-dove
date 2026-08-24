/* Applica in modo ripetibile le verifiche manuali del 24/08/2026 e classifica
   separatamente i locali con soli piatti naturalmente senza glutine.

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
const NATURAL_NOTE = 'Il menu può includere carne, pesce, riso o contorni naturalmente senza glutine. Chiedere sempre conferma su ingredienti e contaminazioni.';

const GF = {
  s2:[2,'Il menu 2025 riportava pizze no glutine; una recensione di marzo 2026 segnala che erano state sospese. Chiamare prima.'],
  s5:[2,'Menu online: pizze, hamburger, dolci e birre senza glutine. Confermare la gestione delle contaminazioni.'],
  s9:[1,'Il menu ufficiale riporta pizza, pane burger e fritti senza glutine.'],
  s12:[2,'Menu modificabile senza glutine; segnalato uso condiviso delle attrezzature, quindi non adatto alla celiachia senza conferma.'],
  s13:[2,'Opzioni senza glutine segnalate da TheFork; comunicare la celiachia in prenotazione.'],
  s17:[2,'Il menu allergeni ufficiale include piatti senza glutine e birra GF, ma non esclude contaminazioni crociate.'],
  s26:[2,'Opzioni senza glutine segnalate su Tripadvisor; avvisare il locale in prenotazione.'],
  s27:[2,'Una fonte menu segnala una selezione senza glutine; da confermare al locale.'],
  s29:[2,'Opzioni senza glutine segnalate su Apple Maps; da confermare al locale.'],
  s35:[2,'Opzioni senza glutine segnalate da Booking e Tripadvisor; avvisare il ristorante.'],
  s36:[2,'Piatti tipici adattabili senza glutine segnalati da una recensione dedicata; confermare le contaminazioni.'],
  s38:[2,'Opzioni senza glutine segnalate da fonti menu; da confermare al locale.'],
  s39:[2,'Il menu delivery identifica diversi ravioli senza glutine; chiedere conferma sulla contaminazione.'],
  s43:[1,'Il menu ufficiale indica il senza glutine disponibile solo su prenotazione.'],
  s45:[2,'Pizza senza glutine con impasto fresco segnalata da Gluto e Tripadvisor; confermare al locale.'],
  s47:[2,'Il portale turistico della Val Cavallina segnala opzioni senza glutine.'],
  s51:[2,'Pizza senza glutine segnalata da più recensioni su Gluto; confermare al locale.'],
  s52:[2,'Impasto senza glutine e mozzarella senza lattosio segnalati da recensioni recenti; confermare al locale.'],
  u1787053923311:[1,'Il sito ufficiale dichiara senza glutine, senza lattosio, nickel free e proposte vegane.']
};

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

let verificati = 0, naturali = 0, foto = 0, invariati = 0;
for (const doc of await listLocali()) {
  const id = doc.name.split('/').pop();
  const f = doc.fields ?? {};
  if (gb(f, 'deleted')) continue;
  const patch = {};
  if (GF[id]) {
    const [livello, nota] = GF[id];
    if (gi(f, 'gf') !== livello || gs(f, 'gfNote') !== nota) {
      patch.gf = {integerValue:String(livello)};
      patch.gfNote = {stringValue:nota};
      verificati++;
    }
  } else if ((gi(f, 'gf') ?? 0) === 0) {
    const tipi = ga(f, 'ty');
    const etnico = tipi.includes('Cinese') || tipi.includes('Giapponese');
    if (!etnico && tipi.some(t => NATURAL_TYPES.has(t))) {
      patch.gf = {integerValue:'3'};
      patch.gfNote = {stringValue:NATURAL_NOTE};
      naturali++;
    }
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

console.log(`\n${APPLICA ? 'Applicati' : 'Da applicare'}: ${verificati} verifiche SG · ${naturali} alternative naturali · ${foto} foto · ${invariati} invariati.`);
