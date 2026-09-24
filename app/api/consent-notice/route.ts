import { NextRequest, NextResponse } from 'next/server'

const CMP_BASE_URL = process.env.CMP_BASE_URL || 'http://localhost:3001'
const CMP_API_KEY = process.env.CMP_API_KEY
const CMP_BUSINESS_PROCESS_CODE = process.env.CMP_BUSINESS_PROCESS_CODE
const CMP_BUSINESS_PROCESS_VERSION = Number(process.env.CMP_BUSINESS_PROCESS_VERSION || '1')
const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:8086'

const cleanReferencePart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9()._\-/]+/g, '_').slice(0, 80)

const describeError = (value: any): string => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(describeError).filter(Boolean).join('; ')
  if (typeof value === 'object') {
    if (value.message) return describeError(value.message)
    if (value.error) return describeError(value.error)
    if (value.code) return String(value.code)
    return JSON.stringify(value)
  }
  return String(value)
}

const normalizeNoticeUrl = (noticeUrl: string) => {
  const cmpUrl = new URL(CMP_BASE_URL)
  const url = new URL(noticeUrl)
  url.protocol = cmpUrl.protocol
  url.host = cmpUrl.host
  return url.toString()
}

const auditConsentNotice = async ({
  clientId,
  consentFields,
  dataPrincipalId,
  redirectUri,
  status,
  errorMessage,
  noticeUrl,
}: {
  clientId: string
  consentFields: string[]
  dataPrincipalId: string
  redirectUri: string
  status: 'SUCCESS' | 'FAILED'
  errorMessage?: string
  noticeUrl?: string
}) => {
  try {
    await fetch(`${AUDIT_SERVICE_URL.replace(/\/$/, '')}/audits`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'cms-service',
        action: status === 'SUCCESS' ? 'CONSENT_NOTICE_CREATED' : 'CONSENT_NOTICE_CREATION_FAILED',
        httpMethod: 'POST',
        endpoint: '/api/consent-notice',
        entityType: 'CONSENT_NOTICE',
        entityId: clientId,
        actorUserId: dataPrincipalId,
        applicationId: clientId,
        status,
        body: {
          clientId,
          redirectUri,
          consentFields,
        },
        metadata: {
          noticeUrl,
          errorMessage,
          source: 'Catalogue_Service',
        },
        isoTime: new Date().toISOString(),
      }),
    })
  } catch (error) {
    console.error('Consent notice audit was not recorded:', error)
  }
}

export async function POST(request: NextRequest) {
  if (!CMP_API_KEY || !CMP_BUSINESS_PROCESS_CODE) {
    return NextResponse.json(
      { message: 'CMP integration is not configured.' },
      { status: 500 },
    )
  }

  try {
    const body = await request.json()
    const fields = body.fields || {}
    const clientId = String(body.clientId || '')
    const redirectUri = String(body.redirectUri || '')
    const consentRedirectUri = String(body.consentRedirectUri || redirectUri)
    const consentFields = Array.isArray(body.consentFields) ? body.consentFields : []
    const referenceNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dataPrincipalId = String(
      fields.email || fields.username || fields.mobile || fields.phone || '',
    ).trim()

    if (!clientId || !consentRedirectUri || !dataPrincipalId) {
      await auditConsentNotice({
        clientId,
        consentFields,
        dataPrincipalId,
        redirectUri: consentRedirectUri,
        status: 'FAILED',
        errorMessage: 'clientId, consentRedirectUri, and a user identifier are required.',
      })
      return NextResponse.json(
        { message: 'clientId, consentRedirectUri, and a user identifier are required.' },
        { status: 400 },
      )
    }

    const response = await fetch(`${CMP_BASE_URL.replace(/\/$/, '')}/cms/api/v1/notices/grant`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${CMP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: cleanReferencePart(`registration-${clientId}-${dataPrincipalId}-${referenceNonce}`),
        data_principal_id: cleanReferencePart(dataPrincipalId),
        notice_settings: {
          expires_in_hours: 24,
          redirection_type: 'redirect',
          redirection_url: consentRedirectUri,
          default_language: 'en',
          view_mode: 'purpose_of_consent',
        },
        consent_settings: {
          expires_in_hours: 8760,
        },
        business_process: {
          code: CMP_BUSINESS_PROCESS_CODE,
          version: CMP_BUSINESS_PROCESS_VERSION,
        },
        metadata: [
          { key: 'client_id', value: clientId },
          { key: 'registration_source', value: 'identity_os' },
          { key: 'redirect_uri', value: redirectUri || consentRedirectUri },
          { key: 'pii_fields', value: consentFields.join(', ') || 'registration_pii' },
        ],
      }),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message = describeError(data?.message || data?.error || data)
      await auditConsentNotice({
        clientId,
        consentFields,
        dataPrincipalId,
        redirectUri: consentRedirectUri,
        status: 'FAILED',
        errorMessage: message || 'CMP notice creation failed.',
      })
      return NextResponse.json(
        { message: message || 'CMP notice creation failed.' },
        { status: response.status },
      )
    }

    const noticeUrl = data?.data?.link_details?.link
    if (!noticeUrl) {
      await auditConsentNotice({
        clientId,
        consentFields,
        dataPrincipalId,
        redirectUri: consentRedirectUri,
        status: 'FAILED',
        errorMessage: 'CMP did not return a notice link.',
      })
      return NextResponse.json(
        { message: 'CMP did not return a notice link.' },
        { status: 502 },
      )
    }

    await auditConsentNotice({
      clientId,
      consentFields,
      dataPrincipalId,
      redirectUri: consentRedirectUri,
      status: 'SUCCESS',
      noticeUrl: normalizeNoticeUrl(noticeUrl),
    })
    return NextResponse.json({ noticeUrl: normalizeNoticeUrl(noticeUrl) })
  } catch (error) {
    console.error('Unable to create CMP notice:', error)

    const message =
      error instanceof Error && error.message
        ? `Unable to create CMP notice: ${error.message}`
        : 'Unable to create CMP notice.'

    return NextResponse.json(
      { message },
      { status: 502 },
    )
  }
}
