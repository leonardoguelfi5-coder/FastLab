import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Images } from 'lucide-react'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCaricaFoto, type CaricaFoto } from './useCaricaFoto'

/**
 * Come si presenta il pulsante:
 * - `principale`: "+ Aggiungi foto" a larghezza piena, per la `BarraAzioni` della galleria (le scelte si aprono sopra);
 * - `secondario`: "Aggiungi foto" nel contenuto (scheda della pianta, nota);
 * - `icona`: il solo 📷, piccolo, per l'intestazione di una pagina di lavoro come la misura.
 */
export type VarianteAggiungiFoto = 'principale' | 'secondario' | 'icona'

const VOCE_SCELTA = 'flex h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-base text-grafite transition-colors hover:bg-carta-ombra active:bg-carta-ombra [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-grafite-tenue'

interface PulsanteProps {
  carica: CaricaFoto
  variante?: VarianteAggiungiFoto
  /** Il nome del pulsante per chi non vede, es. «Aggiungi foto a questa pianta». */
  nome?: string
}

/**
 * Il pulsante con le due scelte, "Scatta" (fotocamera) e "Dalla galleria" (più foto insieme). Le scelte si aprono in un
 * menu che galleggia e non sposta la pagina: aprirlo non tocca né il modulo né la barra delle azioni. Il pulsante è
 * `type="button"`, quindi non invia mai un modulo in cui si trovi.
 */
export function PulsanteAggiungiFoto({ carica, variante = 'secondario', nome = 'Aggiungi foto' }: PulsanteProps) {
  const [aperto, setAperto] = useState(false)
  const radice = useRef<HTMLDivElement>(null)
  const scatto = useRef<HTMLInputElement>(null)
  const galleria = useRef<HTMLInputElement>(null)

  // Le scelte si chiudono con Escape o toccando fuori.
  useEffect(() => {
    if (!aperto) return
    const fuori = (evento: PointerEvent) => {
      if (!radice.current?.contains(evento.target as Node)) setAperto(false)
    }
    const tasto = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAperto(false)
    }
    document.addEventListener('pointerdown', fuori)
    document.addEventListener('keydown', tasto)
    return () => {
      document.removeEventListener('pointerdown', fuori)
      document.removeEventListener('keydown', tasto)
    }
  }, [aperto])

  function scelti(evento: ChangeEvent<HTMLInputElement>) {
    const files = evento.target.files ? Array.from(evento.target.files) : []
    // Svuotato subito: scegliere di nuovo la stessa foto deve far partire ancora l'evento.
    evento.target.value = ''
    carica.aggiungi(files)
  }

  function apri(input: React.RefObject<HTMLInputElement | null>) {
    setAperto(false)
    // Dentro il gesto del tocco: i telefoni aprono il selettore solo da qui.
    input.current?.click()
  }

  return (
    <div ref={radice} className={cn('relative', variante === 'principale' && 'w-full')}>
      {variante === 'icona' ? (
        <Button type="button" variant="quiet" size="icon" aria-label={nome} aria-expanded={aperto} onClick={() => setAperto(v => !v)}>
          <span aria-hidden className="text-[22px] leading-none">📷</span>
        </Button>
      ) : variante === 'principale' ? (
        <Button type="button" size="lg" className="w-full" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>
          + {nome}
        </Button>
      ) : (
        <Button type="button" variant="outline" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>
          {nome}
        </Button>
      )}

      {aperto && (
        <div
          role="group"
          aria-label="Come aggiungere la foto"
          className={cn(
            'absolute z-30 rounded-md border border-riga bg-foglio p-1 text-grafite shadow-galleggiante',
            variante === 'principale' ? 'inset-x-0 bottom-full mb-2' : 'top-full mt-1.5 w-64',
            variante === 'icona' && 'right-0',
          )}
        >
          <button type="button" className={VOCE_SCELTA} onClick={() => apri(scatto)}>
            <Camera aria-hidden />
            Scatta
          </button>
          <button type="button" className={VOCE_SCELTA} onClick={() => apri(galleria)}>
            <Images aria-hidden />
            Dalla galleria
          </button>
        </div>
      )}

      {/* I selettori di file veri restano nascosti: li apre il menu. `capture` apre la fotocamera posteriore. */}
      <input ref={scatto} type="file" accept="image/*" capture="environment" hidden tabIndex={-1} onChange={scelti} />
      <input ref={galleria} type="file" accept="image/*" multiple hidden tabIndex={-1} onChange={scelti} />
    </div>
  )
}

/**
 * Lo stato delle foto in caricamento, una riga da quaderno per foto: «Caricamento 2 di 5…» per quella in corso, «In
 * attesa» per le altre, e per una fallita il suo errore con «Riprova» e «Togli». Le salvate escono dall'elenco: le
 * mostra la galleria. Niente verde: il verde è solo per il toast «salvato».
 */
export function StatoCaricamentoFoto({ carica, className }: { carica: CaricaFoto; className?: string }) {
  if (carica.elementi.length === 0) return null
  return (
    <ul aria-label="Foto da caricare" className={cn('-mx-4 flex flex-col border-t border-riga', className)}>
      {carica.elementi.map(e => (
        <li key={e.id} className="flex flex-col gap-1 border-b border-riga px-4 py-3">
          <span className="truncate font-mono text-dato tabular-nums text-grafite">{e.nome}</span>
          {e.stato === 'errore' ? (
            <>
              <TestoErrore role="alert">{e.errore}</TestoErrore>
              <div className="-ml-3 flex gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label={`Riprova ${e.nome}`} onClick={() => carica.riprova(e.id)}>Riprova</Button>
                <Button type="button" variant="quiet" size="sm" aria-label={`Togli ${e.nome}`} onClick={() => carica.togli(e.id)}>Togli</Button>
              </div>
            </>
          ) : e.stato === 'corso' ? (
            <span role="status" className="font-mono text-sm tabular-nums text-grafite-tenue">
              {`Caricamento ${(carica.giro?.fatte ?? 0) + 1} di ${carica.giro?.totale ?? 1}…`}
            </span>
          ) : (
            <span className="text-sm text-grafite-tenue">In attesa</span>
          )}
        </li>
      ))}
    </ul>
  )
}

interface AggiungiFotoProps {
  espId: string
  /** Le foto aggiunte da qui si collegano a questa pianta... */
  piantaId?: string
  /** ...o a questa nota. */
  notaId?: string
  variante?: VarianteAggiungiFoto
  nome?: string
}

/** Il pulsante con le due scelte e, sotto, lo stato delle foto in caricamento. Dove il pulsante sta altrove, si usano i due pezzi. */
export function AggiungiFoto({ espId, piantaId, notaId, variante, nome }: AggiungiFotoProps) {
  const carica = useCaricaFoto(espId, { piantaId, notaId })
  return (
    <div className="flex flex-col items-start gap-3">
      <PulsanteAggiungiFoto carica={carica} variante={variante} nome={nome} />
      <StatoCaricamentoFoto carica={carica} className="self-stretch" />
    </div>
  )
}
