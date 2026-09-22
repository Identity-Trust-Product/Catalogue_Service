'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import keycloak from '../../../../lib/keycloak'
import { AdminIcon } from '../../../../components/ui'
import { readStorage } from '../../../../utils/storage'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

const countByStatus = (items: Array<{ status: string }>) => ({
  pending: items.filter((item) => item.status === 'pending').length,
  approved: items.filter((item) => item.status === 'approved').length,
  rejected: items.filter((item) => item.status === 'rejected').length,
  draft: items.filter((item) => item.status === 'draft').length,
})

const percent = (value: number, total: number) => total ? Math.max(8, Math.round((value / total) * 100)) : 8

const decodeJwtPayload = (token?: string | null) => {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
    return JSON.parse(window.atob(padded))
  } catch {
    return null
  }
}

const hasRealmRole = (tokenPayload: any, role: string) => {
  const roles = tokenPayload?.realm_access?.roles
  return Array.isArray(roles) && roles.includes(role)
}

export default function OrganizationDashboardPage() {
  const { applications, auditLogs, refreshCatalogueData, schemas, setView } = useCatalogue()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const hasAdminRole = keycloak.hasRealmRole('ORGANISATION_ADMIN') || keycloak.hasRealmRole('APPLICATION_SUPER_ADMIN')
    const hostedAdminPayload = decodeJwtPayload(readStorage('identity_os_hosted_admin_token'))
    const hasHostedAdminRole = hasRealmRole(hostedAdminPayload, 'APPLICATION_SUPER_ADMIN')
    if ((!keycloak.authenticated || !hasAdminRole) && !hasHostedAdminRole) {
      router.replace('/organization')
      return
    }
    setAuthorized(true)
    refreshCatalogueData?.()
  }, [router])

  const hostedAdminClientId = readStorage('identity_os_hosted_admin_client_id')
  const hostedApp = useMemo(() => hostedAdminClientId ? applications.find((app) => app.id === hostedAdminClientId || app.clientId === hostedAdminClientId) : null, [applications, hostedAdminClientId])
  const scopedSchemas = useMemo(() => {
    if (!hostedApp) return schemas
    return schemas.filter((schema) => schema.appId === hostedApp.id || schema.appId === hostedApp.clientId)
  }, [hostedApp, schemas])
  const registrationSchemas = scopedSchemas.filter((schema) => schema.type === 'registration')
  const loginSchemas = scopedSchemas.filter((schema) => schema.type === 'login')
  const schemaCounts = countByStatus(scopedSchemas)
  const publishedRegistration = registrationSchemas.filter((schema) => schema.status === 'approved').length
  const publishedLogin = loginSchemas.filter((schema) => schema.status === 'approved').length
  const readyScore = (publishedRegistration > 0 ? 1 : 0) + (publishedLogin > 0 ? 1 : 0)
  const recentItems = [
    ...scopedSchemas.map((schema) => ({ id: schema.versionId || schema.id, label: schema.name, detail: `${schema.type === 'login' ? 'Login' : 'Registration'} configuration ${schema.status}`, time: schema.createdAt || schema.approvedAt || schema.rejectedAt || '', icon: schema.type === 'login' ? 'auth' : 'schema' })),
    ...auditLogs.slice(0, 4).map((log) => ({ id: log.id, label: log.action, detail: log.details, time: log.timestamp, icon: 'audit' })),
  ].slice(0, 6)

  if (!authorized) return <div>Checking authentication...</div>

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="Dashboard" />
      <main className="org-main org-console-main">
        <OrgTopbar heading="Identity OS Admin" />
        <section className="org-console-content">
          <div className="org-dashboard-hero">
            <div>
              <div className="eyebrow">Self-hosted identity setup</div>
              <h2>Identity OS Configuration</h2>
              <p>Customize the registration and login experience used by the SBI portal.</p>
            </div>
            <div className="org-dashboard-actions">
              <button type="button" className="secondary-button icon-text-button" onClick={() => setView('org-login-builder')}><AdminIcon name="auth" />Login Page</button>
              <button type="button" className="primary-button icon-text-button" onClick={() => setView('org-registration-builder')}><AdminIcon name="schema" />Registration Page</button>
            </div>
          </div>

          <section className="org-widget-grid">
            <article className="org-widget-card purple"><span><AdminIcon name="schema" /></span><strong>{registrationSchemas.length}</strong><label>Registration Pages</label><small>{publishedRegistration} published</small></article>
            <article className="org-widget-card orange"><span><AdminIcon name="auth" /></span><strong>{loginSchemas.length}</strong><label>Login Pages</label><small>{publishedLogin} published</small></article>
            <article className="org-widget-card green"><span><AdminIcon name="check" /></span><strong>{readyScore}/2</strong><label>Setup Readiness</label><small>registration and login</small></article>
            <article className="org-widget-card blue"><span><AdminIcon name="identity" /></span><strong>{schemaCounts.approved}</strong><label>Published Versions</label><small>{schemaCounts.draft} draft, {schemaCounts.rejected} rejected</small></article>
          </section>

          <section className="org-analytics-grid">
            <article className="org-chart-panel large">
              <div className="panel-heading"><h3>Configuration Status</h3><span>{scopedSchemas.length} total</span></div>
              <div className="status-bar-chart">
                {[
                  ['Published', schemaCounts.approved, 'approved'],
                  ['Draft', schemaCounts.draft, 'pending'],
                  ['Pending', schemaCounts.pending, 'pending'],
                  ['Rejected', schemaCounts.rejected, 'rejected'],
                ].map(([label, value, status]) => (
                  <div key={label} className="status-bar-row">
                    <span>{label}</span>
                    <div><i className={`bar-${status}`} style={{ width: `${percent(Number(value), scopedSchemas.length)}%` }} /></div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="org-chart-panel">
              <div className="panel-heading"><h3>Hosted Page Readiness</h3><span>{readyScore}/2 ready</span></div>
              <div className="auth-donut schema-donut" style={{ background: `conic-gradient(#047857 0 ${Math.round((readyScore / 2) * 100)}%, #e2e8f0 ${Math.round((readyScore / 2) * 100)}% 100%)` }}><strong>{readyScore}/2</strong></div>
              <ul className="legend-list"><li><span className="green-dot" /> Approved {schemaCounts.approved}</li><li><span className="orange-dot" /> Pending {schemaCounts.pending}</li><li><span className="red-dot" /> Rejected {schemaCounts.rejected}</li></ul>
            </article>
          </section>

          <section className="org-dashboard-lower">
            <article className="org-chart-panel">
              <div className="panel-heading"><h3>Quick Actions</h3><span>Manage hosted pages</span></div>
              <div className="org-dashboard-actions">
                <button type="button" className="secondary-button icon-text-button" onClick={() => setView('org-registration-builder')}><AdminIcon name="schema" />Edit Registration</button>
                <button type="button" className="secondary-button icon-text-button" onClick={() => setView('org-login-builder')}><AdminIcon name="auth" />Edit Login</button>
              </div>
            </article>
            <article className="org-chart-panel">
              <div className="panel-heading"><h3>Recent Activity</h3><span>Live data</span></div>
              <ul className="org-activity-feed">{recentItems.length ? recentItems.map((item) => <li key={item.id}><span><AdminIcon name={item.icon} /></span><div><strong>{item.label}</strong><small>{item.detail}{item.time ? ` - ${item.time}` : ''}</small></div></li>) : <li><span><AdminIcon name="pending" /></span><div><strong>No activity yet</strong><small>Register an application or submit a schema to start.</small></div></li>}</ul>
            </article>
          </section>
        </section>
      </main>
    </div>
  )
}
