# FastLab PWA — Rilievi Agronomici: Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire una PWA React/Vite/Supabase per registrare rilievi agronomici in campo via smartphone, con dati accessibili da PC ed esportabili in Excel.

**Architecture:** React 18 + Vite + TypeScript + Zustand + shadcn/ui + Tailwind per il frontend. Supabase (PostgreSQL) come backend cloud. Vercel per il deploy. SheetJS per export Excel. Struttura a 4 tabelle relazionali (piante, rilevazione_principale, dettaglio_palchi, dettaglio_infiorescenze).

**Tech Stack:** React 18, Vite, TypeScript, Zustand, shadcn/ui, Tailwind CSS, Supabase JS client, SheetJS (xlsx), vite-plugin-pwa, Vercel.

---

## File da creare

| File | Scopo |
|---|---|
| `src/lib/supabase.ts` | Client Supabase singleton |
| `src/lib/exportExcel.ts` | Logica export .xlsx (SheetJS) |
| `src/types/index.ts` | Tipi TypeScript condivisi |
| `src/store/rilevazioneStore.ts` | Zustand: lastTempAria cache |
| `src/components/NumericField.tsx` | Input numerico riusabile |
| `src/components/FormPianta.tsx` | Sezione ID pianta + trattamento |
| `src/components/FormMisure.tsx` | 8 campi misure pianta |
| `src/components/InlinePalchi.tsx` | Lista palchi inline + add |
| `src/components/InlineInfiorescenze.tsx` | Lista infiorescenze inline + add |
| `src/pages/NuovaRilevazione.tsx` | Form principale completo |
| `src/pages/ListaRilevazioni.tsx` | Home: lista + export Excel |
| `src/App.tsx` | Router (2 route) |

---

## Task 1: Setup progetto Vite + dipendenze

**Files:**
- Crea: scaffolding Vite in `C:\Users\leona\OneDrive\Desktop\Progetti\FastLab`
- Modifica: `package.json`, `vite.config.ts`, `tsconfig.json`
- Crea: `.env.local`

- [ ] **Step 1: Scaffolda progetto Vite**

  ```bash
  cd "C:/Users/leona/OneDrive/Desktop/Progetti/FastLab"
  npm create vite@latest . -- --template react-ts
  ```

  Quando chiede "Current directory is not empty" → seleziona **"Ignore files and continue"**.

- [ ] **Step 2: Installa dipendenze base**

  ```bash
  npm install
  npm install @supabase/supabase-js zustand xlsx
  npm install -D vite-plugin-pwa
  ```

- [ ] **Step 3: Installa shadcn/ui + Tailwind**

  ```bash
  npm install -D tailwindcss postcss autoprefixer
  npx tailwindcss init -p
  npx shadcn@latest init
  ```

  Nelle scelte di shadcn init: TypeScript=Yes, style=Default, base color=Slate, CSS variables=Yes.

  Aggiungi i componenti shadcn necessari:
  ```bash
  npx shadcn@latest add button input label card textarea badge
  ```

- [ ] **Step 4: Configura Tailwind**

  Modifica `tailwind.config.js`:
  ```js
  /** @type {import('tailwindcss').Config} */
  export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: { extend: {} },
    plugins: [],
  }
  ```

  Assicurati che `src/index.css` contenga:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

- [ ] **Step 5: Crea `.env.local`**

  ```
  VITE_SUPABASE_URL=da_compilare_dopo_setup_supabase
  VITE_SUPABASE_ANON_KEY=da_compilare_dopo_setup_supabase
  ```

- [ ] **Step 6: Verifica build**

  ```bash
  npm run dev
  ```

  Atteso: server su `http://localhost:5173` senza errori.

- [ ] **Step 7: Commit**

  ```bash
  git add -A
  git commit -m "feat: scaffolding React/Vite/Tailwind/shadcn/Supabase"
  ```

---

## Task 2: Setup Supabase (database + dati piante)

**Files:**
- Crea: tabelle su Supabase dashboard
- Modifica: `.env.local` con credenziali reali
- Crea: `src/lib/supabase.ts`

- [ ] **Step 1: Crea progetto Supabase**

  Vai su [supabase.com](https://supabase.com) → **New project**.
  - Name: `fastlab`
  - Password DB: scegli una password sicura e salvala
  - Region: EU (West) — più vicino all'Italia
  - Clic **Create new project** (attendi ~2 minuti)

- [ ] **Step 2: Crea le tabelle via SQL Editor**

  In Supabase dashboard → **SQL Editor** → **New query**.
  Incolla ed esegui:

  ```sql
  -- Tabella reference piante
  CREATE TABLE piante (
    id INTEGER PRIMARY KEY,
    trattamento TEXT NOT NULL
  );

  -- Tabella parent
  CREATE TABLE rilevazione_principale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_ora_inizio TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_ora_fine TIMESTAMPTZ,
    id_pianta INTEGER REFERENCES piante(id),
    trattamento TEXT,
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

  -- Tabella child palchi
  CREATE TABLE dettaglio_palchi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_rilevazione UUID REFERENCES rilevazione_principale(id) ON DELETE CASCADE,
    numero_palco INTEGER NOT NULL,
    n_foglie INTEGER NOT NULL
  );

  -- Tabella child infiorescenze
  CREATE TABLE dettaglio_infiorescenze (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_rilevazione UUID REFERENCES rilevazione_principale(id) ON DELETE CASCADE,
    numero_infiorescenza INTEGER NOT NULL,
    n_fiori INTEGER NOT NULL
  );
  ```

  Clic **Run**. Atteso: "Success. No rows returned."

- [ ] **Step 3: Popola tabella piante**

  Nuova query SQL, incolla ed esegui:

  ```sql
  INSERT INTO piante (id, trattamento) VALUES
  (1,'Controllo'),(2,'Controllo'),(3,'Controllo'),(4,'Controllo'),
  (5,'Controllo'),(6,'Controllo'),(7,'Controllo'),(8,'Controllo'),
  (9,'Controllo'),(10,'Controllo'),(11,'Controllo'),(12,'Controllo'),
  (13,'Controllo'),(14,'Controllo'),
  (15,'Controllo + HC'),(16,'Controllo + HC'),(17,'Controllo + HC'),
  (18,'Controllo + HC'),(19,'Controllo + HC'),(20,'Controllo + HC'),
  (21,'S1'),(22,'S1'),(23,'S1'),(24,'S1'),(25,'S1'),(26,'S1'),
  (27,'S1 + HC'),(28,'S1 + HC'),(29,'S1 + HC'),
  (30,'S1 + HC'),(31,'S1 + HC'),(32,'S1 + HC'),
  (33,'W1'),(34,'W1'),(35,'W1'),(36,'W1'),(37,'W1'),(38,'W1'),
  (39,'W1 + HC'),(40,'W1 + HC'),(41,'W1 + HC'),
  (42,'W1 + HC'),(43,'W1 + HC'),(44,'W1 + HC'),
  (45,'S1W1'),(46,'S1W1'),(47,'S1W1'),
  (48,'S1W1'),(49,'S1W1'),(50,'S1W1'),
  (51,'S1W1 + HC'),(52,'S1W1 + HC'),(53,'S1W1 + HC'),
  (54,'S1W1 + HC'),(55,'S1W1 + HC'),(56,'S1W1 + HC');
  ```

  Verifica: **Table Editor** → `piante` → 56 righe presenti.

- [ ] **Step 4: Configura Row Level Security (RLS)**

  Nuova query SQL:

  ```sql
  -- Abilita RLS su tutte le tabelle
  ALTER TABLE piante ENABLE ROW LEVEL SECURITY;
  ALTER TABLE rilevazione_principale ENABLE ROW LEVEL SECURITY;
  ALTER TABLE dettaglio_palchi ENABLE ROW LEVEL SECURITY;
  ALTER TABLE dettaglio_infiorescenze ENABLE ROW LEVEL SECURITY;

  -- Policy: accesso pubblico in lettura/scrittura (app privata, no auth)
  CREATE POLICY "public_all" ON piante FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "public_all" ON rilevazione_principale FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "public_all" ON dettaglio_palchi FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "public_all" ON dettaglio_infiorescenze FOR ALL USING (true) WITH CHECK (true);
  ```

- [ ] **Step 5: Copia credenziali**

  Supabase dashboard → **Project Settings** → **API**:
  - Copia `Project URL` → incolla in `.env.local` come `VITE_SUPABASE_URL`
  - Copia `anon public` key → incolla come `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 6: Crea `src/lib/supabase.ts`**

  ```typescript
  import { createClient } from '@supabase/supabase-js'

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  export const supabase = createClient(supabaseUrl, supabaseAnonKey)
  ```

- [ ] **Step 7: Verifica connessione**

  In `src/main.tsx`, aggiungi temporaneamente:
  ```typescript
  import { supabase } from './lib/supabase'
  supabase.from('piante').select('count').then(console.log)
  ```
  Avvia `npm run dev`, apri browser console: deve apparire `{count: 56}`.
  Rimuovi le 2 righe di test dopo la verifica.

- [ ] **Step 8: Commit**

  ```bash
  git add src/lib/supabase.ts
  git commit -m "feat: Supabase client + schema DB + dati piante"
  ```

---

## Task 3: Tipi TypeScript e store Zustand

**Files:**
- Crea: `src/types/index.ts`
- Crea: `src/store/rilevazioneStore.ts`

- [ ] **Step 1: Crea `src/types/index.ts`**

  ```typescript
  export interface Pianta {
    id: number
    trattamento: string
  }

  export interface Palco {
    numero_palco: number
    n_foglie: number
  }

  export interface Infiorescenza {
    numero_infiorescenza: number
    n_fiori: number
  }

  export interface RilevazionePrincipale {
    id?: string
    data_ora_inizio: string
    data_ora_fine?: string
    id_pianta: number | null
    trattamento: string
    altezza: number | null
    n_palchi_totali: number | null
    n_fiori_fioriti: number | null
    n_frutti: number | null
    n_frutti_invaiati: number | null
    spad: number | null
    temp_aria: number | null
    temp_pianta: number | null
    note: string
  }

  export interface RilevazioneCompleta extends RilevazionePrincipale {
    palchi: Palco[]
    infiorescenze: Infiorescenza[]
  }
  ```

- [ ] **Step 2: Crea `src/store/rilevazioneStore.ts`**

  ```typescript
  import { create } from 'zustand'
  import { persist } from 'zustand/middleware'

  interface RilevazioneStore {
    lastTempAria: number | null
    setLastTempAria: (value: number | null) => void
  }

  export const useRilevazioneStore = create<RilevazioneStore>()(
    persist(
      (set) => ({
        lastTempAria: null,
        setLastTempAria: (value) => set({ lastTempAria: value }),
      }),
      { name: 'fastlab-store' }
    )
  )
  ```

- [ ] **Step 3: Verifica tipi**

  ```bash
  npx tsc --noEmit
  ```

  Atteso: nessun errore.

- [ ] **Step 4: Commit**

  ```bash
  git add src/types/index.ts src/store/rilevazioneStore.ts
  git commit -m "feat: tipi TypeScript e store Zustand con persist"
  ```

---

## Task 4: Componente NumericField e FormPianta

**Files:**
- Crea: `src/components/NumericField.tsx`
- Crea: `src/components/FormPianta.tsx`

- [ ] **Step 1: Crea `src/components/NumericField.tsx`**

  ```tsx
  import { Label } from '@/components/ui/label'
  import { Input } from '@/components/ui/input'

  interface NumericFieldProps {
    label: string
    value: number | null
    onChange: (value: number | null) => void
    required?: boolean
    placeholder?: string
  }

  export function NumericField({ label, value, onChange, required, placeholder }: NumericFieldProps) {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">{label}</Label>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') { onChange(null); return }
            const num = parseFloat(raw)
            if (!isNaN(num)) onChange(num)
          }}
          required={required}
          placeholder={placeholder ?? '—'}
          className="text-lg h-12"
        />
      </div>
    )
  }
  ```

- [ ] **Step 2: Crea `src/components/FormPianta.tsx`**

  ```tsx
  import { useEffect, useState } from 'react'
  import { supabase } from '@/lib/supabase'
  import { NumericField } from './NumericField'
  import { Badge } from '@/components/ui/badge'

  interface FormPiantaProps {
    idPianta: number | null
    trattamento: string
    onIdPiantaChange: (id: number | null) => void
    onTrattamentoChange: (t: string) => void
  }

  export function FormPianta({ idPianta, trattamento, onIdPiantaChange, onTrattamentoChange }: FormPiantaProps) {
    const [loading, setLoading] = useState(false)

    useEffect(() => {
      if (!idPianta) { onTrattamentoChange(''); return }
      setLoading(true)
      supabase
        .from('piante')
        .select('trattamento')
        .eq('id', idPianta)
        .single()
        .then(({ data }) => {
          onTrattamentoChange(data?.trattamento ?? '')
          setLoading(false)
        })
    }, [idPianta])

    return (
      <div className="flex flex-col gap-3">
        <NumericField
          label="ID Pianta (1–56)"
          value={idPianta}
          onChange={onIdPiantaChange}
          required
        />
        {trattamento && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trattamento:</span>
            <Badge variant="secondary" className="text-sm">
              {loading ? '...' : trattamento}
            </Badge>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Verifica TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Atteso: nessun errore.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/NumericField.tsx src/components/FormPianta.tsx
  git commit -m "feat: NumericField (inputMode numeric) e FormPianta con auto-trattamento"
  ```

---

## Task 5: FormMisure + InlinePalchi + InlineInfiorescenze

**Files:**
- Crea: `src/components/FormMisure.tsx`
- Crea: `src/components/InlinePalchi.tsx`
- Crea: `src/components/InlineInfiorescenze.tsx`

- [ ] **Step 1: Crea `src/components/FormMisure.tsx`**

  ```tsx
  import { NumericField } from './NumericField'
  import { RilevazionePrincipale } from '@/types'

  type MisureKeys = 'altezza' | 'n_palchi_totali' | 'n_fiori_fioriti' | 'n_frutti' | 'n_frutti_invaiati' | 'spad' | 'temp_aria' | 'temp_pianta'

  interface FormMisureProps {
    values: Pick<RilevazionePrincipale, MisureKeys>
    onChange: (key: MisureKeys, value: number | null) => void
  }

  const FIELDS: { key: MisureKeys; label: string }[] = [
    { key: 'altezza', label: 'Altezza (cm)' },
    { key: 'n_palchi_totali', label: 'N. palchi totali' },
    { key: 'n_fiori_fioriti', label: 'N. fiori fioriti' },
    { key: 'n_frutti', label: 'N. frutti' },
    { key: 'n_frutti_invaiati', label: 'N. frutti invaiati' },
    { key: 'spad', label: 'SPAD' },
    { key: 'temp_aria', label: 'Temp. aria (°C)' },
    { key: 'temp_pianta', label: 'Temp. pianta (°C)' },
  ]

  export function FormMisure({ values, onChange }: FormMisureProps) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => (
          <NumericField
            key={key}
            label={label}
            value={values[key]}
            onChange={(v) => onChange(key, v)}
          />
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 2: Crea `src/components/InlinePalchi.tsx`**

  ```tsx
  import { useState } from 'react'
  import { Palco } from '@/types'
  import { Button } from '@/components/ui/button'
  import { NumericField } from './NumericField'

  interface InlinePalchiProps {
    palchi: Palco[]
    onChange: (palchi: Palco[]) => void
  }

  export function InlinePalchi({ palchi, onChange }: InlinePalchiProps) {
    const [editing, setEditing] = useState<number | null>(null)
    const [newFoglie, setNewFoglie] = useState<number | null>(null)

    const addPalco = () => {
      if (newFoglie === null) return
      onChange([...palchi, { numero_palco: palchi.length + 1, n_foglie: newFoglie }])
      setNewFoglie(null)
      setEditing(null)
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Palchi ({palchi.length})</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(-1)}>
            + Palco
          </Button>
        </div>

        {palchi.map((p) => (
          <div key={p.numero_palco} className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-sm">
            <span className="font-medium w-16">Palco {p.numero_palco}</span>
            <span>{p.n_foglie} foglie</span>
          </div>
        ))}

        {editing === -1 && (
          <div className="flex items-end gap-2 border rounded p-3">
            <div className="flex-1">
              <NumericField
                label={`Palco ${palchi.length + 1} — N. Foglie`}
                value={newFoglie}
                onChange={setNewFoglie}
                required
              />
            </div>
            <Button type="button" onClick={addPalco} disabled={newFoglie === null}>
              ✓
            </Button>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Crea `src/components/InlineInfiorescenze.tsx`**

  ```tsx
  import { useState } from 'react'
  import { Infiorescenza } from '@/types'
  import { Button } from '@/components/ui/button'
  import { NumericField } from './NumericField'

  interface InlineInfiorescenzeProps {
    infiorescenze: Infiorescenza[]
    onChange: (infiorescenze: Infiorescenza[]) => void
  }

  export function InlineInfiorescenze({ infiorescenze, onChange }: InlineInfiorescenzeProps) {
    const [editing, setEditing] = useState<number | null>(null)
    const [newFiori, setNewFiori] = useState<number | null>(null)

    const addInfiorescenza = () => {
      if (newFiori === null) return
      onChange([...infiorescenze, { numero_infiorescenza: infiorescenze.length + 1, n_fiori: newFiori }])
      setNewFiori(null)
      setEditing(null)
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Infiorescenze ({infiorescenze.length})</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(-1)}>
            + Inf.
          </Button>
        </div>

        {infiorescenze.map((inf) => (
          <div key={inf.numero_infiorescenza} className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-sm">
            <span className="font-medium w-20">Inf. {inf.numero_infiorescenza}</span>
            <span>{inf.n_fiori} fiori</span>
          </div>
        ))}

        {editing === -1 && (
          <div className="flex items-end gap-2 border rounded p-3">
            <div className="flex-1">
              <NumericField
                label={`Inf. ${infiorescenze.length + 1} — N. Fiori`}
                value={newFiori}
                onChange={setNewFiori}
                required
              />
            </div>
            <Button type="button" onClick={addInfiorescenza} disabled={newFiori === null}>
              ✓
            </Button>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Verifica TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Atteso: nessun errore.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/
  git commit -m "feat: FormMisure, InlinePalchi, InlineInfiorescenze"
  ```

---

## Task 6: Pagina NuovaRilevazione

**Files:**
- Crea: `src/pages/NuovaRilevazione.tsx`

- [ ] **Step 1: Crea `src/pages/NuovaRilevazione.tsx`**

  ```tsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { supabase } from '@/lib/supabase'
  import { useRilevazioneStore } from '@/store/rilevazioneStore'
  import { RilevazioneCompleta } from '@/types'
  import { FormPianta } from '@/components/FormPianta'
  import { FormMisure } from '@/components/FormMisure'
  import { InlinePalchi } from '@/components/InlinePalchi'
  import { InlineInfiorescenze } from '@/components/InlineInfiorescenze'
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import { Textarea } from '@/components/ui/textarea'
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

  const emptyForm = (lastTempAria: number | null): RilevazioneCompleta => ({
    data_ora_inizio: new Date().toISOString(),
    id_pianta: null,
    trattamento: '',
    altezza: null,
    n_palchi_totali: null,
    n_fiori_fioriti: null,
    n_frutti: null,
    n_frutti_invaiati: null,
    spad: null,
    temp_aria: lastTempAria,
    temp_pianta: null,
    note: '',
    palchi: [],
    infiorescenze: [],
  })

  export function NuovaRilevazione() {
    const navigate = useNavigate()
    const { lastTempAria, setLastTempAria } = useRilevazioneStore()
    const [form, setForm] = useState<RilevazioneCompleta>(() => emptyForm(lastTempAria))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const updateField = (key: keyof RilevazioneCompleta, value: unknown) => {
      setForm((f) => ({ ...f, [key]: value }))
    }

    const handleSave = async () => {
      if (!form.id_pianta) { setError('Inserisci ID Pianta'); return }
      setSaving(true)
      setError(null)

      const dataFine = new Date().toISOString()

      const { data: rilevazione, error: errRil } = await supabase
        .from('rilevazione_principale')
        .insert({
          data_ora_inizio: form.data_ora_inizio,
          data_ora_fine: dataFine,
          id_pianta: form.id_pianta,
          trattamento: form.trattamento,
          altezza: form.altezza,
          n_palchi_totali: form.n_palchi_totali,
          n_fiori_fioriti: form.n_fiori_fioriti,
          n_frutti: form.n_frutti,
          n_frutti_invaiati: form.n_frutti_invaiati,
          spad: form.spad,
          temp_aria: form.temp_aria,
          temp_pianta: form.temp_pianta,
          note: form.note,
        })
        .select('id')
        .single()

      if (errRil || !rilevazione) { setError(errRil?.message ?? 'Errore salvataggio'); setSaving(false); return }

      if (form.palchi.length > 0) {
        await supabase.from('dettaglio_palchi').insert(
          form.palchi.map((p) => ({ ...p, id_rilevazione: rilevazione.id }))
        )
      }

      if (form.infiorescenze.length > 0) {
        await supabase.from('dettaglio_infiorescenze').insert(
          form.infiorescenze.map((inf) => ({ ...inf, id_rilevazione: rilevazione.id }))
        )
      }

      if (form.temp_aria !== null) setLastTempAria(form.temp_aria)
      navigate('/')
    }

    return (
      <div className="max-w-lg mx-auto p-4 pb-24 flex flex-col gap-4">
        <h1 className="text-xl font-bold">Nuova Rilevazione</h1>
        <p className="text-xs text-muted-foreground">
          Inizio: {new Date(form.data_ora_inizio).toLocaleTimeString('it-IT')}
        </p>

        <Card><CardContent className="pt-4">
          <FormPianta
            idPianta={form.id_pianta}
            trattamento={form.trattamento}
            onIdPiantaChange={(v) => updateField('id_pianta', v)}
            onTrattamentoChange={(v) => updateField('trattamento', v)}
          />
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Misure pianta</CardTitle></CardHeader>
        <CardContent>
          <FormMisure
            values={form}
            onChange={(key, value) => updateField(key, value)}
          />
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <InlinePalchi palchi={form.palchi} onChange={(p) => updateField('palchi', p)} />
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <InlineInfiorescenze infiorescenze={form.infiorescenze} onChange={(i) => updateField('infiorescenze', i)} />
        </CardContent></Card>

        <Card><CardContent className="pt-4 flex flex-col gap-2">
          <Label>Note (dettatura vocale)</Label>
          <Textarea
            value={form.note}
            onChange={(e) => updateField('note', e.target.value)}
            rows={3}
            placeholder="Note..."
          />
        </CardContent></Card>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button
          className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto h-14 text-lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Salvataggio...' : '✅ Salva Rilevazione'}
        </Button>
      </div>
    )
  }
  ```

- [ ] **Step 2: Installa react-router-dom**

  ```bash
  npm install react-router-dom
  ```

- [ ] **Step 3: Verifica TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Atteso: nessun errore.

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/NuovaRilevazione.tsx
  git commit -m "feat: NuovaRilevazione — form completo con save su Supabase"
  ```

---

## Task 7: Export Excel e pagina ListaRilevazioni

**Files:**
- Crea: `src/lib/exportExcel.ts`
- Crea: `src/pages/ListaRilevazioni.tsx`

- [ ] **Step 1: Crea `src/lib/exportExcel.ts`**

  ```typescript
  import * as XLSX from 'xlsx'
  import { supabase } from './supabase'

  export async function exportToExcel() {
    const { data: rilevazioni } = await supabase
      .from('rilevazione_principale')
      .select('*')
      .order('data_ora_inizio', { ascending: false })

    const { data: palchi } = await supabase
      .from('dettaglio_palchi')
      .select('*')
      .order('id_rilevazione, numero_palco')

    const { data: infiorescenze } = await supabase
      .from('dettaglio_infiorescenze')
      .select('*')
      .order('id_rilevazione, numero_infiorescenza')

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rilevazioni ?? []), 'Rilevazioni')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(palchi ?? []), 'Palchi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infiorescenze ?? []), 'Infiorescenze')

    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `FastLab_Rilievi_${date}.xlsx`)
  }
  ```

- [ ] **Step 2: Crea `src/pages/ListaRilevazioni.tsx`**

  ```tsx
  import { useEffect, useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { supabase } from '@/lib/supabase'
  import { exportToExcel } from '@/lib/exportExcel'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
  import { Badge } from '@/components/ui/badge'

  interface RilevazioneRow {
    id: string
    data_ora_inizio: string
    id_pianta: number
    trattamento: string
    altezza: number | null
  }

  export function ListaRilevazioni() {
    const navigate = useNavigate()
    const [rilevazioni, setRilevazioni] = useState<RilevazioneRow[]>([])
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
      supabase
        .from('rilevazione_principale')
        .select('id, data_ora_inizio, id_pianta, trattamento, altezza')
        .order('data_ora_inizio', { ascending: false })
        .then(({ data }) => { setRilevazioni(data ?? []); setLoading(false) })
    }, [])

    const handleExport = async () => {
      setExporting(true)
      await exportToExcel()
      setExporting(false)
    }

    return (
      <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">FastLab 🌱</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? '...' : '⬇ Excel'}
            </Button>
            <Button size="sm" onClick={() => navigate('/nuova')}>
              + Nuova
            </Button>
          </div>
        </div>

        {loading && <p className="text-muted-foreground text-sm">Caricamento...</p>}

        {rilevazioni.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex items-start justify-between">
              <div>
                <p className="font-semibold">Pianta #{r.id_pianta}</p>
                <Badge variant="secondary" className="mt-1">{r.trattamento}</Badge>
                {r.altezza && <p className="text-sm text-muted-foreground mt-1">Altezza: {r.altezza} cm</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(r.data_ora_inizio).toLocaleString('it-IT')}
              </p>
            </CardContent>
          </Card>
        ))}

        {!loading && rilevazioni.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nessuna rilevazione ancora.<br/>Tocca "+ Nuova" per iniziare.</p>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Verifica TypeScript**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/exportExcel.ts src/pages/ListaRilevazioni.tsx
  git commit -m "feat: ListaRilevazioni con export Excel e lista rilevazioni"
  ```

---

## Task 8: App.tsx + routing + PWA + deploy Vercel

**Files:**
- Modifica: `src/App.tsx`
- Modifica: `vite.config.ts`
- Crea: repo GitHub + deploy Vercel

- [ ] **Step 1: Aggiorna `src/App.tsx`**

  ```tsx
  import { BrowserRouter, Routes, Route } from 'react-router-dom'
  import { ListaRilevazioni } from './pages/ListaRilevazioni'
  import { NuovaRilevazione } from './pages/NuovaRilevazione'

  export default function App() {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ListaRilevazioni />} />
          <Route path="/nuova" element={<NuovaRilevazione />} />
        </Routes>
      </BrowserRouter>
    )
  }
  ```

- [ ] **Step 2: Configura PWA in `vite.config.ts`**

  ```typescript
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import { VitePWA } from 'vite-plugin-pwa'
  import path from 'path'

  export default defineConfig({
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'FastLab Rilievi',
          short_name: 'FastLab',
          theme_color: '#16a34a',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  })
  ```

- [ ] **Step 3: Verifica build locale**

  ```bash
  npm run build
  ```

  Atteso: build completata in `dist/` senza errori.

- [ ] **Step 4: Crea repo GitHub**

  Vai su [github.com](https://github.com) → **New repository** → nome `fastlab` → Private → **Create repository**.

  ```bash
  cd "C:/Users/leona/OneDrive/Desktop/Progetti/FastLab"
  git remote add origin https://github.com/TUO_USERNAME/fastlab.git
  git push -u origin master
  ```

- [ ] **Step 5: Deploy su Vercel**

  Vai su [vercel.com](https://vercel.com) → **Add New Project** → importa repo `fastlab` da GitHub.
  - Framework: **Vite** (auto-rilevato)
  - Build command: `npm run build`
  - Output directory: `dist`

  In **Environment Variables** aggiungi:
  - `VITE_SUPABASE_URL` = (il valore da `.env.local`)
  - `VITE_SUPABASE_ANON_KEY` = (il valore da `.env.local`)

  Clic **Deploy**. Attendi 1-2 minuti.

- [ ] **Step 6: Verifica deploy**

  Apri l'URL Vercel nel browser → schermata lista rilevazioni visibile.
  Apri dal telefono Android → aggiungi a schermata home (Chrome → menu ⋮ → "Aggiungi a schermata Home").

- [ ] **Step 7: Commit finale**

  ```bash
  git add src/App.tsx vite.config.ts
  git commit -m "feat: routing, PWA manifest, deploy Vercel"
  git push
  ```

---

## Task 9: Test end-to-end su Android

- [ ] **Step 1: Apri app su Android**

  Dal telefono: apri Chrome → vai all'URL Vercel → aggiungi a schermata home.

- [ ] **Step 2: Test rilievo completo**

  1. Tocca **+ Nuova**
  2. Campo ID Pianta: digita `15` (o tocca microfono 🎤 e dì "quindici")
  3. Verifica: appare badge **"Controllo + HC"** in automatico
  4. Compila: Altezza=`85`, N. palchi totali=`4`, N. fiori=`12`, N. frutti=`3`, Invaiati=`1`, SPAD=`42.5`, Temp. aria=`24.3`, Temp. pianta=`26.1`
  5. Tocca **+ Palco** → inserisci `8` → ✓. Tocca **+ Palco** → inserisci `5` → ✓ (deve comparire "Palco 2")
  6. Tocca **+ Inf.** → inserisci `6` → ✓
  7. Campo Note: tocca e detta "Foglie con leggero ingiallimento"
  8. Tocca **✅ Salva Rilevazione** → torna alla lista

- [ ] **Step 3: Verifica dati su Supabase**

  Dal PC: Supabase dashboard → Table Editor → `rilevazione_principale`: 1 riga con tutti i dati, `data_ora_fine` compilata.
  Tab `dettaglio_palchi`: 2 righe. Tab `dettaglio_infiorescenze`: 1 riga.

- [ ] **Step 4: Test Temp_Aria default**

  Crea una seconda rilevazione: campo Temp. aria deve mostrare `24.3` pre-compilato.

- [ ] **Step 5: Test export Excel**

  Dalla lista rilevazioni → tocca **⬇ Excel** → file `FastLab_Rilievi_YYYY-MM-DD.xlsx` scaricato.
  Aprilo in Excel: 3 fogli (Rilevazioni, Palchi, Infiorescenze) con i dati corretti.
