/* Completa esclusivamente i numeri di telefono mancanti, verificati il 24/08/2026.
   Le fonti prioritarie sono i siti ufficiali dei locali; dove non disponibili sono
   state usate schede Maps/Waze e portali turistici o gastronomici attendibili.

   Anteprima: node scripts/applica-telefoni-verificati.mjs
   Applica:    node scripts/applica-telefoni-verificati.mjs --apply
*/
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const API_KEY = html.match(/apiKey:'([^']+)'/)?.[1];
if (!API_KEY) throw new Error('Chiave Firestore non trovata in index.html');

const BASE = 'https://firestore.googleapis.com/v1/projects/stasera-dove/databases/(default)/documents';
const APPLICA = process.argv.includes('--apply');

const TELEFONI = {
  'gm-fradis-lab': '+39 351 313 7998',
  'gm-iki-beach': '+39 380 522 9859',
  'gm-kobuta': '+39 070 657556',
  'gm-la-paillote': '+39 340 394 8856',
  'gm-le-palmette': '+39 338 104 1979',
  'gm-libarium': '+39 346 522 0212',
  'gm-lo-scoglio': '+39 070 371927',
  'gm-lo-zenit': '+39 070 250009',
  'gm-pani-e-casu': '+39 070 098 5103',
  'gm-rist-calamosca': '+39 070 796 8844',
  'gm-sa-domu-sarda': '+39 070 753 7197',
  'gm-terrazze-calamosca': '+39 070 796 8844',
  s1: '+39 039 6774327',
  s2: '+39 039 2183500',
  s3: '+39 030 737098',
  s4: '+39 039 9008026',
  s8: '+39 02 26227300',
  s9: '+39 031 2494976',
  s10: '+39 031 224 2969',
  s11: '+39 035 3056999',
  s12: '+39 393 389 1058',
  s13: '+39 035 0900208',
  s14: '+39 035 515135',
  s15: '+39 035 0823409',
  s16: '+39 035 752931',
  s17: '+39 338 650 1723',
  s18: '+39 02 8286 0326',
  s20: '+39 375 709 9089',
  s21: '+39 333 109 7460',
  s22: '+39 035 247911',
  s23: '+39 345 749 0019',
  s24: '+39 035 673827',
  s25: '+39 035 891341',
  s26: '+39 0363 1849877',
  s27: '+39 035 0294472',
  s28: '+39 035 792277',
  s29: '+39 035 243405',
  s30: '+39 349 413 1424',
  s31: '+39 030 999 5813',
  s32: '+39 035 986004',
  s33: '+39 035 0400032',
  s35: '+39 035 808692',
  s36: '+39 035 261402',
  s37: '+39 0363 703956',
  s39: '+39 035 297334',
  s41: '+39 035 004 0453',
  s42: '+39 035 512792',
  s43: '+39 342 095 1307',
  s44: '+39 338 135 5700',
  s45: '+39 030 2593557',
  s47: '+39 035 941883',
  s48: '+39 345 585 6732',
  s50: '+39 035 951445',
  s51: '+39 035 256383',
  s53: '+39 333 650 7272',
  s54: '+39 035 4364023',
  s55: '+39 035 510841',
  s56: '+39 351 373 6345',
  s57: '+39 02 6379 3837',
  s58: '+39 035 319476',
  'tp-180g-roma': '+39 347 999 8983',
  'tp-50-kalo-napoli': '+39 081 1920 4667',
  'tp-acqua-e-farina-trento': '+39 0461 416851',
  'tp-apogeo-pietrasanta': '+39 0584 793394',
  'tp-biga-milano': '+39 02 5280 1936',
  'tp-clementina-fiumicino': '+39 328 818 1651',
  'tp-confine-milano': '+39 375 542 6086',
  'tp-crunch-roma': '+39 06 8760 9540',
  'tp-diego-vitagliano-pizzeria-napoli': '+39 081 1858 1919',
  'tp-dry-milano-milano': '+39 02 6379 3414',
  'tp-enosteria-lipen-triuggio': '+39 0362 919710',
  'tp-gigi-pipa-este': '+39 331 416 1253',
  'tp-grigoris-mestre': '+39 041 3124765',
  'tp-i-borboni-pontecagnano-faiano': '+39 340 499 4871',
  'tp-i-masanielli-di-francesco-martucci-caserta': '+39 0823 1540786',
  'tp-i-masanielli-di-sasa-martucci-caserta': '+39 0823 220092',
  'tp-i-tigli-san-bonifacio': '+39 045 6102606',
  'tp-inedito-brescia': '+39 030 7999555',
  'tp-la-cascina-dei-sapori-rezzato': '+39 030 2593557',
  'tp-la-fenice-pistoia': '+39 0573 21167',
  'tp-la-gatta-mangiona-roma': '+39 06 5346702',
  'tp-la-notizia-napoli': '+39 081 7142155',
  'tp-la-piedigrotta-varese': '+39 0332 287983',
  'tp-masardona-roma': '+39 06 86981973',
  'tp-officine-del-cibo-sarzana': '+39 393 958 4694',
  'tp-palazzo-petrucci-napoli': '+39 081 5512460',
  'tp-piccola-piedigrotta-reggio-emilia': '+39 0522 434922',
  'tp-pizza-canneto-beach-2-margherita-di-savoia': '+39 0883 414523',
  'tp-pizzaut-cassina-de-pecchi': '+39 02 5030 9156',
  'tp-premiata-fabbrica-pizza-bassano-del-grappa': '+39 0424 280457',
  'tp-sa-scolla-nurri': '+39 070 8942262',
  'tp-sestogusto-torino': '+39 011 1889 4434',
  'tp-seu-pizza-illuminati-roma': '+39 06 5883384',
  u1783942283852: '+39 02 76022653',
  u1785570030711: '+39 02 3453 4113'
};

const gs = (fields, key) => fields?.[key]?.stringValue ?? '';

async function getDoc(id) {
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?key=${API_KEY}`);
  if (!res.ok) throw new Error(`${id}: lettura HTTP ${res.status}`);
  return (await res.json()).fields ?? {};
}

async function patchPhone(id, phone) {
  const now = Date.now();
  const mask = 'updateMask.fieldPaths=phone&updateMask.fieldPaths=updatedAt';
  const fields = {
    phone:{stringValue:phone},
    updatedAt:{integerValue:String(now)}
  };
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fields})
  });
  if (!res.ok) throw new Error(`${id}: scrittura HTTP ${res.status} ${await res.text()}`);
}

let completati = 0;
let invariati = 0;
for (const [id, phone] of Object.entries(TELEFONI)) {
  const fields = await getDoc(id);
  const nome = gs(fields, 'n') || id;
  const current = gs(fields, 'phone').trim();
  if (current) {
    console.log(`— ${nome}: già presente (${current})`);
    invariati++;
    continue;
  }
  console.log(`${APPLICA ? '✓' : 'ANTEPRIMA'} ${nome}: phone=${phone}`);
  if (APPLICA) await patchPhone(id, phone);
  completati++;
}

console.log(`\n${APPLICA ? 'Completati' : 'Da completare'}: ${completati} locali · ${invariati} già invariati.`);
