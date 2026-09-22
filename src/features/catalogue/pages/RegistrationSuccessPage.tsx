'use client'

import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { useCatalogue } from '../context/CatalogueContext'

export default function RegistrationSuccessPage() {
  const { setView, successData } = useCatalogue()
  const [copied, setCopied] = useState(false)
  const orgId = successData?.orgId || ''

  const copyOrgId = async () => {
    if (!orgId) return
    await navigator.clipboard?.writeText(orgId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="panel-page success-page">
      <PageHeader title="Identity OS - Organization Registered" onBack={() => setView('home')} />
      <div className="success-box">
        <div className="success-status">Registered successfully</div>
        <h2>Your organization workspace is ready</h2>
        <div className="org-id-box">
          <span>Organization ID</span>
          <div className="org-id-copy-row"><strong>{orgId || '-'}</strong><button type="button" className="secondary-button" onClick={copyOrgId} disabled={!orgId}>{copied ? 'Copied' : 'Copy'}</button></div>
          <small>Use this ID as the organization admin username. The one-time password has been sent to the official email and is the same as this organization ID.</small>
        </div>
        <div className="meta-row"><div><label>Created</label><p>{successData?.createdAt || '-'}</p></div><div><label>Status</label><p>{successData?.status || '-'}</p></div>{successData?.officialEmail && <div><label>Official Email</label><p>{successData.officialEmail}</p></div>}</div>
      </div>
      <div className="success-actions"><button type="button" className="secondary-button" onClick={() => setView('home')}>Back to Home</button><button type="button" className="primary-button" onClick={() => setView('organization')}>Organization Admin Login</button></div>
    </section>
  )
}
