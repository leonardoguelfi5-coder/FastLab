# Taratura e stress idrico — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare la taratura di TDR e tensiometri fuori dalla Pesatura, in uno strumento di Laboratorio «Taratura e
stress idrico» con grafico, riassunto delle pesate modificabile ed eliminabile e calcolatore % CC ↔ lettura; e permettere
di eliminare un peso in tutte le pesature.

**Architecture:** I dati restano gli stessi (`sessioni_pesatura` con `tipo = 'vasi'`, `campioni_pesatura`, `pesi`;
nessuna migrazione). Pagine nuove sotto `src/pages/taratura/`, componenti nuovi sotto `src/components/taratura/`; il
calcolo delle curve (`src/domain/pesatura/curva.ts`) non cambia, si aggiungono solo le funzioni del calcolatore. Il giro
di pesata (`Pesata.tsx`) e la nuova sessione (`NuovaSessione.tsx`) si riusano: scelgono i percorsi dal tipo della
sessione o dalla sezione. Alla fine la Pesatura perde tutto ciò che riguarda i vasi.

**Tech Stack:** React 19 + TypeScript, React Router, TanStack Query, Supabase, Vitest + Testing Library, lucide-react,
interfaccia in italiano.

**Spec:** `docs/superpowers/specs/2026-11-23-taratura-stress-idrico-design.md`

## Global Constraints

- Nessuna migrazione del database; il tipo resta `'vasi'` (stringa vincolata dal database, vedi `tipi.ts`).
- Il calcolo delle curve non cambia: `adattaCurva`, `mediaDeiParametri`, `curvePerSubstrato`, `pccDaLettura`,
  `letturaAPercentuale` restano come sono, con i loro test (valori della tesi e di scipy).
- Tensiometro: legge di potenza WC = a·h^b, media a = media geometrica, b = media aritmetica. TDR: retta %CC = m·TDR + q,
  media delle rette. Nella potenza le letture si confrontano e si mostrano in valore assoluto (|h|).
- Lettura obbligatoria a capacità di campo e in asciugatura, per TDR e tensiometro; al secco nessuna lettura (si salva
  `lettura: null`).
- Ogni eliminazione chiede conferma con il componente `Conferma`; testo per una pesata: titolo «Eliminare questa
  pesata?», testo «Non si può annullare.», pulsanti «Tieni la pesata» / «Elimina».
- Pulsanti che scrivono: visibili solo a chi può (`usePermessi(espId).puoMisurare` per aggiungere,
  `puoCorreggere(peso.creato_da)` per modificare ed eliminare); senza rete (`useSenzaRete()`) disattivati.
- Valore estrapolato oltre le letture misurate della curva: testo «fuori dai valori misurati» (come `ConsultaCurva` oggi).
- Nome della voce di Laboratorio: «Taratura e stress idrico». Testi in italiano.
- Commit con la riga finale `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Sessioni vecchie con la CC senza lettura**: il riassunto dice «manca la lettura», la curva si adatta sui soli punti
   di asciugatura, niente errori; il calcolatore funziona sui vasi che hanno una curva. (Test nel Task 5 e nel Task 6.)
2. **Un rilevatore apre una taratura con pesi di altre persone**: vede i pesi altrui senza Modifica/Elimina, i propri con.
   (Test nel Task 5.)
3. **Si elimina il secco o la CC di un vaso**: il vaso torna «da pesare», le sue % CC diventano «—», il grafico e il
   calcolatore si ricalcolano senza quel vaso, senza eccezioni. (Test nel Task 5 e nel Task 7.)
4. **Tensiometro con letture negative** (es. −250 hPa): «lettura → % CC» usa |lettura|; «% CC → lettura» mostra |h|.
   (Test nel Task 2.)
5. **Valori limite nel calcolatore**: % CC 0 o negativa, lettura 0 nella potenza (non finita), substrato senza curva →
   «—» e nessuna eccezione. (Test nel Task 2 e nel Task 6.)

---

### Task 1: Percorsi della Taratura

**Files:**
- Modify: `src/lib/percorsi.ts`
- Test: `src/lib/percorsi.test.ts`

**Interfaces:**
- Produces:
  - `percorsoTaratura(espId: string): string` → `/esperimenti/<espId>/laboratorio/taratura`
  - `percorsoNuovaTaratura(espId: string, daSessioneId?: string): string` → `…/taratura/nuova[?da=<id>]`
  - `percorsoSessioneTaratura(espId: string, sessioneId: string): string` → `…/taratura/<id>`
  - `percorsoPesataTaratura(espId, sessioneId, fase: FasePesata, da?: { campione: string; replica: number }): string`
    → `…/taratura/<id>/pesa/<fase>[?campione=…&replica=…]`
  - `percorsoDellaSessione(espId: string, s: Pick<SessionePesatura, 'id' | 'tipo'>): string` — Taratura se
    `s.tipo === 'vasi'`, altrimenti `percorsoSessione`.
  - `percorsoDellaPesata(espId, s: Pick<SessionePesatura, 'id' | 'tipo'>, fase, da?)` — come sopra, per la pesata.
  - `percorsoElencoDi(espId, tipo: TipoAnalisi): string` — `percorsoTaratura` per `'vasi'`, `percorsoPesatura` per gli
    altri.

- [ ] **Step 1: Write the failing tests** in `percorsi.test.ts`:
  - `percorsoTaratura('E')` è `'/esperimenti/E/laboratorio/taratura'`.
  - `percorsoNuovaTaratura('E', 'S')` è `'/esperimenti/E/laboratorio/taratura/nuova?da=S'`; senza id, senza `?da`.
  - `percorsoPesataTaratura('E', 'S', 'asciugatura', { campione: 'c1', replica: 1 })` è
    `'/esperimenti/E/laboratorio/taratura/S/pesa/asciugatura?campione=c1&replica=1'`.
  - `percorsoDellaSessione('E', { id: 'S', tipo: 'vasi' })` è il percorso della Taratura; con `tipo: 'rwc'` è
    `'/esperimenti/E/laboratorio/pesatura/S'`. Stesso controllo per `percorsoDellaPesata` e `percorsoElencoDi`.
  - Gli id passano per `parte` come gli altri percorsi (un id con `/` è codificato).
- [ ] **Step 2: Run** `npx vitest run src/lib/percorsi.test.ts` — Expected: FAIL (funzioni non definite).
- [ ] **Step 3: Implement** in `percorsi.ts`, accanto ai percorsi della Pesatura, con `parte` per gli id. Aggiornare il
  commento di `percorsoLaboratorio` («la Pesatura e la Taratura»).
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(taratura): percorsi della Taratura`.

---

### Task 2: Calcolatore % CC ↔ lettura nel dominio

**Files:**
- Modify: `src/domain/pesatura/curva.ts`
- Test: `src/domain/pesatura/curva.test.ts`

**Interfaces:**
- Consumes: `CurveSubstrato`, `Curva`, `pccDaLettura`, `letturaAPercentuale` (esistenti).
- Produces:
  ```ts
  /** Un valore del calcolatore: null se la curva non c'è o il risultato non è finito. */
  export interface ValoreCalcolato { valore: number | null; fuoriCampo: boolean }
  export interface CalcoloSubstrato {
    substrato: string
    /** Dalla curva media del substrato. */
    media: ValoreCalcolato
    /** Uno per vaso, nell'ordine di `CurveSubstrato.vasi`; `vaso` è l'id del campione. */
    vasi: (ValoreCalcolato & { vaso: string })[]
  }
  export function calcolaLettura(gruppi: CurveSubstrato[], pcc: number): CalcoloSubstrato[]
  export function calcolaPercentuale(gruppi: CurveSubstrato[], lettura: number): CalcoloSubstrato[]
  ```
  - `calcolaLettura`: per ogni curva (media e di ogni vaso) `letturaAPercentuale(curva, pcc)`; `fuoriCampo` se la lettura
    (già |h| nella potenza) è `< curva.min` o `> curva.max`. Un vaso senza curva propria ha `valore: null` (NON usa la
    media: la media ha la sua riga).
  - `calcolaPercentuale`: `pccDaLettura(curva, lettura)`; `fuoriCampo` se `x < min || x > max` con `x = |lettura|` nella
    potenza e `lettura` nella retta (come `consultaPerLettura`).
  - Un risultato non finito (es. lettura 0 nella potenza) o `null` → `{ valore: null, fuoriCampo: false }`.

- [ ] **Step 1: Write the failing tests** (`describe('calcolatore')`), usando `T1()` e `T2()` già presenti per il TDR e
  i vasi A+B del tensiometro già nel file:
  - TDR T1: `calcolaLettura(g, 60)[0].media.valore` ≈ 35.5 (circa, 4 decimali come i test vicini), `fuoriCampo` false;
    `calcolaLettura(g, 10)[0].media.fuoriCampo` true (12,5 < 17,5).
  - TDR T1+T2: `calcolaLettura(g, 60)[0].media.valore` ≈ 34.2987; `vasi` ha 2 elementi con gli id dei campioni.
  - TDR T1: `calcolaPercentuale(g, 35.5)[0].media.valore` ≈ 60 (andata e ritorno con `calcolaLettura`).
  - Tensiometro A+B: `calcolaPercentuale(g, -250)[0].media.valore` è uguale a `calcolaPercentuale(g, 250)[0].media.valore`.
  - Tensiometro: `calcolaLettura(g, 100)[0].media.valore` > 0 (|h|).
  - Tensiometro: `calcolaPercentuale(g, 0)[0].media` è `{ valore: null, fuoriCampo: false }`.
  - Substrato senza curva (vaso con letture tutte uguali, come il test «un vaso con letture tutte uguali»): `media` e ogni
    vaso `{ valore: null, fuoriCampo: false }`.
  - `calcolaLettura(g, 0)` e `calcolaLettura(g, -5)` non lanciano.
- [ ] **Step 2: Run** `npx vitest run src/domain/pesatura/curva.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** le due funzioni e i tipi in `curva.ts`, dopo `consultaPerLettura`.
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(taratura): calcolatore % CC ↔ lettura`.

---

### Task 3: Excel della taratura

**Files:**
- Modify: `src/domain/pesatura/export.ts`
- Test: `src/domain/pesatura/export.test.ts`

**Interfaces:**
- Consumes: `calcolaLettura` (Task 2), `PERCENTUALI_TABELLA`, `decimaliLetturaTarget`.
- Produces: per le sessioni `vasi` `cartellaPesatura` restituisce i fogli `['Punti', 'Parametri', 'Calcolatore',
  'Grafico', 'Info']` per TDR **e** tensiometro; il nome del file comincia con `Taratura_` invece di `Pesatura_`.
  Foglio «Calcolatore» (tipo `'dati'`): colonne `Substrato` (testo), `% CC` (numero), `<nome della lettura>` (numero,
  titolo = `nomeLettura(sensore)`, es. `TDR (raw)`, `Tensione (hPa)`), `Nota` (testo); una riga per substrato e per ogni
  % di `PERCENTUALI_TABELLA`; la lettura dalla curva media arrotondata a `decimaliLetturaTarget(gruppi)` decimali, `null`
  senza curva; la Nota è `'fuori dai valori misurati'` se estrapolata, altrimenti `null`.

- [ ] **Step 1: Update the failing tests** in `export.test.ts`:
  - «il foglio Soglie sta dopo Pesi target» diventa: i fogli del TDR sono `['Punti', 'Parametri', 'Calcolatore', 'Grafico', 'Info']`.
  - «con il tensiometro niente foglio Soglie» diventa: anche il tensiometro ha `'Calcolatore'` (stessi cinque fogli),
    Parametri con `a, b, R²`.
  - Calcolatore TDR: titoli `['Substrato', '% CC', 'TDR (raw)', 'Nota']`; `righe[2]` è `['Torba', 60, 35.5, null]`;
    `righe[0][2]` è `53.87`.
  - Calcolatore tensiometro: titolo della terza colonna `'Tensione (hPa)'`; ogni lettura è un numero > 0 o `null`.
  - Il nome del file di una sessione `vasi` comincia con `'Taratura_'`; quello di una sessione `rwc` con `'Pesatura_'`.
  - I test di «Pesi target» e del deficit si tolgono.
- [ ] **Step 2: Run** `npx vitest run src/domain/pesatura/export.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: `foglioCalcolatore(gruppi, sensore)` al posto di `foglioSoglie`; togliere `foglioPesiTarget`
  e `foglioSoglie` e gli import che restano inutili (`consultaPerCC`, `sogliaDelSubstrato`, `deficitInMl`,
  `decimaliDeficit`). Le funzioni del dominio restano per ora (le usa ancora `ConsultaCurva`; si tolgono nel Task 8).
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(taratura): Excel con il foglio Calcolatore`.

---

### Task 4: Eliminare un peso nella pesata (tutte le pesature)

**Files:**
- Modify: `src/pages/pesatura/usePesataSequenziale.ts`, `src/pages/pesatura/Pesata.tsx`
- Test: `src/pages/pesatura/Pesata.test.tsx`

**Interfaces:**
- Consumes: `eliminaPeso(id)` (`src/api/pesatura.ts`, esistente), `Conferma`, `permessi.puoCorreggere`.
- Produces: `usePesataSequenziale` restituisce anche `elimina(): Promise<boolean>`: elimina il peso del passo corrente,
  lascia il passo senza peso (`peso: null`), resta sullo stesso passo, invalida `chiavi.pesatura(espId)`; in caso di
  errore imposta `errore` come `salva`, e torna false. Non fa nulla se il passo non ha peso o se è in corso un'altra
  scrittura.

- [ ] **Step 1: Write the failing tests** in `Pesata.test.tsx` (aggiungere `eliminaPeso: vi.fn()` al mock di `@/api/pesatura`):
  - Una RWC con il fresco di P12 già pesato da me: nella fase Fresco c'è il pulsante «Elimina questo peso»; toccandolo si
    apre la conferma «Eliminare questa pesata?»; con «Elimina» si chiama `eliminaPeso('1')` e il campo Peso torna vuoto.
  - Con «Tieni la pesata» `eliminaPeso` non si chiama.
  - Un passo senza peso non ha «Elimina questo peso».
  - Un rilevatore su un peso di un'altra persona non vede il pulsante.
  - Senza rete il pulsante è disattivato.
  - Se `eliminaPeso` fallisce, l'errore compare sotto (role alert) e il peso resta.
- [ ] **Step 2: Run** `npx vitest run src/pages/pesatura/Pesata.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `elimina` nel hook e, in `SchedaPasso`, un pulsante `variant="ghost"` «Elimina questo peso»
  nella `BarraAzioni` sotto «Indietro / Salta», mostrato quando `passo.peso !== null && puoModificare`, che apre
  `Conferma`. Dopo l'eliminazione la scheda si rimonta vuota (cambiare la `key` della scheda o azzerare i campi).
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(pesatura): si elimina un peso dalla pesata`.

---

### Task 5: Riassunto delle pesate dei vasi (modificabile)

**Files:**
- Create: `src/domain/taratura/pesate.ts`, `src/domain/taratura/pesate.test.ts`
- Create: `src/components/taratura/RiepilogoVasi.tsx`, `src/components/taratura/RiepilogoVasi.test.tsx`

**Interfaces:**
- Consumes: `CampionePesatura`, `Peso`, `SessionePesatura`, `Sensore`, `percentualeCCCalcolata` (`calcoli.ts`),
  `precisioneDeiPesi`, `nomeLettura`, `SENZA_SUBSTRATO`, `Conferma`, `NumericField`.
- Produces:
  ```ts
  // src/domain/taratura/pesate.ts
  export interface PesateDelVaso {
    campione: CampionePesatura
    secco: Peso | null
    cc: Peso | null
    /** L'asciugatura in ordine di tempo (`misurato_il`, confrontato come data). */
    punti: Peso[]
  }
  /** Raggruppate per substrato nell'ordine dei campioni (`ordine`), come `curvePerSubstrato`. Replica 1. */
  export function pesateDeiVasi(campioni: CampionePesatura[], pesi: Peso[]): { substrato: string; vasi: PesateDelVaso[] }[]
  ```
  ```tsx
  // src/components/taratura/RiepilogoVasi.tsx
  interface RiepilogoVasiProps {
    sessione: SessionePesatura
    campioni: CampionePesatura[]
    pesi: Peso[]
    puoAggiungere: boolean
    puoCorreggere: (creatoDa: string | undefined) => boolean
    senzaRete: boolean
    /** Salva (upsert) un peso: nuovo o corretto. Lancia se non riesce; l'errore resta nel riquadro. */
    onSalva: (p: Peso) => Promise<void>
    /** Elimina un peso. Lancia se non riesce. */
    onElimina: (p: Peso) => Promise<void>
  }
  export function RiepilogoVasi(props: RiepilogoVasiProps): JSX.Element
  ```
  Comportamento:
  - Per substrato un titolo; per vaso una tabella (o elenco) con le righe: «Secco» (peso), «Capacità di campo» (peso ·
    lettura, o «manca la lettura» se `lettura === null`), una riga per punto (data e ora locale, peso, lettura, % CC con
    `percentualeCCCalcolata`, «—» se manca secco o CC).
  - Secco o CC mancanti: la riga dice «da pesare» e ha «Pesa» (apre lo stesso modulo di Modifica, vuoto) se
    `puoAggiungere`.
  - Ogni riga con un peso: «Modifica» ed «Elimina» se `puoCorreggere(peso.creato_da)`; `aria-label` con il vaso e la
    riga (es. «Modifica Capacità di campo, V1»).
  - Modifica: i campi «Peso» (con l'unità della sessione) e, se la riga non è il secco, la lettura (etichetta
    `nomeLettura(sensore)`), già compilati; «Salva» / «Annulla». Il peso salvato ha lo stesso `id`, `misurato_il` e
    `creato_da`; al secco `lettura: null`. Peso obbligatorio (≥ 0) e lettura obbligatoria dove si chiede, con gli stessi
    messaggi di `Pesata.tsx` («Scrivi il peso.», «Scrivi la lettura del sensore.»).
  - «Aggiungi pesata» per vaso (se `puoAggiungere`): stesso modulo vuoto; crea `{ id: nuovoId(), tipo: 'asciugatura',
    replica: 1, misurato_il: new Date().toISOString() }`. Pesare un secco o una CC mancanti crea il peso con il loro tipo.
  - Elimina: `Conferma` (testi delle Global Constraints), poi `onElimina`.
  - Senza rete tutti i pulsanti che scrivono sono disattivati.

- [ ] **Step 1: Write the failing domain tests** (`pesate.test.ts`):
  - due vasi di due substrati → due gruppi nell'ordine dei campioni; un campione senza substrato va in `SENZA_SUBSTRATO`;
  - i punti escono in ordine di `misurato_il` anche se arrivano mescolati e con fusi orari diversi;
  - un peso di replica 2 si ignora; un vaso senza pesi ha `secco`, `cc` null e `punti` vuoti.
- [ ] **Step 2: Run** `npx vitest run src/domain/taratura` — Expected: FAIL; **Step 3: Implement**; **Step 4: Run** — PASS.
- [ ] **Step 5: Write the failing component tests** (`RiepilogoVasi.test.tsx`), con un vaso TDR V1 (secco 750, CC 4850
  lettura 54, punti 4030/44.8 e 3210/35.2):
  - la riga CC mostra `4850 g` e `54`; la riga del punto 3210 mostra la % CC `60` (con le cifre di `percentualeCCCalcolata`);
  - «Modifica Capacità di campo, V1» → campi compilati; cambiare la lettura in 55 e «Salva» chiama `onSalva` con lo stesso
    `id`, `misurato_il` e `lettura: 55`;
  - «Modifica Secco, V1» non mostra il campo della lettura e salva `lettura: null`;
  - «Aggiungi pesata» su V1 con peso 2500 e lettura 26 chiama `onSalva` con `tipo: 'asciugatura'`, `replica: 1`, id nuovo;
  - senza lettura, «Salva» mostra «Scrivi la lettura del sensore.» e non chiama `onSalva`;
  - «Elimina» su un punto apre «Eliminare questa pesata?»; «Elimina» chiama `onElimina` con quel peso; «Tieni la pesata» no;
  - una CC con `lettura: null` mostra «manca la lettura» (Review Focus 1);
  - un vaso senza secco mostra «da pesare» e le % CC dei punti «—» (Review Focus 3);
  - con `puoCorreggere = id => id === 'io'` le righe di un peso con `creato_da: 'altro'` non hanno Modifica/Elimina, le
    mie sì (Review Focus 2);
  - con `senzaRete` i pulsanti sono disattivati;
  - se `onSalva` lancia, il messaggio compare nel modulo (role alert) e i campi restano.
- [ ] **Step 6: Run** `npx vitest run src/components/taratura` — Expected: FAIL; **Step 7: Implement** `RiepilogoVasi`;
  **Step 8: Run** — Expected: PASS.
- [ ] **Step 9: Commit** `feat(taratura): riassunto delle pesate modificabile`.

---

### Task 6: Calcolatore (componente)

**Files:**
- Create: `src/components/taratura/Calcolatore.tsx`, `src/components/taratura/Calcolatore.test.tsx`

**Interfaces:**
- Consumes: `calcolaLettura`, `calcolaPercentuale` (Task 2), `decimaliLetturaTarget`, `nomeLettura`, `SceltaSingola`,
  `NumericField`, `formattaDecimali`.
- Produces: `export function Calcolatore({ gruppi, sensore }: { gruppi: CurveSubstrato[]; sensore: Sensore }): JSX.Element`
  - Titolo «Calcolatore»; `SceltaSingola` «Che cosa conosci» con «% di capacità di campo» e «Lettura dello strumento»;
    un `NumericField` (etichetta «% di capacità di campo» con unità `%`, oppure `nomeLettura(sensore)`; nel verso lettura
    accetta i negativi). Cambiare verso svuota il campo.
  - Senza valore: «Scrivi un valore per vedere il risultato.»
  - Risposta in una regione `aria-label="Risultato del calcolatore"`: per substrato «Curva media» con il valore e, sotto,
    una riga per vaso (nome del campione o id). Lettura con `decimaliLetturaTarget(gruppi)` decimali; % CC con 1 decimale
    e « %». «—» se null; «fuori dai valori misurati» con l'icona `TriangleAlert` accanto a un valore estrapolato.

- [ ] **Step 1: Write the failing tests** con il gruppo TDR T1 (come in `ConsultaCurva.test.tsx`):
  - % CC 60 → «Curva media» `35,50`; nessun avviso;
  - % CC 10 → avviso «fuori dai valori misurati» accanto alla curva media;
  - verso lettura, 35,5 → `60,0 %`;
  - cambiare verso svuota il campo e torna «Scrivi un valore…»;
  - tensiometro A+B, verso lettura, −250 e 250 danno lo stesso risultato (Review Focus 4); l'etichetta è `Tensione (hPa)`;
  - substrato senza curva → «—» (Review Focus 5);
  - tensiometro, lettura 0 → «—», nessuna eccezione.
- [ ] **Step 2: Run** `npx vitest run src/components/taratura/Calcolatore.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `Calcolatore`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(taratura): calcolatore nei due versi`.

---

### Task 7: Pagine della Taratura

**Files:**
- Create: `src/pages/taratura/Taratura.tsx` (+ `.test.tsx`), `src/pages/taratura/SessioneTaratura.tsx` (+ `.test.tsx`)
- Modify: `src/App.tsx`, `src/pages/Laboratorio.tsx` (+ test), `src/pages/pesatura/NuovaSessione.tsx` (+ test),
  `src/pages/pesatura/Pesata.tsx` (+ test)

**Interfaces:**
- Consumes: Task 1 (percorsi), Task 5 (`RiepilogoVasi`), Task 6 (`Calcolatore`), `GraficoCurve`, `equazione`,
  `gruppiDeiVasi`, `scaricaPesatura`, `scaricaGraficoPng`, `salvaPeso`, `eliminaPeso`, `aggiornaSessione`,
  `eliminaSessione`, `usePesatura`, `chiavi.pesatura`.
- Produces:
  - Rotte in `App.tsx`, prima di quelle della Pesatura e con `nuova` prima di `:sessioneId`:
    `/esperimenti/:espId/laboratorio/taratura` → `<Taratura />`; `…/taratura/nuova` → `<NuovaSessione sezione="taratura" />`;
    `…/taratura/:sessioneId/pesa/:fase` → `<Pesata />`; `…/taratura/:sessioneId` → `<SessioneTaratura />`.
  - `NuovaSessione` prende `sezione?: 'pesatura' | 'taratura'` (predefinito `'pesatura'`). Con `'taratura'`: titolo
    «Nuova taratura» / «Ripeti taratura», tipo fisso `'vasi'` senza scelta del tipo, indietro e «Torna» verso
    `percorsoTaratura`, dopo il salvataggio va a `percorsoSessioneTaratura`. Con `'pesatura'` la scelta del tipo NON offre
    più `'vasi'` (`TIPI = ['aliquota', 'rwc', 'sostanza_secca']`).
  - `Pesata` usa `percorsoDellaSessione` / `percorsoDellaPesata` / `percorsoElencoDi` con il tipo della sessione per
    indietro, «Torna alla sessione», fine del giro e link interni (sessione non trovata: torna all'elenco della sezione da
    cui si arriva, letta dal percorso: `useLocation().pathname` contiene `/taratura/`).
  - `Laboratorio`: `STRUMENTI_LABORATORIO` con la seconda voce `{ nome: 'Taratura e stress idrico', icona: Droplets,
    percorso: percorsoTaratura }`.
  - `Taratura` (elenco): titolo «Taratura e stress idrico», indietro `percorsoLaboratorio`; pulsante «Nuova taratura» (se
    `puoMisurare`); le sessioni `tipo === 'vasi'` dalla più recente (stessa regola di `dallaPiuRecente` in `Pesatura.tsx`);
    riga: `data · TDR|Tensione`, titolo, prima riga della nota, «N vasi · M pesate»; «Ripeti» per riga; senza sessioni
    «Nessuna taratura per ora.»; stato senza rete come la Pesatura.
  - `SessioneTaratura`: le sezioni nell'ordine dello spec — intestazione (titolo, `data · sensore · unità`, `Nota`
    modificabile che conserva `conclusa`), grafico per substrato con equazione o «servono almeno 3 letture diverse in un
    vaso per la curva» e «Scarica grafico (PNG)», «Pesate» con `RiepilogoVasi` (`onSalva` = `salvaPeso` + invalidazione,
    `onElimina` = `eliminaPeso` + invalidazione), `Calcolatore`, «Esporta e gestisci» con «Pesa tutti i vasi» (tre
    collegamenti: Secco, Capacità di campo, Asciugatura, con `percorsoPesataTaratura`), «Scarica Excel», «Ripeti questa
    taratura», «Elimina taratura» con la conferma e le regole di `Sessione.tsx` (proprietario o autore, pesi altrui).
    Una sessione con `tipo !== 'vasi'` → `<Navigate replace>` a `percorsoSessione`. La componente `Nota` si sposta da
    `Sessione.tsx` in `src/components/pesatura/NotaSessione.tsx` e la usano tutte e due le pagine.

- [ ] **Step 1: Write the failing tests**:
  - `Laboratorio.test.tsx`: due voci, la seconda «Taratura e stress idrico» porta a `/esperimenti/E/laboratorio/taratura`.
  - `Taratura.test.tsx`: mostra solo le sessioni vasi (una `rwc` nello stesso elenco non c'è); ordine dalla più recente;
    riga con «TDR» e «2 vasi · 5 pesate»; «Nuova taratura» assente per un lettore; elenco vuoto → «Nessuna taratura per ora.».
  - `SessioneTaratura.test.tsx` (mock come `Sessione.test.tsx`, più `salvaPeso`, `eliminaPeso`): con due vasi TDR si vedono
    il grafico (un `figure`/`svg` per substrato come in `Sessione.test.tsx`), l'equazione, la sezione «Pesate», il
    «Calcolatore»; NON ci sono «Pesi a % CC fisse», «TDR target», «Deficit», la tabella dei parametri; modificare una
    lettura chiama `salvaPeso` e rilegge i dati; eliminare un punto chiama `eliminaPeso` dopo la conferma; una CC senza
    lettura in una sessione vecchia non rompe la pagina (Review Focus 1); con un vaso senza secco il calcolatore dà il
    valore della media degli altri vasi (Review Focus 3); una sessione `rwc` aperta qui va alla pagina della Pesatura;
    «Scarica Excel» chiama `scaricaPesatura`.
  - `NuovaSessione.test.tsx`: in Pesatura la scelta del tipo non ha «Vasi»; con `sezione="taratura"` non c'è la scelta
    del tipo, ci sono sensore e vasi, il salvataggio crea una sessione `tipo: 'vasi'` e porta a `/…/taratura/<id>`.
  - `Pesata.test.tsx`: per una sessione vasi aperta da `/…/taratura/S/pesa/capacita_campo`, «indietro» porta a
    `/…/taratura/S`; la CC chiede la lettura (campo obbligatorio) per TDR e per tensiometro; il secco non la chiede.
- [ ] **Step 2: Run** `npx vitest run src/pages src/components/pesatura` — Expected: FAIL nei test nuovi.
- [ ] **Step 3: Implement** le pagine, le rotte, la voce di Laboratorio, `sezione` in `NuovaSessione`, i percorsi in
  `Pesata`, `NotaSessione`.
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(taratura): pagine di Taratura e stress idrico`.

---

### Task 8: Pulizia della Pesatura e reindirizzamenti

**Files:**
- Modify: `src/pages/pesatura/Pesatura.tsx`, `src/pages/pesatura/Sessione.tsx`, `src/pages/pesatura/Pesata.tsx` e i loro test;
  `src/domain/pesatura/curva.ts`, `curva.test.ts`
- Delete: `src/components/pesatura/ConsultaCurva.tsx` (+ test), `src/components/pesatura/TabellaParametri.tsx` (+ test)

**Interfaces:**
- Consumes: Task 1 (percorsi), Task 7 (pagine).
- Produces:
  - `Pesatura` (elenco): senza le sessioni `vasi`; i testi «Conclusa» e la fase «Asciugatura» che servivano solo ai vasi
    escono da `vociDi`.
  - `Sessione` (Pesatura): una sessione `vasi` → `<Navigate replace>` a `percorsoSessioneTaratura`; tolte la sezione
    «Curve dei vasi», il «Segna come conclusa», gli import delle curve.
  - `Pesata` aperta da `/laboratorio/pesatura/S/pesa/:fase` con una sessione `vasi` → `<Navigate replace>` a
    `percorsoPesataTaratura` con la stessa fase e la stessa coda (`?campione=…&replica=…`).
  - Dal dominio si tolgono le funzioni rimaste senza uso: `consultaPerCC`, `consultaPerLettura`, `PesoTarget`,
    `RispostaConsulta`, `sogliaDelSubstrato`, `Soglia`, `SogliaVaso`, `deficitInMl`, `decimaliDeficit`, e
    `parametriDelSubstrato` / `RigaParametri` / `intestazioniLetturaCC` se non le usa più nessuno (le usa ancora il foglio
    Parametri dell'Excel: allora restano). Verificare con `grep` prima di togliere.
- [ ] **Step 1: Write the failing tests**:
  - `Pesatura.test.tsx`: una sessione vasi nei dati non compare nell'elenco; una `rwc` sì.
  - `Sessione.test.tsx`: `/…/pesatura/S` con una sessione vasi porta alla pagina della Taratura (rotta di prova
    `…/taratura/:sessioneId` con un testo); i test delle curve dei vasi in questo file si tolgono (ora sono in
    `SessioneTaratura.test.tsx`).
  - `Pesata.test.tsx`: `/…/pesatura/S/pesa/asciugatura?campione=c1&replica=1` con una sessione vasi porta a
    `/…/taratura/S/pesa/asciugatura?campione=c1&replica=1`.
- [ ] **Step 2: Run** `npx vitest run src/pages/pesatura` — Expected: FAIL.
- [ ] **Step 3: Implement**; cancellare `ConsultaCurva` e `TabellaParametri` con i loro test; togliere le funzioni del
  dominio inutili e i loro test.
- [ ] **Step 4: Run** `npx vitest run` e `npx tsc -b` — Expected: PASS (salvo `src/App.test.tsx`, che in questa cartella
  di lavoro fallisce per la mancanza di `.env.local`; nessun altro fallimento) e nessun errore di tipo; `grep -rn
  "ConsultaCurva\|TabellaParametri\|sogliaDelSubstrato" src` non trova nulla.
- [ ] **Step 5: Commit** `refactor(pesatura): i vasi escono dalla Pesatura`.

---

### Task 9: Verifica nel browser

**Files:** nessuno nel ramo (una pagina di prova temporanea, poi cancellata).

- [ ] **Step 1:** Avviare l'app in locale. Se `.env.local` ha solo valori segnaposto (come nelle volte precedenti),
  costruire una pagina dimostrativa temporanea (`demo-taratura.html` + `src/demo-taratura.tsx`) che monta
  `SessioneTaratura` con dati finti (due vasi TDR T1/T2, due vasi tensiometro) e `QueryClient` precompilato.
- [ ] **Step 2:** Nel browser controllare: Laboratorio ha le due voci; la pagina della taratura mostra solo grafico,
  pesate, calcolatore ed esporta; Modifica/Aggiungi/Elimina funzionano con la conferma; il calcolatore nei due versi; la
  pagina a larghezza telefono (375 px) senza scorrimento orizzontale della pagina.
- [ ] **Step 3:** Cancellare la pagina dimostrativa e i file copiati; `git status` pulito.
