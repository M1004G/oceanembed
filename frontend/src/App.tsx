import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import LandingPage from './pages/LandingPage'
import ExplorerPage from './pages/ExplorerPage'
import AnomalyDashboardPage from './pages/AnomalyDashboardPage'
import CycloneIndicatorsPage from './pages/CycloneIndicatorsPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/anomalies" element={<AnomalyDashboardPage />} />
          <Route path="/cyclone" element={<CycloneIndicatorsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
