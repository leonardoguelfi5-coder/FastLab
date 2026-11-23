# Taratura e stress idrico — design

Data: 2026-11-23. Segue `2026-11-19-curva-vasi-potenza-design.md` (tensiometro) e `2026-11-19-taratura-tdr-design.md`
(TDR), che hanno costruito le curve dentro la Pesatura come tipo di pesata «Vasi».

## Intento

L'utente ha ricontrollato le tarature del TDR e dei tensiometri e le vuole **fuori dalla Pesatura**, in uno strumento di
Laboratorio loro, **«Taratura e stress idrico»**. Lì le pesate (peso + lettura dello strumento) si inseriscono, si
correggono e si eliminano sempre, e a schermo resta solo l'essenziale: **il grafico, il riassunto delle pesate e un
calcolatore nei due versi: «scrivo la % CC → leggo il valore dello strumento» e «scrivo la lettura → leggo la
% CC»**. Tutto il resto della pagina di oggi è inutile.

## Obiettivi (decisi dall'utente)

1. **Posizione.** In Laboratorio, accanto a «Pesatura», una voce nuova «Taratura e stress idrico» con elenco, nuova
   sessione e pagina della sessione sue. Dalla Pesatura sparisce tutto ciò che riguarda i vasi (la voce «Vasi» di «Nuova
   pesata», le sessioni vasi nell'elenco, le curve nella pagina della sessione).
2. **Letture.** A capacità di campo (100 %) ogni vaso ha **obbligatoriamente** la lettura dello strumento, sia TDR sia
   tensiometro. Al **secco nessuna lettura** (l'utente si è fidato del consiglio: il punto a 0 % non può entrare nella
   legge di potenza, che non arriva mai a zero; il secco resta solo il riferimento dello 0 % della % CC).
3. **Sempre modificabili ed eliminabili.** Ogni pesata (secco, CC, ogni punto di asciugatura, con la sua lettura) si
   corregge e si elimina; si aggiungono pesate nuove con la loro lettura in qualsiasi momento. Si elimina anche la
   sessione intera (c'è già). **Anche nelle altre pesature** (Aliquota, RWC, % sostanza secca) un peso già salvato si
   corregge (c'è già) e ora **si elimina**.
4. **A schermo solo:** grafico, riassunto delle pesate, calcolatore % CC ↔ lettura (nei due versi). Si tolgono la tabella dei parametri,
   la tabella «Pesi a % CC fisse», i deficit (la vecchia consultazione per lettura, che dava pesi, diventa il verso «lettura → % CC» del
   calcolatore) e la riga «TDR target» della
   tabella.
5. **Grafico** costruito come quello di oggi (Figura 5 della tesi): i punti di ogni vaso, la curva di ogni vaso, la curva
   media del substrato in evidenza; un grafico per substrato.
   - **Tensiometro:** legge di potenza WC = a·h^b (minimi quadrati non lineari su WC), media in scala logaritmica
     (a = media geometrica, b = media aritmetica). Invariato.
   - **TDR:** **retta** %CC = m·TDR + q (minimi quadrati ordinari), media delle rette dei vasi. L'utente ha chiesto alla
     bibliografia e ha accettato la retta: la legge di potenza è della curva di ritenzione, non della taratura dei
     sensori dielettrici; sull'uscita «raw» la retta va bene nel campo 100–40 % CC.

## Non obiettivi

- Nessuna modifica al calcolo delle curve (`src/domain/pesatura/curva.ts`): adattamento, media, `letturaAPercentuale`
  restano come sono (testati sui valori della tesi e di scipy).
- Nessuna migrazione del database. Le sessioni restano in `sessioni_pesatura` con `tipo = 'vasi'`; le policy RLS già
  permettono a chi ha i permessi di correggere ed eliminare i pesi (`pesi_update`, `pesi_delete`, 20261111000017).
- Niente lettura al secco, niente modello diverso dalla potenza per il tensiometro, niente polinomio per il TDR.
- Niente soglie di irrigazione né deficit a schermo.
- Il funzionamento senza rete non cambia: la Pesatura è solo online, la Taratura anche.

## Anti-obiettivi

- Perdere o nascondere le sessioni vasi già salvate: devono comparire subito nella sezione nuova.
- Una correzione o eliminazione che parte senza conferma (eliminare chiede sempre conferma).
- Lasciare in Pesatura qualcosa dei vasi (una voce, un'etichetta, un collegamento) che porti l'utente là.

## Approcci considerati

- **A. Sezione nuova, stessi dati (scelto).** Pagine e percorsi nuovi; i dati restano `tipo = 'vasi'` nelle tabelle di
  oggi; la Taratura mostra solo quelle sessioni, la Pesatura tutte le altre. Le sessioni vecchie ci sono subito, i calcoli
  verificati restano.
- B. Tabelle nuove nel database: separazione più netta ma migrazione con copia delle sessioni vecchie e rischio di
  perderne; per l'utente nulla di diverso. Scartato.
- C. Solo un collegamento in Laboratorio, tutto resta in Pesatura: contrario all'obiettivo 1. Scartato.

## Il come (deciso)

### Navigazione e percorsi

- `STRUMENTI_LABORATORIO` (src/pages/Laboratorio.tsx): aggiungere `{ nome: 'Taratura e stress idrico', icona: <un'icona
  lucide adatta, es. Droplets>, percorso: percorsoTaratura }` dopo «Pesatura».
- Percorsi nuovi in `src/lib/percorsi.ts`, sotto `/esperimenti/:espId/laboratorio/taratura`:
  elenco, `/nuova` (con «Ripeti» da una sessione, come oggi), `/:sessioneId`, `/:sessioneId/pesa/:fase` (giro di
  pesata con dettatura).
- I vecchi indirizzi della Pesatura che aprono una sessione vasi (`/laboratorio/pesatura/:sessioneId[...]`) portano alla
  stessa pagina della Taratura (reindirizzamento), così i link salvati non si rompono.

### Pesatura (cosa si toglie)

- «Nuova pesata»: la scelta del tipo non offre più «Vasi» (restano Aliquota, RWC, % sostanza secca). «Ripeti» di una
  sessione vasi non esiste più in Pesatura.
- Elenco della Pesatura: senza le sessioni `vasi`.
- Pagina della sessione: senza la sezione curve, il sensore, il «Segna come conclusa» (che c'era solo per i vasi).
- Il codice dei vasi esce da `src/pages/pesatura/*` e `src/components/pesatura/*` verso la cartella della taratura;
  i tipi e il dominio comuni (`tipi.ts`, `sequenza.ts`, `curva.ts`, `export.ts`) restano dove sono se servono a entrambi.

### Taratura — elenco

- Le sessioni `vasi`, dalla più recente. Ogni riga: data, sensore (TDR / Tensione), titolo, prima riga della nota, quanti
  vasi e quante pesate. Pulsante «Nuova taratura»; «Ripeti» per riga (copia titolo, sensore, unità e vasi).
- Niente divisione «In corso / Completate» né «Segna come conclusa»: una taratura si arricchisce quando si vuole. Il
  campo `conclusa` del database resta com'è e non si legge.

### Taratura — nuova sessione

- Come la «Nuova pesata» di oggi col tipo Vasi già scelto: titolo, data, unità di peso, sensore (TDR `raw` / Tensione
  `hPa`) con la sua unità, nota, elenco dei vasi (nome, substrato). Al salvataggio si apre la pagina della sessione.

### Taratura — pagina della sessione (in quest'ordine)

1. **Intestazione:** titolo, data · sensore · unità, nota modificabile (come oggi).
2. **Grafico per substrato** (il `GraficoCurve` di oggi, invariato) con sotto **l'equazione della curva media** in una
   riga (`equazione`), o «servono almeno 3 letture diverse in un vaso per la curva». Pulsante «Scarica grafico (PNG)».
3. **Riassunto delle pesate:** per ogni vaso (raggruppati per substrato) una tabella con le righe
   - Secco: peso;
   - Capacità di campo: peso e lettura (se manca la lettura: «manca la lettura», evidenziato);
   - Asciugatura, una riga per punto in ordine di tempo: data e ora, peso, lettura, % CC calcolata.
   Ogni riga ha **Modifica** ed **Elimina**. Ogni vaso ha **«Aggiungi pesata»** (un punto di asciugatura: peso +
   lettura). Se manca il secco o la CC, la riga dice «da pesare» e il tocco apre l'inserimento.
4. **Calcolatore, nei due versi.** Una scelta «Che cosa conosci»: «% di capacità di campo» oppure «Lettura dello
   strumento» (con il nome e l'unità del sensore), e un campo solo.
   - **% CC → lettura:** per ogni substrato la **lettura dello strumento** dalla curva media (`letturaAPercentuale`
     sulla media), e sotto la lettura dalla curva di ogni vaso.
   - **Lettura → % CC:** per ogni substrato la **% CC** dalla curva media (`pccDaLettura` sulla media), e sotto la % CC
     dalla curva di ogni vaso. Per il tensiometro la lettura si confronta in valore assoluto, come nella curva.
   In entrambi i versi: accanto a un valore estrapolato oltre le letture misurate di quella curva, «fuori dai valori
   misurati»; senza curva, «—». Cambiare verso svuota il campo. Nessun peso, nessun deficit.
5. **Esporta e gestisci:** «Pesa tutti i vasi» (il giro di pesata sotto), «Scarica Excel», «Ripeti questa taratura»,
   «Elimina taratura» (con conferma, come oggi).

### Inserire, correggere, eliminare

- **Giro di pesata** (`/pesa/:fase`): il percorso a passi di oggi, con la dettatura «peso 150 lettura 35 avanti». Le fasi
  sono Secco (solo peso), Capacità di campo (peso + lettura obbligatoria), Asciugatura (peso + lettura obbligatoria, un
  punto nuovo per vaso). Serve a pesare tutti i vasi in fila.
- **Modifica** di una riga del riassunto: si aprono peso e lettura (la lettura solo se la fase la chiede) già compilati;
  «Salva» e «Annulla». Dove si apre (sul posto o in un riquadro) è del builder. L'ora della misura non cambia.
- **Aggiungi pesata** su un vaso: peso + lettura, ora = adesso.
- **Elimina** una riga: conferma «Eliminare questa pesata? Non si può annullare.»; poi `eliminaPeso`. Eliminare il secco
  o la CC lascia il vaso «da pesare» e le sue % CC spariscono finché non si ripesa.
- **Permessi:** Modifica/Elimina/Aggiungi solo a chi può misurare; chi non è il proprietario dell'esperimento corregge ed
  elimina solo i pesi creati da lui (come le policy). Senza rete i pulsanti che scrivono sono disattivati, come oggi.

### Eliminare un peso nelle altre pesature

- Nella schermata di pesata (`Pesata.tsx`), quando il passo ha già un peso salvato e chi guarda può eliminarlo, c'è
  «Elimina questo peso» con la stessa conferma. Dopo l'eliminazione il passo resta vuoto (si può ripesare) e la sessione
  torna «Mancano dei pesi».

### Excel della taratura

- Fogli: **Punti** (come oggi, con la colonna Fase e la riga CC), **Parametri** (la curva di ogni vaso e la media: per
  la potenza a, b; per il TDR m, q; R², n), **Calcolatore** (per ogni substrato la lettura dalla curva media a 100, 80,
  60, 50, 40 % CC, con la nota «fuori dai valori misurati» se estrapolata, per entrambi i sensori), **Grafico**, **Info**.
- Si tolgono «Pesi target» e «Soglie» (non servono più, l'utente li ha giudicati inutili).

### Casi particolari (decisi da Claude dopo la verifica del builder)

- **Dati vecchi.** Una lettura salvata su un secco resta nel database ma non si mostra, non entra nei calcoli e non si
  modifica (la modifica del secco chiede solo il peso e la salva a `null`). Una CC senza lettura si mostra «manca la
  lettura»: il vaso ha comunque la % CC dei suoi punti, ma il punto a CC non entra nella curva (come oggi); nell'Excel
  la cella della lettura resta vuota.
- **Modifica** = upsert dello stesso peso (stesso id, stesso `misurato_il`); `creato_da` non cambia. **Ripesare** un secco
  o una CC eliminati crea un peso nuovo dell'utente che lo inserisce; due punti di asciugatura possono avere la stessa ora.
- **Pulsanti per permesso:** chi non può modificare o eliminare un peso non vede i pulsanti (nascosti, non disattivati).
- **Pesatura, peso eliminato:** una sessione può restare senza pesi; i calcoli mostrano «—» dove mancano i pesi.
- **Reindirizzamento:** la pagina della sessione e quella di pesata della Pesatura, quando la sessione (già caricata con
  `usePesatura`) è `vasi`, sostituiscono l'indirizzo con quello della Taratura (stesso `sessioneId`, stessa `fase`).
- **Giro di pesata:** le tre fasi sono sempre raggiungibili dalla pagina, anche quando sono complete (per ripesare in fila).
- **Nota:** la modifica della nota conserva il valore di `conclusa` che c'è.
- Il TDR come retta (m, q) è già supportato da `curva.ts` ed `export.ts`; il calcolatore usa `letturaAPercentuale`, che
  inverte già la retta e la potenza.

## Lasciato al builder

- Testi esatti dei pulsanti e dei messaggi minori, icona della voce di Laboratorio, aspetto della modifica (sul posto o
  riquadro), come scorciare il riassunto su schermi stretti.
- Come dividere i file (pagine nuove sotto `src/pages/taratura/`, componenti sotto `src/components/taratura/` è il
  suggerimento) e quali componenti di Pesatura condividere.
- Decimali del calcolatore: quelli delle letture misurate più uno (`decimaliLetturaTarget`).

## Decisioni di Claude (da verificare)

1. Il secco senza lettura (consiglio accettato dall'utente).
2. Tenere «Scarica Excel», «Scarica grafico (PNG)» e la riga dell'equazione sotto il grafico (l'utente non li ha citati).
3. Niente «In corso / Conclusa» nella Taratura.
4. Il calcolatore (nei due versi, richiesta dell'utente) mostra il valore della curva media e, sotto, quello di ogni vaso.
5. Excel: fogli Punti, Parametri, Calcolatore, Grafico, Info.
6. I vecchi indirizzi delle sessioni vasi in Pesatura reindirizzano alla Taratura.
