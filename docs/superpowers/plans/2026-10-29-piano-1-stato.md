# FastLab v3 — Piano 1: stato per riprendere il lavoro (29/10/2026)

Branch: `claude/app-review-improvements-c26294`. Non fare merge su `main`, perché la v2 resta online.

- Piano: `docs/superpowers/plans/2026-10-28-fastlab-v3-piano-1-fondamenta.md`
- Spec: `docs/superpowers/specs/2026-10-28-fastlab-v3-esperimenti-design.md`
- Design: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`
- Registro dettagliato: `docs/superpowers/plans/2026-10-29-piano-1-registro-lavoro.md`. Contiene le decisioni ("Ruling") e i punti minori rimandati, che vanno passati alla revisione finale.

Metodo: superpowers:subagent-driven-development, cioè per ogni task un implementatore, poi un revisore, poi i giri di correzione.

## Fatto e approvato

| Task | Commit finale |
|---|---|
| 1 strumenti di test, date, numeri | 2c17dac |
| 2 schema DB | 403a080 |
| 3 RLS, inviti con **codice invito**, RPC | 4ce1365 |
| 4 client e layer API | a2465ea |
| 5 accesso, guscio, routing | f40047e |
| 6 pagina inviti | b13ccba |
| 7 dominio configurazione, modello Hydrochar | b87f9e5 |
| 8 creazione guidata (bozza persistente) | a96a01b |
| 9 lista esperimenti | 8f68640 |
| D sistema visivo "quaderno di campo" (aggiunto) | a3f7028 |
| 10 dominio misure | 2815b55 |
| 11 campi del modulo | ae5b9bf |
| 12 schermata in campo | c54ce8b |

## In corso

- **Task 13, scheda pianta.** Il giro di correzione 1 è fatto (a0c8297, 667 test). **Manca la ri-revisione** dei 7 punti del giro 1: data che cambia durante una modifica, conferma "Scartare i valori non salvati?" e bozza in sessionStorage, finestra di 500 ms su "Salva comunque", `ricorda` solo per misure nuove, `[salvata, ...misure]` alla pianta successiva, prefetch, `replace: true`.

## Da fare

1. Task 14: modifica ed eliminazione di misure passate.
2. Task 15: impostazioni dell'esperimento.
3. Task 16: pulizia della v2 e README. I test del DB richiedono Docker e lo stack Supabase locale (porte +100: API 54421, DB 54422).
4. Revisione finale dell'intero branch con il modello più capace, a cui passare i "minor (deferred)" del registro.
5. Controlli su un telefono vero:
   - la barra d'azione deve restare sopra la tastiera numerica (iOS e Android);
   - il toast deve comparire sopra la barra;
   - la selezione dei valori precompilati deve funzionare su iOS.

## Note per una sessione cloud

- Docker non è disponibile nel cloud: `npm test`, `npx tsc -b` e `npm run build` funzionano, `npm run test:db` no. I test pgTAP restano da eseguire in locale.
- I comandi lunghi vanno eseguiti in background con log su file, per evitare che il watchdog interrompa la sessione.
