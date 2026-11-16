import type { ReactElement } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/guards'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/Password'
import { DashboardPage } from './pages/Dashboard'
import { ComingSoon, NoAccessPage, NotFoundPage } from './pages/Misc'
import { TeamPage } from './pages/Team'
import { BriefBuilderPage } from './pages/BriefBuilder'
import { BriefsPage } from './pages/Briefs'
import { ReportsPage } from './pages/Reports'
import { TasksPage } from './pages/Tasks'
import { SettingsPage } from './pages/Settings'
import { PrivacyPage } from './pages/Privacy'
import { PublicBriefPage } from './pages/PublicBrief'
import { NAV } from './lib/roles'
import { CustomersPage } from './pages/Customers'
import { CustomerDetailPage } from './pages/CustomerDetail'
import { PagesPage } from './pages/PagesPage'
import { ContractsPage } from './pages/Contracts'

// โหมดสาธิตโฮสต์ใน sub-path ของ GitHub Pages จึงใช้ HashRouter
const Router = import.meta.env.VITE_DEMO === '1' ? HashRouter : BrowserRouter

const SCREENS: Record<string, ReactElement> = {
  customers: <CustomersPage />, pages: <PagesPage />, contracts: <ContractsPage />,
  team: <TeamPage />, settings: <SettingsPage />, reports: <ReportsPage />, tasks: <TasksPage />, 'brief-builder': <BriefBuilderPage />, briefs: <BriefsPage />,
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/brief/:token" element={<PublicBriefPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            {NAV.filter((n) => n.path !== '/').map((n) => (
              <Route key={n.key} path={n.path.slice(1)} element={<RequireAuth roles={n.roles}>{SCREENS[n.key] ?? <ComingSoon />}</RequireAuth>} />
            ))}
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="no-access" element={<NoAccessPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  )
}
