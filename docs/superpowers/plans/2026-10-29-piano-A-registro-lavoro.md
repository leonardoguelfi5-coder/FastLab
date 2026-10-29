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
Ruling (T10): per la tabella fenologica non contano tutte le voci (una `Note` facoltativa vuota renderebbe ogni pianta "incompleta" per sempre e il giro non finirebbe mai): contano le voci obbligatorie; senza obbligatorie la pianta è `fatta` con almeno un valore. Per gli strumenti semplici (Ciras) contano tutti i valori attivi, come da piano. Strumento senza parametri attivi: `fatta` con almeno una misura — cost if wrong: una tabella fenologica senza obbligatori non segnala le voci dimenticate.
Ruling (T11): con una data di rilievo diversa da oggi la riga dice `<fatte>/<totale> il GG/MM` invece di `… oggi` — cost if wrong: copy tweak.
Ruling (T7): l'"Elimina" di uno strumento richiede di sapere se ha misure: nuova lettura `strumentiConDati(espId)` (hook con `staleTime: 0` come `useParametriConDati`); finché non si sa, niente Elimina. Gli strumenti archiviati si possono ripristinare — cost if wrong: una query in più nelle impostazioni.
Task 2: implementatore (sonnet) DONE_WITH_CONCERNS 7d428d0 — 883 Vitest, 136 pgTAP (emulato); `mantenutiPer(espId, strumentoId, data)` per il riquadro (usa lo strumento del riquadro, non quello dello store); segno `mantenuto` solo finché il valore resta quello di partenza; nessun segno su una bozza ripresa; rosso visto solo per FormMisura
Task 2: dispatched reviewer (sonnet) on 20a5d09..7d428d0
Task 10: dispatched implementer (sonnet) in parallelo alla revisione del T2 (solo file nuovi giro.ts/giro.test.ts, add esplicito), BASE 7d428d0
Task 10: implementatore (sonnet) DONE 45cc256 — 912 Vitest (29 nuovi); fenologica con obbligatorio vuoto ma altre voci scritte → `incompleta` (non `da_fare`)
Ruling: accettata la scelta `incompleta` per una pianta toccata senza le voci obbligatorie: va ripresa, non saltata (focus n. 2) — cost if wrong: nessuno
Task 10: dispatched reviewer (sonnet) on 4f24688..45cc256 (solo i due file nuovi)
Task 2: review (sonnet) → Needs fixes: (I1) una bozza ripresa perde il segno `mantenuto` (il valore mantenuto sembra digitato su quella pianta, focus n. 1)
Ruling: T2 fix round 1 = I1 + minor 2 (setStrumento/setData azzerano i mantenuti se strumento o data effettiva cambiano, salvo `tieniIlGiorno`), 3 (segno solo con la spunta attiva), 4 (il cursore non cade sulle caselle "Mantieni"), 5 (copiaProfonda al posto di structuredClone) — cost if wrong: small
Task 2: minor (deferred): con più letture il segno è solo sulla prima e sparisce cambiando la seconda (accettabile); ✓ della casella posizionato senza `top` → guardarlo su Safari iOS
Task 10: review (sonnet) → Approved (0 Critical/Important), 914 Vitest
Task 10: minor (carry to T9/T11/T12): non calcolare gli stati prima che la configurazione sia caricata (con `parametri` vuoto uno strumento risulterebbe senza parametri attivi → piante "fatte")
Task 10: minor (deferred): statiPiante O(piante × misure); id duplicati teorici; test di non mutazione solo per prossimaDaMisurare
Task 10: complete (commits 4f24688..45cc256, review clean)
Task 2: fix round 1 implemented cdaf525 (916 Vitest); re-review (sonnet) dispatched
Task 3: dispatched implementer (opus) in parallelo alla ri-revisione del T2 (add espliciti), BASE cdaf525
Task 2: re-review fix round 1 → Approved (916 Vitest)
Task 2: fix round 1/5 (5 addressed, 0 open; commits 20a5d09..cdaf525)
Task 2: complete (commits 20a5d09..cdaf525, review clean)
Task 3: implementatore (opus) DONE e5c5734 — 942 Vitest, 177 pgTAP (emulato); salvaVoceCatalogo senza controllaRighe (come gli altri upsert); lettura tollerante dei parametri JSON oltre il brief
Task 3: minor (carry to T6/T8): le chiavi dei valori di una voce non sono validate nel DB (vuote o doppie possibili) → l'editor del catalogo deve garantirle uniche e non vuote prima di salvare
Task 3: dispatched reviewer (opus) on 2d41382..e5c5734
Task 3: review (opus) → Approved (0 Critical/Important), 177 pgTAP, 942 Vitest; prova a mano come utente B (delete/truncate negati, firma altrui rifiutata, anon niente)
Ruling: fold into T3 fix round 1 i minor che rafforzano l'unica tabella condivisa: (1) trigger che vieta di cambiare `id` di una voce (gli id fissi dei semi restano fissi); (2) messaggio dedicato per la FK `strumenti_catalogo_id_fkey`; (3) `catalogo_strumenti.creato_da … on delete set null` (una voce condivisa sopravvive al suo autore); (4) in lettura i valori senza `chiave` si scartano. Si modifica direttamente la 0009, mai applicata fuori da questa sessione (DB emulato) — cost if wrong: small
Task 3: fix round 1 implemented 7e7bd47 (945 Vitest, 182 pgTAP); re-review (opus) dispatched
Task 4: dispatched implementer (opus) in parallelo alla ri-revisione del T3 (add espliciti), BASE 7e7bd47
Task 3: re-review fix round 1 → Approved (182 pgTAP, 945 Vitest, su copia esatta del commit)
Task 3: fix round 1/5 (4 addressed, 0 open; commits 2d41382..7e7bd47)
Task 3: minor (deferred): intestazione `aggiornato_il` fuori posto in catalogo.test.sql; chiavi doppie nella stessa voce da impedire nell'editor (T8, già nel brief)
Task 3: complete (commits 2d41382..7e7bd47, review clean)
Task 5: dispatched implementer (sonnet) in parallelo al T4 (semi in src/domain/modelli/semi.ts, non tocca i file del catalogo), BASE 7e7bd47+docs
Task 5: implementatore (sonnet) DONE_WITH_CONCERNS eb9b336 — 1011 Vitest (con il WIP del T4); SEMI_CATALOGO in src/domain/modelli/semi.ts confrontata con la migration (import ?raw); tolto anche "Aggiungi almeno un parametro."; la regola "parametro in più strumenti" conta anche gli archiviati (come l'indice del DB); hunk di errori.ts committati a parte dal WIP del T4
Task 5: possibile test instabile: SchedaPianta "cambiando pianta un Annulla rimasto in sospeso sparisce con la lista" fallito una volta sotto carico
Task 5: dispatched reviewer (sonnet) on 9eaa97a..eb9b336 (verifiche su copia esatta del commit)
Incidente: due implementatori in parallelo condividono l'indice git; il commit del T5 (eb9b336) ha incluso tutti i file del T4 messi in stage dall'altro agente e ha lasciato fuori il messaggio di errori.ts del T5, committato dal controller a parte (commit successivo). Storia non riscritta (eb9b336 già pushato): eb9b336 = T5 + T4.
Ruling: d'ora in poi un solo implementatore alla volta nel checkout; in parallelo solo revisori in sola lettura (verifiche su `git archive` del commit) — cost if wrong: meno parallelismo.
Task 4: implementatore (opus) DONE_WITH_CONCERNS (codice in eb9b336) — 46 test nuovi; `ordineMassimo` in CopiaStrumento; modifiche via nuova `aggiornaParametroDaCatalogo` (update dei soli 5 campi con controllaRighe, non l'upsert che ricreerebbe un parametro eliminato o ne toglierebbe l'archiviazione); `collegaParametri` estratta da salvaStrumento; min/max che invertirebbero l'intervallo → saltati; copie con catalogo_id diverso ignorate; applicaAggiornamento non transazionale (parametro aggiunto ma collegamento fallito → al giro dopo un doppione)
