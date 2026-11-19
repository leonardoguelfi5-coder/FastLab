# Taratura gravimetrica del TDR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella sessione Vasi il sensore "Umidità" diventa "TDR": retta %CC = m · TDR + q per vaso, retta media come
media delle rette, e le soglie (TDR target, peso target, deficit in mL) per 100/80/60/50/40 % CC e per la % scritta.

**Architecture:** Il calcolo resta puro in `src/domain/pesatura/curva.ts` (modello `'lineare'` già esistente). Il tipo
di sensore `umidita` diventa `tdr` nel dominio; le impostazioni salvate con `umidita` si convertono quando si leggono.
Le soglie sono una funzione di dominio usata da pagina ed Excel.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, exceljs tramite `scriviCartella`.

**Spec:** `docs/superpowers/specs/2026-11-19-taratura-tdr-design.md`

## Global Constraints

- `TipoSensore = 'tdr' | 'tensione'`; nel menu solo "TDR" (unità predefinita `raw`) e "Tensione". Impostazioni salvate con `tipo: 'umidita'` → lette come `tdr`, unità invariata. Nessuna migrazione.
- TDR: modello `'lineare'`, %CC = m · TDR + q con OLS; nel dominio `Curva.a` = q (intercetta), `Curva.b` = m (pendenza). Punto a CC al 100 %.
- Retta media del substrato (lineare): m medio, q medio (aritmetici), R² medio, n sommato. La media geometrica di a resta solo per la potenza.
- Soglie (solo TDR): TDR target = (% − q)/m sulla retta media; peso target del vaso = secco + %/100 · (CC − secco); deficit = CC − peso target; deficit in mL = grammi (`inGrammi`), altrimenti nell'unità della sessione.
- Righe delle soglie: `PERCENTUALI_TABELLA` = 100, 80, 60, 50, 40.
- Dettatura: "peso <n> lettura <n> avanti" per tutti i sensori, oltre a "tensione".
- Tensiometro invariato: nessuna soglia per la tensione.
- m e q con 4 cifre significative (`formattaCifre`/`arrotondaCifre` di `src/lib/numeri.ts`), R² con 3 decimali, virgola decimale, segno `−` (U+2212).
- Testi in italiano nello stile dei file vicini.

## Review Focus

1. Sessione vecchia salvata con `umidita`: si apre, il sensore si chiama "TDR (%)", la retta e le soglie funzionano. → test nel Task 1.
2. Retta media con pendenza 0 (letture tutte uguali in un vaso → nessuna retta; m medio ≈ 0): TDR target "—", mai Infinity. → test nel Task 2.
3. Unità della sessione non convertibile in grammi (es. "lb"): il deficit resta nell'unità della sessione, senza scrivere "mL". → test nel Task 2.
4. Substrato con un solo vaso: la retta media è quella del vaso. → test nel Task 2.
5. Pendenza negativa (TDR che scende quando l'acqua sale): TDR target calcolato lo stesso, nessun valore assurdo nascosto. → test nel Task 2.

---

### Task 1: Il sensore TDR al posto di Umidità

**Files:**
- Modify: `src/domain/pesatura/tipi.ts:10`, `src/domain/pesatura/modulo.ts:32-35,45-49,67-68`
- Modify: `src/api/pesatura.ts:22` (`conPredefinite`)
- Modify: `src/domain/pesatura/export.ts:35,247-250` (`SENSORE_NEUTRO`, `nomeLettura`)
- Modify: `src/pages/pesatura/Pesata.tsx:258-262` (nome della lettura e frase della dettatura)
- Modify: `src/domain/pesatura/voce.ts:157`
- Test: `src/domain/pesatura/modulo.test.ts`, `src/api/pesatura` test esistente o `src/api/mappers.test.ts` (dove si testa la lettura delle sessioni), `src/domain/pesatura/voce.test.ts`, `src/pages/pesatura/Pesata.test.tsx`, `src/pages/pesatura/NuovaSessione.test.tsx`

**Interfaces:**
- Produces: `TipoSensore = 'tdr' | 'tensione'`; `normalizzaSensore(s: { tipo: string; unita: string } | null): Sensore | null` in `tipi.ts` (`'umidita'` → `'tdr'`); `nomeLettura(s)` → `TDR (raw)` / `Tensione (hPa)`; `Pesata.tsx` usa `nomeLettura` invece della sua copia.

- [ ] **Step 1: Test**
  - `normalizzaSensore({ tipo: 'umidita', unita: '%' })` → `{ tipo: 'tdr', unita: '%' }`; `tensione` invariato; `null` → `null`.
  - La sessione letta da una riga con `impostazioni.sensore = { tipo: 'umidita', unita: '%' }` ha `sensore.tipo === 'tdr'`.
  - `SENSORI` = TDR (`raw`), Tensione (`kPa`); `bozzaVuota(...).sensore === 'tdr'` con `unitaSensore 'raw'`; `bozzaDa` di una sessione `umidita` dà `'tdr'`.
  - `nomeLettura({ tipo: 'tdr', unita: 'raw' }) === 'TDR (raw)'`.
  - `leggiComando('peso 150 lettura 35 avanti', true)` → `{ tipo: 'avanti', valore: 150, lettura: 35 }`; `'peso 150 tensione 35 avanti'` resta valido; `'peso 150 umidità 35 avanti'` non è più un nome di lettura (non capito).
  - Pagina Pesata, asciugatura con TDR: il campo si chiama "TDR (raw)" e il suggerimento dice «peso 150 lettura 35 avanti»; NuovaSessione propone TDR e Tensione.
- [ ] **Step 2:** `npx vitest run src/domain/pesatura src/api src/pages/pesatura` → FAIL sui nuovi test.
- [ ] **Step 3:** Implementa. `conPredefinite` applica `normalizzaSensore` a `impostazioni.sensore`.
- [ ] **Step 4:** test → PASS; `npx tsc -b` pulito (ogni `'umidita'` rimasto nel codice è un errore di tipo da sistemare).
- [ ] **Step 5: Commit** `feat(vasi): il sensore TDR prende il posto di Umidità`

### Task 2: Retta media e soglie del TDR

**Files:**
- Modify: `src/domain/pesatura/curva.ts` (`mediaDeiParametri`, `curvePerSubstrato`, `equazione`, `intestazioniLetturaCC`, nuove funzioni delle soglie)
- Test: `src/domain/pesatura/curva.test.ts`

**Interfaces:**
- Consumes: `TipoSensore` del Task 1.
- Produces:
  - `curvePerSubstrato(vasi, 'lineare')`: `media = mediaDeiParametri(curve non null)`, con a aritmetico per `'lineare'` e geometrico per `'potenza'`.
  - `equazione` lineare: `%CC = 2,178 · TDR − 17,31  (R² 0,999, n 5)` — m e q a 4 cifre significative, R² 3 decimali; la variabile è `TDR` per il sensore `tdr`.
  - `intestazioniLetturaCC(sensore)` per il TDR: `TDR a CC, retta (raw)` / `TDR a CC, misurata (raw)`.
  - `interface SogliaVaso { vaso: string; pesoTarget: number | null; deficit: number | null }`
  - `interface Soglia { pcc: number; letturaTarget: number | null; vasi: SogliaVaso[]; pesoMedio: number | null; deficitMedio: number | null }`
  - `sogliaDelSubstrato(g: CurveSubstrato, pcc: number): Soglia` — `letturaTarget` dalla retta media (`letturaAPercentuale`, null se la media manca o m = 0 o non finito); peso e deficit per vaso da secco e CC propri; medie sui vasi che li hanno.
  - `deficitInMl(deficit: number, unita: UnitaPeso): { valore: number; unita: string }` — `inGrammi` → `mL`, altrimenti valore e unità della sessione.

- [ ] **Step 1: Test** (valori da `numpy.polyfit`):
  - Vaso T1, secco 750, CC 4850 con lettura 54; asciugatura (peso, TDR): (4030, 44.8), (3210, 35.2), (2390, 26.0), (1570, 17.5) → m 2.177729, q −17.309389, R² 0.999578.
  - `sogliaDelSubstrato` di T1 solo: a 60 % → `letturaTarget` 35.5, `pesoTarget` 3210, `deficit` 1640; a 100 % → 53.8678 e deficit 0; a 50 % → 30.9081, peso 2800, deficit 2050.
  - Vaso T2, secco 1000, CC 2000 con lettura 50; asciugatura (1750, 40), (1520, 30), (1300, 20) → m 2.33, q −17.3. Media T1+T2: m 2.253865, q −17.304695, R² 0.999366; `letturaTarget` a 60 % 34.2987; `pesoMedio` a 60 % (3210 + 1600)/2 = 2405; `deficitMedio` (1640 + 400)/2 = 1020.
  - Un vaso con letture tutte uguali non ha retta; substrato con solo quel vaso → `letturaTarget` null.
  - Pendenza negativa: retta con m < 0 → `letturaTarget` finito e corretto.
  - `deficitInMl(1640, 'g')` → `{ 1640, 'mL' }`; `(1.64, 'kg')` → `{ 1640, 'mL' }`; `(3.6, 'lb')` → `{ 3.6, 'lb' }`.
  - `equazione` di T1 con sensore TDR raw: `%CC = 2,178 · TDR − 17,31  (R² 1,000, n 5)` (R² 0,999578 a 3 decimali = 1,000).
  - La potenza resta con a geometrico (i test esistenti della media potenza passano invariati).
- [ ] **Step 2:** `npx vitest run src/domain/pesatura/curva.test.ts` → FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** test → PASS; `npx tsc -b` pulito.
- [ ] **Step 5: Commit** `feat(vasi): retta media e soglie del TDR`

### Task 3: Pagina ed Excel

**Files:**
- Modify: `src/components/pesatura/TabellaParametri.tsx`, `src/components/pesatura/ConsultaCurva.tsx`, `src/components/pesatura/GraficoCurve.tsx` (asse x del TDR)
- Modify: `src/domain/pesatura/export.ts` (foglio Parametri per il TDR, nuovo foglio Soglie)
- Test: `src/components/pesatura/TabellaParametri.test.tsx`, `src/components/pesatura/ConsultaCurva.test.tsx`, `src/components/pesatura/GraficoCurve.test.tsx`, `src/domain/pesatura/export.test.ts`

**Interfaces:**
- Consumes: `sogliaDelSubstrato`, `deficitInMl`, `PERCENTUALI_TABELLA`, `intestazioniLetturaCC`, `equazione` (Task 2).

- [ ] **Step 1: Test**
  - `TabellaParametri` con TDR: colonne `Vaso, m, q, R², TDR a CC, retta (raw), TDR a CC, misurata (raw), n`; m e q a 4 cifre significative (riga T1: `2,178 | −17,31 | 1,000`). Tensiometro invariato (a, b).
  - `ConsultaCurva` con TDR: nella tabella "Pesi a % CC fisse" ogni substrato ha le righe "TDR target" (60 % di T1: `35,50`) e "Deficit medio (mL)" (`1640`); con "% di capacità di campo" = 60 la risposta mostra "TDR target 35,50" e "Deficit medio 1640 mL". Con il tensiometro queste righe non ci sono.
  - `GraficoCurve` con TDR e letture positive: la prima tacca x è 0.
  - Excel con TDR: foglio `Soglie` dopo `Pesi target`, colonne `Substrato, % CC, TDR target, Peso medio, Deficit medio (mL)`, una riga per substrato e %; foglio `Parametri` con m e q. Con il tensiometro niente foglio Soglie.
- [ ] **Step 2:** `npx vitest run src/components/pesatura src/domain/pesatura/export.test.ts` → FAIL.
- [ ] **Step 3:** Implementa. Il TDR target si scrive con le cifre decimali delle letture misurate +1 (minimo 1), il deficit con i decimali dei pesi.
- [ ] **Step 4:** `npx vitest run src/domain/pesatura src/components/pesatura src/pages/pesatura` → PASS; `npx tsc -b` e `npx eslint src/domain/pesatura src/components/pesatura src/pages/pesatura` puliti.
- [ ] **Step 5: Commit** `feat(vasi): soglie del TDR nella pagina e nell'Excel`
