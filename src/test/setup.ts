import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Con `globals: false` RTL non registra da solo il cleanup automatico.
afterEach(() => cleanup())
