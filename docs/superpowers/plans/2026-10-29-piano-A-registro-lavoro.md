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
Task 5: review (sonnet) → Approved (0 Critical/Important); 1010 Vitest, 182 pgTAP; la bozza Hydrochar (dai semi e da []) creata davvero con crea_esperimento nel DB emulato; test dei semi efficace (4 mutazioni della migration lo fanno fallire)
Task 5: minor (deferred): `normalizza` duplicata in hydrochar.ts e bozza.ts; parametro senza nome in due strumenti → messaggio con nome vuoto; la regola "in più strumenti" ignora i parametri archiviati (irraggiungibile in una bozza nuova)
Task 5: complete (commits 9eaa97a..af301ae, review clean; eb9b336 contiene anche il T4)
Task 4: review (opus) → Approved (0 Critical/Important), 1011 Vitest; deviazioni 1–9 accettate
Ruling: le modifiche dal catalogo passano da `aggiornaParametroDaCatalogo` (update dei soli campi, con controllaRighe) e non da `salvaParametro` come diceva il piano: l'upsert ricreerebbe un parametro eliminato o toglierebbe l'archiviazione — cost if wrong: nessuno
Ruling: fold into T4 fix round 1 i minor del focus n. 3: (1) se il collegamento di un parametro aggiunto fallisce, il parametro appena creato si elimina (non ha misure) e l'errore originale si rilancia; (2) `aggiornaParametroDaCatalogo` scrive solo i campi cambiati (non sovrascrive un ritocco fatto in Impostazioni tra lettura e applicazione); (3) nessuna aggiunta su uno strumento archiviato (le modifiche sì); (4) controllo difensivo `vecchia.id === nuova.id` — cost if wrong: small
Task 4: minor (deferred, piano successivo): nessuna guardia SQL su unità/letture di un parametro con dati (la regola è solo nel client, come nelle Impostazioni)
Task 4: minor (carry to T8): se `applicaAggiornamento` si ferma a metà, la pagina lo dice e "Riprova" usa la stessa voce vecchia (già nel brief del T8)
Task 4: fix round 1 implemented 7ecc502 (1018 Vitest); `VOCI_DIVERSE` se vecchia e nuova hanno id diversi (errore, non piano vuoto); re-review (opus) dispatched su copia del commit
Task 6: dispatched implementer (sonnet), BASE 7ecc502 (unico implementatore nel checkout)
Task 4: re-review fix round 1 → Approved (1018 Vitest su copia del commit)
Task 4: fix round 1/5 (4 addressed, 0 open; commits eb9b336 (parte T4)..7ecc502)
Task 4: minor (deferred): rete che cade tra salvataggio del parametro aggiunto e pulizia → orfano (serve una transazione nel DB); `VOCI_DIVERSE` mostrato come errore generico (errore di programmazione)
Task 4: complete (review clean)
Ruling (T12): arrivando su una pianta che ha già misure di quello strumento in quella data si chiede sempre "Correggi / Nuova misura", qualunque sia la provenienza. Il giro automatico raggiunge solo piante non fatte, ma una pianta incompleta ha già una misura: un'altra va decisa, non creata in silenzio. Una bozza non salvata da riprendere ha la precedenza sulla domanda — cost if wrong: un tocco in più sulle piante incomplete del giro.
Task 6: implementatore (sonnet) DONE_WITH_CONCERNS 8be4a83 — 1079 Vitest, build OK; `chiaviDaNomi` e `voceDaStrumento` in domain/catalogo.ts; vecchio editor a interruttori spostato in impostazioni/EditorInclusioneStrumento.tsx (lo elimina il T7); "Obbligatorio" solo nella tabella fenologica; "catalogo noto" per non resettare la bozza quando il catalogo si rilegge
Task 6: dispatched reviewer (sonnet) on e643c1c..8be4a83
Task 6: review (sonnet) → Needs fixes: (I1) un salvataggio lento nel catalogo, finito dopo un cambio di passo, sovrascrive la bozza con la versione vecchia (perdita di lavoro, riprodotto con un test)
Ruling: T6 fix round 1 = I1 (aggiornamenti della bozza con updater funzionale) + minor 1 (stesso id della voce per lo stesso modulo "Nuovo strumento", così un nuovo tentativo è idempotente), 2 (sul 23505 del nome il modulo resta aperto per rinominare o scegliere la voce esistente; solo un errore di rete aggiunge la copia non collegata, come da piano), 3 (con una bozza salvata non si aspetta il catalogo), 5 (pulsante del modulo `outline`: un solo inchiostro pieno), 6 (test: "Crea" da Hydrochar con 3 `catalogo_id` e le `catalogo_chiave`) — cost if wrong: small
Task 6: minor (deferred): riga "Catalogo non raggiungibile" persa al ripristino; modulo "Nuovo strumento" non conservato cambiando passo
Task 6: fix round 1 implemented 390e515 (1083 Vitest, build OK); `ModificaBozza` (bozza o funzione della bozza); stesso id della voce per lo stesso modulo; sul nome doppio il modulo resta aperto; "Ricomincia" disabilitato finché il catalogo non è noto; re-review (sonnet) dispatched su copia del commit
Note: test SchedaPianta "cambiando pianta un «Annulla» rimasto in sospeso sparisce con la lista" fallito di nuovo una volta in una corsa parziale (instabile sotto carico) → da guardare nella revisione finale
Task 9: dispatched implementer (sonnet), BASE 390e515 (unico implementatore)
Task 6: re-review fix round 1 → Approved (1083 Vitest, build OK, su copia del commit)
Task 6: fix round 1/5 (6 addressed, 0 open; commits e643c1c..390e515)
Task 6: minor (deferred): dopo un errore di rete arrivato comunque al server, un nuovo "+ Nuovo strumento" con lo stesso nome prende un id nuovo → 23505 (raro, coerente col piano); messaggio d'errore del modulo resta mentre si rinomina
Task 6: complete (commits e643c1c..390e515, review clean)
Task 9: implementatore (sonnet) DONE 8464ad6 — 1129 Vitest, build OK; `percorsoCampo` eliminato → percorsoHome/percorsoNuovaMisura/percorsoPiante/percorsoSezione; `percorsoMisura` (modifica) rinominato `percorsoModificaMisura`; Impostazioni e creazione → home; SchedaPianta → /misura; freccia di Campo → home
Task 9: dispatched reviewer (sonnet) on 232fbcd..8464ad6
Task 7: dispatched implementer (sonnet), BASE 8464ad6 (unico implementatore; revisore T9 su copia)
Task 9: review (sonnet) → Approved (0 Critical/Important), 1129 Vitest, build OK, su copia del commit
Task 9: minor (carry to T12): SchedaPianta aperta dall'elenco torna a /misura e, senza strumento scelto, rimbalza lì → con il T12 la freccia va all'elenco e lo strumento è quello dello store o il primo attivo (già nel brief)
Task 9: minor (carry to T11): la home legge le misure del giorno anche senza strumento scelto → `useMisureGiorno(strumentoId ? espId : undefined, …)`
Task 9: minor (carry to T13): DESIGN.md dice che le emoji sono ammesse solo come icona della passata → aggiornare (icone delle sezioni della home e degli strumenti); mockup della home ancora con Mappa e badge (riferimento storico); emoji dello strumento nello stato della striscia letta dai lettori di schermo
Task 9: complete (commits 232fbcd..8464ad6, review clean)

## Come riprendere (istruzione dell'utente, 29/10/2026)
Se i crediti di utilizzo finiscono, il lavoro riprende **in questa stessa sessione cloud** (non in un'altra app o sessione). Alla ripresa:
1. `git status` e `git log --oneline -5` sul branch `claude/app-review-improvements-c26294`: il lavoro non committato di un implementatore interrotto resta nel checkout; si controlla, si completa o si scarta con un nuovo implementatore sullo stesso task.
2. Si riparte dalla prima riga di "Avanzamento" senza `complete`. Ordine restante: T7 → T8 → T11 → T12 → T13 → revisione finale (opus) → un giro di correzioni.
3. I brief stanno nella scratchpad della sessione (`briefs/`); se non ci sono più, si riscrivono dal piano e dai Ruling di questo registro.
4. DB senza Docker: `pg_ctlcluster 16 main start`, poi `scripts/db-senza-docker/test-db.sh` (servono `postgresql-16-pgtap` e `libtap-parser-sourcehandler-pgtap-perl`, e `trust` per postgres in pg_hba).
Task 7: implementatore (sonnet) DONE_WITH_CONCERNS 3f7b7b2 — 1157 Vitest, build OK; `strumentiConDati` a pagine da 1000; logica in impostazioni/useStrumenti.ts; elenco "Valori senza strumento" (solo Archivia) per i parametri rimasti fuori da ogni strumento; tabella fenologica senza "Archivia" (l'indice unico conta anche le archiviate); "Parametri archiviati" → "Valori archiviati"; EditorInclusioneStrumento e SezioneParametri eliminati
Task 7: dispatched reviewer (sonnet) on 7b87068..3f7b7b2
Task 8: dispatched implementer (sonnet), BASE 3f7b7b2 (unico implementatore; revisore T7 su copia)
Task 7: review (sonnet) → Needs fixes: (I1) "Aggiungi dal catalogo" salva subito senza i controlli sui nomi doppi (due "gs", due "Calibro" nel DB; il DB non ha indici unici sui nomi)
Ruling: T7 fix round 1 (dopo la fine del T8, un implementatore alla volta) = I1 + m1 (eliminando un valore si toglie anche il suo collegamento dalla bozza) + m2 ("Elimina strumento" solo con `parametriConDati` noto, ricontrollo fresco) + m3 (messaggio per `strumenti_un_fenologico`) + m5 (la conferma di "Archivia strumento" dice che le modifiche non salvate si scartano) — cost if wrong: small
Task 7: minor (deferred): un valore fenologico ripristinato non compare nell'editor con bozza aperta; `strumentiConDati` legge tutte le misure (una RPC sarebbe più leggera)
Task 8: implementatore (sonnet) DONE b6ff4c4 — 1200 Vitest, build OK; `bozzaDaVoce`/`voceDaModifica`/`problemiVoce` nel dominio (chiave conservata su rinomina, chiavi riparate); descrizione nell'editor solo in modalità catalogo; toast `Strumento aggiunto al catalogo.` e `Strumento archiviato.`
Task 8: dispatched reviewer (sonnet) su copia; Task 7 fix round 1 dispatched (implementatore T7)
Task 8: review (sonnet) → Needs fixes: (I1) archiviazione con toast verde (`toastSalvato`), contro la regola "verde solo per salvato"; (I2) valori delle righe non in Geist Mono (`text-dato` non imposta la famiglia; stesso difetto in SceltaDalCatalogo del T6)
Ruling: T8 fix round 1 (dopo la correzione del T7) = I1 + I2 (anche in SceltaDalCatalogo) + m3 (attendere l'invalidazione del catalogo prima di tornare all'elenco, o `setQueryData`, così riaprendo subito non si parte dalla voce vecchia) + m4 (l'errore della fase esperimenti con "Riprova" resta finché non si riprova o si chiude) — cost if wrong: small
Task 8: minor (deferred): ramo `problemiVoce` in `salva()` difensivo e irraggiungibile (coperto dai test di dominio)
Task 7: fix round 1 implemented 3b7d3a5 (1207 Vitest, build OK); re-review (sonnet) dispatched su copia
Task 8: fix round 1 dispatched (implementatore T8)
Task 7: re-review fix round 1 → Approved (1207 Vitest, build OK, su copia)
Task 7: fix round 1/5 (5 addressed, 0 open; commits 7b87068..3b7d3a5)
Task 7: minor (deferred): tabella fenologica archiviata nel DB resta invisibile (ora l'errore è chiaro)
Task 7: complete (commits 7b87068..3b7d3a5, review clean)
Task 8: fix round 1 implemented 9534878 (1210 Vitest, build OK); re-review (sonnet) dispatched su copia
Task 11: dispatched implementer (sonnet), BASE 9534878 (unico implementatore)
Task 8: re-review fix round 1 → Approved (1210 Vitest, build OK, su copia)
Task 8: fix round 1/5 (4 addressed, 0 open; commits 411d79c..9534878)
Task 8: minor (deferred): il test "catalogo già riletto" non discrimina (mock troppo veloce); l'errore della fase esperimenti non ha "Chiudi"; un nuovo esito sostituisce l'errore pendente
Task 8: complete (commits 411d79c..9534878, review clean)
Task 11: implementatore (sonnet) DONE aa1950a — 1250 Vitest, 189 pgTAP (emulato), build OK; `Riprendi` a inchiostro pieno nella riga dello strumento in corso; tocco su uno strumento con misure non ancora caricate → prima pianta (il T12 chiede Correggi/Nuova se ha misure); home legge le misure solo con uno strumento scelto
Task 11: dispatched reviewer (sonnet) su copia
Task 12: dispatched implementer (opus), BASE aa1950a (unico implementatore)
Task 11: review (sonnet) → Approved (0 Critical/Important), 1250 Vitest, 189 pgTAP, build OK, su copia; deviazioni 1–2 accettate (non disabilitare le righe: la pagina resta usabile con poco segnale)
Task 11: minor (carry to T13/finale): `Riprendi` alto 52 px invece di 56; riga dei dati in `text-label` invece di `text-dato`; progresso perso se una rilettura in background fallisce (come la home)
Task 11: complete (commits 882ef80..aa1950a, review clean)
