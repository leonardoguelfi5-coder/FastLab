import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listaExportSalvati, salvaExportSalvato } from '@/api/exportSalvati'
import { chiavi, useExportSalvati } from '@/api/query'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SceltaExport } from '@/domain/export/scelte'
import type { ExportSalvato } from '@/domain/tipi'
import { eNomeExportGiaUsato, messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { toastSalvato } from '@/lib/toastSalvato'

/** Lo stesso nome per il database: senza spazi ai bordi e senza badare alle maiuscole (indice `export_salvati_nome_unico`). */
const chiaveNome = (nome: string): string => nome.trim().toLowerCase()

/** Il massimo del database (`char_length(nome) <= 80`). */
const MASSIMO_NOME = 80

interface SalvaSceltaProps {
  espId: string
  /** Le scelte di adesso, o `null` se non sono valide (non si salva). */
  scelta: SceltaExport | null
  /** Dopo un salvataggio riuscito: l'id del salvato, che da ora è l'export in uso. */
  onSalvato: (id: string) => void
}

/**
 * «Salva questa scelta» (ghost): apre il campo «Nome» con «Salva». Un nome vuoto lo dice. Un nome già usato (nell'elenco,
 * o dal database con un 23505 se l'elenco era indietro) chiede `C'è già un export «…». Sostituirlo?`: «Sostituisci» fa
 * l'upsert sull'id di quello esistente, «Cambia nome» torna al campo. Un errore di rete lascia messaggio e campo intatti.
 * L'id del nuovo export nasce quando si apre il campo: un nuovo tentativo o un doppio tocco aggiornano la stessa riga.
 */
export function SalvaScelta({ espId, scelta, onSalvato }: SalvaSceltaProps) {
  const queryClient = useQueryClient()
  const salvati = useExportSalvati(espId)
  const [aperto, setAperto] = useState(false)
  const [nome, setNome] = useState('')
  const [id, setId] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [conflitto, setConflitto] = useState<ExportSalvato | null>(null)
  // Un secondo tocco prima che il primo salvataggio finisca non ne fa partire un altro (lo stato si aggiorna dopo).
  const occupato = useRef(false)

  function apri() {
    setId(nuovoId())
    setNome('')
    setErrore(null)
    setConflitto(null)
    setAperto(true)
  }
  function chiudi() {
    setAperto(false)
    setErrore(null)
    setConflitto(null)
  }

  async function salva(idDaUsare: string, nomeDaUsare: string) {
    if (scelta === null || occupato.current) return
    occupato.current = true
    setInCorso(true)
    setErrore(null)
    try {
      await salvaExportSalvato(espId, { id: idDaUsare, nome: nomeDaUsare, scelte: scelta })
      toastSalvato(`Export «${nomeDaUsare}» salvato.`)
      void queryClient.invalidateQueries({ queryKey: chiavi.exportSalvati(espId) })
      onSalvato(idDaUsare)
      chiudi()
    } catch (e) {
      if (eNomeExportGiaUsato(e)) {
        // L'elenco in cache era indietro: si rilegge per sapere quale export ha già quel nome e chiedere se sostituirlo.
        try {
          const elenco = await queryClient.fetchQuery({ queryKey: chiavi.exportSalvati(espId), queryFn: () => listaExportSalvati(espId), staleTime: 0 })
          const esistente = elenco.find(x => chiaveNome(x.nome) === chiaveNome(nomeDaUsare))
          if (esistente) setConflitto(esistente)
          else setErrore(messaggioErrore(e))
        } catch {
          setErrore(messaggioErrore(e))
        }
      } else {
        setErrore(messaggioErrore(e))
      }
    } finally {
      occupato.current = false
      setInCorso(false)
    }
  }

  function alInvio(evento: FormEvent) {
    evento.preventDefault()
    const pulito = nome.trim()
    if (pulito === '') {
      setErrore('Scrivi un nome per questo export.')
      return
    }
    const esistente = salvati.data?.find(x => chiaveNome(x.nome) === chiaveNome(pulito))
    if (esistente) {
      setConflitto(esistente)
      return
    }
    void salva(id, pulito)
  }

  if (!aperto) {
    return (
      <div>
        <Button type="button" variant="ghost" size="sm" className="-ml-3" disabled={scelta === null} onClick={apri}>Salva questa scelta</Button>
      </div>
    )
  }

  if (conflitto) {
    return (
      <div role="group" aria-label="Nome già usato" className="flex flex-col gap-2">
        <p className="text-base text-grafite">{`C'è già un export «${conflitto.nome}». Sostituirlo?`}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={inCorso} onClick={() => void salva(conflitto.id, nome.trim())}>Sostituisci</Button>
          <Button type="button" variant="quiet" size="sm" disabled={inCorso} onClick={() => setConflitto(null)}>Cambia nome</Button>
        </div>
        {errore && <TestoErrore role="alert">{errore}</TestoErrore>}
      </div>
    )
  }

  return (
    <form onSubmit={alInvio} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="esporta-nome">Nome</Label>
      <Input
        id="esporta-nome" variant="default" value={nome} maxLength={MASSIMO_NOME} autoComplete="off" autoFocus
        aria-invalid={errore !== null} aria-describedby={errore ? 'esporta-nome-errore' : undefined}
        placeholder="es. SPAD ultimo mese" onChange={e => { setNome(e.target.value); setErrore(null) }}
      />
      {errore && <TestoErrore id="esporta-nome-errore" role="alert">{errore}</TestoErrore>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={inCorso}>Salva</Button>
        <Button type="button" variant="quiet" size="sm" disabled={inCorso} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  )
}
