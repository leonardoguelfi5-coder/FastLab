import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { svuotaCacheAlCambioUtente } from '@/api/auth'
import { creaQueryClient } from '@/api/query'
import { Toaster } from '@/components/ui/sonner'

const queryClient = creaQueryClient()
svuotaCacheAlCambioUtente(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
