import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { salvaPeso } from '@/api/pesatura'
import { chiavi } from '@/api/query'
import { passiDellaFase, primoPassoMancante, type FasePesata, type Passo } from '@/domain/pesatura/sequenza'
import type { CampionePesatura, Peso, SessionePesatura } from '@/domain/pesatura/tipi'
import { ePesoGiaInserito, messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'

interface Argomenti {
  espId: string
  sessione: SessionePesatura
  campioni: CampionePesatura[]
  pesi: Peso[]
  fase: FasePesata
}

/**
 * Il giro di una fase: i passi, il passo corrente e il salvataggio. Una sola fonte per la tastiera e per la voce
 * (Task 11): chi detta chiama `salva` e `vaiA` come fa la pagina.
 *
 * I passi si calcolano UNA volta all'ingresso nella fase e non si ricalcolano a ogni salvataggio: in asciugatura il
 * giro non si accorcia. Un peso salvato resta nel passo (stato locale), così il passo risulta pesato senza altre letture.
 */
export function usePesataSequenziale({ espId, sessione, campioni, pesi, fase }: Argomenti) {
  const queryClient = useQueryClient()
  const [passi, setPassi] = useState<Passo[]>(() => passiDellaFase(sessione, campioni, pesi, fase))
  const [indice, setIndice] = useState(() => primoPassoMancante(passi))
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<{ testo: string; giaInserito: boolean } | null>(null)
  const [ultimo, setUltimo] = useState<Passo | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)
  // L'id di un peso nuovo si sceglie una volta per passo: un nuovo tentativo dopo un errore riscrive la stessa riga (upsert).
  const idScelti = useRef(new Map<number, string>())

  const finito = indice >= passi.length

  function vaiA(i: number) {
    setErrore(null)
    setIndice(Math.min(Math.max(0, i), passi.length))
  }

  /** Salva il peso del passo corrente. Vero se è stato scritto (e si passa al passo dopo), falso altrimenti. */
  async function salva(valore: number, lettura: number | null): Promise<boolean> {
    const passo = passi[indice]
    if (!passo || inCorso.current) return false
    inCorso.current = true
    setOccupato(true)
    setErrore(null)
    const id = passo.peso?.id ?? idScelti.current.get(indice) ?? nuovoId()
    idScelti.current.set(indice, id)
    const peso: Peso = {
      id,
      campione_id: passo.campione.id,
      replica: passo.replica,
      tipo: fase,
      valore,
      lettura,
      misurato_il: new Date().toISOString(),
      ...(passo.peso?.creato_da ? { creato_da: passo.peso.creato_da } : {}),
    }
    try {
      await salvaPeso(espId, sessione.id, peso)
    } catch (e) {
      setErrore({ testo: messaggioErrore(e), giaInserito: ePesoGiaInserito(e) })
      inCorso.current = false
      setOccupato(false)
      return false
    }
    const salvato = { ...passo, peso }
    setPassi(p => p.map((x, i) => (i === indice ? salvato : x)))
    setUltimo(salvato)
    idScelti.current.delete(indice)
    void queryClient.invalidateQueries({ queryKey: chiavi.pesatura(espId) })
    setIndice(indice + 1)
    inCorso.current = false
    setOccupato(false)
    return true
  }

  return { passi, indice, finito, vaiA, salva, occupato, errore, ultimo }
}
