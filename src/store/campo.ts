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
   * Le scelte di un esperimento. Il risultato è lo stesso oggetto finché lo stato (e il giorno) non cambiano:
   * `useCampoStore(s => s.dati(espId))` si può usare così com'è nei componenti.
   */
  dati: (espId: string) => DatiCampo
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
const memo = new Map<string, { scelte: ScelteCampo | undefined; oggi: string; dati: DatiCampo }>()

function leggi(stato: Record<string, ScelteCampo>, espId: string): DatiCampo {
  const scelte = stato[espId]
  const oggi = oggiLocale()
  const ricordato = memo.get(espId)
  if (ricordato && ricordato.scelte === scelte && ricordato.oggi === oggi) return ricordato.dati
  // Un salvataggio vecchio o rovinato può non avere tutti i campi: si riempie ciò che manca.
  const dati: DatiCampo = {
    passataId: scelte?.passataId ?? null,
    dataRilievo: scelte?.dataRilievo || oggi,
    ricordati: scelte?.ricordati ?? senzaValori,
  }
  memo.set(espId, { scelte, oggi, dati })
  return dati
}

const nuove = (): ScelteCampo => ({ passataId: null, ricordati: senzaValori })

/** Le scelte di campo per esperimento, salvate sul dispositivo (comodità di chi rileva, non un dato dell'esperimento). */
export const useCampoStore = create<CampoStore>()(
  persist(
    (set, get) => ({
      stato: {},
      dati: espId => leggi(get().stato, espId),
      setPassata: (espId, passataId) =>
        set(s => ({ stato: { ...s.stato, [espId]: { ...(s.stato[espId] ?? nuove()), passataId } } })),
      setData: (espId, data) =>
        set(s => {
          const scelte: ScelteCampo = { ...(s.stato[espId] ?? nuove()) }
          if (data === oggiLocale()) delete scelte.dataRilievo
          else scelte.dataRilievo = data
          return { stato: { ...s.stato, [espId]: scelte } }
        }),
      ricorda: (espId, parametri, valori) =>
        set(s => {
          const scelte = s.stato[espId] ?? nuove()
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
