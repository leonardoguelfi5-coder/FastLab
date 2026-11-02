import type { NoteDellaData, ScalaGrafico, Serie } from '@/domain/dataset'
import {
  COLORI_GRAFICO, CORPO_TESTO, FONT_DATI, impagina, percorsoBarre, riassuntoGrafico, type SerieDisegnata,
} from '@/domain/grafico'

/** Due decimali bastano al disegno e tengono corto il markup (e l'SVG da trasformare in immagine). */
const n2 = (v: number) => Math.round(v * 100) / 100

interface GraficoSvgProps {
  serie: Serie[]
  note: NoteDellaData[]
  scala: ScalaGrafico
  /** L'unità del parametro, sulla tacca alta dell'asse Y. */
  unita?: string | null
  larghezza: number
  altezza: number
  /** Per l'immagine è il titolo scritto nel disegno (`SPAD · media per trattamento ± ES`); sempre è l'inizio dell'etichetta. */
  titolo: string
  /** Per l'immagine dell'Excel: fondo foglio, titolo e legenda dentro il disegno, e il font incorporato se c'è. */
  perImmagine?: boolean
  /** Il woff2 di Geist Mono come data URL (`fontGeistMono`), solo per l'immagine; `null` = ripiego su un monospazio di sistema. */
  fontIncorporato?: string | null
  /** La data scelta con un tocco: una linea verticale sottile. */
  cursore?: string | null
}

/**
 * Il grafico, in SVG scritto a mano: solo presentazione, senza hook né contesto, così funziona sia nell'app sia con
 * `renderToStaticMarkup` per l'immagine dell'Excel (lo stesso disegno per tutti e due). La geometria viene da
 * `impagina` (`domain/grafico.ts`). I colori sono esadecimali scritti nel disegno: un SVG trasformato in immagine non
 * legge le variabili CSS. Linee di 2 px, marcatori di circa 8 px con un anello color carta dove si sovrappongono,
 * griglia solo orizzontale, testi in Geist Mono grafite tenue (mai nel colore della serie).
 */
export function GraficoSvg({
  serie, note, scala, unita, larghezza, altezza, titolo, perImmagine = false, fontIncorporato = null, cursore = null,
}: GraficoSvgProps) {
  const imp = impagina(serie, note, { larghezza, altezza, scala, unita, perImmagine })
  const { area } = imp
  const fondo = perImmagine ? COLORI_GRAFICO.foglio : COLORI_GRAFICO.carta
  const xCursore = cursore === null ? undefined : imp.giorni.find(g => g.data === cursore)?.x
  // I riferimenti stanno sotto le serie vere, le piante e i trattamenti sopra.
  const ordine: SerieDisegnata[] = [...imp.serie.filter(s => s.stile.tenue), ...imp.serie.filter(s => !s.stile.tenue)]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={imp.larghezza}
      height={imp.altezza}
      viewBox={`0 0 ${imp.larghezza} ${imp.altezza}`}
      role="img"
      aria-label={riassuntoGrafico(imp, titolo)}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      {perImmagine && fontIncorporato && (
        <style>{`@font-face{font-family:"Geist Mono Variable";src:url(${fontIncorporato}) format("woff2");font-weight:100 900;font-style:normal}`}</style>
      )}
      {perImmagine && <rect width={imp.larghezza} height={imp.altezza} fill={fondo} />}
      {perImmagine && imp.titolo && (
        <text x={imp.titolo.x} y={imp.titolo.y} fill={COLORI_GRAFICO.grafite} fontFamily={FONT_DATI} fontSize={13} fontWeight={600}>
          {titolo}
        </text>
      )}

      {imp.vuoto ? (
        <text
          x={imp.larghezza / 2} y={(area.alto + area.basso) / 2} textAnchor="middle"
          fill={COLORI_GRAFICO.grafiteTenue} fontFamily={FONT_DATI} fontSize={CORPO_TESTO + 1}
        >
          Nessun dato da disegnare
        </text>
      ) : (
        <>
          <g fontFamily={FONT_DATI} fontSize={CORPO_TESTO} fill={COLORI_GRAFICO.grafiteTenue} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {imp.tacchey.map(t => (
              <g key={t.valore}>
                <line x1={area.sinistra} x2={area.destra} y1={n2(t.y)} y2={n2(t.y)} stroke={COLORI_GRAFICO.riga} strokeWidth={1} />
                <text x={area.sinistra - 6} y={n2(t.y + 4)} textAnchor="end">{t.etichetta}</text>
              </g>
            ))}
            <line x1={area.sinistra} x2={area.destra} y1={area.basso} y2={area.basso} stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} />
            {imp.tacchex.map(t => (
              <g key={t.data}>
                <line x1={n2(t.x)} x2={n2(t.x)} y1={area.basso} y2={area.basso + 4} stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} />
                <text x={n2(t.x)} y={area.basso + 17} textAnchor="middle">{t.etichetta}</text>
              </g>
            ))}
          </g>

          {imp.segni.map(s => (
            <g key={s.data} data-nota={s.data}>
              <line
                x1={n2(s.x)} x2={n2(s.x)} y1={area.alto} y2={area.basso}
                stroke={COLORI_GRAFICO.rigaForte} strokeWidth={1} strokeDasharray="2 3"
              />
              <path d={`M${n2(s.x - 5)} ${area.alto - 9}h10l-5 8z`} fill={COLORI_GRAFICO.grafiteTenue} />
              {s.quante > 1 && (
                <text
                  x={n2(s.x + 8)} y={area.alto - 2} fill={COLORI_GRAFICO.grafiteTenue}
                  fontFamily={FONT_DATI} fontSize={CORPO_TESTO - 1}
                >
                  {s.quante}
                </text>
              )}
            </g>
          ))}

          {xCursore !== undefined && (
            <line
              data-cursore={cursore} x1={n2(xCursore)} x2={n2(xCursore)} y1={area.alto} y2={area.basso}
              stroke={COLORI_GRAFICO.grafite} strokeWidth={1}
            />
          )}

          {ordine.map(s => (
            <g key={s.chiave} opacity={s.stile.tenue ? 0.4 : undefined}>
              {s.linea && (
                <path
                  data-serie={s.chiave} d={s.linea} fill="none" stroke={s.stile.colore} strokeWidth={s.stile.spessore}
                  strokeDasharray={s.stile.tratteggio ?? undefined} strokeLinejoin="round" strokeLinecap="round"
                />
              )}
              {s.barre.length > 0 && (
                <path data-barre={s.chiave} d={percorsoBarre(s.barre)} fill="none" stroke={s.stile.colore} strokeWidth={1.5} />
              )}
              {s.punti.map(p => (
                <path
                  key={p.data} d={s.stile.marcatore} transform={`translate(${n2(p.x)} ${n2(p.y)})`} fill={s.stile.colore}
                  stroke={fondo} strokeWidth={4} paintOrder="stroke"
                />
              ))}
            </g>
          ))}
        </>
      )}

      {perImmagine && imp.legenda.map(v => (
        <g key={v.indice} data-legenda={v.indice}>
          <g opacity={v.stile.tenue ? 0.4 : undefined}>
            <line
              x1={v.x - 2} x2={v.x + 12} y1={v.y - 4} y2={v.y - 4} stroke={v.stile.colore} strokeWidth={v.stile.spessore}
              strokeDasharray={v.stile.tratteggio ?? undefined}
            />
            <path d={v.stile.marcatore} transform={`translate(${v.x + 5} ${v.y - 4})`} fill={v.stile.colore} />
          </g>
          <text x={v.x + 18} y={v.y} fill={COLORI_GRAFICO.grafite} fontFamily={FONT_DATI} fontSize={CORPO_TESTO}>{v.testo}</text>
        </g>
      ))}
    </svg>
  )
}
