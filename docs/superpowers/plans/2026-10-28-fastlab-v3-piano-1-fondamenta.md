# FastLab v3 — Piano 1: Fondamenta — Piano di implementazione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: usa superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans per eseguire il piano un task alla volta. I passi usano la sintassi a checkbox (`- [ ]`) per il tracciamento.

**Obiettivo:** sostituire la v2 (lista piatta di rilevazioni in localStorage) con un'app multiutente su Supabase. Gli esperimenti si configurano dall'app (fattori, trattamenti, piante, parametri, passate), le misure in campo si inseriscono dalla scheda della pianta e la scheda ne mostra la storia.

**Architettura:** SPA React esistente più Supabase (Postgres, Auth). Tutta la logica di dominio sta in funzioni pure in `src/domain/`, testate con Vitest. L'accesso ai dati passa da `src/api/`, con funzioni che lanciano eccezioni in caso di errore e hook TanStack Query. La sicurezza è affidata alla Row Level Security, con una funzione `is_membro(esperimento_id)` uguale per tutte le tabelle, testata con pgTAP. La creazione di un esperimento è atomica: una sola RPC `crea_esperimento(bozza jsonb)` riceve una bozza con gli id già generati dal client.

**Tech stack:** React 19, Vite 8, TypeScript 6, Tailwind 4, shadcn/ui (stile base-nova), React Router 7, Zustand 5, `@supabase/supabase-js` 2, `@tanstack/react-query` 5, Vitest + Testing Library + jsdom, Supabase CLI (dev dependency) con pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-28-fastlab-v3-esperimenti-design.md`. Mockup: `docs/superpowers/specs/2026-10-28-fastlab-v3-mockup-flusso-campo.html`.

### Suddivisione in piani

La spec copre tre blocchi che dipendono uno dall'altro. Questo è il **Piano 1**, che produce un'app usabile in campo. I Piani 2 e 3 si scrivono dopo l'esecuzione del Piano 1, sullo schema reale:

- **Piano 1 (questo): fondamenta.** Schema e RLS, inviti e accesso, creazione guidata e duplicazione, modello Hydrochar, schermata in campo, scheda pianta con misure multiple, campi progressivi e storia, modifica di misure passate, impostazioni dell'esperimento.
- **Piano 2: grafici ed export.** Mini-grafico nella scheda pianta, pagina grafici (media per pianta, poi media ± ES per trattamento), export Excel con i fogli Dati, Misure, liste, Grafici (immagini) e Info. Sostituisce `xlsx` con una libreria che inserisce immagini.
- **Piano 3: foto e spazio.** Foto con compressione e Storage RLS, miniature nella storia, indicatore dello spazio (totale progetto e quota utente), archiviazione .zip e liberazione dello spazio.

### Scostamenti dalla spec (decisi in fase di piano, da comunicare all'utente)

- **Niente link magico.** Il servizio email predefinito di Supabase invia solo agli indirizzi del team del progetto, al massimo 2 email l'ora ([Supabase docs](https://supabase.com/docs/guides/auth/auth-smtp), [changelog](https://supabase.com/changelog/29370-supabase-auth-changes-to-default-email-provider)). Quindi l'accesso è **solo email e password**, la conferma dell'email è disattivata e "Entra con Google" è rimandato.
- **Password dimenticata:** senza SMTP non c'è recupero via email. La procedura è documentata nel README: l'amministratore reimposta la password via SQL. Configurare un SMTP gratuito (es. Brevo) è un'opzione futura.

## Vincoli globali

- Interfaccia **in italiano**. Identificatori e nomi di tabella in italiano, come nel codice esistente (`rilevazioni`, `piante`, `trattamento`).
- `verbatimModuleSyntax` è attivo: gli import solo di tipo usano `import type`. Alias `@/` verso `src/`.
- Nuovi componenti UI con `npx shadcn@latest add <nome>` (stile base-nova già configurato in `components.json`).
- **Date di rilievo** come stringhe locali `AAAA-MM-GG`, **mai** `toISOString().slice(0,10)` (errore di fuso orario). **Ore** come `HH:MM`.
- Campi numerici con `inputMode="decimal"`: accettano **virgola e punto** come separatore decimale e mostrano la virgola.
- **Sempre online:** nessuna cache offline. Ogni salvataggio mostra l'esito (toast di successo o errore). In caso di errore i dati restano nel modulo, con la possibilità di riprovare.
- Ogni tabella di dominio ha `esperimento_id` e la policy RLS `is_membro(esperimento_id)`. I riferimenti tra tabelle di dominio usano **chiavi esterne composte** `(x_id, esperimento_id)`, così nessuna riga può puntare a un altro esperimento.
- Valori delle misure in `misure.valori jsonb`, con chiave `parametro_id` (testo uuid) e forma per tipo come in `src/domain/tipi.ts` (Task 2).
- Parametro con dati: **non** eliminabile e tipo **non** modificabile, imposto anche da un trigger nel DB.
- I test DB richiedono **Docker Desktop avviato** (`npx supabase start`). Se non è avviato, chiedere all'utente di avviarlo.
- **Non** fare merge su `main` e **non** fare deploy sopra la v2: la v2 resta online finché l'utente non decide.
- Tutto deve restare nei piani gratuiti: niente Edge Functions, niente servizi a pagamento.

## Focus di revisione

1. **Virgola decimale.** "24,5" digitato o dettato con Gboard deve salvare 24.5, mai 24 o 245. Il campo non deve "mangiarsi" la virgola mentre si scrive. Test in Task 1 (`parseNumero`) e Task 11 (`NumericField`).
2. **Doppio tocco e ritentativo dopo timeout.** Non devono creare misure duplicate. L'id della misura è generato dal client una volta per modulo e il salvataggio è un upsert per id; il pulsante è disabilitato durante il salvataggio. Test in Task 4 (`salvaMisura` usa upsert con id) e Task 13.
3. **Data di rilievo rimasta su ieri.** Il giorno dopo deve comparire un avviso ben visibile "non oggi" con il pulsante "Usa oggi". `oggiLocale()` deve essere corretto alle 00:30 ora locale. Test in Task 1 e Task 12.
4. **Etichetta pianta digitata in modo approssimativo.** " 35 ", "035" e "b3-12" devono trovare "35" e "B3-12". Un'etichetta inesistente dà un errore chiaro, senza creare nulla. Test in Task 7 (`trovaPianta`).
5. **Sessione scaduta o rete assente durante una passata.** Deve comparire un messaggio comprensibile e i dati devono restare nel modulo. Test in Task 4 (`messaggioErrore`).

---

## Struttura dei file

```
supabase/
  config.toml                         (npx supabase init)
  migrations/
    20261028000001_schema.sql         tabelle, FK composte, indici, trigger aggiornato_il e guardia parametri
    20261028000002_rls.sql            is_membro, policy, trigger membro proprietario
    20261028000003_inviti.sql         profili, inviti, is_admin, trigger su auth.users
    20261028000004_rpc.sql            crea_esperimento, riepilogo_esperimenti, parametri_con_dati, piante_con_dati
  tests/
    rls.test.sql  inviti.test.sql  rpc.test.sql
src/
  domain/   tipi.ts  trattamenti.ts  piante.ts  bozza.ts  misure.ts  modelli/hydrochar.ts  (+ *.test.ts)
  lib/      supabase.ts  date.ts  numeri.ts  errori.ts  (+ *.test.ts)  utils.ts (esistente)
  api/      mappers.ts  esperimenti.ts  configurazione.ts  misure.ts  auth.ts  inviti.ts  query.ts
  store/    campo.ts
  components/
    NumericField.tsx  (riscritto)   BannerData.tsx   AppShell.tsx   RequireAuth.tsx
    misura/   FormMisura.tsx  CampoNumero.tsx  CampoTesto.tsx  CampoSiNo.tsx  CampoLista.tsx
    config/   EditorParametro.tsx  EditorPassata.tsx  EditorFattori.tsx
  pages/
    Accedi.tsx  Registrati.tsx  Esperimenti.tsx  AdminInviti.tsx
    NuovoEsperimento.tsx  wizard/{PassoGenerale,PassoPiante,PassoParametri,PassoPassate,PassoRiepilogo}.tsx
    Campo.tsx  SchedaPianta.tsx  ModificaMisura.tsx  Impostazioni.tsx
  test/setup.ts
```

Route (Task 5):

| Route | Pagina |
|---|---|
| `/accedi`, `/registrati` | pubbliche |
| `/` | `Esperimenti` |
| `/esperimenti/nuovo` (`?da=<id>` duplica, `?modello=hydrochar`) | `NuovoEsperimento` |
| `/esperimenti/:espId` | `Campo` |
| `/esperimenti/:espId/piante/:piantaId` | `SchedaPianta` |
| `/esperimenti/:espId/misure/:misuraId` | `ModificaMisura` |
| `/esperimenti/:espId/impostazioni` | `Impostazioni` |
| `/admin/inviti` | `AdminInviti` |

---

### Task 1: Strumenti di test, date e numeri

**File:**
- Modifica: `package.json` (script `"test": "vitest run"`, `"test:db": "supabase test db"`), `vite.config.ts` (blocco `test`: `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `globals: false`)
- Crea: `src/test/setup.ts` (importa `@testing-library/jest-dom/vitest`), `src/lib/date.ts`, `src/lib/numeri.ts`
- Test: `src/lib/date.test.ts`, `src/lib/numeri.test.ts`

**Interfacce:**
- Produce: `oggiLocale(d?: Date): string` (`AAAA-MM-GG` locale) · `oraLocale(d?: Date): string` (`HH:MM`) · `formattaData(iso: string): string` (`28/10/2026`) · `parseNumero(raw: string): number | null` (`null` se vuoto, `NaN` se non valido) · `formattaNumero(n: number | null): string` (virgola decimale, `''` per null)

- [ ] **Passo 1: Installa** `npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom` e aggiorna `package.json` e `vite.config.ts` come sopra.
- [ ] **Passo 2: Scrivi i test che falliscono**

```ts
// date.test.ts
it('oggiLocale usa la data locale anche dopo mezzanotte', () => {
  expect(oggiLocale(new Date(2026, 9, 28, 0, 30))).toBe('2026-10-28')
  expect(oggiLocale(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27')
})
it('oraLocale', () => expect(oraLocale(new Date(2026, 9, 28, 9, 5))).toBe('09:05'))
it('formattaData', () => expect(formattaData('2026-10-28')).toBe('28/10/2026'))
// numeri.test.ts
it.each([['24,5', 24.5], ['24.5', 24.5], [' 7 ', 7], ['-3,5', -3.5], ['24,', 24], ['0', 0]])
  ('parseNumero(%s) = %s', (raw, n) => expect(parseNumero(raw)).toBe(n))
it('vuoto → null', () => { expect(parseNumero('')).toBeNull(); expect(parseNumero('  ')).toBeNull() })
it.each(['abc', '1,2,3', '12a', ','])('non valido %s → NaN', (raw) => expect(parseNumero(raw)).toBeNaN())
it('formattaNumero', () => { expect(formattaNumero(24.5)).toBe('24,5'); expect(formattaNumero(null)).toBe('') })
```

- [ ] **Passo 3:** `npm test` → FAIL (moduli mancanti).
- [ ] **Passo 4: Implementa** `date.ts` e `numeri.ts` con le firme indicate. `parseNumero` normalizza la virgola in punto e accetta solo `^-?\d+([.,]\d*)?$` dopo il trim.
- [ ] **Passo 5:** `npm test` → PASS.
- [ ] **Passo 6: Commit** `chore: vitest, utilità date e numeri`.

---

### Task 2: Schema del database e tipi di dominio

**File:**
- Crea: `supabase/` (`npx supabase init`, poi in `config.toml`: `[auth] enable_signup = true`, `[auth.email] enable_confirmations = false`), `supabase/migrations/20261028000001_schema.sql`, `src/domain/tipi.ts`
- Test: `supabase/tests/rpc.test.sql` (solo la parte della guardia, il resto in Task 3)
- Dipendenza: `npm i -D supabase`

**Interfacce:**
- Produce le tabelle (tutte con `id uuid primary key default gen_random_uuid()` tranne dove indicato, e `esperimento_id uuid not null references esperimenti(id) on delete cascade` sulle tabelle figlie):

```sql
esperimenti(id, nome text not null check (btrim(nome) <> ''), data_inizio date, note text not null default '',
  stato text not null default 'in_corso' check (stato in ('in_corso','concluso')),
  creato_da uuid not null default auth.uid() references auth.users(id), creato_il timestamptz not null default now())
fattori(id, esperimento_id, nome text not null, ordine int not null)
livelli(id, esperimento_id, fattore_id uuid not null, nome text not null, ordine int not null)
trattamenti(id, esperimento_id, etichetta text not null, ordine int not null, unique (esperimento_id, etichetta))
trattamento_livelli(esperimento_id, trattamento_id uuid, livello_id uuid, primary key (trattamento_id, livello_id))
piante(id, esperimento_id, trattamento_id uuid not null, etichetta text not null, blocco text, ordine int not null)
  + unique index (esperimento_id, lower(btrim(etichetta)))
parametri(id, esperimento_id, nome text not null, unita text, tipo text not null check (tipo in ('numero','testo','sino','lista')),
  ordine int not null, archiviato bool not null default false, progressivo bool not null default false,
  ricorda_tra_piante bool not null default false, n_letture int not null default 1 check (n_letture between 1 and 20),
  valore_min numeric, valore_max numeric, sotto_campi jsonb not null default '[]')
passate(id, esperimento_id, nome text not null, icona text, ordine int not null)
passata_parametri(esperimento_id, passata_id uuid, parametro_id uuid, obbligatorio bool not null default false,
  ordine int not null, primary key (passata_id, parametro_id))
misure(id uuid primary key, esperimento_id, pianta_id uuid not null, passata_id uuid not null, data_rilievo date not null,
  ora time(0) not null, valori jsonb not null default '{}', creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(), aggiornato_il timestamptz not null default now())
  + index (esperimento_id, data_rilievo), index (pianta_id)
```

  - `unique (id, esperimento_id)` su fattori, livelli, trattamenti, piante, parametri, passate. FK composte, tutte con il **default `no action`**, così la cancellazione a cascata di un esperimento resta possibile: livelli→fattori (cascade), trattamento_livelli→trattamenti e →livelli (cascade), piante→trattamenti, passata_parametri→passate e →parametri (cascade), misure→piante, misure→passate.
  - Trigger `aggiornato_il = now()` su update di `misure`.
  - Trigger `guardia_parametri` (before delete, before update of tipo, su `parametri`): se `exists (select 1 from misure where esperimento_id = old.esperimento_id and valori ? old.id::text)` allora `raise exception 'PARAMETRO_CON_DATI'`.
- Produce `src/domain/tipi.ts` (senza `esperimento_id`, che aggiunge il layer API):

```ts
export type TipoParametro = 'numero' | 'testo' | 'sino' | 'lista'
export interface SottoCampo { chiave: string; nome: string; unita: string | null }
export interface ElementoLista { n: number; valori: Record<string, number | null> }
export type ValoreParametro = (number | null)[] | string | boolean | null | ElementoLista[]
// numero → (number|null)[] di lunghezza n_letture · testo → string · sino → boolean|null · lista → ElementoLista[]
export type ValoriMisura = Record<string, ValoreParametro>
export interface Esperimento { id: string; nome: string; data_inizio: string | null; note: string; stato: 'in_corso' | 'concluso' }
export interface Livello { id: string; nome: string; ordine: number }
export interface Fattore { id: string; nome: string; ordine: number; livelli: Livello[] }
export interface Trattamento { id: string; etichetta: string; ordine: number; livello_ids: string[] }
export interface Pianta { id: string; trattamento_id: string; etichetta: string; blocco: string | null; ordine: number }
export interface Parametro { id: string; nome: string; unita: string | null; tipo: TipoParametro; ordine: number;
  archiviato: boolean; progressivo: boolean; ricorda_tra_piante: boolean; n_letture: number;
  valore_min: number | null; valore_max: number | null; sotto_campi: SottoCampo[] }
export interface PassataParametro { parametro_id: string; obbligatorio: boolean; ordine: number }
export interface Passata { id: string; nome: string; icona: string | null; ordine: number; parametri: PassataParametro[] }
export interface ConfigEsperimento { esperimento: Esperimento; fattori: Fattore[]; trattamenti: Trattamento[];
  piante: Pianta[]; parametri: Parametro[]; passate: Passata[] }
export type BozzaEsperimento = ConfigEsperimento   // stessa forma; ids generati dal client con crypto.randomUUID()
export interface Misura { id: string; pianta_id: string; passata_id: string; data_rilievo: string; ora: string; valori: ValoriMisura }
```

- [ ] **Passo 1:** avvia lo stack locale con `npx supabase start` (Docker Desktop deve essere avviato) e annota URL e anon key da `npx supabase status` in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; il file è già escluso da `*.local`).
- [ ] **Passo 2: Test che fallisce** in `supabase/tests/rpc.test.sql` (pgTAP, `begin; create extension if not exists pgtap with schema extensions; select plan(n); … select * from finish(); rollback;`, stessa intestazione in tutti i file di test). Da superuser crea un esperimento, un parametro P e una misura con `valori = {"<P>": [12]}`, poi:
  - `throws_ok('delete from parametri where id = P', 'PARAMETRO_CON_DATI')`
  - `throws_ok('update parametri set tipo = ''testo'' where id = P', 'PARAMETRO_CON_DATI')`
  - `lives_ok` sul delete di un parametro senza dati
  - `throws_ok` (codice `23503`) su una misura che usa `pianta_id` di un altro esperimento
- [ ] **Passo 3:** `npx supabase test db` → FAIL (tabelle mancanti).
- [ ] **Passo 4: Scrivi** la migration `…0001_schema.sql` e `tipi.ts`.
- [ ] **Passo 5:** `npx supabase db reset && npx supabase test db` → PASS. `npx tsc -b` → nessun errore.
- [ ] **Passo 6: Commit** `feat(db): schema v3 con FK composte e guardia parametri`.

---

### Task 3: RLS, inviti, profili e RPC

**File:**
- Crea: `supabase/migrations/20261028000002_rls.sql`, `…0003_inviti.sql`, `…0004_rpc.sql`
- Test: `supabase/tests/rls.test.sql`, `supabase/tests/inviti.test.sql`, aggiunte a `supabase/tests/rpc.test.sql`

**Interfacce:**
- Consuma: tabelle del Task 2.
- Produce:
  - `membri_esperimento(esperimento_id uuid references esperimenti on delete cascade, utente_id uuid references auth.users, ruolo text not null default 'proprietario' check (ruolo in ('proprietario','collaboratore')), primary key (esperimento_id, utente_id))`
  - `is_membro(p uuid) returns boolean`: `security definer`, `stable`, `set search_path = ''`
  - Trigger after insert su `esperimenti` (security definer): inserisce `(new.id, auth.uid(), 'proprietario')` in `membri_esperimento`.
  - **Policy:**
    - `esperimenti`: select, update e delete `using (is_membro(id))`; insert `with check (creato_da = auth.uid())`
    - ogni tabella figlia (incluse `misure` e `passata_parametri`): `for all to authenticated using (is_membro(esperimento_id)) with check (is_membro(esperimento_id))`
    - `membri_esperimento`: solo select `using (utente_id = auth.uid())`
  - `profili(id uuid primary key references auth.users on delete cascade, email text not null, admin bool not null default false)`, con select solo della propria riga e nessuna policy di scrittura.
  - `inviti(id, email text not null, creato_il timestamptz default now(), usato_il timestamptz)` con unique index su `lower(email)` e policy `for all using (is_admin()) with check (is_admin())`.
  - `is_admin() returns boolean`: security definer, stable.
  - Trigger **before insert on auth.users** `verifica_invito()`: se non esiste un invito con `lower(email) = lower(new.email)` e `usato_il is null`, allora `raise exception 'INVITO_MANCANTE'`.
  - Trigger **after insert on auth.users**: inserisce `profili(id, email)` e aggiorna `inviti.usato_il = now()`.
  - RPC (security invoker, `grant execute to authenticated`):
    - `crea_esperimento(bozza jsonb) returns uuid`: inserisce esperimento, fattori, livelli, trattamenti, trattamento_livelli, piante, parametri, passate, passata_parametri usando gli id della bozza, in una sola transazione. La forma di `bozza` è `BozzaEsperimento` serializzato: `fattori[].livelli[]` annidati, `trattamenti[].livello_ids`, `passate[].parametri[]`.
    - `riepilogo_esperimenti() returns table(id uuid, nome text, stato text, data_inizio date, n_piante int, n_trattamenti int, ultima_data date, piante_ultima_data int)`, ordinato per `creato_il desc`. `piante_ultima_data` = numero di piante distinte con almeno una misura in `ultima_data`.
    - `parametri_con_dati(p_esperimento uuid) returns setof uuid`, cioè le chiavi distinte di `valori`
    - `piante_con_dati(p_esperimento uuid) returns setof uuid`

- [ ] **Passo 1: Test che falliscono.**
  - **Helper nei test:** da superuser inserisci gli inviti, poi gli utenti in `auth.users (id, email, aud, role, instance_id)`. Per impersonare un utente: `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role', 'authenticated')::text, true);`.
  - `inviti.test.sql`:
    - insert in `auth.users` senza invito → `throws_ok … 'INVITO_MANCANTE'`
    - con invito → `lives_ok`, il profilo esiste e `inviti.usato_il` non è null
    - un secondo utente con la stessa email invitata (invito già usato) → `throws_ok`
    - utente non admin: `select count(*) from inviti` = 0 e l'insert in `inviti` fallisce (`42501`)
    - admin: l'insert riesce
  - `rls.test.sql` (utenti A e B; A crea un esperimento con `crea_esperimento` e una bozza minima: 1 fattore, 1 livello, 1 trattamento, 1 pianta, 1 parametro, 1 passata):
    - A vede 1 riga in `esperimenti`, `piante` e `parametri`; B ne vede 0
    - B `update piante set etichetta='x'` → 0 righe toccate
    - B: insert in `misure` con `esperimento_id` di A → `throws_ok` (`42501`)
    - B crea un proprio esperimento e inserisce una misura con il proprio `esperimento_id` ma la `pianta_id` di A → `throws_ok` (`23503`)
    - A vede la propria riga in `membri_esperimento`, B non la vede
  - `rpc.test.sql`:
    - `crea_esperimento` con una bozza in cui due piante hanno la stessa etichetta ("1" e " 1") → `throws_ok` (`23505`), e nessuna riga di quell'esperimento resta (atomicità)
    - `riepilogo_esperimenti()` per A dopo 2 misure su piante diverse nella stessa data → `piante_ultima_data = 2`
    - `parametri_con_dati` restituisce l'id del parametro usato
- [ ] **Passo 2:** `npx supabase test db` → FAIL.
- [ ] **Passo 3: Scrivi** le tre migration.
- [ ] **Passo 4:** `npx supabase db reset && npx supabase test db` → tutti PASS.
- [ ] **Passo 5: Commit** `feat(db): RLS per membro, inviti obbligatori, RPC crea_esperimento e riepilogo`.

---

### Task 4: Client Supabase, layer API, messaggi d'errore

**File:**
- Crea: `src/lib/supabase.ts`, `src/lib/errori.ts`, `src/api/mappers.ts`, `src/api/esperimenti.ts`, `src/api/configurazione.ts`, `src/api/misure.ts`, `src/api/auth.ts`, `src/api/inviti.ts`, `src/api/query.ts`
- Test: `src/lib/errori.test.ts`, `src/api/mappers.test.ts`, `src/api/misure.test.ts`
- Dipendenza: `npm i @tanstack/react-query`

**Interfacce:**
- Consuma: `tipi.ts`, RPC del Task 3.
- Produce (tutte le funzioni API sono `async` e **lanciano** l'errore di Supabase se presente):
  - `supabase` (client, da `import.meta.env.VITE_SUPABASE_*`)
  - `messaggioErrore(e: unknown): string`
  - `mappers.ts`: `daRigheConfig(righe): ConfigEsperimento`, `daRigaMisura(r): Misura` (che riduce `ora` da `HH:MM:SS` a `HH:MM`), `aRigaMisura(espId: string, m: Misura)`
  - `esperimenti.ts`: `listaEsperimenti(): Promise<RiepilogoEsperimento[]>`, `caricaConfig(espId): Promise<ConfigEsperimento>`, `creaEsperimento(b: BozzaEsperimento): Promise<string>`, `aggiornaEsperimento(espId, patch: Partial<Omit<Esperimento,'id'>>): Promise<void>`. Esporta `interface RiepilogoEsperimento` con i campi della RPC.
  - `configurazione.ts`: `salvaParametro(espId, p: Parametro)` (upsert), `eliminaOArchiviaParametro(espId, p): Promise<'eliminato' | 'archiviato'>` (usa `parametriConDati`), `salvaPassata(espId, p: Passata)` (upsert della passata, poi sostituzione di `passata_parametri`), `eliminaPassata(id)`, `aggiungiPiante(espId, piante: Pianta[])`, `aggiornaPianta(espId, p: Pianta)`, `eliminaPianta(id)`, `aggiornaTrattamento(id, etichetta)`, `parametriConDati(espId): Promise<Set<string>>`, `pianteConDati(espId): Promise<Set<string>>`
  - `misure.ts`: `misureDelGiorno(espId, data): Promise<Misura[]>`, `misurePianta(piantaId): Promise<Misura[]>`, `caricaMisura(id): Promise<Misura>`, `salvaMisura(espId, m: Misura): Promise<void>` (**`upsert` con `onConflict: 'id'`**), `eliminaMisura(id): Promise<void>`
  - `auth.ts`: `accedi(email, password)`, `registrati(email, password)`, `esci()`, `useSessione(): { sessione: Session | null; caricamento: boolean }`
  - `inviti.ts`: esporta `interface Invito { id: string; email: string; creato_il: string; usato_il: string | null }`, `sonoAdmin(): Promise<boolean>`, `listaInviti(): Promise<Invito[]>`, `creaInvito(email)`, `revocaInvito(id)`
  - `query.ts`: chiavi `chiavi.esperimenti`, `chiavi.config(espId)`, `chiavi.misureGiorno(espId, data)`, `chiavi.misurePianta(piantaId)`, `chiavi.inviti`, più gli hook `useEsperimenti()`, `useConfig(espId)`, `useMisureGiorno(espId, data)`, `useMisurePianta(piantaId)`, `useSonoAdmin()`
- Testi esatti di `messaggioErrore`:

| Condizione | Messaggio |
|---|---|
| `navigator.onLine === false` | `Nessuna connessione: i dati non sono stati salvati. Riprova quando torna la rete.` |
| messaggio contiene `Failed to fetch`, `NetworkError` o `Load failed` | `Il server non risponde. Se l'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).` |
| `code === 'PGRST301'`, `status === 401` o messaggio con `JWT expired` | `Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.` |
| `Invalid login credentials` | `Email o password errate.` |
| `Database error saving new user` | `Questa email non ha un invito valido. Chiedi un invito all'amministratore.` |
| `User already registered` | `Esiste già un account con questa email: accedi.` |
| contiene `PARAMETRO_CON_DATI` | `Questo parametro ha già dei dati: non si può eliminare né cambiarne il tipo. Puoi archiviarlo.` |
| `code === '23505'` | `Esiste già un elemento con questo nome o etichetta.` |
| `code === '23503'` | `Questo elemento ha dati collegati e non può essere eliminato.` |
| altro | `Errore imprevisto: <message>` |

- [ ] **Passo 1: Test che falliscono.**
  - `errori.test.ts`: un `it` per ogni riga della tabella. `navigator.onLine` è simulato con `vi.spyOn(navigator, 'onLine', 'get')`.
  - `mappers.test.ts`: `daRigaMisura({…, ora: '09:12:00'}).ora === '09:12'`. `aRigaMisura('E', m)` contiene `esperimento_id: 'E'` e lo stesso `id` di `m`.
  - `misure.test.ts`: con `vi.mock('@/lib/supabase')` verifica che `salvaMisura` chiami `from('misure').upsert(riga, { onConflict: 'id' })` e che lanci l'eccezione se `error` è valorizzato.
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa** i file elencati. `caricaConfig` legge con una select annidata o con query parallele e ordina tutto per `ordine`.
- [ ] **Passo 4:** `npm test` → PASS. `npx tsc -b` → OK.
- [ ] **Passo 5: Commit** `feat(api): client Supabase, layer API e messaggi d'errore`.

---

### Task 5: Accesso, guscio dell'app e routing

**File:**
- Crea: `src/pages/Accedi.tsx`, `src/pages/Registrati.tsx`, `src/components/RequireAuth.tsx`, `src/components/AppShell.tsx`
- Modifica: `src/main.tsx` (`QueryClientProvider`, `<Toaster />` da sonner), `src/App.tsx` (route della tabella sopra; per le pagine non ancora scritte un segnaposto `<p>In costruzione</p>`)
- UI: `npx shadcn@latest add sonner dialog switch`

**Interfacce:**
- Consuma: `accedi`, `registrati`, `esci`, `useSessione`, `useSonoAdmin`, `messaggioErrore`.
- Produce: `<RequireAuth>` (reindirizza a `/accedi` se non c'è sessione e mostra uno spinner durante il caricamento) e `<AppShell titolo indietro?: string azioni?: ReactNode>` (header con titolo, freccia indietro opzionale, menu con email, "Inviti" se admin, "Esci").

- [ ] **Passo 1: Implementa le pagine.**
  - `Accedi`: email, password e "Accedi". Gli errori si mostrano sotto il modulo con `messaggioErrore`. Il link "Non hai un account? Registrati (serve un invito)" porta a `/registrati`. "Password dimenticata?" apre un testo: `Chiedi all'amministratore di reimpostarla.`
  - `Registrati`: email, password (minimo 8 caratteri), conferma password. Se le password non coincidono: `Le password non coincidono.` Se la registrazione riesce, naviga a `/`.
- [ ] **Passo 2: Verifica nel browser** (`npm run dev` più Supabase locale, usando un invito inserito via SQL in Studio su `http://127.0.0.1:54323`):
  - registrazione con un'email non invitata → messaggio "Questa email non ha un invito valido…"
  - con un'email invitata → si entra in `/`
  - "Esci" → torna su `/accedi`
  - aprire `/esperimenti/x` senza sessione → reindirizza a `/accedi`
- [ ] **Passo 3:** `npm run build` → OK.
- [ ] **Passo 4: Commit** `feat: accesso, registrazione su invito, guscio e routing`.

---

### Task 6: Pagina inviti (amministratore)

**File:**
- Crea: `src/pages/AdminInviti.tsx`

**Interfacce:**
- Consuma: `listaInviti`, `creaInvito`, `revocaInvito`, `useSonoAdmin`.

- [ ] **Passo 1: Implementa la pagina.**
  - Se l'utente non è admin: `Questa pagina è riservata all'amministratore.`
  - Campo email e pulsante "Invita".
  - Elenco degli inviti con email e stato (`In attesa` oppure `Registrato il 28/10/2026`). Per gli inviti in attesa ci sono "Revoca" (con conferma) e "Copia messaggio", che copia negli appunti: `Ciao! Ti ho invitato su FastLab. Registrati qui: <origin>/registrati usando l'email <email>.` (nessun dato personale nell'URL).
- [ ] **Passo 2: Verifica nel browser** con un utente impostato `admin = true` via SQL: invita, copia, revoca. Con un utente non admin la voce "Inviti" non compare nel menu e la pagina mostra il messaggio di accesso negato.
- [ ] **Passo 3: Commit** `feat: gestione inviti per l'amministratore`.

---

### Task 7: Logica di dominio della configurazione

**File:**
- Crea: `src/domain/trattamenti.ts`, `src/domain/piante.ts`, `src/domain/bozza.ts`, `src/domain/modelli/hydrochar.ts`
- Test: `src/domain/trattamenti.test.ts`, `piante.test.ts`, `bozza.test.ts`, `modelli/hydrochar.test.ts`

**Interfacce:**
- Produce:
  - `generaTrattamenti(fattori: Fattore[]): Trattamento[]`: prodotto cartesiano in cui il primo fattore varia più lentamente. `etichetta` = nomi dei livelli uniti da `' + '`, `ordine` da 0. Con zero fattori restituisce `[]`.
  - `generaPiante(righe: { trattamento_id: string; n: number }[], inizio = 1): Pianta[]`: etichette `String(inizio + i)` in sequenza, `blocco: null`.
  - `trovaPianta(piante: Pianta[], input: string): Pianta | null`
  - `piantaSuccessiva(piante: Pianta[], piantaId: string): Pianta | null`, per `ordine`
  - `etichetteNumeriche(piante: Pianta[]): boolean`, vero se tutte rispettano `^\d+$`
  - `prossimaEtichetta(piante: Pianta[]): number`, cioè il massimo numerico + 1 (1 se non ce ne sono)
  - `bozzaVuota(): BozzaEsperimento`
  - `clonaConfig(c: ConfigEsperimento): BozzaEsperimento`
  - `validaBozza(b: BozzaEsperimento): string[]`
  - `bozzaHydrochar(): BozzaEsperimento`

- [ ] **Passo 1: Test che falliscono**

```ts
// trattamenti.test.ts
const stress = fattore('Stress', ['Controllo', 'S1']); const hc = fattore('Hydrochar', ['No', 'Sì'])
it('prodotto cartesiano, primo fattore più lento', () => {
  expect(generaTrattamenti([stress, hc]).map(t => t.etichetta))
    .toEqual(['Controllo + No', 'Controllo + Sì', 'S1 + No', 'S1 + Sì'])
  expect(generaTrattamenti([stress, hc])[1].livello_ids).toEqual([stress.livelli[0].id, hc.livelli[1].id])
})
it('un solo fattore', () => expect(generaTrattamenti([stress])).toHaveLength(2))
it('nessun fattore', () => expect(generaTrattamenti([])).toEqual([]))
// piante.test.ts
it('generaPiante numera in sequenza', () =>
  expect(generaPiante([{ trattamento_id: 'a', n: 2 }, { trattamento_id: 'b', n: 1 }], 101).map(p => [p.etichetta, p.trattamento_id]))
    .toEqual([['101', 'a'], ['102', 'a'], ['103', 'b']]))
it.each([[' 35 ', '35'], ['035', '35'], ['b3-12', 'B3-12']])('trovaPianta(%s) → %s', (input, etichetta) =>
  expect(trovaPianta(piante(['35', 'B3-12']), input)?.etichetta).toBe(etichetta))
it('trovaPianta inesistente → null', () => expect(trovaPianta(piante(['35']), '99')).toBeNull())
it('piantaSuccessiva', () => { /* ultima → null; altrimenti la prossima per ordine */ })
it('prossimaEtichetta', () => expect(prossimaEtichetta(piante(['1', '7', 'B3']))).toBe(8))
// bozza.test.ts
it('validaBozza segnala gli errori', () => {
  const b = bozzaVuota()
  expect(validaBozza(b)).toEqual(expect.arrayContaining([
    'Dai un nome all\'esperimento.', 'Crea almeno un trattamento.', 'Aggiungi almeno una pianta.',
    'Aggiungi almeno un parametro.', 'Crea almeno una passata.']))
})
it('etichette pianta duplicate (anche con spazi o maiuscole)', () =>
  expect(validaBozza(conPiante(['A1', ' a1']))).toContain('Etichetta pianta duplicata: "a1".'))
it('lista senza sotto-campi, min > max, passata vuota', () => { /* 'Il parametro "Palchi" deve avere almeno un sotto-campo.',
  'Il parametro "Altezza" ha il minimo maggiore del massimo.', 'La passata "SPAD" non ha parametri.' */ })
it('clonaConfig genera id nuovi e rimappa i riferimenti', () => {
  const c = configDiEsempio(); const b = clonaConfig(c)
  expect(b.esperimento.nome).toBe(`Copia di ${c.esperimento.nome}`)
  expect(b.esperimento.id).not.toBe(c.esperimento.id)
  const ids = new Set(b.trattamenti.map(t => t.id)); expect(b.piante.every(p => ids.has(p.trattamento_id))).toBe(true)
  const par = new Set(b.parametri.map(p => p.id)); expect(b.passate.flatMap(p => p.parametri).every(pp => par.has(pp.parametro_id))).toBe(true)
  expect(b.parametri.some(p => p.archiviato)).toBe(false)   // gli archiviati non si copiano
  expect(validaBozza(b)).toEqual([])
})
// modelli/hydrochar.test.ts
it('modello Hydrochar', () => {
  const b = bozzaHydrochar()
  expect(validaBozza(b)).toEqual([])
  expect(b.piante).toHaveLength(56)
  expect(b.trattamenti.map(t => t.etichetta)).toEqual(
    ['Controllo', 'Controllo + HC', 'S1', 'S1 + HC', 'W1', 'W1 + HC', 'S1W1', 'S1W1 + HC'])
  const tratt = (et: string) => b.trattamenti.find(t => t.id === b.piante.find(p => p.etichetta === et)!.trattamento_id)!.etichetta
  expect([tratt('14'), tratt('15'), tratt('21'), tratt('56')]).toEqual(['Controllo', 'Controllo + HC', 'S1', 'S1W1 + HC'])
  expect(b.passate.map(p => p.nome)).toEqual(['Termometro', 'SPAD', 'Altezza', 'Fenologici'])
  const par = (n: string) => b.parametri.find(p => p.nome === n)!
  expect(par('Palchi').progressivo && par('Infiorescenze').progressivo && par('N palchi totali').progressivo).toBe(true)
  expect(par('Temp aria').ricorda_tra_piante).toBe(true)
})
```

- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa.**
  - `trovaPianta`: confronto esatto su `trim` e minuscole. Se non trova nulla e l'input è numerico, confronta per valore numerico con le etichette numeriche.
  - **Contenuto di `bozzaHydrochar`:**
    - fattori Stress `[Controllo, S1, W1, S1W1]` e Hydrochar `[No, Sì]`
    - trattamenti e piante: 14 piante per Controllo e 6 per ciascuno degli altri trattamenti, etichette da 1 a 56 in quest'ordine (come `src/data/piante.ts`)
    - **parametri:**
      - Temp aria (°C), con ricorda tra piante
      - Temp pianta (°C)
      - SPAD
      - Altezza (cm)
      - N palchi totali, progressivo
      - N fiori fioriti
      - N frutti
      - N frutti invaiati
      - Palchi: lista, sotto-campo "N foglie", progressivo
      - Infiorescenze: lista, sotto-campo "N fiori", progressivo
      - Note: testo
    - **passate:**
      - 🌡 Termometro: Temp aria, Temp pianta
      - 💚 SPAD: SPAD
      - 📏 Altezza: Altezza
      - 🌱 Fenologici: Altezza, N palchi totali, N fiori fioriti, N frutti, N frutti invaiati, Palchi, Infiorescenze, Note
    - nessun parametro obbligatorio
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Commit** `feat(domain): trattamenti, piante, bozza, modello Hydrochar`.

---

### Task 8: Creazione guidata dell'esperimento

**File:**
- Crea: `src/pages/NuovoEsperimento.tsx`, `src/pages/wizard/PassoGenerale.tsx`, `PassoPiante.tsx`, `PassoParametri.tsx`, `PassoPassate.tsx`, `PassoRiepilogo.tsx`, `src/components/config/EditorFattori.tsx`, `EditorParametro.tsx`, `EditorPassata.tsx`
- Test: `src/components/config/EditorParametro.test.tsx`

**Interfacce:**
- Consuma: `bozzaVuota`, `clonaConfig`, `bozzaHydrochar`, `generaTrattamenti`, `generaPiante`, `validaBozza`, `creaEsperimento`, `caricaConfig`.
- Produce (riusati in Task 15):
  - `<EditorParametro valore: Parametro onChange(p: Parametro) tipoBloccato?: boolean />`
  - `<EditorPassata valore: Passata parametri: Parametro[] onChange(p: Passata) />`
  - `<EditorFattori valore: Fattore[] onChange(f: Fattore[]) />`

- [ ] **Passo 1: Test che falliscono** (`EditorParametro.test.tsx`, RTL):
  - con tipo `numero` sono visibili i campi "Unità", "Letture per misura", "Minimo", "Massimo" e gli interruttori "Progressivo" e "Ricorda tra piante"
  - con tipo `lista` sono visibili "Sotto-campi" (con "+ Sotto-campo") e "Progressivo", ma non "Minimo" né "Ricorda tra piante"
  - con tipo `testo` o `sino` non compare nessuna opzione extra
  - `tipoBloccato` → il selettore del tipo è disabilitato e mostra `Il tipo non si può cambiare: ci sono già dati.`
  - aggiungendo un sotto-campo, `onChange` riceve `sotto_campi` con una `chiave` nuova non vuota
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa i componenti e le pagine.**
  - `NuovoEsperimento` tiene la `BozzaEsperimento` in `useState` e la inizializza così: con `?modello=hydrochar` da `bozzaHydrochar()`, con `?da=<id>` da `clonaConfig(await caricaConfig(id))`, altrimenti da `bozzaVuota()`.
  - Passi: 1 Generale, 2 Fattori e piante, 3 Parametri, 4 Passate, 5 Riepilogo, con i pulsanti Avanti e Indietro.
  - `PassoPiante`:
    - `EditorFattori` con le chip dei livelli
    - "Genera trattamenti" → tabella con inclusione (checkbox), etichetta modificabile e "N piante"
    - "Genera piante" → elenco con etichetta e blocco modificabili e il campo "Numerazione da" (default 1)
    - se si rigenera e ci sono già piante, chiedere conferma: `Rigenerare le piante? Le etichette modificate andranno perse.`
  - `EditorPassata`: nome, icona (campo testo per un'emoji), elenco di tutti i parametri non archiviati con due interruttori per riga, "Incluso" e "Obbligatorio" (il secondo è attivo solo se il primo è acceso), e l'ordine con le frecce su e giù.
  - `PassoRiepilogo` mostra il conteggio di trattamenti, piante, parametri e passate e l'elenco di `validaBozza`. "Crea esperimento" è disabilitato finché ci sono errori; se va a buon fine naviga a `/esperimenti/:id`, altrimenti mostra un toast con `messaggioErrore`.
  - **Primo passo, bozza vuota:** offrire i pulsanti "Parti dal modello Hydrochar" e "Parti da zero".
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Verifica nel browser.**
  - creare un esperimento da zero: 1 fattore con 3 livelli, 2 piante per trattamento, numerazione da 101, 2 parametri, 1 passata → appare su `/esperimenti/:id`
  - creare dal modello Hydrochar → 56 piante
  - duplicare (`?da=`) → il riepilogo mostra "Copia di …"
- [ ] **Passo 6: Commit** `feat: creazione guidata, duplicazione e modello Hydrochar`.

---

### Task 9: Pagina "I miei esperimenti"

**File:**
- Crea: `src/pages/Esperimenti.tsx`

**Interfacce:**
- Consuma: `useEsperimenti()` (`RiepilogoEsperimento[]`).

- [ ] **Passo 1: Implementa la pagina.**
  - **Card per esperimento:**
    - nome
    - `<n_piante> piante · <n_trattamenti> trattamenti · in corso|concluso`
    - riga `Ultimo rilievo: <oggi|ieri|28/10/2026>, <piante_ultima_data>/<n_piante> piante` (assente se non ci sono misure)
    - tap → `/esperimenti/:id`
    - menu ⋯ con "Duplica" → `/esperimenti/nuovo?da=:id`
  - Pulsante "+ Nuovo esperimento".
  - Stato vuoto: `Non hai ancora esperimenti.` con i pulsanti "Crea esperimento" e "Usa il modello Hydrochar".
- [ ] **Passo 2: Verifica nel browser:** la lista mostra gli esperimenti del Task 8; un secondo utente non li vede.
- [ ] **Passo 3: Commit** `feat: pagina I miei esperimenti`.

---

### Task 10: Logica di dominio delle misure

**File:**
- Crea: `src/domain/misure.ts`
- Test: `src/domain/misure.test.ts`

**Interfacce:**
- Consuma: `tipi.ts`.
- Produce:
  - `valoreVuoto(p: Parametro): ValoreParametro`: numero → `Array(n_letture).fill(null)`, testo → `''`, sino → `null`, lista → `[]`
  - `eVuoto(p: Parametro, v: ValoreParametro | undefined): boolean`
  - `ultimoValore(misure: Misura[], parametroId: string, finoA: string, escludiId?: string): ValoreParametro | undefined`: il valore non vuoto più recente per `(data_rilievo, ora)` con `data_rilievo <= finoA`, restituito come copia profonda
  - `valoriIniziali(a: { parametri: Parametro[]; misurePianta: Misura[]; dataRilievo: string; ricordati: ValoriMisura }): ValoriMisura`
  - `validaMisura(parametri: Parametro[], obbligatori: Set<string>, valori: ValoriMisura): { errori: string[]; avvisi: string[] }`
  - `contaPerPianta(misure: Misura[], passataId: string): Map<string, number>`
  - `raggruppaStoria(misure: Misura[]): { data: string; misure: Misura[] }[]`: date decrescenti, ore crescenti all'interno della data
  - `formattaValore(p: Parametro, v: ValoreParametro | undefined): string`

- [ ] **Passo 1: Test che falliscono**

```ts
it('valoriIniziali: progressivo riprende l\'ultimo valore della pianta, non quelli futuri', () => {
  const misure = [mis('2026-10-14', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 5 } }] }),
                  mis('2026-10-21', '10:00', { [palchi.id]: [{ n: 1, valori: { f: 6 } }, { n: 2, valori: { f: 3 } }] }),
                  mis('2026-10-28', '09:00', { [palchi.id]: [] })]           // vuoto: ignorato
  const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: '2026-10-27', ricordati: {} })
  expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 6 } }, { n: 2, valori: { f: 3 } }])
  ;(v[palchi.id] as ElementoLista[])[0].valori.f = 99
  expect((misure[1].valori[palchi.id] as ElementoLista[])[0].valori.f).toBe(6)   // copia profonda
})
it('valoriIniziali: ricorda tra piante e vuoti', () => {
  const v = valoriIniziali({ parametri: [tempAria, spad3], misurePianta: [], dataRilievo: D, ricordati: { [tempAria.id]: [24.5] } })
  expect(v).toEqual({ [tempAria.id]: [24.5], [spad3.id]: [null, null, null] })
})
it('validaMisura', () => {
  const r = validaMisura([altezza /*min 0 max 120*/, note], new Set([altezza.id]), { [altezza.id]: [null], [note.id]: '' })
  expect(r.errori).toEqual(['«Altezza» è obbligatorio.'])
  expect(validaMisura([altezza], new Set(), { [altezza.id]: [150] }).avvisi)
    .toEqual(['«Altezza» = 150 cm è fuori dall\'intervallo atteso (0–120).'])
  expect(validaMisura([spad3], new Set(), { [spad3.id]: [40, NaN, null] }).errori)
    .toEqual(['«SPAD» lettura 2: numero non valido.'])
  expect(validaMisura([altezza, note], new Set(), { [altezza.id]: [null], [note.id]: '  ' }).errori)
    .toEqual(['Nessun valore inserito.'])
})
it('contaPerPianta conta solo la passata indicata', () => { /* 2 misure P1 Termometro + 1 P1 SPAD → Map{P1→2} */ })
it('raggruppaStoria', () => { /* date desc, ore asc */ })
it('formattaValore', () => {
  expect(formattaValore(spad3, [40.1, 41, null])).toBe('40,1 / 41')
  expect(formattaValore(altezza, [42])).toBe('42 cm')
  expect(formattaValore(siNo, true)).toBe('Sì')
  expect(formattaValore(palchi, [{ n: 1, valori: { f: 12 } }, { n: 2, valori: { f: 10 } }])).toBe('2 (12, 10)')
  expect(formattaValore(listaDueCampi, [{ n: 1, valori: { a: 1, b: 2 } }])).toBe('1 elementi')
  expect(formattaValore(altezza, undefined)).toBe('—')
})
```

- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa** `misure.ts`.
  - `valoriIniziali` usa questa precedenza: progressivo (`ultimoValore`), poi ricorda tra piante (`ricordati`), poi `valoreVuoto`.
  - L'avviso min/max va calcolato per ogni lettura.
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Commit** `feat(domain): valori iniziali, validazione e storia delle misure`.

---

### Task 11: Campi del modulo di misura

**File:**
- Modifica (riscrittura): `src/components/NumericField.tsx`
- Crea: `src/components/misura/FormMisura.tsx`, `CampoNumero.tsx`, `CampoTesto.tsx`, `CampoSiNo.tsx`, `CampoLista.tsx`
- Test: `src/components/NumericField.test.tsx`, `src/components/misura/CampoLista.test.tsx`

**Interfacce:**
- Consuma: `parseNumero`, `formattaNumero`, `tipi.ts`.
- Produce:
  - `<NumericField label value: number | null onChange(v: number | null) avviso?: string placeholder? />`. Tiene il testo localmente, propaga `parseNumero(testo)` (che può essere `NaN`) e si riallinea solo quando `value` cambia dall'esterno.
  - `<FormMisura parametri: Parametro[] obbligatori: Set<string> valori: ValoriMisura onChange(v: ValoriMisura) />`. Delega a `CampoNumero` (N campi se `n_letture > 1`, con l'etichetta `SPAD · lettura 1`), `CampoTesto`, `CampoSiNo` (due pulsanti grandi Sì/No, ritoccando quello attivo si torna a `null`) e `CampoLista`. I parametri obbligatori hanno un asterisco.
  - `<CampoLista parametro valore: ElementoLista[] onChange />`: righe numerate (`Palchi 1`, `Palchi 2` …) con un `NumericField` per sotto-campo, "+ <nome>" che aggiunge l'elemento `n = length + 1`, e "Rimuovi ultimo".

- [ ] **Passo 1: Test che falliscono**
  - `NumericField`:
    - digitando `2`, `4`, `,`, `5` l'input mostra `24,5` e l'ultimo `onChange` riceve `24.5`
    - digitando `abc` l'ultimo `onChange` riceve `NaN`
    - con il rerender di `value={30}` l'input mostra `30`
    - `inputMode` è `decimal`
  - `CampoLista`:
    - "+ Palchi" due volte, poi `12` nel primo campo → `onChange` con `[{ n: 1, valori: { f: 12 } }, { n: 2, valori: { f: null } }]`
    - "Rimuovi ultimo" → resta 1 elemento
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa i componenti.** Lo stile di `NumericField` resta `text-lg h-12`, come oggi.
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Commit** `feat: campi del modulo di misura con virgola decimale e liste ripetute`.

---

### Task 12: Schermata in campo

**File:**
- Crea: `src/store/campo.ts`, `src/components/BannerData.tsx`, `src/pages/Campo.tsx`
- Test: `src/store/campo.test.ts`, `src/components/BannerData.test.tsx`

**Interfacce:**
- Consuma: `useConfig`, `useMisureGiorno`, `contaPerPianta`, `trovaPianta`, `etichetteNumeriche`, `oggiLocale`, `formattaData`.
- Produce:
  - `useCampoStore` (Zustand `persist`, chiave `fastlab-campo`, localStorage): `stato: Record<espId, { passataId: string | null; dataRilievo: string; ricordati: ValoriMisura }>`, `dati(espId): { passataId; dataRilievo; ricordati }` (default `{ null, oggiLocale(), {} }`), `setPassata(espId, id)`, `setData(espId, data)`, `ricorda(espId, parametri: Parametro[], valori: ValoriMisura)`. Quest'ultima salva solo i parametri con `ricorda_tra_piante`.
  - `<BannerData espId />`: se `dataRilievo !== oggiLocale()` mostra `⚠ Stai registrando con data <formattaData>, non oggi.` e il pulsante "Usa oggi"; altrimenti non mostra nulla.

- [ ] **Passo 1: Test che falliscono.**
  - store: `dati('E').dataRilievo === oggiLocale()` di default; `setData('E', '2026-10-27')` persiste; `ricorda` ignora i parametri senza `ricorda_tra_piante`.
  - banner: con `vi.setSystemTime(new Date(2026, 9, 28, 8, 0))` e data `2026-10-27` il testo contiene `27/10/2026, non oggi`; "Usa oggi" → la data diventa `2026-10-28` e il banner sparisce.
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa** lo store, il banner e la pagina `Campo`, seguendo lo schermo 2 del mockup.
  - `AppShell` con il nome dell'esperimento e le azioni ⚙️ Impostazioni (📊 e ⬇️ arrivano nel Piano 2).
  - `BannerData` e un selettore della data di rilievo (`input type="date"`, valore dallo store).
  - Chip delle passate, con selezione salvata nello store. Senza passata scelta, il campo pianta è disabilitato e compare il testo `Scegli una passata`.
  - Campo grande "N° pianta". La tastiera è `inputMode="numeric"` se `etichetteNumeriche`, altrimenti `text`. Invio o "Apri scheda pianta" eseguono `trovaPianta`: se la trova naviga a `/esperimenti/:espId/piante/:piantaId`, altrimenti mostra `Nessuna pianta con etichetta "<input>" in questo esperimento.`
  - Griglia delle piante per `ordine`: verde se `conta > 0`, con il badge `×N` se `N > 1`. Tap → scheda. Contatore `Fatte <n>/<tot> · <passata> · <data>`.
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Verifica nel browser** (viewport mobile 375×812):
  - scegli la passata, digita ` 035 ` → si apre la scheda della pianta 35
  - digita `999` → messaggio d'errore
  - cambia la data in ieri → banner visibile; "Usa oggi" → il banner sparisce
- [ ] **Passo 6: Commit** `feat: schermata in campo con passata, data di rilievo e griglia`.

---

### Task 13: Scheda della pianta (inserimento e storia)

**File:**
- Crea: `src/pages/SchedaPianta.tsx`
- Test: `src/pages/SchedaPianta.test.tsx`

**Interfacce:**
- Consuma: `useConfig`, `useMisurePianta`, `useCampoStore`, `valoriIniziali`, `validaMisura`, `raggruppaStoria`, `formattaValore`, `piantaSuccessiva`, `salvaMisura`, `messaggioErrore`, `<FormMisura>`, `<BannerData>`, `oraLocale`.

- [ ] **Passo 1: Test che falliscono** (RTL, `@/api/misure` e `@/api/query` mockati, config Hydrochar, pianta "35", passata Termometro):
  - Primo test:
    - compila Temp aria `24,5` e tocca "Salva e vai alla #36"
    - `salvaMisura` è chiamata **una sola volta** anche con due tocchi rapidi, con un `id` uuid, `data_rilievo` dallo store, `ora` `HH:MM` e `valori[tempAria] = [24.5]`
    - poi naviga a `/esperimenti/E/piante/<id di 36>`
  - Secondo test:
    - `salvaMisura` rifiuta con `TypeError('Failed to fetch')` → compare il messaggio "Il server non risponde…" e il campo mostra ancora `24,5`
    - "Riprova" → `salvaMisura` è richiamata con lo **stesso** `id`
  - Terzo test: con un avviso min/max il primo tocco mostra l'avviso e il pulsante diventa "Salva comunque", il secondo salva.
  - Quarto test: con 2 misure di oggi della stessa passata, sopra il modulo compaiono `09:12 · Temp aria 24,5 °C · Temp pianta 25,1 °C` e `15:40 · …`. Il tap sulla prima carica il modulo in modifica e il salvataggio usa l'`id` di quella misura.
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa** la pagina, seguendo lo schermo 3 del mockup.
  - **Intestazione:** `Pianta #<etichetta>`, badge con il trattamento e `BannerData`.
  - **Riquadro "<data> · <icona> <passata>":**
    - elenco delle misure della pianta per questa passata e data (ora · valori formattati), con il pulsante "+ Nuova misura" quando se ne sta modificando una
    - campo "Ora" (default `oraLocale()` al momento del salvataggio per le misure nuove, modificabile tramite un pulsante "Ora: 09:12 ✎")
    - `FormMisura` con i parametri non archiviati della passata
  - **Salvataggio:**
    - l'`id` del modulo è generato con `crypto.randomUUID()` all'apertura di un modulo nuovo e rigenerato **solo** dopo un salvataggio riuscito
    - in modifica, `valori = { ...misura.valori, ...valoriModulo }`, così si conservano le chiavi che non appartengono alla passata
    - con errori di `validaMisura`: elenco degli errori, nessuna chiamata
    - durante il salvataggio i pulsanti sono disabilitati
    - **se riesce:**
      - toast `Pianta #<etichetta> salvata ✓`
      - `ricorda(...)`
      - invalidazione di `misurePianta` e `misureGiorno`
      - "Salva e vai alla #<successiva>" naviga, "Salva" reimposta il modulo con `valoriIniziali`
    - **se fallisce:** riquadro rosso con `messaggioErrore` e il pulsante "Riprova"
    - "Salva e vai" è assente sull'ultima pianta
  - **Storia:** `raggruppaStoria(misurePianta)`. Per ogni data, una riga per misura: `ora · icona passata · <parametro valore>…`, inclusi i parametri archiviati con il suffisso ` (archiviato)`. Il tap porta a `/esperimenti/:espId/misure/:misuraId`. Il mini-grafico arriva nel Piano 2.
  - Se non è scelta una passata, si torna a `/esperimenti/:espId`.
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Verifica nel browser:**
  - **passata Termometro:** su 3 piante di seguito Temp aria resta precompilata
  - **passata Fenologici:** "Palchi" della pianta 35 si presenta con i palchi della volta precedente
  - **seconda misura nello stesso giorno:** la griglia mostra `×2`
  - **con il DevTools "Offline":** il salvataggio mostra l'errore e i dati restano nel modulo
- [ ] **Passo 6: Commit** `feat: scheda pianta con misure multiple, progressivi e storia`.

---

### Task 14: Modifica ed eliminazione di misure passate

**File:**
- Crea: `src/pages/ModificaMisura.tsx`

**Interfacce:**
- Consuma: `caricaMisura`, `salvaMisura`, `eliminaMisura`, `useConfig`, `<FormMisura>`, `validaMisura`.

- [ ] **Passo 1: Implementa la pagina.**
  - I parametri mostrati sono quelli della passata della misura più quelli presenti in `valori`, inclusi gli archiviati con l'etichetta ` (archiviato)`.
  - Campi modificabili: "Data di rilievo" (`input type="date"`) e "Ora".
  - "Salva" esegue l'upsert con lo stesso id. Se riesce: toast `Misura aggiornata ✓` e ritorno alla scheda della pianta.
  - "Elimina misura" chiede conferma: `Eliminare la misura del 21/10/2026 alle 09:12? L'operazione non si può annullare.` Poi elimina e torna alla scheda.
  - Funziona anche se l'esperimento è `concluso`.
- [ ] **Passo 2: Verifica nel browser:**
  - modifica una misura di una settimana fa (valore e data) → la storia si aggiorna
  - elimina una misura → sparisce dalla griglia del suo giorno
  - imposta l'esperimento come concluso (via SQL, finché non c'è il Task 15) → la modifica è ancora possibile
- [ ] **Passo 3: Commit** `feat: modifica ed eliminazione di misure passate`.

---

### Task 15: Impostazioni dell'esperimento

**File:**
- Crea: `src/pages/Impostazioni.tsx`
- Test: `src/pages/Impostazioni.test.tsx`

**Interfacce:**
- Consuma: `useConfig`, `aggiornaEsperimento`, `salvaParametro`, `eliminaOArchiviaParametro`, `salvaPassata`, `eliminaPassata`, `aggiungiPiante`, `aggiornaPianta`, `eliminaPianta`, `aggiornaTrattamento`, `parametriConDati`, `pianteConDati`, `generaPiante`, `prossimaEtichetta`, `<EditorParametro>`, `<EditorPassata>`.

- [ ] **Passo 1: Test che falliscono** (RTL con l'API mockata):
  - il parametro con dati ha `EditorParametro` con `tipoBloccato` e il pulsante "Archivia" (non "Elimina"); il parametro senza dati ha "Elimina"
  - la pianta con dati non ha "Rimuovi" e mostra `Ha dati: non si può rimuovere`
  - "Aggiungi 3 piante a «S1»" chiama `aggiungiPiante` con le etichette `57`, `58`, `59` quando l'ultima è `56`
- [ ] **Passo 2:** `npm test` → FAIL.
- [ ] **Passo 3: Implementa la pagina**, divisa in sezioni:
  - **Generale:** nome, data di inizio, note e l'interruttore "Esperimento concluso".
  - **Trattamenti:** rinomina delle etichette. I fattori dopo la creazione non si modificano: mostrarli in sola lettura.
  - **Piante:**
    - modifica di etichetta e blocco
    - cambio del trattamento solo senza dati
    - aggiunta di N piante a un trattamento con `generaPiante(…, prossimaEtichetta(piante))`
    - rimozione solo senza dati, con conferma
  - **Parametri:**
    - elenco degli attivi e, a parte e comprimibile, degli archiviati con "Ripristina"
    - "+ Parametro"
    - salvataggio del singolo parametro
  - **Passate:** `EditorPassata`, "+ Passata", eliminazione (che fallisce con il messaggio `23503` se ci sono misure).
  - Ogni salvataggio mostra un toast di esito e invalida `chiavi.config(espId)`.
- [ ] **Passo 4:** `npm test` → PASS.
- [ ] **Passo 5: Verifica nel browser:**
  - aggiungi un parametro a esperimento avviato → compare nel modulo della passata a cui lo aggiungi
  - archivia un parametro con dati → sparisce dai moduli ma resta nella storia come "(archiviato)"
  - prova a rimuovere una pianta con dati → non è possibile
- [ ] **Passo 6: Commit** `feat: impostazioni dell'esperimento a esperimento avviato`.

---

### Task 16: Pulizia della v2, README e verifica finale

**File:**
- Elimina:
  - pagine: `src/pages/ListaRilevazioni.tsx`, `NuovaRilevazione.tsx`, `PassoPianta.tsx`, `SceltaMisurazione.tsx`
  - componenti: `src/components/FormMisure.tsx`, `FormPianta.tsx`, `InlinePalchi.tsx`, `InlineInfiorescenze.tsx`
  - dati, store e tipi: `src/store/rilevazioneStore.ts`, `src/data/piante.ts`, `src/types/index.ts`
  - `src/lib/exportExcel.ts`
  - `scripts/genera_piante.py`
  - asset e CSS (solo se non importati): `src/assets/hero.png`, `react.svg`, `vite.svg`, `src/App.css`
- Modifica: `README.md` (sostituisce il template Vite)

- [ ] **Passo 1:** elimina i file. Con `grep -rn "rilevazioneStore\|data/piante\|exportExcel\|@/types'" src` non deve risultare nulla. Lascia `xlsx` in `package.json`: la rimuove il Piano 2.
- [ ] **Passo 2: README in italiano.** Contenuto:
  - **Cos'è FastLab**
  - **Sviluppo locale:** Docker Desktop, `npx supabase start`, `.env.local`, `npm run dev`, `npm test`, `npm run test:db`
  - **Messa online su un nuovo progetto Supabase:**
    - creare il progetto (piano Free)
    - `npx supabase link --project-ref <ref>`, poi `npx supabase db push`
    - in Authentication → Providers → Email: **disattivare "Confirm email"** e lasciare attiva la registrazione (gli inviti sono imposti dal database)
    - variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` sull'hosting
  - **Primo amministratore:** `insert into public.inviti(email) values ('…');`, poi la registrazione nell'app, poi `update public.profili set admin = true where email = '…';`
  - **Password dimenticata:** `update auth.users set encrypted_password = crypt('<nuova>', gen_salt('bf')) where email = '…';`
  - **Database in pausa:** Dashboard → progetto → "Restore project"
  - **Limiti del piano gratuito:** 500 MB di dati, 1 GB di file, pausa dopo 7 giorni di inattività
  - **La v2 resta online** finché non si decide di sostituirla
- [ ] **Passo 3: Verifica finale:** `npm test` → PASS, `npm run test:db` → PASS, `npm run lint` → 0 errori, `npm run build` → OK.
- [ ] **Passo 4: Percorso completo nel browser:** registrazione su invito → creazione dal modello Hydrochar → passata Termometro su 3 piante → passata Fenologici sulla pianta 1 due volte in giorni diversi (con i palchi progressivi) → storia della pianta 1 → modifica di una misura vecchia.
- [ ] **Passo 5: Commit** `chore: rimuove la v2, README di setup e gestione`.
