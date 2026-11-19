import ReactDOM from 'react-dom/client'
import App from './App'
import { tryRenderLegalPage } from './ui/LegalPages'
import './styles.css'
import { installLongPress } from './ui/longPress'

const legalPage = tryRenderLegalPage()
if (!legalPage) installLongPress()
ReactDOM.createRoot(document.getElementById('root')!).render(legalPage ?? <App />)
