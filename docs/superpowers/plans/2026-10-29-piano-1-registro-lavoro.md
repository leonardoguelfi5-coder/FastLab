# SDD ledger — plan: docs/superpowers/plans/2026-10-28-fastlab-v3-piano-1-fondamenta.md

Spec: docs/superpowers/specs/2026-10-28-fastlab-v3-esperimenti-design.md (reachable)
Branch start (merge-base main): see `git merge-base main HEAD`; plan commit 2fd1c23

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T11 | parseNumero/formattaNumero → NumericField | consistent |
| T1 → T12/T13 | oggiLocale/oraLocale/formattaData → store, banner, scheda | consistent |
| T2 → T3 | tables + tipi → RLS/RPC; both write supabase/tests/rpc.test.sql | consistent (T3 appends) |
| T2 → T4 | tipi.ts (no esperimento_id) → mappers aRigaMisura(espId, m) | consistent |
| T3 → T4 | crea_esperimento / riepilogo_esperimenti / *_con_dati → api | consistent |
| T4 → T5/T6 | auth.ts, inviti.ts, useSonoAdmin → pages | consistent |
| T4 → T15 | configurazione.ts functions → Impostazioni | consistent |
| T7 → T8 | generaTrattamenti/generaPiante/validaBozza/clonaConfig/bozzaHydrochar → wizard | consistent |
| T7 → T13 | bozzaHydrochar ("Temp aria" °C) → SchedaPianta test text "Temp aria 24,5 °C" | consistent with T10 formattaValore ("42 cm" pattern) |
| T8 → T15 | EditorParametro(tipoBloccato)/EditorPassata → Impostazioni | consistent |
| T10 → T13 | valoriIniziali/validaMisura/raggruppaStoria/formattaValore → SchedaPianta | consistent |
| T11 → T13/T14 | FormMisura → pages | consistent |
| T12 → T13 | useCampoStore.dati/ricorda, BannerData → SchedaPianta | consistent |
| T11 ↔ v2 files (deleted only in T16) | rewritten NumericField drops `required` prop used by v2 InlinePalchi/FormMisure/FormPianta | CONFLICT: tsc -b would fail T11–T15 |
| T1 setup (`globals: false`) ↔ RTL tests T8/T11/T12/T13/T15 | RTL auto-cleanup needs global afterEach | CONFLICT: DOM leaks between tests |
| T5 ↔ v2 pages | App.tsx no longer routes v2 pages; they stay compiled until T16 | ok |
| T1..T16 self-consistency | each task's tests vs specified code/files | no internal contradictions found |

Ruling: T11 NumericField keeps an optional `required?: boolean` prop forwarded to the input — v2 files still compile until T16 deletes them — cost if wrong: one unused prop.
Ruling: T1 `src/test/setup.ts` also registers `afterEach(() => cleanup())` from @testing-library/react — needed because globals are off — cost if wrong: none.
Ruling: Controller starts Docker Desktop locally (needed from T2; launching a local app is non-destructive) — cost if wrong: a running Docker Desktop the user can quit.

## Progress
Task 1: dispatched implementer (sonnet) agent aed37486b136f3b95, BASE 2fd1c23
Task 1: minor (deferred): vitest has no exclude for `.claude/**` worktrees (main checkout would collect sibling worktree tests)
Task 1: minor (deferred): date TZ regression test only meaningful when TZ ahead of UTC; pin TZ in vitest env
Task 1: minor (deferred): @testing-library/dom only an auto-installed peer; add explicitly
Task 1: minor (deferred): lockfile transitive bumps (sourcemap-codec, picomatch, tinyglobby)
Task 1: minor (deferred): formattaNumero(NaN)→"NaN", exponent notation; formattaData('')→"undefined/undefined/"
Task 1: minor (deferred, plan-mandated): parseNumero rejects ",5" / ".5" — relevant to Review Focus #1
Task 1: complete (commits 2fd1c23..2c17dac, review clean)
Ruling: Docker engine not starting (docker-desktop WSL distro Stopped, user asked to check) — run DB-independent tasks first: T7 (with src/domain/tipi.ts from T2's brief folded in), then T10, T11; resume T2–T6 when Docker is up — cost if wrong: T2 implementer finds tipi.ts already present (no rework)
Task 7: dispatched implementer (sonnet) agent a059f7b337cb8b6a6, BASE 2c17dac
Task 7: implementer DONE 4c5f61c; reviewer (sonnet) a06bf48b203fa4d7a dispatched on 2c17dac..4c5f61c
Task 7: review → Needs fixes (1 Important: hydrochar.test.ts imports @/data/piante which T16 deletes)
Task 7: minor (deferred): hydrochar.ts label rename via index arithmetic (assumes 2 HC levels order)
Task 7: minor (deferred): fattore/parametro factories duplicated in hydrochar.ts and test-helpers.ts
Task 7: minor (deferred): test-helpers.ts lives in src/domain (compiled as app code)
Task 7: minor (deferred): validaBozza misses non-integer n_letture, duplicate/empty sotto-campo chiave/nome, dangling refs → relevant to T8 wizard
Task 7: minor (deferred): etichetteNumeriche/prossimaEtichetta don't trim (trovaPianta does)
Task 7: minor (deferred): clonaConfig spreads may copy extra row fields (e.g. esperimento_id) — check in T4 mappers
Task 7: minor (deferred): clone test doesn't check same-named levels; rimappa throw path untested
Task 7: minor (deferred): generaPiante doesn't guard negative/NaN/fractional n (UI must constrain, T8)
Task 7: fix round 1/5 (1 addressed, 0 open; commits 4c5f61c..b87f9e5)
Task 7: complete (commits 2c17dac..b87f9e5, review clean)
Ruling: Docker engine now Running — return to plan order: T2 next, then T3..T6, T8..T16 (T10, T11 at their plan positions) — cost if wrong: none
Task 2: dispatched implementer (sonnet) agent a24dcdccd2e5296db, BASE b87f9e5 (tipi.ts already present from T7)
Note for T3 dispatch: T2 tests insert auth.users without invites — T3's INVITO_MANCANTE trigger will break them; T3 must update T2 tests to insert invites first.
CHECKPOINT 2026-10-28 15:04: user going offline briefly. Done: T1, T7 (committed, reviewed). T2 in progress (agent a24dcdccd2e5296db; uncommitted files under supabase/ + package.json). On resume: check git log/status; if T2 agent died, re-dispatch T2 with the brief + note about analytics/edge_runtime disabled in config.toml.
Task 2: implementer stalled (watchdog 600s) after RED; resumed same agent with background-command guidance + psql fallback
Task 2: implementer DONE_WITH_CONCERNS 403a080 — guard skips DELETE when parent esperimento already gone (cascade), guard security definer, same-tipo update allowed; config ports +100 (API 54421, DB 54422) due to other local stack "Ipoh"; analytics/edge_runtime disabled; site_url default 3000 (Vite 5173)
Ruling: accept T2 guard deviations (skip on cascade delete when parent esperimento gone; security definer; same-tipo update allowed) — brief's literal guard blocks experiment deletion and would fail open under RLS — cost if wrong: guard logic slightly more complex
Task 2: minor (deferred): test gaps (cascade child tables livelli/trattamento_livelli/passata_parametri, case-variant label dup, archiving param with data succeeds, cross-exp FKs on livelli/trattamento_livelli/passata_parametri)
Task 2: minor (deferred): no FK-supporting indexes misure(passata_id, esperimento_id), piante(trattamento_id, esperimento_id)
Task 2: minor (deferred): jsonb keys have no FK (orphan parameter keys possible); validate in API
Task 2: minor (carried to T3): revoke execute on security-definer trigger functions from public/anon/authenticated
Task 2: minor (deferred): config.toml ports +100 (API 54421, DB 54422) machine-specific; site_url 3000 vs Vite 5173 (carry to T5)
Task 2: minor (deferred): jose 6.2.3→6.2.13 lockfile bump; index naming mixed; guard comment nit
Task 2: complete (commits b87f9e5..403a080, review clean)
Task 3: dispatched implementer (opus) agent a03b31fbdb90b60bc, BASE 403a080
Task 3: implementer DONE_WITH_CONCERNS 2f958d3 — 76 pgTAP pass; owner trigger uses new.creato_da (not auth.uid()); local GoTrue returns 500 {"code":"P0001","message":"INVITO_MANCANTE"} for uninvited signup
Ruling (carry to T4): messaggioErrore maps BOTH "Database error saving new user" AND messages containing "INVITO_MANCANTE" to the invite message — real GoTrue returns the latter — cost if wrong: none
Task 3: review → Approved (0 Critical/Important); minors: weak write-policy regression tests; insert..returning on esperimenti fails for clients (use RPC only); creato_da rewritable; stale header comment 0003; invite emails not normalised; invite claimable by anyone knowing a pending invited address (confirmations off); is_membro per-row perf
Ruling: invite claim hole is a spec gap (spec: "uno sconosciuto con il link non deve poter consumare lo spazio"; email confirmation impossible without SMTP) — add a random invite code: inviti.codice (short random, shown to admin), signup must pass raw_user_meta_data->>'codice_invito' matching (case-insensitive) the pending invite; T5 Registrati gets a "Codice invito" field passed via signUp options.data; T6 "Copia messaggio" includes the code. Fold in cheap hardening: email check lower(btrim), revoke update(creato_da) on esperimenti/misure, fix stale comment, catalog test (all public tables RLS on, no anon grants). Executed as T3 fix round 1 — cost if wrong: one extra field at signup
Ruling (carry to T4/T8): clients must create experiments only via crea_esperimento RPC (insert..returning on esperimenti fails under RLS by design)
Task 3: minor (deferred): per-child-table WITH CHECK regression tests; is_membro per-row perf at 1e5 misure
Task 3: fix round 1 implemented 4ce1365 (94 pgTAP pass); UPDATE grant revoked table-wide on esperimenti/misure and re-granted per column except creato_da — carry to T4: aRigaMisura/patches must omit creato_da; creaInvito lower+trim email; signup options.data.codice_invito
Task 3: fix round 1/5 (5 addressed, 0 open; commits 2f958d3..4ce1365)
Task 3: minor (deferred): 0005 lacks `create extension if not exists pgcrypto with schema extensions`; misure.creato_da settable on insert; btrim only strips spaces (client must trim code)
Task 3: complete (commits 403a080..4ce1365, review clean)
Ruling (T4 interface change): `registrati(email, password, codiceInvito)` passes `options.data.codice_invito = codiceInvito.trim().toUpperCase()`; `Invito` gains `codice: string`; `creaInvito` sends `email.trim().toLowerCase()`; mappers never send `creato_da`; messaggioErrore maps INVITO_MANCANTE too, with message "Email o codice invito non validi. Controlla il messaggio di invito o chiedi all'amministratore." — cost if wrong: copy tweak
Task 4: dispatched implementer (sonnet), BASE 4ce1365
Task 4: implementer DONE_WITH_CONCERNS a2465ea (166 tests) — creaInvito returns Invito; salvaPassata upsert-then-prune; extra exports creaQueryClient, chiavi.sonoAdmin
Note (carry to T5): queryClient.clear() on sign-out (cache keyed without user id)
Note (carry to Plan 2): PostgREST 1000-row cap — export must paginate misure
Task 4: minor (carry to T13): invalidate chiavi.esperimenti after saving a misura (home summary stale 30s)
Task 4: minor (carry to T5): queryClient.clear() on sign-out REQUIRED
Task 4: minor (deferred): "non trovata" errors render as "Errore imprevisto: …"; getSession error dropped; aggiornaEsperimento undefined-patch edge; creaQueryClient defaults untested; untyped supabase client
Task 4: complete (commits 4ce1365..a2465ea, review clean)
Ruling (T5): Registrati has a third field "Codice invito" (text, autocapitalize characters) passed to registrati(email, password, codice); supabase/config.toml site_url → http://127.0.0.1:5173 + additional_redirect_urls include http://localhost:5173; browser verification done by controller via preview after review — cost if wrong: none
Task 5: dispatched implementer (sonnet) agent a2ea247608c719723, BASE a2465ea
Task 5: implementer DONE_WITH_CONCERNS 8f5e0a0 (206 tests) — shadcn CLI glitches fixed by hand (cn import, button overwrite reverted); next-themes added via sonner; testTimeout 15s; catch-all route
Task 5: controller browser check PASS (mobile 375x812): /esperimenti/x → /accedi; signup wrong code → invite error message; signup correct code (lowercase, spaces) → / ; admin menu shows Inviti; Esci → /accedi
Local test account (local stack only): prova.admin@fastlab.test / ProvaLocale2026! (admin=true). Preview config: .claude/launch.json "fastlab-v3" (not committed)
Task 5: review → Needs fixes: (I1) query cache cleared only by Esci (session expiry / other tab / different login leaks prev user's cached UI); (I2) browser check evidence — RESOLVED by controller browser check above
Ruling: fold into T5 fix round 1 three minors that violate global constraints: dialog.tsx English "Close" → "Chiudi" (Italian UI); next-themes unjustified dep → drop, Sonner theme="system"; signUp without session (email confirmation on) must show "Controlla la tua email per confermare l'account, poi accedi." instead of silently bouncing (no silent failures) — cost if wrong: trivial
Task 5: minor (deferred): no redirect for logged-in users on /accedi; origin path dropped after expiry; admin-check errors silent; a11y polish (focus after menu close, aria-controls, aria-invalid); untested submit-disabled state; stale comment query.ts:16; testTimeout 15s global; nested placeholder back arrows to /
Task 5: minor (deferred): esci() uses global signOut scope (logs out other devices) — consider scope 'local'
Task 5: fix round re-check in browser deferred (pane hidden → 0x0 viewport); re-verify Esci flow in end-to-end browser pass at T16
Task 5: fix round 1/5 (5 addressed, 0 open; commits 8f5e0a0..f40047e)
Task 5: minor (deferred): clear() orphans mounted observers on cross-tab A→B (use resetQueries); Esci→/accedi relies on RequireAuth wrapping all AppShell; focus/announce on confirm screen
Task 5: complete (commits a2465ea..f40047e, review clean)
Ruling (T6): "Copia messaggio" text = `Ciao! Ti ho invitato su FastLab. Registrati qui: <origin>/registrati usando l'email <email> e il codice invito <codice>.`; list shows the code for pending invites — follows from invite-code ruling — cost if wrong: copy tweak
Task 6: dispatched implementer (sonnet) agent abf26696012ea6707, BASE f40047e
Task 6: implementer DONE b13ccba (234 tests) — admin-check error shows Riprova; clipboard fallback box; new invite optimistic insert + "Nuovo" badge
Ruling: future dispatches let each subagent use the attribution line from its own system reminder (don't hardcode Opus) — commit trailers then match the authoring model — cost if wrong: none
Task 6: controller browser check deferred (browser pane hidden → no a11y tree); batch browser checks for T6/T8/T9 later with pane shown
Task 6: minor (deferred): local-date test not TZ-pinned; duplicate invite email shows generic 23505 text (want "Questa email è già stata invitata."); setQueryData partial list when cache empty; background refetch failures silent; extras partly untested; aria-invalid; focus after revoke; Nuovo highlight never clears; revocaInvito deletes without usato_il is null guard (API)
Task 6: complete (commits f40047e..b13ccba, review clean)
Task 8: dispatched implementer (opus), BASE b13ccba
Task 8: implementer DONE_WITH_CONCERNS 923b8cb (321 tests) — extra files CampoNumero/Interruttore/Espandibile/righeTrattamenti; collapsible editors; validaBozza new checks; draft lost on back arrow without warning
Task 8: reviewer ad766956e6393c4a6 hit usage limit (reset 23:50); resumed via SendMessage
Task 8: review → Needs fixes: (I1) whole draft lost without warning via header arrow / system back / menu
Ruling: fold into T8 fix round 1 three cheap minors tied to spec/anti-goals: signed Min/Max fields use inputMode="text" (iOS keypad has no minus); a typed-but-unconfirmed level is added automatically on "Genera trattamenti" (beginner trap); create retry after an ambiguous network failure that returns 23505 for the same esperimento.id → check caricaConfig(id) and if it exists treat as success (navigate with replace) — cost if wrong: small
Task 8: minor (deferred): Numerazione da resets to 1; treatment label errors only in Riepilogo; one-tap deletes no undo + shared a11y names; type switch loses options; small checkboxes; copies with 0-plant/non-matching treatments blocked with misleading reason; clonaConfig error shows raw uuid; hidden plants count as duplicates; no duplicate-name check for factors/parameters/passate; SOLO_CIFRE + ErroreConRiprova duplicated; 60s test timeouts; untrimmed names; Duplica hint points to placeholder list (until T9)
Task 8: fix round 1 implemented a96a01b (344 tests); NuovoEsperimento.test.tsx 503 lines; extras: Riepilogo re-checks step-2 block, attempted flag persisted, draft key per user
User decision (2026-10-29 01:3x): use most capable model (opus) only for important work — security, the core field-entry flow (T13 SchedaPianta impl+review), final whole-branch review; sonnet for everything else (T9–T12, T14–T16 impl and reviews, re-reviews)
Task 8: fix round 1/5 (4 addressed, 0 open; commits 923b8cb..a96a01b)
Task 8: minor (deferred): draft key uses async session uid → wizard remounts once on mount (typing in that window lost if getSession slow); ?da= restore still needs source fetch; Passo precedente pushes history; VERSIONE bump discipline; test file 503 lines
Task 8: complete (commits b13ccba..a96a01b, review clean)
Task 9: dispatched implementer (sonnet), BASE a96a01b
User request (2026-10-29): use impeccable / ui-ux-pro-max skills for aesthetics. Controller ran impeccable teach+document: PRODUCT.md (register product; "Preciso, sobrio, affidabile"; Notion/Apple Note; anti-refs startup colorata, verde ecologico, gestionale, Excel; WCAG 2.2 AA) and DESIGN.md ("Il quaderno di campo": carta/grafite/inchiostro blu notte, Geist + Geist Mono tabular, flat, light only) + .impeccable/design.json
Ruling: insert Task D (design system) right after T9: apply DESIGN.md tokens to src/index.css (remove Vite-template leftovers: #root 1126px, text-align center, purple accent, 56px h1, dark mode), add Geist Mono, restyle shadcn ui primitives + AppShell + existing pages (Accedi, Registrati, AdminInviti, NuovoEsperimento + wizard, Esperimenti) per DESIGN.md using the impeccable skill; all later UI tasks (T11–T15) dispatch with "follow DESIGN.md/PRODUCT.md, use impeccable skill" — cost if wrong: restyle effort
Task 9: implementer DONE 8f68640 (364 tests); controller committed design docs on top
Task 9: minor (deferred): Escape-focus test vacuous; TZ not pinned (date tests meaningful only non-UTC) — fix globally (vitest env TZ=Europe/Rome); background refetch error silent when data cached; ⋯ menu keyboard edge cases (tab away, two open); ErroreConRiprova + outside-click logic duplicated (extract useChiudiMenu); long card link name; "oggi" stale past midnight
Task 9: complete (commits a96a01b..8f68640, review clean)
Task D: brief written by controller (task-D-brief.md); dispatched implementer (opus), BASE 05fdff8
User instruction (2026-10-29): if tokens/usage limit run out, resume as soon as available. Controller: hourly recurring cron (:17) checks ledger+agents and resumes stalled work; on a subagent limit failure, also schedule a one-shot cron at the stated reset time + ~5 min
Task D: implementer DONE_WITH_CONCERNS 8fc8a94 (364 tests, none edited) — added --riga-controllo for control borders (riga-forte only 1.9:1); Geist fonts were never shipped before (fixed: imported in main.tsx); BarraAzioni publishes --altezza-barra-azioni; template assets removed
Ruling: DESIGN.md gains token riga-controllo oklch(60% 0.012 75) for resting borders of inputs, checkboxes, switches AND secondary buttons (spec WCAG 3:1 for components) — controller committed 6100e78 — secondary buttons must use it (fix if not) — cost if wrong: slightly darker borders
Task D: controller browser check: /accedi screenshot OK (paper bg, ink primary, notebook look); login OK; further screenshots time out (Claude window likely not in front) — redo visual pass when user has the window visible
Task D: review → Needs fixes: (I1) outline/secondary button rests on border-riga (1.35:1) not riga-controllo; hover lighter
Ruling: fold into T-D fix round 1 cheap minors tied to PRODUCT/DESIGN rules: viewport-fit=cover in index.html; Esperimenti "+ Nuovo esperimento" as primary in BarraAzioni (principle 1, thumb-reachable); success toast check tint only for save outcomes (verde negato rule) — neutral toast for others like "Messaggio copiato."; sonner entry-slide override specificity — cost if wrong: small
Task D: minor (deferred): numbers in row summaries sans tabular not mono (single text node); native table checkboxes don't use riga-controllo; two inchiostro fills on new invite row
Task D: implementer hit usage limit mid fix round (reset 04:50); resumed 04:51 via SendMessage (uncommitted WIP present)
Task D: fix round 1 implemented a3f7028 (366 tests); toastSalvato() helper in src/lib/toastSalvato.ts for save outcomes
Task D: fix round 1/5 (5 addressed, 0 open; commits 6100e78..a3f7028); re-review conditional risks resolved by controller from first review evidence: BarraAzioni has pb calc(0.75rem+env(safe-area-inset-bottom)) and AppShell main pads by --altezza-barra-azioni
Task D: minor (deferred): toast resting position/stacking to verify in browser; "Esperimento creato" toast could use toastSalvato; toast-salvato literal duplicated in css+ts; 200ms duration rule order-dependent; landscape side safe areas
Task D: complete (commits 05fdff8..a3f7028, review clean)
Ruling: fold into T10 the consolidated deferred minor "pin TZ for tests" (T1/T6/T9): vitest `test.env.TZ = 'Europe/Rome'` so local-date tests discriminate UTC bugs — cost if wrong: none
Task 10: dispatched implementer (sonnet), BASE a3f7028
Task 10: implementer DONE 8e06e45 (417 tests; TZ pinned Europe/Rome)
Task 10: review → Needs fixes: (C1) NaN/Infinity in lista sub-fields passes validaMisura → saved as null (anti-goal)
Ruling: fold into T10 fix round 1: resize carried numero values to n_letture (n_letture editable after data in T15); "1 elemento"/"N elementi" plural (Italian UI; overrides plan's literal "1 elementi"); test documenting same (data, ora) tie rule; TZ guard test — cost if wrong: trivial
Task 10: fix round 1 implemented 2815b55 (430 tests)
Task 10: fix round 1/5 (5 addressed, 0 open; commits 8e06e45..2815b55)
Task 10: minor (deferred): list elements not null-guarded in validaMisura/formattaValore (type forbids null); TZ guard partial (east zones); tie rule depends on array order; editing a stored misura doesn't adapt letture length
Task 10: complete (commits a3f7028..2815b55, review clean)
Ruling (T11): parseNumero also accepts a leading separator (",5" / ".5" → 0.5; "-,5" → -0.5; "," alone stays NaN) — Review Focus #1, Italians type ",5" — cost if wrong: none
Task 11: dispatched implementer (sonnet), BASE 2815b55
Task 11: implementer DONE_WITH_CONCERNS 2591de0 (486 tests) — variant="campo" 52px mono; no "—" placeholder; sr-only obbligatorio for groups; negativo prop → text keyboard when valore_min<0
Ruling (T11, to apply in fix round with review findings): select-all on focus for numeric measurement fields (prefilled ricorda/progressivo values must be replaced, not appended to → "24,525" risk); autofocus the first sub-field of a newly added list row — speed + correctness in field — cost if wrong: small
Task 11: review → Needs fixes: (C1) prefilled value appended to on typing (no select-on-focus) → silent wrong numbers; (I2) "Rimuovi ultimo" drops filled row with no undo; (I3) negativo heuristic misses max ≤ 0 params
Ruling: fold into T11 fix round 1 also: autofocus first sub-field of new list row (speed); normalise valid value to comma display on blur (global "mostrano la virgola"); NaN value on remount shows inline error; export fuoriIntervallo(p, x) domain helper used by both UI avviso and validaMisura — cost if wrong: small
Task 11: minor (carry to T13): if Salva tapped while field focused with incomplete "-", the blocking message must name the field (validaMisura does)
Task 11: fix round 1 implemented ae5b9bf (516 tests)
Task 11: fix round 1/5 (7 addressed, 0 open; commits 2591de0..ae5b9bf)
Task 11: minor (deferred): deferred select timer not cleared; undo not idempotent; restored NaN row loses typed text; v2 screens get new NumericField behaviour (deleted in T16)
Task 11: minor (carry to T13): key the form by piantaId+misura id so CampoLista remounts on plant change (dismisses pending "Annulla" toasts; prevents undo into another plant's list)
Task 11: complete (commits 2815b55..ae5b9bf, review clean)
Task 12: dispatched implementer (sonnet), BASE ae5b9bf
Task 12: implementer DONE_WITH_CONCERNS a95ac4e (583 tests) — dataRilievo stored only when explicit non-today; dati() memoised; fixed bar vs keyboard unverified; shared ErroreConRiprova created
Task 12: review → Approved but 2 Important: (I1) fixed BarraAzioni hidden under soft keyboard (iOS numeric pad has no Return) → app-wide fix in BarraAzioni via visualViewport; (I2) "today" goes stale across midnight/resume (no re-render) → useOggi hook on visibilitychange/focus/midnight
Ruling: fold cheap minors: migrate the 3 local ErroreConRiprova copies to the shared component; banner gets full 1px attenzione border; ×N badge at text-label size; validate stored dataRilievo format (fallback today) — cost if wrong: trivial
Task 12: minor (deferred): no autofocus on plant field (decide with T13 next-plant flow); structuredClone Safari 15.4; scrollIntoView?. guard in prod; class-name assertions; iOS select after error
Task 12: fix round 1 implemented c54ce8b (622 tests); keyboard behaviour needs real-device check (ledger for user)
Task 12: fix round 1/5 (6 addressed, 0 open; commits a95ac4e..c54ce8b)
Task 12: minor (deferred): --tastiera-coperta only from BarraAzioni pages; DATA_ISO format not calendar validity; useOggi no recheck at mount; Esperimenti quando() new Date per render; REAL-DEVICE CHECK NEEDED: bar above numeric pad iOS/Android, toast above bar, focused field visible
Task 12: complete (commits ae5b9bf..c54ce8b, review clean)
Task 13: dispatched implementer (opus), BASE c54ce8b
Task 13: implementer hit usage limit at ~09:3x (reset 09:50); WIP uncommitted (src/components/scheda/, src/lib/percorsi.ts, SchedaPianta.test.tsx); one-shot cron 09:53 to resume via SendMessage
Task 13: early resume at ~09:40 succeeded (file edits at 09:41, before the 09:50 reset → extra usage active); 09:53 cron fired with agent already running — no duplicate message sent
Task 13: implementer DONE_WITH_CONCERNS cbbf309 (651 tests) — typed values dropped silently on back/switch/new measure; focus to first empty field; RiquadroOggi ~375 lines
Task 13: review → Needs fixes: (C1) edit/prefill survive a data di rilievo change → "Usa oggi" can overwrite yesterday's measure; (C2) typed values discarded silently on row tap / "+ Nuova misura" / header back; (I3) double tap bypasses min/max "Salva comunque"; (I4) editing an old measure overwrites ricordati
Ruling: OS/browser back gesture (no data router → no useBlocker) handled by persisting the unsaved form to sessionStorage (key espId+piantaId+passataId+data+misuraId|nuova), restored on return with "Bozza ripristinata." + "Scarta"; cleared after successful save or explicit discard — complements the in-panel/header confirmations and beforeunload — cost if wrong: small storage code
Ruling: fold minors 5 (explicit [saved, ...misure] to next form + stronger test), 6 (prefetch next plant's misure), 8 (navigate replace for Salva e vai) — speed/correctness in field — cost if wrong: trivial
Task 13: minor (deferred): stale cache on reopen (30s staleTime); RiquadroOggi size/ElencoOggi split; confronta duplicated; n_letture reduced on edit (T10)
Task 13: fix round 1 implemented a0c8297 (667 tests); re-review pending

## Ripresa nella sessione cloud (29/10/2026)

Ledger ricreato da questo registro. Branch di lavoro: `claude/wonderful-gates-8het2q` (designato dalla sessione cloud), tenuto allineato con `claude/app-review-improvements-c26294` (stesso commit di partenza 0f492ae, push su entrambi).
Ruling: le skill superpowers:subagent-driven-development e impeccable non sono installate nell'ambiente cloud — il controller segue lo stesso metodo a mano (brief scritti, implementatore → revisore → giri di correzione, ledger qui) e i brief UI riportano le regole di PRODUCT.md/DESIGN.md/.impeccable/design.json — cost if wrong: nessuno sul codice, solo meno automazione
Ruling: Docker assente nel cloud — `npm run test:db` e prove nel browser con il DB locale restano da fare in locale; le migration eventualmente nuove si scrivono con i loro test pgTAP e si segnalano come non verificate — cost if wrong: un giro in locale
Base cloud: 667 test verdi, tsc -b pulito, lint 0 errori (1 warning in FormPianta.tsx della v2)
Task 13: re-review fix round 1 (opus) → Needs fixes: (I1) a mezzanotte con data implicita il riquadro si ricrea e i valori scritti spariscono (restano solo nella bozza di ieri)
Ruling: fold into T13 fix round 2 minors tied to Focus #2 / anti-goal "dati persi in silenzio": (m2) formId nuovo solo dopo un salvataggio riuscito (non su "+ Nuova misura" né su "Scarta" della bozza); (m3) la bozza di una correzione si riapre al ritorno (si ricorda quale modulo era aperto); (m4) bozze per utente: cancellare le chiavi `fastlab-bozza:*` all'uscita (Esci e cambio utente); (m5) toast dopo uscita "…: riapri la pianta per riprovare." — cost if wrong: small
Task 13: minor (deferred): bozze orfane restano in sessionStorage (T14: ModificaMisura cancella la bozza della misura salvata/eliminata); primoCampo resta in location.state della voce sostituita (tastiera riaperta tornando indietro)
Task 13: fix round 2 implemented fca84eb (682 tests) — useOggi(alCambio) trattiene la data a mezzanotte con modulo modificato; formId solo dopo salvataggio; ricordo del modulo aperto; bozze cancellate al cambio utente; toast "I valori sono rimasti: riapri la pianta per riprovare."
Ruling: accept the implementer's `idLibero` exception (if the reused formId is already among the loaded misure of the plant, "Scarta"/"+ Nuova misura" take a fresh id instead of silently rewriting a visible misura) — follows Focus #2 and the no-silent-overwrite anti-goal — cost if wrong: one extra id
Task 13: minor (deferred): misura trattenuta a mezzanotte prende l'ora del salvataggio (07:30) con data di ieri — valutare ora fissata alla prima modifica; INITIAL_SESSION vuota seguita da SIGNED_IN stesso utente cancellerebbe le bozze (come la cache)
Task 13: re-review fix round 2 → Needs fixes: (I1) cancellaTutteLeBozze su SIGNED_OUT/sessione scaduta cancella i valori dello stesso utente (regressione Focus #5)
Ruling: bozze legate all'utente (proprietario in sessionStorage), cancellate solo quando accede un utente diverso, mai su SIGNED_OUT; fold minors 2 (toast tardivo cita la data se non è oggi) e 3 (un fallimento tardivo non sovrascrive una bozza con id diverso) — cost if wrong: small
Task 13: minor (deferred): bozza "nuova" ripresa con id già in elenco si presenta come "Nuova misura" (salva come aggiornamento, niente doppioni); cancellaTutto ripetuto in onModifiche
Task 13: fix round 3 implemented 8f358ff (688 tests) — proprietario delle bozze in `fastlab-bozza:utente`, assegnaBozze(uid) cancella solo per un utente diverso; toast tardivo con la data; nessuna sovrascrittura/cancellazione di una bozza con id diverso
Ruling: accept extra (pulizia dopo salvataggio tardivo e "Scarta" toccano la bozza solo se ha l'id del modulo) and the one-time wipe of owner-less drafts (v3 not yet deployed: no real drafts exist) — cost if wrong: none
Task 13: re-review fix round 3 → Approved
Task 13: minor (deferred): commento di soloDelModulo fuori posto (ModuloOggi ~45); chiave `aperto` unica per riquadro (un salvataggio tardivo può riportarla a "nuova" mentre si corregge X; la bozza di X non si perde)
Task 13: fix round 3/5 (giri 1–3: 7 + 5 + 3 addressed, 0 open; commits c54ce8b..8f358ff)
Task 13: complete (commits c54ce8b..8f358ff, review clean)
Task 14: dispatched implementer (sonnet), BASE (commit di questo registro)
Task 14: implementer DONE_WITH_CONCERNS 6d974e8 (739 tests) — ATTESA_CONFERMA_MS in scheda/salvataggio.ts; StoriaPianta passa state daScheda (ritorno navigate(-1) o replace); useMisura gcTime 0; MISURA_NON_TROVATA; date future ammesse come in Campo; extra params shown only if non-empty
Ruling (T14, to apply in fix round with review): in ModificaMisura un parametro obbligatorio della passata è obbligatorio solo se la misura ne ha già un valore (non si può svuotare), così una misura vecchia resta sempre modificabile anche se l'obbligo è arrivato dopo (spec §5.6) — cost if wrong: si può salvare una misura vecchia senza un valore diventato obbligatorio dopo
Task 14: dispatched reviewer (sonnet) on 8bcb1e0..6d974e8
Task 14: review → Approved (0 Critical/Important); Ruling obbligatorio da applicare
Ruling: fold into T14 fix round 1: (m1) i valori vuoti di parametri che la misura non aveva non si scrivono in `valori` (né in ModificaMisura né per le misure di ModuloOggi): una chiave vuota renderebbe il parametro "con dati" (non più eliminabile, solo archiviabile) — helper di dominio unico con test; (m2) letture oltre n_letture non si perdono: CampoNumero mostra max(n_letture, letture presenti); (m3) uscita difensiva se navigate(-1) non lascia la pagina; (m5) titolo "Misura non salvata."; (m6) test più forti (isInvalidated sui due giorni, doppio tocco su Elimina); (m7) data e ora vanno a capo se non ci stanno a 360px; (m8) id non uuid → "Misura non trovata." — cost if wrong: small
Task 14: minor (deferred): gesto indietro di sistema / menu perdono le modifiche di ModificaMisura senza conferma (brief: niente bozza); eliminaMisura non verifica righe cancellate (ok se già eliminata)
Task 14: fix round 1 implemented 2e1731f (759 tests) — valoriDaSalvare in dominio (ModificaMisura e ModuloOggi); CampoNumero max(n_letture, letture); obbligatori solo se già valorizzati; uuid check; re-review dispatched (sonnet)
Task 14: re-review fix round 1 → Approved
Task 14: minor (deferred): layout data/ora verificato solo come classi (controllo visivo a 360/390px); letture oltre n_letture senza nota esplicativa; chiavi vuote storiche restano (servirebbe migrazione dati)
Task 14: fix round 1/5 (8 addressed, 0 open; commits 8bcb1e0..2e1731f)
Task 14: complete (commits 8bcb1e0..2e1731f, review clean)
Task 15: dispatched implementer (opus)
Task 15: implementer DONE_WITH_CONCERNS d5b97cc (796 tests) — sezioni in src/components/impostazioni/, useAzione/useBozze, problemiParametro/problemiPassata estratti da validaBozza, API filtrano esperimento_id, Espandibile spostato in components; extra: ricontrollo pianteConDati al cambio trattamento, retry aggiunta piante con stessi id (23505 → ok se già presenti), sotto-campi di liste con dati non rimovibili
Ruling (T15, to apply in fix round with review): (a) guardia nel DB sul cambio di trattamento di una pianta con misure — migration 20261029000006 con trigger + test pgTAP, da verificare in locale (Docker assente nel cloud); (b) gli update di configurazione/esperimento verificano le righe toccate (`.select('id')`, errore chiaro se 0) — un "salvato" che non ha salvato nulla viola "mai silenzio sugli esiti" — cost if wrong: one migration + small API change
Task 15: dispatched reviewer (opus) on 8ef5624..d5b97cc
