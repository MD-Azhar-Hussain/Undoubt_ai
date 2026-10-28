import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import './index.css'
import { configured } from './config/environment'
const App = lazy(() => import('./App.jsx'));
import ErrorBoundary from './ErrorBoundary.jsx'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {configured ? <Suspense fallback={<p className="p-8">Loading Undoubt…</p>}><App /></Suspense> : <main className="min-h-screen bg-gray-950 text-white p-10"><h1 className="text-3xl font-bold">Undoubt is being set up</h1><p className="mt-4">Sign-in is not available yet. Please contact the workspace owner.</p></main>}
      <ToastContainer
        limit={2}
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </ErrorBoundary>
  </StrictMode>,
)
