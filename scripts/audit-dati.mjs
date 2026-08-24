/* Riepilogo in sola lettura dei dati condivisi di Stasera Dove?. */
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const API_KEY = html.match(/apiKey:'([^']+)'/)?.[1];
if (!API_KEY) throw new Error('Chiave Firestore non trovata in index.html');

const BASE = 'https://firestore.googleapis.com/v1/projects/stasera-dove/databases/(default)/documents/locali';
const res = await fetch(`${BASE}?pageSize=300&key=${API_KEY}`);
if (!res.ok) throw new Error(`Lettura Firestore HTTP ${res.status}`);

const docs = (await res.json()).documents ?? [];
const gs = (f, k) => f?.[k]?.stringValue ?? '';
const gb = (f, k) => !!f?.[k]?.booleanValue;
const gi = (f, k) => Number(f?.[k]?.integerValue ?? 0);
const attivi = docs.map(d => ({id:d.name.split('/').pop(), f:d.fields ?? {}})).filter(d => !gb(d.f, 'deleted'));
const senzaFoto = attivi.filter(d => !gs(d.f, 'photo') && !gs(d.f, 'photoUrl'));
const senzaSito = attivi.filter(d => !gs(d.f, 'website'));
const senzaTelefono = attivi.filter(d => !gs(d.f, 'phone'));
const senzaPrenotazione = attivi.filter(d => !gs(d.f, 'booking'));
const glutenFreeSi = attivi.filter(d => gi(d.f, 'gf') > 0);

console.log(`${attivi.length} locali attivi · ${attivi.length - senzaFoto.length} con foto · ${glutenFreeSi.length} senza glutine sì`);
console.log(`${senzaSito.length} senza sito · ${senzaTelefono.length} senza telefono · ${senzaPrenotazione.length} senza prenotazione`);
console.log('\nSenza foto:');
for (const d of senzaFoto) {
  console.log(`- ${d.id} | ${gs(d.f, 'n')} | ${gs(d.f, 't')} | ${gs(d.f, 'website') || 'senza sito'}`);
}
