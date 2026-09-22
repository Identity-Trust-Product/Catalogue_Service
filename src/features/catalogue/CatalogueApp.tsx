'use client'

import GlobalCatalogueModals from './components/GlobalCatalogueModals'
import { CatalogueProvider, useCatalogue } from './context/CatalogueContext'
import HomePage from './pages/HomePage'
import OrganizationLoginPage from './pages/OrganizationLoginPage'
import RegistrationPage from './pages/RegistrationPage'
import RegistrationSuccessPage from './pages/RegistrationSuccessPage'
import LoginBuilderPage from './pages/organization/LoginBuilderPage'
import OrganizationApplicationsPage from './pages/organization/OrganizationApplicationsPage'
import OrganizationDashboardPage from './pages/organization/OrganizationDashboardPage'
import OrganizationProfilePage from './pages/organization/OrganizationProfilePage'
import RegistrationBuilderPage from './pages/organization/RegistrationBuilderPage'
import type { CatalogueView } from './routes'

interface CatalogueAppProps {
  initialView?: CatalogueView
}

function CatalogueRoutes() {
  const { view } = useCatalogue()
  const isPlatformView = view.startsWith('platform')

  return (
    <main className="app-shell">
      {view === 'home' && <HomePage />}
      {view === 'registration' && <RegistrationPage />}
      {view === 'success' && <RegistrationSuccessPage />}
      {isPlatformView && <OrganizationLoginPage />}
      {view === 'organization' && <OrganizationLoginPage />}
      {view === 'organization-dashboard' && <OrganizationDashboardPage />}
      {view === 'org-profile' && <OrganizationProfilePage />}
      {view === 'org-applications' && <OrganizationApplicationsPage />}
      {view === 'org-registration-builder' && <RegistrationBuilderPage />}
      {view === 'org-login-builder' && <LoginBuilderPage />}
      <GlobalCatalogueModals />
    </main>
  )
}

export default function CatalogueApp({ initialView = 'home' }: CatalogueAppProps) {
  return (
    <CatalogueProvider initialView={initialView}>
      <CatalogueRoutes />
    </CatalogueProvider>
  )
}
