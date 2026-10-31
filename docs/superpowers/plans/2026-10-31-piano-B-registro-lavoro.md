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
