# Registro del Piano A: strumenti e catalogo, home, misura sequenziale

Piano: `docs/superpowers/plans/2026-10-29-fastlab-v3-piano-A-strumenti-home-misura.md`
Spec: `docs/superpowers/specs/2026-10-29-fastlab-v3-home-strumenti-design.md` (+ mockup `2026-10-29-fastlab-v3-home-mockup.html`)
Branch: `claude/app-review-improvements-c26294` (base 93065bd, piano A committato). Nessun merge su `main`.
Base nel cloud: 840 test Vitest verdi, `tsc -b` pulito, lint pulito.

Metodo: le skill `superpowers:subagent-driven-development` e `impeccable` non sono installate nell'ambiente cloud. Il controller segue lo stesso metodo a mano: brief scritti, implementatore → revisore → giri di correzione, registro qui. I brief UI riportano le regole di `PRODUCT.md`, `DESIGN.md` e `.impeccable/design.json`.
Modelli: Opus per i Task 1, 3, 4, 12 e la revisione finale; Sonnet per gli altri (implementazione e revisione).

## Database nel cloud

Docker non c'è, ma nel container ci sono PostgreSQL 16 e pgTAP (installato con apt). Il controller ha preparato uno **strato che imita Supabase** (ruoli `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()` da `request.jwt.claims`, schema `extensions` con pgcrypto, privilegi di default di Supabase su `public`): lo script ricrea il DB, applica tutte le migration in ordine ed esegue `pg_prove` su `supabase/tests/*.sql`.
Sulla base del Piano 1 dà lo stesso risultato della sessione locale: 4 file, 104 test, PASS.

Ruling: le migration nuove (0007–0010) e i loro pgTAP si verificano nel cloud con lo strato emulato; restano comunque da confermare in locale con `npx supabase db reset` + `npm run test:db` (GoTrue, PostgREST e i privilegi reali di Supabase non sono emulati) — cost if wrong: un giro in locale.

## Scansione preliminare

| Coppia / task | Produce → usa | Esito |
|---|---|---|
| T1 → tutti | `Strumento`, `strumento_id`, `salvaStrumento` → T2–T12 | coerente |
| T1 ↔ modello Hydrochar | il modello resta con 4 strumenti, ma "Altezza" è sia in "Altezza" sia in "Fenologici"; il nuovo indice `strumento_parametri_un_solo_strumento` farebbe fallire `crea_esperimento` dal modello fino al T5 | CONFLITTO |
| T2 → T12 | `setMantieni`/`aggiornaMantenuti`/`valoriIniziali({mantenuti})` → MisuraPianta | coerente |
| T3 → T4–T8 | `VoceCatalogo`, `listaCatalogo`, `salvaVoceCatalogo`, `strumentoDaCatalogo` | coerente |
| T3 ↔ `rls.test.sql` | test "ogni tabella ha RLS" e "anon senza privilegi/funzioni" → valgono anche per `catalogo_strumenti` e per la RPC del T11 | coerente (va rispettato) |
| T5 → T6 | `bozzaHydrochar(catalogo)` cambia firma: i chiamanti esistenti (`SceltaIniziale`) devono continuare a compilare | coerente (passano `[]` o il catalogo) |
| T6/T7 ↔ T8 | `EditorStrumento`, `SceltaDalCatalogo` riusati | coerente |
| T9 ↔ T11/T12 | la striscia della home porta a `/misura`, che esiste solo dal T11; `Campo.tsx` resta senza route dal T9 al T12 | LACUNA |
| T10 → T9/T11/T12 | `statoPianta`, `prossimaDaMisurare`, `riepilogoGiro`, `progressoOggi` | coerente (T10 prima del T9) |
| T12 ↔ Piano 1 | `RiquadroOggi`/`ModuloOggi` riusati: bozze, `nuovoId()`, finestra 500 ms, niente doppioni | coerente (da non rompere) |
| T13 grep | `passat` resta nei soli commenti/nomi storici delle migration vecchie | coerente |

Ruling: nel T1 il modello Hydrochar toglie "Altezza" dallo strumento "Fenologici" (anticipa la decisione del T5: niente Altezza nella tabella fenologica), così il modello resta valido con il nuovo indice unico — cost if wrong: nessuno, il T5 ristruttura comunque il modello.
Ruling: nel T9 la route `/esperimenti/:espId/misura` monta provvisoriamente `Campo` (la vecchia schermata di campo), così la striscia "Nuova misura" porta già a una misura; il T11 la sostituisce con `SceltaStrumento` e il T12 elimina `Campo.tsx` — cost if wrong: nessuno.

## Avanzamento
Ruling: lo strato emulato è nel repository (`scripts/db-senza-docker/`, script `test-db.sh` + `stub-supabase.sql`), così lo usano gli agenti e le prossime sessioni cloud (Piani B–D) — cost if wrong: due file da togliere.
Ruling (T2): il cablaggio di "Mantieni" in `ModuloOggi`/`RiquadroOggi` (mantenuti dello store per lo strumento del riquadro e la data di rilievo, casella solo nelle misure nuove, `aggiornaMantenuti` dopo il salvataggio di una misura nuova) si fa già nel T2, perché la schermata di campo attuale lo usa subito; il T12 lo riusa — cost if wrong: nessuno.
Ruling (T3): `crea_esperimento` si ricrea anche nella migration 0009 per leggere `strumenti[].catalogo_id` e `parametri[].catalogo_chiave` dalla bozza; senza, la creazione guidata (T6) perderebbe il collegamento al catalogo. `clonaConfig` conserva i due collegamenti. Insert nel catalogo con `with check (creato_da = auth.uid())` — cost if wrong: nessuno.
Ruling (T4): regole esatte del piano di aggiornamento: (a) aggiunta solo per chiavi nuove rispetto alla vecchia voce e assenti dalla copia (una chiave tolta a mano non torna); (b) un campo si aggiorna solo se nella copia è uguale al vecchio valore del catalogo, altrimenti saltato `… : <campo> modificato a mano`; (c) con dati non si aggiornano `n_letture` **e `unita`** (un cambio di unità reinterpreterebbe i numeri salvati: lettura prudente di spec §6.3 "non tocca i valori che hanno dati"), saltato `… : <campo> non aggiornato, ci sono già misure`; nome e min/max sì; (d) etichette dei campi: nome, unità, minimo, massimo, letture; (e) parametri archiviati e senza chiave non si toccano; nome e icona dello strumento non cambiano — cost if wrong: un'unità corretta nel catalogo va ritoccata a mano negli esperimenti con dati.
Task 1: implementatore (opus) DONE_WITH_CONCERNS f801124 — 847 Vitest, 133 pgTAP (emulato); pkey di strumento_parametri ricreata (l'indice teneva il vecchio nome di colonna); la migration si ferma con PARAMETRO_IN_PIU_STRUMENTI se trova parametri in più strumenti; clonaConfig non copia gli strumenti archiviati; file rinominati EditorStrumento/SezioneStrumenti/PassoStrumenti; lettura tollerante di `passataId` nello store
Task 1: revisore (opus) avviato su a6fcec1..f801124
Task 1: review (opus) → Approved (0 Critical/Important); deviazioni 1–5 accettate; prova a mano della 0007 su dati del Piano 1 (doppione → stop senza modifiche; senza doppione misure intatte)
Task 1: minor (deferred): il messaggio di PARAMETRO_IN_PIU_STRUMENTI cita `strumento_parametri` ma dopo il rollback la tabella si chiama ancora col vecchio nome
Task 1: minor (carry to T5/T7): la violazione di `strumento_parametri_un_solo_strumento` mostra il generico "Esiste già un elemento…" → messaggio dedicato in `messaggioErrore` + controllo in `validaBozza` (T5) e in `SezioneStrumenti` (T7)
Task 1: minor (carry to T11): strumenti archiviati ancora nella scelta di `Campo.tsx` (nessuna UI archivia prima del T7)
Task 1: minor (deferred, primo deploy v3): bozza del wizard v1 scartata in silenzio; un client vecchio che manda `passate` crea un esperimento senza strumenti
Task 1: complete (commits a6fcec1..f801124, review clean)
Task 2: dispatched implementer (sonnet), BASE f801124
