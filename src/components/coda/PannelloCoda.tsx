import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Conferma } from '@/components/Conferma'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { togli, utenteCoda, type VoceCoda } from '@/lib/coda/codaMisure'
import { inviaCoda } from '@/lib/coda/invio'
import { useVociCoda } from '@/lib/coda/useCoda'
import { formattaData, oggiLocale } from '@/lib/date'
import { percorsoPianta } from '@/lib/percorsi'

/** "09:12" per oggi, "27/10/2026 18:40" per un altro giorno: la misura si riconosce dall'ora del rilievo. */
function quando(v: VoceCoda): string {
  const { data_rilievo: data, ora } = v.misura
  return data === oggiLocale() ? ora : `${formattaData(data)} ${ora}`
}

/** A che punto è la voce, a parole (mai solo colore). */
function statoDi(v: VoceCoda): string {
  if (v.stato === 'invio') return 'Invio…'
  if (v.errore) return `Ultimo tentativo: ${v.errore}`
  return 'In attesa di rete'
}

interface RigaProps { voce: VoceCoda; onScarta: (v: VoceCoda) => void; onChiudi: () => void }

function Riga({ voce, onScarta, onChiudi }: RigaProps) {
  const rifiutata = voce.stato === 'rifiutata'
  return (
    <li className="flex flex-col gap-1 border-b border-riga py-3">
      <p className="font-mono text-dato text-grafite tabular-nums">
        {`#${voce.etichetta}`}
        {voce.strumento && <>{' · '}<span className="font-sans">{voce.strumento}</span></>}
        {' · '}{quando(voce)}
      </p>
      {rifiutata ? (
        <>
          <p className="text-sm text-errore">{`Non inviata: ${voce.errore ?? 'il server non l\'ha accettata.'}`}</p>
          <div className="-ml-3 flex flex-wrap gap-1">
            <Link
              to={percorsoPianta(voce.espId, voce.misura.pianta_id)}
              onClick={onChiudi}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Apri la pianta
            </Link>
            <Button variant="ghost" size="sm" className="text-errore" onClick={() => onScarta(voce)}>Scarta</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-grafite-tenue">{statoDi(voce)}</p>
      )}
    </li>
  )
}

/**
 * Il pannello delle misure da inviare (foglio dal basso): una riga per misura, con pianta, strumento e ora, a che
 * punto è e, per le rifiutate, il motivo con "Apri la pianta" e "Scarta". "Invia ora" ritenta subito, senza aspettare
 * la fine dell'attesa dopo un errore. Niente verde qui: nessuna di queste misure è ancora sul server.
 */
export function PannelloCoda({ onChiudi }: { onChiudi: () => void }) {
  const queryClient = useQueryClient()
  const voci = useVociCoda()
  const [inviando, setInviando] = useState(false)
  const [daScartare, setDaScartare] = useState<VoceCoda | null>(null)
  const daInviare = voci.some(v => v.stato !== 'rifiutata')

  async function inviaOra() {
    const utente = utenteCoda()
    if (!utente || inviando) return
    setInviando(true)
    try {
      await inviaCoda(utente, queryClient, { forza: true })
    } finally {
      setInviando(false)
    }
  }

  function scarta() {
    const voce = daScartare
    setDaScartare(null)
    if (voce) togli(voce.utente, voce.misura.id)
  }

  return (
    <Dialog open onOpenChange={aperto => { if (!aperto) onChiudi() }}>
      <DialogContent className="top-auto bottom-0 left-1/2 max-h-[85dvh] max-w-lg translate-y-0 overflow-y-auto rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Misure da inviare</DialogTitle>
          <DialogDescription>
            Sono salvate su questo telefono e partono da sole appena c'è rete. Finché non arrivano, sul server non ci sono.
          </DialogDescription>
        </DialogHeader>
        {voci.length === 0 ? (
          <p className="text-grafite-tenue">Nessuna misura da inviare.</p>
        ) : (
          <ul className="border-t border-riga">
            {voci.map(v => <Riga key={v.misura.id} voce={v} onScarta={setDaScartare} onChiudi={onChiudi} />)}
          </ul>
        )}
        {daInviare && (
          <Button size="lg" className="w-full" disabled={inviando} onClick={() => void inviaOra()}>
            {inviando ? 'Invio…' : 'Invia ora'}
          </Button>
        )}
        <Conferma
          aperta={daScartare !== null}
          titolo="Scartare la misura?"
          testo={daScartare ? `Scartare la misura di #${daScartare.etichetta} delle ${daScartare.misura.ora}? I suoi valori andranno persi.` : ''}
          annulla="Annulla"
          conferma="Scarta"
          onAnnulla={() => setDaScartare(null)}
          onConferma={scarta}
        />
      </DialogContent>
    </Dialog>
  )
}
