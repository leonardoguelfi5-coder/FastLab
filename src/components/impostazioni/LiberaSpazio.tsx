import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { chiavi } from '@/api/query'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messaggioErrore } from '@/lib/errori'
import { toastSalvato } from '@/lib/toastSalvato'
import { liberaSpazio } from './archivioFoto'

/**
 * «Libera lo spazio», dopo un download riuscito: una conferma forte che chiede il nome dell'esperimento. Il confronto
 * ignora gli spazi ai bordi ed è sensibile alle maiuscole: scrivere il nome giusto è il gesto che dice «lo voglio».
 * Se si ferma a metà il dialogo resta aperto con l'errore e «Riprova»: il nome è già scritto e un nuovo giro porta a
 * termine il resto (vedi `archiviaFileFoto`).
 */
export function LiberaSpazio({ espId, nomeEsperimento, quante, nomeFile }: { espId: string; nomeEsperimento: string; quante: number; nomeFile: string }) {
  const queryClient = useQueryClient()
  const [aperta, setAperta] = useState(false)
  const [scritto, setScritto] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<unknown>(null)
  const corrisponde = scritto.trim() === nomeEsperimento.trim()

  const apri = () => { setScritto(''); setErrore(null); setAperta(true) }

  const libera = async () => {
    if (!corrisponde || inCorso) return
    setInCorso(true)
    setErrore(null)
    try {
      const n = await liberaSpazio(espId)
      toastSalvato(n === 1 ? 'Spazio liberato: 1 foto archiviata.' : `Spazio liberato: ${n} foto archiviate.`)
      setAperta(false)
    } catch (e) {
      setErrore(e)
    } finally {
      setInCorso(false)
      // Anche a metà qualcosa può essere cambiato: la galleria e lo spazio si rileggono.
      void queryClient.invalidateQueries({ queryKey: chiavi.foto(espId) })
    }
  }

  const invia = (evento: FormEvent) => { evento.preventDefault(); void libera() }

  return (
    <>
      <Button variant="destructive" onClick={apri}>Libera lo spazio</Button>
      <Dialog open={aperta} onOpenChange={aperto => { if (!aperto && !inCorso) setAperta(false) }}>
        <DialogContent showCloseButton={false}>
          <form onSubmit={invia} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Liberare lo spazio?</DialogTitle>
              <DialogDescription>
                {`Toglie dall'app i file di ${quante === 1 ? '1 foto' : `${quante} foto`}, quelle del .zip appena scaricato: nella galleria restano come segnaposto «Archiviata nel .zip». Le foto aggiunte dopo il download non si toccano. Non si può annullare: controlla di avere salvato il file ${nomeFile}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="libera-nome">Nome dell&apos;esperimento</Label>
              <p className="font-mono text-sm text-grafite">{nomeEsperimento}</p>
              <Input
                id="libera-nome" value={scritto} onChange={e => setScritto(e.target.value)} disabled={inCorso}
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                placeholder="Scrivilo qui per confermare"
              />
            </div>
            {inCorso && <p role="status" className="text-sm text-grafite-tenue">Libero lo spazio…</p>}
            {errore !== null && !inCorso && (
              <div role="alert"><TestoErrore className="text-base">{messaggioErrore(errore)}</TestoErrore></div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={inCorso} onClick={() => setAperta(false)}>Annulla</Button>
              <Button type="submit" variant="destructive-solid" disabled={!corrisponde || inCorso}>
                {errore !== null && !inCorso ? 'Riprova' : 'Libera lo spazio'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
