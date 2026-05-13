# Design: FastLab PWA — Modifiche v2

**Data:** 2026-05-13
**Progetto:** FastLab — Digitalizzazione rilievi Hydrochar × Cuore di Bue
**Tipo:** Modifiche al PWA esistente (v1 su fast-lab-gamma.vercel.app)

---

## Contesto

L'app FastLab v1 è operativa. I rilievi vengono fatti in più passate sul campo: prima si misura la temperatura per tutte le piante, poi lo SPAD, poi altezza, poi i parametri fenologici. Il form attuale richiede di inserire tutti i dati in una sola volta, il che non corrisponde al flusso reale di lavoro.

Inoltre il file Excel esportato non mostra i dati di palchi e infiorescenze (n_foglie per palco, n_fiori per infiorescenza) a causa di un bug sul crash quando gli array sono undefined.

---

## Modifiche

### 1. UX Pass-Based: Selezione tipo di misurazione

Quando l'utente preme "+ Nuova", arriva su una schermata `SceltaMisurazione` con 4 opzioni:

| Opzione | Campi mostrati |
|---|---|
| 🌡 Termometro | Temp Aria, Temp Pianta |
| 💚 SPAD | SPAD |
| 📏 Altezza | Altezza |
| 🌱 Fenologici | Altezza, N palchi totali, N fiori fioriti, N frutti, N frutti invaiati, Palchi (dettaglio), Infiorescenze (dettaglio), Note |

Dopo la scelta, l'utente va su `PassoPianta` dove inserisce l'ID pianta e i campi del tipo selezionato, uno per volta.

**Logica salvataggio:**
- Se esiste già una rilevazione per quella pianta oggi (`data_ora_inizio.slice(0,10) === oggi`): aggiorna i campi rilevanti con `updateRilevazione` (merge — non sovrascrive i campi già compilati da altre passate)
- Se non esiste: crea nuova rilevazione con `addRilevazione`

**"Oggi"** = `new Date().toISOString().slice(0, 10)` — stesso timezone locale del dispositivo.

**Inserimento pianta:** manuale (campo numerico, validazione 1-56). Non c'è navigazione automatica tra piante.

**Feedback post-salvataggio:** toast/messaggio "Pianta #X salvata ✓" + reset campo ID pianta per inserire la successiva. I campi del tipo misurazione si mantengono pre-compilati per velocizzare l'inserimento seriale (es. temp_aria resta uguale tra pianta e pianta durante la passata Termometro).

### 2. Modifica rilevazione esistente

Ogni card in `ListaRilevazioni` ha un pulsante "✏️ Modifica" che porta a `NuovaRilevazione` in modalità edit, pre-caricando tutti i campi della rilevazione selezionata.

Route: `/modifica/:id`

In modalità edit:
- Il campo `id_pianta` è read-only (non si cambia la pianta)
- Al salvataggio: `updateRilevazione` invece di `addRilevazione`
- `data_ora_fine` viene aggiornato con `new Date().toISOString()`

### 3. Fix Excel export

**Bug:** `r.palchi.map(...)` e `r.infiorescenze.map(...)` crashano se gli array sono `undefined` (rilevazioni create durante una passata Termometro non hanno ancora palchi/infiorescenze).

**Fix:** Aggiungere fallback `?? []` in `exportExcel.ts`:
- `r.palchi.map(...)` → `(r.palchi ?? []).map(...)`
- `r.infiorescenze.map(...)` → `(r.infiorescenze ?? []).map(...)`

---

## Nuovi file

| File | Scopo |
|---|---|
| `src/pages/SceltaMisurazione.tsx` | Schermata scelta tipo misurazione (4 opzioni) |
| `src/pages/PassoPianta.tsx` | Form per inserire una misurazione per una pianta |

## File modificati

| File | Modifica |
|---|---|
| `src/store/rilevazioneStore.ts` | Aggiunta action `updateRilevazione(r: RilevazionePrincipale)` |
| `src/App.tsx` | Aggiunta routes `/scegli`, `/passo/:tipo`, `/modifica/:id` |
| `src/pages/ListaRilevazioni.tsx` | Aggiunta pulsante "✏️ Modifica" per ogni card |
| `src/pages/NuovaRilevazione.tsx` | Supporto modalità edit via route `/modifica/:id` |
| `src/lib/exportExcel.ts` | Null safety: `(r.palchi ?? [])` e `(r.infiorescenze ?? [])` |

---

## Fuori scope

- Navigazione automatica tra piante (l'utente inserisce l'ID manualmente)
- Sincronizzazione remota / backup cloud
- Multi-utente
- Storico modifiche per rilevazione
