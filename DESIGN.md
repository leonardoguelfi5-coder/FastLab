---
name: FastLab
description: Quaderno di campo digitale per rilievi agronomici in serra e in campo.
colors:
  carta: "oklch(98.4% 0.006 85)"
  foglio: "oklch(99.6% 0.003 85)"
  carta-ombra: "oklch(95.6% 0.009 85)"
  riga: "oklch(88.5% 0.011 80)"
  riga-forte: "oklch(78% 0.014 75)"
  riga-controllo: "oklch(60% 0.012 75)"
  grafite: "oklch(23% 0.014 262)"
  grafite-tenue: "oklch(44% 0.016 262)"
  inchiostro: "oklch(37% 0.105 262)"
  inchiostro-scuro: "oklch(30% 0.095 262)"
  inchiostro-velato: "oklch(94.5% 0.028 262)"
  registrato: "oklch(45% 0.1 152)"
  registrato-velato: "oklch(95% 0.03 152)"
  attenzione: "oklch(50% 0.11 68)"
  attenzione-velato: "oklch(95.5% 0.04 80)"
  errore: "oklch(49% 0.16 28)"
  errore-velato: "oklch(95.5% 0.025 28)"
typography:
  numero-pianta:
    fontFamily: "Geist Mono Variable, ui-monospace, Consolas, monospace"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  campo:
    fontFamily: "Geist Mono Variable, ui-monospace, Consolas, monospace"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "0.04em"
  dato:
    fontFamily: "Geist Mono Variable, ui-monospace, Consolas, monospace"
    fontSize: "0.9375rem"
    fontWeight: 450
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.inchiostro}"
    textColor: "{colors.foglio}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 20px"
  button-primary-active:
    backgroundColor: "{colors.inchiostro-scuro}"
  button-secondary:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.grafite}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.grafite}"
    typography: "{typography.campo}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 14px"
  chip-strumento:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.grafite}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 14px"
  chip-strumento-selected:
    backgroundColor: "{colors.inchiostro}"
    textColor: "{colors.foglio}"
  cella-pianta:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.grafite-tenue}"
    typography: "{typography.dato}"
    rounded: "{rounded.sm}"
    size: "44px"
  cella-pianta-misurata:
    backgroundColor: "{colors.inchiostro-velato}"
    textColor: "{colors.inchiostro}"
---

# Design System: FastLab

## 1. Overview

**Creative North Star: "Il quaderno di campo"**

FastLab è un quaderno di campo, non un'applicazione. Carta calda quasi bianca, inchiostro grafite per il testo, un solo inchiostro blu notte per ciò che si può toccare o che è stato scelto. Le informazioni stanno su righe come in un registro: liste separate da linee sottili, numeri in carattere monospaziato allineati in colonna, etichette piccole e ferme. Il ritmo nasce dalla tipografia e dallo spazio bianco, non da riquadri, ombre o colori. Il riferimento di tono è Notion e Apple Note: pulito, tipografico, silenzioso.

La densità è media e dichiaratamente pensata per il pollice: in serra si lavora in piedi, di fretta, con una mano. Ogni schermata di campo ha un'azione principale grande in fondo, campi alti 52 px e bersagli di almeno 44 px. Tema **solo chiaro**: la scena tipica è una serra luminosa a mezzogiorno, schermo sotto luce forte, quindi il contrasto è deciso (grafite su carta oltre 12:1) e i grigi chiari per il testo sono vietati.

Il sistema rifiuta esplicitamente, con le parole di PRODUCT.md: l'**app "startup" colorata** (gradienti, illustrazioni, animazioni ovunque, emoji a profusione), l'**app "verde ecologica" cliché** (foglioline, verde acceso dappertutto), il **gestionale aziendale** (tabelle grigie, menu infiniti, aspetto anni 2000) e il **foglio Excel** (griglie fitte di celle tutte uguali, difficili col pollice).

**Key Characteristics:**
- Carta calda, testo grafite, un solo inchiostro blu notte come accento.
- Dati, etichette delle piante e codici in Geist Mono con cifre tabellari.
- Liste come righe di quaderno, non card.
- Piatto: profondità data da toni di carta e linee, ombre solo per ciò che galleggia (menu, dialoghi, toast).
- Bersagli grandi, azione principale in basso, raggiungibile col pollice.
- Movimento solo per segnalare uno stato, 150–200 ms, mai coreografico.

## 2. Colors: La palette carta e inchiostro

Neutri caldi da carta e un solo inchiostro freddo: il contrasto tra carta e inchiostro è l'identità; tutto il resto è stato.

### Primary
- **Inchiostro blu notte** (oklch(37% 0.105 262)): pulsante principale, strumento selezionato, focus, link, piante già misurate nella griglia. È il colore di ciò che si tocca o che è scelto. Su carta raggiunge oltre 9:1. **Inchiostro scuro** (oklch(30% 0.095 262)) per lo stato premuto; **inchiostro velato** (oklch(94.5% 0.028 262)) come fondo delle selezioni e delle celle misurate.

### Neutral
- **Carta** (oklch(98.4% 0.006 85)): fondo di tutte le pagine.
- **Foglio** (oklch(99.6% 0.003 85)): fondo di campi, pulsanti secondari e pannelli in rilievo sulla carta. Mai bianco puro.
- **Carta ombra** (oklch(95.6% 0.009 85)): seconda superficie per barre, intestazioni di sezione, riquadro "Oggi" nella scheda pianta.
- **Riga** (oklch(88.5% 0.011 80)): linee divisorie, bordi di campi e pulsanti secondari.
- **Riga forte** (oklch(78% 0.014 75)): bordo al passaggio del dito o del mouse e separatori più marcati. Non basta da sola come confine di un controllo (circa 1.9:1).
- **Riga controllo** (oklch(60% 0.012 75)): bordo a riposo di campi, caselle, interruttori e pulsanti secondari, cioè di tutto ciò che si tocca e deve restare visibile sotto il sole (≥ 3:1 sulla carta, requisito WCAG per i componenti).
- **Grafite** (oklch(23% 0.014 262)): tutto il testo principale e i valori. Mai nero puro.
- **Grafite tenue** (oklch(44% 0.016 262)): testo secondario, unità di misura, aiuti sotto i campi, etichette. È il grigio più chiaro ammesso per il testo (≥ 7:1 su carta).

### Semantic
- **Registrato** (oklch(45% 0.1 152)) con **registrato velato** (oklch(95% 0.03 152)): solo per l'esito "salvato ✓". Non è un colore decorativo e non indica mai una pianta o un trattamento.
- **Attenzione** (oklch(50% 0.11 68)) con **attenzione velato** (oklch(95.5% 0.04 80)): avvisi non bloccanti (valore fuori intervallo, "non oggi").
- **Errore** (oklch(49% 0.16 28)) con **errore velato** (oklch(95.5% 0.025 28)): salvataggio fallito, campo non valido, azioni distruttive.

### Named Rules
**La regola dell'unico inchiostro.** Il blu notte copre al massimo il 10% di una schermata: pulsante principale, selezione, focus. Se due elementi blu competono, uno dei due è sbagliato.

**La regola del verde negato.** Il verde esiste solo come esito "salvato". Vietato come colore di marca, di sfondo, di intestazione o per decorare le piante.

**La regola del non solo colore.** Ogni stato comunicato dal colore ha anche testo, icona o forma (✓ nella cella misurata, "×2" per più misure, icona nell'avviso).

## 3. Typography

**Body Font:** Geist Variable (con system-ui, sans-serif)
**Label/Mono Font:** Geist Mono Variable (con ui-monospace, Consolas, monospace)

**Character:** Una sola famiglia sans per tutta l'interfaccia, sobria e moderna; la sua gemella monospaziata porta il tono da registro su ciò che è dato: numeri delle piante, valori, date, ore, codici invito. Il contrasto è tra prosa e dato, non tra stili decorativi.

### Hierarchy
- **Numero pianta** (Geist Mono 600, 2.25rem, 1.1, cifre tabellari): l'etichetta della pianta in testa alla scheda e alla misura. È l'unico elemento grande di una schermata di campo.
- **Headline** (Geist 650, 1.5rem, 1.2, −0.015em): titolo di pagina nella barra in alto e titoli dei passi della creazione guidata.
- **Title** (Geist 600, 1.125rem, 1.3): titoli di sezione, nome dell'esperimento nelle righe della lista, testo dei pulsanti principali.
- **Body** (Geist 400, 1rem, 1.5): testo corrente, descrizioni, messaggi. Righe di prosa entro 65ch.
- **Campo** (Geist Mono 500, 1.25rem, 1.3, cifre tabellari): il testo digitato nei campi numerici e di etichetta.
- **Dato** (Geist Mono 450, 0.9375rem, 1.4, cifre tabellari): valori nella storia della pianta, contatori, celle della griglia, date e ore.
- **Label** (Geist 550, 0.8125rem, +0.04em, maiuscolo solo per le intestazioni di sezione come "STORIA" e "OGGI"): etichette dei campi (in tondo, non maiuscolo), unità, intestazioni di gruppo.

### Named Rules
**La regola del dato in colonna.** Ogni numero che si confronta con altri numeri usa Geist Mono con `font-variant-numeric: tabular-nums`, così le cifre restano allineate da una riga all'altra.

**La regola del grande unico.** In una schermata di campo c'è un solo testo grande: il numero della pianta. Tutto il resto sta tra label e title.

## 4. Elevation

Il sistema è piatto. La profondità si ottiene con i toni di carta (carta → carta ombra → foglio) e con linee di 1 px, mai con ombre a riposo. Le ombre esistono solo per ciò che galleggia sopra la pagina e scompare: menu a tendina, dialoghi, toast.

### Shadow Vocabulary
- **Galleggiante** (`box-shadow: 0 1px 2px oklch(23% 0.014 262 / 0.06), 0 8px 24px oklch(23% 0.014 262 / 0.10)`): menu, popover, toast.
- **Dialogo** (`box-shadow: 0 2px 6px oklch(23% 0.014 262 / 0.08), 0 20px 48px oklch(23% 0.014 262 / 0.16)`): dialoghi di conferma, sopra un velo `oklch(23% 0.014 262 / 0.35)`.

### Named Rules
**La regola della pagina piatta.** Niente ombre su card, righe, pulsanti o campi. Se un elemento sembra "sollevato" a riposo, l'ombra va tolta e sostituita da una linea o da un tono di carta.

## 5. Components

### Buttons
Decisi e grandi, pensati per il pollice.
- **Shape:** angoli moderatamente arrotondati (10px).
- **Primary:** inchiostro blu notte, testo foglio, Title 600, altezza 52px, larghezza piena nelle barre d'azione in basso. Uno solo per schermata.
- **Pressed / Focus:** premuto → inchiostro scuro, transizione 150 ms; focus visibile con anello di 2px inchiostro a 2px di distanza (`outline: 2px solid inchiostro; outline-offset: 2px`).
- **Disabled:** carta ombra con testo grafite tenue, nessuna opacità ridotta sul testo sotto 4.5:1.
- **Secondary:** foglio con bordo riga controllo, testo grafite, altezza 48px.
- **Ghost:** solo testo inchiostro, altezza 44px; per azioni minori ("Riprova", "Modifica", "Usa oggi").
- **Distruttivo:** testo errore su foglio con bordo errore; pieno errore solo nel pulsante di conferma dentro un dialogo.

### Chips (strumenti)
- **Style:** riga orizzontale scorrevole; foglio con bordo riga, altezza 44px, angoli 14px, icona/emoji dello strumento più nome.
- **State:** selezionata → inchiostro pieno con testo foglio e segno ✓; non selezionata → foglio. Una sola selezionata alla volta.

### Cards / Containers
- **Uso:** quasi mai. Le liste sono righe di quaderno: fondo carta, separatore riga di 1px, padding verticale 14–16px, nessun bordo esterno né ombra.
- **Riquadro "Oggi"** (unico contenitore ricorrente): fondo carta ombra, angoli 14px, padding 16px, nessun bordo.
- **Corner Style:** 14px per i pochi riquadri, 10px per campi e pulsanti, 6px per celle e badge.

### Inputs / Fields
- **Style:** foglio, bordo riga controllo 1px, angoli 10px, altezza 52px, testo in Campo (Geist Mono 1.25rem) per numeri ed etichette; label sopra il campo in Label, unità a destra in grafite tenue.
- **Focus:** bordo inchiostro e anello di 3px inchiostro velato; nessun bagliore.
- **Error:** bordo errore, messaggio sotto in errore con icona, `aria-invalid`.
- **Warning (fuori intervallo):** bordo attenzione e messaggio in attenzione; non blocca.
- **Disabled:** fondo carta ombra, testo grafite tenue.

### Navigation
- **Barra in alto:** fissa, fondo carta con linea riga in basso, altezza 56px; freccia indietro a sinistra (44px), titolo Headline troncato, azioni a destra (44px).
- **Barra d'azione in basso:** fissa nelle schermate di campo e nella creazione guidata, fondo carta con linea riga in alto, padding 12px + area sicura; contiene il pulsante principale a larghezza piena.

### Griglia delle piante (signature)
- Celle quadrate di 44px in griglia a 6–8 colonne, etichetta in Dato, angoli 6px.
- Da misurare: foglio con bordo riga, testo grafite tenue. Misurata: inchiostro velato, testo inchiostro, piccolo ✓; con più misure, badge "×2". Mai verde.

### Toast
- Fondo grafite, testo foglio, angoli 10px, ombra galleggiante, in basso sopra la barra d'azione; esito salvato con ✓ in registrato velato.

## 6. Do's and Don'ts

### Do:
- **Do** usare carta (oklch(98.4% 0.006 85)) come fondo e grafite (oklch(23% 0.014 262)) per il testo; foglio (oklch(99.6% 0.003 85)) per i campi.
- **Do** tenere l'inchiostro blu notte entro il 10% della schermata: pulsante principale, selezione, focus.
- **Do** scrivere numeri delle piante, valori, date, ore e codici in Geist Mono con cifre tabellari.
- **Do** costruire le liste come righe di quaderno separate da linee di 1px, senza card.
- **Do** dare a ogni stato anche un testo o un'icona, non solo un colore.
- **Do** mettere l'azione principale in una barra in basso, alta 52px, raggiungibile col pollice.
- **Do** limitare il movimento a 150–200 ms con easing `cubic-bezier(0.22, 1, 0.36, 1)` e rispettare `prefers-reduced-motion`.

### Don't:
- **Don't** fare un'app "startup" colorata: niente gradienti, illustrazioni, animazioni ovunque, emoji a profusione (le emoji sono ammesse solo come icona di uno strumento scelta dall'utente e come icone delle sezioni nella home dell'esperimento).
- **Don't** fare l'app "verde ecologica" cliché: niente foglioline, niente verde acceso dappertutto, niente aria da sito di giardinaggio. Il verde è solo "salvato".
- **Don't** somigliare a un gestionale aziendale: niente tabelle grigie, menu infiniti, barre di strumenti da software anni 2000.
- **Don't** somigliare a un foglio Excel: niente griglie fitte di celle tutte uguali, niente bersagli sotto i 44px.
- **Don't** usare ombre a riposo su card, righe, pulsanti o campi.
- **Don't** usare grigi più chiari di grafite tenue (oklch(44% 0.016 262)) per il testo: in serra sotto il sole non si leggono.
- **Don't** usare `#000` o `#fff`, né il tema scuro: FastLab è solo chiaro.
- **Don't** usare bordi laterali colorati come accento su righe, avvisi o riquadri.
- **Don't** usare un dialogo dove basta un messaggio in linea; i dialoghi sono per conferme distruttive o uscite con dati non salvati.
- **Don't** usare trattini lunghi nei testi dell'interfaccia.
