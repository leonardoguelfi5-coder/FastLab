import { useId } from 'react'
import { COLORI_GRAFICO, COLORI_SERIE, CORPO_TESTO, FONT_DATI, LARGHEZZA_CARATTERE, MARCATORI, tacche } from '@/domain/grafico'
import { modelloPer, pccDaLettura, type Curva, type CurveSubstrato } from '@/domain/pesatura/curva'
import { nomeLettura } from '@/domain/pesatura/export'
import type { Sensore } from '@/domain/pesatura/tipi'
import { formattaDecimali, formattaNumero } from '@/lib/numeri'

interface GraficoCurveProps {
  /** I vasi di un solo substrato: un grafico per substrato. */
  gruppo: CurveSubstrato
  sensore: Sensore
  /** Per l'immagine dell'Excel e del PNG: 800 × 450, fondo foglio, titolo dentro il disegno e il font incorporato se c'è. */
  perImmagine?: boolean
  /** Il titolo scritto nell'immagine. */
  titolo?: string
  fontIncorporato?: string | null
}

const n2 = (v: number) => Math.round(v * 100) / 100
/** Le dimensioni dell'immagine (le stesse di `LARGHEZZA_IMMAGINE` e `ALTEZZA_IMMAGINE`) e quelle di base nell'app. */
const IMMAGINE = { larghezza: 800, altezza: 450 }
const APP = { larghezza: 640, altezza: 380 }
const PUNTI_CURVA = 96
const ALTEZZA_RIGA_LEGENDA = 18

/** Dispone la legenda: una voce dopo l'altra, a capo quando la riga è piena. */
function disponiLegenda(nomi: string[], larghezza: number): { x: number; riga: number }[] {
  const MARGINE = 12
  const posizioni: { x: number; riga: number }[] = []
  let x = MARGINE
  let riga = 0
  for (const nome of nomi) {
    const larghezzaVoce = 22 + nome.length * LARGHEZZA_CARATTERE + 18
    if (x > MARGINE && x + larghezzaVoce > larghezza - MARGINE) {
      x = MARGINE
      riga += 1
    }
    posizioni.push({ x, riga })
    x += larghezzaVoce
  }
  return posizioni
}

/** La voce della curva media in legenda, con l'R² (3 decimali, virgola) se c'è. */
const etichettaMedia = (c: Curva): string => (c.r2 === null ? 'Curva media' : `Curva media (R² ${formattaDecimali(c.r2, 3)})`)

/**
 * Le curve di ritenzione dei vasi di un substrato, come la Figura 5 della tesi: la % della capacità di campo (y) in
 * funzione della lettura del sensore (x, da 0; per il tensiometro è |h|). Ogni vaso ha il suo colore e il suo marcatore
 * (mai solo colore), i suoi punti misurati e la sua curva adattata, sottile, su tutto l'asse x; la curva media è spessa e
 * scura. Nessuna soglia. SVG scritto a mano come `GraficoSvg`: funziona nell'app e con `renderToStaticMarkup` per
 * l'immagine, con i colori scritti nel disegno.
 */
export function GraficoCurve({ gruppo, sensore, perImmagine = false, titolo = '', fontIncorporato = null }: GraficoCurveProps) {
  const { larghezza, altezza } = perImmagine ? IMMAGINE : APP
  const fondo = perImmagine ? COLORI_GRAFICO.foglio : COLORI_GRAFICO.carta
  const nomeX = nomeLettura(sensore)
  const potenza = modelloPer(sensore) === 'potenza'
  // l'id del clipPath è unico per disegno (più grafici nella stessa pagina); senza i due punti, che negli url() danno noia
  const idClip = `area-${useId().replace(/:/g, '')}`
  /** Il tensiometro si legge in valore assoluto: la lettura è negativa, la x del grafico è |h|. */
  const ascissa = (lettura: number) => (potenza ? Math.abs(lettura) : lettura)

  const { vasi } = gruppo
  const punti = vasi.flatMap(v => v.punti)

  const voci: { nome: string; colore: string; marcatore: string | null }[] = [
    ...vasi.map((v, i) => ({ nome: v.campione.nome ?? `Vaso ${i + 1}`, colore: COLORI_SERIE[i % COLORI_SERIE.length], marcatore: MARCATORI[i % MARCATORI.length] })),
    ...(gruppo.media ? [{ nome: etichettaMedia(gruppo.media), colore: COLORI_GRAFICO.grafite, marcatore: null }] : []),
  ]
  const legenda = disponiLegenda(voci.map(v => v.nome), larghezza).map((p, i) => ({ ...voci[i], x: p.x, riga: p.riga }))
  const righeLegenda = legenda.length === 0 ? 0 : legenda[legenda.length - 1].riga + 1
  const altezzaLegenda = righeLegenda * ALTEZZA_RIGA_LEGENDA + 8

  const alto = perImmagine ? 36 : 16
  const basso = altezza - 42 - altezzaLegenda
  const sinistra = 48
  const destra = larghezza - 16

  const riassunto = `${titolo ? `${titolo}. ` : ''}Curve di ritenzione di ${gruppo.substrato}: % della capacità di campo in funzione di ${nomeX}.`
  const stileSvg = perImmagine ? undefined : { display: 'block', maxWidth: '100%', height: 'auto' }

  const apertura = (
    <>
      {perImmagine && fontIncorporato && (
        <style>{`@font-face{font-family:"Atkinson Hyperlegible Mono Variable";src:url(${fontIncorporato}) format("woff2");font-weight:200 800;font-style:normal}`}</style>
      )}
      <rect width={larghezza} height={altezza} fill={fondo} />
      {perImmagine && titolo && (
        <text x={12} y={20} fill={COLORI_GRAFICO.grafite} fontFamily={FONT_DATI} fontSize={13} fontWeight={600}>{titolo}</text>
      )}
    </>
  )

  if (punti.length === 0) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg" width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img"
        aria-label={riassunto} style={stileSvg}
      >
        {apertura}
        <text
          x={larghezza / 2} y={altezza / 2} textAnchor="middle" fill={COLORI_GRAFICO.grafiteTenue} fontFamily={FONT_DATI} fontSize={CORPO_TESTO + 1}
        >
          Nessun dato da disegnare
        </text>
      </svg>
    )
  }

  const letture = punti.map(p => ascissa(p.lettura))
  const asseX = potenza ? tacche(0, Math.max(...letture), 6) : tacche(Math.min(...letture), Math.max(...letture), 6)
  const asseY = tacche(0, Math.max(100, ...punti.map(p => p.pcc)), 6)
  const xDi = (v: number) => sinistra + ((v - asseX.min) / (asseX.max - asseX.min)) * (destra - sinistra)
  const yDi = (v: number) => basso - ((v - asseY.min) / (asseY.max - asseY.min)) * (basso - alto)
  const percorso = (xy: [number, number][]) => xy.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${n2(xDi(x))} ${n2(yDi(y))}`).join('')

  /** La curva adattata campionata su tutto l'asse x; i punti non finiti (h = 0) si saltano. */
  const campionata = (c: Curva): [number, number][] => {
    const da = potenza ? asseX.max / 200 : asseX.min
    const risultato: [number, number][] = []
    for (let k = 0; k < PUNTI_CURVA; k++) {
      const x = da + ((asseX.max - da) * k) / (PUNTI_CURVA - 1)
      const y = pccDaLettura(c, x)
      if (Number.isFinite(y)) risultato.push([x, y])
    }
    return risultato
  }

  const curveVaso = vasi.map((v, i) => ({ v, i, tratto: gruppo.curve[i] ? campionata(gruppo.curve[i] as Curva) : [] }))
  const tratto = gruppo.media ? campionata(gruppo.media) : []

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img"
      aria-label={riassunto} style={stileSvg}
    >
      {apertura}
      <defs>
        <clipPath id={idClip}><rect x={sinistra} y={alto} width={destra - sinistra} height={basso - alto} /></clipPath>
      </defs>
      <g fontFamily={FONT_DATI} fontSize={CORPO_TESTO} fill={COLORI_GRAFICO.grafiteTenue} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {asseY.valori.map(v => (
          <g key={v}>
            <line x1={sinistra} x2={destra} y1={n2(yDi(v))} y2={n2(yDi(v))} stroke={COLORI_GRAFICO.riga} strokeWidth={1} />
            <text x={sinistra - 6} y={n2(yDi(v) + 4)} textAnchor="end">{formattaNumero(v)}</text>
          </g>
        ))}
        <line x1={sinistra} x2={destra} y1={basso} y2={basso} stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} />
        {asseX.valori.map(v => (
          <g key={v}>
            <line data-tacca-x={v} x1={n2(xDi(v))} x2={n2(xDi(v))} y1={basso} y2={basso + 4} stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} />
            <text x={n2(xDi(v))} y={basso + 17} textAnchor="middle">{formattaNumero(v)}</text>
          </g>
        ))}
        <text x={(sinistra + destra) / 2} y={basso + 34} textAnchor="middle">{nomeX}</text>
        <text x={sinistra} y={alto - 6}>% della capacità di campo</text>
      </g>

      <g clipPath={`url(#${idClip})`}>
        {curveVaso.map(({ v, i, tratto: t }) => t.length > 1 && (
          <path
            key={v.campione.id} data-curva-vaso={v.campione.id} d={percorso(t)} fill="none"
            stroke={COLORI_SERIE[i % COLORI_SERIE.length]} strokeWidth={1.5} opacity={0.7} strokeLinejoin="round" strokeLinecap="round"
          />
        ))}
        {tratto.length > 1 && (
          <path
            data-media={gruppo.substrato} d={percorso(tratto)} fill="none" stroke={COLORI_GRAFICO.grafite} strokeWidth={3}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}
      </g>

      {vasi.map((v, i) => v.punti.map((p, k) => (
        <path
          key={`${v.campione.id}-${k}`} data-marcatore={v.campione.id} d={MARCATORI[i % MARCATORI.length]}
          transform={`translate(${n2(xDi(ascissa(p.lettura)))} ${n2(yDi(p.pcc))})`}
          fill={COLORI_SERIE[i % COLORI_SERIE.length]} stroke={fondo} strokeWidth={3} paintOrder="stroke"
        />
      )))}

      {legenda.map(({ nome, colore, marcatore, x, riga }) => {
        const y = altezza - altezzaLegenda + 12 + riga * ALTEZZA_RIGA_LEGENDA
        return (
          <g key={nome} data-legenda={nome}>
            <line x1={x} x2={x + 16} y1={y - 4} y2={y - 4} stroke={colore} strokeWidth={marcatore ? 1.5 : 3} />
            {marcatore && <path d={marcatore} transform={`translate(${x + 8} ${y - 4})`} fill={colore} />}
            <text x={x + 22} y={y} fill={COLORI_GRAFICO.grafite} fontFamily={FONT_DATI} fontSize={CORPO_TESTO}>{nome}</text>
          </g>
        )
      })}
    </svg>
  )
}
