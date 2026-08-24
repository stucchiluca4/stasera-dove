/* Inserisce solo fotografie verificate manualmente il 24/08/2026.
   Le foto caricate dagli utenti non vengono mai toccate.

   Anteprima: node scripts/applica-foto-verificate.mjs
   Applica:    node scripts/applica-foto-verificate.mjs --apply
*/
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const API_KEY = html.match(/apiKey:'([^']+)'/)?.[1];
if (!API_KEY) throw new Error('Chiave Firestore non trovata in index.html');

const BASE = 'https://firestore.googleapis.com/v1/projects/stasera-dove/databases/(default)/documents';
const APPLICA = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

const FOTO = {
  'tp-180g-roma': {
    replace:true,
    url:'https://www.lucianopignataro.it/wp-content/uploads/2022/05/180g-Pizzeria-Romana-la-cucina-a-vista-450x600.jpg'
  },
  'tp-avenida-calo-roma': {
    replace:true,
    url:'https://reportergourmet.com/upload/multimedia/avenida-calo-18.jpg'
  },
  'tp-don-antonio-1970-salerno': {
    replace:true,
    url:'https://www.scattidigusto.it/wp-content/uploads/2025/04/pizzeria-Don-Antonio-1970-a-Salerno-pizza-scarola-1152x2048.jpg'
  },
  'tp-framento-cagliari': {
    replace:true,
    url:'https://reportergourmet.com/upload/multimedia/1-1-6_2023-05-04_07-36-37.jpg'
  },
  'gm-lo-zenit': {
    url:'https://cdn.thefork.com/tf-lab/image/upload/w_500%2Ch_500%2Cc_fill%2Cq_auto%2Cf_auto%2Cg_auto%3Asubject/restaurant/9ff54753-d2da-4837-a14d-030b202945be/4b538838-19f6-40ba-88de-05614a907b88.jpg'
  },
  'gm-pani-e-casu': {
    url:'https://img02.restaurantguru.com/c08d-Restaurant-Ristorante-Pani-e-Casu-Cagliari-design-1.jpg'
  },
  's46': {
    url:'https://img3.restaurantguru.com/c663-P13-Lounge-Cafe-Chiuduno-interior.jpg'
  },
  'tp-cambia-menti-caserta': {
    url:'https://www.lucianopignataro.it/wp-content/uploads/2022/06/Cambia-Menti-Sala-e1655462547624.jpg'
  },
  'tp-carlo-sammarco-aversa': {
    url:'https://www.finedininglovers.it/sites/default/files/styles/1_1_920x920/public/places/carlo-sammarco-pizzeria-20---aversa-chijr528krqgoxmrvugelpulgqu-0.png.webp?itok=2oZqKn9y'
  },
  'tp-extremis-roma': {
    url:'https://www.agrodolce.it/app/uploads/2022/05/giulio-di-gregorio-extremis-roma-pizzeria.jpg'
  },
  'tp-frumento-acireale': {
    url:'https://cdn.thefork.com/tf-lab/image/upload/w_500%2Ch_500%2Cc_fill%2Cq_auto%2Cf_jpg/restaurant/15c4c35f-dae5-478f-b92e-b076227e349b/b6c0a427-d24b-46c9-ad4d-df9133d27d2b.webp'
  },
  'tp-gli-allocchi-marradi': {
    url:'https://static.gamberorosso.it/2023/06/gli-allocchi-di-jonathan-trombini-1024x683.jpg'
  },
  'tp-kilo-imperia': {
    url:'https://s3.eu-west-3.amazonaws.com/customer-it.ilgolosario.www/3117/4437/8393/kilo-apertura.jpg'
  },
  'tp-la-bolla-caserta': {
    url:'https://img02.restaurantguru.com/cf20-Restaurant-La-Bolla-pizza.jpg'
  },
  'tp-la-sorgente-guardiagrele': {
    url:'https://tourismmedia.italia.it/is/image/mitur/20240208163824_la-sorgente-pizzeria_4_1479039485?fit=constrain%2C1&fmt=webp&hei=500&wid=850'
  },
  'tp-lammaccata-casal-velino': {
    url:'https://www.lucianopignataro.it/wp-content/uploads/2024/08/1-LAmmaccata-a-Casal-Velino-Cristian-Santomauro-con-la-squadra-tutta-al-femminile-e1730549402864.jpg'
  },
  'tp-le-grotticelle-caggiano': {
    url:'https://img.restaurantguru.com/rb66-design-Le-Grotticelle-2024-12.jpg'
  },
  'tp-luigi-cippitelli-san-giuseppe-vesuviano': {
    url:'https://img3.restaurantguru.com/w550/h367/rf1d-interior-Pizzeria-Luigi-Cippitelli-2025-10.jpg'
  },
  'tp-madia-salerno': {
    url:'https://www.scattidigusto.it/wp-content/uploads/2024/11/pizzeria-Madia-a-Salerno-sala.jpg'
  },
  'tp-maiori-cagliari': {
    url:'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1c/a1/f3/c6/verso-il-tavolo-maiori.jpg?h=1100&s=1&w=1100'
  },
  'tp-maturazioni-san-giuseppe-vesuviano': {
    url:'https://www.lucianopignataro.it/wp-content/uploads/2022/08/Sala-Interna-Pizzeria-Maturazioni-1-scaled-e1661320113957.jpg'
  },
  'tp-meunier-corciano': {
    url:'https://forbes.it/wp-content/uploads/2024/12/meunier_sala.jpg'
  },
  'tp-o-fiore-mio-faenza': {
    url:'https://static.where-e.com/Italy/O-Fiore-Mio_d4466bcb2f1f932093d4f35edd450d2f.jpg'
  },
  'tp-pizza-canneto-beach-2-margherita-di-savoia': {
    url:'https://img3.restaurantguru.com/w550/h367/ra8c-Canneto-Beach-2-Pizza-interior-2025-08-1.jpg'
  },
  'tp-pizzeria-della-passeggiata-priverno': {
    url:'https://www.scattidigusto.it/wp-content/uploads/2024/02/Pizzeria-della-Passeggiata-a-Priverno-bancone-pizza-in-teglia-1280x956.jpg'
  },
  'tp-pizzeria-gorizia-1916-napoli': {
    url:'https://www.lofficielitalia.com/_next/image?q=75&url=https%3A%2F%2Fwww.datocms-assets.com%2F38011%2F1745396809-unnamed-19.jpg%3Fauto%3Dformat%252Ccompress%26cs%3Dsrgb&w=3840'
  },
  'tp-raf-bonetta-pozzuoli': {
    url:'https://www.scattidigusto.it/wp-content/uploads/2025/05/pizzeria-Raf-Bonetta-a-Pozzuoli-specchi-1280x853.jpg'
  },
  'gm-sa-matracca': {
    url:'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/19/36/51/19/photo4jpg.jpg?h=1100&s=1&w=1100'
  },
  's49': {
    url:'https://img02.restaurantguru.com/ca16-BITE-Boltiere-interior.jpg'
  },
  's7': {
    url:'https://img02.restaurantguru.com/ce92-Restaurant-Pizza-neoclassica-garlic-bread.jpg'
  },
  'tp-antica-pizzeria-ciro-1923-gaeta': {
    url:'https://www.anticapizzeriaciro.com/wp-content/uploads/2026/06/495134933_1285723320220604_5107453232197889464_n.jpg'
  },
  'tp-bas-milano': {
    url:'https://www.lucianopignataro.it/wp-content/uploads/2022/08/Bas-Co-la-sala-e1661442765104.jpg'
  },
  'tp-i-saulle-quarto': {
    url:'https://cdn.thefork.com/tf-lab/image/upload/w_500%2Ch_500%2Cc_fill%2Cq_auto%2Cf_jpg/restaurant/f05583f5-a7e1-4423-b119-02284f94b491/232000f9-3f37-4d79-90d7-78baad9a1e22.jpg'
  },
  'tp-il-segreto-di-pulcinella-montesarchio': {
    url:'https://www.italiaatavola.net/images/contenutiarticoli/2_segreto_pulinella.jpeg'
  },
  'tp-il-vecchio-e-il-mare-firenze': {
    url:'https://www.scattidigusto.it/wp-content/uploads/2026/02/pizzeria-ristorante-Il-Vecchio-e-il-Mare-a-Firenze-sala-karaoke-1280x853.jpg'
  },
  'tp-tac-roma': {
    url:'https://cdn.thefork.com/tf-lab/image/upload/w_500%2Ch_500%2Cc_fill%2Cq_auto%2Cf_jpg/restaurant/b9361b49-6d61-41ee-9717-af87c879da16/37490625-fdea-476e-958b-5c3a45011ce7.jpg'
  },
  's38': {
    url:'https://menu.sluurpy.it/foto-g/88605/3170344.jpg'
  },
  'tp-cuore-luca-brancati-marano-vicentino': {
    url:'https://www.pizzaontheroad.eu/wp-content/uploads/2024/04/1713901993099.jpg'
  },
  'tp-luca-frosinone': {
    url:'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/31/de/81/2f/caption.jpg?h=900&s=1&w=900'
  },
  'tp-sitari-agrigento': {
    url:'https://img02.restaurantguru.com/c39e-Sitari-Agrigento-interior.jpg'
  }
};

const gs = (f, k) => f?.[k]?.stringValue ?? null;

async function getDoc(id) {
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?key=${API_KEY}`);
  if (!res.ok) throw new Error(`${id}: lettura HTTP ${res.status}`);
  return (await res.json()).fields ?? {};
}

async function verificaImmagine(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { redirect:'follow', signal:ctl.signal, headers:{'User-Agent':UA} });
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    res.body?.cancel?.();
    return res.ok && ct.startsWith('image/') && !ct.includes('svg');
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function patchDoc(id, url) {
  const mask = 'updateMask.fieldPaths=photoUrl&updateMask.fieldPaths=updatedAt';
  const res = await fetch(`${BASE}/locali/${encodeURIComponent(id)}?${mask}&key=${API_KEY}`, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fields:{
      photoUrl:{stringValue:url},
      updatedAt:{integerValue:String(Date.now())}
    }})
  });
  if (!res.ok) throw new Error(`${id}: scrittura HTTP ${res.status} ${await res.text()}`);
}

let aggiunte = 0, sostituite = 0, invariate = 0, nonValide = 0;
for (const [id, scelta] of Object.entries(FOTO)) {
  const f = await getDoc(id);
  const nome = gs(f, 'n') ?? id;
  const caricata = gs(f, 'photo');
  const attuale = gs(f, 'photoUrl');
  if (caricata || attuale === scelta.url || (attuale && !scelta.replace)) {
    console.log(`— ${nome}: invariata${caricata ? ' (foto caricata)' : ''}`);
    invariate++;
    continue;
  }
  if (!await verificaImmagine(scelta.url)) {
    console.log(`✗ ${nome}: URL immagine non raggiungibile`);
    nonValide++;
    continue;
  }
  const azione = attuale ? 'sostituisco anteprima errata' : 'aggiungo foto';
  console.log(`${APPLICA ? '✓' : 'ANTEPRIMA'} ${nome}: ${azione}`);
  if (APPLICA) await patchDoc(id, scelta.url);
  if (attuale) sostituite++; else aggiunte++;
}

console.log(`\n${APPLICA ? 'Applicate' : 'Da applicare'}: ${aggiunte} aggiunte · ${sostituite} sostituzioni mirate · ${invariate} invariate · ${nonValide} URL non validi.`);
