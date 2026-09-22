'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AdminIcon } from '../../../../components/ui'
import type { SchemaRecord } from '../../../../types/catalogue'
import { readStorage } from '../../../../utils/storage'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

const authOptions = [
  { key: 'PASSWORD', label: 'Username + Password', description: 'Organization id or username with password.' },
  { key: 'EMAIL_PASSWORD', label: 'Email + Password', description: 'Email-first login for consumer apps.' },
  { key: 'MOBILE_OTP', label: 'Mobile OTP', description: 'Passwordless verification using phone OTP.' },
  { key: 'EMAIL_OTP', label: 'Email OTP', description: 'Passwordless verification using email OTP.' },
  { key: 'BIOMETRIC', label: 'Biometric', description: 'Device biometric prompt where supported.' },
  { key: 'SOCIAL', label: 'Social Login', description: 'External identity provider login.' },
  { key: 'HARDWARE', label: 'Hardware Token', description: 'Strong authentication for protected users.' },
]

const schemaEndpointHint = 'Schema API is not available on the running backend. Restart onboarding-and-identity-service with the latest code, then submit again.'

const buildLoginFields = (methods: string[]) => {
  if (methods.includes('EMAIL_PASSWORD')) {
    return [
      { name: 'email', type: 'email', label: 'Email', required: true },
      { name: 'password', type: 'password', label: 'Password', required: true },
    ]
  }
  if (methods.includes('EMAIL_OTP')) {
    return [
      { name: 'email', type: 'email', label: 'Email', required: true },
      { name: 'otp', type: 'text', label: 'One Time Password', required: true },
    ]
  }
  if (methods.includes('MOBILE_OTP')) {
    return [
      { name: 'mobile', type: 'phone', label: 'Mobile Number', required: true },
      { name: 'otp', type: 'text', label: 'One Time Password', required: true },
    ]
  }
  return [
    { name: 'username', type: 'text', label: 'Username', required: true },
    { name: 'password', type: 'password', label: 'Password', required: true },
  ]
}

const normalizeLoginPayload = (schema: SchemaRecord) => {
  const schemaJson = schema.schemaJson as any
  return schema.payload || schemaJson || {}
}

const getLoginPreviewFields = (payload: any) => {
  if (Array.isArray(payload.loginFields) && payload.loginFields.length) return payload.loginFields
  return buildLoginFields(Array.isArray(payload.authenticationMethods) ? payload.authenticationMethods : ['PASSWORD'])
}

const renderLoginPreviewControl = (field: any) => {
  const label = field.label || field.name || 'Field'
  const inputType = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'password' ? 'password' : 'text'
  return <input type={inputType} placeholder={label} disabled />
}

export default function LoginBuilderPage() {
  const { applications, currentOrg, loadIdentitySchemaVersions, orgLoginId, refreshCatalogueData, setView, submitIdentitySchemaVersion } = useCatalogue()
  const orgId = currentOrg?.id || orgLoginId
  const orgApps = useMemo(() => applications.filter((app) => app.orgId === orgId && app.status === 'approved'), [applications, orgId])
  const [selectedAppId, setSelectedAppId] = useState(() => orgApps[0]?.id || '')
  const [selectedMethods, setSelectedMethods] = useState<string[]>(() => { try { const raw = readStorage('catalogue_login_builder_methods'); return raw ? JSON.parse(raw) : ['PASSWORD'] } catch { return ['PASSWORD'] } })
  const [flowSteps, setFlowSteps] = useState<string[]>(() => { try { const raw = readStorage('catalogue_login_builder_flow'); return raw ? JSON.parse(raw) : ['Identifier', 'Identity Lookup', 'Authentication Verification', 'MFA Check', 'Token Redirect'] } catch { return ['Identifier', 'Identity Lookup', 'Authentication Verification', 'MFA Check', 'Token Redirect'] } })
  const [mfaEnabled, setMfaEnabled] = useState(() => { try { const raw = readStorage('catalogue_login_builder_mfa'); return raw ? JSON.parse(raw) : true } catch { return true } })
  const [mfaMethods, setMfaMethods] = useState<string[]>(() => { try { const raw = readStorage('catalogue_login_builder_mfa_methods'); return raw ? JSON.parse(raw) : ['OTP'] } catch { return ['OTP'] } })
  const [riskAuth, setRiskAuth] = useState(() => { try { const raw = readStorage('catalogue_login_builder_risk'); return raw ? JSON.parse(raw) : false } catch { return false } })
  const [policyName, setPolicyName] = useState(() => readStorage('catalogue_login_builder_policy_name') || `Login Policy ${new Date().toLocaleDateString()}`)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [newStep, setNewStep] = useState('')
  const [schemaHistory, setSchemaHistory] = useState<SchemaRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [previewPolicy, setPreviewPolicy] = useState<{ title: string; appName?: string; payload: any; version?: string; status?: string; createdAt?: string } | null>(null)

  useEffect(() => { refreshCatalogueData?.() }, [])
  useEffect(() => { if (!selectedAppId && orgApps[0]?.id) setSelectedAppId(orgApps[0].id) }, [orgApps, selectedAppId])

  const loginSchemas = schemaHistory.filter((schema) => !selectedAppId || schema.appId === selectedAppId)
  const selectedApp = orgApps.find((app) => app.id === selectedAppId)
  const loginFields = useMemo(() => buildLoginFields(selectedMethods), [selectedMethods])
  const policyJson = {
    loginFields,
    authenticationMethods: selectedMethods,
    mfa: mfaEnabled,
    mfaMethods: mfaEnabled ? mfaMethods : [],
    riskAuthentication: riskAuth,
    flow: flowSteps,
    redirect: {
      clientId: selectedApp?.clientId || selectedApp?.id || selectedAppId,
      redirectUri: selectedApp?.redirectUri || '',
      tokenDelivery: 'access-token',
    },
  }

  const loadLoginHistory = useCallback(async () => {
    if (!orgId) return
    setHistoryLoading(true)
    try {
      const versions = await loadIdentitySchemaVersions(orgId, 'LOGIN')
      setSchemaHistory(versions)
    } catch {
      setSchemaHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [loadIdentitySchemaVersions, orgId])

  useEffect(() => { loadLoginHistory() }, [loadLoginHistory])

  const openCurrentPreview = () => setPreviewPolicy({
    title: policyName || 'Login Configuration',
    appName: selectedApp?.name || selectedAppId,
    payload: policyJson,
    version: 'Draft preview',
    status: 'draft',
  })

  const openHistoryPreview = (schema: SchemaRecord) => setPreviewPolicy({
    title: schema.name,
    appName: schema.appName || schema.appId || undefined,
    payload: normalizeLoginPayload(schema),
    version: `Version ${schema.versionNumber || 1}`,
    status: schema.status,
    createdAt: schema.createdAt,
  })

  const persistMethods = (next: string[]) => { setSelectedMethods(next); localStorage.setItem('catalogue_login_builder_methods', JSON.stringify(next)) }
  const persistFlow = (next: string[]) => { setFlowSteps(next); localStorage.setItem('catalogue_login_builder_flow', JSON.stringify(next)) }
  const toggleMethod = (key: string) => persistMethods(selectedMethods.includes(key) ? selectedMethods.filter((item) => item !== key) : [...selectedMethods, key])
  const toggleMfaMethod = (method: string) => { const next = mfaMethods.includes(method) ? mfaMethods.filter((item) => item !== method) : [...mfaMethods, method]; setMfaMethods(next); localStorage.setItem('catalogue_login_builder_mfa_methods', JSON.stringify(next)) }
  const moveStep = (idx: number, dir: number) => { const copy = [...flowSteps]; const [step] = copy.splice(idx, 1); copy.splice(idx + dir, 0, step); persistFlow(copy) }
  const addStep = () => {
    const value = newStep.trim()
    if (!value) return
    persistFlow([...flowSteps, value])
    setNewStep('')
  }
  const submitLoginSchema = async (submitForApproval: boolean) => {
    if (!selectedAppId) { setMessage('Select an approved application first.'); return }
    setSaving(true)
    setMessage('')
    try {
      await submitIdentitySchemaVersion({
        applicationId: selectedAppId,
        schemaType: 'LOGIN',
        schemaName: policyName,
        schemaJson: policyJson,
        configurationJson: { renderer: 'hosted-identity-os-login', versionedBy: 'organization-admin' },
        changeSummary: submitForApproval ? 'Published login page configuration' : 'Saved login page draft',
        submitForApproval,
      })
      await refreshCatalogueData?.()
      await loadLoginHistory()
      localStorage.setItem('catalogue_login_builder_policy_name', policyName)
      setMessage(submitForApproval ? 'Login configuration published and ready for hosted login.' : 'Login configuration draft saved.')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save login configuration.'
      setMessage(errorMessage.includes('/schemas') || errorMessage.includes('404') ? schemaEndpointHint : errorMessage)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="Login Configuration" />
      <main className="org-main org-console-main">
        <OrgTopbar heading="Login Page Schema" action={<button type="button" className="secondary-button" onClick={() => setView('organization-dashboard')}>Back to Dashboard</button>} />
        <section className="org-console-content builder-console-content">
          <div className="schema-builder-header">
            <div>
              <span className="eyebrow">Hosted login configuration</span>
              <h2>Login Configuration Builder</h2>
              <p>Define how Identity OS authenticates users before redirecting back to the third-party application with an access token.</p>
              <span className="status-pill-ui status-approved builder-approval-pill"><AdminIcon name="check" />Self-hosted publishing</span>
            </div>
            <div className="schema-builder-actions">
              <button className="secondary-button icon-text-button" disabled={saving} onClick={() => submitLoginSchema(false)}><AdminIcon name="schema" />Save Draft</button>
              <button className="primary-button icon-text-button" disabled={saving} onClick={() => submitLoginSchema(true)}><AdminIcon name="check" />Publish</button>
              <button className="secondary-button icon-text-button" onClick={openCurrentPreview}><AdminIcon name="view" />Login Form Preview</button>
            </div>
          </div>

          {!orgApps.length && <div className="builder-message warning">No active application is available. Register an application first, then create its login configuration.</div>}
          <div className="schema-config-strip login-config-strip">
            <label>Application<select value={selectedAppId} onChange={(event) => setSelectedAppId(event.target.value)}><option value="">Select application</option>{orgApps.map((app) => <option key={app.id} value={app.id}>{app.name} - {app.id}</option>)}</select></label>
            <label>Policy Name<input value={policyName} onChange={(event) => { setPolicyName(event.target.value); localStorage.setItem('catalogue_login_builder_policy_name', event.target.value) }} /></label>
            <div className="hosted-flow-note"><strong>Hosted URL input</strong><span>Client ID: {selectedApp?.clientId || selectedApp?.id || '-'}</span><span>Redirect URI: {selectedApp?.redirectUri || '-'}</span></div>
          </div>
          {message && <div className="builder-message">{message}</div>}

          <div className="login-builder-layout">
            <div className="builder-palette form-card login-method-card">
              <h4>Authentication Methods</h4>
              {authOptions.map((option) => (
                <label key={option.key} className={`login-method-option ${selectedMethods.includes(option.key) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedMethods.includes(option.key)} onChange={() => toggleMethod(option.key)} />
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </label>
              ))}
            </div>

            {/* <div className="builder-preview form-card">
              <h4>Login Flow</h4>
              <div className="flow-step-list">
                {flowSteps.map((step, idx) => (
                  <div key={`${step}_${idx}`} className="field-row flow-step-row">
                    <span className="flow-step-number">{idx + 1}</span>
                    <div className="control-wrap"><strong>{step}</strong><span className="field-type-chip">STEP</span></div>
                    <div className="field-action-row">
                      <button className="ghost-button" disabled={idx === 0} onClick={() => moveStep(idx, -1)}>Up</button>
                      <button className="ghost-button" disabled={idx === flowSteps.length - 1} onClick={() => moveStep(idx, 1)}>Down</button>
                      <button className="ghost-button danger-button" onClick={() => persistFlow(flowSteps.filter((_, index) => index !== idx))}>Remove</button>
                    </div>
                  </div>
                ))}
                <div className="add-step-row"><input placeholder="Add custom step" value={newStep} onChange={(event) => setNewStep(event.target.value)} /><button className="ghost-button" onClick={addStep}>Add Step</button></div>
              </div>
            </div> */}

            <div className="builder-config form-card">
              <h4>Security Controls</h4>
              <label className="builder-check-row"><input type="checkbox" checked={mfaEnabled} onChange={(event) => { setMfaEnabled(event.target.checked); localStorage.setItem('catalogue_login_builder_mfa', JSON.stringify(event.target.checked)) }} /> Enable MFA</label>
              {mfaEnabled && <div className="mfa-chip-grid">{['OTP', 'AUTH_APP', 'BIOMETRIC'].map((method) => <button type="button" key={method} className={`mfa-chip ${mfaMethods.includes(method) ? 'active' : ''}`} onClick={() => toggleMfaMethod(method)}>{method}</button>)}</div>}
              <label className="builder-check-row"><input type="checkbox" checked={riskAuth} onChange={(event) => { setRiskAuth(event.target.checked); localStorage.setItem('catalogue_login_builder_risk', JSON.stringify(event.target.checked)) }} /> Risk-based Authentication</label>
              <div className="login-field-preview">
                <h5>Rendered Login Fields</h5>
                {loginFields.map((field) => (
                  <span key={field.name} className="field-type-chip">{field.label}</span>
                ))}
              </div>
              <div className="json-preview"><h5>Generated JSON</h5><pre>{JSON.stringify(policyJson, null, 2)}</pre></div>
            </div>
          </div>

          <section className="schema-history-panel">
            <div className="panel-heading"><h3>Login Configurations</h3><span>{historyLoading ? 'Loading versions...' : `${loginSchemas.length} versions`}</span></div>
            <div className="schema-status-list">
              {loginSchemas.length ? loginSchemas.map((schema: any) => (
                <article key={schema.versionId || schema.id} className="schema-status-card">
                  <div><div className="approval-name-row"><strong>{schema.name}</strong><span className={`status-pill-ui status-${schema.status}`}><AdminIcon name={schema.status === 'approved' ? 'check' : schema.status === 'rejected' ? 'rejected' : 'pending'} />{schema.status}</span></div><p>{schema.appName || schema.appId || 'Application'} - Version {schema.versionNumber || 1}{schema.changeSummary ? ` - ${schema.changeSummary}` : ''}</p></div>
                  <div className="schema-card-actions"><button type="button" className="ghost-button icon-text-button" onClick={() => openHistoryPreview(schema)}><AdminIcon name="view" />Preview Login</button><small>{schema.createdAt}</small></div>
                </article>
              )) : <div className="empty-state">No login configurations found for this application.</div>}
            </div>
          </section>
        </section>
        {previewPolicy && typeof document !== 'undefined' && createPortal(
          <div className="modal-backdrop" onClick={() => setPreviewPolicy(null)}>
            <div className="modal-card polished-modal wide registration-form-preview-modal login-form-preview-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row"><span className="modal-title-icon"><AdminIcon name="auth" /></span><h3>{previewPolicy.title}</h3></div>
                <button type="button" className="close-button" onClick={() => setPreviewPolicy(null)}>x</button>
              </div>
              <div className="registration-preview-meta">
                {previewPolicy.appName && <span>{previewPolicy.appName}</span>}
                {previewPolicy.version && <span>{previewPolicy.version}</span>}
                {previewPolicy.status && <span className={`status-pill-ui status-${previewPolicy.status}`}>{previewPolicy.status}</span>}
                {previewPolicy.createdAt && <span>{previewPolicy.createdAt}</span>}
              </div>
              <div className="login-form-preview-shell">
                <form className="registration-form-preview login-form-preview">
                  <div className="login-preview-heading">
                    <span className="modal-title-icon"><AdminIcon name="shield" /></span>
                    <div><h4>Sign in</h4><p>{previewPolicy.appName || 'Application'}</p></div>
                  </div>
                  {getLoginPreviewFields(previewPolicy.payload).map((field: any) => (
                    <div key={field.name} className="registration-preview-field full">
                      <label>{field.label || field.name}{field.required ? ' *' : ''}</label>
                      {renderLoginPreviewControl(field)}
                    </div>
                  ))}
                  {previewPolicy.payload.mfa && <div className="login-preview-note">MFA: {(previewPolicy.payload.mfaMethods || []).join(', ') || 'Enabled'}</div>}
                  {previewPolicy.payload.riskAuthentication && <div className="login-preview-note">Risk-based authentication enabled</div>}
                  <button type="button" className="primary-button" disabled>Continue</button>
                </form>
                <div className="login-preview-flow">
                  <h4>Flow Steps</h4>
                  {(previewPolicy.payload.flow || []).map((step: string, index: number) => <span key={`${step}-${index}`}><b>{index + 1}</b>{step}</span>)}
                </div>
              </div>
              <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setPreviewPolicy(null)}>Close</button></div>
            </div>
          </div>,
          document.body
        )}
      </main>
    </div>
  )
}
