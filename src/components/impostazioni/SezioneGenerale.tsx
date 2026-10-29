import { useId, useState } from 'react'
import { aggiornaEsperimento } from '@/api/esperimenti'
import { Interruttore } from '@/components/config/Interruttore'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Esperimento } from '@/domain/tipi'
import { useAzione } from './azione'
import { uguali, useSegnalaModifiche } from './modifiche'
import { Sezione } from './Sezione'

/** Nome, data di inizio, note e stato dell'esperimento, con un solo "Salva". */
export function SezioneGenerale({ espId, esperimento }: { espId: string; esperimento: Esperimento }) {
  const id = useId()
  const { inCorso, esegui } = useAzione(espId)
  // Le modifiche non ancora salvate; senza, si mostra (e si segue) l'esperimento com'è salvato.
  const [bozza, setBozza] = useState<Esperimento | null>(null)
  const valore = bozza ?? esperimento
  const modificato = bozza !== null && !uguali(bozza, esperimento)
  useSegnalaModifiche('generale', modificato)

  const cambia = (modifica: Partial<Esperimento>) => setBozza({ ...valore, ...modifica })
  const senzaNome = valore.nome.trim() === ''

  async function salva() {
    if (bozza === null || senzaNome) return
    const inviata = bozza
    const campi = { nome: inviata.nome.trim(), data_inizio: inviata.data_inizio, note: inviata.note, stato: inviata.stato }
    const riuscito = await esegui(() => aggiornaEsperimento(espId, campi), {
      messaggio: 'Dati generali salvati.',
      aggiorna: c => ({ ...c, esperimento: { ...c.esperimento, ...campi } }),
    })
    // Se nel frattempo si è scritto ancora, quelle modifiche restano da salvare.
    if (riuscito) setBozza(b => (b === inviata ? null : b))
  }

  return (
    <Sezione titolo="Generale">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-nome`}>Nome</Label>
        <Input
          id={`${id}-nome`}
          value={valore.nome}
          aria-invalid={senzaNome || undefined}
          aria-describedby={senzaNome ? `${id}-nome-errore` : undefined}
          onChange={e => cambia({ nome: e.target.value })}
        />
        {senzaNome && <TestoErrore id={`${id}-nome-errore`}>Dai un nome all'esperimento.</TestoErrore>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-data`}>Data di inizio</Label>
        <Input
          id={`${id}-data`}
          type="date"
          variant="campo"
          value={valore.data_inizio ?? ''}
          onChange={e => cambia({ data_inizio: e.target.value === '' ? null : e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea id={`${id}-note`} value={valore.note} rows={3} onChange={e => cambia({ note: e.target.value })} />
      </div>
      <Interruttore
        etichetta="Esperimento concluso"
        aiuto="Un esperimento concluso resta modificabile: le misure si possono ancora correggere."
        checked={valore.stato === 'concluso'}
        onCheckedChange={concluso => cambia({ stato: concluso ? 'concluso' : 'in_corso' })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!modificato || senzaNome || inCorso} onClick={() => void salva()}>
          {inCorso ? 'Salvataggio…' : 'Salva'}
        </Button>
        {modificato && (
          <Button variant="ghost" disabled={inCorso} onClick={() => setBozza(null)}>Annulla le modifiche</Button>
        )}
      </div>
    </Sezione>
  )
}
