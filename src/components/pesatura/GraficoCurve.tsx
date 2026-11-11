import { COLORI_GRAFICO, COLORI_SERIE, CORPO_TESTO, FONT_DATI, LARGHEZZA_CARATTERE, MARCATORI, tacche } from '@/domain/grafico'
import { pccDaLettura, type CurveSubstrato } from '@/domain/pesatura/curva'
import { nomeLettura } from '@/domain/pesatura/export'
import type { Sensore } from '@/domain/pesatura/tipi'
import { formattaNumero } from '@/lib/numeri'

interface GraficoCurveProps {
  gruppi: CurveSubstrato[]
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
const PUNTI_CURVA = 48
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

/**
 * Le curve di ritenzione dei vasi: la % della capacità di campo (y) in funzione della lettura del sensore (x). Una linea
 * sottile per vaso (i suoi punti, in ordine di tempo), una spessa per la curva media di ogni substrato. Il colore è del
 * substrato (`COLORI_SERIE`) e anche la forma del marcatore, così il grafico non dipende dal solo colore. SVG scritto a
 * mano come `GraficoSvg`: funziona nell'app e con `renderToStaticMarkup` per l'immagine, con i colori scritti nel disegno.
 */
export function GraficoCurve({ gruppi, sensore, perImmagine = false, titolo = '', fontIncorporato = null }: GraficoCurveProps) {
  const { larghezza, altezza } = perImmagine ? IMMAGINE : APP
  const fondo = perImmagine ? COLORI_GRAFICO.foglio : COLORI_GRAFICO.carta
  const nomeX = nomeLettura(sensore)

  const punti = gruppi.flatMap(g => g.vasi.flatMap(v => v.punti))

  const legenda = disponiLegenda(gruppi.map(g => g.substrato), larghezza).map((p, i) => ({ g: gruppi[i], i, x: p.x, riga: p.riga }))
  const rigaFinale = legenda.length === 0 ? -1 : legenda[legenda.length - 1].riga
  const righeLegenda = rigaFinale + 1
  const altezzaLegenda = righeLegenda * ALTEZZA_RIGA_LEGENDA + 8

  const alto = perImmagine ? 36 : 16
  const basso = altezza - 42 - altezzaLegenda
  const sinistra = 48
  const destra = larghezza - 16

  const riassunto = `${titolo ? `${titolo}. ` : ''}Curve di ritenzione: % CC in funzione di ${nomeX}. ${gruppi.map(g => g.substrato).join(', ')}.`

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
        aria-label={riassunto} style={perImmagine ? undefined : { display: 'block', maxWidth: '100%', height: 'auto' }}
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

  const letture = punti.map(p => p.lettura)
  const asseX = tacche(Math.min(...letture), Math.max(...letture), 6)
  const pcc = punti.map(p => p.pcc)
  const asseY = tacche(Math.min(0, ...pcc), Math.max(100, ...pcc), 6)
  const xDi = (v: number) => sinistra + ((v - asseX.min) / (asseX.max - asseX.min)) * (destra - sinistra)
  const yDi = (v: number) => basso - ((v - asseY.min) / (asseY.max - asseY.min)) * (basso - alto)
  const percorso = (xy: [number, number][]) => xy.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${n2(xDi(x))} ${n2(yDi(y))}`).join('')

  /** La curva adattata, campionata tra le letture misurate; i punti non finiti (ln di zero) si saltano. */
  const campionata = (g: CurveSubstrato): [number, number][] => {
    const c = g.media
    if (!c) return []
    const risultato: [number, number][] = []
    for (let k = 0; k < PUNTI_CURVA; k++) {
      const x = c.min + ((c.max - c.min) * k) / (PUNTI_CURVA - 1)
      const y = pccDaLettura(c, x)
      if (Number.isFinite(y)) risultato.push([x, y])
    }
    return risultato
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img"
      aria-label={riassunto} style={perImmagine ? undefined : { display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      {apertura}
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
            <line x1={n2(xDi(v))} x2={n2(xDi(v))} y1={basso} y2={basso + 4} stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} />
            <text x={n2(xDi(v))} y={basso + 17} textAnchor="middle">{formattaNumero(v)}</text>
          </g>
        ))}
        <text x={(sinistra + destra) / 2} y={basso + 34} textAnchor="middle">{nomeX}</text>
        <text x={sinistra} y={alto - 6}>% CC</text>
      </g>

      {gruppi.map((g, i) => {
        const colore = COLORI_SERIE[i % COLORI_SERIE.length]
        const marcatore = MARCATORI[i % MARCATORI.length]
        const curva = campionata(g)
        return (
          <g key={g.substrato}>
            {g.vasi.map(v => (
              v.punti.length > 1 && (
                <path
                  key={v.campione.id} data-vaso={v.campione.id} d={percorso(v.punti.map((p): [number, number] => [p.lettura, p.pcc]))}
                  fill="none" stroke={colore} strokeWidth={1} opacity={0.6} strokeLinejoin="round" strokeLinecap="round"
                />
              )
            ))}
            {curva.length > 1 && (
              <path
                data-media={g.substrato} d={percorso(curva)} fill="none" stroke={colore} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {g.vasi.flatMap(v => v.punti.map((p, k) => (
              <path
                key={`${v.campione.id}-${k}`} data-marcatore={g.substrato} d={marcatore}
                transform={`translate(${n2(xDi(p.lettura))} ${n2(yDi(p.pcc))})`} fill={colore} stroke={fondo} strokeWidth={3} paintOrder="stroke"
              />
            )))}
          </g>
        )
      })}

      {legenda.map(({ g, i, x, riga }) => {
        const y = altezza - altezzaLegenda + 12 + riga * ALTEZZA_RIGA_LEGENDA
        const colore = COLORI_SERIE[i % COLORI_SERIE.length]
        return (
          <g key={g.substrato} data-legenda={g.substrato}>
            <line x1={x} x2={x + 16} y1={y - 4} y2={y - 4} stroke={colore} strokeWidth={3} />
            <path d={MARCATORI[i % MARCATORI.length]} transform={`translate(${x + 8} ${y - 4})`} fill={colore} />
            <text x={x + 22} y={y} fill={COLORI_GRAFICO.grafite} fontFamily={FONT_DATI} fontSize={CORPO_TESTO}>{g.substrato}</text>
          </g>
        )
      })}
    </svg>
  )
}
