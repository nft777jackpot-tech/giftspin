import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TON_CONNECT_MANIFEST } from './config'
import { initTelegram } from './lib/telegram'
import './styles.css'

initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={TON_CONNECT_MANIFEST} uiPreferences={{ theme: THEME.DARK }}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
)
