# Curva dei vasi a legge di potenza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La taratura dei vasi con il tensiometro produce l'adattamento WC = a · h^b per vaso (minimi quadrati non
lineari), la curva media come media dei parametri, il grafico come la Figura 5 e la tabella come la Tabella 4; la
capacità di campo chiede la lettura dello strumento.

**Architecture:** Il calcolo resta puro in `src/domain/pesatura/curva.ts` (Levenberg–Marquardt a due parametri scritto a
mano, niente dipendenze). `CurveSubstrato` porta anche la curva di ogni vaso, così pagina, consultazione, grafico ed
export non riadattano. Il grafico diventa uno per substrato con un colore per vaso.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, SVG scritto a mano, exceljs tramite `scriviCartella`.

**Spec:** `docs/superpowers/specs/2026-11-19-curva-vasi-potenza-design.md`

## Global Constraints

- Modello per il tensiometro (`sensore.tipo === 'tensione'`): WC = a · h^b, h = |lettura|, letture a 0 escluse.
- Adattamento: minimi quadrati non lineari su WC; R² = 1 − SSres/SStot su WC. Deve coincidere con
  `scipy.optimize.curve_fit` entro 4 cifre significative (valori di riferimento nel Task 2).
- Curva media del substrato (potenza): a = media degli a, b = media dei b, R² = media degli R² dei vasi con curva.
- Sensore di umidità (`'umidita'`): modello lineare e media su tutti i punti, come oggi.
- Lettura obbligatoria per i vasi alle fasi `capacita_campo` e `asciugatura`; mai per `secco`.
- Niente soglie (fascia 60–50 %, h al 60 %/50 %).
- Nessuna migrazione: `pesi.lettura` è già facoltativa per ogni tipo.
- Formati: a con 2 decimali, b con 4, R² con 3, h con 1; virgola decimale, segno meno `−` (U+2212).
- Testi dell'interfaccia in italiano, nello stile dei file vicini.

## Review Focus

1. Tensiometro che scrive letture negative (−23,7): stessa curva delle letture positive. → test nel Task 2.
2. Sessione vecchia con il peso CC senza lettura: si apre, la curva usa la sola asciugatura, il riepilogo dice "manca la
   lettura" e la pesata della CC riparte da quel vaso. → test nei Task 1 e 2.
3. Vaso con meno di 3 h distinte o con l'adattamento che non converge: nessuna curva per quel vaso, la media usa gli
   altri, la tabella mostra "—". → test nel Task 2.
4. Substrato senza nessuna curva: grafico con i soli punti, nessuna riga media, nessun crash. → test nei Task 2 e 3.
5. Curve che salgono all'infinito vicino a h = 0: il disegno resta dentro l'area del grafico. → test nel Task 3.

---

### Task 1: La lettura alla capacità di campo

**Files:**
- Modify: `src/domain/pesatura/sequenza.ts`
- Modify: `src/pages/pesatura/Pesata.tsx` (righe ~131, 255–289, 327)
- Modify: `src/pages/pesatura/usePesataSequenziale.ts:31`
- Modify: `src/pages/pesatura/Sessione.tsx:183`
- Modify: `src/components/pesatura/RiepilogoSessione.tsx:~81-84`
- Test: `src/domain/pesatura/sequenza.test.ts`, `src/pages/pesatura/Pesata.test.tsx`, `src/pages/pesatura/Sessione.test.tsx`

**Interfaces:**
- Produces:
  - `chiedeLettura(tipo: TipoAnalisi, fase: FasePesata): boolean` — true solo per `vasi` con `capacita_campo` o `asciugatura`.
  - `pesoCompleto(peso: Peso | null, tipo: TipoAnalisi, fase: FasePesata): boolean` — peso presente e, se la fase chiede la lettura, `lettura !== null`.
  - `primoPassoMancante(passi: Passo[], completo?: (p: Peso | null) => boolean): number` (default `p => p !== null`).
  - `avanzamentoFase(passi: Passo[], completo?: (p: Peso | null) => boolean): Avanzamento` (stesso default).
  - `statoSessione` e `faseDaAprire` usano `pesoCompleto` per le fasi con un peso per campione.

- [ ] **Step 1: Test di dominio** in `sequenza.test.ts`:
  - `chiedeLettura('vasi','capacita_campo')` true, `('vasi','asciugatura')` true, `('vasi','secco')` false, `('rwc','secco')` false.
  - Vaso con secco e CC **senza lettura** e un'asciugatura: `statoSessione(...) === 'mancano'`; `faseDaAprire(...) === 'capacita_campo'`.
  - Stesso vaso con CC con lettura 21.8: `faseDaAprire(...) === 'asciugatura'`, `statoSessione(...) === 'completa'`.
  - `primoPassoMancante` dei passi CC con `completo = p => pesoCompleto(p,'vasi','capacita_campo')` punta al vaso senza lettura.
- [ ] **Step 2:** `npx vitest run src/domain/pesatura/sequenza.test.ts` → FAIL (funzioni assenti).
- [ ] **Step 3:** Implementa in `sequenza.ts`.
- [ ] **Step 4:** Test di pagina in `Pesata.test.tsx`, sul modello di "asciugatura: peso e lettura del sensore, entrambi obbligatori":
  - "capacità di campo dei vasi: peso e lettura obbligatori" — senza lettura appare "Scrivi la lettura del sensore." e non salva; con lettura il salvataggio riceve `lettura`.
  - "capacità di campo: «peso 2600 tensione 21 virgola 8 avanti» salva peso e lettura".
  - "secco dei vasi: nessun campo lettura".
  - "capacità di campo: un peso senza lettura riapre su quel vaso" (partenza = primo passo non completo).
- [ ] **Step 5:** In `Pesata.tsx` sostituisci gli usi di `eAsciugatura` che riguardano la lettura con `const conLettura = chiedeLettura(sessione.tipo, fase)` (campo, problema obbligatorio, `comandoDetto`, `leggiComando(testo, conLettura)`, `giro.salva(valore, conLettura ? lettura : null)`); `eAsciugatura` resta solo per `controllaAsciugatura`. In `usePesataSequenziale` e in `Sessione.tsx:183` passa `completo = p => pesoCompleto(p, sessione.tipo, fase)`.
- [ ] **Step 6:** `RiepilogoSessione`: il testo della CC diventa `"<peso> · <lettura> <unità>"` oppure `"<peso> · manca la lettura"` se il peso c'è e la lettura no. Test in `Sessione.test.tsx`: compare "manca la lettura".
- [ ] **Step 7:** `npx vitest run src/domain/pesatura src/pages/pesatura` → PASS. `npx tsc -b` → nessun errore.
- [ ] **Step 8: Commit** `feat(vasi): la capacità di campo chiede la lettura dello strumento`

### Task 2: Legge di potenza, curva media e parametri

**Files:**
- Modify: `src/domain/pesatura/curva.ts`
- Test: `src/domain/pesatura/curva.test.ts`

**Interfaces:**
- Consumes: niente dal Task 1 (legge `Peso.lettura` del peso `capacita_campo`).
- Produces:
  - `type ModelloCurva = 'lineare' | 'potenza'`; `modelloPer(s)` → `'potenza'` per `tensione`, `'lineare'` altrimenti. `'logaritmico'` sparisce.
  - `Vaso` acquista `letturaCC: number | null`.
  - `Curva` invariata nella forma; per `potenza` `min`/`max` sono su |h|.
  - `adattaCurva(punti: PuntoCurva[], modello: ModelloCurva): Curva | null`.
  - `pccDaLettura(c: Curva, lettura: number): number` — potenza: `a · |lettura|^b`.
  - `letturaAPercentuale(c: Curva, pcc: number): number | null` — potenza `(pcc/a)^(1/b)` (null se `pcc/a <= 0` o `b === 0`); lineare `(pcc − a)/b` (null se `b === 0`).
  - `mediaDeiParametri(curve: Curva[]): Curva | null` — null se vuoto; a, b medi; r2 media dei non-null (null se nessuno); n somma; min/max estremi.
  - `interface CurveSubstrato { substrato: string; vasi: Vaso[]; curve: (Curva | null)[]; media: Curva | null }` (`curve[i]` è del vaso `vasi[i]`).
  - `curvePerSubstrato(vasi, modello)`: `curve` = adattamento di ogni vaso; `media` = `mediaDeiParametri` per potenza, adattamento su tutti i punti per lineare.
  - `interface RigaParametri { nome: string; a: number | null; b: number | null; r2: number | null; n: number; letturaCCCurva: number | null; letturaCCMisurata: number | null; media: boolean }`
  - `parametriDelSubstrato(g: CurveSubstrato): RigaParametri[]` — una riga per vaso (nome = `campione.nome` o id), poi "Curva media" (`media: true`, `letturaCCMisurata: null`, n = somma).
  - `consultaPerLettura(gruppi: CurveSubstrato[], lettura: number): RispostaConsulta[]` — perde il parametro `modello`; usa `g.curve[i] ?? g.media`; `fuoriCampo` confronta |lettura| per potenza.
  - `equazione(c, sensore)`: potenza → `WC = 649,17 · h^−0,6033  (h in hPa; R² 0,966, n 5)`; senza unità `(R² 0,966, n 5)`; lineare invariata.

- [ ] **Step 1: Test** (valori da `scipy.optimize.curve_fit`; confronto relativo `expect(valore / atteso).toBeCloseTo(1, 4)`):
  - Vaso A: h `[23.7, 23.9, 26.7, 42.9, 61.2]`, WC `[100, 93.2, 86.5, 71.1, 51.9]` → a 649.1709, b −0.603303, R² 0.966057.
  - Vaso B: h `[9.9, 15.5, 19.8, 30.7, 32.9, 64.3]`, WC `[100, 92.7, 86.3, 76.3, 73.6, 55.5]` → a 202.2677, b −0.293121, R² 0.966054.
  - Vaso A con le h negate → stessi a, b, R².
  - `letturaAPercentuale(A, 100)` ≈ 22.2085; `(B, 100)` ≈ 11.0583.
  - `curvePerSubstrato([A, B], 'potenza').media`: a 425.7193, b −0.448212, R² 0.966055; `letturaAPercentuale(media, 100)` ≈ 25.3297; `pccDaLettura(media, 40)` ≈ 81.4819.
  - `vasiDaPesi`: CC con lettura 23.7 → primo punto `{ lettura: 23.7, pcc: 100 }`, `letturaCC` 23.7; CC senza lettura → nessun punto a 100, `letturaCC` null.
  - Vaso con 2 h distinte → `curve[i] === null`; la media usa gli altri; substrato senza curve → `media === null`.
  - `parametriDelSubstrato`: 2 righe vaso + 1 "Curva media"; `letturaCCMisurata` del vaso A = 23.7.
  - `equazione` potenza con unità `hPa`: stringa esatta `WC = 649,17 · h^−0,6033  (h in hPa; R² 0,966, n 5)`.
  - `consultaPerLettura` con lettura −40 su un tensiometro usa |h| e non è fuori campo per A.
  - Aggiorna i test esistenti che usano `'logaritmico'` o `consultaPerLettura(..., modello)`.
- [ ] **Step 2:** `npx vitest run src/domain/pesatura/curva.test.ts` → FAIL.
- [ ] **Step 3: Implementa.** Adattamento a potenza:
  ```
  x = |lettura|, y = pcc, solo punti finiti con x > 0; servono ≥ 3 x distinte
  partenza: regressione lineare di ln y su ln x sui punti con y > 0 (≥ 2 x distinte, altrimenti null) → a0 = e^intercetta, b0 = pendenza
  Levenberg–Marquardt su (a, b): r_i = y_i − a·x_i^b; J_i = [x_i^b, a·x_i^b·ln x_i]
    λ = 1e-3; ripeti al massimo 200 volte:
      risolvi (JᵀJ + λ·diag(JᵀJ)) δ = Jᵀr (2×2, Cramer)
      se SS(a+δa, b+δb) < SS: accetta, λ /= 10; se la diminuzione relativa di SS < 1e-12 fermati
      altrimenti λ *= 10
  a, b o SS non finiti → null
  ```
- [ ] **Step 4:** `npx vitest run src/domain/pesatura/curva.test.ts` → PASS.
- [ ] **Step 5:** `npx tsc -b` segnalerà gli usi di `consultaPerLettura`/`modelloPer` in `ConsultaCurva.tsx`: aggiorna la chiamata (togli `modello`). `npx vitest run src/components/pesatura/ConsultaCurva.test.tsx` → PASS.
- [ ] **Step 6: Commit** `feat(vasi): curva a legge di potenza con media dei parametri`

### Task 3: Il grafico come la Figura 5

**Files:**
- Modify: `src/components/pesatura/GraficoCurve.tsx`
- Test: `src/components/pesatura/GraficoCurve.test.tsx`

**Interfaces:**
- Consumes: `CurveSubstrato` (con `curve`), `pccDaLettura`, `modelloPer` dal Task 2.
- Produces: `GraficoCurve({ gruppo: CurveSubstrato; sensore: Sensore; perImmagine?: boolean; titolo?: string; fontIncorporato?: string | null })` — un substrato per grafico (prima era `gruppi`).

- [ ] **Step 1: Test** (riscrivi i casi esistenti sul nuovo prop):
  - Asse y "% della capacità di campo", asse x `nomeLettura(sensore)`; la prima tacca x è 0 per il tensiometro.
  - Un `path[data-curva-vaso]` per ogni vaso con curva, nessuno per il vaso senza; un `path[data-media]`.
  - Colore e marcatore per vaso: vaso i usa `COLORI_SERIE[i]` e `MARCATORI[i]`; la media usa `COLORI_GRAFICO.grafite`, `stroke-width` 3.
  - Le curve stanno dentro un `clipPath` dell'area del grafico (`clip-path` sul gruppo delle curve).
  - Punti con lettura negativa disegnati a |h| (x positiva).
  - Legenda: "Vaso A", "Vaso B", "Curva media (R² 0,966)"; senza media nessuna voce media.
  - Substrato senza curve: punti presenti, nessuna curva, nessun errore.
- [ ] **Step 2:** `npx vitest run src/components/pesatura/GraficoCurve.test.tsx` → FAIL.
- [ ] **Step 3: Implementa.** Asse x (potenza) `tacche(0, max |h|, 6)`, (lineare) come oggi; asse y `tacche(0, max(100, …pcc), 6)`. Ogni curva campionata con 96 punti da `asseX.max/200` (potenza) o `asseX.min` (lineare) fino a `asseX.max`, saltando i non finiti; tagliata dal `clipPath`. Linee sottili `strokeWidth 1.5`, opacità 0.7; punti sopra le linee.
- [ ] **Step 4:** test → PASS.
- [ ] **Step 5: Commit** `feat(vasi): grafico delle curve per substrato come la Figura 5`

### Task 4: Pagina della sessione

**Files:**
- Create: `src/components/pesatura/TabellaParametri.tsx`
- Modify: `src/pages/pesatura/Sessione.tsx:152-154, 207-224`
- Modify: `src/components/pesatura/scaricaPesatura.ts` (solo `scaricaGraficoPng`)
- Test: `src/components/pesatura/TabellaParametri.test.tsx`, `src/pages/pesatura/Sessione.test.tsx`, `src/components/pesatura/scaricaPesatura.test.ts`

**Interfaces:**
- Consumes: `parametriDelSubstrato`, `equazione` (Task 2), `GraficoCurve` (Task 3).
- Produces:
  - `TabellaParametri({ gruppo: CurveSubstrato; sensore: Sensore })`.
  - `scaricaGraficoPng({ gruppo: CurveSubstrato; sensore: Sensore; titolo: string; oggi?: string }): Promise<string>` — file `Pesatura_<titolo>_curve_<substrato>_<oggi>.png` (nomi con `nomeSicuro`).

- [ ] **Step 1: Test** `TabellaParametri`: intestazioni `Vaso`, `a`, `b`, `R²`, `h a CC, curva (hPa)`, `h a CC, misurato (hPa)`, `n` (con sensore di umidità `Lettura a CC, …`); riga A `649,17 | −0,6033 | 0,966 | 22,2 | 23,7 | 5`; riga "Curva media" in grassetto con "—" in misurato; valori null → "—".
- [ ] **Step 2:** `npx vitest run src/components/pesatura/TabellaParametri.test.tsx` → FAIL.
- [ ] **Step 3:** Implementa `TabellaParametri` con lo stile della tabella "Pesi a % CC fisse" di `ConsultaCurva` (`<caption className="sr-only">`, `font-mono tabular-nums`).
- [ ] **Step 4:** `Sessione.tsx`: sotto "Curve dei vasi", per ogni gruppo una `<section>` con titolo del substrato, `GraficoCurve gruppo={g}`, equazione della media (o "servono almeno 3 letture diverse per la curva"), `TabellaParametri`, bottone "Scarica grafico (PNG)" che chiama `scaricaGraficoPng({ gruppo: g, … })`. `ConsultaCurva` resta sotto, una volta. Test in `Sessione.test.tsx`: due substrati → due grafici e due tabelle.
- [ ] **Step 5:** `npx vitest run src/components/pesatura src/pages/pesatura` → PASS.
- [ ] **Step 6: Commit** `feat(vasi): grafico, equazione e tabella dei parametri per substrato`

### Task 5: Excel

**Files:**
- Modify: `src/domain/pesatura/export.ts`
- Modify: `src/components/pesatura/scaricaPesatura.ts` (`scaricaPesatura`, `disegna`, `pngDelleCurve`)
- Test: `src/domain/pesatura/export.test.ts`, `src/components/pesatura/scaricaPesatura.test.ts`

**Interfaces:**
- Consumes: `parametriDelSubstrato`, `equazione`, `CurveSubstrato` (Task 2); `GraficoCurve` (Task 3).
- Produces: `idGraficoCurve(indice: number): string` → `` `curve-${indice}` `` (sostituisce `ID_GRAFICO_CURVE`).

- [ ] **Step 1: Test** `export.test.ts`:
  - Ordine dei fogli dei vasi: `Punti`, `Parametri`, `Pesi target`, `Grafico`, `Info`.
  - `Punti` ha la colonna `Fase` dopo `Data e ora`; il peso CC con lettura dà una riga `Capacità di campo` con `% CC` 100; l'asciugatura `Asciugatura`.
  - `Parametri`: colonne `Substrato`, `Vaso`, `a`, `b`, `R²`, `h a CC, curva`, `h a CC, misurato`, `n`; valori arrotondati come nella tabella dell'app (a 2, b 4, R² 3, h 1 decimale); riga `Curva media` per substrato.
  - `Grafico`: un `GraficoDaDisegnare` per substrato con `parametroId` `curve-0`, `curve-1`, titolo `Curve di ritenzione — <substrato>`, righe distanziate di `RIGHE_IMMAGINE + 1`.
  - `Info`: equazione della curva media in forma potenza.
- [ ] **Step 2:** `npx vitest run src/domain/pesatura/export.test.ts` → FAIL.
- [ ] **Step 3:** Implementa in `export.ts`.
- [ ] **Step 4:** `scaricaPesatura`: un PNG per ogni `cartella.grafici[i]` dal gruppo `i`, messo in `immagini` con `idGraficoCurve(i)`. Test: con due substrati `graficiNelFile === 2`.
- [ ] **Step 5:** `npm test` → tutto PASS; `npx tsc -b` e `npm run lint` puliti.
- [ ] **Step 6: Commit** `feat(vasi): Excel con parametri e un grafico per substrato`
