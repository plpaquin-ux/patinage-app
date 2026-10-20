import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import ChronoPage from './pages/Chrono'
import ChronoEditPage from './pages/ChronoEdit'
import { CompetitionDetailPage, CompetitionFormPage, CompetitionsPage } from './pages/Competitions'
import { EntrainementsPage, SeancePage } from './pages/Entrainement'
import { CoursePage, EpreuvePage } from './pages/Epreuve'
import HistoriquePage from './pages/Historique'
import HomePage from './pages/Home'
import LoginPage, { OnboardingPage } from './pages/Login'
import { AthletesPage, CircuitsPage, DistancesPage, PistesPage, PlusPage, SaisonsPage } from './pages/Plus'

function Gate() {
  const { loading, session, compte } = useAuth()
  if (loading) {
    return (
      <div className="login">
        <div className="muted">Chargement…</div>
      </div>
    )
  }
  if (!session) return <LoginPage />
  if (!compte) return <OnboardingPage />
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/chrono" element={<ChronoPage />} />
      <Route path="/chrono/:id" element={<ChronoEditPage />} />
      <Route path="/competitions" element={<CompetitionsPage />} />
      <Route path="/competitions/nouvelle" element={<CompetitionFormPage />} />
      <Route path="/competitions/:id" element={<CompetitionDetailPage />} />
      <Route path="/competitions/:id/modifier" element={<CompetitionFormPage />} />
      <Route path="/epreuves/:id" element={<EpreuvePage />} />
      <Route path="/courses/:id" element={<CoursePage />} />
      <Route path="/entrainement" element={<EntrainementsPage />} />
      <Route path="/entrainement/:id" element={<SeancePage />} />
      <Route path="/historique" element={<HistoriquePage />} />
      <Route path="/plus" element={<PlusPage />} />
      <Route path="/plus/athletes" element={<AthletesPage />} />
      <Route path="/plus/pistes" element={<PistesPage />} />
      <Route path="/plus/circuits" element={<CircuitsPage />} />
      <Route path="/plus/distances" element={<DistancesPage />} />
      <Route path="/plus/saisons" element={<SaisonsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  )
}
