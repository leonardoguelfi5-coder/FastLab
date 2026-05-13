# FastLab v2 — Modifiche PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere UX pass-based (SceltaMisurazione + PassoPianta), edit mode per rilevazioni esistenti, e fix bug Excel export.

**Architecture:** Tre nuove route (`/scegli`, `/passo/:tipo`, `/modifica/:id`) con due nuove pagine. Lo store Zustand riceve `updateRilevazione`. Il PassoPianta crea o aggiorna la rilevazione di oggi per la pianta selezionata (merge dei campi). NuovaRilevazione diventa riusabile come edit mode via useParams.

**Tech Stack:** React 18 + Vite + TypeScript, Zustand (persist), react-router-dom, shadcn/ui + Tailwind v4, SheetJS (xlsx).

---

## File Map

| Azione | File | Responsabilità |
|---|---|---|
| Modify | `src/store/rilevazioneStore.ts` | Aggiunta `updateRilevazione` |
| Modify | `src/lib/exportExcel.ts` | Null safety su palchi/infiorescenze |
| Modify | `src/pages/NuovaRilevazione.tsx` | Edit mode via `/modifica/:id` |
| Modify | `src/pages/ListaRilevazioni.tsx` | Pulsante ✏️ Modifica per ogni card |
| Create | `src/pages/SceltaMisurazione.tsx` | Schermata selezione tipo passata |
| Create | `src/pages/PassoPianta.tsx` | Form per singola misurazione pass-based |
| Modify | `src/App.tsx` | Aggiunta route `/scegli`, `/passo/:tipo`, `/modifica/:id` |

---

## Task 1: Fix Excel export — null safety

**Files:**
- Modify: `src/lib/exportExcel.ts`

- [ ] **Step 1: Aprire il file**

Aprire `src/lib/exportExcel.ts`. Le righe 24-31 e 34-40 usano `r.palchi.map(...)` e `r.infiorescenze.map(...)` direttamente, causando crash se gli array sono `undefined` (es. rilevazione creata con solo temp_aria).

- [ ] **Step 2: Applicare il fix**

Sostituire il corpo della funzione con la versione null-safe:

```typescript
import * as XLSX from 'xlsx'
import type { RilevazionePrincipale } from '@/types'

export function exportToExcel(rilevazioni: RilevazionePrincipale[]) {
  // Sheet 1: Rilevazioni (flatten — no nested palchi/infiorescenze)
  const rilevSheet = rilevazioni.map((r) => ({
    ID: r.id,
    Data_Ora_Inizio: r.data_ora_inizio,
    Data_Ora_Fine: r.data_ora_fine,
    ID_Pianta: r.id_pianta,
    Trattamento: r.trattamento,
    Altezza: r.altezza,
    N_palchi_totali: r.n_palchi_totali,
    N_fiori_fioriti: r.n_fiori_fioriti,
    N_frutti: r.n_frutti,
    N_frutti_invaiati: r.n_frutti_invaiati,
    Spad: r.spad,
    Temp_Aria: r.temp_aria,
    Temp_Pianta: r.temp_pianta,
    Note: r.note,
  }))

  // Sheet 2: Palchi (flat, with id_rilevazione)
  const palchiSheet = rilevazioni.flatMap((r) =>
    (r.palchi ?? []).map((p) => ({
      ID_Rilevazione: r.id,
      ID_Pianta: r.id_pianta,
      Numero_Palco: p.numero_palco,
      N_Foglie: p.n_foglie,
    }))
  )

  // Sheet 3: Infiorescenze (flat, with id_rilevazione)
  const infSheet = rilevazioni.flatMap((r) =>
    (r.infiorescenze ?? []).map((inf) => ({
      ID_Rilevazione: r.id,
      ID_Pianta: r.id_pianta,
      Numero_Infiorescenza: inf.numero_infiorescenza,
      N_Fiori: inf.n_fiori,
    }))
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rilevSheet), 'Rilevazioni')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(palchiSheet.length ? palchiSheet : [{}]), 'Palchi')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infSheet.length ? infSheet : [{}]), 'Infiorescenze')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `FastLab_Rilievi_${date}.xlsx`)
}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build OK senza errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/lib/exportExcel.ts
git commit -m "fix: null safety on palchi/infiorescenze in Excel export"
```

---

## Task 2: Store — aggiungere `updateRilevazione`

**Files:**
- Modify: `src/store/rilevazioneStore.ts`

- [ ] **Step 1: Aggiornare il file**

Sostituire l'intero contenuto di `src/store/rilevazioneStore.ts`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RilevazionePrincipale } from '@/types'

interface RilevazioneStore {
  rilevazioni: RilevazionePrincipale[]
  lastTempAria: number | null
  addRilevazione: (r: RilevazionePrincipale) => void
  updateRilevazione: (r: RilevazionePrincipale) => void
  deleteRilevazione: (id: string) => void
  setLastTempAria: (value: number | null) => void
}

export const useRilevazioneStore = create<RilevazioneStore>()(
  persist(
    (set) => ({
      rilevazioni: [],
      lastTempAria: null,
      addRilevazione: (r) => set((state) => ({ rilevazioni: [r, ...state.rilevazioni] })),
      updateRilevazione: (r) =>
        set((state) => ({
          rilevazioni: state.rilevazioni.map((existing) =>
            existing.id === r.id ? r : existing
          ),
        })),
      deleteRilevazione: (id) =>
        set((state) => ({ rilevazioni: state.rilevazioni.filter((r) => r.id !== id) })),
      setLastTempAria: (value) => set({ lastTempAria: value }),
    }),
    { name: 'fastlab-store' }
  )
)
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/store/rilevazioneStore.ts
git commit -m "feat: add updateRilevazione action to store"
```

---

## Task 3: NuovaRilevazione — edit mode via `/modifica/:id`

**Files:**
- Modify: `src/pages/NuovaRilevazione.tsx`

In modalità edit (`/modifica/:id`), il form viene pre-caricato con la rilevazione esistente. Al salvataggio si chiama `updateRilevazione` invece di `addRilevazione`. Il campo `id_pianta` è read-only.

- [ ] **Step 1: Sostituire il file**

Sostituire l'intero contenuto di `src/pages/NuovaRilevazione.tsx`:

```typescript
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import type { RilevazionePrincipale } from '@/types'
import { FormPianta } from '@/components/FormPianta'
import { FormMisure } from '@/components/FormMisure'
import { InlinePalchi } from '@/components/InlinePalchi'
import { InlineInfiorescenze } from '@/components/InlineInfiorescenze'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type MisureKeys = 'altezza' | 'n_palchi_totali' | 'n_fiori_fioriti' | 'n_frutti' | 'n_frutti_invaiati' | 'spad' | 'temp_aria' | 'temp_pianta'

function emptyForm(lastTempAria: number | null): RilevazionePrincipale {
  return {
    id: crypto.randomUUID(),
    data_ora_inizio: new Date().toISOString(),
    data_ora_fine: '',
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
  }
}

export function NuovaRilevazione() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const { rilevazioni, lastTempAria, addRilevazione, updateRilevazione, setLastTempAria } =
    useRilevazioneStore()

  const isEditMode = Boolean(id)
  const existing = id ? rilevazioni.find((r) => r.id === id) : undefined

  const [form, setForm] = useState<RilevazionePrincipale>(() =>
    existing ? { ...existing } : emptyForm(lastTempAria)
  )
  const [error, setError] = useState<string | null>(null)

  const updateField = (key: keyof RilevazionePrincipale, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = () => {
    if (!form.id_pianta || form.id_pianta < 1 || form.id_pianta > 56) {
      setError('Inserisci un ID Pianta valido (1–56)')
      return
    }
    setError(null)
    const saved: RilevazionePrincipale = { ...form, data_ora_fine: new Date().toISOString() }
    if (isEditMode) {
      updateRilevazione(saved)
    } else {
      addRilevazione(saved)
    }
    if (form.temp_aria !== null) setLastTempAria(form.temp_aria)
    navigate('/')
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← Indietro</Button>
        <h1 className="text-xl font-bold">{isEditMode ? 'Modifica Rilevazione' : 'Nuova Rilevazione'}</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Inizio: {new Date(form.data_ora_inizio).toLocaleTimeString('it-IT')}
      </p>

      <Card>
        <CardContent className="pt-4">
          <FormPianta
            idPianta={form.id_pianta}
            trattamento={form.trattamento}
            onIdPiantaChange={isEditMode ? () => {} : (v) => updateField('id_pianta', v)}
            onTrattamentoChange={(v) => updateField('trattamento', v)}
            readOnly={isEditMode}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Misure pianta</CardTitle></CardHeader>
        <CardContent>
          <FormMisure
            values={form}
            onChange={(key: MisureKeys, value) => updateField(key, value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <InlinePalchi palchi={form.palchi ?? []} onChange={(p) => updateField('palchi', p)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <InlineInfiorescenze
            infiorescenze={form.infiorescenze ?? []}
            onChange={(i) => updateField('infiorescenze', i)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 flex flex-col gap-2">
          <Label>Note (dettatura vocale)</Label>
          <Textarea
            value={form.note}
            onChange={(e) => updateField('note', e.target.value)}
            rows={3}
            placeholder="Note..."
          />
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm font-medium">{error}</p>}

      <Button
        className="fixed bottom-4 left-4 right-4 max-w-[calc(100%-2rem)] h-14 text-lg"
        onClick={handleSave}
      >
        {isEditMode ? '✅ Aggiorna Rilevazione' : '✅ Salva Rilevazione'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Aggiungere prop `readOnly` a FormPianta**

Aprire `src/components/FormPianta.tsx`. Aggiungere la prop `readOnly?: boolean` all'interfaccia e passarla all'input di `id_pianta`:

```typescript
// Trovare l'interfaccia props e aggiungere readOnly
interface FormPiantaProps {
  idPianta: number | null
  trattamento: string
  onIdPiantaChange: (v: number | null) => void
  onTrattamentoChange: (v: string) => void
  readOnly?: boolean
}
```

Nel componente, aggiungere `readOnly` all'Input dell'id pianta (o al `NumericField`):

```typescript
// Esempio: se usa NumericField, passargli disabled={readOnly}
// Se usa Input direttamente, passare readOnly={readOnly}
// L'input id_pianta deve essere disabilitato in edit mode
```

> **Nota:** Leggere il contenuto attuale di `src/components/FormPianta.tsx` per vedere la struttura esatta prima di modificare. L'obiettivo è che il campo ID pianta sia non-modificabile in edit mode.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NuovaRilevazione.tsx src/components/FormPianta.tsx
git commit -m "feat: add edit mode to NuovaRilevazione via /modifica/:id"
```

---

## Task 4: ListaRilevazioni — pulsante Modifica

**Files:**
- Modify: `src/pages/ListaRilevazioni.tsx`

- [ ] **Step 1: Sostituire il file**

Sostituire l'intero contenuto di `src/pages/ListaRilevazioni.tsx`:

```typescript
import { useNavigate } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import { exportToExcel } from '@/lib/exportExcel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function ListaRilevazioni() {
  const navigate = useNavigate()
  const { rilevazioni, deleteRilevazione } = useRilevazioneStore()

  const handleExport = () => {
    if (rilevazioni.length === 0) return
    exportToExcel(rilevazioni)
  }

  return (
    <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">FastLab 🌱</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rilevazioni.length === 0}
          >
            ⬇ Excel
          </Button>
          <Button size="sm" onClick={() => navigate('/scegli')}>
            + Nuova
          </Button>
        </div>
      </div>

      {rilevazioni.length === 0 && (
        <p className="text-center text-muted-foreground py-12 text-sm">
          Nessuna rilevazione ancora.<br />
          Tocca <strong>+ Nuova</strong> per iniziare.
        </p>
      )}

      {rilevazioni.map((r) => (
        <Card key={r.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">Pianta #{r.id_pianta}</p>
              <Badge variant="secondary" className="w-fit text-xs">{r.trattamento}</Badge>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                {r.altezza != null && <span>📏 {r.altezza} cm</span>}
                {(r.palchi ?? []).length > 0 && <span>🌿 {r.palchi.length} palchi</span>}
                {(r.infiorescenze ?? []).length > 0 && <span>🌸 {r.infiorescenze.length} inf.</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-xs text-muted-foreground">
                {new Date(r.data_ora_inizio).toLocaleString('it-IT', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                })}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => navigate(`/modifica/${r.id}`)}
                >
                  ✏️ Modifica
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 px-2 text-xs"
                  onClick={() => {
                    if (confirm('Eliminare questa rilevazione?')) deleteRilevazione(r.id)
                  }}
                >
                  Elimina
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ListaRilevazioni.tsx
git commit -m "feat: add edit button to rilevazioni list cards"
```

---

## Task 5: Creare `SceltaMisurazione.tsx`

**Files:**
- Create: `src/pages/SceltaMisurazione.tsx`

Schermata con 4 grandi pulsanti — uno per ogni tipo di passata. Naviga a `/passo/:tipo` con tipo ∈ `termometro | spad | altezza | fenologici`.

- [ ] **Step 1: Creare il file**

```typescript
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const OPZIONI = [
  { tipo: 'termometro', emoji: '🌡', label: 'Termometro', desc: 'Temp. aria + Temp. pianta' },
  { tipo: 'spad', emoji: '💚', label: 'SPAD', desc: 'Lettura clorofilla SPAD' },
  { tipo: 'altezza', emoji: '📏', label: 'Altezza', desc: 'Altezza pianta (cm)' },
  { tipo: 'fenologici', emoji: '🌱', label: 'Fenologici', desc: 'Palchi, fiori, frutti, infiorescenze' },
] as const

export type TipoPassata = typeof OPZIONI[number]['tipo']

export function SceltaMisurazione() {
  const navigate = useNavigate()

  return (
    <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← Indietro</Button>
        <h1 className="text-xl font-bold">Tipo di passata</h1>
      </div>
      <p className="text-sm text-muted-foreground">Cosa stai misurando in questa passata?</p>

      <div className="flex flex-col gap-3 mt-2">
        {OPZIONI.map(({ tipo, emoji, label, desc }) => (
          <Card
            key={tipo}
            className="cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => navigate(`/passo/${tipo}`)}
          >
            <CardContent className="pt-4 flex items-center gap-4">
              <span className="text-4xl">{emoji}</span>
              <div>
                <p className="font-semibold text-base">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SceltaMisurazione.tsx
git commit -m "feat: add SceltaMisurazione page for pass type selection"
```

---

## Task 6: Creare `PassoPianta.tsx`

**Files:**
- Create: `src/pages/PassoPianta.tsx`

Form pass-based. Legge `:tipo` da URL, mostra solo i campi rilevanti, inserisce l'ID pianta manualmente. Logica: cerca la rilevazione di oggi per quella pianta → aggiorna (merge) o crea nuova. Dopo il salvataggio mostra feedback e resetta solo l'ID pianta (i valori delle misure restano per velocizzare l'inserimento seriale).

- [ ] **Step 1: Creare il file**

```typescript
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRilevazioneStore } from '@/store/rilevazioneStore'
import type { RilevazionePrincipale } from '@/types'
import type { TipoPassata } from './SceltaMisurazione'
import { getTrattamento } from '@/data/piante'
import { NumericField } from '@/components/NumericField'
import { InlinePalchi } from '@/components/InlinePalchi'
import { InlineInfiorescenze } from '@/components/InlineInfiorescenze'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type CampiPassata = Partial<Pick<
  RilevazionePrincipale,
  'temp_aria' | 'temp_pianta' | 'spad' | 'altezza' |
  'n_palchi_totali' | 'n_fiori_fioriti' | 'n_frutti' | 'n_frutti_invaiati' |
  'note' | 'palchi' | 'infiorescenze'
>>

function campiVuoti(tipo: TipoPassata, lastTempAria: number | null): CampiPassata {
  switch (tipo) {
    case 'termometro':
      return { temp_aria: lastTempAria, temp_pianta: null }
    case 'spad':
      return { spad: null }
    case 'altezza':
      return { altezza: null }
    case 'fenologici':
      return {
        altezza: null,
        n_palchi_totali: null,
        n_fiori_fioriti: null,
        n_frutti: null,
        n_frutti_invaiati: null,
        note: '',
        palchi: [],
        infiorescenze: [],
      }
  }
}

const TIPO_LABEL: Record<TipoPassata, string> = {
  termometro: '🌡 Termometro',
  spad: '💚 SPAD',
  altezza: '📏 Altezza',
  fenologici: '🌱 Fenologici',
}

export function PassoPianta() {
  const navigate = useNavigate()
  const { tipo } = useParams<{ tipo: string }>()
  const tipoPassata = (tipo ?? 'termometro') as TipoPassata

  const { rilevazioni, lastTempAria, addRilevazione, updateRilevazione, setLastTempAria } =
    useRilevazioneStore()

  const [idPianta, setIdPianta] = useState<number | null>(null)
  const [campi, setCampi] = useState<CampiPassata>(() => campiVuoti(tipoPassata, lastTempAria))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null) // ultimo id pianta salvato

  const updateCampo = <K extends keyof CampiPassata>(key: K, value: CampiPassata[K]) => {
    setCampi((c) => ({ ...c, [key]: value }))
  }

  const trattamento = idPianta && idPianta >= 1 && idPianta <= 56
    ? getTrattamento(idPianta)
    : null

  const handleSave = () => {
    if (!idPianta || idPianta < 1 || idPianta > 56) {
      setError('Inserisci un ID Pianta valido (1–56)')
      return
    }
    setError(null)

    const oggi = new Date().toISOString().slice(0, 10)
    const esistente = rilevazioni.find(
      (r) => r.id_pianta === idPianta && r.data_ora_inizio.slice(0, 10) === oggi
    )

    if (esistente) {
      // Merge: aggiorna solo i campi della passata corrente
      const aggiornata: RilevazionePrincipale = {
        ...esistente,
        ...campi,
        data_ora_fine: new Date().toISOString(),
      }
      updateRilevazione(aggiornata)
    } else {
      // Nuova rilevazione per questa pianta oggi
      const nuova: RilevazionePrincipale = {
        id: crypto.randomUUID(),
        data_ora_inizio: new Date().toISOString(),
        data_ora_fine: new Date().toISOString(),
        id_pianta: idPianta,
        trattamento: getTrattamento(idPianta),
        altezza: null,
        n_palchi_totali: null,
        n_fiori_fioriti: null,
        n_frutti: null,
        n_frutti_invaiati: null,
        spad: null,
        temp_aria: null,
        temp_pianta: null,
        note: '',
        palchi: [],
        infiorescenze: [],
        ...campi,
      }
      addRilevazione(nuova)
    }

    // Aggiorna lastTempAria se c'è temp_aria
    if ('temp_aria' in campi && campi.temp_aria !== null && campi.temp_aria !== undefined) {
      setLastTempAria(campi.temp_aria)
    }

    // Feedback: mostra pianta salvata, resetta solo ID
    setSaved(idPianta)
    setIdPianta(null)
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/scegli')}>← Indietro</Button>
        <h1 className="text-xl font-bold">{TIPO_LABEL[tipoPassata]}</h1>
      </div>

      {saved !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800 font-medium">
          ✓ Pianta #{saved} salvata
        </div>
      )}

      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <NumericField
            label="ID Pianta (1–56)"
            value={idPianta}
            onChange={setIdPianta}
            required
          />
          {trattamento && (
            <Badge variant="secondary" className="w-fit">{trattamento}</Badge>
          )}
        </CardContent>
      </Card>

      {tipoPassata === 'termometro' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Temperature</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <NumericField
              label="Temp. aria (°C)"
              value={(campi as { temp_aria?: number | null }).temp_aria ?? null}
              onChange={(v) => updateCampo('temp_aria', v)}
            />
            <NumericField
              label="Temp. pianta (°C)"
              value={(campi as { temp_pianta?: number | null }).temp_pianta ?? null}
              onChange={(v) => updateCampo('temp_pianta', v)}
            />
          </CardContent>
        </Card>
      )}

      {tipoPassata === 'spad' && (
        <Card>
          <CardContent className="pt-4">
            <NumericField
              label="SPAD"
              value={(campi as { spad?: number | null }).spad ?? null}
              onChange={(v) => updateCampo('spad', v)}
            />
          </CardContent>
        </Card>
      )}

      {tipoPassata === 'altezza' && (
        <Card>
          <CardContent className="pt-4">
            <NumericField
              label="Altezza (cm)"
              value={(campi as { altezza?: number | null }).altezza ?? null}
              onChange={(v) => updateCampo('altezza', v)}
            />
          </CardContent>
        </Card>
      )}

      {tipoPassata === 'fenologici' && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Misure fenologiche</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <NumericField
                label="Altezza (cm)"
                value={(campi as { altezza?: number | null }).altezza ?? null}
                onChange={(v) => updateCampo('altezza', v)}
              />
              <NumericField
                label="N. palchi totali"
                value={(campi as { n_palchi_totali?: number | null }).n_palchi_totali ?? null}
                onChange={(v) => updateCampo('n_palchi_totali', v)}
              />
              <NumericField
                label="N. fiori fioriti"
                value={(campi as { n_fiori_fioriti?: number | null }).n_fiori_fioriti ?? null}
                onChange={(v) => updateCampo('n_fiori_fioriti', v)}
              />
              <NumericField
                label="N. frutti"
                value={(campi as { n_frutti?: number | null }).n_frutti ?? null}
                onChange={(v) => updateCampo('n_frutti', v)}
              />
              <NumericField
                label="N. frutti invaiati"
                value={(campi as { n_frutti_invaiati?: number | null }).n_frutti_invaiati ?? null}
                onChange={(v) => updateCampo('n_frutti_invaiati', v)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <InlinePalchi
                palchi={(campi as { palchi?: RilevazionePrincipale['palchi'] }).palchi ?? []}
                onChange={(p) => updateCampo('palchi', p)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <InlineInfiorescenze
                infiorescenze={(campi as { infiorescenze?: RilevazionePrincipale['infiorescenze'] }).infiorescenze ?? []}
                onChange={(i) => updateCampo('infiorescenze', i)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex flex-col gap-2">
              <Label>Note (dettatura vocale)</Label>
              <Textarea
                value={(campi as { note?: string }).note ?? ''}
                onChange={(e) => updateCampo('note', e.target.value)}
                rows={3}
                placeholder="Note..."
              />
            </CardContent>
          </Card>
        </>
      )}

      {error && <p className="text-destructive text-sm font-medium">{error}</p>}

      <Button
        className="fixed bottom-4 left-4 right-4 max-w-[calc(100%-2rem)] h-14 text-lg"
        onClick={handleSave}
      >
        ✅ Salva Pianta #{idPianta ?? '?'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build OK. Se ci sono errori TypeScript sui tipi `CampiPassata`, adattare i cast oppure usare tipi più espliciti — la logica rimane identica.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PassoPianta.tsx
git commit -m "feat: add PassoPianta page for pass-based data entry"
```

---

## Task 7: App.tsx — aggiungere le nuove route

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Sostituire il file**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ListaRilevazioni } from './pages/ListaRilevazioni'
import { NuovaRilevazione } from './pages/NuovaRilevazione'
import { SceltaMisurazione } from './pages/SceltaMisurazione'
import { PassoPianta } from './pages/PassoPianta'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListaRilevazioni />} />
        <Route path="/scegli" element={<SceltaMisurazione />} />
        <Route path="/passo/:tipo" element={<PassoPianta />} />
        <Route path="/nuova" element={<NuovaRilevazione />} />
        <Route path="/modifica/:id" element={<NuovaRilevazione />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Build check finale**

```bash
npm run build
```

Expected: build OK senza errori.

- [ ] **Step 3: Test manuale (dev server)**

```bash
npm run dev
```

Verificare nel browser:
1. Home `/` — pulsante "+ Nuova" porta a `/scegli`
2. `/scegli` — 4 card cliccabili, "← Indietro" torna a `/`
3. `/passo/termometro` — mostra campo ID pianta + Temp aria + Temp pianta
4. `/passo/spad` — mostra solo SPAD
5. `/passo/altezza` — mostra solo Altezza
6. `/passo/fenologici` — mostra tutti i campi fenologici + palchi + infiorescenze + note
7. Salvataggio pianta → messaggio verde "✓ Pianta #X salvata", campo ID resettato, valori misure mantenuti
8. Seconda passata stessa pianta stesso giorno → aggiorna (merge), non duplica
9. Home → card con pulsante "✏️ Modifica" → porta a `/modifica/:id` con campi pre-compilati
10. Edit mode: ID pianta read-only, salvataggio aggiorna la card esistente
11. Export Excel: click "⬇ Excel" → file scaricato con 3 fogli compilati (palchi e infiorescenze presenti se inseriti)

- [ ] **Step 4: Commit e push**

```bash
git add src/App.tsx
git commit -m "feat: add /scegli, /passo/:tipo, /modifica/:id routes"
git push
```

Vercel fa il deploy automaticamente al push su `main`. Verificare su `https://fast-lab-gamma.vercel.app` dopo 1-2 minuti.
```

---

## Self-Review

**Spec coverage:**
- ✅ Pass-based UX: SceltaMisurazione + PassoPianta (Task 5, 6)
- ✅ 4 tipi di passata con campi corretti (Task 6)
- ✅ Logica merge oggi/pianta (Task 6 `handleSave`)
- ✅ Feedback post-salvataggio + reset ID (Task 6)
- ✅ Valori misure persistenti tra piante successive (Task 6 - `campi` non resettato)
- ✅ Inserimento manuale ID pianta (Task 6)
- ✅ Edit mode NuovaRilevazione (Task 3)
- ✅ Pulsante Modifica in lista (Task 4)
- ✅ updateRilevazione store (Task 2)
- ✅ Excel null safety (Task 1)
- ✅ Tutte le route in App.tsx (Task 7)

**Placeholder scan:** Nessun TODO/TBD. Task 3 Step 2 ha una nota generica su FormPianta — necessario leggere il file prima di modificare, ma l'obiettivo è preciso.

**Type consistency:** `updateRilevazione(r: RilevazionePrincipale)` definito in Task 2 e usato in Task 3 e 6. `TipoPassata` esportato da SceltaMisurazione e importato in PassoPianta. `getTrattamento` già esistente in `src/data/piante.ts`.
