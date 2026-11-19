# Taratura gravimetrica del TDR — design (breve)

Data: 2026-11-19. Segue `2026-11-19-curva-vasi-potenza-design.md` (tensiometro), che lasciava i sensori non
tensiometrici a questo lavoro.

## Intento

Tarare il TDR con il metodo gravimetrico nella stessa sessione Vasi del tensiometro e ricavarne le soglie da impostare
**una volta** sui logger: per ogni % CC la lettura TDR corrispondente, il peso del vaso e i mL da reintegrare. Modello:
il calcolatore che l'utente ha incollato (%CC dai pesi, retta OLS %CC = m · TDR + q, calcolo inverso, deficit).

## Obiettivi (decisi dall'utente)

1. **Solo taratura.** Niente lettura TDR pianta per pianta né calcolo dell'irrigazione nelle misure delle piante.
2. **Sensore "TDR" al posto di "Umidità"** (approccio 1): nel menu restano TDR e Tensione. Le sessioni salvate con
   `umidita` si leggono come TDR. Nessuna migrazione (il tipo sta nel jsonb delle impostazioni, senza vincoli).
3. **Retta per vaso**: %CC = m · TDR + q con i minimi quadrati ordinari; il punto a CC entra al 100 %; R² usuale.
4. **Retta media del substrato = media delle rette dei vasi** (approccio A): m medio, q medio, R² medio, n sommato.
   Con un solo vaso è la retta di quel vaso.
5. **Soglie**: per 100, 80, 60, 50, 40 % CC (le % della tabella che c'è già) e per la % scritta nella consultazione:
   TDR target = (% − q)/m sulla retta media; peso target di ogni vaso = secco + %·(CC − secco); deficit = peso a CC −
   peso target, in mL.
6. **Dettatura**: "peso 150 lettura 35 avanti" vale per tutti i sensori (oltre a "tensione").

## Non obiettivi

- La tara del vaso: la %CC non cambia (il secco dell'app è già il peso del vaso secco intero).
- Soglie per il tensiometro (l'utente le ha lasciate fuori).
- Profili salvati per substrato fuori dalla sessione: la sessione di taratura è già il profilo.

## Approcci considerati

- Sensore: **1. nuovo tipo `tdr` che sostituisce `umidita`** (scelto) contro 2. tenere `umidita` e chiamarlo TDR solo a
  schermo (meno lavoro, ma il codice direbbe "umidità" per un TDR).
- Media: **A. media delle rette** (scelto, coerente con la media delle curve del tensiometro) contro B. una retta su tutti
  i punti insieme (com'era "Umidità"; i vasi con più punti pesano di più).

## Il come

- `TipoSensore = 'tdr' | 'tensione'`. `SENSORI`: TDR con unità predefinita `raw`, Tensione. Chi legge le impostazioni
  (mapper della sessione e `bozzaDa`) trasforma `umidita` in `tdr`. `nomeLettura`: `TDR (raw)`, `Tensione (hPa)`.
- `curvePerSubstrato` con il modello lineare usa `mediaDeiParametri` come la potenza, ma con a (= q) **aritmetico**: la
  media geometrica resta solo per la potenza (q può essere negativo).
- Tabella dei parametri e foglio Parametri, per il TDR: colonne m, q, R², TDR a CC (retta), TDR a CC (misurata), n.
  Equazione: `%CC = 1,234 · TDR + 5,678  (R² 0,998, n 6)` con 4 cifre significative per m e q.
- Consultazione: la tabella "Pesi a % CC fisse" ha per ogni substrato TDR, anche le righe "TDR target" (retta media) e
  "Deficit medio (mL)"; con "% di capacità di campo" la risposta dice anche TDR target e deficit medio.
- Excel: nuovo foglio "Soglie" (solo TDR): Substrato, % CC, TDR target, peso medio, deficit medio (mL).
- Deficit in mL: i grammi d'acqua (1 g = 1 mL); se l'unità della sessione non si converte in grammi resta nell'unità
  della sessione.

## Lasciato al builder

- Testi esatti, posizione delle righe nuove, asse x del grafico per il TDR (da 0 se le letture sono positive).

## Decisioni di Claude (da verificare)

1. Unità predefinita del TDR `raw` (modificabile).
2. Le soglie usano la retta **media** del substrato (un logger per substrato), mentre il peso target e il deficit sono
   di ogni vaso (secco e CC propri) e come media.
3. Righe delle soglie: 100, 80, 60, 50, 40 % (quelle che c'erano), non 100/80/60/40 dell'esempio.
