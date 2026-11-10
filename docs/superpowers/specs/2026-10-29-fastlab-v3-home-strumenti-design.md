# Design: FastLab v3, home dell'esperimento, strumenti, dati e foto

**Data:** 29/10/2026
**Base:** branch `claude/app-review-improvements-c26294` (Piano 1 completato, commit `af463b9` e seguenti).
**Sostituisce:** il concetto di "passata" della spec `2026-10-28-fastlab-v3-esperimenti-design.md` e i Piani 2 (grafici ed export) e 3 (foto) previsti lì. Le altre parti di quella spec (account su invito, fattori/trattamenti/piante, misure multiple, campi progressivi, sicurezza, sempre online, gratuito) restano valide.
**Mockup:** `docs/superpowers/specs/2026-10-29-fastlab-v3-home-mockup.html` (home a icone) e `docs/superpowers/specs/2026-10-29-fastlab-v3-esporta-mockup.html` (Esporta Excel). Danno la struttura; lo stile è quello di `DESIGN.md`.

---

## 1. Perché

L'utente ha provato la v3 su telefono. Il funzionamento c'è, ma due cose non vanno.

1. **La "passata" non corrisponde al lavoro vero.** In serra si sceglie di volta in volta uno strumento (SPAD, termometro, Ciras, metro…), lo si porta su **tutte** le piante e poi si passa a un altro, in un ordine che si decide sul momento. Raggruppare i parametri in passate durante la configurazione è macchinoso e innaturale. L'unico caso in cui serve comporre liberamente più voci è il **rilievo fenologico**.
2. **Manca una "home" dell'esperimento.** Oggi l'esperimento si apre direttamente sulla schermata di campo. Servono invece:
   - un punto di partenza per il lavoro in serra: nuova misura e scelta dello strumento;
   - un punto di partenza per il lavoro alla scrivania: dati, grafici, Excel;
   - un accesso chiaro a piante, note, foto e impostazioni.

## 2. Obiettivi

1. **Strumenti al posto delle passate.** Ogni strumento semplice è separato e porta i suoi valori: di solito uno, il Ciras più di uno. I fenologici sono una **tabella** che l'utente costruisce e che viene riproposta identica per ogni pianta.
2. **Catalogo di strumenti condiviso** tra tutti gli utenti, già popolato, che cresce con gli strumenti aggiunti da chiunque. Tutto resta sempre modificabile.
3. **Home dell'esperimento** con la striscia "Nuova misura" e sette icone: Oggi, Piante, Dataset, Esporta Excel, Diario, Foto, Impostazioni.
4. **Nuova misura sequenziale.** Si sceglie lo strumento e si procede una pianta dopo l'altra, saltando quelle già fatte oggi con quello strumento. Si può riprendere, e alla fine c'è un riepilogo.
5. **Dataset.** Grafici filtrabili (strumento, parametro, trattamento, fattore, periodo, piante), con la tabella dei valori dietro un pulsante.
6. **Esporta Excel** con la scelta di cosa scaricare e la possibilità di salvare le combinazioni.
7. **Piante.** Elenco raggruppato per trattamento. Scheda della pianta con ultimi valori, confronto discreto con il trattamento, avvisi di dati mancanti, storia completa con foto e note.
8. **Diario.** Note datate, che con una data futura diventano promemoria visibili in Oggi.
9. **Foto** da galleria e da fotocamera, collegate alle piante e alle note.
10. **"Mantieni questo parametro uguale anche nelle prossime misure"** come spunta scelta durante la misura, al posto dell'opzione "ricorda tra piante" della configurazione.

## 3. Non-obiettivi

- **Mappa del bancale.** Esclusa dall'utente perché troppo complicata.
- Analisi statistica (test, ANOVA, figure da pubblicazione): resta fuori dall'app, come nella spec precedente.
- Modalità offline.
- Condivisione di un esperimento tra più utenti. Resta possibile in futuro grazie alla tabella dei membri.
- Mini-grafici nella scheda della pianta. Scartati dall'utente perché "confusionari"; i grafici stanno in Dataset.

## 4. Anti-obiettivi

- **Perdere dati in silenzio.** Tutte le regole già in vigore restano valide: bozze salvate, conferme prima di scartare, niente misure doppie, valori con dati archiviati e mai cancellati. Lo stesso vale per foto e note: un'eliminazione si può annullare per qualche secondo.
- **Una home affollata o "da gestionale".** Valgono le icone grandi, il pollice e lo stile "quaderno di campo" di `DESIGN.md`.
- **Statistiche invadenti.** Nella scheda della pianta il confronto con il trattamento deve essere **molto discreto**: un numero piccolo in grafite tenue, e un segno solo quando la pianta è molto fuori dal gruppo.
- **Modificare uno strumento del catalogo e alterare gli esperimenti o i dati di un collega.**

## 5. Come funziona (dal punto di vista dell'utente)

### 5.1 Home dell'esperimento (`/esperimenti/:espId`)

Aprendo un esperimento si arriva qui, non più sulla schermata di campo.

- **Intestazione:** nome dell'esperimento e una riga di riepilogo, per esempio `56 piante · 8 trattamenti · in corso`.
- **Striscia "➕ Nuova misura"** in alto, a tutta larghezza, nel colore inchiostro. Sotto il titolo mostra lo stato della misura in corso, per esempio `SPAD in corso · 34/56`, oppure niente se non c'è una misura in corso.
- **Sette icone**, in griglia a due colonne con bersagli grandi:
  - 📅 Oggi
  - 🌿 Piante
  - 📊 Dataset
  - ⬇️ Esporta Excel
  - 📒 Diario
  - 📷 Foto
  - ⚙️ Impostazioni
- **Numerino su Oggi:** conta i promemoria del giorno non spuntati e i valori da sistemare.
- *Decisione di Claude:* Impostazioni sta da sola in fondo, a tutta larghezza, e la griglia resta 2×3 + 1.

### 5.2 Nuova misura (misura sequenziale)

1. **Scelta dello strumento.** Elenco degli strumenti dell'esperimento, compresa la tabella fenologica. Accanto a ognuno c'è il progresso del giorno, per esempio `34/56`, `fatto ✓` o `ultima volta 21/10`. Lo strumento lasciato a metà oggi sta in cima, con l'azione "Riprendi dalla pianta N".
2. **Data di rilievo:** stessa logica di oggi. Di base è oggi, si può cambiare, e se non è oggi compare l'avviso "non oggi" con "Usa oggi".
3. **Una pianta alla volta:**
   - in testa, numero della pianta (stile "numero pianta") e trattamento;
   - sotto, **solo i campi dello strumento scelto**: SPAD 1 valore (o N letture se impostate), Ciras i suoi valori, tabella fenologica tutte le sue voci;
   - valgono le regole già costruite per i campi: virgola decimale, letture ripetute, liste come i palchi, voci progressive precompilate dall'ultima volta.
4. **Ordine:** di base per numero di pianta. Le piante già misurate oggi con quello strumento vengono **saltate**, ma ci si può andare apposta. Si può saltare a qualsiasi pianta scrivendone il numero.
5. **Avanti:** il pulsante principale "Salva e vai alla N", nella barra d'azione sopra la tastiera, come oggi. Resta anche "Salva".
6. **"Mantieni questo parametro uguale anche nelle prossime misure":** una spunta accanto a ogni campo, scelta durante la misura.
   - Il parametro spuntato resta compilato con lo stesso valore sulle piante successive.
   - *Decisione di Claude:* la spunta dura finché resti nella stessa misura sequenziale (stesso strumento, stessa data di rilievo) o finché non la togli. Cambiando strumento o giorno si azzera.
   - Rimuove l'opzione "ricorda tra piante" dalla configurazione: va tolta da tutto, dati, editor e modello Hydrochar.
7. **📷 Aggiungi foto a questa pianta:** un pulsante piccolo nella schermata, da galleria o fotocamera.
8. **Fine giro:** quando non restano piante da misurare compare un riepilogo, per esempio `SPAD: 54/56 · mancano 12, 33`, con le azioni "Vai alle mancanti" e "Scegli un altro strumento".
9. Valgono tutte le protezioni già presenti nella scheda pianta: bozze, conferma prima di scartare, niente doppioni, avviso min/max con "Salva comunque".

### 5.3 📅 Oggi

- **Strumenti:** per ognuno, il progresso di oggi e da quanto tempo non si fa, per esempio "ultima 20/10 (14 giorni fa)". Toccandolo parte la misura.
- **Promemoria:** le note del Diario con la data di oggi o passata non ancora spuntate. Ogni promemoria ha una **spunta ✓**: toccandola si segna fatto e sparisce da Oggi.
- **Da sistemare:** *decisione di Claude*, discreta. Elenca i valori della giornata molto fuori dalla media del trattamento, come possibile errore di battitura. Toccando un valore si apre la misura da correggere.

### 5.4 🌿 Piante

- **Elenco raggruppato per trattamento**, come chiesto dall'utente:
  - un blocco per ogni trattamento, con il numero di piante e la media degli ultimi valori;
  - aprendolo si vedono le sue piante;
  - in alto, ricerca per numero o etichetta.
- **Scheda della pianta:**
  1. **Ultimi valori per strumento**, per esempio `SPAD 41,2 · 3 giorni fa`, con freccia ↑↓ rispetto alla misura precedente.
  2. **Confronto con la media del trattamento**, molto discreto (vedi anti-obiettivi).
  3. **Avvisi di dati mancanti**, per esempio "SPAD non misurato da 9 giorni".
  4. **Storia completa:** misure per data con icona dello strumento e ora, foto ed eventi del Diario collegati alla pianta, nella stessa linea del tempo. Toccando una misura la si corregge, con la pagina di modifica già esistente.
  5. **Dati della pianta:** etichetta, trattamento, fattori, blocco.
  6. Pulsanti per **aggiungere una foto** (galleria o fotocamera) e una **nota**.
- Niente mini-grafici.

### 5.5 📊 Dataset

- **Barra dei filtri** in alto, sempre visibile:
  - Strumento;
  - Parametro, quando lo strumento ne ha più di uno;
  - Trattamento, uno o più;
  - *decisione di Claude:* Fattore (es. "Hydrochar: Sì");
  - Periodo: tutto, ultime N settimane, dal… al…;
  - **Cerca piante**: si scrive un numero o un'etichetta, oppure più di uno separati da virgola.
- **Prima il grafico:** di base, media per trattamento nel tempo ± errore standard, una linea per trattamento.
  - Se si cercano piante precise si vedono le loro linee, con la media del loro trattamento come riferimento tenue.
  - Le note del Diario collegate (o di tutto l'esperimento) compaiono come segni verticali sulla data.
- **"Mostra i valori":** un pulsante sotto il grafico che apre la tabella con esattamente i dati del grafico e gli stessi filtri.
- **"Scarica questa vista":** apre Esporta Excel già compilato con i filtri correnti.
- Regola statistica della spec precedente: l'unità è la pianta. Prima la media giornaliera di ogni pianta, poi media ed errore standard tra le piante del trattamento.

### 5.6 ⬇️ Esporta Excel

Una schermata con quattro scelte e un riepilogo (vedi mockup).

1. **Cosa:** strumenti e tabella fenologica, scelta multipla.
2. **Quali piante:** tutte, per trattamento (uno o più), oppure piante precise.
3. **Periodo:** tutto, ultime 4 settimane, dal… al….
4. **Come**, spuntabili insieme:
   - **Valori di ogni pianta:** una riga per pianta e data, con colonne Esperimento, Pianta, fattori, Trattamento, Blocco, Data e un parametro per colonna. Per le misure multiple dello stesso giorno vale la regola della spec precedente: media del giorno più colonna `N_…`. Il foglio "Misure" contiene ogni singola misura con l'ora e le liste in fogli a parte.
   - **Medie per trattamento:** media, errore standard e n per data e parametro.
   - **Extra:** grafici come immagini, Diario, foglio Info (configurazione e data di export).
- **Riepilogo** di cosa conterrà il file (fogli e numero di righe), poi "Scarica Excel".
- **Export salvati:** "Salva questa scelta" con un nome. In cima compaiono gli export salvati, più il predefinito "📌 Tutto l'esperimento". *Decisione di Claude:* gli export salvati sono per esperimento e per utente.
- La libreria attuale (`xlsx` community) non inserisce immagini: va sostituita o affiancata, come già previsto.

### 5.7 📒 Diario

- **Nota:**
  - testo libero e data (di base oggi, modificabile anche al passato o al futuro);
  - collegamento facoltativo a tutto l'esperimento (di base), a uno o più trattamenti o a piante precise;
  - foto allegate, da galleria o fotocamera.
- **Elenco** per data, dalla più recente, con le note modificabili ed eliminabili ("Annulla" per qualche secondo).
- **Promemoria:** una nota con data futura è un promemoria. Il giorno giusto compare in Oggi con la spunta ✓. *Decisione di Claude:* una volta spuntato resta nel Diario barrato, con la data in cui è stato fatto, ed è eliminabile.
- Le note collegate compaiono nella storia delle piante interessate e come segni sui grafici di Dataset.

### 5.8 📷 Foto

- Si aggiungono **dalla galleria o dalla fotocamera**, quante si vogliono, dalla scheda della pianta, dalla misura sequenziale o da una nota del Diario.
- **Data:** quella di scatto se il file la conserva, altrimenti oggi. Sempre modificabile.
- L'icona **Foto** della home è una galleria per data, con filtri per pianta e trattamento.
- Valgono le scelte della spec precedente:
  - compressione nel browser (lato lungo circa 1600 px, circa 300 KB);
  - Supabase Storage con RLS per esperimento;
  - indicatore dello spazio (totale e quota);
  - archiviazione .zip di un esperimento concluso, con la possibilità di liberare lo spazio.

### 5.9 ⚙️ Impostazioni (modifica dell'esperimento)

Tutto sempre modificabile, con le regole di sicurezza già esistenti: un valore con dati si archivia e non si cancella, non si cambia il tipo, non si rimuovono piante con dati, non si cambia il trattamento di una pianta con misure.

- **Generale:** nome, data di inizio, note, "concluso".
- **Strumenti dell'esperimento:** aggiungi dal catalogo, modifica (nome, valori, unità, letture, min/max), archivia.
- **Tabella fenologica:** l'editor delle voci, cioè parametri di tipo numero, testo, sì/no e lista ripetuta, con l'opzione progressivo.
- **Fattori, trattamenti, piante:** come oggi.
- La creazione guidata dell'esperimento si aggiorna allo stesso modello: al posto dei passi "Parametri" e "Passate" ci sono "Strumenti" (dal catalogo) e "Tabella fenologica".

### 5.10 Catalogo strumenti condiviso

- **Elenco unico per tutti gli utenti**, già popolato. *Decisione di Claude* sul contenuto iniziale:
  - SPAD (1 valore);
  - Termometro (Temp aria, Temp pianta, °C);
  - Ciras (A, gs, E, Ci, con unità standard, modificabili);
  - Metro (Altezza, cm);
  - Calibro (Diametro, mm).
- Uno strumento creato da un utente **entra nel catalogo** e lo vedono tutti.
- **Aggiungere uno strumento a un esperimento ne crea una copia** nell'esperimento: modificarla vale solo lì e non tocca né il catalogo né gli altri esperimenti.
- **Il catalogo lo può modificare chiunque.** *Decisione di Claude:* la modifica vale per gli esperimenti futuri. Chi modifica può scegliere di aggiornare anche **i propri** esperimenti; quelli degli altri non cambiano mai.

## 6. Vincoli e decisioni tecniche

### 6.1 Già decise

- Stack, design, sicurezza e regole della spec precedente e di `DESIGN.md`/`PRODUCT.md`: italiano, mobile-first, sempre online, piani gratuiti, nessun merge su `main`.
- **Il modello dati delle passate va rifatto.** La v3 non è in produzione: nel database locale ci sono solo dati di prova, quindi si può ristrutturare senza migrare dati reali. Le migration restano incrementali (nuove migration, non riscrittura delle esistenti). Va aggiornato il modello Hydrochar:
  - strumenti Termometro, SPAD, Metro;
  - tabella fenologica con Altezza, N palchi totali (progressivo), N fiori fioriti, N frutti, N frutti invaiati, Palchi (lista, progressivo), Infiorescenze (lista, progressivo), Note.
- **Il catalogo è l'unica tabella condivisa tra utenti.** RLS: lettura e scrittura per tutti gli utenti autenticati; nessun accesso anonimo. Non contiene dati di misura.
- **Note e foto** hanno `esperimento_id` e RLS per membro, come il resto. Il collegamento a piante e trattamenti usa le FK composte, come oggi.
- Sono confermate tutte le protezioni dei dati del Piano 1: bozze, id generato dal client (`nuovoId()`), upsert, guardie nel DB.

### 6.2 Lasciate al builder

- **Schema esatto** di strumenti e tabella fenologica. Per esempio: `strumenti` dell'esperimento con `tipo` ('strumento' | 'fenologico') al posto di `passate`, `parametri` legati allo strumento, `catalogo_strumenti` con i parametri in JSONB. Come trattare un parametro che compare sia in uno strumento sia nella tabella fenologica (es. Altezza): due parametri distinti, oppure uno condiviso.
- Libreria per i grafici e per l'Excel con immagini; libreria per lo .zip e per la compressione delle foto.
- Struttura delle route: per esempio `/esperimenti/:espId` per la home, `/misura`, `/misura/:strumentoId`, `/piante`, `/dataset`, `/esporta`, `/diario`, `/foto`, `/oggi`, `/impostazioni`.
- Come suddividere il lavoro in piani. Suggerimento: (1) strumenti e catalogo, home e misura sequenziale; (2) Piante e Oggi; (3) Diario e Foto; (4) Dataset ed Esporta.
- La soglia del "molto fuori dal gruppo" per il segno discreto e per "Da sistemare", per esempio oltre 3 deviazioni standard dalla media del trattamento in quel giorno, con almeno 4 piante.

## 6.3 Precisazioni dopo la revisione (decisioni di Claude)

- **"Già misurata oggi".** "Oggi" è la **data di rilievo scelta**, non per forza il calendario. Una pianta conta come misurata con quello strumento se in quella data ha almeno una misura con **almeno un valore** di quello strumento. Se mancano dei valori dello strumento (es. Ciras con solo A e gs), la cella e il riepilogo la segnano come **"incompleta"** e "Vai alle mancanti" la include.
- **Andare apposta su una pianta già misurata** (deciso dall'utente). L'app chiede ogni volta: `Correggere quella delle 09:12 o aggiungerne una nuova?`, con i pulsanti "Correggi" e "Nuova misura". Se ci sono più misure quel giorno, le elenca per ora. "Correggi" apre la misura esistente in modifica, con lo stesso id. "Nuova misura" ne crea una in più, che nell'export conta nella media del giorno con la colonna `N_…`, come nella spec precedente.
- **Catalogo e copie.**
  - Lo strumento dell'esperimento conserva il collegamento alla sua voce di catalogo (`catalogo_id`).
  - "I propri esperimenti" sono quelli di cui l'utente è **proprietario**.
  - "Aggiorna anche i miei esperimenti" applica solo modifiche sicure: aggiunge valori nuovi, rinomina, cambia unità o min/max. Non elimina valori, non cambia tipi e non tocca i valori che hanno dati. Se la copia locale era stata modificata a mano, quei campi restano come sono e l'utente vede l'elenco di cosa non è stato aggiornato.
  - Le voci del catalogo non si cancellano: si **archiviano**, così spariscono dalla scelta ma restano collegate alle copie esistenti.
- **"Mantieni uguale" e progressivo.**
  - Se un campo ha la spunta "mantieni uguale", vince il valore mantenuto, perché è una scelta esplicita fatta durante la misura. Altrimenti vale il progressivo della pianta, poi il campo vuoto.
  - La spunta esiste per numeri (anche a letture ripetute), testo e sì/no. Non esiste per le liste ripetute: una lista è sempre propria della pianta e, se progressiva, riparte dalla sua ultima volta.
  - Il campo mantenuto mostra un segno visibile ("mantenuto") per non salvarlo inconsapevolmente sulla pianta sbagliata.
- **Tabella fenologica.** Una sola per esperimento, come confermato dall'utente nella conversazione ("ognuno possa costruirsi la sua tabella").
- **Parametri non numerici in Dataset.** I grafici mostrano solo i parametri numerici e il conteggio degli elementi delle liste (es. numero di palchi). Il sì/no si mostra come percentuale di "sì" per trattamento e data. Il testo compare solo nella tabella "Mostra i valori" e nell'export.

## 7. Riepilogo delle decisioni prese da Claude (da verificare)

1. Impostazioni a tutta larghezza in fondo alla griglia della home.
2. "Mantieni uguale" dura per la misura sequenziale corrente (stesso strumento e stessa data) o finché non si toglie.
3. "Da sistemare" in Oggi elenca i valori molto fuori media della giornata, in modo discreto.
4. Filtro per fattore in Dataset.
5. Export salvati per esperimento e per utente; predefinito "Tutto l'esperimento".
6. Promemoria spuntati restano barrati nel Diario, eliminabili.
7. Contenuto iniziale del catalogo: SPAD, Termometro, Ciras (A, gs, E, Ci), Metro, Calibro.
8. Modificare il catalogo vale per il futuro; chi modifica può aggiornare solo i propri esperimenti.
9. Pulsante foto anche nella misura sequenziale.
10. Data della foto: quella di scatto se disponibile, altrimenti oggi.
