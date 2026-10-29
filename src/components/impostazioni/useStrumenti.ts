import { useState } from 'react'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import {
  archiviaParametro, archiviaStrumento, eliminaOArchiviaParametro, eliminaStrumento, parametriConDati, salvaParametro, salvaStrumento,
} from '@/api/configurazione'
import { chiavi } from '@/api/query'
import {
  nuovaTabellaFenologica, ordineStrumentoSuccessivo, parametriDello, problemiParametro, problemiStrumento, pulisciParametro,
} from '@/domain/bozza'
import type { ConfigEsperimento, Parametro, Strumento, TipoStrumento } from '@/domain/tipi'
import { ErroreDaMostrare, useAzione } from './azione'
import { uguali, useBozze, useSegnalaModifiche } from './modifiche'

/** Uno strumento con i suoi valori attivi, come si modifica: il collegamento ai valori archiviati sta nello strumento. */
export interface BozzaStrumento {
  id: string
  strumento: Strumento
  parametri: Parametro[]
}

const MOTIVO_DATI = 'Il tipo non si può cambiare: ci sono già dati.'
const MOTIVO_CONTROLLO = 'Controllo dei dati in corso: il tipo si cambia solo senza dati.'
const SOTTO_CAMPO_CON_DATI = 'Un sotto-campo con dati non si può togliere: i valori registrati sparirebbero. Puoi rinominarlo.'

/** I valori già registrati di una lista stanno sotto la chiave del sotto-campo: toglierlo li nasconderebbe. */
function sottoCampiTolti(salvato: Parametro, p: Parametro): boolean {
  const rimasti = new Set(p.sotto_campi.map(s => s.chiave))
  return salvato.tipo === 'lista' && salvato.sotto_campi.some(s => !rimasti.has(s.chiave))
}

const sostituisci = <T extends { id: string }>(elenco: T[], x: T): T[] =>
  elenco.some(e => e.id === x.id) ? elenco.map(e => (e.id === x.id ? x : e)) : [...elenco, x]

/** Un'eliminazione rifiutata perché esistono righe collegate (le misure): il database risponde 23503. */
const eVincolo = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23503'

const conArchiviato = (c: ConfigEsperimento, id: string): ConfigEsperimento =>
  ({ ...c, parametri: c.parametri.map(x => (x.id === id ? { ...x, archiviato: true } : x)) })

interface Opzioni {
  espId: string
  config: ConfigEsperimento
  /** Quali strumenti gestisce la sezione: gli strumenti o la tabella fenologica. */
  tipo: TipoStrumento
  /** Come la sezione dice alla pagina che ha modifiche non salvate. */
  chiave: string
  datiParametri: UseQueryResult<Set<string>>
  datiStrumenti: UseQueryResult<Set<string>>
}

/**
 * Tutto quel che serve a una sezione delle impostazioni per modificare i suoi strumenti, ognuno con i suoi valori e il
 * proprio "Salva": le bozze (per strumento, nella sezione: chiudere una voce non le perde), gli strumenti appena creati e
 * non ancora salvati, e le operazioni, una alla volta, con il loro esito. Le protezioni dei valori valgono qui, dentro lo
 * strumento: con dati un valore si archivia e mai si elimina, il tipo e i sotto-campi con dati non si toccano.
 */
export function useStrumenti({ espId, config, tipo, chiave, datiParametri, datiStrumenti }: Opzioni) {
  const queryClient = useQueryClient()
  const { inCorso, esegui } = useAzione(espId)
  const bozze = useBozze<BozzaStrumento>()
  // Gli strumenti appena creati come sono stati creati: quel che si scrive sta nelle bozze, come per quelli salvati.
  const [creati, setCreati] = useState<BozzaStrumento[]>([])
  const [aperta, setAperta] = useState<string | null>(null)

  const attivi = config.parametri.filter(p => !p.archiviato)
  const daConfig = (s: Strumento): BozzaStrumento => ({ id: s.id, strumento: s, parametri: parametriDello(s, attivi) })

  // Uno nuovo già arrivato in configurazione (salvato anche se la risposta si è persa) è ormai uno strumento salvato.
  const inConfig = new Set(config.strumenti.map(s => s.id))
  const nuovi = creati.filter(b => !inConfig.has(b.id))
  const salvati = config.strumenti.filter(s => s.tipo === tipo && !s.archiviato)
  const voci = [...salvati.map(s => bozze.valore(daConfig(s))), ...nuovi.map(b => bozze.valore(b))]
  const archiviati = config.strumenti.filter(s => s.tipo === tipo && s.archiviato)

  const modificato = (voce: BozzaStrumento): boolean => {
    const s = config.strumenti.find(x => x.id === voce.id)
    return s === undefined || !uguali(voce, daConfig(s))
  }
  useSegnalaModifiche(chiave, voci.some(modificato))

  /** Lo strumento ha misure? `undefined` finché non si sa (o se la lettura è fallita). */
  const conMisure = (id: string): boolean | undefined => datiStrumenti.data?.has(id)

  const valoreSalvato = (id: string) => config.parametri.some(p => p.id === id)
  /** Il valore ha dati? `undefined` finché non si sa (o se la lettura è fallita). */
  const valoreConDati = (id: string): boolean | undefined => datiParametri.data?.has(id)

  /** Il motivo per cui il tipo di un valore salvato è fermo, se lo è: ha dati, o non si sa ancora. */
  const bloccoTipo = (p: Parametro): string | null => {
    if (!config.parametri.some(x => x.id === p.id)) return null
    if (datiParametri.data === undefined) return MOTIVO_CONTROLLO
    return datiParametri.data.has(p.id) ? MOTIVO_DATI : null
  }

  // Finché non si sa (o se la lettura è fallita) un valore salvato si tratta come se avesse dati.
  const problemiExtra = (p: Parametro): string[] => {
    const salvato = config.parametri.find(x => x.id === p.id)
    return salvato && datiParametri.data?.has(salvato.id) !== false && sottoCampiTolti(salvato, p) ? [SOTTO_CAMPO_CON_DATI] : []
  }

  /** Gli altri valori dell'esperimento (archiviati compresi): un valore non può avere il loro stesso nome. */
  const altriParametri = (voce: BozzaStrumento): Parametro[] => {
    const suoi = new Set(voce.parametri.map(p => p.id))
    return config.parametri.filter(p => !suoi.has(p.id))
  }

  /** I problemi dello strumento da solo, e tutti insieme (anche dei suoi valori): "Salva" aspetta che non ce ne siano. */
  function problemi(voce: BozzaStrumento): { dello: string[]; tutti: string[] } {
    const altre = [...config.strumenti, ...nuovi.map(b => bozze.valore(b).strumento)]
    const idAttivi = new Set([...attivi.map(p => p.id), ...voce.parametri.map(p => p.id)])
    const dello = problemiStrumento(voce.strumento, altre, idAttivi)
    const intorno = altriParametri(voce)
    const deiValori = voce.parametri.flatMap(p => [...problemiParametro(p, [...voce.parametri, ...intorno]), ...problemiExtra(p)])
    return { dello, tutti: [...new Set([...dello, ...deiValori])] }
  }

  /**
   * Una modifica dell'editor. Un valore appena aggiunto prende l'`ordine` dopo il massimo dell'esperimento (non solo dello
   * strumento) e lo tiene: un nuovo tentativo di salvataggio riscrive lo stesso valore, non un altro.
   */
  function cambia(prima: BozzaStrumento, dopo: BozzaStrumento) {
    const noti = new Set([...config.parametri.map(p => p.id), ...prima.parametri.map(p => p.id)])
    let ordine = Math.max(-1, ...config.parametri.map(p => p.ordine), ...prima.parametri.map(p => p.ordine))
    bozze.cambia({ ...dopo, parametri: dopo.parametri.map(p => (noti.has(p.id) ? p : { ...p, ordine: ++ordine })) })
  }

  /**
   * "Salva" di uno strumento: in ordine i valori nuovi o modificati, poi lo strumento con i collegamenti. Se un passo
   * fallisce l'errore si mostra e la bozza resta; un nuovo "Salva" riparte da capo, e ogni passo è un upsert per id.
   */
  async function salva(inviata: BozzaStrumento): Promise<boolean> {
    const parametri = inviata.parametri.map(pulisciParametro)
    // Un valore eliminato nel frattempo non si manda: il collegamento fallirebbe (23503).
    const esistenti = new Set([...config.parametri.map(p => p.id), ...parametri.map(p => p.id)])
    const strumento: Strumento = {
      ...inviata.strumento,
      nome: inviata.strumento.nome.trim(),
      icona: inviata.strumento.icona?.trim() || null,
      parametri: inviata.strumento.parametri.filter(pp => esistenti.has(pp.parametro_id)),
    }
    const riuscito = await esegui(async () => {
      // Togliere un sotto-campo è ammesso solo senza dati: una misura può essere arrivata dopo l'apertura.
      const tolti = parametri.filter(p => {
        const salvato = config.parametri.find(x => x.id === p.id)
        return salvato !== undefined && sottoCampiTolti(salvato, p)
      })
      if (tolti.length > 0) {
        const fresche = await queryClient.fetchQuery({
          queryKey: chiavi.parametriConDati(espId), queryFn: () => parametriConDati(espId), staleTime: 0,
        })
        const conDati = tolti.find(p => fresche.has(p.id))
        if (conDati) throw new ErroreDaMostrare(`Il parametro «${conDati.nome}» ha già dei dati: i suoi sotto-campi non si possono togliere.`)
      }
      for (const p of parametri) {
        const gia = config.parametri.find(x => x.id === p.id)
        if (gia === undefined || !uguali(gia, p)) await salvaParametro(espId, p)
      }
      await salvaStrumento(espId, strumento)
    }, {
      messaggio: `Strumento «${strumento.nome}» salvato.`,
      aggiorna: c => ({
        ...c,
        parametri: parametri.reduce(sostituisci, c.parametri),
        strumenti: sostituisci(c.strumenti, strumento),
      }),
    })
    if (!riuscito) return false
    setCreati(n => n.filter(b => b.id !== inviata.id))
    bozze.salvata(inviata)
    return true
  }

  /** I valori di una bozza che sono nel database ma in nessuno strumento: restano di un tentativo di salvataggio andato male. */
  async function ripulisci(parametri: Parametro[]) {
    const collegati = new Set(config.strumenti.flatMap(s => s.parametri.map(pp => pp.parametro_id)))
    const orfani = parametri.filter(p => config.parametri.some(x => x.id === p.id) && !collegati.has(p.id))
    if (orfani.length === 0) return
    try {
      for (const p of orfani) await eliminaOArchiviaParametro(espId, p)
    } catch {
      // Se l'eliminazione non riesce resta un valore fuori da ogni strumento: non compare in nessun modulo di misura.
    }
    void queryClient.invalidateQueries({ queryKey: chiavi.config(espId) })
  }

  /** Uno strumento non salvato che non serve più, o le modifiche che si lasciano: via la bozza e i valori rimasti a metà. */
  function scarta(voce: BozzaStrumento) {
    setCreati(n => n.filter(b => b.id !== voce.id))
    bozze.scarta(voce.id)
    void ripulisci(voce.parametri)
  }

  /**
   * Uno strumento da aggiungere (dal catalogo o nuovo): i suoi valori vanno dopo il massimo dell'esperimento. Si salva
   * subito, a meno che non ci siano problemi (un nome già usato da un altro valore o strumento: il database non lo
   * impedisce): allora resta tra gli strumenti non salvati, aperto con gli errori, da correggere.
   */
  async function aggiungi(strumento: Strumento, parametri: Parametro[]): Promise<boolean> {
    const base = Math.max(-1, ...config.parametri.map(p => p.ordine))
    const voce: BozzaStrumento = {
      id: strumento.id,
      strumento: { ...strumento, ordine: ordineStrumentoSuccessivo(config) },
      parametri: parametri.map((p, i) => ({ ...p, ordine: base + 1 + i })),
    }
    setCreati(n => [...n, voce])
    setAperta(voce.id)
    if (problemi(voce).tutti.length > 0) return false
    return salva(voce)
  }

  /** La tabella fenologica nuova, vuota: esiste solo dopo il suo "Salva", con almeno una voce. */
  function preparaTabella() {
    const strumento = nuovaTabellaFenologica(ordineStrumentoSuccessivo(config))
    setCreati(n => [...n, { id: strumento.id, strumento, parametri: [] }])
    setAperta(strumento.id)
  }

  async function archivia(s: Strumento): Promise<boolean> {
    const riuscito = await esegui(() => archiviaStrumento(espId, s.id), {
      messaggio: `Strumento «${s.nome}» archiviato.`,
      neutro: true,
      aggiorna: c => ({ ...c, strumenti: c.strumenti.map(x => (x.id === s.id ? { ...x, archiviato: true } : x)) }),
    })
    if (riuscito) bozze.scarta(s.id)
    return riuscito
  }

  function ripristina(s: Strumento) {
    const ripristinato = { ...s, archiviato: false }
    void esegui(() => salvaStrumento(espId, ripristinato), {
      messaggio: `Strumento «${s.nome}» ripristinato.`,
      aggiorna: c => ({ ...c, strumenti: sostituisci(c.strumenti, ripristinato) }),
    })
  }

  /**
   * Elimina lo strumento e poi i suoi valori. Prima lo strumento: se ha misure il database rifiuta (23503) e non si è
   * toccato nient'altro. I valori vanno via con `eliminaOArchiviaParametro`, che se nel frattempo hanno dati li archivia.
   */
  async function elimina(s: Strumento): Promise<boolean> {
    const suoi = config.parametri.filter(p => s.parametri.some(pp => pp.parametro_id === p.id))
    const riuscito = await esegui(async () => {
      // Come per un valore solo: se nel frattempo uno dei suoi valori ha avuto dei dati, lo strumento non si elimina.
      const fresche = await queryClient.fetchQuery({
        queryKey: chiavi.parametriConDati(espId), queryFn: () => parametriConDati(espId), staleTime: 0,
      })
      if (suoi.some(p => fresche.has(p.id))) {
        throw new ErroreDaMostrare(s.tipo === 'fenologico'
          ? 'Alcune voci della tabella fenologica hanno già dei dati: non si può eliminare. Le voci con dati si archiviano.'
          : `Lo strumento «${s.nome}» ha valori con dati: non si può eliminare. Archivialo: sparisce dalla scelta in misura e i dati restano.`)
      }
      try {
        await eliminaStrumento(espId, s.id)
      } catch (e) {
        if (eVincolo(e)) {
          throw new ErroreDaMostrare(s.tipo === 'fenologico'
            ? 'La tabella fenologica ha già delle misure: non si può eliminare. Le sue voci con dati si archiviano.'
            : `Lo strumento «${s.nome}» ha già delle misure: non si può eliminare. Archivialo: sparisce dalla scelta in misura e le sue misure restano.`)
        }
        throw e
      }
      const esiti = new Map<string, 'eliminato' | 'archiviato'>()
      for (const p of suoi) esiti.set(p.id, await eliminaOArchiviaParametro(espId, p))
      return esiti
    }, {
      messaggio: 'Strumento eliminato.',
      neutro: true,
      aggiorna: (c, esiti) => ({
        ...c,
        strumenti: c.strumenti.filter(x => x.id !== s.id),
        parametri: c.parametri
          .filter(p => esiti.get(p.id) !== 'eliminato')
          .map(p => (esiti.get(p.id) === 'archiviato' ? { ...p, archiviato: true } : p)),
      }),
    })
    if (riuscito) {
      setCreati(n => n.filter(b => b.id !== s.id))
      bozze.scarta(s.id)
      setAperta(a => (a === s.id ? null : a))
    }
    return riuscito
  }

  /** Un valore uscito dal database (archiviato o eliminato) esce anche dalla bozza dello strumento, se ce n'è una. */
  function senzaValore(strumentoId: string, parametroId: string, eliminato: boolean) {
    // Archiviato, il valore resta collegato allo strumento; eliminato, il collegamento sparisce con lui.
    const togli = (b: BozzaStrumento): BozzaStrumento => ({
      ...b,
      strumento: eliminato
        ? { ...b.strumento, parametri: b.strumento.parametri.filter(pp => pp.parametro_id !== parametroId) }
        : b.strumento,
      parametri: b.parametri.filter(p => p.id !== parametroId),
    })
    bozze.modifica(strumentoId, togli)
    setCreati(n => n.map(b => (b.id === strumentoId ? togli(b) : b)))
  }

  /**
   * "Archivia il valore": mai un delete. Il collegamento allo strumento resta, e con lui la storia dei suoi dati. Senza
   * strumento (un valore rimasto fuori da ogni strumento) si archivia e basta.
   */
  async function archiviaValore(s: Strumento | null, p: Parametro) {
    const riuscito = await esegui(() => archiviaParametro(espId, p.id), {
      messaggio: `Valore «${p.nome}» archiviato.`,
      neutro: true,
      aggiorna: c => conArchiviato(c, p.id),
    })
    if (riuscito && s) senzaValore(s.id, p.id, false)
  }

  /** Dopo la conferma di "Elimina il valore": se nel frattempo sono arrivati dati, il server archivia invece di eliminare. */
  async function eliminaValore(s: Strumento, p: Parametro) {
    let eliminato = false
    const riuscito = await esegui(async () => {
      const esito = await eliminaOArchiviaParametro(espId, p)
      eliminato = esito === 'eliminato'
      return esito
    }, {
      messaggio: esito => (esito === 'archiviato' ? 'Valore archiviato.' : 'Valore eliminato.'),
      neutro: true,
      aggiorna: (c, esito) => esito === 'archiviato'
        ? conArchiviato(c, p.id)
        : {
            ...c,
            parametri: c.parametri.filter(x => x.id !== p.id),
            strumenti: c.strumenti.map(st => ({ ...st, parametri: st.parametri.filter(pp => pp.parametro_id !== p.id) })),
          },
    })
    if (riuscito) senzaValore(s.id, p.id, eliminato)
  }

  /** Un valore archiviato torna attivo, anche nella bozza del suo strumento se ce n'è una. */
  function ripristinaValore(p: Parametro) {
    const ripristinato = { ...p, archiviato: false }
    void esegui(() => salvaParametro(espId, ripristinato), {
      messaggio: `Valore «${p.nome}» ripristinato.`,
      aggiorna: c => ({ ...c, parametri: sostituisci(c.parametri, ripristinato) }),
    }).then(riuscito => {
      const suo = config.strumenti.find(s => s.parametri.some(pp => pp.parametro_id === p.id))
      if (riuscito && suo) bozze.modifica(suo.id, b => ({ ...b, parametri: sostituisci(b.parametri, ripristinato) }))
    })
  }

  return {
    inCorso, voci, archiviati, aperta, setAperta,
    modificato, conMisure, valoreSalvato, valoreConDati, bloccoTipo, problemiExtra, altriParametri, problemi,
    cambia, salva, scarta, aggiungi, preparaTabella, archivia, ripristina, elimina,
    archiviaValore, eliminaValore, ripristinaValore,
    /** Si sa quali valori hanno dati? Senza, "Elimina strumento" non si offre. */
    valoriNoti: datiParametri.data !== undefined,
    salvato: (id: string) => config.strumenti.find(s => s.id === id),
  }
}

/** Tutto quel che una sezione ha in mano per modificare i suoi strumenti. */
export type GestoreStrumenti = ReturnType<typeof useStrumenti>
