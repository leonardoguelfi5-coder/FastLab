# Design: FastLab PWA — Rilievi Agronomici e Fenotipici

**Data:** 2026-05-09
**Progetto:** FastLab — Digitalizzazione rilievi Hydrochar × Cuore di Bue
**Approccio:** Progressive Web App custom (pivot da AppSheet)
**Stack:** React 18 + Vite + Zustand + shadcn/ui + Tailwind + Supabase + Vercel

---

## Contesto

Stessa necessità della spec AppSheet: digitalizzare i rilievi fenologici su 56 piante di Cuore di Bue in campo/serra via smartphone Android. Pivot ad approccio custom per controllo totale sulla UX e zero costi di abbonamento. I dati devono essere accessibili anche da PC ed esportabili in Excel.

**Connettività:** 4G sempre disponibile. **Utenti:** 1. **Device:** Android + Gboard. **Lista piante:** 56 fissa.

---

## Stack

| Layer | Tecnologia | Note |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Identico a SUGNA 2.0 |
| UI | shadcn/ui + Tailwind CSS | Identico a SUGNA 2.0 |
| State | Zustand | Identico a SUGNA 2.0 |
| Backend/DB | Supabase (PostgreSQL) | Free tier, cloud |
| Deploy | Vercel | Free, URL pubblico |
| Export | SheetJS (xlsx) | Export .xlsx diretto dal browser |

---

## Database (Supabase — PostgreSQL)

### Tabella `piante` (reference, read-only)
```sql
CREATE TABLE piante (
  id INTEGER PRIMARY KEY,        -- 1-56
  trattamento TEXT NOT NULL      -- es. "Controllo + HC"
);
```

### Tabella `rilevazione_principale` (parent)
```sql
CREATE TABLE rilevazione_principale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_ora_inizio TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_ora_fine TIMESTAMPTZ,
  id_pianta INTEGER REFERENCES piante(id),
  trattamento TEXT,              -- denormalizzato per velocità di lettura
  altezza DECIMAL,
  n_palchi_totali INTEGER,
  n_fiori_fioriti INTEGER,
  n_frutti INTEGER,
  n_frutti_invaiati INTEGER,
  spad DECIMAL,
  temp_aria DECIMAL,
  temp_pianta DECIMAL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabella `dettaglio_palchi` (child)
```sql
CREATE TABLE dettaglio_palchi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_rilevazione UUID REFERENCES rilevazione_principale(id) ON DELETE CASCADE,
  numero_palco INTEGER NOT NULL, -- auto-increment lato app
  n_foglie INTEGER NOT NULL
);
```

### Tabella `dettaglio_infiorescenze` (child)
```sql
CREATE TABLE dettaglio_infiorescenze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_rilevazione UUID REFERENCES rilevazione_principale(id) ON DELETE CASCADE,
  numero_infiorescenza INTEGER NOT NULL, -- auto-increment lato app
  n_fiori INTEGER NOT NULL
);
```

---

## Struttura del progetto (React/Vite)

```
FastLab/
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Client Supabase
│   │   └── exportExcel.ts       # Logica export xlsx
│   ├── store/
│   │   └── rilevazioneStore.ts  # Zustand: stato form + cache ultima Temp_Aria
│   ├── types/
│   │   └── index.ts             # Tipi TypeScript (Pianta, Rilevazione, Palco, Infiorescenza)
│   ├── pages/
│   │   ├── ListaRilevazioni.tsx # Home: lista + pulsante export
│   │   └── NuovaRilevazione.tsx # Form principale
│   ├── components/
│   │   ├── FormPianta.tsx       # Sezione ID pianta + trattamento
│   │   ├── FormMisure.tsx       # 8 campi numerici pianta
│   │   ├── InlinePalchi.tsx     # Lista palchi + add
│   │   ├── InlineInfiorescenze.tsx
│   │   └── NumericField.tsx     # Input numerico riusabile (inputMode="numeric")
│   ├── App.tsx
│   └── main.tsx
├── .env.local                   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
└── docs/
```

---

## Componenti chiave

### `NumericField.tsx`
Input riusabile per tutti i campi numerici. Usa `inputMode="numeric"` (tastierino Android + microfono Gboard). Props: `label`, `value`, `onChange`, `required`.

### `NuovaRilevazione.tsx`
Form principale. Flusso:
1. `data_ora_inizio` = `new Date()` al mount
2. Campo `id_pianta` → onChange → fetch `trattamento` da Supabase (tabella `piante`)
3. `temp_aria` pre-compilata con `rilevazioneStore.lastTempAria`
4. Sezioni inline palchi e infiorescenze
5. Al salvataggio: `data_ora_fine` = `new Date()` → insert su Supabase → aggiorna `lastTempAria` nello store

### `InlinePalchi.tsx`
Lista dei palchi già inseriti (locali, pre-save) + pulsante "+ Palco". Ogni tap aggiunge un record locale con `numero_palco` auto-incrementale. Al salvataggio della rilevazione principale, i palchi vengono inseriti in batch.

### `InlineInfiorescenze.tsx`
Identico a `InlinePalchi.tsx` per le infiorescenze.

### `exportExcel.ts`
Usa SheetJS per generare un file `.xlsx` con 3 fogli (Rilevazioni, Palchi, Infiorescenze) dalla query Supabase. Scaricato direttamente dal browser.

---

## UX / Comportamenti automatici

| Campo | Comportamento |
|---|---|
| `data_ora_inizio` | `new Date()` al mount del form, read-only |
| `data_ora_fine` | `new Date()` al click Salva, non mostrato in form |
| `trattamento` | Auto-fetch da Supabase al cambio `id_pianta`, read-only |
| `temp_aria` | Initial value = ultimo valore salvato (Zustand store) |
| `numero_palco` | `palchi.length + 1` locale prima del salvataggio |
| `numero_infiorescenza` | `infiorescenze.length + 1` locale |
| Tutti i campi number | `inputMode="numeric"` → tastierino + microfono Gboard |
| `note` | `<textarea>` standard → dettatura vocale nativa Android |

---

## Deploy

- **Vercel:** collegato al repo GitHub, deploy automatico su push
- **URL:** `https://fastlab-<hash>.vercel.app` (o dominio custom gratuito Vercel)
- **PWA:** `vite-plugin-pwa` per "Aggiungi a schermata home" su Android
- **Env vars:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurate su Vercel dashboard

---

## Fuori scope

- Autenticazione (app privata, URL non pubblicizzato)
- Modalità offline completa (4G disponibile)
- Multi-utente
- Dashboard grafici (dati analizzabili in Excel dopo export)
