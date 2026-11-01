# Registro del Piano C: Diario e Foto

Piano: `docs/superpowers/plans/2026-11-01-fastlab-v3-piano-C-diario-foto.md` (scritto dal controller dalla spec §5.7, §5.8, §5.3, §5.4, su richiesta dell'utente "Continua il piano B e quando finisci vai in ordine con gli altri piani").
Branch: `claude/app-review-improvements-c26294`. Metodo come i Piani A e B (un implementatore alla volta, revisori su copia `git archive`, commit per percorsi). Opus per il Task C1 (sicurezza di tabelle e Storage) e per la revisione finale; Sonnet per il resto.

## Decisioni del controller (nel piano, da verificare con l'utente)
Ruling: promemoria = nota salvata con data futura (casella "Ricordamelo quel giorno" modificabile); in Oggi quelli con data ≤ oggi non fatti; spunta → `fatto_il`; nel Diario restano barrati — cost if wrong: copy e una casella.
Ruling: collegamento di una nota: Esperimento / Trattamenti / Piante (uno dei tre) — cost if wrong: small.
Ruling: foto compresse nel browser (lato lungo ≤ 1600 px, JPEG fino a ~350 KB, qualità minima 0,6), data EXIF o oggi; bucket privato `foto`, percorso `<esperimento_id>/<foto_id>.jpg`, URL firmati — cost if wrong: qualità delle foto.
Ruling: eliminazione con "Annulla" per 5 s, poi eliminazione vera (prima la riga, poi il file) — cost if wrong: nessuno.
Ruling: archivio .zip e "Libera lo spazio" solo per esperimenti conclusi, solo dopo un download riuscito nella stessa sessione e con il nome dell'esperimento scritto per conferma — cost if wrong: un passaggio in più.

## Avanzamento
