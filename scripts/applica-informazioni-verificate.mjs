/* Integra solo informazioni verificate manualmente il 24/08/2026.
   Non trasforma il dato "senza glutine" in una valutazione sanitaria:
   nell'app resta una semplice informazione sì/no.

   Anteprima: node scripts/applica-informazioni-verificate.mjs
   Applica:    node scripts/applica-informazioni-verificate.mjs --apply
*/
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const API_KEY = html.match(/apiKey:'([^']+)'/)?.[1];
if (!API_KEY) throw new Error('Chiave Firestore non trovata in index.html');

const BASE = 'https://firestore.googleapis.com/v1/projects/stasera-dove/databases/(default)/documents';
const APPLICA = process.argv.includes('--apply');

const DATI = {
  'gm-sa-matracca': { phone:'+39 331 801 5706' },
  's38': { phone:'+39 035 877158' },
  's49': { phone:'+39 352 066 8212' },
  's7': { phone:'+39 342 145 8440' },
  'tp-antica-pizzeria-ciro-1923-gaeta': {
    website:'https://www.anticapizzeriaciro.com/', phone:'+39 0771 465058', gf:1
  },
  'tp-bas-milano': {
    website:'https://www.baspizzeria.it/', phone:'+39 0865 460448', t:'Pesche (IS)', z:'Isernia', gf:1,
    force:['t','z']
  },
  'tp-cuore-luca-brancati-marano-vicentino': {
    website:'https://www.pizzeriacuorenapoletano.com/', phone:'+39 0445 621202', gf:1
  },
  'tp-i-saulle-quarto': {
    phone:'+39 0165 765488', t:'Quart (AO)', z:'Aosta', gf:1,
    booking:'https://www.thefork.it/ristorante/i-saulle-pizzeria-e-cucina-napoletana-r439727', force:['t','z']
  },
  'tp-il-segreto-di-pulcinella-montesarchio': { phone:'+39 329 876 0545' },
  'tp-il-vecchio-e-il-mare-firenze': { phone:'+39 055 669575', gf:1 },
  'tp-luca-frosinone': { phone:'+39 331 961 0793' },
  'tp-maiori-cagliari': { phone:'+39 070 804 6520' },
  'tp-maturazioni-san-giuseppe-vesuviano': { website:'https://maturazioni.it/', gf:1 },
  'tp-frumento-acireale': { website:'https://frumentoacireale.it/', phone:'+39 095 601496' },
  'tp-pizzeria-della-passeggiata-priverno': { phone:'+39 0773 902865' },
  'tp-pizzeria-gorizia-1916-napoli': { phone:'+39 081 578 2248' },
  'tp-raf-bonetta-pozzuoli': { phone:'+39 376 212 3370' },
  'tp-sitari-agrigento': { phone:'+39 389 660 9525', gf:1 },
  'tp-tac-roma': { booking:'https://www.thefork.it/ristorante/tac-thin-and-crunchy-r828219' }
};

const gs = (f, k) => f?.[k]?.stringValue ?? '';
const gi = (f, k) => Number(f?.[k]?.integerValue ?? 0);

async function getDoc(id) {
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?key=${API_KEY}`);
  if (!res.ok) throw new Error(`${id}: lettura HTTP ${res.status}`);
  return (await res.json()).fields ?? {};
}

async function patchDoc(id, changes) {
  const masks = Object.keys(changes).concat('updatedAt')
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const fields = {updatedAt:{integerValue:String(Date.now())}};
  for (const [key, value] of Object.entries(changes)) {
    fields[key] = typeof value === 'number'
      ? {integerValue:String(value)}
      : {stringValue:value};
  }
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${masks}&key=${API_KEY}`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fields})
  });
  if (!res.ok) throw new Error(`${id}: scrittura HTTP ${res.status} ${await res.text()}`);
}

let locali = 0, campi = 0, invariati = 0;
for (const [id, proposta] of Object.entries(DATI)) {
  const f = await getDoc(id);
  const force = new Set(proposta.force ?? []);
  const changes = {};
  for (const [key, value] of Object.entries(proposta)) {
    if (key === 'force') continue;
    const current = typeof value === 'number' ? gi(f, key) : gs(f, key);
    if (current === value) continue;
    if (!force.has(key) && current !== '' && current !== 0) continue;
    changes[key] = value;
  }
  const nome = gs(f, 'n') || id;
  if (!Object.keys(changes).length) {
    console.log(`— ${nome}: già completo`);
    invariati++;
    continue;
  }
  console.log(`${APPLICA ? '✓' : 'ANTEPRIMA'} ${nome}: ${Object.entries(changes).map(([k,v]) => `${k}=${v}`).join(' · ')}`);
  if (APPLICA) await patchDoc(id, changes);
  locali++;
  campi += Object.keys(changes).length;
}

console.log(`\n${APPLICA ? 'Applicati' : 'Da applicare'}: ${campi} campi in ${locali} locali · ${invariati} locali invariati.`);
