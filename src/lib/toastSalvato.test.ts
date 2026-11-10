import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(() => 'id-toast') } }))

import { toast } from 'sonner'
import { CLASSE_SALVATO, toastSalvato } from './toastSalvato'

beforeEach(() => vi.clearAllMocks())

describe('toastSalvato', () => {
  it('mostra un toast di successo con la classe "salvato" (il solo con il ✓ verde)', () => {
    expect(toastSalvato('Pianta #35 salvata')).toBe('id-toast')
    expect(toast.success).toHaveBeenCalledWith('Pianta #35 salvata', { className: CLASSE_SALVATO })
  })

  it('passa le altre opzioni e aggiunge la classe a quella già data', () => {
    toastSalvato('Pianta #35 salvata', { duration: 2000, className: 'altra' })
    expect(toast.success).toHaveBeenCalledWith('Pianta #35 salvata', { duration: 2000, className: `${CLASSE_SALVATO} altra` })
  })
})
