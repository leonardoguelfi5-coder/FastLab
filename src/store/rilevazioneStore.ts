import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RilevazionePrincipale } from '@/types'

interface RilevazioneStore {
  rilevazioni: RilevazionePrincipale[]
  lastTempAria: number | null
  addRilevazione: (r: RilevazionePrincipale) => void
  deleteRilevazione: (id: string) => void
  setLastTempAria: (value: number | null) => void
}

export const useRilevazioneStore = create<RilevazioneStore>()(
  persist(
    (set) => ({
      rilevazioni: [],
      lastTempAria: null,
      addRilevazione: (r) => set((state) => ({ rilevazioni: [r, ...state.rilevazioni] })),
      deleteRilevazione: (id) => set((state) => ({ rilevazioni: state.rilevazioni.filter((r) => r.id !== id) })),
      setLastTempAria: (value) => set({ lastTempAria: value }),
    }),
    { name: 'fastlab-store' }
  )
)
