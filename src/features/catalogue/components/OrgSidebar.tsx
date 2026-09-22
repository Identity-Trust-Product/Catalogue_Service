'use client'

import { orgAdminMenu } from '../../../data/mockCatalogueData'
import { AdminIcon } from '../../../components/ui'
import { useCatalogue } from '../context/CatalogueContext'

interface OrgSidebarProps {
  activeItem: string
}

export default function OrgSidebar({ activeItem }: OrgSidebarProps) {
  const { setView } = useCatalogue()
  const visibleMenu = orgAdminMenu.filter((item) => !['Organization Profile', 'Applications', 'API Credentials', 'Webhooks'].includes(item))

  const handleClick = (item: string) => {
    if (item === 'Dashboard') setView('organization-dashboard')
    if (item === 'Organization Profile') setView('org-profile')
    if (item === 'Registration Builder') setView('org-registration-builder')
    if (item === 'Login Configuration') setView('org-login-builder')
    if (item === 'Applications') setView('org-applications')
  }

  return (
    <aside className="org-sidebar org-admin-sidebar">
      <div className="org-sidebar-brand">
        <span className="platform-brand-icon"><AdminIcon name="shield" /></span>
        <span><strong>Identity OS</strong><small>Admin Console</small></span>
      </div>
      <nav>
        {visibleMenu.map((item) => (
          <button type="button" key={item} className={`menu-item ${item === activeItem ? 'active' : ''}`} onClick={() => handleClick(item)}>
            <span className="nav-item-label"><AdminIcon name={item === 'Organization Profile' ? 'organizations' : item === 'Applications' ? 'applications' : item === 'Registration Builder' ? 'schema' : item === 'Login Configuration' ? 'auth' : item === 'Audit Logs' ? 'audit' : item === 'API Credentials' ? 'api' : item === 'Identity Management' || item === 'Users' ? 'identity' : item === 'Webhooks' ? 'trust' : 'dashboard'} />{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
