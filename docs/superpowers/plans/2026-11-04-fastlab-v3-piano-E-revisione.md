# FastLab v3, Piano E: revisione dopo il collaudo (piano di implementazione)

> **Per gli agenti esecutori:** stesso metodo dei Piani A, B, C e D. Un implementatore alla volta nel checkout; i revisori lavorano in sola lettura su una copia `git archive` del commit; registro `docs/superpowers/plans/2026-11-04-piano-E-registro-lavoro.md`; commit per percorsi (`git commit -- <file>`); TDD (prima il test rosso, poi il codice). I passi usano checkbox (`- [ ]`).

**Obiettivo:** sistemare quello che l'utente ha trovato provando l'app in serra e portare dentro le proposte della revisione del 4 novembre, nell'ordine in cui si sentono:
- **subito** le correzioni rapide: il tasto "Avanti" della tastiera, il font, il riepilogo della scheda, l'eliminazione di uno strumento, lo spazio del progetto;
- **poi le priorità alte:** lavorare con poco segnale (timeout e bozze, coda d'invio, apertura senza rete), più spazio ai campi con la griglia delle piante, la condivisione con la sezione "Persone";
- **poi le medie e le basse**, raggruppate per zona dell'app.

**Fonti:**
- la pagina di revisione mostrata all'utente, con testi e mockup (scratchpad della sessione `revisione/revisione-fastlab.html`, riassunta qui sotto dove serve);
- il materiale con le decisioni e le cause trovate nel codice (scratchpad `briefs/piano-E-input.md`);
- le risposte dell'utente del 4 novembre 2026: **"B per il font, a per riepilogo, Si possono eliminare solo quelli senza misure. tutto il resto si"**.

Stile: `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`. Decisioni da non rompere: le righe `Ruling:` dei registri dei Piani 1, A, B, C e D. Dove questo piano ne cambia una, lo dice nel task e nel registro.

**Già fatto prima del piano:** il punto 6 (l'icona). Il commit `22871ab` porta l'icona nuova e il commit `e404b37` rinomina i file (`icon-v2-192.png`, `icon-v2-512.png`, `icon-v2-maskable-512.png`, `apple-touch-icon-v2.png`, `favicon-v2-64.png`) e mette `"id": "/"` nel manifest. Resta solo la prova sul telefono alla messa online (Task E16).

**Fuori da questo piano:**
- eliminare uno strumento **con** misure (l'utente ha scelto: solo quelli senza misure);
- i filtri per strumento sulla storia della pianta (variante B della pagina): l'utente ha scelto la variante A;
- modificare la configurazione, le note e le foto senza rete: la coda d'invio vale solo per le misure;
- i decimali dei sotto campi delle liste (i palchi): restano come oggi;
- lo scrittore dell'Excel in un Web Worker (rimandato dal Piano D, resta rimandato);
- eliminare un utente dal Dashboard di Supabase con esperimenti e appartenenze (FK senza cascata, rimandato dal Piano 1);
- la paginazione della RPC `ultime_misure_piante` (rimandata dal Piano B).

## Vincoli globali

Valgono tutti quelli dei Piani 1, A, B, C e D:
- italiano, **mai trattini lunghi** (né lungo né medio, U+2014 e U+2013) nei testi, nei commenti e nei messaggi;
- nessun merge su `main`, nessun push senza richiesta;
- migration nuove dopo `20261102000014`, mai riscrivere quelle esistenti;
- id generati dal client con `nuovoId()` e upsert per id;
- `controllaRighe` sugli update e sui delete;
- RLS su ogni tabella nuova, niente per `anon`, `creato_da` non aggiornabile, guardia `ESPERIMENTO_NON_MODIFICABILE`;
- conferme prima di scartare, eliminazione con "Annulla" per 5 s (`src/lib/eliminaConAnnulla.ts`);
- nessun dato perso in silenzio: un salvataggio che non arriva, una misura rifiutata, un file che manca si dicono a parole.

Stile `DESIGN.md`:
- righe da quaderno, niente card né ombre a riposo;
- font dei dati con cifre tabellari per numeri, date, ore, etichette delle piante (dal Task E2 è Atkinson Hyperlegible Mono);
- **numeri incolonnati:** ogni numero che si confronta con altri sta in colonna, allineato a destra quando è in una tabella o in un elenco di valori;
- **un solo inchiostro pieno** per schermata, al massimo il **10%** (pulsante principale, selezione, focus);
- **verde solo per "salvato"** (e solo quando il server l'ha confermato), mai per una pianta, un trattamento, una cella della griglia o un ruolo;
- bersagli di almeno **44 px**;
- mai solo colore: ogni stato ha anche testo, icona o forma.

Verifiche a fine di ogni task:
- `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run test:bundle`;
- con modifiche al database, `scripts/db-senza-docker/test-db.sh` (PostgreSQL 16 emulato senza Docker; se il cluster è fermo, `pg_ctlcluster 16 main start`) e la rigenerazione di `supabase/online/schema-completo.sql` con `scripts/sql-unico.sh`. Come da Ruling del Piano A, va confermato anche in locale con `npx supabase db reset` + `npm run test:db` quando possibile;
- dal Task E7, anche `node scripts/controlla-sw.mjs` dopo la build.

Punto di partenza: 2559 test Vitest, 377 test pgTAP in 11 file (fine del Piano D).

## Decisioni del piano (da verificare con l'utente)

1. **Ordine e rilasci intermedi.** I task seguono valore e rischio. Le migration sono tutte compatibili all'indietro (colonne nuove con default, funzioni con la stessa firma o nuove, policy che per i dati di oggi danno lo stesso esito), quindi il controller può applicarle e pubblicare a gruppi senza aspettare la fine:
   - **rilascio 1** dopo il Task E4: tasto "Avanti", font, riepilogo, elimina strumento, spazio (migration 0015);
   - **rilascio 2** dopo il Task E8: poco segnale, coda, apertura senza rete, griglia;
   - **rilascio 3** dopo il Task E10: Persone e Impostazioni a pagine (migration 0016);
   - **rilascio finale** dopo il Task E16 (migration 0017 e 0018).
   Ogni rilascio: prima la migration online (`apply_migration`, advisor di sicurezza), poi il deploy.
2. **Font: Atkinson Hyperlegible Next per il testo, Atkinson Hyperlegible Mono per i dati** (scelta B). Verificato su npm il 4/11:
   - `@fontsource-variable/atkinson-hyperlegible-next@5.3.0` e `@fontsource-variable/atkinson-hyperlegible-mono@5.3.0` (licenza OFL-1.1, pubblicati il 19/07/2026). Famiglie CSS `"Atkinson Hyperlegible Next Variable"` e `"Atkinson Hyperlegible Mono Variable"`, asse `wght` **200-800** variabile: i pesi 450, 550 e 650 dell'app si usano così come sono, nessuna mappatura. Sottoinsiemi `latin` e `latin-ext` (woff2 latino normale: Next circa 34 kB, Mono circa 18 kB);
   - Next ha la funzione `tnum` (cifre tabellari, che `tabular-nums` attiva) e `pnum`; Mono ha tutte le cifre larghe 632/1000 em (Geist Mono 600);
   - **glifi che mancano in entrambi** e arrivano dal font di sistema (come oggi per gran parte): `→`, `✓`, `≤`, `≥`, `⁻`, `⋯`, `✎`, `▲`, `▼` e **`µ`** (che Geist Mono aveva: le unità del Ciras, `µmol m⁻² s⁻¹`, mostrano la µ di sistema). Ci sono `« » … · § ± ° × ² ¹ ›`;
   - nessun font da CDN: i file arrivano con l'app (e dal Task E7 stanno nella cache del service worker).
3. **Riepilogo della scheda: variante A** (un blocco per strumento in cima), con sotto la storia completa nella forma della variante C (nome dello strumento scritto, valori su due colonne). I filtri della variante B non si fanno: l'utente ha scelto "a".
4. **Eliminare uno strumento: solo senza misure, ma sempre visibile.** Una RPC nuova `conteggi_strumenti` dà per ogni strumento misure, piante, prima e ultima data in una sola lettura (al posto di `strumentiConDati`, che scaricava tutte le misure a pagine e si fermava su una pagina corta). Con misure "Elimina" resta visibile e spiega: `Ha 312 misure di 56 piante, dal 14/10 al 03/11: non si può eliminare. Puoi archiviarlo: le misure restano.` con "Archivia". Vale anche per gli strumenti archiviati.
5. **Spazio del progetto:** RPC `spazio_progetto(p_esperimento)` security definer che dà solo numeri:
   - `database_byte` = `pg_database_size(current_database())`;
   - `foto_byte` = somma di `(metadata->>'size')::bigint` da `storage.objects` con `bucket_id = 'foto'`, cioè tutto il progetto, anche gli esperimenti degli altri (solo il totale, nessun nome);
   - per l'esperimento, solo se membro: numero di misure, note e foto, byte stimati delle righe (`pg_column_size`) e byte delle foto.
   Limiti del piano gratuito come costanti: database 500 MB, foto 1000 MB. **Ripiego:** se online la funzione non vede `storage.objects` (il ruolo proprietario della funzione senza `bypassrls` su una tabella che non è sua), `foto_byte` si somma da `public.foto` (`byte` più `byte_miniatura` dal Task E13, foto non archiviate), che è tabella del proprietario. Il controller lo verifica online al rilascio 1.
6. **Tasto "Avanti" della tastiera:** un contenitore unico `ModuloCampi` (`<form noValidate>`) decide che cosa fa Invio in tutti i moduli dell'app: porta al campo seguente del contenitore; sull'ultimo il tasto si chiama "Fatto" e **chiude solo la tastiera**, mai salva; i campi `type="date"` non ricevono mai il fuoco da "Avanti"; le aree di testo tengono l'a capo. La `BarraAzioni` ignora i tocchi per 400 ms dopo che la tastiera si chiude.
7. **Poco segnale, gradino (a):**
   - ogni richiesta a Supabase ha un limite di tempo: **12 s** per database, RPC e autenticazione; **90 s** per il caricamento di un file nello Storage (una foto da 350 KB con una sola tacca supera i 12 s);
   - un errore di rete o un limite scaduto dice `Rete debole: riprova.`; il messaggio sul database in pausa resta solo per le risposte 5xx del server senza codice PostgREST;
   - le bozze delle misure passano da `sessionStorage` a **`localStorage`**: sopravvivono alla chiusura dell'app. Restano legate all'utente (Ruling del Piano 1: si cancellano quando accede un utente diverso, mai all'uscita). Ognuna porta `scritta_il`; all'avvio si tolgono quelle **non toccate da 14 giorni**.
8. **Poco segnale, gradino (b): coda d'invio delle misure.**
   - "Salva" e "Salva e vai" scrivono la misura in una coda persistente in `localStorage` (scrittura sincrona: un'app chiusa un attimo dopo non la perde), aggiornano la cache e passano subito alla pianta dopo. La coda è **per utente** e contiene solo salvataggi di misure (`upsert` per id: ripetere è sicuro).
   - L'invio parte subito, poi da solo al ritorno della rete (`online`), quando l'app torna visibile, all'avvio dopo l'accesso dello stesso utente, e con attese crescenti (2, 5, 15, 30, 60 s) dopo un errore di rete. Una sola scheda invia alla volta (`navigator.locks` dove c'è).
   - **Il verde arriva solo con la conferma del server:** `Pianta #35 salvata ✓` compare quando la misura è arrivata, anche se si è già alla pianta dopo. Finché non arriva, nell'intestazione c'è `3 misure da inviare` (grafite, mai verde), che apre il pannello della coda con `Invia ora`.
   - Errori **definitivi** (RLS 42501, vincoli 23xxx, dati 22xxx, guardie P0001, 400 e 403 di PostgREST) non si ritentano: la misura resta nel pannello come `Non inviata` con il motivo, `Apri la pianta` e `Scarta` (con conferma). Errori **di passaggio** (rete, limite di tempo, 5xx, 408, 429, sessione scaduta) si ritentano.
   - Le misure in coda si vedono come salvate in tutta l'app: le letture delle misure del giorno e della pianta le **sovrappongono** ai dati del server (stesso id: vince la coda), così una rilettura non fa ricomparire "da fare" una pianta appena misurata. In elenco portano il segno `da inviare`.
   - "Esci" con misure in coda chiede conferma: `Ci sono 3 misure da inviare: partiranno al tuo prossimo accesso su questo telefono.` Un altro utente che accede non le vede e non le invia.
   - Se il `localStorage` non si può usare (navigazione privata, spazio finito) il modulo salva come oggi, direttamente, con l'errore e "Riprova".
9. **Poco segnale, gradino (c): aprire l'app senza rete.** La spec metteva "offline" tra gli anti-obiettivi; l'utente il 4/11 ha detto sì. La soluzione è quella che non può rompere un deploy:
   - **service worker con `vite-plugin-pwa` 1.3.0** (già nelle devDependencies, compatibile con Vite 8), strategia `generateSW`, che mette in cache **tutta la build** (html, js, css, font, icone, manifest), **compreso il chunk di exceljs e quello di fflate**. Un'app aperta resta coerente con la sua versione: il guasto del chunk di exceljs dopo un deploy (il vecchio indice chiedeva un file che non c'era più, e Vercel rispondeva con `index.html`) non può più capitare a una pagina controllata dal service worker;
   - **aggiornamento a richiesta, mai a metà lavoro:** `registerType: 'prompt'`, niente `skipWaiting` automatico. La versione nuova aspetta: si attiva da sola alla prossima apertura dell'app (tutte le finestre chiuse) oppure con `Nuova versione · Aggiorna` nel menu, che ricarica solo se non ci sono moduli con modifiche non salvate (altrimenti chiede);
   - **il service worker non tocca mai Supabase:** nessuna regola di cache a runtime per database, autenticazione o Storage; solo i file dell'app e il ripiego di navigazione su `index.html`;
   - `vercel.json`: `sw.js` con `Cache-Control: no-cache`; un file mancante sotto `/assets/` risponde 404 (oggi la regola di riscrittura risponde `index.html` con 200, che il browser legge come un modulo rotto); in più un gestore di `vite:preloadError` dice `È uscita una nuova versione: ricarica la pagina.` per i casi che restano (prima installazione);
   - **cache delle query persistente, solo un elenco chiuso:** elenco degli esperimenti, configurazione, misure del giorno, misure delle piante già lette, ultime misure per strumento. Scritta a mano con `dehydrate` e `hydrate` di React Query (nessuna dipendenza nuova), in `localStorage`, al massimo 2 MB (oltre si tolgono per prime le misure delle piante più vecchie), valida 7 giorni, legata a utente e versione dell'app (una build nuova la scarta). **Mai** in cache persistente: chi ha dati e chi no (decidono Elimina e Archivia), misure per strumento (Dataset, troppo grandi), foto e URL firmati, note, inviti, catalogo. Si cancella all'uscita e al cambio di utente;
   - senza rete i dati ricaricati si dicono: `Senza rete: dati letti il 04/11 alle 09:12.`; una pianta mai letta su quel telefono dice `Senza rete: questa pianta non è ancora stata letta su questo telefono.` invece di un caricamento senza fine;
   - **l'accesso senza rete:** un errore di rete nel rinnovo della sessione non è un'uscita. Si va ad "Accedi" solo senza sessione salvata o con una sessione rifiutata dal server.
   Se la revisione trova un rischio nella cache persistente, si ripiega su **solo shell e configurazione** (si toglie una riga dall'elenco chiuso).
10. **Più spazio ai campi e griglia delle piante.** L'intestazione della misura diventa una riga: `#35 · W1 · 34/56` (il numero della pianta resta l'unico testo grande). "Vai alla pianta" diventa un'icona da 44 px che apre un foglio dal basso con il campo numerico e la griglia `GrigliaPiante`: celle di almeno 44 px, **fatta** (inchiostro velato, ✓), **incompleta** (bordo inchiostro tratteggiato, segno `½`), **da fare** (foglio, bordo riga controllo), pianta attuale con l'anello del focus; legenda a parole sotto. Mai verde. La stessa griglia va nel fine giro, con "Valori di oggi" (media ± ES e n per trattamento, dalle stesse funzioni del Dataset) e "Da controllare" (`daSistemare` del Piano B).
11. **Persone: il modello dei permessi.** Oggi `is_membro` vale per tutto e nei dati c'è solo il proprietario (`aggiungi_proprietario`); il ruolo `collaboratore` esiste nel vincolo ma in nessuna riga. Proposta:

    | Che cosa | Proprietario | Rilevatore | Lettore |
    |---|---|---|---|
    | Vedere tutto, Dataset, Esporta, export salvati propri, Duplica | sì | sì | sì |
    | Misure, note, foto: creare, correggere, eliminare (anche quelle degli altri) | sì | sì | no |
    | Configurazione (generale, fattori, trattamenti, piante, parametri, strumenti, fenologia) | sì | no | no |
    | Stato (concluso), archivio .zip e "Libera lo spazio", eliminare l'esperimento | sì | no | no |
    | Persone: aggiungere, cambiare ruolo, togliere | sì | no | no |
    | Vedere chi è nell'esperimento | sì | sì | sì |

    - **Chi modifica la configurazione: solo il proprietario.** Un parametro archiviato, un trattamento cambiato o una pianta eliminata toccano i dati di tutti; il lavoro del rilevatore è misurare. Chi ha bisogno di cambiare la configurazione riceve il ruolo di proprietario.
    - **Chi invita: solo il proprietario**, e solo colleghi **già registrati** (la registrazione resta su invito dell'amministratore). Un'email senza account dice `Nessun utente registrato con questa email: chiedi all'amministratore di invitarlo.`
    - **Più proprietari ammessi, mai zero:** il proprietario può dare il ruolo di proprietario a un collega (chi passa la tesi a un altro); né `togli_membro` né un cambio di ruolo possono lasciare l'esperimento senza proprietari (`ULTIMO_PROPRIETARIO`).
    - **Il rilevatore corregge anche le misure degli altri:** il quaderno è della squadra; `creato_da` resta e dice chi ha misurato.
    - Gli export salvati restano personali per tutti i membri, lettori compresi (Ruling del Piano D). Il catalogo resta di tutti gli utenti registrati.
    - Il ruolo `collaboratore` diventa `rilevatore` (nessuna riga da convertire, ma l'`update` è nella migration per sicurezza).
    - L'interfaccia nasconde ciò che il ruolo non permette e lo dice (`Solo il proprietario modifica la configurazione.`); la guardia vera è il database. Un 42501 diventa `Non hai il permesso per questa modifica: chiedi al proprietario dell'esperimento.`
12. **Impostazioni a pagine, insieme a Persone.** La divisione in sotto pagine (media n. 10) si fa subito dopo il database di Persone, perché "Persone" e "Spazio" sono due delle sue pagine: farle insieme evita di toccare due volte la pagina lunga.
13. **Il giro, più scorrevole (medie 4-8):**
    - **valore anomalo:** avviso non bloccante quando un numero è almeno **3 volte** più grande o più piccolo dell'ultimo valore della stessa pianta per lo stesso parametro (entrambi positivi), o cambia segno con uno scarto più grande dell'ultimo valore; niente avviso con l'ultimo valore 0, per le liste e per i parametri "solo interi" con l'ultimo valore sotto 5. Prende i tipici errori di battitura (412 al posto di 41,2) senza avvisare per la crescita normale. Da ritoccare dopo l'uso, come la soglia del Piano B;
    - **meno domande:** su una pianta **incompleta con una sola misura** di quello strumento in quel giorno si apre direttamente il completamento di quella misura, con la riga `Completi la misura delle 09:12 · Aggiungine un'altra`. La domanda resta per le piante fatte e per quelle con più misure, e "Nuova misura" diventa `Aggiungi un'altra misura`. **Cambia il Ruling del Piano A (T12)** "si chiede sempre";
    - **"Mantieni":** il testo diventa `Mantieni per le prossime piante` (una riga a 360 px), niente puntina: un'icona da imparare è peggio di quattro parole;
    - **ritorno:** misurando dalla scheda, dopo il salvataggio si torna alla scheda; l'elenco delle piante conserva ricerca e blocchi aperti nella URL e lo scorrimento in `sessionStorage`;
    - **ordine del giro:** `Come nelle impostazioni` (campo `ordine`, il default), `Per etichetta` (ordine naturale: 2 prima di 10), `Per blocco`, più `Al contrario`; scelto in SceltaStrumento, salvato per esperimento nello store di campo. Nelle Impostazioni le piante si riordinano (su e giù da 44 px, `Ordina per etichetta`, `Ordina per blocco`).
14. **Decimali e interi per parametro:**
    - `parametri.decimali smallint null` (0-6; `null` = come oggi) e `parametri.solo_interi boolean not null default false`, solo per i parametri `numero`; con `solo_interi`, `decimali` è 0 o vuoto;
    - un valore si mostra con i suoi decimali; **una media o un ES con un decimale in più** (con "solo interi": un decimale), così la media di `N frutti` non diventa un intero;
    - "solo interi": tastiera `numeric` ed errore bloccante `Scrivi un numero intero.`; i negativi: tastiera `decimal` con un pulsante `±` da 44 px accanto al campo (oggi la tastiera è quella del testo);
    - l'Excel resta a precisione piena (Ruling del Piano D); il catalogo porta i due campi e li aggiorna anche con misure (cambiano solo come si mostrano e si controllano i valori nuovi);
    - `crea_esperimento` si ricrea per leggere i due campi dalla bozza (come la 0009 per il catalogo).
15. **Miniature delle foto:** al caricamento si crea anche una miniatura di 320 px sul lato lungo (circa 25 KB), salvata come `<esperimento>/<id>_m.jpg`. Colonne `foto.miniatura boolean` e `foto.byte_miniatura int`; `esperimento_della_foto` accetta anche `_m.jpg`. Galleria, storia e scheda usano la miniatura; le foto vecchie l'originale. Lo .zip contiene solo gli originali; "Libera lo spazio" ed eliminazione tolgono entrambi i file. Una miniatura che non si carica non ferma la foto (resta `miniatura = false`).
16. **Diario, parole, account:**
    - Diario: ricerca nel testo (senza badare a maiuscole e accenti), filtri `Promemoria`, pianta o trattamento, periodo (la forma del Dataset), intestazioni per mese; tutto nella URL;
    - glossario: **parametro** (ciò che si misura: SPAD, Temp aria), **misura** (un salvataggio di uno strumento su una pianta a una certa ora), **valore** (il numero o la risposta), **lettura** (una delle ripetizioni), la pianta sempre `#35` (in testa alla frase `Pianta #35`); una sola funzione `rigaStrumento` per la riga sotto il nome di uno strumento;
    - "Cambia password" nel menu; il link d'invito porta il codice nel frammento: `/registrati#codice=XXXX` (il frammento non arriva al server né ai log di Vercel); `?codice=` si accetta lo stesso.
17. **Basse:**
    - "scarto" delle letture ripetute = massimo − minimo (si vede subito una lettura sbagliata): `media 41,3 · scarto 1,2`;
    - eliminare un esperimento: solo il proprietario, con il nome da scrivere; i conclusi in una sezione chiusa in fondo;
    - "Elimina misura" con "Annulla" per 5 s; una misura ancora in coda si toglie dalla coda;
    - ricerca piante con tastiera numerica se tutte le etichette sono numeri (`etichetteNumeriche`);
    - catalogo: elenco `Archiviati` con `Ripristina`, e chi ha creato e chi ha modificato per ultimo la voce (email), con la colonna nuova `catalogo_strumenti.modificato_da` (migration 0016);
    - prestazioni: dopo un salvataggio le misure del giorno non si rileggono (la cache è già aggiornata); `caricaConfig` legge le piante a pagine keyset (oltre 1000 non si troncano più).

## Migration nuove

| File | Task | Contenuto |
|---|---|---|
| `20261104000015_conteggi_spazio.sql` | E4 | `conteggi_strumenti`, `parametri_con_dati` in un passaggio solo, `spazio_progetto` |
| `20261104000016_ruoli_persone.sql` | E9 | ruoli, `ruolo_in`, `puo_scrivere`, `puo_configurare`, tutte le policy riviste (anche Storage), `membri_di`, `aggiungi_membro`, `togli_membro`, `riepilogo_esperimenti` con il ruolo, `catalogo_strumenti.modificato_da` e `autori_catalogo` |
| `20261104000017_decimali.sql` | E12 | `parametri.decimali`, `parametri.solo_interi`, vincoli, `crea_esperimento` ricreata |
| `20261104000018_miniature.sql` | E13 | `foto.miniatura`, `foto.byte_miniatura`, `esperimento_della_foto` con `_m.jpg`, grant |

Ogni migration ha il suo file pgTAP; `rls.test.sql` resta verde (RLS su ogni tabella, niente per anon).

## Struttura dei file

```
supabase/migrations/20261104000015_conteggi_spazio.sql   (E4)
supabase/migrations/20261104000016_ruoli_persone.sql     (E9)
supabase/migrations/20261104000017_decimali.sql          (E12)
supabase/migrations/20261104000018_miniature.sql         (E13)
supabase/tests/conteggi_spazio.test.sql, ruoli.test.sql, decimali.test.sql, miniature.test.sql
supabase/online/schema-completo.sql                      rigenerato a ogni migration
src/components/ModuloCampi.tsx (+ test)                  Invio → campo seguente, enterkeyhint, "Fatto" (E1)
src/components/BarraAzioni.tsx (+ test)                  tocchi ignorati 400 ms dopo la tastiera (E1)
src/main.tsx, src/index.css, src/lib/graficoPng.ts, src/domain/grafico.ts, src/components/dataset/GraficoSvg.tsx (E2)
src/components/scheda/UltimiValori.tsx, StoriaPianta.tsx, VociMisura.tsx, src/domain/statistiche.ts (E3)
src/api/configurazione.ts, src/api/spazio.ts, src/domain/spazio.ts (E4)
src/components/impostazioni/SezioneSpazio.tsx (al posto di SezioneSpazioFoto), ModificaStrumento.tsx, StrumentiArchiviati.tsx (E4)
src/lib/supabase.ts, src/lib/rete.ts (+ test), src/lib/errori.ts, src/components/scheda/bozza.ts (E5)
src/lib/coda/codaMisure.ts, src/lib/coda/invio.ts, src/lib/coda/sovrapponi.ts (+ test) (E6)
src/components/coda/IndicatoreCoda.tsx, PannelloCoda.tsx (E6)
vite.config.ts, vercel.json, index.html, src/lib/aggiornamento.ts, src/lib/cachePersistente.ts (+ test), scripts/controlla-sw.mjs (E7)
src/components/giro/GrigliaPiante.tsx, FoglioPiante.tsx, src/domain/giro.ts, src/pages/MisuraPianta.tsx, src/pages/FineGiro.tsx (E8)
src/api/persone.ts (+ test), src/lib/useRuolo.ts (E9)
src/pages/impostazioni/* (indice e sotto pagine), src/components/impostazioni/SezionePersone.tsx (E10)
src/domain/misure.ts (anomalo), src/components/scheda/SceltaArrivo.tsx, src/components/misura/FormMisura.tsx, src/store/campo.ts (E11)
src/lib/numeri.ts (formattaValore, formattaMediaDi), src/components/config/EditorParametro.tsx, src/pages/Catalogo.tsx (E12)
src/lib/immagini.ts, src/api/foto.ts, src/components/foto/*, src/components/impostazioni/archivioFoto.ts (E13)
src/pages/Diario.tsx, src/domain/diario.ts, src/domain/parole.ts, src/components/AppShell.tsx, src/pages/Registrati.tsx, src/pages/AdminInviti.tsx (E14)
src/pages/Esperimenti.tsx, src/pages/ModificaMisura.tsx, src/pages/ElencoPiante.tsx, src/pages/Foto.tsx, src/components/misura/CampoNumero.tsx, src/pages/Catalogo.tsx, src/api/esperimenti.ts (E15)
README.md, DESIGN.md, PRODUCT.md, .impeccable/design.json, package.json, package-lock.json
```

---

### Task E1: il tasto "Avanti" della tastiera (Sonnet)

Causa (verificata): nessun campo ha `enterKeyHint` né gestisce Invio (`src/components/NumericField.tsx:68-72`, `src/components/misura/CampoTesto.tsx`, `src/pages/wizard/PassoGenerale.tsx:21-46`, `PassoPiante.tsx:71-90` e `145-160`, `src/components/config/CampoNumero.tsx`). Il browser decide da solo: salta al campo seguente della pagina intera, apre il calendario della data o chiude la tastiera; la barra in basso scende e il pulsante principale finisce sotto il dito.

- [ ] `src/components/ModuloCampi.tsx`:
  ```tsx
  interface ModuloCampiProps { children: ReactNode; className?: string }
  export function ModuloCampi(p: ModuloCampiProps): JSX.Element   // <form noValidate onSubmit={e => e.preventDefault()}>
  export const SELETTORE_CAMPI = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="date"]):not([disabled]):not([readonly]), textarea:not([disabled])'
  export function campiDi(contenitore: HTMLElement): HTMLElement[]   // nell'ordine del documento, solo visibili
  ```
  - `keydown` Invio su un `input` (non su una `textarea`, non con `isComposing`): `preventDefault`, fuoco al campo seguente di `campiDi`; sull'ultimo `blur()` (chiude la tastiera). **Mai** un submit, mai un clic su un pulsante;
  - dopo ogni disegno (e con un `MutationObserver` sul contenitore) imposta `enterkeyhint="next"` su ogni input tranne l'ultimo (`"done"`); le `textarea` restano senza (Invio va a capo);
  - `SELETTORE_CAMPI` sostituisce il selettore di `ModuloOggi.tsx:203` (stesso significato, più i `date` esclusi): una sola definizione.
- [ ] Usarlo in: `ModuloOggi` (intorno a `FormMisura`), `ModificaMisura`, ogni passo di `NuovoEsperimento` (`PassoGenerale`, `PassoPiante`, `PassoStrumenti`, `PassoFenologica`), gli editor delle Impostazioni (`EditorParametro`, `EditorStrumento`, `AggiungiPiante`, `SezioneGenerale`), `EditorNota`. I moduli che hanno già un `<form>` con un'azione esplicita ("Vai alla pianta", "Cerca pianta", Accedi, Registrati, "Salva questa scelta") restano come sono: lì Invio fa quello che dice il pulsante accanto.
- [ ] `BarraAzioni`: ricorda l'istante in cui `data-tastiera` sparisce; per **400 ms** un `pointerdown` o un `click` nella barra (fase di cattura) si ferma (`preventDefault` + `stopPropagation`). Costante `ATTESA_DOPO_TASTIERA_MS = 400` esportata.
- [ ] Test (TDD):
  - Invio su un campo numerico porta al seguente, salta il `date`, sull'ultimo toglie il fuoco senza chiamare `onSubmit` né il pulsante "Salva e vai" (spia);
  - `enterkeyhint` giusto su primo, mezzo e ultimo campo, anche dopo l'aggiunta di una lettura o di una riga di lista;
  - Invio in una `textarea` va a capo;
  - `BarraAzioni`: con `visualViewport` finto, la tastiera che si chiude e un clic dopo 100 ms non arriva al pulsante; dopo 450 ms sì (timer finti);
  - wizard: Invio nel "Nome" non passa al passo seguente.
- Commit: `fix: il tasto Avanti della tastiera porta al campo seguente, mai a un'altra pagina`.

### Task E2: il font Atkinson Hyperlegible (Sonnet)

- [ ] `npm install @fontsource-variable/atkinson-hyperlegible-next@5.3.0 @fontsource-variable/atkinson-hyperlegible-mono@5.3.0` (versioni esatte), `npm uninstall @fontsource-variable/geist @fontsource-variable/geist-mono`; nel lockfile cambiano solo le loro voci (`npx npm@11` come nel Piano D se serve a non perdere i campi `libc`).
- [ ] `src/main.tsx` righe 4-5: gli import dei due `index.css` nuovi (solo i volti normali, niente corsivo).
- [ ] `src/index.css` righe 121-122:
  ```css
  --font-sans: "Atkinson Hyperlegible Next Variable", system-ui, sans-serif;
  --font-mono: "Atkinson Hyperlegible Mono Variable", ui-monospace, Consolas, monospace;
  ```
  e il commento in testa al file.
- [ ] Il grafico (Piano D):
  - `src/lib/graficoPng.ts`: `fontGeistMono` diventa `fontDati()`, con il file `@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2?url`;
  - `GraficoSvg`: `@font-face` con `font-family:"Atkinson Hyperlegible Mono Variable"` e `font-weight:200 800`;
  - `src/domain/grafico.ts`: `FONT_DATI` e `LARGHEZZA_CARATTERE` ricalcolata dall'avanzamento del Mono (632/1000 em per il corpo del grafico: circa 6,95 a 11 px; oggi 6,6 per Geist Mono);
  - `scaricaExcel.ts` chiama `fontDati`.
- [ ] `DESIGN.md`: intestazione YAML (le `fontFamily` di tutte le voci di `typography`), sezione 3 (nomi, carattere: "disegnato per la leggibilità: ogni lettera e cifra ha una forma che non si confonde, Il1 0O 5S 8B"), le regole che citano Geist Mono, la riga sui glifi di sistema (µ e simboli). `.impeccable/design.json`: i `font` dei componenti e le regole. `README.md`: dipendenze. I commenti del codice che dicono "Geist Mono" diventano "il font dei dati" (`grep -rn Geist src` vuoto alla fine, test compresi).
- [ ] Controllo a vista a 360 px (dev server o test di impaginazione dove ci sono): "Salva e vai alla #36", chip degli strumenti, griglia, intestazione della scheda, barra dei filtri del Dataset; il Mono è circa il 5% più largo di Geist Mono.
- [ ] Test: `fontDati` con `fetch` che fallisce → `null`; `renderToStaticMarkup(<GraficoSvg perImmagine …/>)` contiene la famiglia nuova; nessun import di `@fontsource-variable/geist` (test o `grep` nel controllo del bundle).
- Commit: `feat: font Atkinson Hyperlegible Next e Mono`.

### Task E3: il riepilogo della scheda della pianta (Sonnet)

Oggi (verificato): `UltimiValori.tsx` mostra per strumento "nome valore · 3 giorni fa" con la freccia senza differenza e il confronto in una riga sotto; esclude testo e sì/no; la storia (`StoriaPianta.tsx`) scrive ogni misura in una riga sola con la sola emoji dello strumento.

- [ ] Dominio, in `src/domain/statistiche.ts` (riusa `ultimiValoriPianta`):
  ```ts
  interface RigaRiepilogo {
    parametro: Parametro
    ultimo: { data: string; valore: number | string | boolean; n?: number }  // n: elementi di una lista
    differenza: number | null      // ultimo − precedente (numeri e liste), null senza precedente
    tendenza: 'su' | 'giu' | 'uguale' | null
    dataPropria: boolean           // la data del valore è diversa da quella del blocco
  }
  interface BloccoRiepilogo { strumento: Strumento; data: string; righe: RigaRiepilogo[] }
  riepilogoPianta(config, misure): BloccoRiepilogo[]   // strumenti nell'ordine della configurazione, archiviati esclusi
  ```
  - la data del blocco è quella dell'ultima misura dello strumento; una riga con un valore più vecchio lo dice (`dataPropria`);
  - numeri: valore giornaliero come oggi (media delle letture e delle misure del giorno); liste: numero di elementi; sì/no e testo (le voci della fenologia): ultimo del giorno, senza freccia.
- [ ] `UltimiValori.tsx` → blocchi della variante A:
  - intestazione: `<icona> <Nome strumento> · 03/11 · 1 g fa` (Title per il nome, data e "fa" nel font dei dati);
  - righe di quaderno su tre colonne: parametro (grafite tenue) | ultimo valore con unità, **cifre a destra** in colonna | freccia `▲ 1,1`, `▼ 0,8` o `=` con la differenza (grafite tenue; a chi non vede: `in aumento di 1,1 rispetto al 31/10`);
  - la media del trattamento (il `Confronto` di oggi) va **a parte**, sotto il blocco, in grafite tenue: `Media del trattamento W1 il 03/11: 40,8`; il segno `fuori dal gruppo` resta;
  - le liste mostrano il conteggio e si aprono con `›` (44 px) sui loro elementi; il testo lungo si taglia a una riga e si apre allo stesso modo.
- [ ] `StoriaPianta.tsx` nella forma della variante C: per ogni misura una prima riga `09:12 · 💚 SPAD` (nome scritto, l'icona `aria-hidden`), sotto i valori su **due colonne** (nome a sinistra, valore a destra, cifre in colonna; con più di 4 valori, due coppie per riga a partire da 360 px solo se ci stanno senza troncare). Note e foto come oggi. `VociMisura` resta per le altre righe in linea (ElencoOggi, SceltaArrivo).
- [ ] Ordine della scheda: dati della pianta, **riepilogo**, "Misura questa pianta", storia completa, note e foto (come oggi sotto).
- [ ] Test: blocchi per strumento nell'ordine, data e "fa" giusti, riga con data propria; differenza e freccia (su, giù, uguale, nessuna senza precedente); lista con conteggio e `›`; sì/no e testo senza freccia; media del trattamento separata e assente senza altre piante; storia con nome dello strumento scritto e valori in due colonne; archiviati esclusi dal riepilogo ma presenti nella storia con `(archiviato)`.
- Commit: `feat: scheda della pianta con un blocco per strumento e storia leggibile`.

### Task E4: eliminare uno strumento e lo spazio del progetto (Opus)

Database e interfaccia insieme: la migration è piccola e la UI dipende da lei.

- [ ] Migration `20261104000015_conteggi_spazio.sql`:
  - `conteggi_strumenti(p_esperimento uuid) returns table (strumento_id uuid, misure bigint, piante bigint, prima date, ultima date)`, `security invoker`, `stable`, `search_path = ''`: un `group by strumento_id` sulle misure dell'esperimento (usa l'indice `misure (esperimento_id, strumento_id, id)` della 0014). Solo strumenti con almeno una misura;
  - `parametri_con_dati` ricreata con la **stessa firma** e lo stesso risultato in un solo passaggio sulle misure (`select distinct jsonb_object_keys(valori)` dell'esperimento, poi il join con i parametri) invece di un `exists` per parametro;
  - `spazio_progetto(p_esperimento uuid) returns jsonb`, `security definer`, `stable`, `search_path = ''`, `revoke … from public, anon`, `grant … to authenticated`; senza `auth.uid()` (chiamata senza sessione) restituisce `null`. Forma:
    ```json
    { "database_byte": 41234567, "foto_byte": 210000000,
      "esperimento": { "misure": 3120, "note": 14, "foto": 85, "dati_byte": 1830000, "foto_byte": 29000000 } }
    ```
    `esperimento` è `null` se chi chiama non è membro (anche per un id che non esiste). Fonti nella Decisione 5, con il ripiego scritto in un commento;
  - nessuna tabella nuova.
- [ ] pgTAP `conteggi_spazio.test.sql`:
  - conteggi giusti per due strumenti (misure, piante distinte, prima e ultima data); uno strumento senza misure assente; un non membro riceve zero righe (RLS);
  - `parametri_con_dati` dà lo stesso insieme di prima su un caso con parametri con e senza dati, liste e chiavi estranee (i test di `rpc.test.sql` restano verdi);
  - `spazio_progetto`: `database_byte > 0`; `foto_byte` somma gli oggetti del bucket `foto` di **due** esperimenti, anche quello di cui non si è membri; ignora gli altri bucket; `esperimento` con i conteggi per un membro, `null` per un non membro; anon non la esegue; nessun nome di file o esperimento altrui nel risultato.
- [ ] `src/api/configurazione.ts`: via `strumentiConDati` (e il suo ciclo a pagine che si fermava su una pagina corta); al suo posto `conteggiStrumenti(espId): Promise<Map<string, ConteggioStrumento>>`. Hook `useConteggiStrumenti` con `staleTime: 0` (decide "Elimina"), chiave sotto `config` come prima.
- [ ] `src/api/spazio.ts`: `spazioProgetto(espId)` e il tipo; `src/domain/spazio.ts`: `LIMITE_DATABASE_BYTE = 500_000_000`, `LIMITE_FOTO_BYTE = 1_000_000_000` (oggi `LIMITE_SPAZIO_BYTE` in `domain/foto.ts`, che diventa un rimando), `quota(byte, limite)` con la soglia dell'80% di oggi. `spazioFoto` (somma lato client a pagine) si toglie.
- [ ] `ModificaStrumento.tsx`:
  - azioni dello strumento **in alto**, subito sotto il nome, non in fondo all'editor: `Archivia strumento` e `Elimina strumento`, sempre visibili per uno strumento salvato;
  - senza misure (conteggio noto e zero): `Elimina` con la conferma di oggi;
  - con misure: il tocco su `Elimina` apre la spiegazione (Decisione 4) con `Archivia` e `Chiudi`; mai un'eliminazione;
  - finché il conteggio non è arrivato: `Elimina` disabilitato con `Conto le misure…` (pochi decimi di secondo con la RPC); lettura fallita: messaggio con `Riprova`;
  - un 23503 di `misure_strumento_id_esperimento_id_fkey` (misure arrivate nel frattempo) → `Nel frattempo sono arrivate misure di questo strumento: si può solo archiviare.` in `messaggioErrore`.
- [ ] `StrumentiArchiviati` / `ElencoArchiviati`: accanto a `Ripristina`, `Elimina` per gli archiviati senza misure (con conferma), e la stessa spiegazione per quelli con misure.
- [ ] `SezioneSpazio.tsx` al posto di `SezioneSpazioFoto` (stesso posto nelle Impostazioni fino al Task E10):
  - due righe con barra: `Database 38 / 500 MB` e `Foto 210 / 1000 MB` (cifre nel font dei dati, a destra; barra grafite tenue, attenzione oltre l'80%, mai verde, `role="progressbar"` con etichetta);
  - `Questo esperimento: 3.120 misure, 14 note, 85 foto · circa 31 MB`;
  - la riga `Anche vuoto, il database occupa qualche decina di MB (tabelle e sistema di Supabase).` e `I numeri sono di tutto il progetto, anche degli esperimenti di altri.`;
  - sotto, l'archivio .zip e "Libera lo spazio" (`ArchivioFoto`) come oggi.
- [ ] Test: `ModificaStrumento` con conteggio zero, con misure (spiegazione con numeri e date, `Archivia` che archivia), in attesa, in errore; archiviato senza misure eliminabile; 23503 tradotto; `SezioneSpazio` con i due totali, la soglia, il dettaglio, errore con `Riprova`; mapper della RPC.
- [ ] Rigenera `schema-completo.sql`; verifica completa.
- Commit: `feat: elimina strumento sempre visibile e spazio di tutto il progetto`.

### Task E5: poco segnale, gradino (a) (Opus)

- [ ] `src/lib/rete.ts`:
  ```ts
  export const LIMITE_RICHIESTA_MS = 12_000
  export const LIMITE_CARICAMENTO_MS = 90_000
  export class ErroreRete extends Error { constructor(public motivo: 'limite' | 'rete') }
  export function fetchConLimite(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  ```
  - limite per URL: `/storage/v1/object/` con metodo `POST` o `PUT` → 90 s, tutto il resto 12 s;
  - unisce il segnale del chiamante e quello del limite (`AbortSignal.any` dove c'è, altrimenti un `AbortController` a mano: Safari prima della 17.4); un annullamento del chiamante resta un `AbortError` del chiamante, un limite scaduto diventa `ErroreRete('limite')`, un `TypeError` di rete `ErroreRete('rete')`;
  - il timer si libera sempre.
- [ ] `src/lib/supabase.ts`: `createClient(url, chiave, { global: { fetch: fetchConLimite } })`.
- [ ] `src/lib/errori.ts`:
  - `ErroreRete` e i messaggi `Failed to fetch|NetworkError|Load failed` → `Rete debole: riprova.`;
  - `navigator.onLine === false` → `Nessuna connessione: riprova quando torna la rete.` (come oggi);
  - il messaggio del database in pausa (`MSG_SERVER`, oggi a riga 88 per ogni errore di rete) solo per uno `status` 5xx senza `code` PostgREST;
  - test per ognuno, e i test esistenti che si aspettavano `MSG_SERVER` su "Failed to fetch" aggiornati.
- [ ] `src/components/scheda/bozza.ts` (`bozza.ts:44-85`): `sessionStorage` → `localStorage`, con:
  - `scritta_il` (istante ISO) in ogni bozza; `pulisciBozzeVecchie(adesso)` toglie quelle con più di 14 giorni (e le illeggibili), chiamata all'avvio in `main.tsx` dopo `svuotaCacheAlCambioUtente`;
  - il proprietario (`fastlab-bozza:utente`) anch'esso in `localStorage`; `assegnaBozze` e `cancellaTutteLeBozze` invariati nel significato (Ruling del Piano 1: mai all'uscita);
  - una lettura una tantum: le bozze rimaste in `sessionStorage` dalla versione di prima si spostano in `localStorage` al primo avvio (nessuna si perde col rilascio);
  - le bozze delle note (`src/components/note/bozzaNota.ts`, oggi anch'esse in `sessionStorage`) seguono la stessa regola.
- [ ] Test: limite scaduto (timer finti) → `ErroreRete('limite')` e messaggio "Rete debole"; il caricamento di un file non scade a 12 s; annullamento del chiamante non diventa "Rete debole"; segnali uniti anche senza `AbortSignal.any`; bozza sopravvive a un `sessionStorage` vuotato; pulizia dopo 14 giorni e non prima; utente diverso cancella, uscita no; spostamento dalla sessione.
- Commit: `feat: limite di tempo alle richieste, messaggio di rete debole e bozze che restano`.

### Task E6: poco segnale, gradino (b), la coda d'invio delle misure (Opus)

Riguarda `ModuloOggi.tsx` (righe 231-322: `salva` e `salvata`), `ModificaMisura.tsx`, `src/api/query.ts:47` (il `QueryClient`) e gli hook delle misure.

- [ ] `src/lib/coda/codaMisure.ts` (puro più `localStorage`, nessun React):
  ```ts
  interface VoceCoda {
    misura: Misura; espId: string; utente: string
    accodataIl: string; tentativi: number; prossimoTentativo: number | null
    stato: 'attesa' | 'invio' | 'rifiutata'; errore: string | null   // il messaggio per l'utente se rifiutata
  }
  accoda(utente, espId, misura): void            // stesso id = sostituisce la voce (una correzione prima dell'invio)
  vociDi(utente): VoceCoda[]                      // in ordine di accodamento
  togli(utente, id): 'tolta' | 'in_invio' | 'assente'
  iscriviti(ascoltatore): () => void              // per useSyncExternalStore; ascolta anche l'evento `storage` (altre schede)
  ```
  Chiave `fastlab-coda:v1:<utente>`; una voce rovinata si scarta e lo si scrive nella console, mai un'eccezione.
- [ ] `src/lib/coda/invio.ts`:
  - `inviaCoda(utente, queryClient)`: una voce alla volta, in ordine; `salvaMisura` (upsert per id); dentro `navigator.locks.request('fastlab-coda', …)` se esiste;
  - successo → voce tolta, cache aggiornate (`setQueryData` su misure della pianta e del giorno con la riga del server), le altre chiavi marcate vecchie **senza rilettura** (`invalidateQueries({ refetchType: 'none' })`), `toastSalvato('Pianta #35 salvata ✓')`; più voci inviate insieme → un toast solo: `3 misure inviate ✓`;
  - errore di passaggio → `tentativi + 1`, `prossimoTentativo` con le attese della Decisione 8, stop del giro;
  - errore definitivo (`eDefinitivo(e)`, funzione pura con test per ogni codice) → `stato: 'rifiutata'`, `errore = messaggioErrore(e)`, si passa alla voce dopo;
  - `avviaInvioAutomatico(queryClient)` in `main.tsx`: ascolta `online`, `visibilitychange`, l'accesso (`onAuthStateChange` con lo stesso utente delle voci) e un timer per `prossimoTentativo`.
- [ ] `src/lib/coda/sovrapponi.ts`: `conCoda(misure: Misura[], voci: VoceCoda[], filtro: (m: Misura) => boolean): Misura[]` (stesso id: vince la coda; le voci che passano il filtro e mancano si aggiungono). `useMisureGiorno` e `useMisurePianta` (e `useMisura` per la pagina di modifica) lo usano con `select` più la coda letta con `useSyncExternalStore`: così una rilettura del server non toglie una misura ancora in coda. `misureStrumento` (Dataset) no: lì contano i dati del server.
- [ ] `ModuloOggi`:
  - dopo i controlli, `accoda` al posto di `await salvaMisura`; poi subito `salvata(m, azione)` senza il toast (lo darà l'invio), bozza cancellata, mantenuti aggiornati, navigazione;
  - `inviaCoda` parte subito in background;
  - ripiego: se `accoda` non può scrivere (`localStorage` assente o pieno) si salva come oggi, con `ErroreSalvataggio` e "Riprova";
  - **Bassa 15:** dopo un salvataggio non si rileggono più le misure del giorno (oggi `invalidateQueries` di `misureGiorno` a riga 305): la cache è già giusta;
  - `nonSalvataDopoUscita` resta solo per il ripiego senza coda.
- [ ] `ModificaMisura`: una misura che è in coda si apre dalla coda (cache sovrapposta); "Salva" la riaccoda (stesso id); "Elimina" di una misura ancora in coda: `togli` → `tolta` = eliminata senza server; `in_invio` → si aspetta la fine dell'invio e poi si elimina online.
- [ ] `IndicatoreCoda` nell'`AppShell` (a destra del titolo, 44 px): `3 misure da inviare` (o `1 misura da inviare`), grafite, icona di nuvola con freccia; `1 non inviata` in tono errore se ce n'è di rifiutate. Apre `PannelloCoda` (foglio dal basso): elenco per pianta e ora (`#35 · 💚 SPAD · 09:12`), `Invia ora` (pulsante principale del pannello), per le rifiutate il motivo, `Apri la pianta` e `Scarta` (conferma `Scartare la misura di #35 delle 09:12? I suoi valori andranno persi.`). Nelle righe di `ElencoOggi` e della storia una misura in coda porta `da inviare` in grafite tenue.
- [ ] "Esci" con voci in coda: conferma della Decisione 8. Un utente diverso non vede le voci di un altro (chiave per utente).
- [ ] Test (TDD):
  - `accoda`, sostituzione per id, ordine, voce rovinata scartata, evento `storage`;
  - `eDefinitivo`: 42501, 23505, 23503, 22P02, P0001 (`PARAMETRO_CON_DATI`), 400 → definitivi; `ErroreRete`, 500, 503, 408, 429, `PGRST301` → di passaggio;
  - `inviaCoda`: successo, un errore di rete che ferma e pianifica, una rifiutata che non ferma le altre, un solo invio alla volta (doppia chiamata), toast verde solo dopo il successo;
  - `conCoda` con rilettura del server che non contiene la misura → la pianta resta `fatta` nel giro;
  - `ModuloOggi`: "Salva e vai" senza rete passa alla pianta dopo e l'indicatore dice `1 misura da inviare`; al ritorno della rete parte e compare il toast; ripiego senza `localStorage`;
  - `ModificaMisura`: correzione ed eliminazione di una misura in coda;
  - Esci con coda chiede conferma; un altro utente non vede la coda.
- Commit: `feat: coda d'invio delle misure, che partono da sole al ritorno della rete`.

### Task E7: poco segnale, gradino (c), aprire l'app senza rete (Opus)

- [ ] `vite.config.ts`: `VitePWA` di `vite-plugin-pwa` (fissare `1.3.0` esatto nel `package.json`):
  - `strategies: 'generateSW'`, `registerType: 'prompt'`, `injectRegister: false`, `manifest: false` (resta `public/manifest.webmanifest` con il suo `id`);
  - `workbox`: `globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}']`, `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024` (il chunk di exceljs è circa 930 kB), `navigateFallback: 'index.html'`, `cleanupOutdatedCaches: true`, `clientsClaim: false`, `skipWaiting: false`, **nessun `runtimeCaching`**;
  - in `vitest` il plugin non serve (`mode === 'test'` lo esclude, o il registratore si finge in test).
- [ ] `src/lib/aggiornamento.ts`: registra il service worker con `virtual:pwa-register` (`onNeedRefresh` → stato `aggiornamentoPronto`); `applicaAggiornamento()` chiama `updateSW(true)` solo dopo il controllo delle modifiche non salvate (le stesse protezioni di `useModuloProtetto` e delle Impostazioni). Nel menu dell'`AppShell`: `Nuova versione · Aggiorna` quando c'è. `window.addEventListener('vite:preloadError', …)` → toast `È uscita una nuova versione: ricarica la pagina.` con `Ricarica`.
- [ ] `vercel.json`:
  ```json
  {
    "headers": [{ "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }],
    "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
  }
  ```
  (un file mancante sotto `/assets/` dà 404, non `index.html`). `index.html`: via il commento "Niente service worker".
- [ ] `src/lib/cachePersistente.ts` (Decisione 9):
  ```ts
  export const CHIAVI_PERSISTENTI: ((chiave: readonly unknown[]) => boolean)[]   // l'elenco chiuso
  export function salvaCache(queryClient, utente: string, versione: string, adesso: number): void
  export function ripristinaCache(queryClient, utente: string, versione: string, adesso: number): { letteIl: number } | null
  export function cancellaCache(): void
  ```
  - `dehydrate` con `shouldDehydrateQuery` = stato `success` e chiave nell'elenco; scrittura con un ritardo (1 s dopo l'ultimo cambio della cache, e a `visibilitychange` nascosto); limite 2 MB (oltre si tolgono le misure delle piante più vecchie per `dataUpdatedAt`); `versione` = `__VERSIONE__` definita in `vite.config.ts` (data e ora della build);
  - `ripristinaCache` all'avvio, **prima** del primo disegno, solo se l'utente della sessione salvata è lo stesso; i dati ripristinati restano vecchi (si rileggono appena c'è rete);
  - `svuotaCacheAlCambioUtente` chiama anche `cancellaCache`; "Esci" pure.
- [ ] Senza rete:
  - `creaQueryClient`: `networkMode` di default (le query aspettano la rete senza errori finti);
  - una riga `Senza rete: dati letti il 04/11 alle 09:12.` sotto la barra in alto quando `navigator.onLine` è falso e la pagina mostra dati ripristinati;
  - `MisuraPianta` e la scheda: con la rete assente e le misure della pianta mai lette, il messaggio della Decisione 9 al posto di `Caricamento…`.
- [ ] `RequireAuth` / `useSessione`: un errore di rete del rinnovo (`AuthRetryableFetchError` o `ErroreRete`) tiene la sessione salvata e l'app aperta; solo `session === null` senza errore di rete, o un rifiuto del server, porta ad "Accedi". Da verificare sul comportamento reale di `supabase-js` installato (`getSession` con token scaduto e rete assente), con un test che lo fissa.
- [ ] `scripts/controlla-sw.mjs` (dopo `npm run build`): ogni file di `dist/assets` (js, css, woff2) è nel precache di `dist/sw.js`; in `sw.js` non c'è nessuna regola per l'URL di Supabase; esce con 1 altrimenti. Documentato nel README.
- [ ] Test: elenco chiuso (le chiavi escluse non finiscono nel salvataggio: `parametriConDati`, `misureStrumento`, `foto`, `urlFoto`, `note`, `catalogo`); limite di 2 MB; utente diverso e versione diversa → niente ripristino; scaduta dopo 7 giorni; cancellata all'uscita; riga "Senza rete"; sessione tenuta con errore di rete; `vite:preloadError` → toast; aggiornamento che chiede prima di scartare modifiche.
- [ ] **Prova a mano del controller** (non automatizzabile qui): build di produzione servita in locale, poi rete spenta dal browser: l'app si apre, la configurazione e il giro di oggi ci sono, una misura va in coda e parte alla riaccensione; un deploy nuovo con un'app aperta non rompe "Scarica Excel".
- Commit: `feat: l'app si apre anche senza rete (service worker e cache delle letture)`.

### Task E8: più spazio ai campi, griglia delle piante e fine giro (Sonnet)

File: `src/pages/MisuraPianta.tsx:38-95` (`VaiAllaPianta`) e `198-218` (intestazione), `src/pages/FineGiro.tsx:53-76`, `src/domain/giro.ts`.

- [ ] `src/domain/giro.ts`: `celleGriglia(piante, stati, attualeId): { pianta: Pianta; stato: StatoPianta; attuale: boolean }[]` nell'ordine del giro (dal Task E11 anche con l'ordine scelto).
- [ ] `src/components/giro/GrigliaPiante.tsx` (solo presentazione):
  - `grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr))`, celle quadrate di almeno 44 px, etichetta nel font dei dati; con etichette oltre 4 caratteri, celle di almeno 4,5rem;
  - stati della Decisione 10, con forma oltre al colore (✓, `½`, niente), `aria-label` `Pianta #35, incompleta`;
  - tocco su una cella → `onScegli(pianta)`; legenda sotto: `✓ fatta · ½ incompleta · □ da fare`.
- [ ] `src/components/giro/FoglioPiante.tsx`: foglio dal basso (il `Dialog` esistente con una variante "dal basso"), titolo `Vai alla pianta`, il campo numerico di oggi (con `Vai`) in alto e la griglia sotto; la scelta passa da `conferma` (modifiche non salvate) e naviga con `replace` come oggi.
- [ ] `MisuraPianta`: intestazione su una riga: `#35` (Numero pianta) seguito da `· W1 · 34/56` (dato, grafite tenue; `34/56` = fatte su totale del giro), poi a destra l'icona della griglia (44 px, `aria-label="Vai alla pianta"`) e quella delle foto. Via il campo "Vai alla pianta" dalla pagina: il primo campo della misura sale di circa 120 px. `BannerData` resta sotto l'intestazione solo se la data non è oggi.
- [ ] `FineGiro`:
  - in alto `💚 SPAD · fine giro 54/56`;
  - la griglia (tocco su una mancante → la misura, come "Vai alle mancanti"), al posto della frase `Mancano 3, 7, 12…` e dell'elenco;
  - **Valori di oggi**: per ogni parametro numerico dello strumento, una riga per trattamento `W1  41,3 ± 0,5 (13)` in colonna (media, ES e n dalle funzioni del Dataset: `serieTrattamenti` con l'intervallo di un giorno), intestazione `media ± ES (n)`;
  - **Da controllare**: le righe di `daSistemare` per quella data e quello strumento, con il tocco che apre la misura;
  - la barra in basso come oggi.
- [ ] Test: celle e stati, attuale, legenda, etichette lunghe; il foglio si apre, cerca, sceglie e chiede conferma con modifiche; intestazione compatta con progresso giusto; fine giro con griglia, valori di oggi uguali a quelli del Dataset per lo stesso giorno, da controllare; doppio tocco protetto come oggi (`useAttesaArrivo`).
- Commit: `feat: griglia delle piante nella misura e nel fine giro`.

### Task E9: ruoli e Persone nel database (Opus)

- [ ] Migration `20261104000016_ruoli_persone.sql`:
  - `membri_esperimento.ruolo`: vincolo nuovo `in ('proprietario', 'rilevatore', 'lettore')` dopo `update … set ruolo = 'rilevatore' where ruolo = 'collaboratore'`;
  - funzioni `security definer`, `stable`, `search_path = ''`, solo `authenticated`:
    - `ruolo_in(p uuid) returns text` (il ruolo di chi chiama, o `null`);
    - `puo_scrivere(p uuid) returns boolean` (proprietario o rilevatore);
    - `puo_configurare(p uuid) returns boolean` (proprietario);
    - `is_membro` resta com'è (lettura);
  - **tutte le policy riviste**, una per operazione (`select`, `insert`, `update`, `delete`) al posto dei `for all`:
    - `esperimenti`: select membro; insert `creato_da = auth.uid()` (invariata); update e delete `puo_configurare(id)`;
    - `fattori`, `livelli`, `trattamenti`, `trattamento_livelli`, `piante`, `parametri`, `strumenti`, `strumento_parametri`: select membro; insert, update, delete `puo_configurare`;
    - `misure`, `note`, `note_piante`, `note_trattamenti`, `foto`: select membro; insert, update, delete `puo_scrivere` (insert di note e foto con `creato_da = auth.uid()` come oggi);
    - `export_salvati`: invariate (membro e autore);
    - `storage.objects` (`fastlab_foto_*`): select membro; insert e delete `puo_scrivere(esperimento_della_foto(name))`;
    - `membri_esperimento`: select della propria riga (invariata); nessuna scrittura diretta;
  - `crea_esperimento` (security invoker) continua a funzionare: dopo l'insert dell'esperimento il trigger fa chi crea proprietario, e i figli passano da `puo_configurare` (test);
  - RPC `security definer`, solo `authenticated`:
    - `membri_di(p uuid) returns table (utente_id uuid, email text, ruolo text, sei_tu boolean)`: solo per un membro (altrimenti nessuna riga), ordinati proprietari, rilevatori, lettori, poi email;
    - `aggiungi_membro(p uuid, p_email text, p_ruolo text) returns void`: solo il proprietario (`SOLO_PROPRIETARIO`, 42501); email cercata in `profili` con `lower(btrim())` (`UTENTE_NON_TROVATO`); ruolo valido (`RUOLO_NON_VALIDO`); se è già membro **cambia il ruolo**; mai senza proprietari (`ULTIMO_PROPRIETARIO`);
    - `togli_membro(p uuid, p_utente uuid) returns void`: solo il proprietario, oppure chiunque per sé stesso ("Lascia l'esperimento"); mai l'ultimo proprietario;
  - `riepilogo_esperimenti()`: `drop` e `create` con la colonna in più `ruolo text` (stesso ordine delle altre colonne; il client vecchio la ignora);
  - catalogo (Decisione 17): `catalogo_strumenti.modificato_da uuid references auth.users on delete set null`, impostata da un trigger `before insert or update` con `auth.uid()` (fuori dal `grant update` per colonne, che resta quello della 0009); RPC `autori_catalogo() returns table (utente_id uuid, email text)` con gli autori e gli ultimi modificatori delle voci (non archiviate e archiviate), solo `authenticated`.
- [ ] pgTAP `ruoli.test.sql` (tre utenti: proprietario, rilevatore, lettore, più un estraneo):
  - **per ogni tabella** dell'elenco e per ogni operazione, chi può e chi no (lettore: legge tutto, 0 righe toccate o 42501 su ogni scrittura; rilevatore: scrive misure, note, collegamenti e foto, non la configurazione né lo stato né l'eliminazione dell'esperimento; estraneo: nulla);
  - Storage: il lettore non carica e non elimina; il rilevatore sì; l'estraneo non legge;
  - `aggiungi_membro`: solo il proprietario; email con maiuscole e spazi; utente non registrato; ruolo non valido; cambio di ruolo; due proprietari; ultimo proprietario protetto;
  - `togli_membro`: proprietario toglie un rilevatore (le sue misure restano); un lettore lascia; l'ultimo proprietario non lascia;
  - `membri_di` per un membro e vuota per un estraneo; `riepilogo_esperimenti` con il ruolo; `crea_esperimento` funziona;
  - catalogo: `modificato_da` impostato all'update, non scrivibile a mano; `autori_catalogo` per authenticated, non per anon;
  - i test esistenti (`rls`, `note_foto`, `export_salvati`, `rpc`, `strumenti`, `catalogo`) restano verdi; dove supponevano "ogni membro scrive", si aggiornano dicendo perché.
- [ ] `src/api/persone.ts`: `membriDi`, `aggiungiMembro`, `togliMembro`, `autoriCatalogo`; `src/lib/errori.ts`: i messaggi di `SOLO_PROPRIETARIO`, `UTENTE_NON_TROVATO`, `RUOLO_NON_VALIDO`, `ULTIMO_PROPRIETARIO` e del 42501 generico (Decisione 11). `src/lib/useRuolo.ts`: `useRuolo(espId): { ruolo; puoScrivere; puoConfigurare; caricamento }` da una query `ruolo_in` (chiave `['config', espId, 'ruolo']`, aggiunta all'elenco chiuso della cache persistente del Task E7: senza rete il lettore resta lettore).
- [ ] Rigenera `schema-completo.sql`; verifica completa. README: la tabella dei permessi.
- Commit: `feat(db): ruoli proprietario, rilevatore e lettore, con Persone`.

### Task E10: Impostazioni a pagine, Persone e interfaccia per ruolo (Sonnet)

- [ ] Rotte e percorsi (`src/lib/percorsi.ts`): `percorsoImpostazioni(espId, sezione?)` con `sezione` in `generale | trattamenti | piante | strumenti | fenologia | spazio | persone`. `/esperimenti/:espId/impostazioni` è l'**indice**: una riga di quaderno per sezione con il riassunto (`Piante · 56 piante, 8 trattamenti`, `Persone · 3 persone`, `Spazio · database 38 MB, foto 210 MB`), `›`, 44 px.
- [ ] Una pagina per sezione (`src/pages/impostazioni/*`), con un guscio comune `PaginaImpostazioni` che porta `ContestoModifiche`, la conferma di uscita e `beforeunload` di oggi: tornare all'indice con modifiche non salvate chiede `Scartare le modifiche non salvate?`. I link che oggi puntano alle Impostazioni (Dataset senza strumenti, home, scelta dello strumento) vanno alla sotto pagina giusta.
- [ ] `SezionePersone`:
  - elenco da `membriDi`: email, ruolo a parole (`Proprietario`, `Rilevatore: misure, note e foto`, `Lettore: solo lettura`), `tu`;
  - per il proprietario: campo `Email del collega` con `Ruolo` (scelta, default Rilevatore) e `Aggiungi`; su ogni altra riga, scelta del ruolo e `Togli` (conferma `Togliere <email> dall'esperimento? Le sue misure restano.`); risposta riuscita con `toastSalvato('Persone aggiornate ✓')`;
  - per gli altri: l'elenco e `Lascia l'esperimento` (conferma);
  - la riga `Il collega deve essere già registrato su FastLab: se non lo è, chiedi all'amministratore di invitarlo.`
- [ ] Interfaccia per ruolo (`useRuolo`), sempre con una frase al posto di ciò che manca:
  - **lettore:** home senza "Nuova misura" (la tessera dice `Solo lettura`), scheda senza "Misura questa pianta" e "Aggiungi foto", ModificaMisura in sola lettura, Diario senza "Nuova nota", spunta e modifica, Foto senza aggiunta ed eliminazione, `IndicatoreCoda` assente;
  - **rilevatore e lettore:** nelle Impostazioni le sezioni di configurazione in sola lettura con `Solo il proprietario modifica la configurazione.`; niente stato, archivio .zip, "Libera lo spazio", eliminazione;
  - **elenco esperimenti:** sotto il nome, per quelli condivisi, `Rilevatore` o `Lettore`.
- [ ] Test: indice con i riassunti; ogni sotto pagina con la protezione delle modifiche; Persone (aggiungi, errori tradotti, cambio di ruolo, togli, lascia); per ognuno dei tre ruoli le azioni presenti e assenti nelle pagine elencate; i test esistenti delle Impostazioni portati sulle sotto pagine.
- Commit: `feat: Impostazioni a pagine e sezione Persone`.

### Task E11: il giro, più scorrevole (Sonnet)

Medie 4, 5, 6, 7, 8 (Decisione 13).

- [ ] **Valore anomalo** (`src/domain/misure.ts`): `anomaliaRispettoAllUltimo(parametro, valore, ultimo: { valore: number; data: string } | null): string | null` con la regola della Decisione 13 e il testo `Molto diverso dall'ultima volta (41,2 il 28/10)`. `validaMisura` riceve l'ultimo valore per parametro (dalle misure della pianta, giorni prima della data di rilievo) e aggiunge l'avviso agli `avvisi` (non blocca: "Salva comunque" come per il fuori intervallo). Con più letture si confronta la media.
- [ ] **Meno domande** (`MisuraPianta.tsx:116-148`, `SceltaArrivo.tsx`, `RiquadroOggi`): regola nuova nella Decisione 13, con `bozzaDaRiprendere` che ha sempre la precedenza; il riquadro apre la correzione di quella misura con la riga `Completi la misura delle 09:12 · Aggiungine un'altra` (il secondo è un pulsante ghost 44 px); `+ Nuova misura` → `Aggiungi un'altra misura`. Registro: cambia il Ruling A (T12).
- [ ] **"Mantieni"** (`FormMisura.tsx:36-50`): `Mantieni per le prossime piante`.
- [ ] **Ritorno:**
  - "Misura questa pianta" dalla scheda porta `state: { daScheda: true }` attraverso la scelta dello strumento; in `MisuraPianta` allora `avanti` = `{ testo: 'e torna alla scheda', percorso: percorsoPianta(…) }`;
  - `ElencoPiante.tsx:38-41`: `cercato` e i blocchi aperti a mano nella URL (`?cerca=…&aperti=<id>,<id>`, `replace`), lo scorrimento in `sessionStorage` per percorso, ripristinato al ritorno (anche da `MisuraPianta.tsx:274-279`, che oggi torna alla scelta).
- [ ] **Ordine del giro:**
  - `src/domain/giro.ts`: `type OrdineGiro = { criterio: 'impostazioni' | 'etichetta' | 'blocco'; inverso: boolean }`, `ordinaPiante(piante, ordine)` (etichetta: confronto naturale con `localeCompare('it', { numeric: true })`; blocco: blocco, poi `ordine`; spareggio stabile come oggi). `prossimaDaMisurare`, `riepilogoGiro`, `celleGriglia` ricevono l'ordine;
  - `src/store/campo.ts`: `ordineGiro` per esperimento (persistito), default `{ criterio: 'impostazioni', inverso: false }`;
  - `SceltaStrumento`: riga `Ordine: come nelle impostazioni ›` che apre le quattro scelte;
  - Impostazioni › Piante: `Riordina` (su e giù per riga, `Ordina per etichetta`, `Ordina per blocco`, `Salva l'ordine`), che scrive `ordine` solo delle piante cambiate, con `controllaRighe`.
- [ ] Test: regola dell'anomalia (×10, ÷10, crescita normale, ultimo 0, segno, interi piccoli, liste); avviso e "Salva comunque"; arrivo su incompleta con una misura → correzione diretta, con due misure → domanda, fatta → domanda con `Aggiungi un'altra misura`, bozza → bozza; testo di Mantieni; ritorno alla scheda; ricerca e blocchi conservati e scorrimento ripristinato; ordinamenti e inverso; riordino salvato.
- Commit: `feat: giro con avviso dei valori strani, meno domande, ritorno e ordine`.

### Task E12: decimali e numeri interi (Opus)

Oggi `formattaMedia` arrotonda tutto a 2 decimali (`src/lib/numeri.ts:25-33`): `gs 0,0345` appare `0,03`; in `N frutti` si scrive `3,5`.

- [ ] Migration `20261104000017_decimali.sql`:
  - `parametri.decimali smallint check (decimali between 0 and 6)`, `parametri.solo_interi boolean not null default false`;
  - vincolo `parametri_decimali_solo_numero`: `tipo = 'numero' or (decimali is null and not solo_interi)`; vincolo `parametri_interi_senza_decimali`: `not solo_interi or coalesce(decimali, 0) = 0`;
  - `crea_esperimento` ricreata (dall'ultima versione, la 0009) leggendo `decimali` e `solo_interi` dei parametri dalla bozza, con i default se mancano;
  - nessun cambio di grant (`parametri` ha l'update per tabella).
- [ ] pgTAP `decimali.test.sql`: valori ammessi e rifiutati (7, −1, decimali su un testo, solo interi su una lista, solo interi con 2 decimali → 23514); `crea_esperimento` con e senza i campi; update da un rilevatore rifiutato (dal Task E9).
- [ ] Tipi e mapper: `Parametro.decimali: number | null`, `Parametro.solo_interi: boolean`; `ParametroCatalogo` con gli stessi campi facoltativi (il jsonb del catalogo li accetta); `clonaConfig` li copia; il piano di aggiornamento dal catalogo li tratta come `nome` (si aggiornano anche con misure, Decisione 14).
- [ ] `src/lib/numeri.ts`:
  ```ts
  formattaValore(n: number, p: Pick<Parametro, 'decimali' | 'solo_interi'>): string   // un valore singolo
  formattaMediaDi(n: number, p: Pick<Parametro, 'decimali' | 'solo_interi'>): string  // medie ed ES: un decimale in più
  formattaConUnitaDi(n, p): string
  ```
  Con `decimali` `null`: come oggi (`formattaMedia`, e le tre cifre significative sotto 1 del grafico). Sostituire gli usi dove c'è un parametro: scheda (riepilogo E3), elenco piante, ultima volta e mantenuti in campo, Valori di oggi (E8), Dataset (tabella, lettura del grafico, tacche quando i decimali sono noti), `ElencoOggi`, storia. L'Excel no.
- [ ] Campo:
  - `CampoNumero` / `NumericField`: `solo_interi` → `inputMode="numeric"` ed errore `Scrivi un numero intero.` in `validaMisura` (bloccante);
  - negativi: `inputMode="decimal"` con il pulsante `±` (44 px, `aria-label="Cambia segno"`) a destra del campo, che cambia il segno del testo e lascia il fuoco nel campo;
  - il testo digitato non si arrotonda mai.
- [ ] Editor del parametro (`EditorParametro`) e del catalogo (`Catalogo.tsx`): `Decimali` (Automatici, 0, 1, 2, 3, 4) e l'interruttore `Solo numeri interi`, solo per i numeri; con "solo interi" i decimali si nascondono.
- [ ] Test: `formattaValore` e `formattaMediaDi` (0,0345 con 4 decimali; 7,333 di un intero → `7,3`; `null` = oggi; −0); validazione degli interi; `±`; editor e catalogo che salvano i due campi; clonazione; il piano del catalogo li aggiorna anche con misure.
- Commit: `feat: decimali per parametro e numeri interi`.

### Task E13: miniature delle foto (Opus)

Oggi ogni miniatura della galleria scarica la foto intera (circa 350 KB).

- [ ] Migration `20261104000018_miniature.sql`:
  - `foto.miniatura boolean not null default false`, `foto.byte_miniatura int check (byte_miniatura >= 0)`, vincolo `miniatura or byte_miniatura is null`; `grant update (miniatura, byte_miniatura)`;
  - `esperimento_della_foto(p_nome text)` ricreata con la stessa firma: accetta `^<uuid>/<uuid>(_m)?\.jpg$` (minuscolo, nient'altro);
  - le policy dello Storage restano quelle della 0016 (chiamano la funzione).
- [ ] pgTAP `miniature.test.sql`: `_m.jpg` dà l'esperimento; `_M.jpg`, `_m.png`, `_mm.jpg`, `../`, sottocartella → `null`; un rilevatore carica ed elimina la miniatura, un lettore no, un estraneo non legge; vincolo `miniatura`/`byte_miniatura`; i test di `note_foto.test.sql` verdi.
- [ ] `src/lib/immagini.ts`: `comprimi` restituisce anche `miniatura: { blob; larghezza; altezza }` (lato lungo 320 px, JPEG qualità 0,7, circa 25 KB), dallo stesso canvas già orientato; canvas della miniatura azzerato dopo (come il grande).
- [ ] `src/api/foto.ts`:
  - `percorsoMiniatura(percorso)` (`…/<id>_m.jpg`);
  - `caricaFoto`: originale, poi miniatura (un errore della miniatura non ferma: `miniatura = false`, scritto nella console), poi la riga con i due campi;
  - `eliminaFoto`, `archiviaFileFoto` ("Libera lo spazio"), `eliminaFileEsperimento`: tolgono entrambi i file; il filtro dei nomi (`NOME_FOTO`) accetta anche `_m.jpg`; `fileFotoPresenti` conta solo gli originali;
  - lo .zip (`archivioFoto.ts`) prende solo gli originali.
- [ ] Galleria, storia, scheda, nota: l'URL firmato della miniatura quando `miniatura`, altrimenti dell'originale; il visore apre sempre l'originale.
- [ ] `spazio_progetto` (E4) conta già tutti gli oggetti del bucket; il ripiego su `public.foto` somma anche `byte_miniatura`.
- [ ] Test: miniatura da 320 px con le dimensioni giuste e orientamento applicato; caricamento con miniatura fallita; eliminazione e "Libera" con due file; zip senza miniature; galleria che chiede la miniatura e le foto vecchie l'originale.
- Commit: `feat: miniature delle foto per una galleria leggera`.

### Task E14: Diario, parole e account (Sonnet)

- [ ] **Diario** (`Diario.tsx:338-354`):
  - `src/domain/diario.ts`: `filtraNote(note, config, filtri)` e `raggruppaPerMese(note)` (titolo `Novembre 2026`); `normalizza` senza maiuscole e accenti (la stessa usata per le etichette dove serve);
  - filtri: `Cerca nel testo`, `Promemoria: tutti · da fare · fatti`, `Pianta o trattamento` (etichetta della pianta con corrispondenza esatta di `trovaPianta`, o chip dei trattamenti), `Periodo` (la forma di `Periodo` del Dataset); nella URL con `replace`; `Azzera`;
  - intestazioni per mese come righe di quaderno nel font dei dati; senza risultati `Nessuna nota con questi filtri.` con `Azzera i filtri`.
- [ ] **Parole** (Decisione 16):
  - `src/domain/parole.ts`: `etichettaPianta(p)` (`#35`), `rigaStrumento(giro, letture, oggi, dataRilievo)` (la riga sotto il nome di uno strumento, oggi in tre copie: `Oggi.tsx:30-49`, `SceltaStrumento.tsx:31-48`, `SezioneStrumenti.tsx:70-72`, più `ElencoPiante.tsx:99`);
  - nelle Impostazioni "valore" nel senso di parametro diventa **parametro** (`Archivia il parametro`, `Elimina il parametro`, `Nessun parametro`); "valore" resta per i numeri;
  - `DESIGN.md`: sezione "Parole" con il glossario; i test aggiornati alle parole nuove.
- [ ] **Account:**
  - menu dell'`AppShell`: `Cambia password` → dialogo con `Nuova password` e `Ripeti` (almeno 8 caratteri, come il README), `supabase.auth.updateUser({ password })`, `toastSalvato('Password cambiata ✓')`; un errore di Supabase (stessa password, riautenticazione richiesta) tradotto;
  - `AdminInviti.tsx:22-24`: il messaggio porta `…/registrati#codice=XXXX`; `Registrati.tsx` legge il codice dal frammento o da `?codice=`, lo mette nel campo e toglie il frammento dalla barra (`history.replaceState`).
- [ ] Test: filtri del Diario (testo con accenti, promemoria, pianta esatta, trattamento, periodo, mese), URL andata e ritorno; `rigaStrumento` con tutti i casi di oggi delle tre copie; cambio password (riuscito, password diverse, errore); link d'invito e lettura del codice da frammento e da query.
- Commit: `feat: Diario con ricerca e filtri, parole uniformi, cambio password`.

### Task E15: le proposte basse (Sonnet)

- [ ] **Esperimenti** (`Esperimenti.tsx:74-81` e il menu ⋯): `Elimina esperimento` solo per il proprietario, con il nome da scrivere (lo schema di "Libera lo spazio") e `eliminaEsperimento` (toglie prima i file, già esistente; chiude il Ruling del Piano C "collegare eliminaEsperimento a una UI con conferma forte"); i conclusi in una sezione `Conclusi (3)` chiusa in fondo (`Espandibile`).
- [ ] **"Elimina misura" con Annulla** (`ModificaMisura.tsx:274-306`): `eliminaConAnnulla` con chiave `misura:<id>`, nascondi e ripristina nelle cache delle misure della pianta e del giorno; una misura ancora in coda passa da `togli` (Task E6). Via la conferma "non si può annullare".
- [ ] **Ricerca delle piante** (`ElencoPiante.tsx:87-95`, `Foto.tsx:60-63`): `inputMode="numeric"` se `etichetteNumeriche(config.piante)`, altrimenti `text`.
- [ ] **Letture ripetute** (`src/components/misura/CampoNumero.tsx:36-57`): con 2 o più letture compilate, sotto i campi `media 41,3 · scarto 1,2` (font dei dati, grafite tenue, `aria-live="polite"`; decimali del parametro dal Task E12).
- [ ] **Catalogo** (`Catalogo.tsx:172-186`, `src/api/catalogo.ts:20`): `listaCatalogo` con un parametro per le archiviate; elenco `Archiviati` chiuso in fondo, con `Ripristina` (un nome già usato da una voce attiva → il messaggio del 23505 di oggi); sotto ogni voce `Creata da mario@… · modificata da lucia@… il 03/11` da `autoriCatalogo` (E9).
- [ ] **Prestazioni** (`src/api/esperimenti.ts:33-45`): `caricaConfig` legge `piante` a pagine keyset per id (fine alla prima pagina vuota, come `misureStrumento` del Piano D); le altre tabelle della configurazione sono piccole e restano in una lettura.
- [ ] Test: elimina esperimento (solo proprietario, nome sbagliato, riuscito); conclusi chiusi; elimina misura con Annulla (nessun delete) e confermata (delete dopo 5 s, timer finti) e in coda; inputMode; media e scarto; catalogo archiviati e ripristino, autori; `caricaConfig` con 2500 piante su tre pagine e una pagina corta che non ferma.
- Commit: `feat: eliminare un esperimento, Annulla per le misure e altri ritocchi`.

### Task E16: README, verifica, messa online (Sonnet, poi il controller)

- [ ] README:
  - "Lavorare con poco segnale" (bozze, coda, apertura senza rete, aggiornamento, cosa non funziona senza rete), con la nota che la spec metteva l'offline tra gli anti-obiettivi e l'utente l'ha chiesto il 4/11;
  - "Persone e ruoli" (la tabella della Decisione 11);
  - spazio del progetto, decimali e interi, miniature, ordine del giro;
  - dipendenze (font Atkinson, `vite-plugin-pwa` usato), `scripts/controlla-sw.mjs`, elenco dei test pgTAP e numeri aggiornati;
  - `PRODUCT.md`: la frase "sempre online" della spec non vale più per le misure.
- [ ] Verifica completa: test-db, `npx vitest run` (due volte), `npx tsc -b`, `npm run lint`, `npm run build`, `npm run test:bundle`, `node scripts/controlla-sw.mjs`; `grep` dei trattini lunghi nei file toccati.
- [ ] **Il controller** (anche ai rilasci intermedi della Decisione 1):
  - applica le migration 0015-0018 in ordine con `apply_migration`, guarda gli advisor di sicurezza;
  - controlla online `spazio_progetto` con un utente vero: se `foto_byte` non coincide con lo spazio dello Storage nel pannello, passa al ripiego della Decisione 5 (migration nuova, mai riscrivere);
  - con un secondo account prova i tre ruoli (un lettore che prova a misurare riceve il messaggio, non un errore generico);
  - deploy di produzione e prova sul telefono (iPhone e Android): "Avanti" in misura e nella creazione guidata; font; icona aggiornata (punto 6); modalità aereo durante il giro e all'apertura; aggiornamento con l'app aperta; "Scarica Excel" dopo un deploy; galleria con le miniature.
- Commit: `docs: README del Piano E`.

## Assegnazione dei modelli

| Task | Modello | Perché |
|---|---|---|
| E1 tasto "Avanti" | Sonnet | interfaccia, comportamento ben specificato |
| E2 font | Sonnet | sostituzione meccanica più il grafico |
| E3 riepilogo della scheda | Sonnet | dominio piccolo e interfaccia |
| E4 elimina strumento e spazio | Opus | migration con una funzione `security definer` su `storage.objects` |
| E5 poco segnale (a) | Opus | limite di tempo su tutte le richieste, bozze che cambiano durata: dati persi in silenzio se sbagliato |
| E6 coda d'invio (b) | Opus | coda offline: ordine, errori definitivi, cache sovrapposta, utenti |
| E7 apertura senza rete (c) | Opus | service worker e deploy, cache persistente, sessione senza rete |
| E8 griglia e fine giro | Sonnet | interfaccia, funzioni del Dataset già verificate |
| E9 ruoli e Persone (database) | Opus | RLS: revisione di tutte le policy |
| E10 Impostazioni a pagine, Persone, ruoli nell'interfaccia | Sonnet | interfaccia; la guardia è nel database |
| E11 il giro | Sonnet | regole piccole e testate |
| E12 decimali e interi | Opus | migration, `crea_esperimento` ricreata, formattazione in tutta l'app |
| E13 miniature | Opus | migration e policy dello Storage, file che non devono restare orfani |
| E14 Diario, parole, account | Sonnet | interfaccia e testi |
| E15 proposte basse | Sonnet | ritocchi indipendenti |
| E16 README e messa online | Sonnet, poi il controller | |
| Revisione finale | Opus | su tutto il piano |

Ordine: E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16, un implementatore alla volta. I revisori del task precedente lavorano in parallelo sulla loro copia `git archive`. Revisione a sé per E4, E5, E6, E7, E9, E12, E13 (Opus o Sonnet secondo il carico, sempre su copia); per gli altri la rivede la revisione finale con la cura di un task singolo, come nel Piano D.

## Focus di revisione

1. **Nessun dato perso con poco segnale:**
   - una misura salvata senza rete è in coda prima che la pagina cambi, e sopravvive alla chiusura dell'app;
   - la coda non invia due volte in modo dannoso (upsert per id), non invia a nome di un altro utente, non ritenta all'infinito gli errori definitivi e li mostra;
   - una rilettura del server non fa sparire una misura in coda né rende "da fare" una pianta appena misurata;
   - il verde compare solo dopo la conferma del server;
   - le bozze restano 14 giorni, legate all'utente, e quelle della versione di prima non si perdono al rilascio.
2. **Service worker e deploy:**
   - un'app aperta durante un deploy continua a funzionare, Excel compreso; la versione nuova non si attiva a metà lavoro;
   - nessuna risposta di Supabase in cache del service worker; cache persistente solo con l'elenco chiuso, legata a utente e versione, cancellata all'uscita;
   - senza rete non si finisce su "Accedi" con una sessione valida;
   - un file mancante sotto `/assets/` dà 404.
3. **Permessi:**
   - ogni tabella e ogni operazione hanno la policy giusta per i tre ruoli (anche lo Storage); nessun `for all` rimasto che lasci scrivere un lettore;
   - nessun esperimento senza proprietari; solo il proprietario aggiunge e toglie;
   - le funzioni `security definer` non restituiscono dati di esperimenti di cui non si è membri (`spazio_progetto` solo totali; `membri_di` solo per membri);
   - `crea_esperimento`, `Duplica` e gli export salvati funzionano per i ruoli che devono.
4. **Telefono:**
   - "Avanti" non cambia mai pianta né pagina; "Fatto" non salva; nessun tocco fantasma sulla barra quando la tastiera si chiude;
   - a 360 px: intestazione della misura su una riga, griglia con celle di almeno 44 px, riepilogo della scheda senza scorrimento orizzontale, font nuovo senza tagli;
   - foglio della griglia con la tastiera aperta e chiusa.
5. **Numeri:**
   - decimali giusti in campo, scheda, elenco, fine giro e Dataset; medie con un decimale in più; l'Excel a precisione piena;
   - "Valori di oggi" uguali al Dataset per lo stesso giorno;
   - avviso del valore anomalo che prende ×10 e ÷10 senza avvisare per la crescita normale.
6. **Design:**
   - un solo inchiostro pieno, verde solo per "salvato" (mai per la coda, le celle o i ruoli);
   - numeri nel font dei dati e incolonnati; righe da quaderno; bersagli ≥ 44 px;
   - nessun trattino lungo nei testi.

## Dubbi per l'utente

Nessuno blocca i Task E1-E8. Il primo va confermato prima del Task E9.

1. **Permessi di Persone** (Decisione 11): il rilevatore misura, scrive note e foto ma non cambia la configurazione, che resta al proprietario; un collega può diventare proprietario anche lui. Va bene, o il rilevatore deve poter aggiungere piante e strumenti?
2. **Il rilevatore corregge le misure degli altri:** sì nel piano (il quaderno è della squadra). In alternativa solo le sue.
3. **Senza rete** (Decisione 9): service worker più una cache delle letture limitata (configurazione, misure del giorno, piante già aperte). La via più prudente è "solo l'app e la configurazione"; costa poco cambiarla.
4. **Valore anomalo:** avviso da 3 volte in su rispetto all'ultima misura della pianta. Da ritoccare dopo qualche giro.
5. **"Scarto" delle letture ripetute** = massimo meno minimo. In alternativa la deviazione standard.
6. **Link d'invito:** il codice nel frammento (`#codice=`) invece che in `?codice=`, perché non finisca nei log del server.
7. **Catalogo:** accanto a una voce si vede l'email di chi l'ha creata e di chi l'ha modificata per ultimo (tutti gli utenti registrati la vedono).
8. **Font:** la µ delle unità del Ciras e alcuni simboli (✓, →, frecce) vengono dal font del telefono, perché Atkinson non li ha.
9. **Bozze:** tenute 14 giorni sul telefono, poi tolte.
