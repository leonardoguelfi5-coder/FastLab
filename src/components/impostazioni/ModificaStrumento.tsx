import { useState } from 'react'
import { EditorStrumento } from '@/components/config/EditorStrumento'
import { Conferma } from '@/components/Conferma'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import type { Parametro } from '@/domain/tipi'
import type { BozzaStrumento, GestoreStrumenti } from './useStrumenti'

interface ModificaStrumentoProps {
  g: GestoreStrumenti
  voce: BozzaStrumento
  /** La tabella fenologica: valori di ogni tipo, e niente "Archivia" (ce n'è una sola per esperimento, anche archiviata). */
  tabella?: boolean
}

type Chiede = 'archivia' | 'elimina' | { valore: Parametro } | null

/**
 * Il corpo di una voce di strumento nelle impostazioni: l'editor con i suoi valori, i problemi, "Salva" e le azioni sullo
 * strumento. "Elimina" compare solo se si sa che non ha misure; "Archivia" è sempre possibile. Per un valore già salvato il
 * pulsante è "Archivia il valore" (con dati, o finché non si sa) oppure "Elimina il valore" (senza dati, con conferma).
 */
export function ModificaStrumento({ g, voce, tabella }: ModificaStrumentoProps) {
  const [chiede, setChiede] = useState<Chiede>(null)
  const salvato = g.salvato(voce.id)
  const modificato = g.modificato(voce)
  const { dello, tutti } = g.problemi(voce)
  const conMisure = g.conMisure(voce.id)
  // I valori che sparirebbero con lo strumento: quelli salvati (i nuovi non esistono ancora).
  const suoi = salvato ? voce.parametri.filter(p => salvato.parametri.some(pp => pp.parametro_id === p.id)) : []
  const daEliminare = typeof chiede === 'object' && chiede !== null ? chiede.valore : null

  function azioneValore(p: Parametro) {
    // Un valore non ancora nel database (appena aggiunto) si toglie dalla bozza, come nel wizard.
    if (!g.valoreSalvato(p.id)) return undefined
    // Finché non si sa (o se la lettura è fallita) un valore si tratta come se avesse dati: si archivia, mai si elimina.
    const nome = p.nome.trim() || 'senza nome'
    return g.valoreConDati(p.id) !== false ? (
      <Button
        variant="outline"
        size="sm"
        aria-label={`Archivia il valore «${nome}»`}
        disabled={g.inCorso}
        onClick={() => void g.archiviaValore(voce.strumento, p)}
        className="self-start"
      >
        Archivia il valore
      </Button>
    ) : (
      <Button
        variant="destructive"
        size="sm"
        aria-label={`Elimina il valore «${nome}»`}
        disabled={g.inCorso}
        onClick={() => setChiede({ valore: p })}
        className="self-start"
      >
        Elimina il valore
      </Button>
    )
  }

  return (
    <>
      <EditorStrumento
        valore={{ strumento: voce.strumento, parametri: voce.parametri }}
        onChange={v => g.cambia(voce, { id: voce.id, ...v })}
        tipoFenologico={tabella}
        altriParametri={g.altriParametri(voce)}
        bloccoTipo={g.bloccoTipo}
        problemiExtra={g.problemiExtra}
        azioniValore={azioneValore}
      />
      {/* Uno strumento non ancora salvato (es. aggiunto dal catalogo con un nome già usato) mostra tutti i problemi, anche dei valori. */}
      {(salvato ? dello : tutti).length > 0 && (
        <div className="flex flex-col gap-1">{(salvato ? dello : tutti).map(e => <TestoErrore key={e}>{e}</TestoErrore>)}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!modificato || tutti.length > 0 || g.inCorso} onClick={() => void g.salva(voce)}>
          {g.inCorso ? 'Salvataggio…' : 'Salva'}
        </Button>
        {salvato && modificato && (
          <Button variant="ghost" disabled={g.inCorso} onClick={() => g.scarta(voce)}>Annulla le modifiche</Button>
        )}
      </div>

      {salvato === undefined ? (
        <Button variant="destructive" size="sm" className="self-start" disabled={g.inCorso} onClick={() => g.scarta(voce)}>
          Scarta
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!tabella && (
            <Button variant="outline" size="sm" disabled={g.inCorso} onClick={() => setChiede('archivia')}>Archivia strumento</Button>
          )}
          {conMisure === false && g.valoriNoti && (
            <Button variant="destructive" size="sm" disabled={g.inCorso} onClick={() => setChiede('elimina')}>
              {tabella ? 'Elimina la tabella fenologica' : 'Elimina strumento'}
            </Button>
          )}
        </div>
      )}

      <Conferma
        aperta={chiede === 'archivia'}
        titolo={`Archiviare lo strumento «${voce.strumento.nome}»?`}
        testo={
          'Non compare più tra gli strumenti da misurare; le sue misure restano nella storia e nell\'export. Lo puoi ripristinare.'
          + (modificato ? ' Le modifiche non salvate di questo strumento andranno perse.' : '')
        }
        annulla="Annulla"
        conferma="Archivia"
        onAnnulla={() => setChiede(null)}
        onConferma={() => { setChiede(null); if (salvato) void g.archivia(salvato) }}
      />
      <Conferma
        aperta={chiede === 'elimina'}
        titolo={tabella ? 'Eliminare la tabella fenologica?' : `Eliminare lo strumento «${voce.strumento.nome}»?`}
        testo={
          `${tabella ? 'La tabella non ha misure.' : 'Lo strumento non ha misure.'} `
          + (suoi.length > 0 ? `Si eliminano anche i suoi valori (${suoi.map(p => p.nome.trim()).join(', ')}): non hanno dati. ` : '')
          + 'L\'operazione non si può annullare.'
        }
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setChiede(null)}
        onConferma={() => { setChiede(null); if (salvato) void g.elimina(salvato) }}
      />
      <Conferma
        aperta={daEliminare !== null}
        titolo={`Eliminare il valore «${daEliminare?.nome.trim() ?? ''}»?`}
        testo="Il valore non ha dati: sparisce dallo strumento. L'operazione non si può annullare."
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setChiede(null)}
        onConferma={() => { setChiede(null); if (daEliminare) void g.eliminaValore(voce.strumento, daEliminare) }}
      />
    </>
  )
}
