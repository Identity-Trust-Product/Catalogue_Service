'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { AdminIcon } from '../../../components/ui'
import { logoutFromKeycloak } from '../../../lib/keycloak'
import { useCatalogue } from '../context/CatalogueContext'

interface OrgTopbarProps {
  heading: string
  subtitle?: string
  action?: ReactNode
}

export default function OrgTopbar({ heading, subtitle, action }: OrgTopbarProps) {
  const { currentOrg } = useCatalogue()
  const [profileOpen, setProfileOpen] = useState(false)
  const displayName = currentOrg?.name || 'Identity OS'
  const initials = displayName.split(/[ _-]/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  const handleLogout = async () => {
    await logoutFromKeycloak()
  }

  return (
    <header className="org-console-topbar">
      <div className="org-console-title">
        <div className="eyebrow">Organization Admin</div>
        {/* <h1>{heading}</h1> */}
        {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
      </div>
      <div className="org-console-actions">
        {action}
        <button type="button" className="icon-button" title="Notifications"><AdminIcon name="notifications" /><span className="notification-dot" /></button>
        <div className="profile-menu">
          <button type="button" className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}><span>{initials}</span><strong>Admin</strong></button>
          {profileOpen && <div className="profile-dropdown"><button type="button" onClick={handleLogout}>Log Out</button></div>}
        </div>
      </div>
    </header>
  )
}
