# FastLab v3, Piano C: Diario e Foto (piano di implementazione)

> **Per gli agenti esecutori:** stesso metodo dei Piani A e B (un implementatore alla volta, revisori su copia `git archive`, registro). I passi usano checkbox (`- [ ]`).

**Obiettivo:** le icone 📒 **Diario** e 📷 **Foto** diventano sezioni vere:
- note datate collegate all'esperimento, a trattamenti o a piante;
- promemoria per una data futura, che il giorno giusto compaiono in **Oggi** con la spunta;
- foto da galleria o fotocamera, compresse nel browser e salvate in Supabase Storage, collegate a piante e note;
- note e foto entrano nella **storia della pianta**;
- la scheda della pianta e la misura sequenziale permettono di aggiungere una foto (o una nota) al volo.

**Spec:** `docs/superpowers/specs/2026-10-29-fastlab-v3-home-strumenti-design.md`:
- §5.7 (Diario), §5.8 (Foto), §5.3 (promemoria in Oggi), §5.4.4 e §5.4.6 (storia e pulsanti della scheda), §5.2.7 (📷 nella misura);
- §4: un'eliminazione si può annullare per qualche secondo;
- §6.1: note e foto con `esperimento_id`, RLS per membro, FK composte.

Per il resto valgono la spec precedente `2026-10-28-fastlab-v3-esperimenti-design.md` (foto: compressione circa 1600 px e 300 KB, Storage con RLS per esperimento, indicatore dello spazio, archivio .zip) e `DESIGN.md`/`PRODUCT.md`.

**Fuori da questo piano:** Dataset ed Esporta (Piano D). I segni delle note sui grafici arrivano con il Piano D.

## Vincoli globali

Valgono tutti quelli dei Piani 1, A e B:
- italiano, mai trattini lunghi;
- nessun merge su `main`;
- migration nuove dopo `20261031000011`;
- id generati dal client con `nuovoId()` e upsert per id;
- conferme prima di scartare;
- `controllaRighe` sugli update e sui delete;
- RLS per membro su ogni tabella nuova, niente per `anon`, `creato_da` non aggiornabile;
- guardia `ESPERIMENTO_NON_MODIFICABILE` anche sulle tabelle nuove;
- stile `DESIGN.md`.

## Decisioni del piano (da verificare con l'utente)

1. **Promemoria.** Una nota è un promemoria se, quando la si salva, la sua data è **dopo oggi**: si salva `promemoria = true`. Resta promemoria anche quando la data arriva. Si può anche spuntare o togliere a mano con la casella `Ricordamelo quel giorno`.
   - In Oggi compaiono i promemoria con data ≤ oggi e non ancora fatti.
   - La spunta ✓ salva `fatto_il` (data e ora).
   - Nel Diario un promemoria fatto resta barrato, con `fatto il GG/MM`, ed è eliminabile.
2. **Collegamenti di una nota:** tutto l'esperimento (nessun collegamento), uno o più trattamenti, una o più piante. Trattamenti e piante insieme non si mescolano: la scelta è "Esperimento / Trattamenti / Piante".
3. **Foto.**
   - Si comprimono nel browser: lato lungo al massimo 1600 px, JPEG con qualità che scende da 0,85 finché il file non sta sotto circa 350 KB, con un minimo di qualità 0,6.
   - La data è quella di scatto dai metadati EXIF, se c'è; altrimenti oggi. È sempre modificabile.
   - Una foto è collegata a una pianta, a una nota o solo all'esperimento.
   - Bucket Storage privato `foto`, percorso `<esperimento_id>/<foto_id>.jpg`, letto con URL firmati.
4. **Eliminare con "Annulla".**
   - La nota o la foto sparisce subito e compare il toast `Nota eliminata.` / `Foto eliminata.` con `Annulla` per 5 secondi.
   - Solo allo scadere si elimina davvero: prima la riga, poi il file nello Storage.
   - Se l'eliminazione vera fallisce, l'elemento ricompare con un messaggio d'errore.
5. **Spazio.**
   - Le Impostazioni mostrano lo spazio usato dalle foto dell'esperimento e del progetto, contro 1 GB del piano gratuito, con un avviso oltre l'80%.
   - L'**archivio .zip** è facoltativo: per un esperimento concluso si scaricano le foto in un .zip.
   - **"Libera lo spazio"** elimina i file delle foto dopo una doppia conferma (scrivere il nome dell'esperimento) e solo dopo un download completato nella stessa sessione. Le righe restano, segnate come archiviate.

## Struttura dei file

```
supabase/migrations/20261101000012_note_foto.sql     note, note_piante, note_trattamenti, foto, guardie, RLS, bucket e policy dello Storage
supabase/tests/note_foto.test.sql
scripts/db-senza-docker/stub-supabase.sql            + schema storage minimo (buckets, objects, foldername) per i pgTAP
src/domain/tipi.ts                                   Nota, Foto
src/domain/note.ts, src/domain/foto.ts (+ test)     promemoria del giorno, voci della storia, nomi dei file, compressione (parti pure)
src/api/note.ts, src/api/foto.ts (+ test)           CRUD, upload, URL firmati, spazio
src/lib/immagini.ts (+ test)                        ridimensiona e comprimi (canvas), data EXIF
src/pages/Diario.tsx, src/pages/Foto.tsx             le due sezioni (al posto di InArrivo)
src/components/note/*, src/components/foto/*         editor della nota, scelta dei collegamenti, aggiungi foto, galleria, visore
```

---

### Task C1: database di note e foto (Opus)

- Migration `20261101000012_note_foto.sql`:
  - `note (id uuid pk (dal client), esperimento_id, data date not null, testo text not null check (btrim(testo) <> ''), promemoria boolean not null default false, fatto_il timestamptz, creato_da default auth.uid(), creato_il, aggiornato_il)`;
  - `note_piante (nota_id, pianta_id, esperimento_id)` e `note_trattamenti (nota_id, trattamento_id, esperimento_id)`: FK composte con `on delete cascade` dalla nota, e FK verso piante e trattamenti;
  - `foto (id uuid pk (dal client), esperimento_id, data date not null, percorso text not null unique, larghezza int, altezza int, byte int, pianta_id null, nota_id null, archiviata boolean not null default false, creato_da, creato_il)`: FK composte (pianta, nota) con `on delete set null` sulla nota;
  - trigger `aggiornato_il` sulle note; guardia `guardia_esperimento_id` su tutte e quattro le tabelle; RLS `is_membro(esperimento_id)`; revoke da anon; update senza `creato_da` (grant per colonna come in 0005);
  - una pianta con note o foto si può ancora eliminare? No: la FK verso piante blocca (`23503`), come per le misure, e il messaggio esistente lo spiega;
  - bucket `foto` privato (`insert into storage.buckets … on conflict do nothing`), con policy su `storage.objects` per `authenticated`: select, insert e delete se `bucket_id = 'foto'` e `public.is_membro(((storage.foldername(name))[1])::uuid)`. Nessun update.
- Stub dei test: aggiungi a `scripts/db-senza-docker/stub-supabase.sql` lo schema `storage` minimo (`buckets`, `objects` con `bucket_id`, `name`, `owner`, RLS attiva, `foldername(name)` come in Supabase), così i pgTAP provano le policy.
- pgTAP `note_foto.test.sql`:
  - un membro crea e legge note e foto;
  - un altro utente non vede né tocca nulla, nemmeno gli oggetti dello Storage di un altro esperimento;
  - anon niente;
  - un collegamento a una pianta di un altro esperimento → `23503`;
  - eliminare una nota toglie i collegamenti e lascia le foto senza nota;
  - cambiare `esperimento_id` → `ESPERIMENTO_NON_MODIFICABILE`;
  - testo vuoto → `23514`;
  - i test generali di `rls.test.sql` restano verdi (RLS su ogni tabella, niente per anon).
- Rigenera `supabase/online/schema-completo.sql`.
- Commit: `feat(db): note, promemoria e foto con le loro sicurezze`.

### Task C2: dominio e API delle note

- Tipi `Nota { id; data; testo; promemoria; fatto_il: string | null; pianta_ids: string[]; trattamento_ids: string[] }`, mapper, `src/api/note.ts`:
  - `listaNote(espId)`, ordinate per data decrescente e poi per creazione;
  - `salvaNota(espId, nota)`: upsert della nota, poi sostituzione dei collegamenti (upsert dei nuovi e delete dei tolti, come `salvaStrumento`);
  - `eliminaNota(espId, id)` con `controllaRighe`;
  - `segnaFatto(espId, id, fatto: boolean)`.
- Hook `useNote(espId)`, chiave `['note', espId]`.
- Dominio `src/domain/note.ts`:
  - `ePromemoriaAlSalvataggio(data, oggi)`;
  - `promemoriaDelGiorno(note, oggi)`: data ≤ oggi, promemoria, non fatti;
  - `noteDellaPianta(note, pianta)`: collegate alla pianta, al suo trattamento o a tutto l'esperimento;
  - `descriviCollegamento(nota, config)`: es. `Tutto l'esperimento`, `S1 + HC, W1`, `Piante 3, 12`.
- Test (TDD), compresi i limiti di mezzanotte e le date locali.
- Commit: `feat: note e promemoria (dominio e API)`.

### Task C3: pagina Diario

- `src/pages/Diario.tsx` su `/esperimenti/:espId/diario`, al posto di `InArrivo`.
- `AppShell` `Diario`. Elenco per data, dalla più recente, in righe da quaderno: data in Geist Mono, testo (troncato a 3 righe, si apre al tocco), collegamento, eventuale `promemoria` e stato fatto (barrato, `fatto il GG/MM`).
- `+ Nuova nota` nella `BarraAzioni` apre l'editor in pagina:
  - testo (textarea);
  - data (di base oggi, anche passata o futura);
  - collegamento: Esperimento / Trattamenti / Piante, con scelta multipla, ricerca per le piante e Geist Mono per le etichette;
  - casella `Ricordamelo quel giorno`, spuntata da sola se la data è futura, ma modificabile.
- Salvataggio con `nuovoId()` e upsert, bozza in sessionStorage come le altre (chiave `fastlab-bozza:nota:<espId>:<id>`), conferma uscendo con modifiche, `toastSalvato`.
- Modifica ed eliminazione con "Annulla" (Decisione 4).
- Test:
  - creare;
  - modificare;
  - promemoria automatico con data futura;
  - spunta fatto;
  - eliminazione annullata (nessun delete) e confermata (delete dopo 5 s, con timer finti);
  - errore di rete che lascia la bozza.
- Commit: `feat: diario con note e promemoria`.

### Task C4: foto (immagini, Storage, API)

- `src/lib/immagini.ts`:
  - `comprimi(file: File): Promise<{ blob; larghezza; altezza }>` con canvas, Decisione 3, testato con un canvas finto;
  - `dataDiScatto(file): Promise<string | null>` dai metadati EXIF (DateTimeOriginal), con una lettura minima dell'APP1 dei JPEG o una libreria leggera e diffusa (es. `exifr`, solo la parte "lite"; documenta la scelta). Test con un JPEG di prova piccolo nei test.
- `src/api/foto.ts`:
  - `caricaFoto(espId, { file, piantaId?, notaId?, data })`: comprime, poi `storage.from('foto').upload(percorso, blob)`, poi insert della riga. Se l'insert fallisce, rimuove il file caricato. L'id viene da `nuovoId()`: un nuovo tentativo usa lo stesso id e lo stesso percorso (upsert sul file).
  - `listaFoto(espId)`, `urlFoto(percorsi[])` con URL firmati (validità 1 ora, in cache con TanStack Query), `eliminaFoto(espId, foto)`: prima la riga, poi il file; se il file non si elimina, lo si segnala ma la riga è già andata.
  - `spazioFoto(espId)`: somma dei `byte` dell'esperimento e di tutto il progetto visibile.
- Test con il mock di Supabase: ordine delle operazioni, pulizia dopo un errore, nessun doppione su un nuovo tentativo.
- Commit: `feat: foto compresse nel browser e salvate nello Storage`.

### Task C5: interfaccia delle foto

- `src/components/foto/AggiungiFoto.tsx`: pulsante con due scelte, `Scatta` (`<input type="file" accept="image/*" capture="environment">`) e `Dalla galleria` (`multiple`).
  - Per ogni file: compressione, data, caricamento, con stato visibile (`Caricamento 2 di 5…`).
  - Gli errori sono per singola foto, con `Riprova`.
  - Prop `piantaId?`, `notaId?`.
- `src/pages/Foto.tsx` su `/esperimenti/:espId/foto`:
  - galleria per data (griglia di miniature quadrate, bersagli ≥ 44 px), filtri per pianta (ricerca) e per trattamento, `+ Aggiungi foto`;
  - visore a schermo intero con data modificabile, collegamento, elimina (con Annulla) e scorrimento tra le foto.
- **Scheda della pianta:** sezione `Foto` con le miniature della pianta e `Aggiungi foto`.
- **Misura sequenziale (`MisuraPianta`):** un pulsante piccolo 📷 `Aggiungi foto a questa pianta` nell'intestazione, che non sta nella `BarraAzioni` e non tocca il modulo.
- **Editor della nota (Diario):** `Aggiungi foto` alla nota, e le miniature delle foto della nota.
- Test:
  - galleria, filtri e visore;
  - aggiunta dalla scheda con `piantaId`;
  - il pulsante della misura non interferisce con le protezioni del modulo (bozze, doppio tocco);
  - eliminazione con Annulla.
- Commit: `feat: galleria e aggiunta di foto da scheda, misura e diario`.

### Task C6: note e foto in Oggi, nella storia e nelle Impostazioni

- **Oggi:**
  - sezione `Promemoria` in cima: promemoria del giorno (`promemoriaDelGiorno`), con la spunta ✓ (bersaglio 44 px) che li segna fatti e li toglie dall'elenco, con "Annulla" per 5 secondi;
  - il **numerino** della home conta i promemoria del giorno più i valori da sistemare (aggiorna testo accessibile e test).
- **Storia della pianta** (`StoriaPianta`): nella stessa linea del tempo, per data, le misure, le note collegate alla pianta (anche via trattamento ed esperimento, con il collegamento indicato) e le foto della pianta (miniature che aprono il visore).
- **Scheda della pianta:** `Aggiungi nota` porta all'editor del Diario già collegato alla pianta (con ritorno alla scheda).
- **Impostazioni:** riga `Spazio delle foto` (Decisione 5) con l'avviso oltre l'80%.
- Commit: `feat: promemoria in Oggi, note e foto nella storia della pianta`.

### Task C7: archivio .zip e "Libera lo spazio"

- Solo per esperimenti **conclusi**, nelle Impostazioni: `Scarica le foto (.zip)`.
  - Scarica i file con URL firmati e li impacchetta con una libreria .zip diffusa (es. `jszip` o `fflate`; documenta la scelta).
  - Nomi dei file: `<data>_<pianta o nota>_<id breve>.jpg`.
  - Dentro c'è anche un `foto.csv` con data, pianta, trattamento, nota e nome del file.
- `Libera lo spazio`:
  - compare solo dopo un download completato nella stessa sessione;
  - chiede di scrivere il nome dell'esperimento;
  - elimina i file dallo Storage e segna le righe `archiviata = true`. La galleria mostra allora un segnaposto `Archiviata nel .zip del GG/MM`.
- Test: nessun "Libera" senza download; la conferma richiede il nome esatto; errore a metà → righe e file coerenti (si segna archiviata solo la foto il cui file è stato davvero eliminato).
- Commit: `feat: archivio delle foto in .zip e spazio liberato`.

### Task C8: pulizia, README, verifica, messa online

- README: Diario, promemoria, Foto, spazio e archivio.
- Verifica: test-db, `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`.
- Il controller applica la migration al progetto Supabase online (bucket compreso) e fa il deploy di produzione.
- Commit: `docs: README del Piano C`.

## Focus di revisione

1. **Sicurezza dello Storage:**
   - nessun utente legge, scrive o elimina file di esperimenti di cui non è membro;
   - il percorso del file non si può costruire per entrare in un altro esperimento;
   - URL firmati brevi;
   - niente bucket pubblico.
2. **Dati persi in silenzio:**
   - "Annulla" deve davvero annullare;
   - un'eliminazione che fallisce non deve far sparire nulla;
   - un upload a metà non lascia righe senza file né file senza riga (o li ripulisce);
   - le bozze delle note come quelle delle misure;
   - "Libera lo spazio" solo dopo un download riuscito.
3. **Telefono:**
   - fotocamera e galleria su iOS e Android, foto verticali (orientamento EXIF);
   - foto grandi, oltre 10 MB, senza bloccare la pagina;
   - il pulsante 📷 nella misura non rompe il flusso del giro.
4. **Promemoria e date:**
   - date locali;
   - mezzanotte;
   - un promemoria fatto sparisce da Oggi e resta barrato nel Diario;
   - il numerino coerente con le righe.
