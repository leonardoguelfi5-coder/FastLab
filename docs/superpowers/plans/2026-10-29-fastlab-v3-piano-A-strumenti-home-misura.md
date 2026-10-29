# FastLab v3, Piano A: strumenti e catalogo, home dell'esperimento, misura sequenziale (piano di implementazione)

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano checkbox (`- [ ]`).

**Obiettivo:** sostituire le "passate" con gli **strumenti** dell'esperimento (uno per strumento, più una **tabella fenologica** per esperimento), copiati da un **catalogo condiviso**. Aggiungere la **home dell'esperimento** e la **misura sequenziale** per strumento, e sostituire "ricorda tra piante" con la spunta "Mantieni questo parametro uguale anche nelle prossime misure".

**Architettura:**
- Il concetto resta lo stesso del Piano 1 (un gruppo di parametri misurati insieme), ma cambia nome e regole.
- **Database:**
  - tabella `passate` → `strumenti`, con `tipo` `'strumento' | 'fenologico'`;
  - `passata_parametri` → `strumento_parametri`;
  - `misure.passata_id` → `strumento_id`.
- **Catalogo:** nuova tabella `catalogo_strumenti`, condivisa tra tutti gli utenti. Le copie negli esperimenti restano collegate con `catalogo_id`.
- **Interfaccia:** nuove pagine Home, Scelta strumento, Misura sequenziale e Catalogo. La misura sequenziale riusa `RiquadroOggi`/`ModuloOggi` del Piano 1.

**Tech stack:** invariato (React 19, Vite, TS, Tailwind 4, shadcn base-nova, React Router 7, TanStack Query, Zustand, Supabase con pgTAP, Vitest).

**Spec:**
- `docs/superpowers/specs/2026-10-29-fastlab-v3-home-strumenti-design.md`, in particolare §5.1, 5.2, 5.9, 5.10, 6 e 6.3;
- per tutto ciò che non cambia, la spec precedente `docs/superpowers/specs/2026-10-28-fastlab-v3-esperimenti-design.md`;
- design: `DESIGN.md`, `PRODUCT.md`;
- registro del Piano 1: `docs/superpowers/plans/2026-10-29-piano-1-registro-lavoro.md`, con le decisioni da non rompere.

**Fuori da questo piano** (Piani B–D):
- Piante: elenco per trattamento e nuova scheda della pianta;
- Oggi;
- Diario e Foto (compreso il pulsante 📷 nella misura);
- Dataset ed Esporta.

In questo piano le icone corrispondenti della home aprono una pagina segnaposto "In arrivo", tranne **Piante**, che porta all'elenco di oggi descritto nel Task 9.

## Vincoli globali

- Interfaccia **in italiano**. Identificatori e tabelle in italiano. Mai trattini lunghi nei testi.
- **Nessun merge su `main`.** Si fanno commit e push frequenti sul branch `claude/app-review-improvements-c26294`.
- Le **migration sono nuove** e numerate dopo `20261029000006`: non si riscrivono quelle esistenti. Il DB locale contiene solo dati di prova.
- **Restano valide tutte le protezioni del Piano 1:**
  - bozze in sessionStorage e conferme prima di scartare;
  - id generato dal client con `nuovoId()` (mai `crypto.randomUUID()` diretto) e upsert per id;
  - finestra di 500 ms dopo il salvataggio e sul "Salva comunque";
  - guardie nel DB: `PARAMETRO_CON_DATI`, `PIANTA_CON_DATI`, `ESPERIMENTO_NON_MODIFICABILE`;
  - colonne non aggiornabili (`creato_da`);
  - RLS per membro su ogni tabella dell'esperimento.
- **Catalogo:** l'unica tabella condivisa tra utenti. Lettura, inserimento e aggiornamento per `authenticated`; nessun delete (le voci si archiviano); nessun accesso `anon`.
- **Stile secondo `DESIGN.md`:**
  - carta, grafite e un solo inchiostro blu notte;
  - Geist Mono tabellare per numeri ed etichette;
  - righe da quaderno invece delle card;
  - bersagli di almeno 44 px;
  - azione principale nella `BarraAzioni` (sopra la tastiera).
- Copia vincolata:
  - spunta: `Mantieni questo parametro uguale anche nelle prossime misure`;
  - segno sul campo mantenuto: `mantenuto`;
  - scelta all'arrivo su una pianta già misurata: `Correggere quella delle HH:MM o aggiungerne una nuova?`, con i pulsanti `Correggi` e `Nuova misura`;
  - stato "incompleta": `incompleta`.
- **Ambiente lento** (OneDrive su Windows): i comandi lunghi vanno in background con log su file. Per i test del DB serve Docker con lo stack locale `supabase_*_fastlab` sulle porte +100 (API 54421, DB 54422).

## Focus di revisione

1. **Valore mantenuto salvato per sbaglio su un'altra pianta.** Il campo mantenuto deve mostrare `mantenuto`. La spunta si azzera cambiando strumento o data di rilievo. Test nel Task 2 (store) e nel Task 12 (pagina).
2. **Saltare una pianta "incompleta" come se fosse fatta.** Un Ciras con solo A e gs non è "fatta": compare in "Vai alle mancanti" e nel riepilogo. Test nei Task 10 e 12.
3. **Aggiornamento dal catalogo che tocca dati o esperimenti altrui.** Non deve eliminare valori, cambiare tipi o modificare esperimenti di cui l'utente non è proprietario. I campi ritoccati a mano devono finire tra i "saltati". Test nel Task 4 (dominio) e nel Task 3 (RLS).
4. **Rinomina incompleta.** Una query, una policy o una funzione SQL che cita ancora `passate`/`passata_id` romperebbe il salvataggio in silenzio. Test: dopo `db reset`, tutti i pgTAP e un percorso RPC `crea_esperimento` → salva misura (Task 1). In più, alla fine, `grep -ri "passat"` su `src/` e `supabase/` deve restituire solo testo storico nei commenti delle migration vecchie (Task 13).
5. **Arrivo su una pianta già misurata da numero digitato o da "Vai alle mancanti".** Deve sempre chiedere `Correggi` / `Nuova misura`. Nel giro automatico, invece, le piante fatte si saltano senza chiedere. Test nel Task 12.

---

## Struttura dei file (nuovi o rinominati)

```
supabase/migrations/
  20261029000007_strumenti.sql            rinomina passate→strumenti, tipo, archiviato, vincoli, RPC
  20261029000008_mantieni.sql             drop parametri.ricorda_tra_piante, RPC senza quel campo
  20261029000009_catalogo.sql             catalogo_strumenti + RLS + semi + catalogo_id / catalogo_chiave
supabase/tests/strumenti.test.sql  catalogo.test.sql
src/domain/  tipi.ts (Strumento, VoceCatalogo…)  catalogo.ts  giro.ts  (+ test)
src/api/     catalogo.ts  (configurazione.ts: salvaStrumento/eliminaStrumento/archiviaStrumento)
src/store/   campo.ts (strumentoId, mantenuti)
src/pages/   HomeEsperimento.tsx  SceltaStrumento.tsx  MisuraPianta.tsx  FineGiro.tsx  Catalogo.tsx  InArrivo.tsx
src/pages/wizard/  PassoStrumenti.tsx  PassoFenologica.tsx   (sostituiscono PassoParametri/PassoPassate)
src/components/config/  EditorStrumento.tsx  SceltaDalCatalogo.tsx  (EditorPassata eliminato)
src/components/impostazioni/  SezioneStrumenti.tsx  SezioneFenologica.tsx  (sostituiscono SezionePassate/SezioneParametri)
```

Route:

| Route | Pagina |
|---|---|
| `/esperimenti/:espId` | `HomeEsperimento` (sostituisce `Campo`) |
| `/esperimenti/:espId/misura` | `SceltaStrumento` |
| `/esperimenti/:espId/misura/:strumentoId/:piantaId` | `MisuraPianta` |
| `/esperimenti/:espId/misura/:strumentoId/fine` | `FineGiro` |
| `/esperimenti/:espId/oggi`, `/dataset`, `/esporta`, `/diario`, `/foto` | `InArrivo` |
| `/esperimenti/:espId/piante` | elenco provvisorio (Task 9) |
| `/esperimenti/:espId/piante/:piantaId` | `SchedaPianta` (invariata, rinominata internamente) |
| `/esperimenti/:espId/impostazioni` | `Impostazioni` |
| `/catalogo` | `Catalogo` |

---

### Task 1: Rinomina passate → strumenti (DB e codice), tipo, archiviato, vincoli

**File:**
- Migration `20261029000007_strumenti.sql`
- Test `supabase/tests/strumenti.test.sql`
- Tutti i file con `passat` in `src/` (circa 29) e i test esistenti

**Interfacce prodotte:**
- **SQL:**
  - `alter table passate rename to strumenti`;
  - `alter table passata_parametri rename to strumento_parametri`;
  - in `strumento_parametri` e `misure`: `rename column passata_id to strumento_id`;
  - in `strumenti`: `add column tipo text not null default 'strumento' check (tipo in ('strumento','fenologico'))` e `add column archiviato boolean not null default false`;
  - `create unique index strumenti_un_fenologico on strumenti (esperimento_id) where tipo = 'fenologico'`;
  - `create unique index strumento_parametri_un_solo_strumento on strumento_parametri (parametro_id)`;
  - va ricreata `crea_esperimento(bozza jsonb)`, che ora legge `bozza->'strumenti'` con i campi `id, nome, icona, ordine, tipo, archiviato, parametri[]`;
  - vanno ricreate le policy, i trigger (`guardia_esperimento_id`) e i grant per colonna (`misure`: `strumento_id` al posto di `passata_id`) che citavano i vecchi nomi. Policy e trigger seguono la tabella, ma i nomi delle policy vanno rinominati per chiarezza; la funzione RPC va riscritta.
- **TS:**
  - `interface Strumento { id; nome; icona: string | null; ordine: number; tipo: 'strumento' | 'fenologico'; archiviato: boolean; parametri: StrumentoParametro[] }`;
  - `interface StrumentoParametro { parametro_id; obbligatorio; ordine }`;
  - `ConfigEsperimento.strumenti: Strumento[]` al posto di `passate`;
  - `Misura.strumento_id` al posto di `passata_id`.
- **Rinomine:**
  - funzioni: `nuovaPassata` → `nuovoStrumento(ordine, tipo)`, `problemiPassata` → `problemiStrumento`, `salvaPassata` → `salvaStrumento`, `eliminaPassata` → `eliminaStrumento`, `contaPerPianta(misure, strumentoId)`;
  - prop `passata` → `strumento` in `RiquadroOggi`/`ModuloOggi`/`StoriaPianta`;
  - store `passataId` → `strumentoId` e `setPassata` → `setStrumento(espId, strumentoId)`, con lettura tollerante della vecchia chiave salvata.
- **Nuovo:** `archiviaStrumento(espId, id): Promise<void>`.

**Passi:**
- [ ] **1. Scrivi `strumenti.test.sql`.**
  - Un secondo `tipo='fenologico'` nello stesso esperimento fallisce con `23505`.
  - Lo stesso parametro in due strumenti fallisce con `23505`.
  - `tipo='altro'` fallisce con `23514`.
  - `crea_esperimento` con `bozza->'strumenti'` crea strumenti e collegamenti.
  - Una misura con `strumento_id` di un altro esperimento fallisce con `23503`.
  - Il catalogo RLS (test 1 e 2 di `rls.test.sql`) resta verde.
- [ ] **2. Verifica il rosso:** `npx supabase db reset` (background) poi `npm run test:db` → FAIL.
- [ ] **3. Scrivi la migration.** Prima elenca le occorrenze con `grep -rn "passat" supabase/migrations`. Aggiorna i test pgTAP esistenti che citano `passate`/`passata_id`.
- [ ] **4. Esegui la rinomina TS** in `src/` e nei test. Copia UI: "Passata" → "Strumento" ovunque ("Scegli una passata" → "Scegli uno strumento"). Il modello Hydrochar resta per ora con 4 strumenti di `tipo` `'strumento'`: lo ristruttura il Task 5.
- [ ] **5. Verifica:** `npm run test:db` → PASS; `npx tsc -b` → 0 errori; `npm test` → tutti verdi; `npm run build` OK.
- [ ] **6. Commit:** `refactor: le passate diventano strumenti (DB e codice)`.

### Task 2: Via "ricorda tra piante", arriva "Mantieni questo parametro uguale"

**File:**
- Migration `20261029000008_mantieni.sql`
- `src/domain/misure.ts`, `src/store/campo.ts`, `src/components/misura/FormMisura.tsx` (e i campi)
- `src/components/config/EditorParametro.tsx`, `src/domain/modelli/hydrochar.ts`, `src/components/scheda/ModuloOggi.tsx`
- Test

**Interfacce prodotte:**
- **SQL:** `alter table parametri drop column ricorda_tra_piante`. Va ricreata `crea_esperimento` senza quel campo.
- **Dominio:** `valoriIniziali(a: { parametri: Parametro[]; misurePianta: Misura[]; dataRilievo: string; mantenuti: ValoriMisura }): ValoriMisura`. Precedenza: **mantenuto > progressivo > vuoto**. I mantenuti valgono solo per i tipi `numero | testo | sino`; per `lista` si ignorano.
- **Dominio:** `mantenibile(p: Parametro): boolean`, vero per `numero | testo | sino`.
- **Store:**
  - `DatiCampo` diventa `{ strumentoId: string | null; dataRilievo: string; mantenuti: { strumentoId: string; data: string; parametri: string[]; valori: ValoriMisura } | null }`;
  - `setMantieni(espId: string, strumentoId: string, data: string, parametroId: string, attivo: boolean): void`;
  - `aggiornaMantenuti(espId: string, valori: ValoriMisura): void`, che dopo un salvataggio copia solo i valori dei parametri spuntati;
  - i mantenuti restituiti da `dati()` sono `null` se il loro `strumentoId` o la loro `data` non sono quelli correnti;
  - `ricorda` viene rimossa.
- **`FormMisura`:** nuove prop facoltative `mantenuti?: Set<string>`, `onMantieni?: (parametroId: string, attivo: boolean) => void`, `precompilatiDaMantenuti?: Set<string>`.
  - Per ogni parametro `mantenibile`, sotto il campo c'è una casella con l'etichetta esatta `Mantieni questo parametro uguale anche nelle prossime misure`.
  - Un campo precompilato da mantenuti mostra il segno `mantenuto` accanto alla label (grafite tenue, non colore da solo).

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - `misure.test.ts`:
    - `mantenuti` vince su `progressivo` per un numero;
    - `mantenuti` di una `lista` si ignora, quindi vince il progressivo;
    - senza mantenuti vale progressivo, poi vuoto.
  - `campo.test.ts`:
    - `setMantieni` su strumento S e data D, poi `dati()` con strumento S e data D → `parametri` contiene P;
    - cambiando strumento o data → `mantenuti` è `null`;
    - `aggiornaMantenuti` salva solo i parametri spuntati.
  - `FormMisura.test.tsx`:
    - la casella esiste per numero/testo/sì-no e non per la lista;
    - toccarla chiama `onMantieni(P, true)`;
    - con `precompilatiDaMantenuti` si vede `mantenuto`.
  - `EditorParametro.test.tsx`: "Ricorda tra piante" non compare più.
- [ ] **2. Verifica il rosso:** FAIL.
- [ ] **3. Implementa.** Rimuovi `ricorda_tra_piante` da tipi, mapper, bozza, editor e modello Hydrochar. In `ModuloOggi`, dopo un salvataggio, chiama `aggiornaMantenuti` (solo per misure nuove, come la vecchia regola di `ricorda`).
- [ ] **4. Verifica:** `npm run test:db`, `npx tsc -b`, `npm test` → verdi.
- [ ] **5. Commit:** `feat: mantieni un parametro uguale durante la misura, via "ricorda tra piante"`.

### Task 3: Catalogo strumenti condiviso (DB e API)

**File:**
- Migration `20261029000009_catalogo.sql`, test `supabase/tests/catalogo.test.sql`
- `src/domain/tipi.ts`, `src/api/catalogo.ts`, `src/api/query.ts`, `src/api/mappers.ts`
- Test

**Interfacce prodotte:**
- **SQL:**
  - `catalogo_strumenti(id uuid pk default gen_random_uuid(), nome text not null check (btrim(nome) <> ''), icona text, descrizione text not null default '', parametri jsonb not null default '[]', archiviato boolean not null default false, creato_da uuid references auth.users default auth.uid(), creato_il timestamptz default now(), aggiornato_il timestamptz default now())`;
  - unique index su `lower(btrim(nome))` where `not archiviato`;
  - RLS: select, insert e update per `authenticated`; nessuna policy delete; `revoke all from anon`; `creato_da` non aggiornabile;
  - trigger per `aggiornato_il`;
  - `strumenti.catalogo_id uuid references catalogo_strumenti(id)` (nullable);
  - `parametri.catalogo_chiave text` (nullable).
- **Semi** (`parametri` = array di `{chiave, nome, unita, n_letture, valore_min, valore_max}`):

| Strumento | Icona | Valori |
|---|---|---|
| SPAD | 💚 | `spad`: SPAD, unità null |
| Termometro | 🌡 | `temp_aria`: Temp aria, °C · `temp_pianta`: Temp pianta, °C |
| Ciras | 🍃 | `a`: A, µmol m⁻² s⁻¹ · `gs`: gs, mol m⁻² s⁻¹ · `e`: E, mmol m⁻² s⁻¹ · `ci`: Ci, µmol mol⁻¹ |
| Metro | 📏 | `altezza`: Altezza, cm |
| Calibro | 📐 | `diametro`: Diametro, mm |

  Tutti i valori hanno `n_letture` 1 e min/max null.
- **TS:**
  - `interface ParametroCatalogo { chiave: string; nome: string; unita: string | null; n_letture: number; valore_min: number | null; valore_max: number | null }`;
  - `interface VoceCatalogo { id: string; nome: string; icona: string | null; descrizione: string; parametri: ParametroCatalogo[]; archiviato: boolean }`;
  - `Strumento.catalogo_id: string | null`;
  - `Parametro.catalogo_chiave: string | null`.
- **API:**
  - `listaCatalogo(): Promise<VoceCatalogo[]>`, ordinata per nome, archiviate escluse;
  - `salvaVoceCatalogo(v: VoceCatalogo): Promise<void>`, upsert per id, mai `creato_da`;
  - `archiviaVoceCatalogo(id: string): Promise<void>`;
  - hook `useCatalogo()`, chiave `chiavi.catalogo`.
- **Dominio** (`src/domain/catalogo.ts`):
  - `strumentoDaCatalogo(v: VoceCatalogo, ordine: number): { strumento: Strumento; parametri: Parametro[] }`;
  - id nuovi con `nuovoId()`;
  - parametri `tipo:'numero'`, con `catalogo_chiave` = `chiave` e `strumento.catalogo_id` = `v.id`.

**Passi:**
- [ ] **1. Scrivi `catalogo.test.sql`.**
  - Ci sono i 5 semi.
  - L'utente A inserisce una voce e l'utente B la vede e la modifica.
  - Delete da `authenticated` → nessuna riga toccata o `42501`.
  - Update di `creato_da` → `42501`.
  - `anon` non vede nulla.
  - Nome doppio tra le non archiviate → `23505`.
  - Il test catalogo di `rls.test.sql` (RLS su tutte le tabelle pubbliche) resta verde.
- [ ] **2. Scrivi i test TS.** `catalogo.test.ts` (dominio): `strumentoDaCatalogo` crea un parametro per ogni voce, con `catalogo_chiave` e unità giuste. `api/catalogo.test.ts`: upsert senza `creato_da`, gli errori si propagano.
- [ ] **3. Verifica il rosso**, implementa, poi `npm run test:db` + `npm test` → PASS.
- [ ] **4. Commit:** `feat(db): catalogo strumenti condiviso con i semi`.

### Task 4: Aggiornare i propri esperimenti dal catalogo (dominio e API)

**File:**
- `src/domain/catalogo.ts`, `src/api/catalogo.ts`
- Test

**Interfacce prodotte:**
- `interface CopiaStrumento { espId: string; esperimentoNome: string; strumento: Strumento; parametri: Parametro[]; conDati: Set<string> }`.
- `pianoAggiornamento(vecchia: VoceCatalogo, nuova: VoceCatalogo, copie: CopiaStrumento[]): { aggiunte: { espId: string; strumentoId: string; parametro: Parametro }[]; modifiche: { espId: string; parametro: Parametro }[]; saltati: string[] }`.
  - **Regole**, con il confronto per `catalogo_chiave`:
    - una chiave nuova nella voce diventa un'aggiunta;
    - un campo tra `nome, unita, valore_min, valore_max, n_letture` cambia solo se nella copia è ancora uguale al valore **vecchio** del catalogo;
    - un campo ritoccato a mano va nei `saltati`, scritto come `<esperimento> · <strumento> · <parametro>: <campo> modificato a mano`;
    - una chiave tolta dal catalogo non si elimina mai;
    - `n_letture` cambia solo se il parametro non ha dati, altrimenti va nei saltati;
    - il tipo non si tocca mai.
- API:
  - `copieDiProprieta(catalogoId: string): Promise<CopiaStrumento[]>`: strumenti con quel `catalogo_id` negli esperimenti con `creato_da = auth.uid()`, con `parametriConDati` per esperimento;
  - `applicaAggiornamento(piano): Promise<void>`, che usa `salvaParametro` e i collegamenti di `salvaStrumento`.

**Passi:**
- [ ] **1. Scrivi i test che falliscono** (`catalogo.test.ts`).
  - Unità cambiata e copia intatta → è una modifica.
  - Unità cambiata ma copia ritoccata → è un saltato, con la stringa esatta.
  - Chiave nuova → è un'aggiunta.
  - Chiave rimossa → niente.
  - `n_letture` con dati → è un saltato.
  - Copie di un esperimento non proprio → non arrivano mai: lo garantisce l'API. Test con mock: filtro `creato_da`.
- [ ] **2. Verifica il rosso**, implementa, poi `npm test` → PASS.
- [ ] **3. Commit:** `feat: aggiornamento sicuro degli esperimenti dal catalogo`.

### Task 5: Modello Hydrochar e regole della bozza per strumenti e tabella fenologica

**File:**
- `src/domain/modelli/hydrochar.ts`, `src/domain/bozza.ts`
- Test

**Interfacce:**
- `bozzaHydrochar(catalogo: VoceCatalogo[]): BozzaEsperimento`.
  - Strumenti `Termometro`, `SPAD` e `Metro` presi dal catalogo per nome. Se una voce manca dal catalogo, si costruisce lo strumento con gli stessi dati dei semi.
  - Più uno strumento `tipo:'fenologico'` con nome `Tabella fenologica`, icona 🌱 e parametri:
    - N palchi totali (numero, progressivo);
    - N fiori fioriti;
    - N frutti;
    - N frutti invaiati;
    - Palchi (lista, sotto-campo N foglie, progressivo);
    - Infiorescenze (lista, sotto-campo N fiori, progressivo);
    - Note (testo).
  - **Niente Altezza nella tabella fenologica:** la misura il Metro. *Decisione del piano:* evita due parametri con lo stesso nome.
- `validaBozza` aggiunge questi messaggi esatti:
  - `Aggiungi almeno uno strumento o la tabella fenologica.`;
  - `Può esserci una sola tabella fenologica.`;
  - `Lo strumento "<nome>" non ha valori.`;
  - `Il parametro "<nome>" è in più di uno strumento.`

  Rimuove i messaggi delle passate.

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - `bozzaHydrochar(semi)` → `validaBozza` dà `[]`; ci sono 4 strumenti, di cui 1 fenologico; nessun "Altezza" nel fenologico; i parametri del Termometro hanno `catalogo_chiave` `temp_aria` e `temp_pianta`.
  - Bozza con 2 fenologici → messaggio esatto.
  - Parametro in 2 strumenti → messaggio esatto.
- [ ] **2. Verifica il rosso**, implementa, poi PASS.
- [ ] **3. Commit:** `feat(domain): modello Hydrochar con strumenti e tabella fenologica`.

### Task 6: Creazione guidata: passi "Strumenti" e "Tabella fenologica"

**File:**
- `src/pages/wizard/PassoStrumenti.tsx`, `PassoFenologica.tsx`, `PassoRiepilogo.tsx`, `src/pages/NuovoEsperimento.tsx`
- `src/components/config/EditorStrumento.tsx`, `SceltaDalCatalogo.tsx`
- Rimuovi: `PassoParametri.tsx`, `PassoPassate.tsx`, `EditorPassata.tsx`
- Test

**Interfacce:**
- `<SceltaDalCatalogo voci: VoceCatalogo[] gia: Set<string> onAggiungi(v: VoceCatalogo) onNuovo() />`: righe da quaderno con nome, icona e valori; "Aggiungi" per voce; in fondo `+ Nuovo strumento`.
- `<EditorStrumento valore: { strumento: Strumento; parametri: Parametro[] } onChange tipoFenologico?: boolean />`:
  - nome, icona e valori;
  - per lo strumento semplice i valori sono solo di tipo numero, con unità, letture e min/max;
  - per la tabella fenologica tutti i tipi, con progressivo.
  - Riusa `EditorParametro`.
- Passi del wizard: 1 Generale · 2 Fattori e piante · 3 **Strumenti** · 4 **Tabella fenologica** (facoltativa: `Questo esperimento non ha rilievi fenologici` per saltarla) · 5 Riepilogo.
- `+ Nuovo strumento`:
  - apre `EditorStrumento` vuoto;
  - al conferma chiama `salvaVoceCatalogo` (entra nel catalogo, spec §5.10) e aggiunge la copia alla bozza;
  - un errore di rete mostra `messaggioErrore` e lascia lo strumento nella bozza come non collegato (`catalogo_id: null`).
- Il riepilogo conta `Strumenti` e `Voci fenologiche` al posto di `Parametri`/`Passate`.
- Bozza in sessionStorage: aumenta `VERSIONE` (forma cambiata).

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Da Hydrochar si arriva al Riepilogo con 3 strumenti + tabella fenologica e 0 errori; "Crea" invia una bozza con `strumenti.length === 4`.
  - "Aggiungi" Ciras dal catalogo → compare con A, gs, E, Ci.
  - `+ Nuovo strumento` "Penetrometro" (1 valore, kg/cm²) → `salvaVoceCatalogo` chiamata e strumento nella bozza.
  - Si può saltare la tabella fenologica.
  - Si possono aggiornare i test esistenti del wizard che citano Parametri o Passate.
- [ ] **2. Verifica il rosso**, implementa, poi `npm test`, `npx tsc -b`, `npm run build` → OK.
- [ ] **3. Commit:** `feat: creazione guidata con strumenti dal catalogo e tabella fenologica`.

### Task 7: Impostazioni: sezioni "Strumenti" e "Tabella fenologica"

**File:**
- `src/components/impostazioni/SezioneStrumenti.tsx`, `SezioneFenologica.tsx`, `src/pages/Impostazioni.tsx`
- Rimuovi `SezionePassate.tsx` e `SezioneParametri.tsx`; `ParametriArchiviati` va riusato
- Test

**Interfacce:**
- **`SezioneStrumenti`:**
  - elenco degli strumenti attivi, ognuno modificabile con `EditorStrumento`;
  - `+ Aggiungi dal catalogo` con `SceltaDalCatalogo`;
  - "Archivia" su uno strumento: `archiviaStrumento`. Lo strumento sparisce dalla scelta in misura e resta nella storia. Uno strumento senza misure si può eliminare con `eliminaStrumento`;
  - link `Gestisci il catalogo` → `/catalogo`.
- **`SezioneFenologica`:** l'unica tabella fenologica, o `Crea la tabella fenologica` se manca.
- Valgono tutte le regole già presenti per i parametri con dati: archivia, tipo bloccato, sotto-campi non rimovibili, controllo delle righe toccate.

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Aggiungi Ciras dal catalogo → `salvaStrumento` con 4 parametri con `catalogo_chiave`.
  - "Archivia" su uno strumento con misure → `archiviaStrumento`, nessun delete.
  - "Elimina" compare solo senza misure.
  - La tabella fenologica mostra i tipi lista e testo; per uno strumento semplice il tipo è bloccato su numero.
- [ ] **2. Verifica il rosso**, implementa, poi verdi.
- [ ] **3. Commit:** `feat: impostazioni con strumenti e tabella fenologica`.

### Task 8: Pagina Catalogo

**File:**
- `src/pages/Catalogo.tsx`, route `/catalogo`, voce "Catalogo strumenti" nel menu di `AppShell`
- Test

**Interfacce:**
- Elenco delle voci (righe da quaderno) con `+ Nuovo strumento`.
- Il tocco su una voce apre `EditorStrumento` (modalità catalogo: solo valori numerici).
- **Salvataggio:**
  - con la casella `Aggiorna anche i miei esperimenti` (non spuntata di base), dopo `salvaVoceCatalogo`:
    - chiama `copieDiProprieta` → `pianoAggiornamento` → `applicaAggiornamento`;
    - mostra il toast `Catalogo aggiornato.`;
    - se ci sono saltati, un elenco `Non aggiornati:` con le stringhe dei saltati;
  - senza la casella aggiorna solo il catalogo.
- "Archivia" con conferma: `Archiviare "<nome>"? Non comparirà più tra gli strumenti da aggiungere; gli esperimenti che lo usano non cambiano.`

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Salva senza casella → nessuna chiamata a `copieDiProprieta`.
  - Salva con casella e un saltato → compaiono `Non aggiornati:` e la stringa.
  - Archivia → conferma, poi `archiviaVoceCatalogo`.
- [ ] **2. Verifica il rosso**, implementa, poi verdi.
- [ ] **3. Commit:** `feat: pagina del catalogo strumenti con aggiornamento dei propri esperimenti`.

### Task 9: Home dell'esperimento e pagine segnaposto

> **Ordine di esecuzione:** il Task 10 va eseguito **prima** di questo, perché la striscia usa `progressoOggi`.

**File:**
- `src/pages/HomeEsperimento.tsx`, `src/pages/InArrivo.tsx`, `src/App.tsx`
- Elenco provvisorio delle piante: `src/pages/ElencoPiante.tsx` (provvisorio, rifatto nel Piano B)
- Test

**Interfacce:**
- `HomeEsperimento` (spec §5.1, mockup `docs/superpowers/specs/2026-10-29-fastlab-v3-home-mockup.html`):
  - `AppShell` con il nome dell'esperimento;
  - riga di riepilogo `<n> piante · <n> trattamenti · in corso|concluso`;
  - **striscia** `➕ Nuova misura` (fondo inchiostro, link a `/misura`): sotto mostra `<icona> <nome> in corso · <fatte>/<totale>` se lo store ha uno `strumentoId` con progresso in corso alla data di rilievo; altrimenti niente;
  - griglia a 2 colonne: 📅 Oggi, 🌿 Piante, 📊 Dataset, ⬇️ Esporta Excel, 📒 Diario, 📷 Foto, e ⚙️ Impostazioni a tutta larghezza in fondo;
  - bersagli di almeno 56 px.
  - *Decisione del piano:* il numerino su Oggi arriva con il Piano B; qui non c'è.
- `InArrivo`: titolo della sezione e testo `Questa sezione arriva con il prossimo aggiornamento.`, con freccia indietro alla home.
- `ElencoPiante` provvisorio: righe con etichetta e trattamento, che aprono `/piante/:piantaId`.
- `/esperimenti/:espId` ora monta `HomeEsperimento`. `Campo.tsx` si elimina nel Task 12, quando la scelta strumento lo sostituisce.

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Ci sono la striscia e le 7 icone con quei testi e quei link.
  - Lo stato "SPAD in corso · 34/56" compare con store e misure mock.
  - Senza misura in corso la striscia ha solo il titolo.
  - `/esperimenti/x/dataset` mostra `InArrivo`.
- [ ] **2. Verifica il rosso**, implementa, poi verdi.
- [ ] **3. Commit:** `feat: home dell'esperimento con nuova misura e icone`.

### Task 10: Dominio del giro di misura

**File:**
- `src/domain/giro.ts`, test

**Interfacce:**
- `type StatoPianta = 'da_fare' | 'incompleta' | 'fatta'`.
- `statoPianta(strumento: Strumento, parametri: Parametro[], misureGiorno: Misura[], piantaId: string): StatoPianta`.
  - Si guarda l'**unione dei valori** delle misure di quella pianta, di quello strumento e di quella data.
  - Nessun parametro attivo dello strumento con valore → `da_fare`.
  - Tutti con valore → `fatta`.
  - Altrimenti → `incompleta`.
  - Un parametro conta "con valore" se `!eVuoto`.
- `prossimaDaMisurare(piante: Pianta[], stati: Map<string, StatoPianta>, dopo: string | null): Pianta | null`: la prima pianta per `ordine` dopo `dopo` (o dall'inizio) con stato diverso da `fatta`.
- `riepilogoGiro(piante, stati): { fatte: number; totale: number; mancanti: Pianta[]; incomplete: Pianta[] }`.
- `progressoOggi(strumenti, parametri, misureGiorno, piante): Map<strumentoId, { fatte: number; totale: number }>`, dove `fatte` conta solo le piante in stato `fatta`.

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Ciras con A e gs ma senza E e Ci → `incompleta`.
  - Due misure dello stesso giorno, una con A e gs e una con E e Ci → `fatta`.
  - `prossimaDaMisurare` salta le `fatta` e include le `incompleta`.
  - Dopo l'ultima pianta → `null`.
  - `riepilogoGiro` con 56 piante, 54 fatte e una incompleta → `{fatte:54, totale:56, mancanti:[12,33], incomplete:[33]}`.
  - Un parametro archiviato non conta.
- [ ] **2. Verifica il rosso**, implementa, poi PASS.
- [ ] **3. Commit:** `feat(domain): stato delle piante e giro di misura per strumento`.

### Task 11: Pagina "Scegli lo strumento"

**File:**
- `src/pages/SceltaStrumento.tsx`, route `/esperimenti/:espId/misura`
- Migration `20261029000010_ultime_misure.sql`
- Test

**Interfacce aggiuntive:**
- RPC `ultime_misure_per_strumento(p_esperimento uuid) returns table(strumento_id uuid, ultima date)`: security invoker, grant solo ad `authenticated`, con un test pgTAP per RLS (un altro utente non vede nulla).
- API `ultimaMisuraPerStrumento(espId: string): Promise<Map<string, string>>`.

**Interfacce:**
- `AppShell` `Nuova misura`, indietro alla home.
- Data di rilievo (`input type="date"`, store), con `BannerData` (riuso).
- Elenco degli strumenti non archiviati, in righe da quaderno, compresa la tabella fenologica: icona, nome e una riga in Geist Mono:
  - `<fatte>/<totale> oggi` se è iniziato;
  - `fatto ✓` se completo;
  - `ultima volta GG/MM` (dalla data dell'ultima misura dello strumento, `misureDelGiorno` non basta: serve `ultimaMisuraPerStrumento(espId)`, nuova API `select strumento_id, max(data_rilievo)` raggruppata) oppure `mai misurato`.
- Lo strumento dello store, se ha piante non fatte alla data, sta **in cima** con l'azione `Riprendi dalla pianta <etichetta>`, verso la prima non fatta.
- Toccando uno strumento: `setStrumento` nello store, poi navigazione alla prima pianta da misurare (`prossimaDaMisurare(…, null)`), oppure a `/fine` se non ce ne sono.

**Passi:**
- [ ] **1. Scrivi i test che falliscono.**
  - Righe con `34/56 oggi`, `fatto ✓`, `ultima volta 21/10`, `mai misurato`.
  - Strumento in corso in cima con "Riprendi dalla pianta 35".
  - Tocco su SPAD → naviga a `/misura/<spad>/<pianta 1>`.
  - Strumento archiviato assente.
- [ ] **2. Verifica il rosso**, implementa, poi verdi.
- [ ] **3. Commit:** `feat: scelta dello strumento con il progresso di oggi`.

### Task 12: Misura sequenziale, scelta Correggi/Nuova misura, fine giro

**File:**
- `src/pages/MisuraPianta.tsx`, `src/pages/FineGiro.tsx`
- `src/components/scheda/RiquadroOggi.tsx` (nuove prop), `src/components/scheda/ModuloOggi.tsx`
- Rimuovi `src/pages/Campo.tsx` (e i suoi test spostati dove servono)
- Test

**Interfacce:**
- **`MisuraPianta`** (`/misura/:strumentoId/:piantaId`):
  - **intestazione:** etichetta della pianta in stile "numero pianta" e trattamento; campo `Vai alla pianta` (`trovaPianta`); nessuna storia;
  - **corpo:** `RiquadroOggi` per quello strumento e quella data, con `successiva = prossimaDaMisurare(piante, stati, piantaId)`. Il pulsante resta `Salva e vai alla <etichetta>`. Se `successiva` è `null` diventa `Salva e termina` e dopo il salvataggio naviga a `/fine`;
  - **arrivo su una pianta che ha già misure di quello strumento in quella data**, solo quando ci si arriva da `Vai alla pianta`, dal riepilogo o da un link (non dal giro automatico, che la salta):
    - pannello con il testo `Correggere quella delle HH:MM o aggiungerne una nuova?`;
    - con più misure, una riga `Correggi` per ciascuna ora, più `Nuova misura`;
    - nuova prop di `RiquadroOggi`: `iniziale: { tipo: 'nuova' } | { tipo: 'correggi'; misuraId: string }`;
  - **mantieni:**
    - `RiquadroOggi`/`ModuloOggi` passano a `FormMisura` `mantenuti` e `onMantieni` dallo store (`setMantieni(espId, strumentoId, dataRilievo, …)`);
    - `precompilatiDaMantenuti` = i parametri il cui valore iniziale viene da `mantenuti`;
    - dopo un salvataggio di una misura nuova, `aggiornaMantenuti`.
- **`FineGiro`** (`/misura/:strumentoId/fine`):
  - titolo `<icona> <nome>: <fatte>/<totale>`;
  - se ci sono mancanti: `Mancano <etichette>` e le incomplete marcate `incompleta`;
  - pulsanti `Vai alle mancanti` (prima mancante, con l'arrivo "Correggi/Nuova misura" se è incompleta) e `Scegli un altro strumento` → `/misura`.
- `SchedaPianta` resta raggiungibile da `ElencoPiante`. Usa lo strumento dello store, o il primo, solo per il riquadro di oggi: verrà rifatta nel Piano B.

**Passi:**
- [ ] **1. Scrivi i test che falliscono** (RTL con API mockate, config Hydrochar dai semi).
  - Giro SPAD dalla pianta 1 con le piante 2 e 3 già fatte → "Salva e vai alla 4".
  - "Vai alla pianta" 2 → compare `Correggere quella delle 09:12 o aggiungerne una nuova?`; `Correggi` carica la misura con lo stesso id; `Nuova misura` apre un modulo vuoto con un id nuovo.
  - Ultima pianta → `Salva e termina` → `/fine` con `SPAD: 54/56` e `Mancano 12, 33`.
  - Ciras con solo A e gs sulla 33 → incompleta, inclusa in "Vai alle mancanti".
  - **Mantieni:**
    - spunta su Temp aria → la pianta successiva ha Temp aria precompilata con `mantenuto`;
    - cambiando strumento non è precompilata;
    - una lista non ha la casella.
  - Il doppio tocco su "Salva e vai" crea una sola misura (regressione dal Piano 1).
- [ ] **2. Verifica il rosso**, implementa, elimina `Campo.tsx`, poi `npm test`, `npx tsc -b`, `npm run build` → OK.
- [ ] **3. Prova nel browser** (DB locale, 375 px): crea da Hydrochar, giro SPAD su 3 piante, "Vai alla pianta" 2 → scelta, fine giro, mantieni Temp aria nel giro Termometro.
- [ ] **4. Commit:** `feat: misura sequenziale per strumento con scelta correggi o nuova e fine giro`.

### Task 13: Pulizia, README, verifica finale

**File:**
- `README.md`, `docs/superpowers/plans/2026-10-29-piano-1-registro-lavoro.md` (sezione Piano A)

**Passi:**
- [ ] **1. Grep.** `grep -rni "passat\|ricorda_tra_piante\|ricordati" src supabase/tests` → nessun risultato. Nelle migration vecchie restano solo i nomi storici.
- [ ] **2. README.** Aggiorna la sezione d'uso: home, Nuova misura, strumenti e catalogo, tabella fenologica.
- [ ] **3. Verifica:**
  - `npx supabase db reset` + `npm run test:db` → PASS;
  - `npm test` → tutti verdi;
  - `npx tsc -b`, `npm run lint`, `npm run build` → puliti.
- [ ] **4. Commit e push:** `docs: README e registro del Piano A`.
