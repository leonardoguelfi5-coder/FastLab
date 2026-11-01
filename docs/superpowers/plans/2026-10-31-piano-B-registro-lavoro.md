# Registro del Piano B: Piante e Oggi

Piano: `docs/superpowers/plans/2026-10-31-fastlab-v3-piano-B-piante-oggi.md` (scritto dal controller dalla spec §5.3, §5.4, su richiesta dell'utente "Vai con il piano B").
Branch: `claude/app-review-improvements-c26294`. Base: 89cb4ff (Piano A completo e online su https://fastlab-v3.vercel.app).
Metodo: come il Piano A (un implementatore alla volta, revisori su copia `git archive`, registro qui). Sonnet per i task, Opus per la revisione finale e un solo giro di correzioni.

## Decisioni del controller (nel piano, da verificare con l'utente)
Ruling: "molto fuori dal gruppo" = leave-one-out contro le altre piante del trattamento nella stessa data, almeno 3 altre piante, ds > 0, |x − media| > 3 ds. Senza leave-one-out con 6 piante la soglia non scatta mai (massimo ≈ 2,04 ds) — cost if wrong: soglia da ritoccare.
Ruling: nell'elenco per trattamento la media è quella degli ultimi valori delle piante per un parametro scelto con un selettore `Valore mostrato` (di base il primo valore dello strumento dello store, altrimenti del primo strumento attivo) — cost if wrong: cambia solo la riga di riepilogo.
Ruling: avviso "<Strumento> non misurato da N giorni" solo se l'esperimento ha misure di quello strumento più recenti dell'ultima della pianta; "mai misurato" se la pianta non ne ha ma altre sì — cost if wrong: copy.
Ruling: la scheda della pianta non contiene più il modulo di misura (si misura da "Nuova misura"); azione "Misura questa pianta" → scelta strumento → MisuraPianta — cost if wrong: un tocco in più dalla scheda.
Ruling: promemoria di Oggi e foto/note della scheda arrivano con il Piano C (Diario e Foto); il numerino su Oggi conta per ora solo i valori da sistemare — cost if wrong: nessuno.
Ruling: B1 (RPC) e B2 (dominio) affidati allo stesso implementatore in sequenza (piccoli, un solo implementatore nel checkout) — cost if wrong: nessuno.

## Avanzamento
Task B1+B2: dispatched implementer (sonnet), BASE 89cb4ff
Task B1+B2: implementatore (sonnet) DONE e9eb16e (RPC `ultime_misure_piante`, 196 pgTAP emulato) + 47d43b0 (statistiche, 1342 Vitest); ds campionaria (n−1) sulle altre piante; `giorniTra` in lib/date.ts (giorni di calendario, ora legale ok)
Ruling: accettata la deviazione: `daSistemare` considera solo i parametri `numero`, non le liste (contare i palchi come valore sospetto sarebbe un falso allarme) — cost if wrong: togliere un filtro
Task B1+B2: dispatched reviewer (sonnet) su copia 80871ab..47d43b0; Task B3 dispatched implementer (sonnet), BASE 47d43b0
Task B1+B2: review (sonnet) → Approved (0 Critical/Important), 1342 Vitest, 196 pgTAP su copia; numeri ricalcolati a mano; 6 mutazioni → tutte intercettate dai test
Task B1+B2: minor 1 corretto dal controller (ds sotto una tolleranza relativa vale 0: valori uguali a meno degli arrotondamenti delle medie davano un falso "fuori dal gruppo"), con test; refuso nel test
Task B1+B2: minor (deferred): `mediaPerTrattamento` usa solo l'ultima data per coppia pianta/strumento (se quel giorno il parametro è vuoto la pianta non conta; visibile dal conteggio n/N); `piantaId` inutilizzato in `valoriDelTrattamento`
Task B1+B2: complete (commits 80871ab..47d43b0 + correzione del controller, review clean)
Task B3: implementatore (sonnet) DONE 1c944aa — 1380 Vitest, build OK; `src/domain/elencoPiante.ts` (parametriMostrabili, parametroDiBase, ultimoValorePerPianta, filtraPiante); `formattaMedia` in lib/numeri.ts; `Espandibile.riassunto` ora ReactNode; selettore solo su parametri `numero`; con la ricerca i blocchi vuoti spariscono e quelli trovati si aprono
Task B3: dispatched reviewer (sonnet) su copia f870e0a..1c944aa; Task B4 dispatched implementer (sonnet), BASE 1c944aa
Task B3: review (sonnet) → Approved (0 Critical/Important), 1380 Vitest, build OK su copia; mutazione della ricerca intercettata
Task B3: minor M1–M3 corretti dal controller: la ricerca mostra anche la pianta che Invio aprirebbe ("035" → 35, prima diceva "Nessuna pianta trovata."); hover delle righe nel blocco aperto come ElencoOggi (`bg-riga/40`, `active:bg-riga/60`); etichette lunghe troncate (`min-w-14 max-w-24 truncate`)
Task B3: minor (deferred): `ultime_misure_piante` senza paginazione (limite 1000 righe di PostgREST: con ~100 piante × 10 strumenti la risposta si tronca; n/N l'unico indizio)
Task B3: complete (commits f870e0a..1c944aa + correzioni del controller, review clean)
Task B4: implementatore (sonnet) DONE_WITH_CONCERNS bc0b974 (63 test del modulo spostati in MisuraPianta.test.tsx: 45 → 108) + 330de15 (scheda nuova: UltimiValori, AvvisiMancanti, DatiPianta, MisuraQuestaPianta) — 1422 Vitest, build OK; `RiquadroOggi.avanti` obbligatorio; `daQuanto` e `formattaConUnita` in lib
Ruling: accettate le deviazioni B4: con un solo strumento attivo "Misura questa pianta" parte subito; senza strumenti attivi c'è il link alle Impostazioni; liste senza confronto; errori di confronto e avvisi silenziosi (aiuti secondari); niente BannerData nella scheda — cost if wrong: small
Task B4: dispatched reviewer (sonnet) su copia eca6a12..330de15; Task B5 dispatched implementer (sonnet), BASE 330de15
Task B4: review (sonnet) → Needs fixes: (I1) "Misura questa pianta" naviga senza lo stato di arrivo: il secondo tocco di un doppio tocco cade sul "Salva" del modulo (con valori mantenuti salva una misura non guardata); (I2) test non portato: "le misure della pianta non si caricano → niente modulo, Riprova"
Ruling: T4-B fix round 1 (dopo la fine del B5, un implementatore alla volta) = I1 (state `primoCampo` come FineGiro, test del doppio tocco con mantenuto), I2 (test portato in MisuraPianta), minor: etichetta in Geist Mono in DatiPianta, via `piantaSuccessiva` e i suoi test, `conUnita` di ElencoPiante → `formattaConUnita` — cost if wrong: small
Task B5: implementatore (sonnet) DONE 564d4be — 1466 Vitest, build OK; `righeStrumenti`/`RigaStrumento` in giro.ts, `VoceStrumento`, `useAvviaMisura` estratti da SceltaStrumento senza cambiarne il comportamento; numerino su Oggi (attenzione velato, testo sr-only); "Oggi" = giorno di calendario; il tocco su uno strumento riprende il giro della data di rilievo (con BannerData se diversa); `daScheda` riusato per tornare a Oggi da ModificaMisura; la home legge sempre le misure di oggi per il numerino
Task B5: dispatched reviewer (sonnet) su copia; Task B4 fix round 1 dispatched (implementatore B4), BASE 564d4be
Task B4: fix round 1 implemented f2fc283 (1467 Vitest, build OK): stato di arrivo `primoCampo` su "Misura questa pianta" (2 test, rossi prima della correzione), test "misure della pianta non lette → niente modulo, Riprova" portato in MisuraPianta, etichetta in Geist Mono, via `piantaSuccessiva`, `formattaConUnita` in ElencoPiante
Ruling: la correzione del B4 è verificata dal controller sul diff (piccola e mirata, test rossi prima e verdi dopo) invece di un'altra ri-revisione, per contenere i costi chiesti dall'utente; la vede comunque la revisione finale — cost if wrong: un difetto scoperto più tardi
Task B4: fix round 1/5 (5 addressed, 0 open); complete (commits eca6a12..f2fc283)
Task B5: review (sonnet) → Approved (0 Critical/Important), 1466 Vitest, build OK su copia; scelta 2 (il tocco riprende il giro della data di rilievo) da tenere: portare la data a oggi in silenzio salverebbe sul giorno sbagliato, e il banner la mostra
Task B5: minor 2 corretto dal controller (la riga della data di rilievo si cerca per strumento, non per indice)
Task B5: minor (deferred): con data di rilievo diversa da oggi la riga mostra il progresso di oggi ma il tocco riprende il giro dell'altra data (spiegato dal banner); due valori anomali nello stesso trattamento e giorno si coprono a vicenda; con più misure in un giorno il tocco apre l'ultima, il valore mostrato è la media del giorno
Task B5: complete (commits 1e1ed8b..564d4be + correzione del controller)
Task B6: README (Oggi, Piante, scheda, test del DB, struttura) aggiornato dal controller; verifica: 196 pgTAP PASS (emulato), 1467 Vitest, tsc 0, lint 0, build OK
Task B6: migration 0011 applicata al progetto Supabase online (connettore); deploy di produzione di fastlab-v3 dal ramo
Final review (opus): "Pronto dopo correzioni", 0 Critical; 196 pgTAP, 1467 Vitest, tsc/lint/build puliti; copertura del modulo spostata per intero (66 → 109 test in MisuraPianta); (I1) `ultimeMisurePiante` non invalidata dopo un salvataggio (elenco piante vecchio fino a 30 s); (I2) la soglia 3 ds con leave-one-out su 3–6 piante dà 4–12% di falsi allarmi per valore (≈ 20 voci "Da sistemare" in una giornata Hydrochar)
Ruling (cambia il Ruling della soglia): "molto fuori dal gruppo" = scarto > max(5 ds, 20% della media delle altre piante), con le stesse condizioni (≥ 3 altre piante, ds > 0). Simulato dal revisore: falsi allarmi SPAD 5,2% → 0,25%, temperature 0%, errori ×10/÷10 sempre presi. Va detto all'utente: soglia da ritoccare dopo l'uso in campo — cost if wrong: qualche errore di battitura piccolo non segnalato
Ruling: giro unico di correzione finale B = I1, I2 (costanti, commento, README, 4 test sul confine riscritti), M1 (nessun avviso "da 0 giorni" con date future), `valoriDelTrattamento` → number[]; restano rimandati: freccia indietro di MisuraPianta sempre a "Nuova misura" (M2), media per trattamento sull'ultima data per pianta, RPC senza paginazione, le scelte B5 — cost if wrong: small
Final fix round B: dispatched implementer (sonnet)
Final fix round B: implemented 4cd2f10 (1475 Vitest, tsc/lint/build puliti; test nuovi rossi prima della correzione): invalidazione di `ultimeMisurePiante` dopo il salvataggio, soglia max(5 ds, 20%) con i test sul confine riscritti, niente avvisi "da 0/-1 giorni", `valoriDelTrattamento` → number[]
Piano B: COMPLETE (commits 80871ab..4cd2f10 + registro). Online: migration 0011 applicata al progetto Supabase "FastLab", deploy di produzione di fastlab-v3 dopo il giro finale.

## Verifiche da fare (Piano B)
- In locale (riferimento): `npx supabase db reset` + `npm run test:db` → atteso 8 file, 196 test, PASS (nuovo: `ultime_misure_piante.test.sql`).
- Sul telefono: elenco Piante (ricerca, selettore, medie), scheda della pianta (ultimi valori, frecce, confronto discreto, avvisi, "Misura questa pianta"), Oggi (strumenti, da sistemare) e il numerino sulla home; soglia dei valori da sistemare da valutare dopo qualche giornata di uso reale.
