import ReactDOM from 'react-dom/client'
import App from './App'
import { tryRenderLegalPage } from './ui/LegalPages'
import './styles.css'

const legalPage = tryRenderLegalPage()
ReactDOM.createRoot(document.getElementById('root')!).render(legalPage ?? <App />)
