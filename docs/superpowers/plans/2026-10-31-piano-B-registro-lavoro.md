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
