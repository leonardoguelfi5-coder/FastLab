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

### Test del database

`npm run test:db` esegue i file in `supabase/tests` sul database locale (il riferimento: prima `npx supabase db reset`, che riapplica tutte le migration):

- `rls.test.sql`: chi può leggere e scrivere cosa (policy di sicurezza per riga);
- `inviti.test.sql`: registrazione solo su invito, con email e codice;
- `rpc.test.sql`: le funzioni del database usate dall'app;
- `guardie.test.sql`: le guardie sulle piante (una pianta con misure non cambia trattamento) e sul cambio di esperimento delle righe, aggiunte con la migration `20261029000006_guardie_piante.sql`.

- `strumenti.test.sql`: gli strumenti (tipo, archiviazione, vincoli) e la funzione che crea un esperimento;
- `catalogo.test.sql`: il catalogo condiviso, le sue policy e il collegamento delle copie.

Quando aggiungi una migration, aggiungi o aggiorna anche il test che la copre.

#### Senza Docker (ambienti cloud)

Dove Docker non c'è, `scripts/db-senza-docker/test-db.sh` fa lo stesso lavoro con un PostgreSQL 16 locale: ricrea il database `fastlab_test`, applica uno strato che imita Supabase (`stub-supabase.sql`), tutte le migration in ordine e lancia tutti i pgTAP. Deve finire con `Result: PASS`.

Servono i pacchetti apt `postgresql-16`, `postgresql-16-pgtap` e `libtap-parser-sourcehandler-pgtap-perl` (che porta `pg_prove`), con il cluster acceso (`pg_ctlcluster 16 main start`) e l'accesso `trust` per l'utente `postgres` sul socket locale. Lo script non sostituisce il riferimento, che resta `npx supabase db reset` seguito da `npm run test:db`: GoTrue, PostgREST e i privilegi reali di Supabase qui non ci sono.

## Come si usa

### La home dell'esperimento

Aprendo un esperimento si arriva alla sua home. In cima c'è il riepilogo (piante, trattamenti, in corso o concluso). Sotto c'è la striscia "Nuova misura", l'unico elemento a inchiostro pieno: se un giro è a metà, dice a che punto è (per esempio "SPAD in corso · 34/56"). Poi ci sono sette icone:

- Oggi, Dataset, Esporta Excel, Diario e Foto sono "In arrivo": aprono una pagina che dice che la sezione arriva con il prossimo aggiornamento;
- Piante apre l'elenco delle piante e, da lì, la scheda di ogni pianta con la sua storia;
- Impostazioni è a tutta larghezza in fondo: fattori, trattamenti, piante, strumenti e tabella fenologica.

### Nuova misura

1. **Scegli lo strumento.** "Nuova misura" mostra gli strumenti dell'esperimento, ognuno con il progresso (per esempio "34/56 oggi", oppure "ultima volta 21/10" o "mai misurato"). La data di rilievo è oggi, ma si può cambiare. Lo strumento del giro in corso sta in cima, con il pulsante "Riprendi dalla pianta 35".
2. **Misura una pianta dopo l'altra.** Si parte dalla prima pianta da misurare. Dopo ogni salvataggio l'app passa alla pianta successiva. Le piante già fatte con quello strumento, nella data di rilievo, si saltano da sole. Una pianta con solo una parte dei valori resta "incompleta" e non si salta.
3. **Una pianta già misurata.** Se ci arrivi apposta (digitando il numero o con "Vai alle mancanti") su una pianta già misurata quel giorno, l'app chiede "Correggi" (apre la misura che c'è, con lo stesso id) o "Nuova misura" (ne aggiunge una in più). Nel giro automatico non chiede: salta.
4. **Mantieni uguale.** Sotto i campi numerici, di testo e sì/no c'è "Mantieni questo parametro uguale anche nelle prossime misure". Con la spunta il valore si ripropone sulle piante seguenti, con un segno "mantenuto" ben visibile, finché non la togli o cambi strumento o data. Le liste ripetute non hanno la spunta: sono sempre della pianta.
5. **Fine giro.** Finite le piante, l'app dice quante sono fatte e elenca quelle che mancano, comprese le incomplete. Il pulsante "Vai alle mancanti" riparte dalla prima.

### Strumenti e catalogo condiviso

Uno strumento (per esempio SPAD, Termometro, Ciras) raggruppa i parametri che si misurano insieme. Gli strumenti partono dal **catalogo**, condiviso tra tutti gli utenti (pagina "Gestisci il catalogo" nelle Impostazioni, sezione Strumenti). Scegliere una voce la **copia** nell'esperimento: la copia resta collegata alla voce, ma si può cambiare senza toccare il catalogo. Uno strumento creato a mano può anche entrare nel catalogo.

Chiunque può modificare una voce del catalogo. La modifica vale per gli esperimenti futuri. Per gli esperimenti già avviati c'è la casella **"Aggiorna anche i miei esperimenti"**, con regole prudenti:

- tocca solo gli esperimenti di cui sei proprietario;
- aggiunge valori nuovi, rinomina, cambia unità e intervalli;
- non elimina valori, non cambia tipi e non tocca i valori che hanno già misure;
- se una copia era stata ritoccata a mano, quei campi restano come sono e l'app elenca cosa non è stato aggiornato.

Le voci del catalogo non si cancellano: si **archiviano** ("Archivia dal catalogo"). Spariscono dalla scelta, ma restano collegate alle copie esistenti. Anche uno strumento di un esperimento, se ha già misure, si archivia invece di eliminarlo: i dati restano e, dalle Impostazioni, si può ripristinare.

### Tabella fenologica

È un elemento a parte, **una sola per esperimento** e **facoltativa**: ognuno costruisce la sua con le voci che gli servono (numeri, testo, sì/no, liste ripetute, anche progressive). Si crea nel passo "Tabella fenologica" della creazione guidata, che si può saltare ("Questo esperimento non ha rilievi fenologici"), o più tardi dalle Impostazioni.

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
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

   Le variabili `VITE_*` entrano nell'app al momento della build: se le cambi, rifai il deploy.
6. Crea il primo amministratore come descritto sopra, questa volta nell'editor SQL del Dashboard.

### La v2 resta online

La versione 2 resta in uso finché non si decide di sostituirla: i dati dell'esperimento attuale sono nel browser del telefono e vanno esportati prima. La v3 va su un deploy separato, con un proprio indirizzo. Non fare merge del lavoro della v3 su `main` finché non si decide: `main` è ciò che serve la v2.

## Database in pausa

Nel piano gratuito Supabase mette in pausa il progetto dopo 7 giorni senza attività. In quel caso l'app mostra "Il server non risponde…". Per riattivarlo: Dashboard → il progetto → **Restore project**. Ci vuole qualche minuto e i dati restano. Non lasciare però il progetto in pausa per mesi: dopo un certo tempo Supabase non permette più il ripristino dal Dashboard (controlla le condizioni attuali del piano Free). Usare l'app almeno una volta alla settimana di solito evita la pausa.

## Limiti del piano gratuito

- 500 MB di database
- 1 GB di file
- pausa dopo 7 giorni di inattività

Per un esperimento da qualche decina di piante il database resta molto sotto il limite.

## Struttura del codice

- `src/domain`: le regole dell'app, senza React né database (tipi, trattamenti, piante, misure, bozze, `giro.ts` per lo stato delle piante e il giro di misura di uno strumento, `catalogo.ts` per le copie dal catalogo, modello Hydrochar). Ha test propri, che non hanno bisogno né di React né del database.
- `src/api`: le chiamate a Supabase e la conversione tra righe del database e tipi del dominio.
- `src/pages`: una pagina per ogni schermata (accesso, esperimenti, creazione guidata in `wizard/`, home dell'esperimento, scelta dello strumento, misura di una pianta, fine giro, catalogo, elenco e scheda delle piante, impostazioni, inviti, sezioni "In arrivo").
- `src/components`: i pezzi riusati dalle pagine; `ui/` contiene i componenti di base, le altre cartelle sono raggruppate per schermata.
- `src/lib` e `src/store`: utilità (date, numeri, errori, client Supabase) e lo stato della misura in campo (strumento scelto, data di rilievo, valori mantenuti).
- `supabase/`: `migrations/` (schema, sicurezza per riga, inviti, funzioni), `tests/` (pgTAP) e `config.toml`.

Per l'aspetto dell'interfaccia vedi `PRODUCT.md` e `DESIGN.md`.

## Dove sono i documenti

In `docs/superpowers`: `specs/` contiene il disegno della v3, `plans/` i piani di implementazione e il registro delle decisioni.
