import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import ChronoPage from './pages/Chrono'
import ChronoEditPage from './pages/ChronoEdit'
import { CompetitionDetailPage, CompetitionFormPage, CompetitionsPage } from './pages/Competitions'
import { EntrainementsPage, SeancePage } from './pages/Entrainement'
import { CoursePage, EpreuvePage } from './pages/Epreuve'
import HistoriquePage from './pages/Historique'
import HomePage from './pages/Home'
import LoginPage, { OnboardingPage } from './pages/Login'
import PartagePage from './pages/Partage'
import { AthletesPage, CircuitsPage, DistancesPage, PistesPage, PlusPage, SaisonsPage } from './pages/Plus'
import SaisiePage from './pages/Saisie'

function Gate() {
  const { loading, session, compte, comptesLoaded } = useAuth()
  if (loading || (session && !compte && !comptesLoaded)) {
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
      <Route path="/saisie" element={<SaisiePage />} />
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

/** Les pages publiques (/partage/:jeton) ne passent pas par la connexion ni par l'onboarding. */
function Root() {
  const loc = useLocation()
  if (loc.pathname.startsWith('/partage/')) {
    return (
      <Routes>
        <Route path="/partage/:jeton" element={<PartagePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  return <Gate />
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </AuthProvider>
  )
}
