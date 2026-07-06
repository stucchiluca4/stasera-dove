# 🍽️ Stasera Dove? — Guida completa (V2)

App decisionale per le cene di Simone & Sara. I **vostri 58 locali** già caricati,
domande mirate, recensioni personali con **foto**, **classifica annuale**, filtro
**"aperto stasera"** e scoperta di posti nuovi via AI (dentro Claude). Ora anche
**pubblicabile online** e **installabile su iPhone** come una vera app, funzionante
offline.

---

## 1 · Cosa fa l'app

| Funzione | Come funziona |
|---|---|
| 🎯 **Stasera** | 3 domande (cosa · budget · zona) + toggle 🟢 *aperti stasera* → classifica con punteggio |
| 🎲 **Sorprendimi** | il dado sceglie tra i migliori 10 match |
| 📚 **Archivio** | i 58 locali + quelli che aggiungi (ricerca, modifica, elimina, giorni di chiusura) |
| ⭐ **Diario** | dopo "✅ Scelto!" il locale va tra i "da recensire": voto, spesa/persona, note, chi c'era, **📸 foto del piatto** |
| 🏆 **Classifica** | per anno: locale dell'anno, spesa media/totale, voto medio, tipologia e zona più amate, podio |
| ✨ **Completa con AI** | *(solo dentro Claude)* cerca sul web sito, telefono, prenotazione, prezzo, descrizione |
| 🔮 **Scopri posti nuovi** | *(solo dentro Claude)* l'AI trova 3 locali reali simili ai vostri preferiti |
| 🔗 **Link su ogni scheda** | Maps (sempre), Chiama, Sito, Prenota |
| ⬇️⬆️ **Backup** | esporta/importa tutto in JSON (dall'Archivio) — utile anche per passare i dati tra i due iPhone |

Il punteggio premia: tipologia richiesta, budget vicino, zona giusta, voti alti nelle
vostre recensioni; penalizza i posti visitati negli ultimi 30 giorni e i chiusi
stasera; segnala i "🆕 da provare". Con il toggle 🟢 attivo, i chiusi stasera
vengono esclusi del tutto.

---

## 2 · Metterla online + icona su iPhone

Le istruzioni passo-passo sono nel file **`README.md`** del repository. In breve:

1. **Online (una volta):** su GitHub → Settings → **Pages** → *Deploy from a branch*
   → branch `claude/new-session-fyvycs`, cartella `/ (root)` → **Save**. Dopo ~1 minuto
   ottieni un link tipo `https://stucchiluca4.github.io/claude-test/`.
   *(Il repository deve essere pubblico con il piano gratuito.)*
2. **Icona su iPhone:** apri il link in **Safari** → **Condividi** ↑ → **Aggiungi a
   Home** → **Aggiungi**. Fatelo su entrambi i telefoni.

Da lì si apre a tutto schermo e funziona **anche offline**.

---

## 3 · Dati, condivisione e limiti

- **Dove sono i dati:** salvati **su questo dispositivo** (storage del browser). Niente
  login, niente "sola memoria": le modifiche restano.
- **Sincronizzazione:** i dati **non** sono condivisi tra i due iPhone (ognuno il suo).
  Per allinearli: **⬇️ Backup** su un telefono, invii il file all'altro, **⬆️ Importa**.
- **Funzioni AI (✨/🔮):** disponibili **solo aprendo l'app dentro Claude** (usano la
  ricerca web). Sul sito pubblico quei due pulsanti sono nascosti; tutto il resto funziona.
- **Offline:** consultazione, ricerca, diario, foto e classifica funzionano senza rete
  (grazie al service worker). Serve rete solo per le funzioni AI dentro Claude.
- **Foto:** vengono ridimensionate e compresse in automatico. Lo spazio del browser non
  è infinito: se un giorno appare "spazio esaurito", fai un backup e alleggerisci le foto.
- Fai un **⬇️ Backup** ogni tanto: 10 secondi e siete al sicuro.

---

## 4 · Flusso d'uso tipico (la sera del dilemma)

1. Apri l'icona → 3 domande (o 🎲 Sorprendimi), eventualmente 🟢 *aperti stasera* →
   **🔍 Consiglia dove andare**.
2. Scorri le carte: ★ = vi era piaciuto, 🆕 = mai provato, 🔴 = chiuso stasera. Tocca 🗺️/📞/🌐/📅.
3. Deciso? **✅ Scelto!** → dopo cena, dal **Diario**: stelle, spesa, note, **📸 foto**.
4. Nel tempo, apri **🏆 Classifica** per vedere il locale dell'anno e le statistiche.
5. Più recensite, più i consigli diventano *vostri*.

---

## 5 · Il prompt "fatto e finito" (per rigenerare / fare una V3)

Da incollare in una **nuova chat Claude**. È autosufficiente.

```text
Crea una web-app HTML installabile (PWA, mobile-first iOS, offline via service worker,
zero dipendenze esterne) chiamata "Stasera Dove?" per decidere dove andare a cena.
Utenti: Simone & Sara, zona Bergamo/Brianza. Persistenza: window.storage con chiave
"staseradove:data" se presente (ambiente Claude, con funzioni AI attive); altrimenti
localStorage (dati sul dispositivo, funzioni AI disattivate e nascoste); fallback
in-memory con banner se nessuno dei due è disponibile.

FLUSSO PRINCIPALE (tab "Stasera"): 3 domande a chip single-select —
1) Cosa ti va? [Qualsiasi, Pizza, Ristorante, Carne&griglia, Pesce, Brunch, Burger,
   Etnico, Sorprendimi]
2) Budget a testa? [Indifferente, € <20, €€ 20-40, €€€ 40-70, €€€€ >70]
3) Zona? [Ovunque, Bergamo città, Bergamo provincia, Monza & Brianza, Milano,
   Como / Lecco / Adda, Brescia & Laghi]
+ toggle "🟢 Solo aperti stasera".
Bottone "Consiglia dove andare" → ranking: tipologia richiesta obbligatoria (+50),
budget esatto +22 / adiacente +8 / lontano -6, zona +22, media recensioni ×6, mai
provato +8 con badge 🆕, visitato <30 giorni -15; se toggle attivo escludi i chiusi
oggi (in base ai giorni di chiusura del locale), altrimenti mostra badge 🔴/🟢 e -4 ai chiusi.
"Sorprendimi" pesca a caso tra i top 10 con card evidenziata e tasto Rilancia.

CARD LOCALE: nome, località, zona, tag tipologie, fascia €, badge ★ media recensioni,
badge apertura. Azioni: 🗺️ Maps (sempre), 📞 Chiama, 🌐 Sito, 📅 Prenota (fallback
ricerca Google); ✨ Completa con AI (solo Claude); ✍️ Recensione; ✅ Scelto!; ✏️ Modifica.
Modifica locale include i "Giorni di chiusura" (Lun–Dom).

AI (solo se window.storage nativo; Anthropic API, fetch POST
https://api.anthropic.com/v1/messages, nessuna API key, model "claude-sonnet-4-6",
max_tokens 1000, tools [{type:"web_search_20250305",name:"web_search"}]; parse:
concatena i blocchi text, estrai JSON con try/catch):
- ✨ Enrichment: {website,phone,booking,price 1-4,blurb ≤15 parole} → merge nella scheda.
- 🔮 Discovery: 3 locali REALI aperti NON in archivio → array {name,town,types,price,why,
  website,phone} → card con ➕ Aggiungi.

TAB "Archivio": ricerca live, ➕ nuovo, modifica/elimina, ⬇️ backup / ⬆️ import JSON.
TAB "Diario": "✅ Scelto!" crea una voce pendente (evita doppioni); recensione = chi
c'era [Simone/Sara/Entrambi], stelle 1-5, spesa €/persona, data, note, FOTO del piatto
(compressa via canvas a max 1200px JPEG ~0.72, salvata come dataURL, con lightbox);
pendenti in evidenza, storico per data.
TAB "Classifica": selettore anno + "Sempre"; tessere n. cene, voto medio, spesa media,
spesa totale; "Locale dell'anno" (più visite, tiebreak media); tipologia e zona più
frequentate; conteggio chi c'era; podio top 3 per media.

DESIGN: header lavagna d'osteria (#1E2721, font Chalkboard SE/Marker Felt) che riscrive
live le risposte; carta calda #F5F2EA, rosso vino #8E2F2F, oliva #5A6B3B, oro #C89B3C;
bottom nav fissa 4 tab con safe-area-inset; chip pill; modali bottom-sheet; toast.
Build stamp "V2" (o progressivo) visibile in header. UI in italiano. Includi manifest,
service worker (rete-prima), apple-touch-icon.

DATABASE PRECARICATO: i 58 locali (formato nome | località | zona | tipologie | €),
come nel file esistente. Valida la sintassi JS, testa il flusso completo e consegna.
```

---

## 6 · Idee per la V3 (basta chiederle)

- Sincronizzazione reale tra i due iPhone (PWA + Supabase/back-end)
- "Chi decide stasera?" — turno alternato Simone/Sara
- Filtro orari reali via AI ("aperto adesso" verificato sul web)
- Note vocali o più foto per recensione

---
*Stasera Dove? · Build V2 · luglio 2026*
