# Design: App AppSheet per Rilievi Agronomici e Fenotipici

**Data:** 2026-05-09
**Progetto:** FastLab — Digitalizzazione rilievi Hydrochar × Cuore di Bue
**Piattaforma:** AppSheet (piano Free, 1 utente) + Google Sheets
**Obiettivo:** Massimizzare la velocità di inserimento dati in campo/serra via smartphone, eliminando formati complessi come "1(3) 2(5)".

---

## Contesto

Il modulo cartaceo attuale (`Rilievi_Fenologici_V4.xlsx`) raccoglie dati fenologici su 56 piante di Cuore di Bue suddivise in 8 gruppi di trattamento (Controllo, Controllo+HC, S1, S1+HC, W1, W1+HC, S1W1, S1W1+HC). I dati includono misure pianta, conteggi per palco e per infiorescenza. Il campo "N.palco (foglie nel palco)" e "N. fiori/infior." richiedono un formato testuale complesso che sarà sostituito da record child separati.

**Connettività:** 4G sempre disponibile. **Utenti:** 1 (piano Free AppSheet). **Lista piante:** fissa, 56 piante, non cambia durante la stagione.

---

## Architettura

### Backend: Google Sheets (1 file, 4 tab)

#### Tab 1: `Piante` — tabella di riferimento (read-only)
| Colonna | Tipo Sheets | Note |
|---|---|---|
| ID_Pianta | Number | 1–56 |
| Trattamento | Text | Controllo / Controllo+HC / S1 / S1+HC / W1 / W1+HC / S1W1 / S1W1+HC |

Questa tab viene popolata una volta sola dall'Excel esistente.

#### Tab 2: `Rilevazione_Principale` — tabella Parent
| Colonna | Tipo Sheets | Note |
|---|---|---|
| ID_Rilevazione | Text | Chiave primaria, `UNIQUEID()` AppSheet |
| Data_Ora_Inizio | DateTime | Auto: `NOW()` all'apertura |
| Data_Ora_Fine | DateTime | Auto: `NOW()` al salvataggio |
| ID_Pianta | Number | Input vocale o manuale (1–56), Input mode=Text |
| Trattamento | Text | Compilato da AppSheet via SELECT su tab Piante, nessuna formula Sheets |
| Altezza | Decimal | cm |
| N_palchi_totali | Number | |
| N_fiori_fioriti | Number | |
| N_frutti | Number | |
| N_frutti_invaiati | Number | |
| Spad | Decimal | |
| Temp_Aria | Decimal | Initial value: ultimo valore inserito |
| Temp_Pianta | Decimal | |
| Note | LongText | Dettatura vocale |

#### Tab 3: `Dettaglio_Palchi` — tabella Child
| Colonna | Tipo Sheets | Note |
|---|---|---|
| ID_Palco | Text | Chiave primaria, `UNIQUEID()` |
| ID_Rilevazione | Text | FK → Rilevazione_Principale, nascosto in form |
| Numero_Palco | Number | Auto-increment per rilevazione |
| N_Foglie | Number | Campo principale, focus immediato |

#### Tab 4: `Dettaglio_Infiorescenze` — tabella Child
| Colonna | Tipo Sheets | Note |
|---|---|---|
| ID_Infiorescenza | Text | Chiave primaria, `UNIQUEID()` |
| ID_Rilevazione | Text | FK → Rilevazione_Principale, nascosto in form |
| Numero_Infiorescenza | Number | Auto-increment per rilevazione |
| N_Fiori | Number | Campo principale, focus immediato |

---

## Configurazione AppSheet

### Tipi di colonna (Data > Columns)

**Rilevazione_Principale:**
- `ID_Rilevazione`: Type=Text, Key=✓, Initial value=`UNIQUEID()`
- `Data_Ora_Inizio`: Type=DateTime, Initial value=`NOW()`, Show=✓
- `Data_Ora_Fine`: Type=DateTime, lasciare vuoto (nessuna App formula). Compilato da un **Automation Bot**: Event=`When a record is updated`, Action=`Set row values` → `Data_Ora_Fine = NOW()`
- `ID_Pianta`: Type=Number, Input mode=Number (default). Validazione: `AND([ID_Pianta]>=1,[ID_Pianta]<=56)`
- `Trattamento`: Type=Text, App formula=`INDEX(SELECT(Piante[Trattamento],[ID_Pianta]=[_THISROW].[ID_Pianta]),1)`, Editable=✗
- Tutti i campi numerici (`Altezza`, `N_palchi_totali`, `N_fiori_fioriti`, `N_frutti`, `N_frutti_invaiati`, `Spad`, `Temp_Pianta`): Type=Number o Decimal, Input mode=Number/Decimal (default) → tastierino numerico grande
- `Temp_Aria`: Type=Decimal, Initial value=`MAXROW("Rilevazione_Principale","Data_Ora_Inizio").[Temp_Aria]`
- `Note`: Type=LongText (dettatura vocale nativa)

> **Voce + tastierino (Android + Gboard):** su Android con Gboard il tastierino numerico include già il tasto microfono 🎤 in basso a sinistra. L'utente può quindi dettare numeri (es. "quindici" → "15") oppure toccare i tasti — senza cambiare modalità. Nessuna configurazione aggiuntiva richiesta.

**Dettaglio_Palchi:**
- `ID_Palco`: Type=Text, Key=✓, Initial value=`UNIQUEID()`
- `ID_Rilevazione`: Type=Ref (→ Rilevazione_Principale), Is a part of=✓, Show=✗
- `Numero_Palco`: Type=Number, Initial value=`COUNT(SELECT(Dettaglio_Palchi[ID_Palco],[ID_Rilevazione]=[_THISROW].[ID_Rilevazione]))+1`
- `N_Foglie`: Type=Number, Input mode=Number (default — voce disponibile via Gboard)

**Dettaglio_Infiorescenze:** schema identico a Dettaglio_Palchi con `Numero_Infiorescenza` e `N_Fiori` (Input mode=Number, voce via Gboard).

### Relazioni (Data > Relationships)
- `Piante` ← `Rilevazione_Principale` via `ID_Pianta`
- `Rilevazione_Principale` ← `Dettaglio_Palchi` via `ID_Rilevazione` (Child, "Is a part of")
- `Rilevazione_Principale` ← `Dettaglio_Infiorescenze` via `ID_Rilevazione` (Child, "Is a part of")

---

## Views (UX > Views)

### View 1: `Lista_Rilevazioni`
- Tipo: Deck
- Sort: Data_Ora_Inizio decrescente
- Mostra: ID_Pianta, Trattamento, Data_Ora_Inizio
- Posizione: navigazione primaria (Home)

### View 2: `Nuova_Rilevazione`
- Tipo: Form
- Tabella: Rilevazione_Principale
- Ordine campi: ID_Pianta → Trattamento (read-only) → misure pianta (2 colonne) → Temp_Aria → Temp_Pianta → [Inline: Palchi] → [Inline: Infiorescenze] → Note
- Posizione: navigazione primaria (pulsante "+")

### View 3: `Form_Palco`
- Tipo: Form
- Tabella: Dettaglio_Palchi
- Campi visibili: solo `N_Foglie` (Numero_Palco e ID_Rilevazione nascosti)
- Initial focus: `N_Foglie`
- Aperta da: inline view in Nuova_Rilevazione

### View 4: `Form_Infiorescenza`
- Tipo: Form
- Tabella: Dettaglio_Infiorescenze
- Campi visibili: solo `N_Fiori`
- Initial focus: `N_Fiori`
- Aperta da: inline view in Nuova_Rilevazione

### Inline Views (in Nuova_Rilevazione > Child views)
- `Dettaglio_Palchi` → tipo Inline, View for rows: Form_Palco
- `Dettaglio_Infiorescenze` → tipo Inline, View for rows: Form_Infiorescenza

### Navigazione primaria
Solo `Lista_Rilevazioni` e `Nuova_Rilevazione` visibili nella nav bar.

---

## Flusso operativo in campo

1. Aprire app → toccare "+"
2. Dettare o digitare ID Pianta (es. "15") → Trattamento compare automaticamente
3. Inserire misure pianta (8 campi numerici, tastierino grande)
4. Toccare "+ Aggiungi palco" per ogni palco → inserire N_Foglie → Salva → ritorna inline
5. Toccare "+ Aggiungi infiorescenza" per ogni infiorescenza → inserire N_Fiori → Salva
6. Dettare eventuali note vocali
7. Toccare "Salva Rilevazione" → Data_Ora_Fine compilata automaticamente

---

## Dati da migrare

- Popolare tab `Piante` con i 56 record da `Rilievi_Fenologici_V4.xlsx` (tab Rilievo_Campo, colonne ID Pianta + Trattamento)
- I rilievi storici dell'Excel possono essere importati manualmente o via script se necessario

---

## Fuori scope

- Dashboard di analisi (dati accessibili direttamente da Google Sheets)
- Multi-utente (piano Free, 1 utente)
- Modalità offline (connessione 4G sempre disponibile)
- Notifiche o workflow automatici post-salvataggio
