# FastLab v3, Piano B: Piante e Oggi (piano di implementazione)

> **Per gli agenti esecutori:** stesso metodo del Piano A (implementatore → revisore → giri di correzione, registro). I passi usano checkbox (`- [ ]`).

**Obiettivo:** le icone 🌿 **Piante** e 📅 **Oggi** della home diventano sezioni vere:
- **Piante:** elenco raggruppato per trattamento, con una ricerca;
- **Scheda della pianta:** ultimi valori, confronto discreto con il trattamento, avvisi di dati mancanti, storia e dati della pianta;
- **Oggi:** gli strumenti con il progresso del giorno e da quanto non si misurano, e i valori "da sistemare".

**Spec:** `docs/superpowers/specs/2026-10-29-fastlab-v3-home-strumenti-design.md` §5.3, §5.4, §6.2 (ultimo punto), §6.3; anti-obiettivi §4 ("Statistiche invadenti"). Design: `DESIGN.md`, `PRODUCT.md`. Decisioni da non rompere: registri del Piano 1 e del Piano A.

**Fuori da questo piano:**
- Diario e Foto (Piano C): i **promemoria** di Oggi, i pulsanti "foto" e "nota" della scheda, le foto e le note nella storia;
- Dataset ed Esporta (Piano D).

Di conseguenza il numerino su Oggi conta, per ora, solo i valori da sistemare.

## Vincoli globali

Valgono tutti quelli del Piano A:
- italiano, mai trattini lunghi;
- nessun merge su `main`;
- migration nuove dopo `20261029000010`;
- protezioni del Piano 1 e del Piano A;
- stile `DESIGN.md`: righe da quaderno, Geist Mono per i dati, un solo inchiostro, bersagli ≥ 44 px, verde solo per "salvato".

Statistica (spec precedente):
- l'unità è la **pianta**;
- più misure della stessa pianta nello stesso giorno → **media giornaliera** della pianta;
- i valori a letture ripetute → media delle letture;
- le liste contano gli elementi (es. numero di palchi);
- testo e sì/no non entrano nelle medie.

## Decisioni del piano (da verificare con l'utente)

1. **"Molto fuori dal gruppo"** (scheda e "Da sistemare"). Si confronta il valore giornaliero della pianta con le **altre** piante dello stesso trattamento nella stessa data (leave-one-out). Fuori se:
   - ci sono almeno 3 altre piante con un valore;
   - la loro deviazione standard è > 0;
   - |valore − media| > 3 × deviazione standard.

   Il leave-one-out è necessario: con 6 piante e la deviazione standard calcolata includendo la pianta stessa, lo scostamento non supera mai circa 2,04 deviazioni standard, quindi la soglia di 3 non scatterebbe mai.
2. **Media nell'elenco per trattamento.** In cima all'elenco un selettore `Valore mostrato` sceglie un parametro numerico. Di base è il primo valore dello strumento dello store, altrimenti del primo strumento attivo. Ogni blocco mostra:
   - il numero di piante;
   - la media degli **ultimi** valori delle sue piante per quel parametro: ogni pianta con la sua ultima data, media giornaliera;
   - quante piante hanno un valore.
3. **Avviso di dati mancanti.** Per ogni strumento attivo, se l'esperimento ha una data di misura di quello strumento più recente dell'ultima della pianta, la scheda dice:
   - `<Strumento> non misurato da N giorni`, con N contato dall'ultima misura della pianta a oggi;
   - oppure `<Strumento> mai misurato`, se la pianta non ha misure di quello strumento ma altre piante sì.

   Se nessuna pianta ha misure di quello strumento, nessun avviso.
4. **La scheda della pianta non contiene più il modulo di misura.** Si misura da "Nuova misura". La scheda ha un'azione `Misura questa pianta` che chiede lo strumento e porta a `MisuraPianta`; lì vale l'arrivo "Correggi / Nuova misura".

## Struttura dei file

```
supabase/migrations/20261031000011_ultime_misure_piante.sql   RPC ultime misure per pianta e strumento
supabase/tests/ultime_misure_piante.test.sql
src/domain/statistiche.ts (+ test)      valore numerico, medie giornaliere, fuori dal gruppo, ultimi valori, avvisi
src/api/misure.ts, src/api/query.ts     ultimeMisurePiante, useUltimeMisurePiante
src/pages/ElencoPiante.tsx (riscritta)  elenco per trattamento
src/pages/SchedaPianta.tsx (riscritta)  scheda nuova
src/pages/Oggi.tsx                       pagina Oggi (route /oggi al posto di InArrivo)
src/pages/HomeEsperimento.tsx            numerino su Oggi
```

---

### Task B1: RPC delle ultime misure per pianta e strumento

- Migration `20261031000011_ultime_misure_piante.sql`: `ultime_misure_piante(p_esperimento uuid) returns setof misure`, security invoker, `search_path = ''`, `stable`. Restituisce **tutte le misure** della data più recente di ogni coppia (pianta, strumento) dell'esperimento: più misure nello stesso giorno vengono tutte. Revoke da public e anon, grant ad authenticated.
- pgTAP:
  - due piante e due strumenti con misure in più date → solo quelle dell'ultima data per coppia, comprese due misure nello stesso giorno;
  - un altro utente non vede nulla;
  - anon non la esegue;
  - i test generali di `rls.test.sql` restano verdi.
- API `ultimeMisurePiante(espId): Promise<Misura[]>` e hook `useUltimeMisurePiante(espId)` sotto il prefisso `misure` (si invalida dopo ogni salvataggio).
- Se serve, aggiorna `supabase/online/schema-completo.sql` con `scripts/sql-unico.sh`.
- Commit: `feat(db): ultime misure per pianta e strumento`.

### Task B2: dominio delle statistiche (`src/domain/statistiche.ts`)

Funzioni pure, testate:
- `valoreNumerico(p: Parametro, v): number | null`:
  - numero → media delle letture non nulle;
  - lista → numero di elementi;
  - testo e sì/no → null;
  - vuoto → null.
- `valoriGiornalieri(parametro, misure: Misura[]): Map<piantaId, Map<data, number>>`: media giornaliera per pianta e data.
- `fuoriDalGruppo(valore: number, altri: number[]): { media: number; ds: number; fuori: boolean } | null`: la regola della Decisione 1; null se le altre piante con un valore sono meno di 3.
- `confrontoTrattamento(config, parametro, misureGiorno, piantaId, data)`: valore della pianta, media e numero delle altre piante del trattamento, `fuori`.
- `ultimiValoriPianta(config, misurePianta): { strumento; parametro; ultimo: {data; valore}; precedente: {data; valore} | null; tendenza: 'su' | 'giu' | 'uguale' | null }[]`: per ogni strumento attivo e parametro numerico (o lista) attivo, l'ultimo valore giornaliero e quello della data precedente.
- `avvisiMancanti(config, misurePianta, ultimeDatePerStrumento: Map<strumentoId, data>, oggi): string[]`: la Decisione 3, con il plurale corretto (`da 1 giorno`).
- `mediaPerTrattamento(config, parametro, ultimeMisure: Misura[]): Map<trattamentoId, { media: number | null; n: number }>`: la Decisione 2.
- `daSistemare(config, misureGiorno, data): { misuraId; piantaId; parametroId; valore; media }[]`: per ogni parametro numerico attivo, le piante della data fuori dal gruppo. Si tocca la misura che porta il valore; con più misure quel giorno, l'ultima per ora.

Test con numeri esatti: la regola dei 3 deviazioni standard con leave-one-out, meno di 3 altre piante → null, deviazione standard 0, liste, letture ripetute, plurali.

Commit: `feat(domain): statistiche per piante e oggi`.

### Task B3: elenco delle piante per trattamento

`ElencoPiante.tsx` riscritto (route `/esperimenti/:espId/piante`):
- `AppShell` `Piante`, indietro alla home;
- in cima la ricerca per numero o etichetta, che filtra le piante (il numero esatto apre direttamente la scheda con Invio);
- il selettore `Valore mostrato`;
- un blocco per trattamento (righe da quaderno, `Espandibile`). Intestazione: etichetta del trattamento, `<n> piante`, la media in Geist Mono con l'unità (es. `SPAD 41,2 · 6/6`). Aperto: le sue piante con etichetta (Geist Mono) e il loro ultimo valore del parametro scelto;
- con la ricerca attiva i blocchi si aprono da soli e mostrano solo le piante trovate.

Test:
- raggruppamento e conteggi;
- media giusta;
- ricerca;
- selettore;
- stati di caricamento ed errore.

Commit: `feat: elenco delle piante per trattamento`.

### Task B4: scheda della pianta nuova

`SchedaPianta.tsx` riscritta (route `/esperimenti/:espId/piante/:piantaId`), dall'alto:
1. **Intestazione:** `Pianta #N` (unico testo grande), trattamento.
2. **Ultimi valori per strumento:** righe con icona e nome dello strumento, poi per ogni valore `SPAD 41,2 · 3 giorni fa`, con freccia ↑ o ↓ rispetto alla misura precedente (con testo per i lettori di schermo). Il **confronto discreto** con il trattamento è un numero piccolo in grafite tenue, `media trattamento 39,8`. Se la pianta è fuori dal gruppo compare un segno discreto, `fuori dal gruppo`, in attenzione, con testo e mai solo colore.
3. **Avvisi** (Decisione 3), in una riga discreta con icona di attenzione.
4. **Storia completa:** riusa `StoriaPianta` (misure per data con icona dello strumento e ora; il tocco apre `ModificaMisura`).
5. **Dati della pianta:** etichetta, trattamento, livelli dei fattori, blocco.
6. **Azione:** `Misura questa pianta` (Decisione 4). Apre una scelta dello strumento attivo, poi naviga a `percorsoMisuraPianta`.
- Freccia indietro all'elenco piante.
- Elimina `RiquadroOggi` dalla scheda. I componenti del riquadro restano, li usa `MisuraPianta`. I test di `SchedaPianta` sul modulo di misura vanno spostati in `MisuraPianta` se lì non ci sono già (non perdere copertura).
- Il confronto usa le misure della data dell'ultimo valore (`misureDelGiorno`) solo quando serve; gli stati di caricamento non mostrano numeri falsi.

Commit: `feat: scheda della pianta con ultimi valori, confronto e avvisi`.

### Task B5: Oggi

`src/pages/Oggi.tsx` sulla route `/esperimenti/:espId/oggi`, al posto di `InArrivo`:
- `AppShell` `Oggi`, indietro alla home; data di oggi in testa (Geist Mono).
- **Strumenti:** per ogni strumento attivo una riga con il progresso di oggi (`34/56`, `fatto ✓`, o niente se non iniziato) e da quanto non si fa, `ultima 20/10 (14 giorni fa)` o `mai misurato`. Il tocco fa partire la misura come in `SceltaStrumento`. Riusa la sua logica estraendo un helper comune invece di duplicarla.
- **Da sistemare:** i valori di oggi fuori dal gruppo (`daSistemare`): pianta, strumento, parametro, valore e media del trattamento. Il tocco apre `ModificaMisura` della misura. Se non ce n'è nessuno, una riga `Nessun valore da controllare.`. Testo d'aiuto breve: `Valori molto lontani dalla media del loro trattamento: forse un errore di battitura.`
- **Home:** il numerino su 📅 Oggi conta i valori da sistemare di oggi. Badge in attenzione velato con il numero, testo accessibile `<n> valori da controllare`. Niente numerino se zero o mentre carica.

Test: righe degli strumenti, da sistemare con numeri esatti, tocco → `ModificaMisura`, numerino.

Commit: `feat: pagina Oggi con strumenti e valori da sistemare`.

### Task B6: pulizia, README, verifica, messa online

- README: sezione d'uso aggiornata (Piante, scheda, Oggi).
- Verifica: `scripts/db-senza-docker/test-db.sh`, `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`.
- Il controller applica la migration nuova al progetto Supabase online e fa il deploy di produzione su `fastlab-v3`.
- Commit: `docs: README del Piano B`.

## Focus di revisione

1. **Statistiche giuste:**
   - unità = pianta;
   - media giornaliera prima delle medie tra piante;
   - leave-one-out;
   - niente medie su testo e sì/no;
   - parametri archiviati esclusi;
   - date locali, non UTC.
2. **Discrezione** (anti-obiettivo spec §4): nessun confronto vistoso, segno solo quando la pianta è fuori dal gruppo, mai colore da solo.
3. **Nessuna regressione della misura:** togliere il riquadro dalla scheda non deve far perdere né le protezioni del Piano 1 né i test, che vanno spostati.
4. **RPC nuova:** stessa sicurezza delle altre (RLS di chi chiama, niente per anon).
