import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { vuotoPerForma } from '@/domain/misure'
import type { ValoreParametro, ValoriMisura } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'

/**
 * I parametri che chi rileva ha spuntato con "Mantieni questo parametro uguale anche nelle prossime misure", e i loro
 * ultimi valori. Valgono per uno strumento e un giorno di rilievo: altrove non si vedono (vedi `dati` e `mantenutiPer`).
 */
export interface Mantenuti {
  strumentoId: string
  /** AAAA-MM-GG del rilievo a cui valgono, sempre esplicita (anche se la data scelta era "oggi"). */
  data: string
  /** Gli id dei parametri spuntati. */
  parametri: string[]
  /** L'ultimo valore salvato dei soli parametri spuntati; un parametro spuntato senza valore parte vuoto. */
  valori: ValoriMisura
}

/** Le scelte fatte in campo per un esperimento, come stanno nel localStorage. */
interface ScelteCampo {
  strumentoId: string | null
  /**
   * AAAA-MM-GG scelta da chi rileva. Assente se non è stata scelta nessuna data: vale allora la data di oggi,
   * che cambia con il giorno (così scegliere lo strumento, o riaprire l'app domani, non fissa il rilievo a ieri).
   */
  dataRilievo?: string
  mantenuti?: Mantenuti
}

/** Quello che serve a una schermata: sempre completo, con la data di oggi se non ne è stata scelta un'altra. */
export interface DatiCampo {
  strumentoId: string | null
  dataRilievo: string
  /** I mantenuti, solo se sono quelli dello strumento e della data correnti; altrimenti `null`. */
  mantenuti: Mantenuti | null
}

interface CampoStore {
  stato: Record<string, ScelteCampo>
  /**
   * Le scelte di un esperimento. `oggi` è il giorno con cui confrontare (di solito quello di `useOggi()`, così i
   * componenti restano d'accordo tra loro); senza, si guarda l'orologio. Il risultato è lo stesso oggetto finché lo
   * stato e il giorno non cambiano: `useCampoStore(s => s.dati(espId, oggi))` si può usare così com'è nei componenti.
   */
  dati: (espId: string, oggi?: string) => DatiCampo
  setStrumento: (espId: string, strumentoId: string | null) => void
  /** Scegliere la data di oggi riporta a "oggi" (non la fissa): domani il rilievo sarà di domani. */
  setData: (espId: string, data: string) => void
  /**
   * I mantenuti validi per uno strumento e una data, anche diversi da quelli scelti nello store (il riquadro misura
   * con il proprio strumento): `null` se non ce ne sono per quella coppia. Lo stesso oggetto finché lo stato non cambia.
   */
  mantenutiPer: (espId: string, strumentoId: string, data: string) => Mantenuti | null
  /**
   * Spunta o toglie "Mantieni questo parametro uguale" per un parametro. Con uno strumento o una data diversi da
   * quelli dei mantenuti salvati si riparte da zero: la spunta non passa a un altro strumento o a un altro giorno.
   * Togliere la spunta toglie anche il valore mantenuto.
   */
  setMantieni: (espId: string, strumentoId: string, data: string, parametroId: string, attivo: boolean) => void
  /**
   * Dopo il salvataggio di una misura nuova: tiene una copia dei valori dei soli parametri spuntati presenti in `valori`.
   * Un parametro spuntato lasciato vuoto cancella il suo valore mantenuto; uno assente dai `valori` resta com'era.
   */
  aggiornaMantenuti: (espId: string, valori: ValoriMisura) => void
}

const CHIAVE = 'fastlab-campo'

/**
 * localStorage che non fa mai cadere l'app: in navigazione privata o con i dati del sito bloccati anche solo
 * accedervi può dare errore, e uno spazio finito fa fallire la scrittura. In quel caso le scelte
 * valgono finché la pagina resta aperta.
 */
const archivio: StateStorage = {
  getItem: nome => {
    try { return localStorage.getItem(nome) } catch { return null }
  },
  setItem: (nome, valore) => {
    try { localStorage.setItem(nome, valore) } catch { /* resta in memoria */ }
  },
  removeItem: nome => {
    try { localStorage.removeItem(nome) } catch { /* niente da togliere */ }
  },
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Le scelte di un esperimento rimesse in forma: un salvataggio vecchio o rovinato può mancare di campi o averli
 * del tipo sbagliato (una data che non è AAAA-MM-GG vale come nessuna data scelta, quindi oggi).
 */
function pulite(scelte: unknown): ScelteCampo {
  const s = eOggetto(scelte) ? scelte : {}
  // Prima della rinomina lo strumento scelto si salvava come `passataId`: vale finché non si scrive la chiave nuova.
  const strumentoId = typeof s.strumentoId === 'string' ? s.strumentoId : typeof s.passataId === 'string' ? s.passataId : null
  const risultato: ScelteCampo = { strumentoId }
  if (typeof s.dataRilievo === 'string' && DATA_ISO.test(s.dataRilievo)) risultato.dataRilievo = s.dataRilievo
  const mantenuti = mantenutiPuliti(s.mantenuti)
  if (mantenuti) risultato.mantenuti = mantenuti
  // Un salvataggio di prima di "Mantieni" porta `ricordati`: non serve più e non si riscrive.
  return risultato
}

/** I mantenuti rimessi in forma, o `null` se mancano o sono rovinati. Una copia: lo stato salvato non si tocca. */
function mantenutiPuliti(m: unknown): Mantenuti | null {
  if (!eOggetto(m)) return null
  if (typeof m.strumentoId !== 'string' || typeof m.data !== 'string' || !DATA_ISO.test(m.data)) return null
  if (!Array.isArray(m.parametri) || !eOggetto(m.valori)) return null
  const parametri = m.parametri.filter((id): id is string => typeof id === 'string')
  // Un valore ha senso solo per un parametro spuntato.
  const valori = Object.fromEntries(Object.entries(m.valori).filter(([id]) => parametri.includes(id))) as ValoriMisura
  return { strumentoId: m.strumentoId, data: m.data, parametri, valori }
}

// Il risultato dipende solo dalle scelte e dal giorno: si tiene per ogni coppia, così chi chiede con un giorno
// diverso (un componente non ancora aggiornato) non fa perdere a un altro il suo oggetto.
const SENZA_SCELTE = Object.freeze({ strumentoId: null }) as ScelteCampo
const memo = new WeakMap<ScelteCampo, Map<string, DatiCampo>>()
// Anche i mantenuti rimessi in forma si tengono per ogni voce, così chi li legge riceve sempre lo stesso oggetto.
const mantenutiMemo = new WeakMap<ScelteCampo, Mantenuti | null>()

function mantenutiDi(stato: Record<string, ScelteCampo>, espId: string): Mantenuti | null {
  const salvate = stato[espId]
  if (!eOggetto(salvate)) return null
  let m = mantenutiMemo.get(salvate as ScelteCampo)
  if (m === undefined) mantenutiMemo.set(salvate as ScelteCampo, (m = mantenutiPuliti((salvate as ScelteCampo).mantenuti)))
  return m
}

function leggi(stato: Record<string, ScelteCampo>, espId: string, oggi: string): DatiCampo {
  const salvate = stato[espId]
  const chiave = eOggetto(salvate) ? (salvate as ScelteCampo) : SENZA_SCELTE
  let perGiorno = memo.get(chiave)
  if (!perGiorno) memo.set(chiave, (perGiorno = new Map()))
  let dati = perGiorno.get(oggi)
  if (!dati) {
    const { strumentoId, dataRilievo } = pulite(salvate)
    const data = dataRilievo ?? oggi
    // I mantenuti valgono per lo strumento e la data di adesso: con la data implicita "oggi", fino a mezzanotte.
    const mantenuti = mantenutiDi(stato, espId)
    dati = { strumentoId, dataRilievo: data, mantenuti: mantenuti && mantenuti.strumentoId === strumentoId && mantenuti.data === data ? mantenuti : null }
    perGiorno.set(oggi, dati)
  }
  return dati
}

/** Le scelte di campo per esperimento, salvate sul dispositivo (comodità di chi rileva, non un dato dell'esperimento). */
export const useCampoStore = create<CampoStore>()(
  persist(
    (set, get) => ({
      stato: {},
      dati: (espId, oggi = oggiLocale()) => leggi(get().stato, espId, oggi),
      setStrumento: (espId, strumentoId) =>
        set(s => ({ stato: { ...s.stato, [espId]: { ...pulite(s.stato[espId]), strumentoId } } })),
      setData: (espId, data) =>
        set(s => {
          const scelte = pulite(s.stato[espId])
          if (data === oggiLocale()) delete scelte.dataRilievo
          else scelte.dataRilievo = data
          return { stato: { ...s.stato, [espId]: scelte } }
        }),
      mantenutiPer: (espId, strumentoId, data) => {
        const m = mantenutiDi(get().stato, espId)
        return m && m.strumentoId === strumentoId && m.data === data ? m : null
      },
      setMantieni: (espId, strumentoId, data, parametroId, attivo) =>
        set(s => {
          const scelte = pulite(s.stato[espId])
          const salvati = scelte.mantenuti
          const stessi = salvati !== undefined && salvati.strumentoId === strumentoId && salvati.data === data
          const parametri = stessi ? [...salvati.parametri] : []
          const valori: ValoriMisura = stessi ? { ...salvati.valori } : {}
          if (attivo) {
            if (!parametri.includes(parametroId)) parametri.push(parametroId)
          } else {
            const posto = parametri.indexOf(parametroId)
            if (posto >= 0) parametri.splice(posto, 1)
            delete valori[parametroId]
          }
          scelte.mantenuti = { strumentoId, data, parametri, valori }
          return { stato: { ...s.stato, [espId]: scelte } }
        }),
      aggiornaMantenuti: (espId, valori) =>
        set(s => {
          const scelte = pulite(s.stato[espId])
          const salvati = scelte.mantenuti
          if (!salvati) return s
          const nuovi: ValoriMisura = { ...salvati.valori }
          for (const id of salvati.parametri) {
            if (!(id in valori)) continue
            const v: ValoreParametro = valori[id]
            if (vuotoPerForma(v)) delete nuovi[id]
            else nuovi[id] = structuredClone(v)
          }
          scelte.mantenuti = { ...salvati, valori: nuovi }
          return { stato: { ...s.stato, [espId]: scelte } }
        }),
    }),
    {
      name: CHIAVE,
      version: 1,
      storage: createJSONStorage(() => archivio),
      partialize: s => ({ stato: s.stato }),
      // Un salvataggio con la forma sbagliata non deve rompere l'app: si riparte dallo stato vuoto.
      merge: (salvato, corrente) => {
        const stato = (salvato as { stato?: unknown } | undefined)?.stato
        const valido = typeof stato === 'object' && stato !== null && !Array.isArray(stato)
        return { ...corrente, stato: valido ? (stato as Record<string, ScelteCampo>) : corrente.stato }
      },
    },
  ),
)
