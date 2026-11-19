# Curva dei vasi con il tensiometro: legge di potenza — design

Data: 2026-11-19. Sostituisce, per i vasi con il tensiometro, la parte "curva" del §5.6 di
`2026-11-11-pesatura-design.md`.

## 1. Intento

La sezione Vasi deve produrre, dai pesi e dalle letture registrati nell'app, la stessa analisi del paragrafo 2.6.1
della tesi dell'utente (taratura tensiometrica del substrato): per ogni vaso l'adattamento **WC = a · h^b**, la curva
media del substrato, il grafico come la Figura 5 e la tabella dei parametri come la Tabella 4. Oggi l'app usa un
modello sbagliato (`a + b·ln h`), una media calcolata in modo diverso dal testo e non ha il punto a capacità di campo,
perché alla CC non chiede la lettura.

WC = (W − Wd) / (Wfc − Wd) × 100: W peso alla data, Wfc a capacità di campo, Wd secco. h è il potenziale matrico letto
dal tensiometro.

## 2. Obiettivi

1. **Ogni peso ha la sua lettura dello strumento**, tranne il secco. Deciso dall'utente: la lettura è obbligatoria alla
   capacità di campo e a ogni giro di asciugatura; il peso secco non ha lettura.
2. **Modello a legge di potenza** WC = a · h^b per ogni vaso, quando il sensore è un tensiometro. Deciso dall'utente.
3. **Adattamento con i minimi quadrati non lineari sui valori di WC** (metodo "B", come `curve_fit` di Python). Deciso
   dall'utente. R² = 1 − SSres/SStot calcolato sui valori di WC.
4. **Curva media del substrato in scala logaritmica** (revisione del 2026-11-19, decisa dall'utente con la nuova
   Figura 5, "log-scale average of pots A–D"): a ogni h, ln WC medio = media(ln a) + media(b)·ln h, quindi
   a = media geometrica degli a dei vasi (e^media(ln a)), b = media dei b; R² = media degli R². Con i vasi A–D della
   tesi: WC = 362 · h^−0,4464, 60 % CC a 56 hPa, 50 % a 84 hPa. Prima era la media aritmetica degli a (395).
5. **Grafico come la Figura 5** (senza soglie): punti misurati, una linea sottile per l'adattamento di ogni vaso, una
   linea spessa per la curva media.
6. **Tabella dei parametri come la Tabella 4** (senza le colonne delle soglie), nell'app e nell'Excel.

## 3. Non obiettivi

- **Le soglie** (fascia 60–50 %, h al 60 % e al 50 %): l'utente ha detto di lasciarle stare. Niente fascia nel grafico,
  niente colonne di soglia nella tabella.
- **I sensori che non sono tensiometri** (umidità, TDR): restano come oggi (modello lineare). Verranno riprogettati con
  la calibrazione gravimetrica del TDR, un lavoro successivo e separato.
- Escludere a mano un vaso anomalo dalla media (nel testo il vaso B resta nella media).

## 4. Anti-obiettivi

- Numeri diversi da quelli che darebbe `scipy.optimize.curve_fit` sugli stessi punti: sarebbe un fallimento anche se
  il grafico sembra giusto.
- Una curva media diversa dalla media in scala logaritmica delle curve dei vasi.
- Perdere i pesi già salvati: le sessioni esistenti devono continuare ad aprirsi.

## 5. Approcci considerati per l'adattamento

- **A. Regressione lineare su ln(WC) contro ln(h)** (la linea di tendenza "potenza" di Excel). Semplice, sempre una
  soluzione, ma l'R² è sui logaritmi e pesa di più i punti secchi. Scartato.
- **B. Minimi quadrati non lineari su WC** (Gauss–Newton / Levenberg–Marquardt su a e b, partendo dalla soluzione di A).
  R² sui valori veri, coerente con una figura fatta in Python. **Scelto dall'utente.**

## 6. Il come, deciso

### 6.1 Pesata
- Fase capacità di campo dei vasi: come l'asciugatura, il campo lettura è obbligatorio e la dettatura usa la stessa
  frase ("peso … tensione … avanti"). Il salvataggio scrive `lettura` anche sul peso `capacita_campo`.
- Il secco resta solo peso.
- Il database non cambia: `pesi.lettura` è già una colonna facoltativa senza vincoli sul tipo.

### 6.2 Punti della curva
- Per ogni vaso: il punto a CC (h = lettura della CC, WC = 100) più i punti di asciugatura con lettura.
- h si usa in valore assoluto (un tensiometro può dare letture negative). I punti con h = 0 non entrano (la potenza non
  è definita).
- Servono almeno 3 valori di h distinti per adattare il vaso, come oggi.

### 6.3 Adattamento (puro, in `src/domain/pesatura/curva.ts`)
- Partenza: regressione su ln(WC), ln(h) (solo punti con WC > 0); poi Levenberg–Marquardt su WC = a·h^b fino a
  convergenza. Se non converge, il vaso non ha curva (come quando mancano i punti).
- Uscita per vaso: a, b, R², n, h minimo e massimo misurati, h a CC dalla curva = (100/a)^(1/b), h a CC misurato =
  lettura del peso CC.
- Curva media per substrato, sui vasi che hanno una curva: media geometrica degli a, media dei b e degli R²; h a CC
  dalla curva media con la stessa formula; h a CC misurato non c'è ("—"). Un adattamento con a ≤ 0 non è una curva.

### 6.4 Pagina della sessione
- **Grafico** (`GraficoCurve`), uno per substrato, come la Figura 5: asse x h nell'unità del sensore (lineare, da 0),
  asse y "% della capacità di campo" da 0 ad almeno 100. Un colore e un marcatore per vaso; per ogni vaso i punti e la
  curva adattata (linea sottile) disegnata su tutta l'ampiezza dell'asse x, tagliata ai limiti dell'asse y. Curva media
  spessa e scura. Legenda: "Vaso A (punti)", …, "Curva media (R² 0,967)".
- **Tabella dei parametri**: Vaso, a, b, R², h a CC (curva), h a CC (misurato), n; ultima riga "Curva media".
- **Equazione** sotto il grafico: `WC = 395 · h^−0,4464  (R² 0,967)`.
- **Consultazione** ("a che peso portare i vasi"): per % CC resta com'è; per lettura del sensore usa la curva a
  potenza del vaso, o quella media se il vaso non ne ha.

### 6.5 Excel e PNG
- Foglio "Punti": include anche il punto a CC (tipo, peso, lettura, 100 %).
- Nuovo foglio "Parametri" con la tabella del §6.4.
- Info: equazione della curva media in forma potenza.
- Il PNG e l'immagine nell'Excel usano lo stesso grafico.

## 7. Lasciato al builder

- Dettagli numerici di Levenberg–Marquardt (tolleranze, massimo di iterazioni), purché i risultati coincidano con
  `curve_fit` entro 4 cifre significative su un caso di test.
- Palette per vaso e disposizione della legenda, nello stile di `GraficoSvg`.
- Testi degli avvisi quando un vaso non ha la lettura a CC o non ha abbastanza punti.

## 8. Decisioni di Claude (da verificare)

1. Sessioni già salvate con il peso CC senza lettura: il punto a CC manca e la curva usa solo l'asciugatura; nel
   riepilogo il peso CC senza lettura risulta incompleto e, aprendolo, si chiede la lettura.
2. Un grafico per substrato con un colore per vaso (come la Figura 5), invece di un grafico unico colorato per substrato.
3. Letture in valore assoluto; h = 0 escluso.
4. Le colonne "h a CC" restano in tabella: sono parametri della curva, non soglie.
