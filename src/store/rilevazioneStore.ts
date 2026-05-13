import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RilevazionePrincipale } from '@/types'

interface RilevazioneStore {
  rilevazioni: RilevazionePrincipale[]
  lastTempAria: number | null
  addRilevazione: (r: RilevazionePrincipale) => void
  updateRilevazione: (r: RilevazionePrincipale) => void
  deleteRilevazione: (id: string) => void
  setLastTempAria: (value: number | null) => void
}

export const useRilevazioneStore = create<RilevazioneStore>()(
  persist(
    (set) => ({
      rilevazioni: [],
      lastTempAria: null,
      addRilevazione: (r) => set((state) => ({ rilevazioni: [r, ...state.rilevazioni] })),
      updateRilevazione: (r) =>
        set((state) => ({
          rilevazioni: state.rilevazioni.map((existing) =>
            existing.id === r.id ? r : existing
          ),
        })),
      deleteRilevazione: (id) =>
        set((state) => ({ rilevazioni: state.rilevazioni.filter((r) => r.id !== id) })),
      setLastTempAria: (value) => set({ lastTempAria: value }),
    }),
    { name: 'fastlab-store' }
  )
)
