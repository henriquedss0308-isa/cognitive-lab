import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyAppearance, readCachedAppearance } from './theme/theme'

// Antes do primeiro render: o tema real vem do IndexedDB, que é assíncrono.
// Pintar já com a última escolha conhecida evita o flash de tema errado.
const cached = readCachedAppearance(window.localStorage)
applyAppearance(document, cached.theme, cached.fontScale)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
