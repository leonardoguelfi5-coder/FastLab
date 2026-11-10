# FastLab v3, Piano D: Dataset ed Esporta Excel (piano di implementazione)

> **Per gli agenti esecutori:** stesso metodo dei Piani A, B e C. Un implementatore alla volta nel checkout; i revisori lavorano in sola lettura su una copia `git archive` del commit; registro `docs/superpowers/plans/2026-11-02-piano-D-registro-lavoro.md`; commit per percorsi (`git commit -- <file>`); TDD (prima il test rosso, poi il codice). I passi usano checkbox (`- [ ]`).

**Obiettivo:** le ultime due icone della home diventano sezioni vere:
- 📊 **Dataset:** grafici filtrabili (strumento, parametro, trattamenti, fattore, periodo, piante), con la media per trattamento nel tempo ± errore standard, i segni delle note del Diario e la tabella "Mostra i valori" con esattamente i dati del grafico;
- ⬇️ **Esporta Excel:** quattro scelte (Cosa, Quali piante, Periodo, Come), il riepilogo dei fogli e delle righe, "Scarica Excel" con i grafici come immagini, e gli export salvati per esperimento e per utente;
- "Scarica questa vista" porta da Dataset a Esporta già compilato.

Con questo piano la libreria `xlsx` (SheetJS community 0.18.5) esce dal progetto.

**Spec:** `docs/superpowers/specs/2026-10-29-fastlab-v3-home-strumenti-design.md`:
- §5.5 (Dataset), §5.6 (Esporta Excel), §6.1, §6.2 (librerie lasciate al builder), §6.3 (parametri non numerici in Dataset; più misure nello stesso giorno con colonna `N_…`), §7 punti 4 e 5;
- mockup `docs/superpowers/specs/2026-10-29-fastlab-v3-esporta-mockup.html` (struttura, non stile).

Dalla spec precedente `2026-10-28-fastlab-v3-esperimenti-design.md` valgono:
- §5.7: l'unità statistica è la pianta, prima la media giornaliera di ogni pianta, poi media ed errore standard tra le piante del trattamento;
- §5.8: fogli "Dati" (con `N_<parametro>`), "Misure", un foglio per ogni lista, "Grafici" come immagini, "Info"; testo e sì/no prendono l'ultima misura del giorno;
- §5.3: ogni fattore ha la sua colonna nell'export.

Stile: `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`. Decisioni da non rompere: le righe `Ruling:` dei registri dei Piani 1, A, B e C.

**Fuori da questo piano:**
- grafici Excel nativi e modificabili (non-obiettivo della spec precedente);
- analisi statistica (test, ANOVA);
- l'Excel dentro lo .zip delle foto del Piano C (vedi "Dubbi per l'utente");
- la paginazione della RPC `ultime_misure_piante` (rimandata dal Piano B, resta rimandata).

## Vincoli globali

Valgono tutti quelli dei Piani 1, A, B e C:
- italiano, **mai trattini lunghi** (né lungo né medio, U+2014 e U+2013) nei testi, nei commenti e nei messaggi;
- nessun merge su `main`, nessun push senza richiesta;
- migration nuove dopo `20261101000013`, mai riscrivere quelle esistenti;
- id generati dal client con `nuovoId()` e upsert per id;
- `controllaRighe` sugli update e sui delete;
- RLS su ogni tabella nuova, niente per `anon`, `creato_da` non aggiornabile, guardia `ESPERIMENTO_NON_MODIFICABILE`;
- conferme prima di scartare, eliminazione con "Annulla" per 5 s (`src/lib/eliminaConAnnulla.ts`);
- nessun dato perso in silenzio: un grafico che non si disegna, un'immagine che manca o un file che non parte si dicono a parole.

Stile `DESIGN.md`:
- righe da quaderno, niente card né ombre;
- **Geist Mono** con cifre tabellari per numeri, date, ore, etichette delle piante;
- **un solo inchiostro**, al massimo il **10%** della schermata (pulsante principale, selezione, focus);
- **verde solo per "salvato"** (il toast di "Salva questa scelta"), mai per una pianta, un trattamento o una serie;
- bersagli di almeno **44 px**;
- mai solo colore: ogni serie ha anche marcatore ed etichetta.

Statistica (spec precedente e `src/domain/statistiche.ts`, già verificato):
- `valoreNumerico` dà, per un parametro `numero`, la media delle letture non nulle (anche con `n_letture` > 1); per una `lista`, il numero di elementi; per testo e sì/no, `null`;
- `valoriGiornalieri` fa poi la media delle misure dello stesso giorno della pianta (media delle medie per misura);
- solo dopo si fanno media, errore standard (deviazione standard campionaria n−1 diviso √n) e n tra le piante.

Verifiche a fine di ogni task:
- `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`;
- con modifiche al database, `scripts/db-senza-docker/test-db.sh` (PostgreSQL 16 emulato senza Docker; il cluster si avvia con `pg_ctlcluster 16 main start`). Come da Ruling del Piano A, va confermato anche in locale con `npx supabase db reset` + `npm run test:db` quando possibile.

## Decisioni del piano (da verificare con l'utente)

1. **Grafici: SVG scritto a mano, nessuna libreria.**
   - Il grafico è sempre lo stesso: poche linee, punti, barre d'errore, segni verticali delle note, due assi. Un SVG proprio pesa pochi kB, segue `DESIGN.md` senza combattere gli stili di una libreria, funziona al tocco e si ridimensiona con un `ResizeObserver`.
   - La geometria (scale, tacche, percorsi, barre, segni) è una **funzione pura** in `src/domain/grafico.ts`, testata senza DOM. Un solo componente di sola presentazione, `GraficoSvg`, la disegna sia nell'app sia per l'immagine dell'Excel: lo stesso disegno serve a entrambi, come chiede la spec precedente (§6.2).
   - L'immagine si ottiene così: `renderToStaticMarkup(<GraficoSvg perImmagine …/>)` (da `react-dom/server`, caricato solo nel chunk dell'export), poi SVG → `Image` → `canvas` (2×) → PNG.
   - Scartati:
     - **Recharts:** circa 100 kB gzip con le sue dipendenze d3; disegna in SVG ma va estratto dal DOM per farne un PNG, e piegarlo allo stile da quaderno costa più che scriverlo;
     - **uPlot:** leggero (circa 20 kB gzip) e veloce, ma disegna su canvas con uno stile suo; barre d'errore e segni delle note vanno fatti come plugin, e il disegno dell'app non sarebbe lo stesso dell'immagine.
2. **Colori dei dati.** Otto trattamenti (Hydrochar ne ha 8) non si leggono con un solo inchiostro. Si introduce una **tavolozza dei dati**, solo dentro i grafici e la loro legenda:
   - senza verde (regola del verde negato) e senza il blu notte dell'inchiostro (che resta per selezione e focus);
   - otto colori in ordine fisso, validati con lo script della skill dataviz (`validate_palette.js`, tema chiaro, superficie carta `#fbf9f4`): fascia di luminosità, croma minima, separazione per daltonici tra vicini (ΔE peggiore 11,1), visione normale (ΔE peggiore 22,0), contrasto ≥ 3:1. **Tutti i controlli passano**:

     | Posto | Colore | Esadecimale |
     |---|---|---|
     | 1 | petrolio | `#0e8ca0` |
     | 2 | arancio | `#d9622b` |
     | 3 | viola | `#6a4fc8` |
     | 4 | ocra | `#b8860b` |
     | 5 | magenta | `#c2457e` |
     | 6 | azzurro | `#2a8fc4` |
     | 7 | rosso | `#d03b3b` |
     | 8 | lilla | `#9a6fd8` |

   - **il colore segue il trattamento, non la sua posizione nel filtro:** il posto è l'indice del trattamento nell'ordine della configurazione. Togliendo un trattamento dal filtro gli altri non cambiano colore. Dal nono trattamento in poi niente colore generato: linea grafite tenue tratteggiata, con il suo marcatore e la sua etichetta;
   - **mai solo colore:** ogni serie ha un marcatore diverso (cerchio, quadrato, triangolo, rombo, triangolo in giù, croce, x, pentagono) e la legenda c'è sempre con due o più serie;
   - i testi del grafico (tacche, etichette, legenda) restano in grafite e grafite tenue, mai nel colore della serie;
   - nessun colore di stato (errore, attenzione, registrato) dentro i grafici;
   - `DESIGN.md` riceve una sezione "Colori dei dati" con questa tabella e queste regole (Task D4).
3. **Excel con immagini: `exceljs` 4.4.0, caricato con un import dinamico in un chunk separato.**
   - Sa scrivere date vere, formati numerici, intestazioni bloccate, filtri automatici e immagini PNG ancorate alle celle; è la libreria più usata per scrivere `.xlsx` nel browser.
   - Pesa (circa 250 kB gzip): per questo vive solo nel chunk dell'export, caricato al tocco di "Scarica Excel" (come `fflate` nel Piano C). Un solo modulo la importa: `src/lib/excel/scriviXlsx.ts`, che riceve una descrizione pura della cartella. Se un giorno il peso diventasse un problema, si sostituisce solo quel modulo (per esempio con un piccolo scrittore OOXML su `fflate`, che è già nel progetto).
   - `xlsx` 0.18.5 si rimuove (non inserisce immagini, non è più aggiornata su npm e non è usata da nessun file di `src`).
4. **Lettura di tutte le misure: per strumento, a pagine "keyset" per id, senza RPC né vista.**
   - Stima: 200 piante × 30 date × 3 strumenti ≈ 18 000 misure, circa 200 byte ciascuna in JSON: circa 4 MB in 18 pagine da 1000. Per Hydrochar (56 piante) meno di 2 MB. Si regge sul telefono, ma conviene non leggere tutto ogni volta.
   - Dataset mostra uno strumento alla volta: si leggono le misure di **quello strumento** (`esperimento_id = X and strumento_id = Y`), in tutto il periodo; periodo e piante si filtrano sul client, così cambiare un filtro non rilegge nulla. Esporta usa le stesse query, una per strumento scelto: la cache è condivisa.
   - Pagine con `order by id` e `id > <ultimo id ricevuto>`, 1000 righe, fino alla **prima pagina vuota** (il server può dare meno righe di quelle chieste, `max_rows`: una pagina corta non vuol dire fine, come nel Ruling di `listaNote`). A differenza dell'offset, un inserimento o un'eliminazione concorrente non fa saltare righe.
   - Colonne lette: `id, pianta_id, strumento_id, data_rilievo, ora, valori`.
   - I filtri bastano a PostgREST e la RLS di `misure` è già quella giusta: **nessuna RPC né vista**. Serve solo un indice `misure (esperimento_id, strumento_id, id)` per le pagine, nella migration del Task D1.
5. **Export salvati: nuova tabella `export_salvati`.**
   - Per esperimento e per utente (spec §7.5): RLS con `is_membro(esperimento_id) and creato_da = auth.uid()` per leggere, inserire, modificare ed eliminare. Un collega dello stesso esperimento non vede gli export salvati degli altri.
   - Le scelte stanno in un `jsonb` con una forma fissa (versione 1), validato da una funzione SQL in un `check` e da una funzione TS gemella con gli stessi casi di prova.
   - Il nome è unico per esperimento e utente, senza badare a maiuscole e spazi ai bordi; salvando con un nome già usato si chiede se sostituire.
   - **"📌 Tutto l'esperimento"** non è una riga del database: è una costante del client, sempre prima e non eliminabile.
   - Un periodo relativo ("ultime 4 settimane") si salva come relativo: lo stesso export salvato, scaricato fra un mese, dà le ultime 4 settimane di allora.
   - Ids di strumenti, trattamenti o piante che non ci sono più si scartano in lettura, e la riga lo dice ("1 strumento non c'è più").
6. **Filtri del Dataset nella URL** (`useSearchParams` con `replace`), non in uno store:
   - sopravvivono a un ricaricamento e al tasto indietro;
   - "Scarica questa vista" apre Esporta con gli stessi parametri, che diventano le sue scelte iniziali;
   - un id che non c'è (o non è un uuid) si scarta in silenzio e vale il default.
   - **Fattore:** per ogni fattore, "Tutti" o un livello; più fattori si combinano con "e". Trattamenti e livelli si combinano con "e".
   - **Cerca piante:** testo con le etichette separate da virgola (`3, 12, A4`), con **corrispondenza esatta** per ogni pezzo con le regole di `trovaPianta` (niente maiuscole, spazi ai bordi, `035` = `35`): `3` non trova la `13`. I pezzi senza pianta compaiono sotto il campo: `Non trovata: 99`.
   - **La ricerca vince:** con piante cercate il grafico mostra quelle piante, e i filtri trattamento e fattore restano visibili ma non contano (lo dice una riga sotto la barra).
   - **Periodo:** Tutto, Ultime 2, 4 o 8 settimane, Dal… al…. "Ultime N settimane" vale da `oggi − (7N − 1)` giorni a oggi, compresi (4 settimane = 28 giorni), con `oggi` da `useOggi()`.
7. **Parametri non numerici** (spec §6.3):
   - **lista:** si disegna il numero di elementi (come `valoreNumerico`); una lista vuota è "vuoto" (`eVuoto`) e non conta;
   - **sì/no:** valore giornaliero della pianta = l'**ultima misura del giorno** per ora (come nel foglio Dati); per trattamento e data si disegna la **percentuale di sì** tra le piante con un valore, asse da 0 a 100%, **senza barre d'errore**, con n nella tabella;
   - **testo:** non si disegna. Scegliendo un parametro di testo, al posto del grafico c'è `Il testo non si disegna: ecco i valori.` e la tabella è già aperta (ultimo testo del giorno per pianta);
   - **numero con più letture:** media delle letture non nulle (`valoreNumerico`, verificato), poi media delle misure del giorno.
8. **Formato dei fogli Excel** (dettaglio nel Task D6):
   - ordine e nomi: `Dati`, `Medie`, `Misure`, un foglio per ogni lista (con il nome del parametro), `Grafici`, `Diario`, `Info`; ciascuno c'è solo se le scelte lo chiedono e se ha almeno una riga, tranne `Info`;
   - date come **vere date di Excel** (`dd/mm/yyyy`), ore come vere ore (`hh:mm`), numeri come numeri a precisione piena, sì/no come veri booleani;
   - la colonna `N_<parametro>` accanto a ogni parametro numerico che, in tutto il foglio, ha almeno un giorno con più di una misura;
   - l'etichetta della pianta è sempre testo (è un identificativo: `035` resta `035`);
   - "Medie" in formato largo: una riga per trattamento e data, tre colonne (`media`, `ES`, `n`) per parametro;
   - nome del file `FastLab_<esperimento>_<AAAA-MM-GG>.xlsx`, con il nome reso sicuro da `nomeSicuro` (Piano C).
9. **Il riepilogo e il file nascono dallo stesso modello.** `costruisciCartella` produce una descrizione pura dei fogli (righe, celle, immagini da disegnare); il riepilogo conta le righe di quella descrizione e lo scrittore la trasforma in `.xlsx`. Così "Dati: 896 righe" è vero per costruzione. Al tocco di "Scarica Excel" i dati si rileggono freschi e la cartella si ricostruisce: se le righe sono cambiate, il riepilogo si aggiorna e il toast finale dice i numeri veri.
10. **Download:** Blob e link `download`, con il ritardo di 30 s prima di liberare l'indirizzo (Safari), spostando `consegna` di `archivioFoto.ts` in un modulo comune `src/lib/scaricaFile.ts`. Se il browser non sa disegnare le immagini (canvas "contaminato", font non caricato), il file parte **senza immagini**, il foglio `Grafici` lo scrive in una riga e il toast lo dice.

## Struttura dei file

```
supabase/migrations/20261102000014_export_salvati.sql  export_salvati, scelte_export_valide, RLS, grant, guardie; indice misure (esperimento_id, strumento_id, id)
supabase/tests/export_salvati.test.sql
supabase/online/schema-completo.sql                    rigenerato con scripts/sql-unico.sh
src/domain/statistiche.ts (+ test)                     mediaEsN, valoriGiornalieriSiNo, ultimoTestoDelGiorno
src/domain/dataset.ts (+ test)                         periodo, filtri, ricerca esatta, serie per trattamento e per pianta, righe della tabella, note del grafico, filtri ⇄ URL
src/domain/grafico.ts (+ test)                         tavolozza, marcatori, scale, tacche, percorsi, barre d'errore, segni delle note
src/domain/export/scelte.ts (+ test)                   SceltaExport, SCELTA_TUTTO, leggiSceltaExport, sceltaDaFiltri, descriviScelta
src/domain/export/fogli.ts (+ test)                    modello della cartella e costruzione dei fogli
src/domain/export/riepilogo.ts (+ test)                righe del riepilogo, nome del file
src/api/misure.ts, src/api/exportSalvati.ts (+ test)   misureStrumento a pagine; CRUD degli export salvati
src/api/mappers.ts, src/api/query.ts                   mapper e hook nuovi, chiavi
src/lib/percorsi.ts                                    percorsoDataset, percorsoEsporta; via SezioneInArrivo e percorsoSezione
src/lib/scaricaFile.ts (+ test)                        consegna di un Blob (da archivioFoto.ts)
src/lib/graficoPng.ts (+ test)                         SVG → PNG con il font incorporato
src/lib/excel/scriviXlsx.ts (+ test)                   l'unico modulo che importa exceljs
src/components/dataset/*                               GraficoSvg, GraficoInterattivo, Legenda, BarraFiltri, TabellaValori
src/components/esporta/*                               ExportSalvati, SceltaCosa, SceltaPiante, SceltaPeriodo, SceltaCome, Riepilogo, scaricaExcel.ts
src/pages/Dataset.tsx, src/pages/Esporta.tsx (+ test)  le due sezioni (al posto di InArrivo)
src/pages/InArrivo.tsx (+ test)                        eliminati nel Task D9
DESIGN.md, README.md, package.json, package-lock.json
```

---

### Task D1: database degli export salvati (Opus)

- [ ] Migration `20261102000014_export_salvati.sql`:
  - `scelte_export_valide(s jsonb) returns boolean`, `immutable`, `set search_path = ''`, plpgsql che restituisce `false` (mai un errore) per ogni forma sbagliata, anche con date non valide (blocco `exception`). Forma valida, versione 1:
    ```json
    {
      "v": 1,
      "strumenti": { "modo": "tutti" } | { "modo": "scelti", "ids": ["<uuid>", "..."] },
      "piante":    { "modo": "tutte" } | { "modo": "trattamenti", "ids": ["<uuid>"] } | { "modo": "piante", "ids": ["<uuid>"] },
      "periodo":   { "modo": "tutto" } | { "modo": "settimane", "n": 4 } | { "modo": "intervallo", "da": "AAAA-MM-GG", "a": "AAAA-MM-GG" },
      "come":      { "valori": true, "medie": true, "grafici": true, "diario": true, "info": true }
    }
    ```
    Regole: oggetto con esattamente queste chiavi (nessuna in più, nessuna in meno); `v` = 1; `ids` array di stringhe uuid minuscole, da 1 a 2000 elementi (200 per gli strumenti), senza doppioni; `n` intero da 1 a 104; `da` e `a` date vere con `da ≤ a`; `come` con i cinque booleani e almeno uno vero; `octet_length(s::text) ≤ 100000`. Gli ids **non** si controllano contro l'esperimento (una pianta eliminata dopo non deve rendere invalida la riga: li scarta il client).
  - `export_salvati (id uuid pk (dal client), esperimento_id not null references esperimenti on delete cascade, nome text not null check (btrim(nome) <> '' and char_length(nome) <= 80), scelte jsonb not null check (public.scelte_export_valide(scelte)), creato_da uuid not null default auth.uid() references auth.users (id) on delete cascade, creato_il, aggiornato_il)`;
  - indice unico `export_salvati_nome_unico on (esperimento_id, creato_da, lower(btrim(nome)))`;
  - trigger `imposta_aggiornato_il` e `guardia_esperimento_id`;
  - RLS: select, insert, update (using e with check), delete, tutte `to authenticated` con `public.is_membro(esperimento_id) and creato_da = (select auth.uid())`;
  - privilegi come la 0012: `revoke all … from anon`; via truncate, references, trigger per authenticated; `revoke update` e `grant update (id, esperimento_id, nome, scelte, aggiornato_il)`: l'upsert di PostgREST mette nel SET le colonne del payload, `creato_da` e `creato_il` restano fuori;
  - `create index misure_esperimento_strumento_id_idx on misure (esperimento_id, strumento_id, id)` per le pagine del Task D3.
- [ ] pgTAP `export_salvati.test.sql`:
  - un membro crea, legge, rinomina ed elimina i suoi export;
  - **un altro membro dello stesso esperimento** non li vede, non li modifica e non li elimina (0 righe) e non ne inserisce con `creato_da` di un altro (42501);
  - un non membro non inserisce per quell'esperimento (42501);
  - update di `creato_da` → errore di privilegio sulla colonna; update di `esperimento_id` → `ESPERIMENTO_NON_MODIFICABILE`;
  - nome vuoto, solo spazi o oltre 80 caratteri → 23514; stesso nome con maiuscole o spazi diversi per lo stesso utente → 23505; stesso nome per un altro utente → ammesso;
  - `scelte`: almeno 6 forme valide (le tre di piante, le tre di periodo, strumenti tutti e scelti) e almeno 14 sbagliate, ciascuna → 23514: chiave in più, chiave mancante, `v` = 2, modo sconosciuto, `ids` vuoto, uuid non valido, uuid maiuscolo, doppione, `n` = 0, `n` = 105, `n` = 4,5, data `2026-02-30`, `da > a`, `come` tutto falso, `come` con un valore non booleano. **Le stesse forme diventano i casi di prova di `leggiSceltaExport` nel Task D6** (scrivile in un commento in testa al file per ritrovarle);
  - eliminando l'esperimento spariscono i suoi export; eliminando l'utente spariscono i suoi;
  - anon non legge, non scrive e non esegue `scelte_export_valide`;
  - l'indice nuovo su `misure` esiste (`has_index`);
  - i test generali di `rls.test.sql` restano verdi (RLS su ogni tabella, niente per anon).
- [ ] Rigenera `supabase/online/schema-completo.sql` con `scripts/sql-unico.sh`.
- [ ] Verifica: `scripts/db-senza-docker/test-db.sh`, poi le verifiche di sempre.
- Commit: `feat(db): export salvati per esperimento e per utente`.

### Task D2: dominio e statistiche del dataset (Opus)

Funzioni pure, senza date di sistema (`oggi` arriva dal chiamante), date sempre `AAAA-MM-GG` locali confrontate come testo.

- [ ] In `src/domain/statistiche.ts` (riusa `media`, `deviazioneStandard`, `valoriGiornalieri`):
  - `mediaEsN(xs: number[]): { media: number; es: number | null; n: number } | null`: `null` senza valori, `es` = ds campionaria / √n, `null` con n = 1;
  - `valoriGiornalieriSiNo(parametro, misure): Map<pianta, Map<data, boolean>>`: l'ultima misura del giorno per `ora` (a parità di ora l'ultima ricevuta, come `daSistemare`), sì/no non scelto non conta;
  - `ultimoTestoDelGiorno(parametro, misure): Map<pianta, Map<data, string>>`: stesso criterio, testo non vuoto.
- [ ] `src/domain/dataset.ts`:
  - `type Periodo = { modo: 'tutto' } | { modo: 'settimane'; n: number } | { modo: 'intervallo'; da: string; a: string }` (la stessa forma delle scelte salvate);
  - `intervalloDelPeriodo(periodo, oggi): { da: string | null; a: string | null }` (Decisione 6) e `nelPeriodo(data, intervallo)`, estremi compresi;
  - `cercaPiante(piante, testo): { trovate: Pianta[]; nonTrovate: string[] }`: pezzi separati da virgola, puliti dagli spazi, vuoti ignorati, ogni pezzo con `trovaPianta` (corrispondenza esatta), trovate nell'ordine delle piante e senza doppioni, `nonTrovate` nell'ordine scritto e senza doppioni;
  - `interface FiltriDataset { strumentoId: string | null; parametroId: string | null; trattamentoIds: string[] /* vuoto = tutti */; livelloIds: string[] /* al più uno per fattore */; periodo: Periodo; cercato: string }`;
  - `pianteDelFiltro(config, filtri): { piante: Pianta[]; modo: 'trattamenti' | 'piante'; nonTrovate: string[] }`: con piante cercate e trovate valgono solo quelle (`modo: 'piante'`); altrimenti trattamenti ∩ livelli (un trattamento passa se contiene il livello scelto di ogni fattore filtrato);
  - `parametriDelloStrumento(config, strumentoId): { parametro; disegnabile: boolean; scala: 'valore' | 'conteggio' | 'percentuale' | null }[]`, nell'ordine dello strumento, con gli archiviati in fondo e segnati; testo → `disegnabile: false`;
  - `serieTrattamenti(config, parametro, misure, piante, intervallo): SerieTrattamento[]`: una serie per trattamento che ha almeno una pianta tra `piante`, in ordine di configurazione, con `posto` = indice del trattamento in **tutta** la configurazione (Decisione 2) e `punti: { data; media; es; n }[]` in ordine di data. Numero e lista: `mediaEsN` dei valori giornalieri delle piante; sì/no: `media` = percentuale di sì (0 a 100), `es: null`;
  - `seriePiante(config, parametro, misure, piante, intervallo)`: una serie per pianta (al più 8, nell'ordine delle piante; `oltre: number` per quelle tagliate), con il `posto` del suo trattamento e, per ogni trattamento coinvolto, la serie di riferimento della media di **tutte** le piante di quel trattamento (`riferimento: true`);
  - `righeTabella(serie)`: le righe di "Mostra i valori", **derivate dalle stesse serie** del grafico: per data (dalla più recente), una riga per serie con media, ES e n; per il testo, `righeTesto(config, parametro, misure, piante, intervallo)` con pianta, data e testo;
  - `noteDelGrafico(note, piante, intervallo): { data; note: Nota[] }[]`: note nel periodo che sono di tutto l'esperimento o collegate a una delle piante o a uno dei loro trattamenti (la regola di `noteDellaPianta`, sull'insieme), raggruppate per data;
  - `filtriDaRicerca(params: URLSearchParams, config): FiltriDataset` e `ricercaDaFiltri(filtri): URLSearchParams`, con questi parametri: `s` strumento, `p` parametro, `t` trattamenti (ids con virgola), `f` livelli (ids con virgola), `per` = `tutto` | `2s` | `4s` | `8s` | `AAAA-MM-GG_AAAA-MM-GG`, `cerca` testo. Ids sconosciuti o non uuid scartati; due livelli dello stesso fattore → vale il primo; `per` illeggibile → `tutto`; un parametro che non è dello strumento → il primo disegnabile. Il default di `s` lo decide la pagina (Task D5), non questa funzione.
- [ ] Test (TDD), con le configurazioni di `src/domain/test-helpers.ts`:
  - due misure nello stesso giorno → media del giorno; letture `[40, null, 42]` → 41; due misure con letture diverse → media delle medie per misura;
  - n conta solo le piante con un valore; ES con n = 1 → `null`; n = 2 → valore calcolato a mano;
  - sì/no: ultima del giorno per ora, percentuale con n giusto, sì/no non scelto escluso;
  - lista: conteggio; lista vuota esclusa;
  - testo: niente serie, righe di testo con l'ultimo del giorno;
  - periodo: 28 giorni compresi per 4 settimane, a cavallo dell'ora legale (25/10/2026), intervallo con estremi compresi, misure con date future comprese in "Tutto";
  - ricerca: `3` non trova `13`; `035` trova `35`; `a4` trova `A4`; `3, 3,, 12` → due piante; `99` in `nonTrovate`;
  - la ricerca vince su trattamenti e livelli; trattamenti ∩ livelli; due fattori in "e";
  - il posto del colore non cambia togliendo un trattamento dal filtro; nono trattamento → posto `null`;
  - `righeTabella` ha esattamente i punti delle serie (stessi numeri);
  - note: di tutto l'esperimento, del trattamento, della pianta, fuori periodo escluse, due note nella stessa data in un solo segno;
  - URL: andata e ritorno identici; ids estranei scartati; `per` sbagliato.
- Commit: `feat: dominio del dataset (serie, filtri, periodo, ricerca esatta)`.

### Task D3: API e hook (Sonnet)

- [ ] `src/api/misure.ts`: `misureStrumento(espId, strumentoId): Promise<Misura[]>`:
  - `select('id, pianta_id, strumento_id, data_rilievo, ora, valori')`, `eq('esperimento_id')`, `eq('strumento_id')`, `order('id')`, `limit(1000)`, e dalla seconda pagina `gt('id', <id più grande ricevuto>)`;
  - si ferma solo alla prima pagina vuota; doppioni per id ignorati; un errore si rilancia (niente risultato a metà);
  - `RigaMisura` accetta l'assenza di `esperimento_id` (il mapper non lo usa).
- [ ] `src/api/exportSalvati.ts`, con tipo `ExportSalvato { id; nome; scelte: unknown; aggiornato_il }` e mapper (le scelte si leggono nella pagina con `leggiSceltaExport` del Task D6: l'API non dipende dal dominio dell'export):
  - `listaExportSalvati(espId)`, ordinati per nome (`localeCompare` con `'it'`);
  - `salvaExportSalvato(espId, { id, nome, scelte })`: upsert per id; il 23505 dell'indice sul nome diventa l'errore riconoscibile `eNomeExportGiaUsato(e)` in `src/lib/errori.ts`;
  - `eliminaExportSalvato(espId, id)` con `controllaRighe`.
- [ ] `src/api/query.ts`:
  - `chiavi.misureStrumento(espId, strumentoId) = ['misure', 'strumento', espId, strumentoId]`, sotto il prefisso `misure` (la modifica e l'eliminazione da `ModificaMisura` invalidano già tutto il prefisso);
  - `useMisureStrumento(espId, strumentoId)` e `useMisureStrumenti(espId, ids)` (`useQueries` con `combine`: dati solo quando tutte sono arrivate, primo errore, `refetch` di tutte);
  - `chiavi.exportSalvati(espId) = ['exportSalvati', espId]` e `useExportSalvati(espId)`;
  - **`ModuloOggi`** dopo un salvataggio invalida anche `chiavi.misureStrumento(espId, m.strumento_id)` (oggi invalida le chiavi una per una: senza questa riga Dataset resterebbe indietro di un giro). Test.
- [ ] `src/lib/percorsi.ts`: `percorsoDataset(espId, ricerca?)` e `percorsoEsporta(espId, ricerca?)`; `SezioneInArrivo` e `percorsoSezione` restano finché le due pagine non esistono (via nel D9).
- [ ] `src/lib/scaricaFile.ts`: `consegna(blob, nome)` spostata da `archivioFoto.ts` (che la importa), con il suo test (link creato, cliccato, tolto; revoca dopo 30 s con timer finti).
- [ ] Test con `src/test/supabase-mock.ts`: pagine con cursore giusto, fine solo su pagina vuota (una pagina da 3 righe non ferma la lettura), dedup, errore alla seconda pagina; upsert e delete degli export salvati, 23505 riconosciuto, 0 righe → `ELEMENTO_NON_TROVATO`.
- Commit: `feat: lettura delle misure per strumento a pagine ed export salvati (API)`.

### Task D4: il grafico (Sonnet)

- [ ] `src/domain/grafico.ts` (puro):
  - `COLORI_SERIE` (la tabella della Decisione 2), `MARCATORI` (otto forme come percorsi SVG centrati, lato 8 px), `COLORI_GRAFICO` con gli equivalenti esadecimali dei token che servono (carta, foglio, grafite, grafite tenue, riga, riga forte), commentati con il token d'origine: un SVG trasformato in immagine non legge le variabili CSS;
  - `tacche(min, max, quante)`: numeri "belli" (1, 2, 5 × 10ⁿ), dominio allargato alle tacche; tutti i valori uguali → ±10% (o ±1 se zero); percentuale → 0 a 100 fisso; conteggio → da 0;
  - `impagina(serie, segniNote, { larghezza, altezza, scala, perImmagine }): Impaginazione`: margini, asse X per giorni veri (date più vicine non si sovrappongono: al più circa una tacca ogni 56 px, etichette `GG/MM`), asse Y con la tacca alta che porta l'unità, percorsi delle linee (unite solo tra i punti che ci sono), barre d'errore (± ES, con cappuccio; nessuna se `es` è `null`), punti, segni verticali delle note (con il numero se più di una), serie di riferimento sottili e tratteggiate al 40%; una sola data → punti al centro;
  - nessun doppio asse, mai.
- [ ] `src/components/dataset/GraficoSvg.tsx`: solo presentazione, senza hook né contesto (deve funzionare con `renderToStaticMarkup`): linee 2 px, marcatori ≥ 8 px con un anello color carta di 2 px dove si sovrappongono, griglia orizzontale in riga, testi in Geist Mono grafite tenue. Con `perImmagine`: fondo foglio, titolo (`SPAD · media per trattamento ± ES`), legenda dentro l'immagine (marcatore, colore, etichetta), `@font-face` di Geist Mono incorporato quando è passato.
- [ ] `src/components/dataset/Legenda.tsx` (HTML, sotto il grafico): marcatore + etichetta in Geist Mono, sempre presente con due o più serie.
- [ ] `src/components/dataset/GraficoInterattivo.tsx`: larghezza dal contenitore (`ResizeObserver`), altezza 260 px sul telefono; un tocco o un trascinamento sceglie la data più vicina (linea verticale sottile) e sotto il grafico compare la riga "Lettura": `21/10 · S1 41,2 ± 0,8 (n 7) · …` in Geist Mono; un tocco su un segno di nota mostra il testo della nota con `Apri nel Diario` (stato `apriNota` già esistente). Frecce sinistra e destra con il grafico a fuoco; `role="img"` con un'etichetta che riassume; la tabella resta l'alternativa accessibile.
- [ ] `src/lib/graficoPng.ts`:
  - `fontGeistMono(): Promise<string | null>`: il file woff2 latino di `@fontsource-variable/geist-mono` importato con `?url`, letto una volta e trasformato in data URL; se non si legge, `null` (l'immagine usa `ui-monospace`);
  - `svgInPng(svg, larghezza, altezza, scala = 2): Promise<Uint8Array>`: Blob `image/svg+xml` → `Image` → canvas (fondo foglio) → `toBlob('image/png')`; ogni errore (decodifica, `SecurityError`, `toBlob` nullo) diventa `ErroreApp(GRAFICO_NON_DISEGNATO)`; l'indirizzo del Blob si libera sempre.
- [ ] `DESIGN.md`: sezione "Colori dei dati" (Decisione 2) e la riga nei Do/Don't; `.impeccable/design.json` se elenca i colori.
- [ ] Test: tacche (casi: 35 a 45, 0 a 0, negativi, 0,001 a 0,004, percentuale); X per giorni veri con date irregolari; nessuna barra con `es: null`; serie con un solo punto; segni delle note nella posizione della loro data; posto `null` → grafite tratteggiata; `GraficoSvg` con `renderToStaticMarkup` contiene titolo, legenda e un `<path>` per serie; `svgInPng` con `Image` e canvas finti (come `immagini.test.ts`): successo, errore di decodifica, `toBlob` nullo, URL liberato; `fontGeistMono` con `fetch` che fallisce → `null`.
- Commit: `feat: grafico in SVG per Dataset ed Excel`.

### Task D5: pagina Dataset (Sonnet)

- [ ] `src/pages/Dataset.tsx` su `/esperimenti/:espId/dataset`, al posto di `InArrivo`; la home usa `percorsoDataset`; test della home aggiornati.
- [ ] Filtri dalla URL (`filtriDaRicerca`), scritti con `setSearchParams(…, { replace: true })`. Strumento di base: quello dello store di campo se attivo, altrimenti il primo strumento attivo.
- [ ] **Barra dei filtri**, in alto e sempre visibile (`sticky` sotto la barra dell'AppShell), una riga scorrevole di pulsanti alti 44 px, fondo foglio e bordo riga controllo, ognuno con il valore attuale in breve: `💚 SPAD`, `A` (solo con più di un parametro), `Trattamenti: tutti`, `Fattore`, `Ultime 4 settimane`, `Piante`. Un filtro diverso dal default ha il fondo inchiostro velato (non inchiostro pieno). Toccandone uno si apre **sotto la barra** il suo pannello (uno alla volta, `aria-expanded`), in righe da quaderno:
  - Strumento: scelta singola, archiviati in fondo con `(archiviato)`;
  - Parametro: scelta singola, con `(solo tabella)` per il testo;
  - Trattamenti: `Tutti` o più scelte (chip con `aria-pressed`; selezionato = inchiostro come nella galleria Foto);
  - Fattore: per ogni fattore `Tutti` o un livello;
  - Periodo: Tutto, Ultime 2, 4, 8 settimane, Dal… al… (due campi data, `da ≤ a`, altrimenti messaggio sotto);
  - Piante: campo di testo `es. 3, 12, 35` con `Non trovata: 99` sotto, e la riga `La ricerca sostituisce trattamenti e fattore.` quando conta.
  - In fondo alla barra, con filtri attivi, `Azzera` (ghost).
- [ ] **Grafico** (`GraficoInterattivo`) con legenda e segni delle note (`useNote`, `senzaNoteInEliminazione`), con gli stati: caricamento; errore con `ErroreConRiprova`; nessuno strumento (`Aggiungi uno strumento nelle Impostazioni.` con link); nessun dato con questi filtri (con `Azzera i filtri`); parametro di testo (Decisione 7); piante cercate oltre 8 (`Il grafico mostra le prime 8 piante: la tabella le ha tutte.`).
- [ ] **"Mostra i valori"** (secondario, 44 px, `aria-expanded`): apre `TabellaValori` sotto il grafico, in righe da quaderno raggruppate per data (dalla più recente), data in Geist Mono come intestazione; ogni riga: marcatore della serie, etichetta, `41,2 ± 0,8` e `n 7` in Geist Mono (percentuale `62%`, `n 8`; con le piante, il valore della pianta e `media S1 40,8` in grafite tenue). Niente griglia da foglio di calcolo.
- [ ] **"Scarica questa vista"** (ghost, 44 px): `navigate(percorsoEsporta(espId, ricercaDaFiltri(filtri)))`.
- [ ] Inchiostro pieno: nessun pulsante principale in questa pagina; solo chip selezionati nel pannello aperto e focus (≤ 10%).
- [ ] Test: filtri letti e scritti nella URL (anche dopo un nuovo render con la stessa URL); default dello strumento; pannello che si apre e si chiude; ricerca esatta con `Non trovata`; la ricerca vince; testo → tabella aperta senza grafico; tabella con gli stessi numeri del grafico; segni delle note; errore con Riprova; "Scarica questa vista" porta alla URL giusta; nessuna lettura di misure di strumenti non scelti.
- Commit: `feat: Dataset con grafico, filtri e valori`.

### Task D6: dominio dell'export (Opus)

Tutto puro: niente rete, niente exceljs. Il modello che esce di qui è ciò che lo scrittore del D8 trasforma in file, e ciò che il riepilogo conta.

- [ ] `src/domain/export/scelte.ts`:
  - `SceltaExport` (la forma del jsonb del Task D1, con `Periodo` di `dataset.ts`) e `SCELTA_TUTTO` (strumenti tutti, piante tutte, periodo tutto, `come` tutto vero);
  - `leggiSceltaExport(x: unknown): SceltaExport | null` con **le stesse regole** di `scelte_export_valide` e **gli stessi casi di prova** del pgTAP (validi e sbagliati, uno per uno);
  - `applicaAllaConfigurazione(scelta, config): { scelta; scartati: string[] }`: toglie gli ids che non ci sono più (`1 strumento non c'è più`, `2 piante non ci sono più`); se un elenco resta vuoto, torna a "tutti/tutte";
  - `sceltaDaFiltri(filtri, config)` (Dataset → Esporta): strumenti = lo strumento del filtro; piante = le piante cercate e trovate, altrimenti i trattamenti che passano trattamenti e livelli (se il filtro è attivo), altrimenti tutte; periodo uguale; `come` tutto vero;
  - `descriviScelta(scelta, config)`: `SPAD, Ciras · tutte le piante · ultime 4 settimane · valori, medie, grafici`.
- [ ] `src/domain/export/fogli.ts`, il modello:
  ```ts
  type Cella = number | string | boolean | null | { data: string } | { ora: string } | { istante: string }
  interface Colonna { titolo: string; tipo: 'testo' | 'numero' | 'data' | 'ora' | 'istante' | 'booleano' | 'misto'; larghezza: number }
  interface Foglio { nome: string; colonne: Colonna[]; righe: Cella[][]; titoliDiBlocco?: number[] /* indici delle righe in grassetto (Info) */ }
  interface GraficoDaDisegnare { parametroId: string; titolo: string; serie: SerieTrattamento[]; note: …; scala }
  interface Cartella { nomeFile: string; fogli: Foglio[]; grafici: GraficoDaDisegnare[] /* vanno nel foglio Grafici */ }
  costruisciCartella({ config, misure, note, scelta, oggi, adesso }): Cartella
  ```
  Le piante sono quelle della scelta, le misure quelle degli strumenti scelti nel periodo. Colonne comuni a Dati, Misure e liste, in quest'ordine: `Esperimento`, `Pianta` (testo), una colonna per fattore (nome del fattore, valore = livello del trattamento), `Trattamento`, `Blocco` (solo se almeno una pianta ha un blocco).
  - **Dati** (con `come.valori`): una riga per pianta e data con almeno un valore dei parametri scelti; righe per data, poi trattamento, poi pianta (ordine della configurazione). Dopo le comuni: `Data`, poi un parametro per colonna (numero, testo, sì/no; non le liste), negli strumenti in ordine e nei parametri in ordine, archiviati compresi:
    - intestazione `Nome (unità)` o `Nome` senza unità; due intestazioni uguali (Altezza nel Metro e nella tabella fenologica) diventano `Altezza (cm) · Metro` e `Altezza (cm) · Fenologici`;
    - numero: la media del giorno (`valoriGiornalieri`); `N_<intestazione>` subito dopo, solo se nel foglio c'è almeno un giorno con più di una misura per quel parametro, e allora su ogni riga con un valore (1, 2, …);
    - testo: l'ultimo del giorno; sì/no: l'ultimo del giorno come booleano; cella vuota (`null`) senza valore.
  - **Misure** (con `come.valori`): una riga per lettura. Dopo le comuni: `Data`, `Ora`, `Strumento`, `Parametro`, `Unità`, `N. lettura`, `Valore` (misto: numero, testo o booleano), `Id misura`. Numero: una riga per lettura non nulla (`N. lettura` da 1); testo e sì/no: una riga con `N. lettura` vuoto; liste escluse. Ordine: data, ora, pianta, strumento, parametro, lettura.
  - **Un foglio per ogni lista** (con `come.valori` e almeno un elemento): una riga per elemento. Dopo le comuni: `Data`, `Ora`, `Strumento`, `N. elemento`, una colonna per sotto campo (`Nome (unità)`), `Id misura`.
  - **Medie** (con `come.medie`): una riga per trattamento e data con almeno un n ≥ 1. Colonne: `Esperimento`, `Trattamento`, una per fattore, `Data`, poi per ogni parametro disegnabile `<intestazione> media`, `<intestazione> ES`, `<intestazione> n`; per sì/no `<intestazione> % sì` e `<intestazione> n`; per le liste `<intestazione> (n. elementi) media`, `ES`, `n`. Stesse funzioni del Dataset (`serieTrattamenti`), così i numeri sono quelli dei grafici. ES vuoto con n = 1.
  - **Grafici** (con `come.grafici`): un `GraficoDaDisegnare` per ogni parametro disegnabile con almeno un punto; il foglio ha la riga `Media per trattamento ± errore standard. Unità: la pianta (prima la media del giorno di ogni pianta).` e, per ogni grafico, una riga col titolo sopra lo spazio dell'immagine (22 righe).
  - **Diario** (con `come.diario` e almeno una nota): note nel periodo collegate alla scelta (regola di `noteDelGrafico`), per data crescente. Colonne: `Data`, `Testo`, `Collegata a` (`descriviCollegamento`), `Promemoria` (booleano), `Fatto il` (data locale da `fatto_il`, o vuota). Testo oltre 32 000 caratteri tagliato con `…` (limite di Excel: 32 767).
  - **Info** (con `come.info`, sempre ultimo): blocchi separati da una riga vuota, con il titolo in grassetto:
    1. `Voce | Valore`: Esperimento, Data di inizio, Stato, Note, Esportato il (istante), Strumenti, Piante, Periodo (con le date vere: `dal 06/10/2026 al 02/11/2026`), Regola delle medie;
    2. `Trattamento | <fattori> | Piante` (quante);
    3. `Pianta | Trattamento | Blocco`;
    4. `Strumento | Parametro | Tipo | Unità | Letture | Minimo | Massimo | Obbligatorio | Archiviato | Colonna in Dati` (tipo a parole: numero, testo, sì/no, lista).
  - **Nomi dei fogli** (`nomiFogli`): al più 31 caratteri, senza `[ ] : * ? / \`, senza apostrofo ai bordi, non `History`, unici senza badare alle maiuscole; un nome di lista che coincide con un foglio fisso (`Dati`) o con un'altra lista prende ` (2)`.
  - **Larghezze:** dalla cella più lunga di ogni colonna (intestazione compresa), tra 8 e 40 caratteri.
- [ ] `src/domain/export/riepilogo.ts`:
  - `riepilogoCartella(cartella): { foglio: string; quante: number; cosa: 'righe' | 'immagini' | 'note' }[]` (righe di dati, senza l'intestazione);
  - `testoRiepilogo(...)`: `Dati: 896 righe`, `Misure: 3.584 righe` (separatore delle migliaia italiano), `Grafici: 6 immagini`, `Diario: 12 note`, `Info`, più la riga dei contenuti `SPAD, Ciras (A, gs, E, Ci)`;
  - `nomeFileExcel(nome, oggi)`: `FastLab_<nomeSicuro(nome) || 'esperimento'>_<AAAA-MM-GG>.xlsx`.
- [ ] Test (TDD), con una configurazione di prova con due fattori, un blocco, uno strumento a due letture, un Ciras, una tabella fenologica con testo, sì/no e una lista con sotto campi:
  - Dati: colonne esatte e nell'ordine; due misure nello stesso giorno → media e `N_` = 2, le altre righe `N_` = 1; nessun `N_` se mai più di una; letture ripetute; testo e sì/no dell'ultima ora; intestazioni doppie disambiguate; blocco assente → niente colonna;
  - Misure: una riga per lettura non nulla, liste escluse, `Id misura`;
  - liste: una riga per elemento, sotto campi in colonna, nome del foglio in conflitto con `Dati`;
  - Medie: stessi numeri di `serieTrattamenti`; ES vuoto con n = 1; % sì;
  - periodo e piante della scelta applicati a tutti i fogli; piante precise → medie delle sole piante scelte;
  - Diario: filtro per periodo e collegamento, testo lunghissimo tagliato;
  - Info: blocchi, istante di export, periodo a parole;
  - date come `{ data }`, ore come `{ ora }`, numeri come numeri (mai stringhe con la virgola), booleani come booleani;
  - riepilogo coerente con la cartella (stessi conteggi); fogli senza righe assenti; nome del file con accenti e simboli;
  - `leggiSceltaExport`: tutti i casi del pgTAP; `applicaAllaConfigurazione`; `sceltaDaFiltri` per i tre casi.
- Commit: `feat: dominio dell'export (scelte, fogli, riepilogo)`.

### Task D7: pagina Esporta (Sonnet)

- [ ] `src/pages/Esporta.tsx` su `/esperimenti/:espId/esporta`, al posto di `InArrivo`; la home usa `percorsoEsporta`.
- [ ] Scelta iniziale: dai parametri della URL (arrivo da Dataset, `sceltaDaFiltri`, con la riga `Dalla vista del Dataset.` in grafite tenue), altrimenti `SCELTA_TUTTO`. Poi vive nello stato della pagina.
- [ ] Struttura del mockup, in righe da quaderno, etichette di sezione in Label maiuscolo:
  - **Export salvati:** `📌 Tutto l'esperimento` sempre per primo, poi quelli dell'utente (nome e, sotto, `descriviScelta` in grafite tenue). Toccandone uno si applicano le scelte (non scarica). Su ogni salvato un'azione `Elimina` (44 px) con "Annulla" per 5 s; un salvato non più leggibile dice `Non più leggibile: eliminalo.`; gli ids scartati lo dicono (`1 strumento non c'è più`);
  - **1 · Cosa:** chip a scelta multipla degli strumenti (icona + nome; archiviati con dati in fondo con `(archiviato)`), almeno uno;
  - **2 · Quali piante:** `Tutte`, `Per trattamento…` (chip dei trattamenti, almeno uno), `Piante…` (campo `35, 36`, con `cercaPiante`, le etichette trovate in Geist Mono e `Non trovata: 99`);
  - **3 · Periodo:** `Tutto`, `Ultime 4 settimane`, `Dal… al…` (due date, `da ≤ a`); una scelta salvata con altre settimane mostra `Ultime N settimane` selezionato;
  - **4 · Come:** tre righe da attivare (`aria-pressed`, fondo inchiostro velato quando attive): `Valori di ogni pianta` (sotto: `una riga per pianta e data, più ogni singola misura`), `Medie per trattamento` (`media, errore standard e n per data`), `Grafici · Diario · Info` che si apre in tre caselle;
  - **Riepilogo** (fondo carta ombra, Geist Mono, `aria-live="polite"`): `Il file conterrà:` e le righe di `testoRiepilogo`, calcolate da `costruisciCartella` (in `useMemo`) sulle misure degli strumenti scelti (`useMisureStrumenti`) e sulle note; mentre si leggono `Conto le righe…`; con un errore `ErroreConRiprova`; senza righe `Nessun dato con queste scelte.`;
  - **`Scarica Excel`**: il pulsante principale nella `BarraAzioni` (l'unico inchiostro pieno), disabilitato senza dati o con una scelta non valida;
  - **`Salva questa scelta`** (ghost): apre un campo `Nome` con `Salva`; nome vuoto → messaggio; nome già usato → `C'è già un export «SPAD ultimo mese». Sostituirlo?` con `Sostituisci` (upsert sull'id di quello) e `Cambia nome`; riuscito → `toastSalvato` (il verde di "salvato"); errore di rete → messaggio che resta, campo intatto.
- [ ] Test: scelta iniziale da URL e senza; applicare un salvato; eliminare con Annulla (nessun delete) e confermato (delete dopo 5 s, timer finti); salvare, nome doppio con sostituzione, errore; riepilogo che cambia con le scelte; pulsante disabilitato senza dati; ids scartati segnalati; un solo inchiostro pieno.
- Commit: `feat: Esporta Excel con scelte, riepilogo ed export salvati`.

### Task D8: generazione del file .xlsx con le immagini (Opus)

- [ ] `npm install exceljs@4.4.0` (versione esatta nel `package.json`).
- [ ] `src/lib/excel/scriviXlsx.ts`, l'unico file che importa `exceljs`, sempre con `await import('exceljs')`; un import che fallisce → `ErroreApp('Non riesco a preparare l\'Excel: ricarica la pagina e riprova.')` (come il chunk di fflate). `scriviCartella(cartella, immagini: Map<parametroId, Uint8Array>): Promise<Blob>`:
  - un foglio per `Foglio`, nell'ordine; riga 1 di intestazione in grassetto, bloccata (`views: [{ state: 'frozen', ySplit: 1 }]`) e con il filtro automatico; larghezze dal modello;
  - `{ data }` → `new Date(Date.UTC(a, m − 1, g))` con `numFmt 'dd/mm/yyyy'` (exceljs converte le date in UTC: costruirle in ora locale sposterebbe il giorno in Italia);
  - `{ ora }` → frazione di giorno (`(h × 60 + min) / 1440`) con `numFmt 'hh:mm'`; `{ istante }` → data e ora locali come numero di serie con `numFmt 'dd/mm/yyyy hh:mm'`;
  - numeri come numeri, booleani come booleani, testo come stringa (mai formula: un testo che comincia con `=` resta testo);
  - foglio `Grafici`: ogni PNG con `addImage({ buffer, extension: 'png' })` ancorato sotto la riga del suo titolo, 800 × 450 px; un grafico senza immagine ha al suo posto la riga `Immagine non disponibile su questo browser.`;
  - proprietà della cartella: `creator: 'FastLab'`, data di creazione.
- [ ] `src/components/esporta/scaricaExcel.ts`, l'orchestratore, con `onProgresso(fase)`:
  1. `Preparo i dati…`: rilegge fresche (`fetchQuery` con `staleTime: 0`) configurazione, misure degli strumenti scelti e note, e rifà `costruisciCartella`;
  2. `Disegno i grafici 3 di 12…`: per ogni grafico `impagina` → `renderToStaticMarkup(<GraficoSvg perImmagine …/>)` (import dinamico di `react-dom/server`) → `svgInPng`; il primo `GRAFICO_NON_DISEGNATO` ferma i grafici e il file parte senza immagini;
  3. `Scrivo il file…`: `scriviCartella`, poi `consegna` (`src/lib/scaricaFile.ts`) con `cartella.nomeFile`;
  - toast finale (neutro, non verde): `Excel scaricato: FastLab_Hydrochar_2026-11-02.xlsx · Dati 896 righe`, più `I grafici non sono nel file: questo browser non li ha disegnati.` se è il caso;
  - doppio tocco protetto (un solo download alla volta); pagina lasciata a metà → nessun download fantasma dopo.
- [ ] La pagina Esporta mostra le fasi sotto il pulsante e lo tiene fermo durante il lavoro.
- [ ] Test con **exceljs vero** in Vitest (scrive il buffer e lo rilegge con `xlsx.load`):
  - nomi e ordine dei fogli; intestazioni; righe;
  - una data è una `Date` con il formato giusto e, letta in `Europe/Rome` (il fuso dei test), è il giorno giusto, anche il 29/03/2026, il 25/10/2026 e il 31/12;
  - un'ora è la frazione giusta; un numero è un numero; un booleano è un booleano; `=1+1` resta testo;
  - `N_` presente o assente come nel modello;
  - il foglio `Grafici` ha tante immagini quanti PNG (`getImages()`), e la riga di ripiego senza immagine;
  - riga 1 bloccata e filtro automatico;
  - chunk di exceljs che non si carica (`vi.mock` che lancia) → messaggio "ricarica";
  - orchestratore: fasi nell'ordine, PNG che fallisce → file senza immagini e toast che lo dice, doppio tocco.
- [ ] Controllo del bundle: dopo `npm run build`, il chunk principale non contiene `exceljs` né `react-dom/server` (test o script `grep` sui file di `dist/assets`, documentato nel README).
- Commit: `feat: file Excel con date vere e grafici come immagini`.

### Task D9: pulizia, README, verifica, messa online (Sonnet, poi il controller)

- [ ] `npm uninstall xlsx` (package.json e lockfile; nel lockfile cambia solo la sua voce e quelle di exceljs).
- [ ] Via `src/pages/InArrivo.tsx` e il suo test, `SezioneInArrivo` e `percorsoSezione` (con i loro test); nessun riferimento rimasto (`grep`).
- [ ] README: sezioni "Dataset" ed "Esporta Excel" (filtri, ricerca esatta, regola delle medie, fogli e colonne in breve, export salvati, "Scarica questa vista", grafici senza immagini su un browser che non li disegna), dipendenze (`exceljs` in un chunk separato, `xlsx` rimossa), elenco dei test.
- [ ] Verifica completa: test-db, `npx vitest run` (due volte), `npx tsc -b`, `npm run lint`, `npm run build` e controllo del bundle.
- [ ] **Il controller:**
  - applica la migration 0014 al progetto Supabase online con `apply_migration`, poi guarda gli advisor di sicurezza;
  - controlla la pagina keyset su PostgREST vero: `GET /rest/v1/misure?select=id,pianta_id,strumento_id,data_rilievo,ora,valori&esperimento_id=eq.<id>&strumento_id=eq.<id>&id=gt.<id>&order=id&limit=1000`;
  - fa il deploy di produzione e prova sul telefono (iPhone e Android): grafico al tocco, download dell'Excel, apertura in Excel e in Fogli Google, immagini presenti.
- Commit: `docs: README del Piano D`.

## Assegnazione dei modelli

| Task | Modello | Perché |
|---|---|---|
| D1 database | Opus | sicurezza della tabella nuova, validazione del jsonb |
| D2 dominio del dataset | Opus | statistica: regola della pianta, ES, sì/no, periodo, ricerca esatta |
| D3 API e hook | Sonnet | schema già noto (`listaNote`), solo cursore keyset |
| D4 grafico | Sonnet | geometria pura e ben specificata; il PNG si rivede nella revisione finale |
| D5 pagina Dataset | Sonnet | interfaccia |
| D6 dominio dell'export | Opus | formato dei fogli: è il dato che arriva all'analisi |
| D7 pagina Esporta | Sonnet | interfaccia |
| D8 file .xlsx | Opus | date e fusi di exceljs, immagini, ripieghi senza perdite silenziose |
| D9 pulizia e messa online | Sonnet, poi il controller | |
| Revisione finale | Opus | su tutto il piano |

Ordine: D1, D2, D3, D4, D5, D6, D7, D8, D9, un implementatore alla volta. I revisori del task precedente lavorano in parallelo sulla loro copia `git archive`.

## Focus di revisione

1. **Statistica giusta:**
   - unità = pianta: mai una media fatta direttamente sulle misure o sulle letture;
   - ES campionario, n = piante con un valore, ES vuoto con n = 1;
   - sì/no e testo con l'ultima misura del giorno per ora;
   - i numeri di "Mostra i valori", del foglio Medie e delle immagini sono gli stessi (stesse funzioni, non copie);
   - il periodo con gli estremi compresi e le date locali (ora legale, mezzanotte).
2. **Il file Excel:**
   - date vere che in Italia restano lo stesso giorno, ore vere, numeri come numeri, booleani veri;
   - `N_` solo dove serve e sulla colonna giusta;
   - nessuna riga persa né doppia tra le pagine di lettura (keyset, pagina corta che non ferma);
   - il riepilogo uguale al file;
   - nessun testo trasformato in formula; nomi dei fogli validi anche con nomi di liste strani.
3. **Sicurezza degli export salvati:**
   - un collega dello stesso esperimento non li vede né li tocca;
   - `creato_da` non si cambia né si falsifica; anon niente;
   - il jsonb non accetta forme sbagliate né enormi, e la funzione non va mai in errore.
4. **Telefono:**
   - grafico leggibile a 360 px di larghezza, tocco preciso, nessuno scorrimento orizzontale della pagina (solo la barra dei filtri scorre);
   - Esporta con 20 000 misure senza bloccare la pagina per più di qualche secondo, con le fasi visibili;
   - download su iPhone (Safari e app installata) e Android; immagini nel file su iOS (canvas da SVG con font incorporato);
   - exceljs e `react-dom/server` fuori dal bundle principale.
5. **Design:**
   - inchiostro ≤ 10%, verde solo nel toast di "Salva questa scelta";
   - colori dei dati solo dentro i grafici, sempre con marcatore e legenda; il colore segue il trattamento;
   - Geist Mono per numeri, date ed etichette; righe da quaderno; bersagli ≥ 44 px;
   - nessun trattino lungo nei testi.

## Dubbi per l'utente

1. **Colori nei grafici.** `DESIGN.md` vuole un solo inchiostro; con 8 trattamenti servono colori diversi. Il piano propone 8 colori sobri solo dentro i grafici (niente verde, niente blu dell'inchiostro), sempre con marcatore ed etichetta. In alternativa: linee tutte grafite con marcatori diversi e un trattamento evidenziato al tocco (più sobrio, meno leggibile, e l'immagine nell'Excel resterebbe grigia).
2. **Sì/no nell'Excel:** veri booleani (in Excel italiano `VERO`/`FALSO`) o le parole `Sì`/`No`? I booleani si contano e si filtrano meglio.
3. **"Ultime N settimane"** contate da oggi. Per un esperimento concluso da tempo sarebbero vuote: meglio contarle dall'ultima misura?
4. **Ricerca piante in Dataset:** il piano la fa vincere su trattamenti e fattore. In alternativa si incrocia con i filtri (con il rischio di un grafico vuoto senza capire perché).
5. **Foglio Medie in formato largo** (una riga per trattamento e data, tre colonne per parametro) o lungo (una riga per trattamento, data e parametro)? Il largo segue il mockup (32 righe) e il foglio Dati.
6. **Archivio .zip del Piano C:** la spec precedente voleva dentro anche l'Excel completo; il Piano C ha messo solo le foto e `foto.csv`. Aggiungerlo ora (piccolo, riusa `scaricaExcel` con `SCELTA_TUTTO`) o lasciarlo così?
