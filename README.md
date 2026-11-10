# FastLab

FastLab è l'app per raccogliere le misure di un esperimento in serra o in campo, dal telefono, e rivederle pianta per pianta. Ogni esperimento si configura dall'app (fattori, trattamenti, piante, strumenti scelti da un catalogo condiviso e, se serve, una tabella fenologica) e i dati stanno in un database online (Supabase), non nel telefono. La registrazione è solo su invito: un amministratore invita i colleghi.

Questa è la versione 3. Il perché delle scelte è nella spec, il lavoro svolto nel piano (vedi "Dove sono i documenti").

## Sviluppo locale

Serve Node.js e Docker Desktop (Supabase gira in locale dentro Docker).

1. Installa le dipendenze: `npm ci`
2. Avvia Supabase in locale: `npx supabase start`. La prima volta scarica le immagini e ci vuole qualche minuto. Applica da solo le migration in `supabase/migrations`.
3. Scrivi la chiave nel file `.env.local` (non va nel repository):

   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54421
   VITE_SUPABASE_ANON_KEY=<chiave pubblica>
   ```

   La chiave pubblica (chiamata `anon` o `publishable`, secondo la versione della CLI) la stampa `npx supabase start` alla fine; si rilegge in qualsiasi momento con `npx supabase status`.
4. Avvia l'app: `npm run dev`. Si raggiunge su http://localhost:5173.

Le porte di Supabase in `supabase/config.toml` sono spostate di +100 rispetto ai valori predefiniti (API 54421 invece di 54321, database 54422 invece di 54322, Studio 54423, e così via), per non scontrarsi con un altro stack Supabase già acceso sul computer. Se sul tuo computer non ce n'è un altro, puoi riportarle ai valori predefiniti nel file e cambiare di conseguenza `VITE_SUPABASE_URL`.

Comandi utili:

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | App in sviluppo (Vite, porta 5173) |
| `npm test` | Test dell'app (Vitest), senza database |
| `npm run test:db` | Test del database (pgTAP), serve `npx supabase start` |
| `npm run lint` | Controllo del codice (ESLint) |
| `npm run build` | Controllo dei tipi e build di produzione in `dist/` |
| `npm run test:bundle` | Controlla che exceljs e `react-dom/server` restino fuori dal chunk principale (vedi sotto) |
| `npm run test:sw` | Dopo `npm run build`: controlla il service worker in `dist/sw.js` (vedi sotto) |

### Test del database

`npm run test:db` esegue i file in `supabase/tests` sul database locale (il riferimento: prima `npx supabase db reset`, che riapplica tutte le migration):

- `rls.test.sql`: chi può leggere e scrivere cosa (policy di sicurezza per riga);
- `inviti.test.sql`: registrazione solo su invito, con email e codice;
- `rpc.test.sql`: le funzioni del database usate dall'app;
- `guardie.test.sql`: le guardie sulle piante (una pianta con misure non cambia trattamento) e sul cambio di esperimento delle righe, aggiunte con la migration `20261029000006_guardie_piante.sql`;
- `strumenti.test.sql`: gli strumenti (tipo, archiviazione, vincoli) e la funzione che crea un esperimento;
- `catalogo.test.sql`: il catalogo condiviso, le sue policy e il collegamento delle copie;
- `ultime_misure.test.sql`: la data dell'ultima misura di ogni strumento ("ultima volta"), letta rispettando le policy;
- `ultime_misure_piante.test.sql`: le misure dell'ultima data di ogni pianta per ogni strumento (elenco delle piante), lette rispettando le policy;
- `note_foto.test.sql`: note, promemoria e foto (collegamenti, vincoli, policy per membro) e il bucket privato `foto` dello Storage con le sue policy;
- `foto_archiviata.test.sql`: la data di archiviazione di una foto e il vincolo che la tiene allineata a `archiviata`;
- `export_salvati.test.sql`: gli export salvati di Esporta Excel (ognuno vede e tocca solo i suoi, `creato_da` non si cambia, nome unico per esperimento e utente, forma delle scelte validata da `scelte_export_valide`) e l'indice che serve alla lettura delle misure per strumento;
- `conteggi_spazio.test.sql`: i conteggi degli strumenti e lo spazio del progetto;
- `ruoli.test.sql`: i ruoli proprietario, rilevatore e lettore (e chi non è membro), tabella per tabella e operazione per operazione, Storage compreso, e le funzioni di Persone.

In tutto sono 549 test pgTAP in 13 file.

Quando aggiungi una migration, aggiungi o aggiorna anche il test che la copre.

### Il bundle: `npm run test:bundle`

exceljs (circa 930 kB, 256 kB gzip) e `react-dom/server` servono solo a "Scarica Excel" e si caricano con un `import()` dinamico, al tocco del pulsante: devono restare fuori dal chunk che il browser scarica all'apertura dell'app. `npm run test:bundle` fa una build di produzione in memoria (non scrive `dist/`), chiede a Vite in quali chunk è finito ciascun modulo e stampa le dimensioni; esce con errore se uno dei due è nel chunk principale, e altrimenti scrive "caricato a richiesta". Non cerca parole nel codice minificato: il principale contiene comunque il nome del file del chunk di exceljs, per l'import dinamico. Per questo legge il grafo dei moduli: in questo ambiente la build emette un chunk principale incompleto, e un controllo sul testo dei file in `dist/assets` non sarebbe affidabile.

### Il service worker: `npm run test:sw`

Il service worker (`vite-plugin-pwa` 1.3.0, strategia `generateSW`) tiene in cache tutta la build: l'app si apre anche senza rete, e una pagina aperta durante un deploy resta coerente con la sua versione ("Scarica Excel" compreso). `npm run test:sw` (cioè `node scripts/controlla-sw.mjs`, dopo `npm run build`) verifica che ogni file di `dist/assets` (js, css, woff2) e `index.html` siano nel precache di `dist/sw.js`, che il service worker non abbia regole a runtime (nessuna strategia di cache, nessun indirizzo di Supabase: database, autenticazione e Storage passano sempre dalla rete), che la versione nuova si attivi solo su richiesta (`skipWaiting` solo dal messaggio `SKIP_WAITING`, niente `clientsClaim`) e che `vercel.json` serva `sw.js` senza cache e risponda 404 per un file mancante sotto `/assets/`. Esce con errore altrimenti.

#### Senza Docker (ambienti cloud)

Dove Docker non c'è, `scripts/db-senza-docker/test-db.sh` fa lo stesso lavoro con un PostgreSQL 16 locale: ricrea il database `fastlab_test`, applica uno strato che imita Supabase (`stub-supabase.sql`), tutte le migration in ordine e lancia tutti i pgTAP. Deve finire con `Result: PASS`.

Servono i pacchetti apt `postgresql-16`, `postgresql-16-pgtap` e `libtap-parser-sourcehandler-pgtap-perl` (che porta `pg_prove`), con il cluster acceso (`pg_ctlcluster 16 main start`) e l'accesso `trust` per l'utente `postgres` sul socket locale. Lo script non sostituisce il riferimento, che resta `npx supabase db reset` seguito da `npm run test:db`: GoTrue, PostgREST e i privilegi reali di Supabase qui non ci sono.

## Come si usa

### La home dell'esperimento

Aprendo un esperimento si arriva alla sua home. In cima c'è il riepilogo (piante, trattamenti, in corso o concluso). Sotto c'è la striscia "Nuova misura", l'unico elemento a inchiostro pieno: se un giro è a metà, dice a che punto è (per esempio "SPAD in corso · 34/56"). Poi ci sono sette icone, tutte sezioni vere (non ci sono più voci "in arrivo"):

- Oggi: i promemoria del giorno, gli strumenti con il progresso e i valori da controllare (vedi sotto); il numerino sull'icona conta i promemoria del giorno più i valori da sistemare;
- Piante: l'elenco delle piante per trattamento e la scheda di ogni pianta (vedi sotto);
- Diario: le note datate dell'esperimento, con i promemoria (vedi sotto);
- Foto: la galleria delle foto dell'esperimento (vedi sotto);
- Dataset: i grafici filtrabili (vedi sotto);
- Esporta Excel: il file con i dati, le medie e i grafici (vedi sotto);
- Impostazioni è a tutta larghezza in fondo: fattori, trattamenti, piante, strumenti, tabella fenologica e spazio delle foto.

### Oggi

- **Promemoria:** in cima, quelli con data di oggi o già passata e non ancora fatti. La spunta li segna fatti e li toglie dall'elenco; per 5 secondi resta "Annulla".
- **Strumenti:** per ognuno il progresso di oggi (per esempio "34/56" o "fatto ✓") oppure da quanto non si misura ("ultima 20/10 (14 giorni fa)", "mai misurato"). Toccandolo parte la misura, come da "Nuova misura".
- **Da sistemare:** i valori di oggi molto lontani dalla media delle altre piante dello stesso trattamento, forse errori di battitura. "Molto lontano" vuol dire oltre 5 deviazioni standard e oltre il 20% dalla media delle altre piante, con almeno 3 altre piante misurate: la soglia è prudente, per non segnalare scarti normali in gruppi piccoli. Toccando un valore si apre la misura da correggere.

### Piante

- **Elenco:** un blocco per trattamento, con il numero di piante e la media degli ultimi valori del parametro scelto in "Valore mostrato" (ogni pianta conta una volta, con la media del suo ultimo giorno). In cima c'è la ricerca per numero o etichetta; scrivendo un numero e premendo Invio si apre quella pianta.
- **Scheda della pianta:** gli ultimi valori di ogni strumento con la freccia rispetto alla volta prima, un confronto discreto con la media del trattamento (e il segno "fuori dal gruppo" solo quando la pianta è molto lontana), gli avvisi tipo "SPAD non misurato da 9 giorni", la storia completa e i dati della pianta. Nella storia, per data, stanno le misure (toccandone una la si corregge), le note che riguardano la pianta (anche quelle di un trattamento o di tutto l'esperimento, con il collegamento indicato) e le sue foto, che aprono il visore. "Misura questa pianta" fa scegliere lo strumento e apre la misura di quella pianta; "Aggiungi nota" apre l'editor del Diario già collegato alla pianta; "Aggiungi foto" carica una foto per la pianta.

### Diario e promemoria

Il Diario raccoglie le note dell'esperimento, dalla più recente. Ogni nota ha una data e un testo, e può riguardare tutto l'esperimento, uno o più trattamenti oppure una o più piante (una sola di queste scelte per nota). Le bozze si conservano finché la nota non è salvata, e uscendo con modifiche non salvate l'app chiede conferma.

Una nota con data **dopo oggi** è un **promemoria** (la casella "Ricordamelo quel giorno" si può cambiare a mano). Il giorno della data compare in Oggi finché non è fatto; spuntato, resta nel Diario barrato, con "fatto il GG/MM". Spostando in avanti la data di un promemoria già fatto, torna da fare. Un'eliminazione si può annullare per 5 secondi.

### Foto

- **Aggiungere:** da galleria o fotocamera, dalla pagina Foto, dalla scheda di una pianta, dall'editor di una nota e dalla misura (il pulsante 📷 nell'intestazione, che non tocca il modulo). Ogni foto è ridimensionata e compressa nel browser (lato lungo al massimo 1600 px, JPEG fino a circa 350 KB) e carica nello spazio privato dell'esperimento. La data è quella di scatto, se la foto la ha, altrimenti oggi, e si può cambiare.
- **Galleria:** le foto raggruppate per giorno, con il filtro per pianta e per trattamento. Toccandone una si apre il **visore**, dove si scorre, si cambia la data o la pianta collegata e si elimina (con "Annulla" per 5 secondi).
- **Spazio:** nelle Impostazioni, "Spazio delle foto" mostra quanto occupano le foto dell'esperimento e di tutti gli esperimenti di cui sei membro, contro 1 GB di file del piano gratuito, con un avviso oltre l'80%. Il limite è dell'intero progetto, mentre il totale conta solo gli esperimenti che vedi.
- **Archivio .zip e "Libera lo spazio":** solo per un esperimento **concluso**. "Scarica le foto (.zip)" prepara un file con le foto e un `foto.csv` (data, pianta, trattamento, nota, nome del file) che Excel italiano apre direttamente. Se una foto non si scarica, il download si ferma con un errore e "Riprova". Solo dopo un download riuscito **in quella sessione** compare "Libera lo spazio": chiede di scrivere il nome dell'esperimento e toglie dallo spazio i file delle sole foto che sono nello zip. Le righe restano e la galleria mostra "Archiviata nel .zip del GG/MM". Ricaricando la pagina il download va rifatto. Se l'operazione si interrompe a metà, si riprova: righe e file restano coerenti.
- **Eliminare un esperimento:** `eliminaEsperimento` (toglie prima i file delle foto, poi l'esperimento) esiste solo come funzione dell'app, senza una schermata che la usi.

### Dataset

Il grafico della **media per trattamento nel tempo ± errore standard**, una linea per trattamento, con i segni verticali delle note del Diario (di tutto l'esperimento, del trattamento o delle piante mostrate; toccando un segno si legge la nota e si apre nel Diario). L'unità statistica è la pianta: prima la media del giorno di ogni pianta (con più misure nello stesso giorno, la media delle misure; con più letture, la media delle letture non vuote), poi media, errore standard (deviazione standard campionaria diviso la radice di n) e n tra le piante del trattamento. Toccando o trascinando sul grafico si legge il valore di quella data.

- **Filtri, sempre in alto:** strumento, parametro (se lo strumento ne ha più di uno), trattamenti, fattore (un livello per fattore, più fattori in "e"), periodo (tutto, ultime 2, 4 o 8 settimane, dal… al…) e piante. Le "ultime N settimane" valgono da oggi, estremi compresi (4 settimane = 28 giorni); per un esperimento concluso finiscono all'ultima misura.
- **Cerca piante:** le etichette separate da virgola (`3, 12, A4`), a **corrispondenza esatta**: `3` non trova la `13`, `035` trova `35`. Le etichette che non ci sono compaiono sotto il campo ("Non trovata: 99"). La ricerca ha la precedenza su trattamenti e fattore, e il grafico mostra le piante cercate (al più 8) con la media del loro trattamento come riferimento tenue.
- **Tutto nella URL:** i filtri stanno nell'indirizzo (`s`, `p`, `t`, `f`, `per`, `cerca`), quindi sopravvivono a un ricaricamento e al tasto indietro, e un link ridà la stessa vista. Un id che non c'è si scarta in silenzio.
- **Parametri non numerici:** una lista si disegna come numero di elementi; un sì/no come percentuale di sì tra le piante (ultima misura del giorno, senza barre d'errore); il testo non si disegna, e al suo posto c'è la tabella.
- **"Mostra i valori":** la tabella con esattamente i numeri del grafico (media ± ES e n per data, dalla più recente).
- **"Scarica questa vista":** apre Esporta Excel già compilato con strumento, piante e periodo di quella vista.

### Esporta Excel

Una schermata con quattro scelte e il riepilogo, poi "Scarica Excel":

1. **Cosa:** gli strumenti (e la tabella fenologica), a scelta multipla, almeno uno.
2. **Quali piante:** tutte, per trattamento o piante precise (stessa ricerca esatta del Dataset).
3. **Periodo:** tutto, ultime N settimane (di base 4) o dal… al….
4. **Come:** "Valori di ogni pianta", "Medie per trattamento" e, in tre caselle, "Grafici", "Diario", "Info esperimento".

- **Riepilogo:** "Il file conterrà:" con i fogli e le righe, calcolato sulla stessa descrizione da cui nasce il file (quindi "Dati: 896 righe" è vero per costruzione). Con migliaia di misure il conto arriva dopo un attimo, senza bloccare i chip.
- **Il file** `FastLab_<esperimento>_<AAAA-MM-GG>.xlsx` ha i fogli `Dati` (una riga per pianta e data: Esperimento, Pianta, una colonna per fattore, Trattamento, Blocco se c'è, Data e un parametro per colonna; con più misure nello stesso giorno vale la media e accanto c'è la colonna `N_<parametro>`), `Medie` (una riga per trattamento e data: media, ES e n per parametro, gli stessi numeri del Dataset), `Misure` (ogni singola lettura con la sua ora), un foglio per ogni lista ripetuta, `Grafici` (i grafici come immagini), `Diario` e `Info` (configurazione, regola delle medie, data dell'export). Ciascuno c'è solo se la scelta lo chiede e ha righe.
- **Date, ore e numeri veri:** le date sono date di Excel (`gg/mm/aaaa`, lo stesso giorno anche in Italia), le ore sono ore, i numeri sono numeri a precisione piena, i sì/no sono booleani (VERO/FALSO), l'etichetta della pianta è testo (`035` resta `035`) e un testo che comincia con `=` resta testo.
- **Grafici senza immagini:** se il browser non riesce a disegnarli, il file parte lo stesso senza, il foglio `Grafici` lo scrive in una riga e il messaggio finale lo dice.
- **Durante il download** la pagina mostra la fase sotto il pulsante ("Preparo i dati…", "Disegno i grafici 3 di 12…", "Scrivo il file…") e tiene fermo il pulsante; lasciando la pagina il download si interrompe. Gli errori restano visibili con "Riprova".
- **Export salvati:** "Salva questa scelta" dà un nome alle scelte. In cima compaiono "📌 Tutto l'esperimento" (sempre, non si elimina) e gli export dell'utente in questo esperimento: toccandone uno si applicano le scelte (non scarica). Sono per esperimento **e per utente**: un collega non vede i tuoi. Un periodo relativo ("ultime 4 settimane") resta relativo: lo stesso export, scaricato fra un mese, dà le ultime 4 settimane di allora. Un nome già usato chiede se sostituire; "Elimina" ha "Annulla" per 5 secondi; le piante, i trattamenti o gli strumenti che non ci sono più si scartano e la riga lo dice.
- **Libreria:** il file si scrive con exceljs, in un chunk separato caricato al tocco di "Scarica Excel" (vedi `npm run test:bundle`). La libreria `xlsx` non c'è più.

### Nuova misura

1. **Scegli lo strumento.** "Nuova misura" mostra gli strumenti dell'esperimento, ognuno con il progresso (per esempio "34/56 oggi", oppure "ultima volta 21/10" o "mai misurato"). La data di rilievo è oggi, ma si può cambiare. Lo strumento del giro in corso sta in cima, con il pulsante "Riprendi dalla pianta 35".
2. **Misura una pianta dopo l'altra.** Si parte dalla prima pianta da misurare. Dopo ogni salvataggio l'app passa alla pianta successiva. Le piante già fatte con quello strumento, nella data di rilievo, si saltano da sole. Una pianta con solo una parte dei valori resta "incompleta" e non si salta.
3. **Una pianta già misurata.** Arrivando su una pianta che ha già misure di quello strumento in quella data (anche nel giro, su una pianta incompleta), l'app chiede "Correggi" (modifica la misura che c'è) o "Nuova misura" (ne aggiunge un'altra). Se c'erano valori non salvati, si riprendono quelli senza chiedere. Le piante già fatte il giro le salta.
4. **Mantieni uguale.** Sotto i campi numerici, di testo e sì/no c'è "Mantieni questo parametro uguale anche nelle prossime misure". Con la spunta il valore si ripropone sulle piante seguenti, con un segno "mantenuto" ben visibile, finché non la togli o cambi strumento o data. Le liste ripetute non hanno la spunta: sono sempre della pianta.
5. **Fine giro.** Finite le piante, l'app dice quante sono fatte ed elenca quelle che mancano, comprese le incomplete. Il pulsante "Vai alle mancanti" riparte dalla prima.

### Strumenti e catalogo condiviso

Uno strumento (per esempio SPAD, Termometro, Ciras) raggruppa i parametri che si misurano insieme. Gli strumenti partono dal **catalogo**, condiviso tra tutti gli utenti (pagina "Gestisci il catalogo" nelle Impostazioni, sezione Strumenti). Scegliere una voce la **copia** nell'esperimento: la copia resta collegata alla voce, ma si può cambiare senza toccare il catalogo. Uno strumento creato a mano può anche entrare nel catalogo.

Chiunque può modificare una voce del catalogo. La modifica vale per gli esperimenti futuri. Per gli esperimenti già avviati c'è la casella **"Aggiorna anche i miei esperimenti"**, con regole prudenti:

- tocca solo gli esperimenti di cui sei proprietario;
- aggiunge valori nuovi, rinomina, cambia unità, numero di letture e intervalli;
- non elimina valori e non cambia tipi; a un valore che ha già misure salvate non cambia unità e numero di letture, mentre nome, minimo e massimo sì;
- non aggiunge né rinomina un valore con un nome già usato nell'esperimento;
- se una copia era stata ritoccata a mano, quei campi restano come sono; l'app elenca cosa non è stato aggiornato.

Le voci del catalogo non si cancellano: si **archiviano** ("Archivia dal catalogo"). Spariscono dalla scelta, ma restano collegate alle copie esistenti. Anche uno strumento di un esperimento, se ha già misure, si archivia invece di eliminarlo: i dati restano e, dalle Impostazioni, si può ripristinare.

### Tabella fenologica

È un elemento a parte, **una sola per esperimento** e **facoltativa**: ognuno costruisce la sua con le voci che gli servono (numeri, testo, sì/no, liste ripetute, anche progressive). Si crea nel passo "Tabella fenologica" della creazione guidata, che si può saltare ("Questo esperimento non ha rilievi fenologici"), o più tardi dalle Impostazioni.

### Persone e ruoli

Chi crea un esperimento ne è il **proprietario** e può aggiungere colleghi già registrati (la registrazione resta su invito dell'amministratore), con uno di tre ruoli. I permessi li impone il database, l'app nasconde solo ciò che il ruolo non permette.

| Che cosa | Proprietario | Rilevatore | Lettore |
|---|---|---|---|
| Vedere tutto, Dataset, Esporta, i propri export salvati, Duplica | sì | sì | sì |
| Vedere chi è nell'esperimento | sì | sì | sì |
| Misure, note e foto: creare | sì | sì | no |
| Misure, note e foto: correggere ed eliminare le proprie | sì | sì | no |
| Misure, note e foto degli altri: correggere ed eliminare | sì | no | no |
| Configurazione (generale, fattori, trattamenti, piante, parametri, strumenti, fenologia) | sì | no | no |
| Stato (concluso), archivio .zip e "Libera lo spazio", eliminare l'esperimento | sì | no | no |
| Persone: aggiungere, cambiare ruolo, togliere | sì | no | no |
| Lasciare l'esperimento | sì, se resta un altro proprietario | sì | sì |

- I proprietari possono essere più d'uno, mai zero: l'ultimo proprietario non lascia l'esperimento e non cambia il proprio ruolo.
- "Le proprie" sono quelle salvate da te: una misura, una nota o una foto ricorda chi l'ha salvata, anche dopo che quella persona ha lasciato l'esperimento. Una misura in coda che corregge quella di un altro viene rifiutata e resta tra le "Non inviate" con il motivo.
- Chi lascia l'esperimento, o ne viene tolto, non lo vede più; le sue misure, note e foto restano.

## Primo amministratore

Un amministratore può invitare gli altri dalla pagina Inviti, ma il primo va creato a mano, perché nessuno può ancora invitarlo. Apri l'editor SQL (in locale: Studio su http://127.0.0.1:54423; online: Dashboard del progetto, SQL Editor).

1. Crea l'invito, con l'email scritta tutta in minuscolo (il database accetta solo email minuscole e senza spazi). Il database genera da solo il codice invito:

   ```sql
   insert into public.inviti(email) values ('nome@esempio.it') returning codice;
   ```

   Copia il codice che restituisce (8 caratteri, lettere maiuscole e cifre).
2. Nell'app, apri la pagina di registrazione (`/registrati`, per esempio http://localhost:5173/registrati) e inserisci la stessa email, una password e il codice invito.
3. Rendi amministratore il nuovo utente:

   ```sql
   update public.profili set admin = true where email = 'nome@esempio.it';
   ```

   Esci e rientra (o ricarica la pagina): la voce Inviti compare nel menu.

Gli inviti successivi li crea l'amministratore dalla pagina Inviti. La pagina mostra il codice dell'invito e il pulsante "Copia messaggio", che copia un testo pronto da mandare al collega con l'indirizzo della registrazione, l'email e il codice. L'invito vale una sola volta.

## Password dimenticata

Non c'è il recupero della password via email. L'amministratore la reimposta dall'editor SQL:

```sql
update auth.users
   set encrypted_password = extensions.crypt('<nuova password>', extensions.gen_salt('bf'))
 where email = 'nome@esempio.it';
```

Su Supabase l'estensione pgcrypto sta nello schema `extensions`, per questo le funzioni hanno il prefisso. Scegli una password di almeno 8 caratteri (come chiede la registrazione), comunicala al collega e digli di annotarla: l'app non ha ancora una pagina per cambiarla.

## Messa online su un nuovo progetto Supabase

La via più breve, senza riga di comando, è in [`docs/GUIDA-TELEFONO.md`](docs/GUIDA-TELEFONO.md): un solo file SQL da incollare nell'editor del Dashboard (`supabase/online/schema-completo.sql`, generato da `scripts/sql-unico.sh` unendo le migration; da rigenerare a ogni migration nuova), il sito su Vercel e l'installazione sul telefono. Qui sotto la via con la CLI.

1. Crea un progetto su https://supabase.com (il piano Free basta). Annota la password del database e il riferimento del progetto (`<ref>`, nell'indirizzo del progetto).
2. Dal repository, collega il progetto e porta lo schema online:

   ```
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

3. Nel Dashboard, Authentication → Providers → Email (o la voce con un nome simile, per esempio "Sign In / Providers"): **disattiva "Confirm email"** e lascia attiva la registrazione. Gli inviti non si impostano qui: li impone il database.
4. Nel Dashboard, Authentication → URL Configuration: imposta **Site URL** all'indirizzo dell'hosting.
5. Pubblica l'app su un hosting per siti statici (per esempio Vercel). Imposta le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (le trovi in Dashboard → Project Settings → API; la chiave è quella pubblica, `anon` o `publishable`, mai la `service_role` né una chiave segreta) e il comando di build `npm run build` con cartella di uscita `dist`. Ogni indirizzo dell'app (per esempio `/accedi` o `/esperimenti/…`) deve aprire comunque `index.html`: senza questa regola, ricaricando una pagina si vede un errore 404. Su Vercel la regola è nel file `vercel.json` nella cartella principale del repository (già presente su questo ramo):

   ```json
   {
     "headers": [{ "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }],
     "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
   }
   ```

   La riscrittura lascia fuori `/assets/`: un file che manca lì risponde 404 (non `index.html`, che il browser leggerebbe come un modulo rotto), e `sw.js` si rilegge sempre, così una versione nuova arriva ai telefoni.

   Le variabili `VITE_*` entrano nell'app al momento della build: se le cambi, rifai il deploy.
6. Crea il primo amministratore come descritto sopra, questa volta nell'editor SQL del Dashboard.

### La v2 resta online

La versione 2 resta in uso finché non si decide di sostituirla: i dati dell'esperimento attuale sono nel browser del telefono e vanno esportati prima. La v3 va su un deploy separato, con un proprio indirizzo. Non fare merge del lavoro della v3 su `main` finché non si decide: `main` è ciò che serve la v2.

## Database in pausa

Nel piano gratuito Supabase mette in pausa il progetto dopo 7 giorni senza attività. In quel caso l'app mostra "Il server non risponde…". Per riattivarlo: Dashboard → il progetto → **Restore project**. Ci vuole qualche minuto e i dati restano. Non lasciare però il progetto in pausa per mesi: dopo un certo tempo Supabase non permette più il ripristino dal Dashboard (controlla le condizioni attuali del piano Free). Usare l'app almeno una volta alla settimana di solito evita la pausa.

## Limiti del piano gratuito

- 500 MB di database
- 1 GB di file (le foto stanno qui: vedi "Foto" per lo spazio e l'archivio .zip)
- pausa dopo 7 giorni di inattività

Per un esperimento da qualche decina di piante il database resta molto sotto il limite.

## Struttura del codice

- `src/domain`: le regole dell'app, senza React né database (tipi, trattamenti, piante, misure, note, foto e archivio .zip, bozze, `giro.ts` per lo stato delle piante e il giro di misura di uno strumento, `statistiche.ts` per medie, confronti e valori da sistemare, `dataset.ts` e `grafico.ts` per le serie, i filtri e la geometria del grafico, `export/` per le scelte, i fogli e il riepilogo di Esporta, `catalogo.ts` per le copie dal catalogo, modello Hydrochar). Ha test propri, che non hanno bisogno né di React né del database.
- `src/api`: le chiamate a Supabase (database e Storage, per le foto) e la conversione tra righe del database e tipi del dominio.
- `src/pages`: una pagina per ogni schermata (accesso, esperimenti, creazione guidata in `wizard/`, home dell'esperimento, scelta dello strumento, misura di una pianta, fine giro, Oggi, catalogo, elenco e scheda delle piante, Diario, Foto, Dataset, Esporta Excel, impostazioni, inviti).
- `src/components`: i pezzi riusati dalle pagine; `ui/` contiene i componenti di base, le altre cartelle sono raggruppate per schermata.
- `src/lib`: utilità (date, numeri, errori, client Supabase), la consegna dei file (`scaricaFile.ts`), il grafico in PNG (`graficoPng.ts`) e `excel/scriviXlsx.ts`, l'unico modulo che importa exceljs.
- `src/store`: lo stato della misura in campo (strumento scelto, data di rilievo, valori mantenuti).
- `supabase/`: `migrations/` (schema, sicurezza per riga, inviti, funzioni, note e foto con il bucket dello Storage), `tests/` (pgTAP) e `config.toml`.

Per l'aspetto dell'interfaccia vedi `PRODUCT.md` e `DESIGN.md`.

## Dove sono i documenti

In `docs/superpowers`: `specs/` contiene il disegno della v3, `plans/` i piani di implementazione e il registro delle decisioni.
