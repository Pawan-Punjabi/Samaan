import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './LandingPage.jsx'

const isStudioRoute = window.location.pathname.replace(/\/+$/, '') === '/app'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isStudioRoute ? <App /> : <LandingPage />}
  </StrictMode>,
)
