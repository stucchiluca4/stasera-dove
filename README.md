# 🍽️ Stasera Dove? — V2

App per decidere dove andare a cena (Simone & Sara). I vostri locali già caricati,
consiglio con punteggio, diario delle cene con foto, classifica annuale e filtro
"aperto stasera". Funziona **offline** e si installa come icona sull'iPhone.

Tutto in questo repo, zero dipendenze da installare.

---

## 📁 Cosa c'è dentro

| File | A cosa serve |
|---|---|
| `index.html` | L'app completa (apri questo) |
| `manifest.webmanifest` | Fa sì che si installi come app |
| `sw.js` | Fa funzionare l'app **anche offline** |
| `icon-*.png`, `apple-touch-icon.png` | L'icona sulla schermata Home |

I dati (archivio, diario, foto) si salvano **su questo dispositivo** (nel browser).
Non serve login. Nota: i dati **non** si sincronizzano tra il tuo iPhone e quello
di Sara — ognuno ha i suoi. Per spostarli usa **⬇️ Backup / ⬆️ Importa** dall'Archivio.

---

## 🌐 Metterla ONLINE (una volta sola, ~2 minuti)

Usiamo **GitHub Pages**: gratis, già incluso nel tuo account GitHub.

> ⚠️ Il repository deve essere **pubblico** (con il piano gratuito). Se è privato:
> Settings → in fondo "Change repository visibility" → Public. Oppure serve GitHub Pro.

1. Vai sul repository su GitHub: **`stucchiluca4/claude-test`**
2. In alto clicca **Settings** (⚙️).
3. Nel menu a sinistra clicca **Pages**.
4. Sotto **"Build and deployment" → Source**, scegli **"Deploy from a branch"**.
5. In **Branch** seleziona **`claude/new-session-fyvycs`** e cartella **`/ (root)`**, poi **Save**.
6. Aspetta ~1 minuto e ricarica la pagina: comparirà in alto il link, tipo:

   **`https://stucchiluca4.github.io/claude-test/`**

Quello è il link della tua app. 🎉

---

## 📱 Aggiungere l'icona sull'iPhone

Da fare su **entrambi** gli iPhone (tuo e di Sara).

1. Apri il link qui sopra in **Safari** (non Chrome).
2. Tocca il tasto **Condividi** (il quadrato con la freccia in su ↑).
3. Scorri e tocca **"Aggiungi a Home"** (Add to Home Screen).
4. Tocca **Aggiungi**.

Ora hai l'icona **"Stasera Dove?"** in Home: si apre a tutto schermo, come una vera
app, e funziona anche **senza connessione**.

---

## ✨ Le funzioni AI (✨ Completa · 🔮 Scopri)

Servono la ricerca web di Claude, che sul sito pubblico non è disponibile: per
questo su GitHub Pages **quei due pulsanti sono nascosti**. Tutto il resto
(consiglio, archivio, diario, foto, classifica, aperto stasera) funziona
perfettamente offline. Le funzioni AI ricompaiono solo se apri l'app **dentro
l'app Claude**.

---

## 🔄 Aggiornare l'app in futuro

Chiedi la modifica in chat: aggiorno `index.html` e faccio push su questo branch.
Grazie al service worker (rete-prima), la prossima volta che apri l'app **con
connessione** vedi subito la versione nuova.

---

## 🆕 Novità della V2

- 🟢 **Aperto stasera** — filtro basato sui giorni di chiusura (impostabili con ✏️)
- 🏆 **Classifica** — locale dell'anno, spesa media/totale, voto medio, tipologia e zona top, podio
- 📸 **Foto nel diario** — foto del piatto nelle recensioni (compressa in automatico)
- 💾 **Dati sul dispositivo** — salvataggio reale via browser, niente più "sola memoria"
- 🐛 Vari fix (niente doppioni tra i "da recensire", conteggi corretti, ecc.)
