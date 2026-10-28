# Design: FastLab v3 — Esperimenti configurabili e scheda pianta

**Data:** 2026-10-28
**Progetto:** FastLab — app per i rilievi in campo/serra
**Tipo:** Rifacimento delle fondamenta dell'app (dati, struttura, flusso), con riuso dell'interfaccia esistente dove possibile
**Entra in uso:** dal prossimo esperimento. L'esperimento Hydrochar × Cuore di Bue attuale resta sulla v2 finché i suoi dati non sono esportati.

---

## 1. Perché

L'uso reale della v2 ha mostrato un problema di fondo: i dati sono una **lista piatta di "rilevazioni"**. Ogni giornata produce schede nuove, e per aggiungere dati a una pianta bisogna andare a cercare la scheda giusta tra quelle vecchie. In più:

- l'esperimento è **uno solo e scritto nel codice** (56 piante e trattamenti fissi in `src/data/piante.ts`). Per un nuovo esperimento bisogna modificare il programma;
- i dati vivono **solo nella memoria del browser del telefono** (localStorage tramite Zustand `persist`). Supabase è tra le dipendenze ma non viene usato. Cancellando i dati del browser o cambiando telefono si perde tutto;
- non c'è modo di vedere **la storia di una pianta** nel tempo.

L'utente vuole un'app in cui:

> sapendo il numero della pianta (e il nome dell'esperimento) il programma vada direttamente al "file" di quella pianta e aggiunga i dati del giorno; ci sia un database consultabile per ogni esperimento, con le sue piante; aprendo la singola pianta si vedano tutte le misure nel tempo, con la data.

In più: **parametri scelti da lui** per ogni esperimento, **foto** delle piante e possibilità di farla usare ai **colleghi** per i loro esperimenti.

## 2. Obiettivi

1. **Al centro c'è la pianta, dentro un esperimento.** Scelto l'esperimento e digitato il numero della pianta, si apre la sua scheda: i dati di oggi si aggiungono lì, senza cercare nulla.
2. **Esperimenti configurabili dall'app**, senza toccare il codice: piante, trattamenti, parametri, passate.
3. **Storia della pianta**: tutte le misure e le foto, ordinate per data, con un mini-grafico per parametro.
4. **Foto** legate a pianta e data.
5. **Grafici di monitoraggio** nell'app e **Excel esportato** già pronto per l'analisi, con i grafici dentro come immagini.
6. **Multiutente**: ogni collega ha il proprio accesso e i propri esperimenti.
7. **Dati al sicuro online** (Supabase) invece che solo sul telefono.
8. **Tutto gratuito** (piani free di Supabase e dell'hosting).

## 3. Non-obiettivi (fuori da questo progetto)

- **Analisi statistica** (test, outlier, figure da pubblicazione): resta in un'app/strumento separato (es. la skill `fastlab` che lavora sull'Excel).
- **Modalità offline**: l'utente ha confermato che è sempre online.
- **Grafici Excel nativi e modificabili**: per ora i grafici nell'Excel sono immagini. Quelli nativi sono un possibile sviluppo futuro.
- **Condivisione di un esperimento tra più persone** (es. un collega che misura le tue piante): non ora. Il modello dati deve però permetterla in futuro senza essere rifatto (vedi §6.1).
- **Migrazione dei dati v2** nel nuovo database: non richiesta (decisione di Claude, non contestata dall'utente).

## 4. Anti-obiettivi (cose che renderebbero il progetto un fallimento anche se "funziona")

- **Perdere dati in silenzio.** Se il salvataggio non riesce (rete assente, errore), l'app lo deve dire chiaramente e non deve dare l'impressione che sia andato a buon fine.
- **Inserimento in campo più lento di oggi.** La v2 permette di fare una passata seriale (es. temperatura su 56 piante) in fretta. Il nuovo flusso non deve essere più macchinoso: la tastiera numerica resta (`NumericField`, `inputMode` numerico, compatibile con la dettatura vocale di Gboard), i valori ripetuti restano precompilati (es. temperatura dell'aria) e si passa alla pianta successiva con un tocco.
- **Un'app che i colleghi non sanno usare da soli.** La creazione dell'esperimento deve essere guidata e spiegarsi da sola.
- **Dati storici bloccati.** Le misure passate devono restare **sempre modificabili** (vedi §5.6).

## 5. Come funziona (dal punto di vista dell'utente)

### 5.1 Accesso

- Accesso tramite Supabase Auth. **L'utente ha lasciato la scelta a Claude** ("va bene anche registrazione se è più comodo"). Decisione: **email + password**, più **link magico via email** come alternativa. "Entra con Google" è facoltativo: va aggiunto solo se la configurazione OAuth resta gratuita e semplice.
- **Registrazione solo su invito** (deciso dall'utente). La registrazione libera è disattivata. Un utente **amministratore** (Leonardo) invita i colleghi dall'app: genera un link di invito, oppure inserisce l'email e l'app invia l'invito. Solo chi è stato invitato può creare l'account. Motivo: lo spazio foto gratuito è condiviso e uno sconosciuto con il link non deve poterlo consumare. Il meccanismo concreto (invito Supabase via funzione server, tabella di codici di invito, …) è lasciato al builder. Il primo amministratore si configura a mano, documentato nel README.
- L'accesso si fa **una volta per telefono**, poi la sessione resta attiva.
- Ognuno vede **solo i propri esperimenti**. L'amministratore non vede i dati degli altri: gestisce solo inviti e spazio (*decisione di Claude*).

### 5.2 Schermata "I miei esperimenti"

- Elenco degli esperimenti dell'utente con nome, numero di piante, numero di trattamenti, stato (in corso / concluso) e una riga tipo "Ultimo rilievo: oggi, 34/56 piante".
- Pulsante **"+ Nuovo esperimento"**.
- *Decisione di Claude:* azione **"Duplica"** su un esperimento esistente, per usarlo come base del successivo: copia la configurazione (trattamenti, piante, parametri, passate), non i dati.

### 5.3 Creazione dell'esperimento (procedura guidata)

1. **Dati generali**: nome, data di inizio, note facoltative.
2. **Fattori, trattamenti e piante**:
   - L'utente definisce i **fattori** sperimentali e i loro livelli. Esempio Hydrochar: *Stress* = Controllo, S1, W1, S1W1; *Hydrochar* = No, Sì. Un esperimento semplice può avere un solo fattore.
   - I **trattamenti** sono le combinazioni dei livelli. Di default l'app le propone tutte, e l'utente può escludere quelle che non usa. Ogni trattamento ha un'etichetta generata in automatico e modificabile (es. "S1 + HC").
   - Nell'export ogni fattore ha la **sua colonna** (deciso dall'utente), oltre alla colonna con l'etichetta del trattamento.
   - *Decisione di Claude:* campo facoltativo **Blocco/Replica** per pianta, esportato come colonna a sé quando è usato.
   - L'utente indica quante piante per trattamento. L'app genera la numerazione 1…N. **La numerazione è libera** (richiesta esplicita dell'utente): ogni pianta ha un'etichetta modificabile, quindi si può partire da 101, saltare numeri o usare codici tipo "B3-12". L'etichetta è unica nell'esperimento, ed è quella che si digita in campo. *Decisione di Claude:* si possono aggiungere o togliere piante anche dopo.
3. **Parametri**: per ognuno nome, unità (facoltativa) e tipo:
   - **numero** (con decimali; *decisione di Claude:* min/max facoltativi per segnalare valori sospetti, es. 150 cm invece di 15,0, come avviso e non come blocco);
   - **testo** libero;
   - **sì/no**;
   - **lista ripetuta**: un elenco di elementi numerati, ciascuno con uno o più sotto-campi numerici. Esempi della v2: *palchi* (per ogni palco: n. foglie), *infiorescenze* (per ogni infiorescenza: n. fiori).
   - *Decisione di Claude:* un parametro può essere segnato come obbligatorio nella sua passata.
   - **Progressivo** (deciso dall'utente): per le conte di qualcosa che cresce nel tempo, sia liste ripetute (palchi, infiorescenze) sia numeri (es. n. palchi totali), si attiva l'opzione "progressivo". Il campo si presenta **già compilato con l'ultimo valore registrato per quella pianta**, così l'utente corregge o aggiunge solo ciò che è cambiato. Senza l'opzione il campo parte vuoto a ogni rilievo. Nel modello Hydrochar *palchi* e *infiorescenze* sono progressivi (*decisione di Claude*, da confermare con l'utente).
   - *Decisione di Claude:* opzione **"letture ripetute"** per i parametri numerici (es. 3 letture SPAD su foglie diverse). Il form mostra N caselle, nell'export compaiono le singole letture e la loro media.
4. **Passate**: gruppi di parametri con nome e icona/emoji facoltativa (es. 🌡 Termometro = temp aria + temp pianta; 🌱 Fenologici = altezza, n. palchi, …, palchi, infiorescenze, note). Un parametro può stare in più passate (nella v2 l'altezza compare sia in "Altezza" sia in "Fenologici").
   - *Decisione di Claude:* per ogni parametro numerico si può attivare **"ricorda tra piante"**. Durante una passata il campo resta precompilato da una pianta all'altra (comportamento attuale di `temp_aria`). Non va confuso con "progressivo", che riprende il valore della *stessa pianta* dalla volta precedente.

**Modifiche a esperimento avviato** (*decisione di Claude*): si possono aggiungere parametri e passate e rinominarli. Se si cancella un parametro che ha già dei dati, il parametro viene **nascosto** (archiviato), non eliminato: i dati restano e compaiono ancora nell'export. Cambiare il tipo di un parametro con dati non è consentito.

### 5.4 Schermata dell'esperimento (in campo)

Approvata dall'utente come bozza (vedi mockup `2026-10-28-fastlab-v3-mockup-flusso-campo.html` in questa cartella):

- **Scelta della passata** (chip in alto).
- **Campo grande "N° pianta"** con tastiera numerica e pulsante "Apri scheda pianta". Accetta l'etichetta libera: se le etichette sono solo numeri la tastiera è numerica, altrimenti quella normale (*decisione di Claude*). Se l'etichetta non esiste viene mostrato un errore chiaro.
- **Griglia delle piante** con stato per la passata scelta e per la data di rilievo: misurata (verde, almeno una misura) o mancante (grigia). *Decisione di Claude:* se una pianta ha più misure in quella data, la cella mostra un piccolo contatore (es. "×2"). Toccando una cella si apre la scheda. Contatore "34/56".
- Accesso a **grafici** (📊), **export** (⬇️) e **impostazioni dell'esperimento** (⚙️).

### 5.5 Scheda della pianta

- Intestazione: etichetta della pianta e trattamento.
- **Riquadro "Oggi · \<passata\>"** con i campi della passata scelta.
- **Più misure nello stesso giorno** (deciso dall'utente: "si deve poter fare"). Ogni salvataggio registra una **misura con data di rilievo e orario**. Se per quella pianta, passata e data esistono già misure, il riquadro le elenca sopra il form (es. "09:12 · Temp aria 24,5 · Temp pianta 25,1"):
  - il form vuoto registra una **nuova misura** (es. il pomeriggio);
  - toccando una misura già fatta la si **corregge** invece di aggiungerne una nuova.
  - *Decisione di Claude:* l'orario viene preso automaticamente al salvataggio e si può modificare.
  - Passate diverse nello stesso giorno (es. Termometro alle 9, SPAD alle 10) sono misure distinte della stessa pianta e della stessa data, e nell'export finiscono nella stessa riga giornaliera (vedi §5.8).
- **Aggiungi foto**: scatto dalla fotocamera o scelta dalla galleria, anche più foto. Prima del caricamento ogni foto viene ridimensionata e compressa nel browser (*decisione di Claude:* lato lungo circa 1600 px, JPEG, obiettivo circa 300 KB).
- **"Salva e vai alla #\<successiva\>"**: salva e apre la scheda della pianta successiva nell'ordine dell'esperimento, con la stessa passata. Serve per fare tutta la passata di seguito. È disponibile anche un semplice "Salva".
- Feedback esplicito: "Pianta #35 salvata ✓", oppure un errore che lascia i dati nel form e permette di riprovare.
- **Storia**: elenco per data, dalla più recente, con i valori di quel giorno e le miniature delle foto. In alto un **mini-grafico** dell'andamento di un parametro numerico a scelta.

### 5.6 Modifica dei dati passati

Richiesta esplicita: **"i dati vecchi devono rimanere comunque modificabili sempre"**.

- Dalla storia della pianta si apre qualsiasi giornata passata e se ne modificano tutti i valori, comprese le liste ripetute, oltre ad aggiungere o togliere foto.
- Vale anche per gli esperimenti **conclusi o archiviati**: concludere un esperimento non lo rende di sola lettura.
- *Decisione di Claude:* deve essere possibile inserire dati **con una data diversa da oggi**, per esempio quando ci si è dimenticati di registrare qualcosa ieri. Il riquadro "Oggi" ha un selettore di data che di default è oggi.
- *Decisione di Claude (passata a cavallo di due giorni):* la data di rilievo si sceglie nella schermata dell'esperimento (default oggi) e **resta fissata** per tutta la passata, anche passando da una scheda all'altra, finché l'utente non la cambia. Chi finisce la mattina dopo una passata iniziata ieri lascia la data su ieri: il punto temporale non si spezza in due. Griglia, grafici ed export usano questa data.
- *Decisione di Claude:* nessuno storico delle singole modifiche (chi ha cambiato cosa e quando). Si salva solo la data dell'ultima modifica.

### 5.7 Grafici nell'app

- Nella scheda della pianta: andamento nel tempo di un parametro numerico.
- Nella pagina grafici dell'esperimento: per ogni parametro numerico, **media per trattamento nel tempo ± errore standard**, una linea per trattamento. *Decisione di Claude:* l'unità statistica è la pianta. Prima si calcola la media giornaliera di ogni pianta (come nel foglio "Dati"), poi media ed errore standard tra le piante dello stesso trattamento.
- Le liste ripetute non vengono graficate (*decisione di Claude*), salvo eventualmente il loro conteggio.

### 5.8 Export Excel

Un file per esperimento, con questi fogli:

- **"Dati"**: una riga per **pianta × data di rilievo**, con le colonne Esperimento, Pianta (etichetta), una colonna per ogni fattore, Trattamento, Blocco (se usato), Data, poi una colonna per ogni parametro non-lista (con l'unità nell'intestazione, es. `Altezza (cm)`). È il formato da incollare direttamente nell'analisi. *Decisione di Claude:* se quel giorno un parametro numerico ha più misure o letture ripetute, la cella contiene la **media del giorno** e una colonna accanto `N_<parametro>` indica quante misure l'hanno prodotta (solo quando, in tutto il foglio, c'è almeno un caso con più di una misura). Per testo e sì/no vale l'ultima misura del giorno.
- **"Misure"**: tutte le singole misure senza aggregazione, una riga per misura, con Pianta, fattori, Trattamento, Data, **Ora**, Passata, parametro, n. lettura e valore. Serve per chi vuole analizzare le ripetizioni o l'orario.
- **Un foglio per ogni lista ripetuta** (es. "Palchi"): Pianta, fattori, Trattamento, Data, Ora, N. elemento, sotto-campi.
- **"Grafici"**: un'**immagine** per ogni parametro numerico, uguale al grafico "media per trattamento ± ES" dell'app.
- *Decisione di Claude:* un foglio "Info" con la configurazione dell'esperimento (trattamenti, piante, parametri e unità) e la data di export.

Nota tecnica: la libreria attuale (`xlsx` / SheetJS community 0.18.5) **non sa inserire immagini**. Va sostituita o affiancata da una libreria che lo supporta (es. ExcelJS). Il grafico va disegnato in un canvas e convertito in PNG. La scelta della libreria spetta al builder.

### 5.9 Foto e spazio

- Le foto vanno nello Storage di Supabase. Limite del piano gratuito: circa 1 GB per progetto, **condiviso tra tutti gli utenti**.
- **Indicatore dello spazio usato** nelle impostazioni (es. "Foto: 420 MB su 1 GB"). *Decisione di Claude:* mostra sia il **totale del progetto** (quello che conta per il limite) sia **la quota dell'utente**. Il totale richiede una funzione lato server con privilegi, perché con RLS ogni utente vede solo i propri file.
- **Archiviazione dell'esperimento**: scarica uno .zip con l'Excel completo e tutte le foto, nominate `<pianta>_<AAAA-MM-GG>_<n>.jpg`. Poi offre di **liberare lo spazio** cancellando le foto online, previa conferma esplicita. I dati numerici restano nell'app e restano modificabili.

## 6. Vincoli e decisioni tecniche

### 6.1 Già decise

- **Stack**: si riparte dal progetto esistente (React 19 + Vite + TypeScript + Tailwind + shadcn/ui + React Router + Zustand). Si riusano i componenti utili (`NumericField`, `InlinePalchi`/`InlineInfiorescenze` come base per la "lista ripetuta", la UI di shadcn).
- **Backend**: Supabase (Postgres + Auth + Storage), piano gratuito. È una scelta di Claude, motivata dalle foto e dal multiutente.
- **Sicurezza**: Row Level Security su tutte le tabelle e sullo Storage, così ogni utente legge e scrive solo i propri esperimenti. Per permettere la condivisione futura, l'appartenenza va modellata con una tabella **membri dell'esperimento** (esperimento, utente, ruolo) invece di un solo campo "proprietario" (decisione di Claude). Per ora ogni esperimento ha un solo membro, il proprietario.
- **Sempre online**: nessuna cache offline o coda di sincronizzazione. Ogni salvataggio va al database e mostra l'esito.
- **Hosting**: oggi Vercel (piano Hobby, uso personale e non commerciale; la ricerca universitaria senza fini di lucro dovrebbe rientrarci, ma è un'interpretazione di Claude). Il sito è una SPA statica, quindi può passare a Cloudflare Pages o Netlify senza modifiche.
- **Supabase free si mette in pausa** dopo circa 7 giorni senza attività. L'app deve gestire questo caso con un messaggio comprensibile del tipo "il database è in pausa, riattivalo dal pannello Supabase", senza bloccarsi in modo muto. Va documentato nel README come riattivarlo.
- **Lingua dell'interfaccia**: italiano.

### 6.2 Lasciate al builder

- Schema esatto delle tabelle. Indicazione: esperimenti, membri, fattori e livelli, trattamenti (combinazioni di livelli), piante (etichetta, trattamento, blocco), parametri (tipo, unità, ordine, archiviato, progressivo, ricorda tra piante, n. letture, min/max), passate e parametri per passata, **misure** (pianta, passata, data di rilievo, orario; **più misure per pianta e giorno sono ammesse**), valori, foto (pianta, data di rilievo, eventualmente misura), inviti, ruolo amministratore. Per i valori va scelto tra righe per parametro o JSONB per misura; le liste ripetute probabilmente in JSONB. La scelta spetta al builder, purché export e grafici restino semplici.
- Libreria per i grafici nell'app e per le immagini nell'Excel. Lo stesso disegno deve servire a entrambi.
- Libreria per lo .zip e per la compressione delle foto.
- Gestione di stato e cache lato client (es. TanStack Query o Zustand).
- Struttura delle route e dei componenti.
- Grafica rifinita: il mockup definisce struttura e flusso, non lo stile.
- Test: almeno sulla logica di export (forma del foglio "Dati", aggregazione giornaliera di misure multiple, calcolo di media ± ES per pianta poi per trattamento), sul precompilato dei parametri progressivi e sulle regole di accesso (RLS, inviti).

## 7. Cosa resta della v2

- La v2 resta online e invariata finché l'utente non ha esportato i dati dell'esperimento in corso. La v3 va in un nuovo deploy (o sostituisce la v2 solo quando l'utente lo decide).
- `src/data/piante.ts` e `scripts/genera_piante.py` diventano superflui: l'esperimento Hydrochar si potrà ricreare come esperimento configurato. *Decisione di Claude:* includere un **modello pronto "Hydrochar × Cuore di Bue"** (fattori Stress × Hydrochar, 8 trattamenti con 6–14 piante come oggi, parametri e passate della v2, palchi e infiorescenze progressivi) da usare come esempio nella creazione guidata.

## 8. Riepilogo delle decisioni prese da Claude (da verificare)

1. Accesso con email e password più link magico; Google facoltativo.
2. Duplica esperimento.
3. Min/max sui parametri numerici come avviso.
4. Parametri obbligatori per passata.
5. "Ricorda tra piante" per parametro (distinto da "progressivo").
6. Parametri con dati: archiviati invece che eliminati; tipo non modificabile.
7. Inserimento con data diversa da oggi; data di rilievo fissata per tutta la passata.
8. Nessuno storico delle singole modifiche.
9. Compressione foto a circa 300 KB.
10. Liste ripetute non graficate.
11. Foglio "Info" nell'Excel.
12. Tabella membri per predisporre la condivisione.
13. Modello pronto Hydrochar, con palchi e infiorescenze progressivi.
14. Nessuna migrazione dei dati v2.
15. Foglio "Dati" con la media giornaliera quando ci sono più misure, più colonna `N_<parametro>`; foglio "Misure" con tutte le singole misure e l'orario.
16. Orario preso automaticamente al salvataggio, modificabile.
17. Opzione "letture ripetute" per i parametri numerici.
18. Campo facoltativo Blocco/Replica per pianta.
19. Grafici: media per pianta, poi media ± ES per trattamento.
20. L'amministratore gestisce inviti e spazio, ma non vede i dati degli altri.
21. Indicatore spazio con il totale del progetto e la quota dell'utente.

## 9. Decisioni dell'utente (dopo la revisione)

- Più misure per pianta nello stesso giorno: **sì**.
- Trattamenti: **colonne separate per fattore**.
- Registrazione: **solo su invito**.
- Liste e conte: **riparte dall'ultima volta solo per le conte progressive**, quindi è un'opzione per parametro.
