import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { eVuoto } from '@/domain/misure'
import type { Parametro, ValoriMisura } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'

/** Le scelte fatte in campo per un esperimento, come stanno nel localStorage. */
interface ScelteCampo {
  passataId: string | null
  /**
   * AAAA-MM-GG scelta da chi rileva. Assente se non è stata scelta nessuna data: vale allora la data di oggi,
   * che cambia con il giorno (così scegliere la passata, o riaprire l'app domani, non fissa il rilievo a ieri).
   */
  dataRilievo?: string
  /** Gli ultimi valori dei parametri "ricorda tra piante", per precompilare la pianta dopo. */
  ricordati: ValoriMisura
}

/** Quello che serve a una schermata: sempre completo, con la data di oggi se non ne è stata scelta un'altra. */
export interface DatiCampo {
  passataId: string | null
  dataRilievo: string
  ricordati: ValoriMisura
}

interface CampoStore {
  stato: Record<string, ScelteCampo>
  /**
   * Le scelte di un esperimento. `oggi` è il giorno con cui confrontare (di solito quello di `useOggi()`, così i
   * componenti restano d'accordo tra loro); senza, si guarda l'orologio. Il risultato è lo stesso oggetto finché lo
   * stato e il giorno non cambiano: `useCampoStore(s => s.dati(espId, oggi))` si può usare così com'è nei componenti.
   */
  dati: (espId: string, oggi?: string) => DatiCampo
  setPassata: (espId: string, passataId: string | null) => void
  /** Scegliere la data di oggi riporta a "oggi" (non la fissa): domani il rilievo sarà di domani. */
  setData: (espId: string, data: string) => void
  /**
   * Dopo un salvataggio: ricorda i valori dei soli parametri con `ricorda_tra_piante`. Un parametro presente ma
   * vuoto cancella il valore ricordato; uno assente dai `valori` (non è nella passata) resta com'era.
   */
  ricorda: (espId: string, parametri: Parametro[], valori: ValoriMisura) => void
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

const senzaValori: ValoriMisura = Object.freeze({})
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Le scelte di un esperimento rimesse in forma: un salvataggio vecchio o rovinato può mancare di campi o averli
 * del tipo sbagliato (una data che non è AAAA-MM-GG vale come nessuna data scelta, quindi oggi).
 */
function pulite(scelte: unknown): ScelteCampo {
  const s = eOggetto(scelte) ? scelte : {}
  const risultato: ScelteCampo = {
    passataId: typeof s.passataId === 'string' ? s.passataId : null,
    ricordati: eOggetto(s.ricordati) ? (s.ricordati as ValoriMisura) : senzaValori,
  }
  if (typeof s.dataRilievo === 'string' && DATA_ISO.test(s.dataRilievo)) risultato.dataRilievo = s.dataRilievo
  return risultato
}

// Il risultato dipende solo dalle scelte e dal giorno: si tiene per ogni coppia, così chi chiede con un giorno
// diverso (un componente non ancora aggiornato) non fa perdere a un altro il suo oggetto.
const SENZA_SCELTE = Object.freeze({ passataId: null, ricordati: senzaValori }) as ScelteCampo
const memo = new WeakMap<ScelteCampo, Map<string, DatiCampo>>()

function leggi(stato: Record<string, ScelteCampo>, espId: string, oggi: string): DatiCampo {
  const salvate = stato[espId]
  const chiave = eOggetto(salvate) ? (salvate as ScelteCampo) : SENZA_SCELTE
  let perGiorno = memo.get(chiave)
  if (!perGiorno) memo.set(chiave, (perGiorno = new Map()))
  let dati = perGiorno.get(oggi)
  if (!dati) {
    const { passataId, dataRilievo, ricordati } = pulite(salvate)
    perGiorno.set(oggi, (dati = { passataId, dataRilievo: dataRilievo ?? oggi, ricordati }))
  }
  return dati
}

/** Le scelte di campo per esperimento, salvate sul dispositivo (comodità di chi rileva, non un dato dell'esperimento). */
export const useCampoStore = create<CampoStore>()(
  persist(
    (set, get) => ({
      stato: {},
      dati: (espId, oggi = oggiLocale()) => leggi(get().stato, espId, oggi),
      setPassata: (espId, passataId) =>
        set(s => ({ stato: { ...s.stato, [espId]: { ...pulite(s.stato[espId]), passataId } } })),
      setData: (espId, data) =>
        set(s => {
          const scelte = pulite(s.stato[espId])
          if (data === oggiLocale()) delete scelte.dataRilievo
          else scelte.dataRilievo = data
          return { stato: { ...s.stato, [espId]: scelte } }
        }),
      ricorda: (espId, parametri, valori) =>
        set(s => {
          const scelte = pulite(s.stato[espId])
          const ricordati = { ...scelte.ricordati }
          for (const p of parametri) {
            if (!p.ricorda_tra_piante || !(p.id in valori)) continue
            if (eVuoto(p, valori[p.id])) delete ricordati[p.id]
            else ricordati[p.id] = structuredClone(valori[p.id])
          }
          return { stato: { ...s.stato, [espId]: { ...scelte, ricordati } } }
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
