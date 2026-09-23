'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AdminIcon } from '../../../../components/ui'
import type { RegistrationField, SchemaRecord } from '../../../../types/catalogue'
import { readStorage } from '../../../../utils/storage'
import OrgSidebar from '../../components/OrgSidebar'
import OrgTopbar from '../../components/OrgTopbar'
import { useCatalogue } from '../../context/CatalogueContext'

const fieldTypes = ['text', 'email', 'phone', 'password', 'date', 'dropdown', 'checkbox', 'address', 'file', 'gov-id', 'custom']
const schemaEndpointHint = 'Schema API is not available on the running backend. Restart onboarding-and-identity-service with the latest code, then submit again.'
const sensitiveFieldNames = new Set(['aadhaar', 'aadhar', 'pan', 'passport', 'voter_id', 'driving_license', 'biometric', 'date_of_birth', 'dob', 'address'])

const parseDropdownOptions = (value: string) => value
  .split(/\r?\n|,/)
  .map((option) => option.trim())
  .filter(Boolean)

const getSchemaFields = (schema: SchemaRecord) => {
  const schemaJson = schema.schemaJson as { registrationFields?: RegistrationField[]; fields?: RegistrationField[] } | undefined
  return schema.fields || schemaJson?.registrationFields || schemaJson?.fields || []
}

const normalizePreviewFields = (fields: Array<string | RegistrationField>): RegistrationField[] =>
  fields.map((field) => typeof field === 'string'
    ? { name: field, label: field, type: 'text', required: false }
    : field)

const normalizeFieldName = (value?: string) => (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const requiresOtpVerification = (field?: RegistrationField) => {
  if (!field) return false
  const fieldName = normalizeFieldName(field.name)
  const labelName = normalizeFieldName(field.label)
  return field.type === 'email'
    || field.type === 'phone'
    || ['email', 'phone', 'phone_number', 'mobile', 'mobile_number', 'aadhaar', 'aadhar'].includes(fieldName)
    || ['email', 'phone', 'phone_number', 'mobile', 'mobile_number', 'aadhaar', 'aadhar'].includes(labelName)
}

const isSensitiveField = (field?: RegistrationField) => {
  if (!field) return false
  const fieldName = normalizeFieldName(field.name)
  return Boolean(field.dpdp?.sensitive || sensitiveFieldNames.has(fieldName) || field.type === 'gov-id' || field.type === 'address')
}

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const sanitizeFieldForSchema = (field: RegistrationField): RegistrationField => {
  const cleanField: RegistrationField = {
    ...field,
    name: normalizeFieldName(field.name) || field.name,
  }
  if (requiresOtpVerification(cleanField)) {
    cleanField.verification = 'OTP'
  }
  if (!isSensitiveField(cleanField) && !cleanField.dpdp?.sensitive) {
    delete cleanField.dpdp
    return cleanField
  }
  cleanField.dpdp = {
    sensitive: true,
    purpose: cleanField.dpdp?.purpose?.trim() || '',
    retentionDays: toNumberOrNull(cleanField.dpdp?.retentionDays),
    consentRequired: true,
    justification: cleanField.dpdp?.justification?.trim() || '',
  }
  return cleanField
}

const getSensitiveFieldSummary = (fields: RegistrationField[]) =>
  fields.filter(isSensitiveField).map((field) => ({
    name: normalizeFieldName(field.name),
    label: field.label || field.name,
    purpose: field.dpdp?.purpose || '',
    retentionDays: toNumberOrNull(field.dpdp?.retentionDays),
    consentRequired: Boolean(field.dpdp?.consentRequired),
    justification: field.dpdp?.justification || '',
  }))

const renderPreviewControl = (field: RegistrationField) => {
  const label = field.label || field.name
  if (field.type === 'dropdown') {
    return <select disabled><option value="">Select {label}</option>{(field.options || []).map((option, index) => <option key={`${field.name}-${index}`}>{option}</option>)}</select>
  }
  if (field.type === 'checkbox') {
    return <label className="registration-preview-checkbox"><input type="checkbox" disabled /> {label}</label>
  }
  if (field.type === 'address') {
    return <textarea placeholder={label} rows={3} disabled />
  }
  if (field.type === 'file') {
    return <input type="file" disabled />
  }
  const inputType = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : field.type === 'password' ? 'password' : 'text'
  return <div className={requiresOtpVerification(field) ? 'preview-verify-control' : ''}><input type={inputType} placeholder={label} disabled />{requiresOtpVerification(field) && <button type="button" disabled>Verify</button>}</div>
}

export default function RegistrationBuilderPage() {
  const { applications, currentOrg, loadIdentitySchemaVersions, orgLoginId, refreshCatalogueData, setView, submitIdentitySchemaVersion } = useCatalogue()
  const orgId = currentOrg?.id || orgLoginId
  const orgApps = useMemo(() => applications.filter((app) => app.orgId === orgId && app.status === 'approved'), [applications, orgId])
  const [fields, setFields] = useState<RegistrationField[]>(() => {
    try { return JSON.parse(readStorage('registration_builder') || 'null') || [{ name: 'fullName', label: 'Full Name', type: 'text', required: true }] } catch { return [{ name: 'fullName', label: 'Full Name', type: 'text', required: true }] }
  })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [schemaName, setSchemaName] = useState(() => readStorage('registration_builder_schema_name') || 'Customer Registration')
  const [selectedAppId, setSelectedAppId] = useState(() => orgApps[0]?.id || '')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [schemaHistory, setSchemaHistory] = useState<SchemaRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [previewSchema, setPreviewSchema] = useState<{ title: string; appName?: string; fields: RegistrationField[]; version?: string; status?: string; createdAt?: string } | null>(null)
  useEffect(() => { refreshCatalogueData?.() }, [])
  useEffect(() => { if (!selectedAppId && orgApps[0]?.id) setSelectedAppId(orgApps[0].id) }, [orgApps, selectedAppId])

  const loadRegistrationHistory = useCallback(async () => {
    if (!orgId) return
    setHistoryLoading(true)
    try {
      const versions = await loadIdentitySchemaVersions(orgId, 'REGISTRATION')
      setSchemaHistory(versions)
    } catch {
      setSchemaHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [loadIdentitySchemaVersions, orgId])

  useEffect(() => { loadRegistrationHistory() }, [loadRegistrationHistory])

  const persist = (next: RegistrationField[]) => { setFields(next); localStorage.setItem('registration_builder', JSON.stringify(next)) }
  const addField = (type: string) => persist([...fields, { name: `${type}_${Date.now().toString().slice(-4)}`, label: type.charAt(0).toUpperCase() + type.slice(1), type, required: false, options: type === 'dropdown' ? ['Option 1', 'Option 2'] : undefined }])
  const updateField = (idx: number, patch: Partial<RegistrationField>) => persist(fields.map((field, index) => index === idx ? { ...field, ...patch } : field))
  const removeField = (idx: number) => { const next = fields.filter((_, index) => index !== idx); persist(next); setSelectedIndex(Math.max(0, Math.min(selectedIndex, next.length - 1))) }
  const moveUp = (idx: number) => { if (idx === 0) return; const copy = [...fields]; [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]]; persist(copy); setSelectedIndex(idx - 1) }
  const updateFieldDpdp = (idx: number, patch: Partial<NonNullable<RegistrationField['dpdp']>>) => updateField(idx, { dpdp: { ...(fields[idx]?.dpdp || {}), ...patch } })
  const schemaFields = fields.map(sanitizeFieldForSchema)
  const sensitiveFieldSummary = getSensitiveFieldSummary(schemaFields)
  const schemaJson = {
    registrationFields: schemaFields,
    dpdp: {
      model: 'field-level',
      consentRequired: sensitiveFieldSummary.length > 0,
      consentProvider: 'cmp',
      consentTrigger: 'before-registration-submit',
      sensitiveFields: sensitiveFieldSummary,
    },
  }
  const configurationJson = {
    layout: 'single-page',
    versionedBy: 'organization-admin',
    dpdp: {
      model: 'field-level',
      sensitiveFields: sensitiveFieldSummary,
    },
  }
  const submitSchema = async (submitForApproval: boolean) => {
    if (!selectedAppId) { setMessage('Select an approved application first.'); return }
    setSaving(true)
    setMessage('')
    try {
      await submitIdentitySchemaVersion({
        applicationId: selectedAppId,
        schemaType: 'REGISTRATION',
        schemaName,
        schemaJson,
        configurationJson,
        changeSummary: submitForApproval ? 'Published registration page schema' : 'Saved registration page draft',
        submitForApproval,
      })
      await refreshCatalogueData?.()
      await loadRegistrationHistory()
      localStorage.setItem('registration_builder_schema_name', schemaName)
      setMessage(submitForApproval ? 'Registration schema published and ready for hosted registration.' : 'Registration schema draft saved.')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save schema.'
      setMessage(errorMessage.includes('/schemas') || errorMessage.includes('404') ? schemaEndpointHint : errorMessage)
    } finally {
      setSaving(false)
    }
  }
  const registrationSchemas = schemaHistory.filter((schema) => !selectedAppId || schema.appId === selectedAppId)
  const selectedAppName = orgApps.find((app) => app.id === selectedAppId)?.name || selectedAppId
  const openCurrentPreview = () => setPreviewSchema({
    title: schemaName || 'Registration Form',
    appName: selectedAppName,
    fields: schemaFields,
    version: 'Draft preview',
    status: 'draft',
  })
  const openHistoryPreview = (schema: SchemaRecord) => setPreviewSchema({
    title: schema.name,
    appName: schema.appName || schema.appId || undefined,
    fields: normalizePreviewFields(getSchemaFields(schema)),
    version: `Version ${schema.versionNumber || 1}`,
    status: schema.status,
    createdAt: schema.createdAt,
  })

  return (
    <div className="org-dashboard-shell org-console-shell">
      <OrgSidebar activeItem="Registration Builder" />
      <main className="org-main org-console-main">
        <OrgTopbar heading="Registration Page Schema" action={<button type="button" className="secondary-button" onClick={() => setView('organization-dashboard')}>Back to Dashboard</button>} />
        <section className="org-console-content builder-console-content">
          <div className="schema-builder-header">
            <div><span className="eyebrow">Application schema</span><h2>Registration Page Builder</h2><p>Design the registration fields used by one active application.</p><span className="status-pill-ui status-approved builder-approval-pill"><AdminIcon name="check" />Self-hosted publishing</span></div>
            <div className="schema-builder-actions"><button className="secondary-button icon-text-button" disabled={saving} onClick={() => submitSchema(false)}><AdminIcon name="schema" />Save Draft</button><button className="primary-button icon-text-button" disabled={saving} onClick={() => submitSchema(true)}><AdminIcon name="check" />Publish</button><button className="secondary-button icon-text-button" onClick={openCurrentPreview}><AdminIcon name="view" />Registration Form Preview</button></div>
          </div>
          {!orgApps.length && <div className="builder-message warning">No active application is available. Register an application first, then create its registration schema.</div>}
          <div className="schema-config-strip">
            <label>Application<select value={selectedAppId} onChange={(event) => setSelectedAppId(event.target.value)}><option value="">Select application</option>{orgApps.map((app) => <option key={app.id} value={app.id}>{app.name} - {app.id}</option>)}</select></label>
            <label>Schema Name<input value={schemaName} onChange={(event) => setSchemaName(event.target.value)} /></label>
          </div>
          <section className="dpdp-builder-card form-card">
            <div className="dpdp-builder-heading">
              <span className="status-pill-ui status-pending"><AdminIcon name="pending" />Field-level DPDP</span>
              <p>For every sensitive registration field, open Field Configuration and add its exact purpose, retention period, explicit consent setting, and justification.</p>
            </div>
            <div className="dpdp-sensitive-summary">
              <strong>{sensitiveFieldSummary.length} sensitive fields configured</strong>
              {sensitiveFieldSummary.length ? sensitiveFieldSummary.map((field) => <span key={field.name}>{field.label}: {field.purpose || 'purpose missing'} / {field.retentionDays || 'retention missing'} days</span>) : <span>No sensitive fields detected yet.</span>}
            </div>
          </section>
          {message && <div className="builder-message">{message}</div>}
          <div className="builder-grid schema-builder-grid">
            <div className="builder-palette form-card"><h4>Available Fields</h4>{fieldTypes.map((type) => <button key={type} className="ghost-button icon-text-button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', type)} onClick={() => addField(type)}><AdminIcon name="schema" />{type}</button>)}</div>
            <div className="builder-preview form-card" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const type = event.dataTransfer.getData('text/plain'); if (type) addField(type) }}>
              <h4>Live Registration Preview</h4>
              <form>
                {fields.map((field, index) => (
                  <div key={field.name} className={`field-row ${selectedIndex === index ? 'selected' : ''}`} onClick={() => setSelectedIndex(index)}>
                    <span className="drag-handle" title="Drag to reorder" />
                    <div className="control-wrap" style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <label style={{ display: 'block', fontSize: 12, opacity: 0.9, fontWeight: 600 }}>{field.label}{field.required ? ' *' : ''}</label>
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {isSensitiveField(field) && <span className="field-type-chip dpdp-chip">DPDP</span>}
                          <span className="field-type-chip">{(field.type || 'text').toUpperCase()}</span>
                        </span>
                      </div>
                      {field.type === 'dropdown' ? <select>{(field.options || ['Option 1']).map((option, optionIndex) => <option key={optionIndex}>{option}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" /> : <div className={requiresOtpVerification(field) ? 'preview-verify-control' : ''}><input placeholder={field.label} />{requiresOtpVerification(field) && <button type="button">Verify</button>}</div>}
                      {isSensitiveField(field) && <div className="field-dpdp-preview">
                        <span>{field.dpdp?.purpose || 'Purpose missing'}</span>
                        <span>{field.dpdp?.retentionDays || 'Retention missing'} days</span>
                        <span>{field.dpdp?.consentRequired ? 'Consent required' : 'Consent missing'}</span>
                      </div>}
                      {requiresOtpVerification(field) && <div className="field-dpdp-preview"><span>OTP verification required</span></div>}
                    </div>
                  </div>
                ))}
              </form>
              <div className="json-preview"><h5>Generated JSON</h5><pre>{JSON.stringify(schemaJson, null, 2)}</pre></div>
            </div>
            <div className="builder-config form-card">
              <h4>Field Configuration</h4>
              {fields.length === 0 ? <p>No fields. Add one from left.</p> : <>
                <div className="field-chip-list">{fields.map((field, idx) => <button key={field.name} className={`ghost-button ${selectedIndex === idx ? 'active' : ''}`} onClick={() => setSelectedIndex(idx)}>{field.label}</button>)}</div>
                <div className="field-config-form">
                  <label>Field Label<input value={fields[selectedIndex]?.label || ''} onChange={(event) => updateField(selectedIndex, { label: event.target.value })} /></label>
                  <label>Field Name<input value={fields[selectedIndex]?.name || ''} onChange={(event) => updateField(selectedIndex, { name: event.target.value })} /></label>
                  <label>Required<select value={fields[selectedIndex]?.required ? 'yes' : 'no'} onChange={(event) => updateField(selectedIndex, { required: event.target.value === 'yes' })}><option value="no">Optional</option><option value="yes">Required</option></select></label>
                  {fields[selectedIndex]?.type === 'dropdown' && <label>Dropdown Options<textarea value={(fields[selectedIndex]?.options || []).join('\n')} onChange={(event) => updateField(selectedIndex, { options: parseDropdownOptions(event.target.value) })} placeholder="One option per line, or comma separated" rows={5} /></label>}
                  <section className="field-dpdp-config">
                    <label className="builder-check-row"><input type="checkbox" checked={Boolean(fields[selectedIndex]?.dpdp?.sensitive || isSensitiveField(fields[selectedIndex]))} onChange={(event) => updateFieldDpdp(selectedIndex, { sensitive: event.target.checked })} /> Sensitive identity field</label>
                    {isSensitiveField(fields[selectedIndex]) && <>
                      <label>Processing Purpose<input value={fields[selectedIndex]?.dpdp?.purpose || ''} onChange={(event) => updateFieldDpdp(selectedIndex, { purpose: event.target.value })} placeholder="identity_verification" /></label>
                      <label>Retention Days<input type="number" min="1" max="365" value={fields[selectedIndex]?.dpdp?.retentionDays || ''} onChange={(event) => updateFieldDpdp(selectedIndex, { retentionDays: toNumberOrNull(event.target.value) })} placeholder="180" /></label>
                      <label className="builder-check-row"><input type="checkbox" checked={Boolean(fields[selectedIndex]?.dpdp?.consentRequired)} onChange={(event) => updateFieldDpdp(selectedIndex, { consentRequired: event.target.checked })} /> Explicit user consent required</label>
                      <label>Justification<textarea value={fields[selectedIndex]?.dpdp?.justification || ''} onChange={(event) => updateFieldDpdp(selectedIndex, { justification: event.target.value })} placeholder="Why is this specific field required?" rows={3} /></label>
                    </>}
                  </section>
                  <div className="field-action-row"><button className="secondary-button" onClick={() => moveUp(selectedIndex)}>Move Up</button><button className="secondary-button danger-button" onClick={() => removeField(selectedIndex)}>Remove</button></div>
                </div>
              </>}
            </div>
          </div>
          <section className="schema-history-panel">
            <div className="panel-heading"><h3>Registration Schemas</h3><span>{historyLoading ? 'Loading versions...' : `${registrationSchemas.length} versions`}</span></div>
            <div className="schema-status-list">
              {registrationSchemas.length ? registrationSchemas.map((schema: any) => (
                <article key={schema.versionId || schema.id} className="schema-status-card">
                  <div><div className="approval-name-row"><strong>{schema.name}</strong><span className={`status-pill-ui status-${schema.status}`}><AdminIcon name={schema.status === 'approved' ? 'check' : schema.status === 'rejected' ? 'rejected' : 'pending'} />{schema.status}</span></div><p>{schema.appName || schema.appId || 'Application'} - Version {schema.versionNumber || 1}{schema.changeSummary ? ` - ${schema.changeSummary}` : ''}</p></div>
                  <div className="schema-card-actions"><button type="button" className="ghost-button icon-text-button" onClick={() => openHistoryPreview(schema)}><AdminIcon name="view" />Preview Form</button><small>{schema.createdAt}</small></div>
                </article>
              )) : <div className="empty-state">No registration schemas found for this application.</div>}
            </div>
          </section>
        </section>
        {previewSchema && typeof document !== 'undefined' && createPortal(
          <div className="modal-backdrop" onClick={() => setPreviewSchema(null)}>
            <div className="modal-card polished-modal wide registration-form-preview-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row"><span className="modal-title-icon"><AdminIcon name="schema" /></span><h3>{previewSchema.title}</h3></div>
                <button type="button" className="close-button" onClick={() => setPreviewSchema(null)}>x</button>
              </div>
              <div className="registration-preview-meta">
                {previewSchema.appName && <span>{previewSchema.appName}</span>}
                {previewSchema.version && <span>{previewSchema.version}</span>}
                {previewSchema.status && <span className={`status-pill-ui status-${previewSchema.status}`}>{previewSchema.status}</span>}
                {previewSchema.createdAt && <span>{previewSchema.createdAt}</span>}
              </div>
              <form className="registration-form-preview">
                {previewSchema.fields.length ? previewSchema.fields.map((field) => (
                  <div key={field.name} className={field.type === 'address' || field.type === 'file' ? 'registration-preview-field full' : 'registration-preview-field'}>
                    {field.type !== 'checkbox' && <label>{field.label || field.name}{field.required ? ' *' : ''}</label>}
                    {renderPreviewControl(field)}
                  </div>
                )) : <div className="empty-state">No fields are available for this registration form.</div>}
              </form>
              <section className="preview-dpdp-summary">
                <h4>DPDP field-level declarations</h4>
                {getSensitiveFieldSummary(previewSchema.fields).length ? getSensitiveFieldSummary(previewSchema.fields).map((field) => (
                  <div key={field.name} className="preview-dpdp-row">
                    <strong>{field.label}</strong>
                    <span>Purpose: {field.purpose || 'Missing'}</span>
                    <span>Retention: {field.retentionDays || 'Missing'} days</span>
                    <span>{field.consentRequired ? 'Explicit consent required' : 'Consent missing'}</span>
                    <small>{field.justification || 'Justification missing'}</small>
                  </div>
                )) : <p>No sensitive fields detected in this registration schema.</p>}
              </section>
              <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setPreviewSchema(null)}>Close</button></div>
            </div>
          </div>,
          document.body
        )}
      </main>
    </div>
  )
}
