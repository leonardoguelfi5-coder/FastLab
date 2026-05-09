# FastLab — AppSheet Rilievi Agronomici: Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurare un'app AppSheet (Free) + Google Sheets per registrare rilievi agronomici e fenotipici su 56 piante in campo, con dati relazionali (palchi e infiorescenze), tastierino numerico e dettatura vocale.

**Architecture:** 1 file Google Sheets con 4 tab (Piante, Rilevazione_Principale, Dettaglio_Palchi, Dettaglio_Infiorescenze). AppSheet si connette al file, gestisce le relazioni parent-child, le formule automatiche e le views ottimizzate per smartphone.

**Tech Stack:** Google Sheets, AppSheet Free (piano Starter), Android + Gboard.

---

## File coinvolti

| File | Tipo | Scopo |
|---|---|---|
| Google Sheets: `FastLab_Rilievi` | Cloud (Sheets) | Backend dati — 4 tab con intestazioni |
| AppSheet: `FastLab` | Cloud (AppSheet) | App mobile — configurazione colonne, views, bot |
| `scripts/genera_piante.py` | Python locale | Genera CSV con i 56 record da incollare in Sheets |

---

## Task 1: Creare il file Google Sheets con intestazioni

**Files:**
- Crea: Google Sheets `FastLab_Rilievi` (su Google Drive)

- [ ] **Step 1: Crea nuovo Google Sheets**

  Vai su [sheets.google.com](https://sheets.google.com) → **+ Nuovo foglio di calcolo**.
  Rinomina il file in `FastLab_Rilievi` (doppio clic sul titolo in alto).

- [ ] **Step 2: Configura tab "Piante"**

  Rinomina `Foglio1` → `Piante` (tasto destro sulla tab → Rinomina).
  Nella riga 1, inserisci esattamente queste intestazioni (una per cella):

  | A1 | B1 |
  |---|---|
  | ID_Pianta | Trattamento |

- [ ] **Step 3: Aggiungi tab "Rilevazione_Principale"**

  Clic su **+** in basso → rinomina in `Rilevazione_Principale`.
  Riga 1:

  | A | B | C | D | E | F | G | H | I | J | K | L | M | N |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | ID_Rilevazione | Data_Ora_Inizio | Data_Ora_Fine | ID_Pianta | Trattamento | Altezza | N_palchi_totali | N_fiori_fioriti | N_frutti | N_frutti_invaiati | Spad | Temp_Aria | Temp_Pianta | Note |

- [ ] **Step 4: Aggiungi tab "Dettaglio_Palchi"**

  Clic su **+** → rinomina in `Dettaglio_Palchi`.
  Riga 1:

  | A | B | C | D |
  |---|---|---|---|
  | ID_Palco | ID_Rilevazione | Numero_Palco | N_Foglie |

- [ ] **Step 5: Aggiungi tab "Dettaglio_Infiorescenze"**

  Clic su **+** → rinomina in `Dettaglio_Infiorescenze`.
  Riga 1:

  | A | B | C | D |
  |---|---|---|---|
  | ID_Infiorescenza | ID_Rilevazione | Numero_Infiorescenza | N_Fiori |

- [ ] **Step 6: Verifica struttura**

  Il file deve avere esattamente 4 tab nell'ordine: `Piante`, `Rilevazione_Principale`, `Dettaglio_Palchi`, `Dettaglio_Infiorescenze`. Nessun dato nelle righe 2+ per ora. Salva (Ctrl+S).

---

## Task 2: Popolare la tab Piante con i 56 record

**Files:**
- Crea: `scripts/genera_piante.py`
- Modifica: Google Sheets tab `Piante`

- [ ] **Step 1: Scrivi lo script `scripts/genera_piante.py`**

  ```python
  rows = [
      (1,"Controllo"),(2,"Controllo"),(3,"Controllo"),(4,"Controllo"),
      (5,"Controllo"),(6,"Controllo"),(7,"Controllo"),(8,"Controllo"),
      (9,"Controllo"),(10,"Controllo"),(11,"Controllo"),(12,"Controllo"),
      (13,"Controllo"),(14,"Controllo"),
      (15,"Controllo + HC"),(16,"Controllo + HC"),(17,"Controllo + HC"),
      (18,"Controllo + HC"),(19,"Controllo + HC"),(20,"Controllo + HC"),
      (21,"S1"),(22,"S1"),(23,"S1"),(24,"S1"),(25,"S1"),(26,"S1"),
      (27,"S1 + HC"),(28,"S1 + HC"),(29,"S1 + HC"),
      (30,"S1 + HC"),(31,"S1 + HC"),(32,"S1 + HC"),
      (33,"W1"),(34,"W1"),(35,"W1"),(36,"W1"),(37,"W1"),(38,"W1"),
      (39,"W1 + HC"),(40,"W1 + HC"),(41,"W1 + HC"),
      (42,"W1 + HC"),(43,"W1 + HC"),(44,"W1 + HC"),
      (45,"S1W1"),(46,"S1W1"),(47,"S1W1"),
      (48,"S1W1"),(49,"S1W1"),(50,"S1W1"),
      (51,"S1W1 + HC"),(52,"S1W1 + HC"),(53,"S1W1 + HC"),
      (54,"S1W1 + HC"),(55,"S1W1 + HC"),(56,"S1W1 + HC"),
  ]
  for id_p, tratt in rows:
      print(f"{id_p}\t{tratt}")
  ```

- [ ] **Step 2: Esegui lo script e copia l'output**

  ```bash
  cd "C:/Users/leona/OneDrive/Desktop/Progetti/FastLab"
  python scripts/genera_piante.py
  ```

  Output atteso: 56 righe nel formato `1\tControllo`, `2\tControllo`, ecc.
  Seleziona tutto l'output (Ctrl+A), copia (Ctrl+C).

- [ ] **Step 3: Incolla in Google Sheets**

  Apri `FastLab_Rilievi` → tab `Piante` → clic sulla cella **A2** → incolla (Ctrl+V).
  Verifica: 56 righe popolate, A2:A57 contiene i numeri 1–56, B2:B57 i trattamenti.

- [ ] **Step 4: Commit script**

  ```bash
  cd "C:/Users/leona/OneDrive/Desktop/Progetti/FastLab"
  git add scripts/genera_piante.py
  git commit -m "feat: script generazione dati Piante"
  ```

---

## Task 3: Creare l'app AppSheet

**Files:**
- Crea: App AppSheet `FastLab` (cloud)

- [ ] **Step 1: Crea l'app da Google Sheets**

  Vai su [appsheet.com](https://appsheet.com) → accedi con l'account Google → **+ Create** → **App** → **Start with your own data**.
  Seleziona **Google Sheets** → scegli il file `FastLab_Rilievi` → seleziona la tab **`Rilevazione_Principale`** come tabella principale → clic **Next** → **Customize your app**.

- [ ] **Step 2: Rinomina l'app**

  In alto a sinistra, clic sul nome dell'app → rinomina in `FastLab`.

- [ ] **Step 3: Verifica tabelle importate**

  Vai su **Data** (icona database nel menu sinistro) → **Tables**.
  Deve comparire `Rilevazione_Principale`. Le altre 3 tab verranno aggiunte nelle task successive.

- [ ] **Step 4: Aggiungi le 3 tab rimanenti**

  **Data** → **Tables** → **+ Add Table**.
  Ripeti per ognuna:
  - Scegli `FastLab_Rilievi` → seleziona `Piante` → **Add Table**
  - Scegli `FastLab_Rilievi` → seleziona `Dettaglio_Palchi` → **Add Table**
  - Scegli `FastLab_Rilievi` → seleziona `Dettaglio_Infiorescenze` → **Add Table**

  Risultato: 4 tabelle visibili nella lista.

---

## Task 4: Configurare le colonne di Rilevazione_Principale

**Files:**
- Modifica: AppSheet → Data → Columns → Rilevazione_Principale

- [ ] **Step 1: Apri configurazione colonne**

  **Data** → **Columns** → seleziona tabella `Rilevazione_Principale`.

- [ ] **Step 2: Configura ID_Rilevazione**

  Clic sulla riga `ID_Rilevazione`:
  - Type: `Text`
  - KEY: ✓ (spunta)
  - INITIAL VALUE: `UNIQUEID()`
  - Clic **Done**.

- [ ] **Step 3: Configura Data_Ora_Inizio**

  Clic su `Data_Ora_Inizio`:
  - Type: `DateTime`
  - INITIAL VALUE: `NOW()`
  - EDITABLE?: ✗ (read-only — auto-compilato, l'operatore non deve modificarlo)
  - Clic **Done**.

- [ ] **Step 4: Configura Data_Ora_Fine**

  Clic su `Data_Ora_Fine`:
  - Type: `DateTime`
  - INITIAL VALUE: lascia vuoto
  - APP FORMULA: lascia vuoto (sarà gestita dal Bot al Task 7)
  - Clic **Done**.

- [ ] **Step 5: Configura ID_Pianta**

  Clic su `ID_Pianta`:
  - Type: `Number`
  - VALID IF: `AND([ID_Pianta]>=1,[ID_Pianta]<=56)`
  - Clic **Done**.

- [ ] **Step 6: Configura Trattamento**

  Clic su `Trattamento`:
  - Type: `Text`
  - APP FORMULA: `INDEX(SELECT(Piante[Trattamento],[ID_Pianta]=[_THISROW].[ID_Pianta]),1)`
  - EDITABLE?: ✗ (rimuovi spunta)
  - Clic **Done**.

- [ ] **Step 7: Configura campi numerici semplici**

  Per ciascuno dei seguenti, clic sulla riga → imposta Type → Done:

  | Colonna | Type |
  |---|---|
  | Altezza | `Decimal` |
  | N_palchi_totali | `Number` |
  | N_fiori_fioriti | `Number` |
  | N_frutti | `Number` |
  | N_frutti_invaiati | `Number` |
  | Spad | `Decimal` |
  | Temp_Pianta | `Decimal` |

- [ ] **Step 8: Configura Temp_Aria**

  Clic su `Temp_Aria`:
  - Type: `Decimal`
  - INITIAL VALUE: `MAXROW("Rilevazione_Principale","Data_Ora_Inizio").[Temp_Aria]`
  - Clic **Done**.

- [ ] **Step 9: Configura Note**

  Clic su `Note`:
  - Type: `LongText`
  - Clic **Done**.

- [ ] **Step 10: Verifica**

  Apri il **Preview** dell'app (icona smartphone in alto a destra). Tocca **+** per creare una nuova rilevazione. Verifica:
  - `Data_Ora_Inizio` già compilato con data e ora correnti
  - Il campo `ID_Pianta` mostra tastierino numerico su smartphone
  - Digitando un numero in `ID_Pianta` (es. 15) e uscendo dal campo, `Trattamento` mostra `Controllo + HC`
  - `Temp_Aria` mostra l'ultimo valore inserito (vuoto se è la prima rilevazione)

---

## Task 5: Configurare Dettaglio_Palchi e relazione parent

**Files:**
- Modifica: AppSheet → Data → Columns → Dettaglio_Palchi
- Modifica: AppSheet → Data → Relationships

- [ ] **Step 1: Configura colonne Dettaglio_Palchi**

  **Data** → **Columns** → seleziona `Dettaglio_Palchi`.

  **ID_Palco:**
  - Type: `Text`, KEY: ✓, INITIAL VALUE: `UNIQUEID()`

  **ID_Rilevazione:**
  - Type: `Ref` → tabella: `Rilevazione_Principale`
  - IS A PART OF: ✓ (spunta — questo crea la relazione child)
  - SHOW?: ✗ (nascondi in form)

  **Numero_Palco:**
  - Type: `Number`
  - INITIAL VALUE: `COUNT(SELECT(Dettaglio_Palchi[ID_Palco],[ID_Rilevazione]=[_THISROW].[ID_Rilevazione]))+1`
  - EDITABLE?: ✗

  **N_Foglie:**
  - Type: `Number`

  Clic **Done** per ciascuna.

- [ ] **Step 2: Verifica relazione auto-creata**

  **Data** → **Relationships**: deve comparire una relazione `Rilevazione_Principale` → `Dettaglio_Palchi` creata automaticamente da "Is a part of".

- [ ] **Step 3: Verifica auto-increment**

  Nel Preview, crea una rilevazione → aggiungi due palchi consecutivi. Il secondo palco deve avere `Numero_Palco = 2` in automatico.

---

## Task 6: Configurare Dettaglio_Infiorescenze e relazione parent

**Files:**
- Modifica: AppSheet → Data → Columns → Dettaglio_Infiorescenze

- [ ] **Step 1: Configura colonne Dettaglio_Infiorescenze**

  **Data** → **Columns** → seleziona `Dettaglio_Infiorescenze`.

  **ID_Infiorescenza:**
  - Type: `Text`, KEY: ✓, INITIAL VALUE: `UNIQUEID()`

  **ID_Rilevazione:**
  - Type: `Ref` → tabella: `Rilevazione_Principale`
  - IS A PART OF: ✓
  - SHOW?: ✗

  **Numero_Infiorescenza:**
  - Type: `Number`
  - INITIAL VALUE: `COUNT(SELECT(Dettaglio_Infiorescenze[ID_Infiorescenza],[ID_Rilevazione]=[_THISROW].[ID_Rilevazione]))+1`
  - EDITABLE?: ✗

  **N_Fiori:**
  - Type: `Number`

  Clic **Done** per ciascuna.

- [ ] **Step 2: Verifica**

  Nel Preview, aggiungi due infiorescenze a una rilevazione. `Numero_Infiorescenza` deve essere 1 e 2 rispettivamente.

---

## Task 7: Configurare Automation Bot per Data_Ora_Fine

**Files:**
- Modifica: AppSheet → Automation → Bots

- [ ] **Step 1: Crea nuovo Bot**

  **Automation** (icona fulmine nel menu sinistro) → **Bots** → **+ New Bot**.
  Nome: `Imposta_Ora_Fine`.

- [ ] **Step 2: Configura Event (trigger)**

  Nella sezione **Event**:
  - Event type: `Data change`
  - Table: `Rilevazione_Principale`
  - Data change type: `Updates only`
  - Condition: lascia vuoto (nessuna condizione)

- [ ] **Step 3: Configura Action**

  Nella sezione **Steps** → **+ Add Step** → scegli **Run a data action**.
  - Action type: `Set the value of some columns in this row`
  - Tabella: `Rilevazione_Principale`
  - Colonna da impostare: `Data_Ora_Fine`
  - Valore: `NOW()`
  - Clic **Done**.

- [ ] **Step 4: Abilita Bot**

  Assicurati che il toggle del Bot sia su **ON** (verde).

- [ ] **Step 5: Verifica**

  Nel Preview, crea una rilevazione, inserisci alcuni dati e tocca **Save**. Apri la rilevazione salvata: `Data_Ora_Fine` deve contenere la data/ora del salvataggio. `Data_Ora_Fine` deve essere successiva a `Data_Ora_Inizio`.

---

## Task 8: Configurare le Views

**Files:**
- Modifica: AppSheet → UX → Views

- [ ] **Step 1: Crea View "Lista_Rilevazioni"**

  **UX** → **Views** → **+ New View**.
  - View name: `Lista_Rilevazioni`
  - For this data: `Rilevazione_Principale`
  - View type: `Deck`
  - Sort by: `Data_Ora_Inizio` → **Descending**
  - Header: `ID_Pianta`
  - Summary: `Trattamento`
  - Clic **Done**.

- [ ] **Step 2: Crea View "Nuova_Rilevazione" (form principale)**

  **UX** → **Views** → **+ New View**.
  - View name: `Nuova_Rilevazione`
  - For this data: `Rilevazione_Principale`
  - View type: `Form`
  - Clic **Done**.

- [ ] **Step 3: Ordina i campi nella form**

  Apri `Nuova_Rilevazione` → sezione **Column order**.
  Trascina le colonne in quest'ordine:
  1. ID_Pianta
  2. Trattamento
  3. Altezza
  4. N_palchi_totali
  5. N_fiori_fioriti
  6. N_frutti
  7. N_frutti_invaiati
  8. Spad
  9. Temp_Aria
  10. Temp_Pianta
  11. *(inline Dettaglio_Palchi — appare automaticamente come child view)*
  12. *(inline Dettaglio_Infiorescenze — appare automaticamente)*
  13. Note

  Nascondi dalla form: `ID_Rilevazione`, `Data_Ora_Fine` (SHOW? = ✗).
  Lascia visibile `Data_Ora_Inizio` in sola lettura (l'operatore vede l'ora di inizio come conferma).

- [ ] **Step 4: Configura inline views per Palchi**

  Apri `Nuova_Rilevazione` → sezione **Child views**.
  Clic su **+ Add** → seleziona `Dettaglio_Palchi`:
  - View type: `Inline`
  - View for rows: lascia generato automaticamente (AppSheet crea `Dettaglio_Palchi_Form`)
  - Label: `Palchi`

- [ ] **Step 5: Configura inline view per Infiorescenze**

  Stessa procedura → seleziona `Dettaglio_Infiorescenze`:
  - View type: `Inline`
  - Label: `Infiorescenze`

- [ ] **Step 6: Configura Form_Palco (nasconde campi inutili)**

  **UX** → **Views** → apri la view auto-generata per `Dettaglio_Palchi` (di solito `Dettaglio_Palchi_Form`).
  - Rinominala: `Form_Palco`
  - Nascondi dalla form: `ID_Palco`, `ID_Rilevazione`, `Numero_Palco` (Show = ✗)
  - Lascia visibile solo: `N_Foglie`

- [ ] **Step 7: Configura Form_Infiorescenza**

  Stessa procedura per la view `Dettaglio_Infiorescenze_Form`:
  - Rinomina: `Form_Infiorescenza`
  - Nascondi: `ID_Infiorescenza`, `ID_Rilevazione`, `Numero_Infiorescenza`
  - Lascia visibile solo: `N_Fiori`

- [ ] **Step 8: Verifica views nel Preview**

  Nel Preview smartphone:
  - La lista mostra le rilevazioni con ID_Pianta e Trattamento
  - Toccando **+** si apre la form con i campi nell'ordine corretto
  - Le sezioni Palchi e Infiorescenze appaiono come inline con pulsante **+**
  - Toccando **+** nei Palchi si apre una mini-form con solo `N_Foglie`
  - Toccando **+** nelle Infiorescenze si apre solo `N_Fiori`

---

## Task 9: Configurare la navigazione

**Files:**
- Modifica: AppSheet → UX → Options

- [ ] **Step 1: Imposta navigazione primaria**

  **UX** → **Options** → sezione **Navigation style**: scegli `Bottom navigation` (barra in basso).

- [ ] **Step 2: Nascondi views secondarie dalla nav bar**

  **UX** → **Views**: per ogni view NON principale, apri la view → sezione **Position** → imposta `Menu` (non visibile nella nav bar).

  Views da mettere nel Menu (nascoste dalla nav):
  - `Form_Palco`
  - `Form_Infiorescenza`
  - Qualsiasi view auto-generata da AppSheet non necessaria

  Views da tenere nella nav bar (Position = `Left-to-right` o `Center`):
  - `Lista_Rilevazioni` (posizione 1)
  - `Nuova_Rilevazione` (posizione 2, tipo pulsante "+" — imposta come **Primary action**)

- [ ] **Step 3: Verifica**

  Nel Preview, la barra in basso mostra solo le 2 voci principali. Nessuna view di dettaglio palchi/infiorescenze appare nella nav.

---

## Task 10: Test end-to-end completo

- [ ] **Step 1: Installa l'app su Android**

  Sul telefono Android, apri Chrome → vai su [appsheet.com](https://appsheet.com) → accedi → apri `FastLab` → clic **Install** (o aggiungi a schermata home dalla barra di Chrome).

  In alternativa: scansiona il QR code che AppSheet genera in **Manage** → **Deploy** → **Test app link**.

- [ ] **Step 2: Test rilievo completo**

  Esegui questo scenario di test sul telefono:

  1. Tocca **+** → si apre la form
  2. Tocca campo `ID_Pianta` → compare tastierino numerico → digita `15` oppure tocca il microfono 🎤 e dì "quindici"
  3. Verifica: `Trattamento` mostra `Controllo + HC` in automatico
  4. Inserisci: Altezza=`85`, N_palchi_totali=`4`, N_fiori_fioriti=`12`, N_frutti=`3`, N_frutti_invaiati=`1`, Spad=`42.5`, Temp_Aria=`24.3`, Temp_Pianta=`26.1`
  5. Nella sezione Palchi → tocca **+** → appare solo il campo `N_Foglie` → inserisci `8` → salva
  6. Tocca **+** ancora → `N_Foglie=5` → salva. Il secondo palco deve avere `Numero_Palco=2`
  7. Nella sezione Infiorescenze → tocca **+** → inserisci `N_Fiori=6` → salva
  8. Nel campo Note → tocca il microfono 🎤 → detta "Foglie con leggero ingiallimento" → il testo appare nel campo
  9. Tocca **SALVA** (in alto a destra o pulsante in fondo)

- [ ] **Step 3: Verifica dati in Google Sheets**

  Apri `FastLab_Rilievi` su Google Sheets:
  - Tab `Rilevazione_Principale`: deve esserci 1 riga con tutti i dati, `Data_Ora_Inizio` e `Data_Ora_Fine` compilati, `Data_Ora_Fine > Data_Ora_Inizio`
  - Tab `Dettaglio_Palchi`: 2 righe con lo stesso `ID_Rilevazione`, `Numero_Palco` = 1 e 2
  - Tab `Dettaglio_Infiorescenze`: 1 riga con `N_Fiori=6`

- [ ] **Step 4: Test Temp_Aria default**

  Crea una seconda rilevazione → il campo `Temp_Aria` deve mostrare `24.3` (l'ultimo valore inserito) senza che tu debba digitarlo.

- [ ] **Step 5: Commit finale**

  ```bash
  cd "C:/Users/leona/OneDrive/Desktop/Progetti/FastLab"
  git add .
  git commit -m "docs: piano implementazione AppSheet rilievi agronomici"
  ```

---

## Checklist finale

- [ ] 4 tab Google Sheets create con intestazioni corrette
- [ ] 56 piante nella tab Piante
- [ ] App AppSheet connessa a Google Sheets
- [ ] `ID_Rilevazione` = chiave con UNIQUEID()
- [ ] `Data_Ora_Inizio` = NOW() automatico
- [ ] `Data_Ora_Fine` = NOW() al salvataggio via Bot
- [ ] `Trattamento` = auto da ID_Pianta
- [ ] `Temp_Aria` = propone l'ultimo valore
- [ ] `Numero_Palco` = auto-increment per rilevazione
- [ ] `Numero_Infiorescenza` = auto-increment per rilevazione
- [ ] Inline view Palchi con solo N_Foglie visibile
- [ ] Inline view Infiorescenze con solo N_Fiori visibile
- [ ] Navigazione: solo 2 voci nella barra in basso
- [ ] Test end-to-end superato su Android
