'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminIcon } from '../../../../components/ui'
import type { ApplicationRecord } from '../../../../types/catalogue'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

const filters = ['All', 'Pending', 'Approved', 'Rejected']

export default function OrganizationApplicationsPage() {
  const {
    addAudit, applications, currentOrg, orgLoginId, refreshCatalogueData, registerApplication,
    registerAppForm, registerAppModal, setAppCredentialModal, setApplications, setOrgApprovalModal,
    setRegisterAppForm, setRegisterAppModal,
  } = useCatalogue()
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [createdApp, setCreatedApp] = useState<ApplicationRecord | null>(null)
  const orgId = currentOrg?.id || orgLoginId

  useEffect(() => { refreshCatalogueData?.() }, [])

  const orgApps = useMemo(() => applications.filter((app) => app.orgId === orgId), [applications, orgId])
  const filteredApps = orgApps.filter((app) => {
    if (statusFilter !== 'All' && app.status !== statusFilter.toLowerCase()) return false
    const query = search.trim().toLowerCase()
    return !query || [app.name, app.id, app.type, app.description].some((value) => (value || '').toLowerCase().includes(query))
  })
  const counts = {
    all: orgApps.length,
    pending: orgApps.filter((app) => app.status === 'pending').length,
    approved: orgApps.filter((app) => app.status === 'approved').length,
    rejected: orgApps.filter((app) => app.status === 'rejected').length,
  }

  return (
    <div className="org-dashboard-shell">
      <OrgSidebar activeItem="Applications" />
      <main className="org-main org-applications-main">
        <OrgTopbar heading={`Applications - ${currentOrg?.name || orgId}`} subtitle="Manage applications registered by your organization." action={<button type="button" className="primary-button icon-text-button" onClick={() => setRegisterAppModal(true)}><AdminIcon name="applications" />Register Application</button>} />
        <section className="org-app-content">
          <div className="org-app-toolbar">
            <div>
              <span className="eyebrow">Application registry</span>
              <h2>Your Applications</h2>
              <p>Applications are activated immediately for this self-hosted Identity OS workspace.</p>
            </div>
            <div className="org-app-kpis">
              <span><strong>{counts.all}</strong>Total</span>
              <span><strong>{counts.pending}</strong>Pending</span>
              <span><strong>{counts.approved}</strong>Approved</span>
              <span><strong>{counts.rejected}</strong>Rejected</span>
            </div>
          </div>

          <div className="org-app-filter-row">
            <div className="tab-row">
              {filters.map((filter) => <button key={filter} type="button" className={`tab ${statusFilter === filter ? 'active' : ''}`} onClick={() => setStatusFilter(filter)}>{filter}</button>)}
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search applications" />
          </div>

          {filteredApps.length === 0 ? (
            <div className="empty-state">No applications found for this filter.</div>
          ) : (
            <div className="org-app-grid">
              {filteredApps.map((app) => (
                <article key={app.id} className="org-app-card">
                  <div className="org-app-left">
                    <div className="app-icon">{(app.type || 'app').charAt(0).toUpperCase()}</div>
                    <div className="app-info">
                      <div className="approval-name">{app.name}</div>
                      <div className="approval-meta">{app.type} - {app.id}</div>
                      {app.description && <div className="app-desc"><small>{app.description}</small></div>}
                      <div className="app-meta-row"><span className={`app-status-badge status-${app.status}`}>{app.status}</span><span className="created-at">{app.createdAt}</span></div>
                    </div>
                  </div>
                  <div className="org-app-actions">
                    <button className="ghost-button icon-text-button" onClick={() => setOrgApprovalModal({ type: 'app', item: { ...app, reviewMode: 'view' } })}><AdminIcon name="view" />View</button>
                    {app.status === 'pending' && <button className="secondary-button danger-button" onClick={() => { setApplications((prev) => prev.filter((item) => item.id !== app.id)); addAudit('Withdraw Application', `Withdrew ${app.name}`) }}>Withdraw</button>}
                    {app.status === 'approved' && <><button className="secondary-button" onClick={() => { navigator.clipboard?.writeText(app.clientId || app.id); alert('Client ID copied to clipboard') }}>Copy Client ID</button><button className="secondary-button" onClick={() => setAppCredentialModal({ app, clientId: app.clientId || app.id, clientSecret: app.clientSecret })}>View Credentials</button></>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      {registerAppModal && <div className="modal-backdrop" onClick={() => setRegisterAppModal(false)}><div className="modal-card register-modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Register Application</h3><button className="close-button" onClick={() => setRegisterAppModal(false)}>x</button></div><div className="form-card"><div className="register-form-grid"><label className="full">Application Name<input value={registerAppForm.name} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Identity Suite" /></label><label>Type<select value={registerAppForm.type} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, type: e.target.value }))}><option value="web">Web</option><option value="mobile">Mobile</option><option value="spa">Single Page App</option><option value="backend">Backend</option></select></label><label>Contact Email<input value={registerAppForm.contactEmail} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="owner@company.com" /></label><label>Domain<input value={registerAppForm.domain} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, domain: e.target.value }))} placeholder="app.company.com" /></label><label className="full">Description<textarea value={registerAppForm.description} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Describe what this application does" /></label><label>Redirect URI*<input value={registerAppForm.redirectUri} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, redirectUri: e.target.value }))} placeholder="https://app.company.com/callback" /></label><label>Logout URI<input value={registerAppForm.logoutUri} onChange={(e) => setRegisterAppForm((prev) => ({ ...prev, logoutUri: e.target.value }))} placeholder="https://app.company.com/logout" /></label></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}><button className="secondary-button" onClick={() => setRegisterAppModal(false)}>Cancel</button><button className="primary-button" onClick={async () => { try { const app = await registerApplication(); setStatusFilter('Approved'); setCreatedApp(app) } catch (error) { alert(error instanceof Error ? error.message : 'Application registration failed') } }}>Register</button></div></div></div></div>}
      {createdApp && <div className="modal-backdrop" onClick={() => setCreatedApp(null)}><div className="modal-card register-modal application-created-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div className="modal-title-row"><span className="modal-title-icon"><AdminIcon name="check" /></span><h3>Application Registered</h3></div><button className="close-button" onClick={() => setCreatedApp(null)}>x</button></div><div className="application-created-body"><p>Your application is active. Use this generated application number as the client id in the hosted Identity OS URL.</p><div className="generated-id-panel"><span>Application Number</span><strong>{createdApp.id}</strong></div><div className="created-app-meta"><span>{createdApp.name}</span><span className={`app-status-badge status-${createdApp.status}`}>{createdApp.status}</span></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(createdApp.id)}>Copy Application No</button><button className="primary-button" onClick={() => setCreatedApp(null)}>Done</button></div></div></div>}
    </div>
  )
}
