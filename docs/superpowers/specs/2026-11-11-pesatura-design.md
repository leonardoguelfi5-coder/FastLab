# Design: Pesatura (aliquote, RWC, sostanza secca, taratura vasi)

**Data:** 2026-11-11
**Progetto:** FastLab, nuova sezione "Pesatura" dentro l'esperimento
**Tipo:** funzionalità nuova costruita sull'app esistente (React 19 + Vite + TypeScript + Zustand + TanStack Query + Supabase, PWA)
**Fa parte di:** un gruppo di tre progetti decisi dall'utente: **Pesatura** (questo), **Protocollario** e **Calcolatore / soluzione nutritiva**. Gli altri due avranno un documento ciascuno. Il Protocollario si collegherà alla Pesatura, quindi la Pesatura va costruita per prima.

---

## 1. Perché

In laboratorio e in serra si pesa di continuo: aliquote di campione per ogni analisi (antociani, clorofille, nitrati…), dischetti fogliari per l'RWC, organi per la sostanza secca, vasi per la taratura idrica. Oggi i pesi finiscono su carta o in fogli sparsi e poi vanno ricopiati, sia nei calcoli sia nel software degli strumenti (per esempio lo spettrofotometro, che normalizza le assorbanze sul peso).

L'utente vuole **uno strumento unico che serva in qualsiasi situazione in cui deve pesare qualcosa**, con un archivio di tutte le pesate fatte, e che si possa usare al banco con i guanti, anche a voce.

## 2. Obiettivi

1. **Una sola voce "Pesatura"** nell'esperimento, da cui si apre l'elenco delle analisi (Antociani foglie, Clorofille, RWC, % sostanza secca radici, Taratura vasi…).
2. **Ogni analisi ha un titolo scelto dall'utente e un tipo** che decide come si comporta l'app: Aliquota, RWC, % sostanza secca, Vasi.
3. **Le analisi restano salvate** e si riusano: la volta dopo si sceglie "Antociani foglie" dall'elenco invece di riscriverlo.
4. **Pesata sequenziale veloce**: l'app propone i campioni in ordine, si inserisce il peso e si passa al successivo ("Salva e vai al prossimo"), con lo stesso ritmo del giro di misura che esiste già.
5. **Più pesi per pianta** (repliche tecniche).
6. **Calcoli automatici**: mL di tampone (quando servono), RWC, % sostanza secca, curva di ritenzione idrica dei vasi.
7. **Un archivio a parte** con tutte le sessioni di pesata, consultabile ed esportabile in Excel.
8. **Una schermata di riepilogo** con tutti i pesi della sessione, grandi e in ordine, da leggere mentre li si ricopia nel software di uno strumento.
9. **Dettatura a voce hands-free**: "cinquantatré avanti" salva e passa al campione successivo.

## 3. Non-obiettivi

- **Le letture dello strumento** (assorbanze, ecc.) dentro l'app e il calcolo del risultato finale normalizzato: per ora no. I pesi si ricopiano nel software dello strumento, che fa lui i calcoli. Deciso dall'utente ("per ora lasciamolo così").
- **I pesi nella scheda della pianta**: no. Le pesate vivono nel loro archivio, non tra le misure della pianta. Deciso dall'utente.
- **Il calcolo dei mL di irrigazione per evento**: no, perché dipende da troppe variabili ed è situazionale. Deciso dall'utente.
- **La % di sostanza secca della pianta intera** calcolata dalla somma degli organi: no ("lascia stare il totale"). Se serve, si crea un'analisi "pianta intera" e si pesa tutto insieme.
- **La perdita di elettroliti** (electrolyte leakage): richiede letture di conducibilità, non pesi, quindi resta fuori dalla Pesatura. *Interpretazione di Claude* di "lettera di clickage", non confermata dall'utente.
- **Collegare la bilancia** via Bluetooth o cavo per leggere il peso in automatico: non richiesto.
- **Protocollario e Calcolatore**: progetti separati.

## 4. Anti-obiettivi

- **Perdere una pesata in silenzio.** Ogni salvataggio dice se è andato a buon fine. Se non riesce, il valore resta nel campo e si può riprovare.
- **La voce che salva un numero sbagliato senza che l'utente se ne accorga.** Se l'app non è sicura di cosa ha capito, non salva. Ogni salvataggio a voce viene ripetuto a voce.
- **Più lento della carta.** Una pesata di 56 campioni deve scorrere almeno come un giro di misura: un peso, un tocco (o una parola), campione successivo.
- **Calcoli su dati impossibili.** Un secco maggiore del fresco, o un turgido minore del fresco, va segnalato subito, non trasformato in un RWC assurdo.

## 5. Come funziona (dal punto di vista dell'utente)

### 5.0 Navigazione: nasce la sezione "Laboratorio"

Deciso dall'utente. La Pesatura e le prossime funzionalità (Protocollario, Calcolatore) vanno in una nuova sezione **Laboratorio**, e la navigazione cambia così:

- **Barra in basso** (`src/components/NavEsperimento.tsx`): **Laboratorio** prende il posto di **Dataset**. Le voci diventano Home, Piante, +, Laboratorio, Altro. *Decisione di Claude:* icona `FlaskConical` di Lucide.
- **Home dell'esperimento** (`src/pages/HomeEsperimento.tsx`, griglia "Sezioni"): **Dataset** prende il posto di **Esporta Excel**. Le voci diventano Oggi, Diario, Foto, Dataset.
- **Altro** (`src/pages/Altro.tsx`): **Esporta Excel** resta lì, dov'è già oggi. Non serve aggiungerlo.
- **Pagina Laboratorio** (nuova, `/esperimenti/:espId/laboratorio`): un elenco di strumenti di laboratorio con lo stesso stile della pagina Altro. Per ora contiene solo **Pesatura**. Protocollario e Calcolatore si aggiungeranno con i loro progetti. *Decisione di Claude:* finché non esistono non compaiono, niente voci "in arrivo".
- Vanno aggiornati i commenti e i test che descrivono la barra e la griglia (per esempio `AppShell.test.tsx` e i test della home), e i collegamenti "Dataset" interni alla home (le ultime misure che aprono il grafico) restano invariati.

### 5.1 Ingresso e analisi

- Nella pagina **Laboratorio** c'è la voce **Pesatura**.
- Aprendo Pesatura si vedono **le analisi** e, sotto, **l'archivio delle sessioni** (§5.7).
- **Nuova analisi**: titolo libero ("Antociani foglie"), tipo (Aliquota, RWC, % sostanza secca, Vasi), unità di peso (g o mg; *decisione di Claude:* default g) e le impostazioni del tipo (§5.3–5.6).
- *Decisione di Claude:* le analisi appartengono all'**utente** e si vedono in tutti i suoi esperimenti, così "Antociani foglie" creata in un esperimento si ritrova nel successivo. Le **sessioni** invece appartengono all'esperimento.
- Un'analisi si può rinominare. Si può archiviare (nascondere) ma non cancellare se ha sessioni, come per i parametri.
- *Decisione di Claude (dopo la revisione):* **ogni sessione copia le impostazioni dell'analisi al momento in cui nasce** (tipo, unità, repliche di default, rapporto del tampone, sensore e unità). Se dopo si cambia l'analisi, le sessioni vecchie restano come sono state pesate e mostrano i pesi nella loro unità. Il tipo di un'analisi non si cambia più dopo la prima sessione.
- *Decisione di Claude (dopo la revisione):* nell'esperimento di un altro, un rilevatore può avviare una sessione anche con un'analisi che appartiene a un altro membro dello stesso esperimento: vede le analisi già usate nelle sessioni di quell'esperimento, oltre alle proprie. Non può modificarle. Può farne una copia tra le proprie.

### 5.2 Sessione di pesata (comune a tutti i tipi)

- Scelta l'analisi, si apre una **sessione**: data (default oggi, modificabile) e una nota facoltativa.
- **Campioni.** Per i tipi Aliquota, RWC e % sostanza secca, l'app propone le **piante dell'esperimento** nel loro ordine.
  - *Decisione di Claude:* all'avvio si può restringere l'elenco (tutte le piante, solo alcuni trattamenti, o una scelta a mano), perché spesso si campiona solo una parte delle piante.
  - Si possono aggiungere **righe libere** che non corrispondono a nessuna pianta, con un nome scritto dall'utente: bianco, controllo, standard. Confermato dall'utente.
  - **Repliche:** per ogni pianta si possono aggiungere più pesi (replica A, B, C…). Confermato dall'utente. *Decisione di Claude:* le repliche si aggiungono con un pulsante sulla riga della pianta. Nell'analisi si può impostare un numero di repliche di default (per esempio 2), così l'app le propone già una dopo l'altra.
- **Pesata sequenziale.** Lo schermo mostra in grande il campione corrente (etichetta della pianta, trattamento, replica) e il campo del peso con la tastiera numerica. "Salva e vai al prossimo" salva e passa al campione successivo. Si può saltare un campione o tornare indietro.
- **Esito sempre visibile**, come nelle misure: "P12 · A salvato ✓", oppure un errore che lascia il valore nel campo.
- Una sessione si può **riaprire** in qualsiasi momento per correggere o completare dei pesi. I pesi restano sempre modificabili.

### 5.3 Tipo Aliquota

- Un peso per campione (con repliche).
- **Volume di tampone.** Di solito il volume è fisso, uguale per tutte le provette, e si normalizza dopo. In quel caso l'app non calcola niente. *Decisione di Claude:* nell'analisi si può attivare un **rapporto** facoltativo (per esempio 10 mL per g). Quando è attivo, accanto a ogni peso compaiono i mL di tampone da aggiungere a quella provetta, anche nel riepilogo. Confermato dall'utente ("in alcune situazioni mi serve").

### 5.4 Tipo RWC

- Tre pesi per campione, presi in **momenti diversi della stessa sessione**: fresco (al prelievo), turgido (dopo l'idratazione), secco (dopo la stufa).
- La sessione resta aperta. Quando ci si torna, l'app propone **solo i pesi che mancano**, campione per campione: dopo l'idratazione fa scorrere tutti i turgidi, dopo la stufa tutti i secchi.
- Per ogni campione si vedono i tre pesi affiancati e, appena ci sono tutti, **RWC = (fresco − secco) / (turgido − secco) × 100**.
- *Decisione di Claude:* l'app mostra anche la % di sostanza secca (secco / fresco × 100), visto che ha già i dati.
- *Decisione di Claude:* con le repliche, ogni replica ha il suo RWC e la riga della pianta mostra anche la media.

### 5.5 Tipo % sostanza secca

- Come l'RWC, ma con due pesi: fresco e secco, in momenti diversi della stessa sessione.
- **% sostanza secca = secco / fresco × 100.**
- Organi diversi (foglie, fusto, radici, dischetti) sono **analisi diverse con titoli diversi**: "% sostanza secca radici", "% sostanza secca foglie". Deciso dall'utente.

### 5.6 Tipo Vasi (taratura e curva di ritenzione idrica)

- **Campioni:** i vasi della taratura sono **vasi a parte**, senza pianta, non le piante dell'esperimento. Deciso dall'utente. Ogni vaso ha un nome libero ("V1", "HC 5% – A") e un **substrato**, che è un'etichetta libera. Più vasi con lo stesso substrato sono repliche.
- **Ordine delle pesate per ogni vaso:**
  1. **peso secco**: vaso + substrato completamente secco, la prima cosa che si fa;
  2. **peso a capacità di campo**: dopo saturazione e sgocciolamento;
  3. **asciugatura**: nei giorni successivi, a ogni giro, **peso + lettura del sensore** (tensiometro o altro strumento). Ogni giro aggiunge un punto. Data e ora si salvano a ogni lettura.
- *Decisione di Claude:* nell'analisi si sceglie cosa misura il sensore e la sua unità, per esempio tensione in kPa (tensiometro) oppure umidità volumetrica in % (sensore). La curva usa quell'unità.
- **Calcoli per ogni punto:** acqua nel vaso = peso − peso secco; **% di capacità di campo** = (peso − secco) / (capacità di campo − secco) × 100.
- **Grafico:** le curve di **tutti i vasi** e, sopra, la **curva media di ogni substrato**, ricavata dalle sue repliche. Deciso dall'utente. *Decisione di Claude:* la curva mette in relazione la lettura del sensore con la % di capacità di campo (o con l'acqua nel vaso), così vasi con pesi secchi diversi sono confrontabili.
- **Consultare la curva** (richiesto dall'utente: "a che peso i vasi sono al 50% della capacità di campo?"):
  - un riquadro in cui si scrive **una % di capacità di campo** (per esempio 50) **oppure una lettura del sensore** (per esempio 25 % di umidità, o −30 kPa);
  - l'app risponde con **il peso di ogni vaso** a quel valore e con **il valore medio del substrato**;
  - per la % di capacità di campo il peso del vaso si calcola dal suo peso secco e dal suo peso a capacità di campo: secco + % × (capacità di campo − secco). Per una lettura del sensore si usa la curva;
  - *decisione di Claude:* sotto il riquadro c'è una tabella già pronta con 100, 80, 60, 50, 40 % di capacità di campo, per ogni vaso e come media del substrato.
  - Il peso target del singolo vaso tiene conto del suo peso secco e della sua capacità di campo, che non sono identici tra i vasi.
- **Quali vasi:** l'utente pesa da secchi e a capacità di campo **tutti i vasi** che gli interessano, e per ognuno l'app calcola il peso target. Non c'è un trasferimento della curva da vasi campione ad altri vasi.
- Il grafico va bene per la tesi: si scarica come immagine (PNG) e i dati vanno in Excel (§5.8).
- *Decisione di Claude (dopo la revisione):* **una taratura è una sola sessione che resta aperta per giorni.** I vasi (nome e substrato) si definiscono dentro la sessione. Peso secco, capacità di campo e tutti i giri di asciugatura sono pesi di quella sessione, ciascuno con data e ora. Curva e tabella usano i punti di quella sessione. Nell'archivio la sessione è "in corso" finché l'utente non la segna "conclusa". Una nuova taratura (per esempio un altro esperimento) è una nuova sessione.
- *Decisione di Claude (dopo la revisione):* ogni giro di asciugatura propone i vasi in ordine, come nella pesata sequenziale. Un punto è valido solo se ha sia il peso sia la lettura del sensore.

### 5.7 Riepilogo e archivio

- **Riepilogo della sessione:** una schermata con tutti i pesi in ordine, a caratteri grandi, una riga per campione e replica (etichetta, replica, peso, mL di tampone se attivi, valori calcolati per RWC e sostanza secca). Serve per ricopiare i pesi nel software dello strumento senza aprire i campioni uno per uno. Confermato dall'utente ("mi serve una schermata in cui si vedono facilmente tutti i pesi").
- **Archivio:** tutte le sessioni dell'esperimento, dalla più recente, con data, analisi, numero di campioni pesati sul totale e stato (completa o con pesi mancanti). Si riapre qualsiasi sessione.
- **Online:** l'archivio è salvato online (Supabase), come il resto dei dati, così non si perde cambiando telefono. **La Pesatura lavora online** (deciso dall'utente dopo la revisione: "va bene online"). Ogni peso si salva subito sul server. Se il salvataggio non riesce, il valore resta nel campo con un errore chiaro e un pulsante per riprovare, e l'app non passa al campione successivo.

### 5.8 Export Excel

- Da una sessione (e, *decisione di Claude*, da tutte le sessioni di un'analisi insieme) si scarica un Excel con: Esperimento, Analisi, Data, Campione (etichetta pianta o nome libero), fattori e trattamento (per le piante), Replica, i pesi, i mL di tampone se attivi, i valori calcolati.
- Per i Vasi: un foglio con tutti i punti (vaso, substrato, data e ora, peso, lettura, acqua, % di capacità di campo), un foglio con la tabella dei pesi target e un foglio con il grafico come immagine. Si riusa il disegno del grafico in PNG che l'app ha già (`src/lib/graficoPng.ts`).
- Si usa ExcelJS, come l'export che esiste già.

### 5.9 Dettatura a voce (hands-free)

Pensata per il banco: guanti, bilancia, telefono appoggiato vicino.

- Un pulsante microfono grande avvia l'ascolto, che **resta attivo** finché non lo si ferma. Funziona in tutti i tipi di analisi.
- **"\<numero\> avanti"**: scrive il numero nel campione corrente, salva e passa al successivo. Esempio: "cinquantatré avanti", "zero virgola uno due avanti". La parola di comando è **avanti**. Deciso dall'utente.
- I decimali si dicono con **"virgola"**. L'unità non si dice: è quella dell'analisi.
- **"indietro"** torna al campione precedente. Ridicendo il valore lo si corregge.
- **Se l'app non capisce** il numero, non salva niente, emette un suono d'errore e resta sullo stesso campione.
- **Risposta a voce** dopo ogni salvataggio, con il valore e il prossimo campione: "53 salvato, prossimo P12". Così si sa che ha capito bene senza guardare lo schermo.
- **Vasi** (due numeri): "peso 2350 tensione 30 avanti". *Proposta di Claude, accettata dall'utente.* Il nome della seconda parola segue il sensore scelto nell'analisi.
- Sullo schermo il campione corrente e l'ultimo valore salvato sono scritti molto grandi, leggibili da lontano.
- Tutto il comportamento a voce descritto in questa sezione è stato confermato dall'utente.

## 6. Vincoli e decisioni tecniche

### 6.1 Già decise

- **Dentro l'app esistente**, con lo stesso stack e lo stesso stile (`DESIGN.md`, `PRODUCT.md`): italiano semplice, bersagli di almeno 44 px, contrasti decisi, uso con una mano.
- **Dati online su Supabase**, con RLS come il resto. *Decisione di Claude:* i permessi seguono i ruoli dell'esperimento (`src/domain/ruoli.ts`): proprietario e rilevatore creano e modificano sessioni (il rilevatore solo le proprie, come per le misure), il lettore legge ed esporta. Le analisi (titolo, tipo, impostazioni) appartengono all'utente che le crea. *Dopo la revisione:* l'autore si salva **su ogni peso**, non solo sulla sessione. Proprietario e rilevatori possono aggiungere pesi a qualsiasi sessione dell'esperimento (una sessione RWC si riempie in più giorni, anche da persone diverse). Il rilevatore corregge ed elimina solo i pesi propri. Impostazioni, campioni e chiusura della sessione li gestiscono chi l'ha creata e il proprietario.
- **Collegamento con il Protocollario** (*decisione di Claude*): non serve nessun campo ora. Il Protocollario aprirà la Pesatura con un'analisi scelta (avviando una sessione nuova), quindi basta che analisi e sessioni abbiano id stabili e che la pagina "nuova sessione" accetti l'analisi e l'esperimento come parametri. I dettagli si decidono nel documento del Protocollario.
- **Solo online:** nessuna coda locale e nessuna lettura in cache per la Pesatura (deciso dall'utente). Senza rete la sezione lo dice chiaramente e non permette di salvare. La coda delle misure (`src/lib/coda/`) non va toccata.
- **Spazio:** sono righe piccole, nessun file. Il piano gratuito di Supabase non è un problema.
- **Voce:** Web Speech API del browser (`SpeechRecognition` / `webkitSpeechRecognition`, lingua it-IT) per l'ascolto e `speechSynthesis` per la risposta a voce. **Su Android Chrome il riconoscimento di solito richiede internet.** Senza rete o su un browser che non lo supporta, il pulsante microfono va disattivato con una spiegazione ("La dettatura richiede la connessione"), e resta la tastiera. L'utente ne è stato informato.

### 6.2 Lasciate al builder

- Schema delle tabelle. Indicazione: analisi (utente, titolo, tipo, unità, impostazioni in JSONB: repliche di default, rapporto tampone, sensore e unità), sessioni (esperimento, analisi, data, nota, autore), campioni della sessione (pianta o nome libero, oppure vaso con substrato, ordine), pesi (campione, replica, tipo di peso: aliquota / fresco / turgido / secco / capacità di campo / punto di asciugatura, valore, lettura del sensore, data e ora).
- **Modello della curva di ritenzione.** Con un tensiometro (circa 0–80 kPa) e pochi punti per vaso, un modello empirico semplice (per esempio logaritmico) è probabilmente più robusto di van Genuchten. Il builder sceglie, purché l'app mostri l'equazione e l'R², e la curva media del substrato si calcoli in modo dichiarato (per esempio adattando il modello a tutti i punti delle repliche, oppure mediando i parametri dei singoli vasi).
- Come si interpretano i numeri detti a voce in italiano ("zero virgola zero cinque", "milleduecento"). Serve un parser con test.
- Route, componenti, layout preciso delle schermate.
- Test: almeno sui calcoli (RWC, sostanza secca, mL di tampone, % di capacità di campo, pesi target, adattamento della curva), sui controlli dei valori impossibili, sul parser dei numeri a voce e sulle regole RLS.

## 7. Riepilogo delle decisioni prese da Claude (da verificare)

1. Icona `FlaskConical` per Laboratorio; nella pagina Laboratorio niente voci "in arrivo" per le funzionalità non ancora costruite.
2. Analisi dell'utente, riusabili in tutti i suoi esperimenti. Sessioni dell'esperimento.
3. Unità di peso per analisi, default g.
4. Restringere le piante all'avvio della sessione (tutte, per trattamento, a mano).
5. Numero di repliche di default per analisi.
6. Rapporto mL/g facoltativo per il tampone.
7. Nell'RWC si mostra anche la % di sostanza secca. Con le repliche: valore per replica e media per pianta.
8. Sensore dei vasi configurabile (tipo e unità).
9. Curva dei vasi su % di capacità di campo (o acqua nel vaso) contro lettura del sensore.
10. Tabella già pronta con 100, 80, 60, 50, 40 % di capacità di campo, per vaso e come media del substrato, sotto il riquadro di consultazione.
11. Export anche di tutte le sessioni di un'analisi insieme.
12. Permessi secondo i ruoli dell'esperimento. L'autore si salva su ogni peso: i rilevatori aggiungono pesi a qualsiasi sessione e correggono solo i propri.
13. Microfono disattivato con spiegazione quando la dettatura non è disponibile.
14. Analisi archiviabili ma non cancellabili se hanno sessioni.
15. Ogni sessione copia le impostazioni dell'analisi quando nasce. Il tipo non si cambia dopo la prima sessione.
16. I membri di un esperimento possono usare le analisi già usate in quell'esperimento da un altro membro, senza modificarle.
17. Una taratura dei vasi è una sola sessione aperta per giorni, "in corso" finché non la si segna "conclusa".
18. Nessun campo di collegamento con il Protocollario per ora: bastano id stabili e una pagina "nuova sessione" che accetta analisi ed esperimento.

## 8. Decisioni dell'utente

- Nuova sezione **Laboratorio** nella barra in basso al posto di Dataset; Dataset nella home al posto di Esporta Excel; Esporta Excel in Altro. Laboratorio raccoglie la Pesatura e le prossime funzionalità.
- Una sola voce Pesatura, con analisi a titolo libero e un tipo che decide il comportamento.
- Le analisi restano salvate e si riusano.
- Più pesi per pianta.
- I pesi non vanno nella scheda della pianta, ma in un archivio a parte di tutte le pesate.
- Volume di tampone di solito fisso, con il calcolo dei mL disponibile quando serve.
- Una schermata con tutti i pesi, facile da leggere.
- Righe libere per bianchi e controlli; archivio online, export Excel.
- La Pesatura lavora solo online.
- Vasi: si pesano tutti i vasi da secchi e a capacità di campo. Output: grafico con tutte le curve e la curva media, Excel con i valori, e una consultazione del tipo "a che peso i vasi sono al 50% della capacità di campo?".
- RWC e sostanza secca: una sola sessione con i pesi affiancati e i calcoli automatici. Organi diversi sono analisi diverse.
- Niente totale della pianta intera, niente calcolo dell'irrigazione, niente letture dello strumento per ora.
- Vasi: peso secco, poi capacità di campo, poi peso + sensore durante l'asciugatura. Per ogni vaso, vasi a parte con un substrato, grafico con tutti i vasi e la curva media del substrato, pesi target per % di capacità di campo e per tensione.
- Voce: "\<numero\> avanti", con il comportamento descritto in §5.9.
