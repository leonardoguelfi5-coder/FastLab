import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// Con `globals: false` RTL non registra da solo il cleanup automatico.
afterEach(() => cleanup())

// Su Windows+OneDrive il primo rendering di un file di test può superare da solo il secondo di attesa predefinito
// di findBy*/waitFor, specie con più file in parallelo: i test restano rapidi, ma non diventano instabili.
configure({ asyncUtilTimeout: 5_000 })
