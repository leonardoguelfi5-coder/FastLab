# FastLab v3 — Piano 1: stato finale (29/10/2026)

Branch: `claude/app-review-improvements-c26294` (tenuto uguale a `claude/wonderful-gates-8het2q`, quello della sessione cloud). Non fare merge su `main`: la v2 resta online.

- Piano: `docs/superpowers/plans/2026-10-28-fastlab-v3-piano-1-fondamenta.md`
- Spec: `docs/superpowers/specs/2026-10-28-fastlab-v3-esperimenti-design.md`
- Design: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`
- Registro completo, con tutte le decisioni e i punti minori: `docs/superpowers/plans/2026-10-29-piano-1-registro-lavoro.md`

## Tutti i task sono chiusi

| Task | Commit finale |
|---|---|
| 1 strumenti di test, date, numeri | 2c17dac |
| 2 schema DB | 403a080 |
| 3 RLS, inviti con codice invito, RPC | 4ce1365 |
| 4 client e layer API | a2465ea |
| 5 accesso, guscio, routing | f40047e |
| 6 pagina inviti | b13ccba |
| 7 dominio configurazione, modello Hydrochar | b87f9e5 |
| 8 creazione guidata | a96a01b |
| 9 lista esperimenti | 8f68640 |
| D sistema visivo "quaderno di campo" | a3f7028 |
| 10 dominio misure | 2815b55 |
| 11 campi del modulo | ae5b9bf |
| 12 schermata in campo | c54ce8b |
| 13 scheda pianta (3 giri di correzione nel cloud) | 8f358ff |
| 14 modifica ed eliminazione di misure passate | 2e1731f |
| 15 impostazioni dell'esperimento (+ migration 0006 con guardie) | 8a41d83 |
| 16 pulizia v2, README, vercel.json (parte senza DB) | ee35457 |
| Revisione finale (Opus, 3 aree) + giro unico di correzioni | 3395c67 |

Verifiche nel cloud sull'ultimo commit: `npx vitest run` 838 test verdi (47 file), `npx tsc -b` pulito, `npm run lint` 0 problemi, `npm run build` riuscito.

## Decisioni principali prese in questa fase ("Rulings")

Elenco completo nel registro (righe che iniziano con `Ruling`). Quelle che cambiano il comportamento visibile o i dati:

1. **Scheda pianta, bozze.** I valori non salvati restano in una bozza del browser (sessionStorage) e tornano con "Bozza ripristinata." + "Scarta", anche dopo il gesto indietro del telefono. Le bozze appartengono all'utente: si cancellano solo quando accede un utente diverso, mai alla scadenza della sessione.
2. **Mezzanotte.** Se si stanno scrivendo valori quando cambia il giorno (telefono bloccato e riaperto il mattino), la data di rilievo resta quella di ieri e compare l'avviso "non oggi" con "Usa oggi" (che chiede conferma).
3. **Niente misure doppie.** L'id di una misura nuova cambia solo dopo un salvataggio riuscito; per mezzo secondo dopo un salvataggio i pulsanti ignorano un secondo tocco; dopo un avviso min/max il "Salva comunque" non scatta col doppio tocco.
4. **Valori ricordati.** Correggere una misura vecchia non cambia i valori "ricorda tra piante".
5. **Misure senza chiavi vuote.** Si salvano solo i parametri compilati: un parametro aggiunto dopo non diventa "con dati" (e resta eliminabile) solo perché una misura è stata aperta e risalvata.
6. **Modifica di misure vecchie.** Un parametro diventato obbligatorio dopo non blocca la modifica di una misura vecchia; le letture oltre il nuovo `n_letture` restano visibili e non si perdono.
7. **Impostazioni.** "Archivia" non elimina mai; i sotto-campi di una lista con dati non si tolgono; il trattamento di una pianta con misure non si cambia; ogni modifica controlla di aver davvero toccato una riga ("Elemento non trovato: … Ricarica la pagina.").
8. **Database (migration `20261029000006_guardie_piante.sql`).** Guardia `PIANTA_CON_DATI` sul cambio di trattamento e guardia `ESPERIMENTO_NON_MODIFICABILE`: nessuna riga può essere spostata in un altro esperimento.
9. **Esci** chiude la sessione solo su questo dispositivo (il telefono in campo resta collegato).
10. **Inviti.** Revocare un invito già usato dice che non si può; invitare due volte la stessa email ha un messaggio chiaro.
11. **Creazione guidata.** Stesse regole delle impostazioni: nomi doppi di parametri, passate e fattori rifiutati; nomi ripuliti dagli spazi; avviso per i parametri in nessuna passata.
12. **Errori tardivi.** Se un salvataggio fallisce dopo che si è usciti dalla schermata, il messaggio resta finché non si chiude.
13. **vercel.json** nel branch v3 con la regola per le route della SPA (non tocca la v2).
14. Le skill superpowers e impeccable non erano installate nel cloud: stesso metodo (implementatore → revisore → correzioni) seguito a mano.

## Domanda aperta per l'utente

- I valori "ricorda tra piante" (es. Temp aria) oggi passano anche al giorno dopo, come nella v2: la prima pianta del mattino parte con la Temp aria di ieri. Valgono solo per la stessa data di rilievo?

## Da verificare in locale (Docker + Supabase locale, porte +100: API 54421, DB 54422)

### 1. Test del database (mai eseguiti dopo il Task 14)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

```bash
npm run test:db
```

- La migration `20261029000006_guardie_piante.sql` si applica da zero, dopo le altre.
- Passano tutti i file: `rls.test.sql` (modificato: ora si aspetta `ESPERIMENTO_NON_MODIFICABILE`), `inviti.test.sql`, `rpc.test.sql` e il nuovo `guardie.test.sql` (10 test).

### 2. Prova nel browser con il DB locale (`npm run dev`, http://localhost:5173)

- Registrazione su invito (codice giusto, codice sbagliato, email già registrata) e primo amministratore come da README.
- Creazione dal modello Hydrochar, da zero e con Duplica; nomi doppi rifiutati.
- Passata Termometro su 3 piante di seguito (Temp aria resta precompilata); Fenologici sulla pianta 1 in due giorni diversi (palchi progressivi); seconda misura nello stesso giorno → `×2`.
- DevTools "Offline" durante un salvataggio: errore, dati nel modulo, "Riprova".
- Storia della pianta → modifica di una misura di una settimana fa (valore e data) → la storia si aggiorna; eliminazione → sparisce dalla griglia.
- Impostazioni: aggiungere un parametro a una passata (compare nel modulo); archiviare un parametro con dati (sparisce dai moduli, resta nella storia "(archiviato)"); rimuovere una pianta con dati (non si può); cambiare il trattamento di una pianta con misure (rifiutato); eliminare una passata con misure (messaggio chiaro); salvare la sezione Generale (controlla che `.select('id')` funzioni su `esperimenti`).
- Inviti: crea, "Copia messaggio", revoca, revoca di un invito già usato.
- Reset della password con l'SQL del README; Esci su un browser mentre un altro resta collegato.
- Larghezza 360 e 390 px: data/ora in Modifica misura, tabella trattamenti del wizard, pulsanti "Salva" con contorno nelle impostazioni, doppia ✓ nei toast di salvataggio.

### 3. Prova sul telefono (iOS e Android)

- La barra d'azione resta sopra la tastiera numerica; il toast sopra la barra; il campo attivo resta visibile (eventuale `scroll-padding` in `src/index.css`).
- Tastiera decimale con la virgola; Gboard: digitare e dettare "24,5"; il segno meno sui parametri con negativi.
- Selezione dei valori precompilati al tocco (iOS).
- Doppio tocco reale su "Salva" e "Salva e vai" con Wi-Fi veloce.
- App lasciata aperta oltre la mezzanotte o ripresa dallo sfondo: avviso "non oggi", "Usa oggi".
- Sessione scaduta durante una passata: messaggio chiaro, nuovo accesso, bozza ripristinata.
- Selettori nativi (trattamento, tipo, data) e interruttori da 44 px.
