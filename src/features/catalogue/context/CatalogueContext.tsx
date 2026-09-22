'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import keycloak from '../../../lib/keycloak'
import type { ApplicationRecord, AppCredentialModal, ApprovalModal, AuditLog, ConfirmModal, LoginPolicy, Organization, RequestModal, SchemaRecord } from '../../../types/catalogue'
import { readStorage, writeStorage } from '../../../utils/storage'
import { getCatalogueRoute, type CatalogueView } from '../routes'

const registrationSteps = ['Basic Info', 'Registration Details', 'Representative Details', 'Address', 'Digital Presence']

const requiredRegistrationFields: Array<{ key: string; label: string }> = [
  { key: 'name', label: 'Organization name' },
  { key: 'type', label: 'Organization type' },
  { key: 'country', label: 'Country' },
  { key: 'email', label: 'Official email' },
  { key: 'registrationIdType', label: 'Registration ID type' },
  { key: 'gst', label: 'Registration number' },
  { key: 'repName', label: 'Representative name' },
  { key: 'repEmail', label: 'Representative email' },
  { key: 'address', label: 'Address line 1' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal code' },
]

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'
const ONBOARDING_API_BASE_URL = process.env.NEXT_PUBLIC_ONBOARDING_API_BASE_URL || 'http://localhost:8081'
const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL || 'http://localhost:8082'
const DIRECT_ONBOARDING_READ_PATHS = new Set([
  '/api/v1/onboarding/organizations',
  '/api/v1/onboarding/applications',
  '/api/v1/onboarding/schemas',
])

const getReadUrls = (path: string) => {
  const urls = [`/api/catalogue${path}`, `${API_BASE_URL}${path}`]
  if (ONBOARDING_API_BASE_URL !== API_BASE_URL) urls.push(`${ONBOARDING_API_BASE_URL}${path}`)
  return urls
}

const getServiceUrls = (path: string) => {
  const urls = [`/api/catalogue${path}`, `${API_BASE_URL}${path}`]
  const directBaseUrl = path.startsWith('/api/v1/auth/') ? AUTH_API_BASE_URL : ONBOARDING_API_BASE_URL
  if (directBaseUrl !== API_BASE_URL) urls.push(`${directBaseUrl}${path}`)
  return urls
}

const HOSTED_ADMIN_TOKEN_KEY = 'identity_os_hosted_admin_token'
const HOSTED_ADMIN_CLIENT_ID_KEY = 'identity_os_hosted_admin_client_id'

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

const getHostedAdminToken = () => {
  if (typeof window === 'undefined') return ''
  return readStorage(HOSTED_ADMIN_TOKEN_KEY) || ''
}

const hasProfileDetails = (org: Organization | null) =>
  Boolean(
    org?.representative?.name ||
    org?.representative?.email ||
    org?.representative?.mobile ||
    org?.representative?.designation ||
    org?.representative?.employeeId ||
    org?.address ||
    org?.addressDetails?.line1 ||
    org?.addressDetails?.city ||
    org?.addressDetails?.state ||
    org?.addressDetails?.postalCode
  )

const backendRequest = async <TResponse,>(path: string, init?: RequestInit): Promise<TResponse> => {
  if (keycloak.authenticated) {
    await keycloak.updateToken(30)
  }
  const hostedAdminToken = !keycloak.token ? getHostedAdminToken() : ''
  const requestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : hostedAdminToken ? { Authorization: `Bearer ${hostedAdminToken}` } : {}),
      ...init?.headers,
    },
  }
  const method = (init?.method || 'GET').toUpperCase()
  let response: Response | null = null
  let fetchError: unknown = null
  const isOnboardingPath = path.startsWith('/api/v1/onboarding/')
  const isAuthPath = path.startsWith('/api/v1/auth/')
  const urls = method === 'GET' && DIRECT_ONBOARDING_READ_PATHS.has(path)
    ? getReadUrls(path)
    : isOnboardingPath || isAuthPath
      ? getServiceUrls(path)
      : [`${API_BASE_URL}${path}`]
  for (const url of urls) {
    try {
      response = await fetch(url, requestInit)
      if (response.ok) break
    } catch (error) {
      fetchError = error
    }
  }
  if (!response) {
    throw fetchError instanceof Error ? fetchError : new Error('Unable to reach backend service')
  }
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }
  if (response.status === 204) return undefined as TResponse
  return response.json() as Promise<TResponse>
}

interface CatalogueProviderProps {
  children: React.ReactNode
  initialView?: CatalogueView
}

const CatalogueContext = createContext<any>(null)

export function CatalogueProvider({ children, initialView = 'home' }: CatalogueProviderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [view, setCurrentView] = useState<CatalogueView>(initialView)
  const [step, setStep] = useState(0)
  const [registrationForm, setRegistrationForm] = useState({
    name: '', type: '', country: '', email: '', phone: '', registrationIdType: '', registrationAuthority: '', gst: '', repName: '', repEmail: '', repMobile: '', designation: '', empId: '', address: '', addressLine2: '', city: '', district: '', state: '', postalCode: '', addressProofRef: '', website: '', domain: '', logo: '',
  })
  const [platformLogin, setPlatformLogin] = useState({ username: '', password: '' })
  const [platformLoginError, setPlatformLoginError] = useState('')
  const [pendingOrganizations, setPendingOrganizations] = useState<Organization[]>([])
  const [approvedOrganizations, setApprovedOrganizations] = useState<Organization[]>([])
  const [applications, setApplications] = useState<ApplicationRecord[]>([])
  const [schemas, setSchemas] = useState<SchemaRecord[]>([])
  const [schemaTab, setSchemaTab] = useState('registration')
  const [schemaSearch, setSchemaSearch] = useState('')
  const [schemaFilterStatus, setSchemaFilterStatus] = useState('All')
  const [policyPreviewModal, setPolicyPreviewModal] = useState<SchemaRecord | LoginPolicy | null>(null)
  const [registerAppModal, setRegisterAppModal] = useState(false)
  const [registerAppForm, setRegisterAppForm] = useState({ name:'', type:'web', description:'', contactEmail:'', domain:'', redirectUri:'', logoutUri:'' })
  const [appSearch, setAppSearch] = useState('')
  const [appFilterStatus, setAppFilterStatus] = useState('All')
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const raw = readStorage('catalogue_audit_v1')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [loginPolicies, setLoginPolicies] = useState<LoginPolicy[]>(() => {
    try {
      const raw = readStorage('catalogue_login_policies_v1')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsFilter, setOrgsFilter] = useState('All')
  const [orgApprovalModal, setOrgApprovalModal] = useState<ApprovalModal | null>(null)
  const [orgLoginStage, setOrgLoginStage] = useState(1)
  const [orgLoginId, setOrgLoginIdState] = useState(() => {
    try {
      const activeOrgId = readStorage('catalogue_active_org_id_v1')
      if (activeOrgId) return activeOrgId
      const lastRegistration = readStorage('catalogue_last_registration_v1')
      return lastRegistration ? JSON.parse(lastRegistration)?.orgId || '' : ''
    } catch {
      return ''
    }
  })
  const [orgLoginChannel, setOrgLoginChannel] = useState('email')
  const [orgOtp, setOrgOtp] = useState('')
  const [orgLoginError, setOrgLoginError] = useState('')
  const [orgLoginMaskedEmail, setOrgLoginMaskedEmail] = useState('')
  const [authenticatedOrgId, setAuthenticatedOrgId] = useState('')
  const [hostedAdminClientId, setHostedAdminClientId] = useState(() => {
    try {
      return readStorage(HOSTED_ADMIN_CLIENT_ID_KEY) || ''
    } catch {
      return ''
    }
  })
  const [authenticatedOrgProfile, setAuthenticatedOrgProfile] = useState<Organization | null>(null)
  const [successData, setSuccessData] = useState<{ orgId: string; createdAt: string; status: string; officialEmail?: string } | null>(() => {
    try {
      const raw = readStorage('catalogue_last_registration_v1')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [registrationError, setRegistrationError] = useState('')
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false)
  const [requestModal, setRequestModal] = useState<RequestModal | null>(null)
  const [appCredentialModal, setAppCredentialModal] = useState<AppCredentialModal | null>(null)
  const [publishModal, setPublishModal] = useState<SchemaRecord | null>(null)
  const [loginPublishModal, setLoginPublishModal] = useState<LoginPolicy | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
  const [confirmProcessing, setConfirmProcessing] = useState(false)
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const profileLoadAttempted = useRef<Set<string>>(new Set())

  const setOrgLoginId = (value: string) => {
    setOrgLoginIdState(value)
    if (value) writeStorage('catalogue_active_org_id_v1', value)
  }

  useEffect(() => setCurrentView(initialView), [initialView])

  const setView = (nextView: CatalogueView) => {
    const nextRoute = getCatalogueRoute(nextView)
    if (pathname === nextRoute) {
      setCurrentView(nextView)
      return
    }
    router.push(nextRoute)
  }

  const currentOrg = useMemo(() => {
    if (authenticatedOrgProfile) return authenticatedOrgProfile
    const hostedApp = hostedAdminClientId
      ? applications.find((app) => app.id === hostedAdminClientId || app.clientId === hostedAdminClientId)
      : null
    const effectiveOrgId = authenticatedOrgId || hostedApp?.orgId || orgLoginId
    if (!effectiveOrgId) return null
    const savedOrg = organizations.find((org) => org.id === effectiveOrgId)
    const approvedOrg = approvedOrganizations.find((org) => org.id === effectiveOrgId)
    return savedOrg && approvedOrg ? { ...savedOrg, ...approvedOrg } : savedOrg || approvedOrg || null
  }, [applications, authenticatedOrgId, authenticatedOrgProfile, approvedOrganizations, hostedAdminClientId, organizations, orgLoginId])

  const mapOrganizationProfile = (profile: any): Organization => {
    const representativeName = [profile.representativeFirstName, profile.representativeLastName].filter(Boolean).join(' ').trim()
    const addressParts = [
      profile.addressLine1,
      profile.addressLine2,
      profile.city,
      profile.district,
      profile.state,
      profile.postalCode,
      profile.addressCountryCode,
    ].filter(Boolean)

    return {
      id: profile.organizationId,
      name: profile.organizationName,
      type: profile.organizationType,
      country: profile.countryCode,
      email: profile.officialEmail,
      phone: profile.officialPhone,
      address: addressParts.join(', '),
      addressDetails: {
        type: profile.addressType,
        line1: profile.addressLine1,
        line2: profile.addressLine2,
        city: profile.city,
        district: profile.district,
        state: profile.state,
        postalCode: profile.postalCode,
        country: profile.addressCountryCode,
        proofRef: profile.addressProofRef,
      },
      website: profile.websiteUrl,
      status: profile.approvalStatus || profile.status || 'ACTIVE',
      registrationType: profile.verificationIdType,
      registrationDetails: {
        registrationNumber: profile.registrationNumber || profile.verificationId || '',
        gst: profile.verificationId,
        authority: profile.registrationAuthority,
        verificationStatus: profile.verificationIdVerifyStatus,
      },
      representative: {
        name: representativeName,
        email: profile.representativeEmail,
        mobile: profile.representativeMobileNumber,
        designation: profile.representativeDesignation,
        employeeId: profile.representativeEmployeeId,
      },
    }
  }

  useEffect(() => {
    const organizationId = currentOrg?.id || authenticatedOrgId || orgLoginId
    if (!organizationId || hasProfileDetails(currentOrg) || profileLoadAttempted.current.has(organizationId)) return
    profileLoadAttempted.current.add(organizationId)

    const loadDetailedProfile = async () => {
      try {
        const profile = await backendRequest<any>(`/api/v1/onboarding/organizations/${encodeURIComponent(organizationId)}/profile`)
        const mappedProfile = mapOrganizationProfile(profile)
        setAuthenticatedOrgProfile(mappedProfile)
        writeStorage('catalogue_active_org_id_v1', mappedProfile.id)
        setOrganizations((prev) => prev.some((org) => org.id === mappedProfile.id)
          ? prev.map((org) => org.id === mappedProfile.id ? { ...org, ...mappedProfile } : org)
          : [mappedProfile, ...prev])
      } catch {
        // Keep the available organization shell if the detailed profile is temporarily unavailable.
      }
    }

    loadDetailedProfile()
  }, [authenticatedOrgId, currentOrg?.addressDetails, currentOrg?.id, currentOrg?.representative, orgLoginId])

  const mapBackendApplication = (app: any): ApplicationRecord => ({
    id: app.applicationId,
    orgId: app.organizationId,
    orgName: app.organizationName || '',
    name: app.applicationName,
    type: app.applicationType,
    description: app.description || '',
    redirectUri: app.redirectUri || '',
    clientId: app.clientId || app.applicationId || '',
    clientSecret: app.clientSecret || '',
    status: app.status === 'ACTIVE' ? 'approved' : app.status === 'SUSPENDED' ? 'rejected' : 'pending',
    createdAt: app.createdAt ? new Date(app.createdAt).toLocaleString() : new Date().toLocaleString(),
  })

  const parseJson = (value?: string | null) => {
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  const mapBackendSchema = (schema: any): SchemaRecord => {
    const schemaJson = parseJson(schema.schemaJson)
    const configurationJson = parseJson(schema.configurationJson)
    return {
      id: schema.schemaId,
      versionId: schema.versionId,
      versionNumber: schema.versionNumber,
      type: schema.schemaType === 'LOGIN' ? 'login' : 'registration',
      name: schema.schemaName,
      orgId: schema.organizationId,
      orgName: schema.organizationName,
      appId: schema.applicationId,
      appName: schema.applicationName,
      fields: schema.schemaType === 'REGISTRATION' ? (schemaJson?.registrationFields || schemaJson?.fields || []) : undefined,
      payload: schema.schemaType === 'LOGIN' ? schemaJson : undefined,
      schemaJson,
      configurationJson,
      status: schema.status === 'APPROVED' || schema.status === 'PUBLISHED' ? 'approved' : schema.status === 'REJECTED' ? 'rejected' : schema.status === 'DRAFT' ? 'draft' : 'pending',
      changeSummary: schema.changeSummary,
      createdAt: schema.createdAt ? new Date(schema.createdAt).toLocaleString() : new Date().toLocaleString(),
      approvedAt: schema.publishedAt ? new Date(schema.publishedAt).toLocaleString() : undefined,
    }
  }

  const refreshCatalogueData = async () => {
    if (typeof window === 'undefined') return
    if (refreshInFlight.current) return refreshInFlight.current
    const refreshPromise = (async () => {
      try {
        const [orgProfilesResult, backendAppsResult, backendSchemasResult] = await Promise.allSettled([
          backendRequest<any[]>('/api/v1/onboarding/organizations'),
          backendRequest<any[]>('/api/v1/onboarding/applications'),
          backendRequest<any[]>('/api/v1/onboarding/schemas'),
        ])
        const orgProfiles = orgProfilesResult.status === 'fulfilled' ? orgProfilesResult.value : []
        const backendApps = backendAppsResult.status === 'fulfilled' ? backendAppsResult.value : []
        const backendSchemas = backendSchemasResult.status === 'fulfilled' ? backendSchemasResult.value : []
        const mappedOrgs = orgProfiles.map((profile) => {
          const org = mapOrganizationProfile(profile)
          return {
            ...org,
            status: profile.approvalStatus === 'APPROVED' ? 'approved' : profile.approvalStatus === 'REJECTED' ? 'rejected' : 'pending',
          }
        })
        if (orgProfilesResult.status === 'fulfilled') {
          setOrganizations(mappedOrgs)
          setPendingOrganizations(mappedOrgs.filter((org) => org.status === 'pending'))
          setApprovedOrganizations(mappedOrgs.filter((org) => org.status === 'approved'))
        }
        if (backendAppsResult.status === 'fulfilled') {
          setApplications(backendApps.map(mapBackendApplication))
        }
        if (backendSchemasResult.status === 'fulfilled') {
          setSchemas(backendSchemas.map(mapBackendSchema).filter((schema) => schema.status !== 'draft'))
        }
      } catch {
        // Keep the current in-memory state if services are temporarily unreachable.
      } finally {
        refreshInFlight.current = null
      }
    })()
    refreshInFlight.current = refreshPromise
    return refreshPromise
  }

  useEffect(() => {
    if (!hostedAdminClientId || authenticatedOrgId) return
    const hostedApp = applications.find((app) => app.id === hostedAdminClientId || app.clientId === hostedAdminClientId)
    if (!hostedApp?.orgId) return
    setAuthenticatedOrgId(hostedApp.orgId)
    setOrgLoginId(hostedApp.orgId)
    writeStorage('catalogue_active_org_id_v1', hostedApp.orgId)
  }, [applications, authenticatedOrgId, hostedAdminClientId])

  const loadIdentitySchemaVersions = async (organizationId: string, schemaType?: 'REGISTRATION' | 'LOGIN') => {
    if (!organizationId) return []
    const query = schemaType ? `?schemaType=${encodeURIComponent(schemaType)}` : ''
    const data = await backendRequest<any[]>(`/api/v1/onboarding/organizations/${encodeURIComponent(organizationId)}/schemas/versions${query}`)
    return data.map(mapBackendSchema)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const hostedAdminToken = params.get('hosted_admin_token') || getHostedAdminToken()
    const hostedClientId = params.get('client_id') || readStorage(HOSTED_ADMIN_CLIENT_ID_KEY) || ''
    const hostedAdminPayload = decodeJwtPayload(hostedAdminToken)
    if (hostedAdminToken && hasRealmRole(hostedAdminPayload, 'APPLICATION_SUPER_ADMIN')) {
      writeStorage(HOSTED_ADMIN_TOKEN_KEY, hostedAdminToken)
      if (hostedClientId) {
        writeStorage(HOSTED_ADMIN_CLIENT_ID_KEY, hostedClientId)
        setHostedAdminClientId(hostedClientId)
      }
      if (hostedAdminPayload?.organization_id) {
        setAuthenticatedOrgId(hostedAdminPayload.organization_id)
        setOrgLoginId(hostedAdminPayload.organization_id)
        writeStorage('catalogue_active_org_id_v1', hostedAdminPayload.organization_id)
      }
      if (params.has('hosted_admin_token')) {
        params.delete('hosted_admin_token')
        params.delete('client_id')
        const query = params.toString()
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
      }
      refreshCatalogueData()
      if (hostedAdminPayload?.organization_id) return
    }

    const tokenOrgId = keycloak.tokenParsed?.organization_id as string | undefined
    const username = keycloak.tokenParsed?.preferred_username as string | undefined
    const hasAdminRole = keycloak.hasRealmRole?.('ORGANISATION_ADMIN') || keycloak.hasRealmRole?.('APPLICATION_SUPER_ADMIN')
    const nextOrgId = tokenOrgId || (hasAdminRole ? username : '')
    if (!keycloak.authenticated || !nextOrgId) return

    setAuthenticatedOrgId(nextOrgId)
    setOrgLoginId(nextOrgId)

    const loadProfile = async () => {
      try {
        const profile = await backendRequest<any>(`/api/v1/onboarding/organizations/${encodeURIComponent(nextOrgId)}/profile`)
        setAuthenticatedOrgProfile(mapOrganizationProfile(profile))
        writeStorage('catalogue_active_org_id_v1', nextOrgId)
      } catch {
        // Keep the token organization id even when the profile endpoint is temporarily unavailable.
      }
    }

    loadProfile()
  }, [])

  const addAudit = (action: string, details: string) => {
    setAuditLogs((prev) => [{ id: `audit_${Date.now()}`, action, details, timestamp: new Date().toLocaleString() }, ...prev])
  }

  const updateRegistrationField = (field: keyof typeof registrationForm, value: string) => setRegistrationForm((prev) => ({ ...prev, [field]: value }))
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  const mobileDigitCount = (value: string) => value.replace(/\D/g, '').length
  const isValidMobile = (value: string) => /^\+?[0-9][0-9\s-]{6,18}$/.test(value.trim()) && mobileDigitCount(value) >= 7 && mobileDigitCount(value) <= 15
  const isValidRegistrationNumber = (value: string) => /^[A-Za-z0-9/-]{3,30}$/.test(value.trim())
  const isValidDesignation = (value: string) => !value.trim() || /^[A-Za-z ]{2,60}$/.test(value.trim())
  const isValidWebsite = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return true
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
      return Boolean(url.hostname.includes('.'))
    } catch {
      return false
    }
  }

  const validateRegistrationStep = (targetStep = step) => {
    const stepFields: Record<number, string[]> = {
      0: ['name', 'type', 'country', 'email', 'phone'],
      1: ['registrationIdType', 'gst'],
      2: ['repName', 'repEmail'],
      3: ['address', 'city', 'state', 'postalCode'],
    }
    const missing = (stepFields[targetStep] || [])
      .map((key) => requiredRegistrationFields.find((field) => field.key === key))
      .filter((field): field is { key: string; label: string } => Boolean(field))
      .find((field) => !String(registrationForm[field.key as keyof typeof registrationForm] || '').trim())
    if (missing) {
      setRegistrationError(`${missing.label} is required.`)
      return false
    }
    if (targetStep === 0 && !isValidEmail(registrationForm.email)) {
      setRegistrationError('Enter a valid official email address.')
      return false
    }
    if (targetStep === 0 && !isValidMobile(registrationForm.phone)) {
      setRegistrationError('Enter a valid official phone number with 7 to 15 digits.')
      return false
    }
    if (targetStep === 1 && !isValidRegistrationNumber(registrationForm.gst)) {
      setRegistrationError('Registration number must be 3 to 30 characters and use only letters, numbers, slash, or hyphen.')
      return false
    }
    if (targetStep === 2 && !isValidEmail(registrationForm.repEmail)) {
      setRegistrationError('Enter a valid representative email address.')
      return false
    }
    if (targetStep === 2 && registrationForm.repMobile && !isValidMobile(registrationForm.repMobile)) {
      setRegistrationError('Enter a valid representative mobile number with 7 to 15 digits.')
      return false
    }
    if (targetStep === 2 && !isValidDesignation(registrationForm.designation)) {
      setRegistrationError('Designation must contain only A-Z letters and spaces.')
      return false
    }
    if (targetStep === 4 && !isValidWebsite(registrationForm.website)) {
      setRegistrationError('Enter a valid website URL or domain.')
      return false
    }
    setRegistrationError('')
    return true
  }

  const nextStep = () => {
    if (!validateRegistrationStep()) return
    setStep((prev) => Math.min(prev + 1, registrationSteps.length - 1))
  }
  const previousStep = () => setStep((prev) => Math.max(prev - 1, 0))

  const submitRegistration = async () => {
    const firstInvalid = [0, 1, 2, 3, 4].find((targetStep) => !validateRegistrationStep(targetStep))
    if (firstInvalid !== undefined) {
      setStep(firstInvalid)
      return
    }
    setRegistrationSubmitting(true)
    setRegistrationError('')
    try {
      const data = await backendRequest<any>('/api/v1/onboarding/organizations', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: registrationForm.name,
          organizationType: registrationForm.type,
          countryCode: registrationForm.country,
          officialEmail: registrationForm.email,
          officialPhone: registrationForm.phone,
          registrationNumber: registrationForm.gst,
          registrationAuthority: registrationForm.registrationAuthority,
          verificationIdType: registrationForm.registrationIdType,
          verificationId: registrationForm.gst,
          verificationIdVerifyStatus: 'PENDING',
          websiteUrl: registrationForm.website,
          logoUrl: registrationForm.logo,
          representativeName: registrationForm.repName,
          representativeEmail: registrationForm.repEmail,
          representativeMobile: registrationForm.repMobile,
          representativeDesignation: registrationForm.designation,
          representativeEmployeeId: registrationForm.empId,
          addressType: 'REGISTERED',
          addressLine1: registrationForm.address,
          addressLine2: registrationForm.addressLine2,
          city: registrationForm.city,
          district: registrationForm.district,
          state: registrationForm.state,
          postalCode: registrationForm.postalCode,
          addressProofRef: registrationForm.addressProofRef,
        }),
      })

      const nextSuccessData = {
        orgId: data.organizationId,
        createdAt: new Date().toLocaleString(),
        status: 'Active',
        officialEmail: registrationForm.email,
      }
      setSuccessData(nextSuccessData)
      writeStorage('catalogue_last_registration_v1', JSON.stringify(nextSuccessData))
      const newApprovedOrg: Organization = {
        id: data.organizationId,
        name: registrationForm.name,
        type: registrationForm.type,
        country: registrationForm.country,
        email: registrationForm.email,
        phone: registrationForm.phone,
        status: 'approved',
        registrationType: registrationForm.registrationIdType,
        registrationDetails: { registrationNumber: registrationForm.gst, gst: registrationForm.gst, authority: registrationForm.registrationAuthority },
        representative: { name: registrationForm.repName, email: registrationForm.repEmail, mobile: registrationForm.repMobile, designation: registrationForm.designation },
        address: [registrationForm.address, registrationForm.addressLine2, registrationForm.city, registrationForm.state, registrationForm.postalCode].filter(Boolean).join(', '),
        submittedAt: new Date().toLocaleString(),
        approvedAt: new Date().toLocaleString(),
      }
      setOrganizations((prev) => [newApprovedOrg, ...prev.filter((org) => org.id !== newApprovedOrg.id)])
      setPendingOrganizations((prev) => prev.filter((org) => org.id !== newApprovedOrg.id))
      setApprovedOrganizations((prev) => [newApprovedOrg, ...prev.filter((org) => org.id !== newApprovedOrg.id)])
      setView('success')
      setStep(0)
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Registration failed. Please try again.')
    } finally {
      setRegistrationSubmitting(false)
    }
  }

  const handlePlatformLogin = () => {
    if (platformLogin.username === 'admin' && platformLogin.password === 'admin') {
      setPlatformLoginError('')
      setView('platform-dashboard')
      return
    }
    setPlatformLoginError('Invalid username or password. Please use admin / admin.')
  }

  const approveOrganization = async (org: Organization) => {
    await backendRequest<void>(`/api/v1/onboarding/organizations/${encodeURIComponent(org.id)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'APPROVED' }),
    })
    const approved = { ...org, status: 'approved', approvedAt: new Date().toLocaleString(), orgAdminActivated: true }
    setPendingOrganizations((prev) => prev.filter((item) => item.id !== org.id))
    setApprovedOrganizations((prev) => [approved, ...prev])
    setOrganizations((prev) => prev.some((item) => item.id === org.id) ? prev.map((item) => item.id === org.id ? approved : item) : [approved, ...prev])
    setOrgApprovalModal(null)
  }

  const rejectOrganization = async (org: Organization) => {
    await backendRequest<void>(`/api/v1/onboarding/organizations/${encodeURIComponent(org.id)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'REJECTED' }),
    })
    setPendingOrganizations((prev) => prev.filter((item) => item.id !== org.id))
    setOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'rejected', rejectedAt: new Date().toLocaleString() } : item))
    setOrgApprovalModal(null)
  }

  const requestMoreInfo = (org: Organization, message = 'Please provide additional documentation') => {
    setOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'requires_more_info', infoRequest: { message, requestedAt: new Date().toLocaleString() } } : item))
    setPendingOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'requires_more_info' } : item))
    setOrgApprovalModal(null)
  }

  const approveApplication = async (app: ApplicationRecord) => {
    const response = await backendRequest<any>(`/api/v1/onboarding/applications/${encodeURIComponent(app.id)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'APPROVED' }),
    })
    const mapped = mapBackendApplication(response)
    const updated = { ...app, ...mapped, status: 'approved', approvedAt: new Date().toLocaleString() }
    setApplications((prev) => prev.map((item) => item.id === app.id ? updated : item))
    setAppCredentialModal({ app: updated, clientId: updated.clientId || updated.id, clientSecret: updated.clientSecret })
    setOrgApprovalModal(null)
  }

  const rejectApplication = async (app: ApplicationRecord) => {
    await backendRequest<void>(`/api/v1/onboarding/applications/${encodeURIComponent(app.id)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'REJECTED' }),
    })
    const updated = { ...app, status: 'rejected', rejectedAt: new Date().toLocaleString() }
    setApplications((prev) => prev.map((item) => item.id === app.id ? updated : item))
    setOrgApprovalModal(null)
  }

  const registerApplication = async () => {
    const orgId = currentOrg?.id || orgLoginId
    if (!orgId) throw new Error('Organization context is missing.')
    if (!registerAppForm.name.trim()) throw new Error('Application name is required.')
    if (!registerAppForm.redirectUri.trim()) throw new Error('Redirect URI is required.')
    const app = await backendRequest<any>(`/api/v1/onboarding/organizations/${encodeURIComponent(orgId)}/applications`, {
      method: 'POST',
      body: JSON.stringify({
        applicationName: registerAppForm.name,
        applicationType: registerAppForm.type || 'web',
        description: registerAppForm.description,
        redirectUri: registerAppForm.redirectUri,
      }),
    })
    const mappedApp = { ...mapBackendApplication(app), orgName: currentOrg?.name || app.organizationName || orgId }
    setApplications((prev) => [mappedApp, ...prev])
    addAudit('Register Application', `Registered application ${mappedApp.name}`)
    setRegisterAppForm({ name:'', type:'web', description:'', contactEmail:'', domain:'', redirectUri:'', logoutUri:'' })
    setRegisterAppModal(false)
    return mappedApp
  }

  const submitIdentitySchemaVersion = async ({
    applicationId,
    schemaType,
    schemaName,
    schemaJson,
    configurationJson,
    changeSummary,
    submitForApproval = true,
  }: {
    applicationId: string
    schemaType: 'REGISTRATION' | 'LOGIN'
    schemaName: string
    schemaJson: Record<string, unknown>
    configurationJson?: Record<string, unknown>
    changeSummary?: string
    submitForApproval?: boolean
  }) => {
    const orgId = currentOrg?.id || orgLoginId
    if (!orgId) throw new Error('Organization context is missing.')
    if (!applicationId) throw new Error('Application is required.')
    const response = await backendRequest<any>(`/api/v1/onboarding/organizations/${encodeURIComponent(orgId)}/applications/${encodeURIComponent(applicationId)}/schemas`, {
      method: 'POST',
      body: JSON.stringify({
        schemaType,
        schemaName,
        schemaJson,
        configurationJson,
        changeSummary,
        submitForApproval,
      }),
    })
    const mappedSchema = mapBackendSchema(response)
    setSchemas((prev) => [mappedSchema, ...prev.filter((schema) => schema.versionId !== mappedSchema.versionId)])
    addAudit('Submit Schema Version', `Submitted ${schemaName} for ${mappedSchema.appName || applicationId}`)
    return mappedSchema
  }

  const approveSchema = async (schema: SchemaRecord) => {
    if (schema.versionId) {
      await backendRequest<void>(`/api/v1/onboarding/schemas/versions/${encodeURIComponent(schema.versionId)}/approval`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED' }),
      })
    }
    if (schema.type === 'login') {
      const policy: LoginPolicy = {
        id: `policy_${Date.now()}`,
        name: schema.name,
        authenticationMethods: schema.payload?.authenticationMethods || [],
        mfa: schema.payload?.mfa || false,
        mfaMethods: schema.payload?.mfaMethods || [],
        riskAuthentication: schema.payload?.riskAuthentication || false,
        flow: schema.payload?.flow || [],
        orgId: schema.orgId || null,
        createdAt: new Date().toLocaleString(),
      }
      const next = [policy, ...loginPolicies]
      writeStorage('catalogue_login_policies_v1', JSON.stringify(next))
      setLoginPolicies(next)
      addAudit('Approve Login Policy', `Approved login policy ${schema.name}`)
    } else {
      addAudit('Approve Schema', `Schema ${schema.name} approved`)
    }
    setSchemas((prev) => prev.map((item) => item.id === schema.id ? { ...item, status: 'approved', approvedAt: new Date().toLocaleString() } : item))
    if (schema.type === 'registration' && schema.orgId) {
      setOrganizations((prev) => prev.map((org) => org.id === schema.orgId ? ({ ...org, registrationSchemas: [...(org.registrationSchemas || []), schema] }) : org))
    }
    setOrgApprovalModal(null)
  }

  const rejectSchema = async (schema: SchemaRecord) => {
    if (schema.versionId) {
      await backendRequest<void>(`/api/v1/onboarding/schemas/versions/${encodeURIComponent(schema.versionId)}/approval`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'REJECTED' }),
      })
    }
    setSchemas((prev) => prev.map((item) => item.id === schema.id ? { ...item, status: 'rejected', rejectedAt: new Date().toLocaleString() } : item))
    addAudit('Reject Schema', `Schema ${schema.name} rejected`)
    setOrgApprovalModal(null)
  }

  const suspendOrganization = (org: Organization) => {
    setOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'suspended', suspendedAt: new Date().toLocaleString() } : item))
    setApprovedOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'suspended', suspendedAt: new Date().toLocaleString() } : item))
  }

  const unsuspendOrganization = (org: Organization) => {
    setOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'approved', resumedAt: new Date().toLocaleString() } : item))
    setApprovedOrganizations((prev) => prev.map((item) => item.id === org.id ? { ...item, status: 'approved', resumedAt: new Date().toLocaleString() } : item))
  }

  const handleOrgLoginSubmit = async () => {
    if (orgLoginStage === 1) {
      try {
        const data = await backendRequest<any>(`/api/v1/auth/organization/${encodeURIComponent(orgLoginId)}/status`)
        if (!data.success) {
          setOrgLoginError(data.message || 'Organization ID not found or not yet approved.')
          return
        }
        setOrgLoginMaskedEmail(data.maskedEmail || '')
        setOrgLoginError('')
        writeStorage('catalogue_active_org_id_v1', orgLoginId)
        setOrgLoginStage(2)
      } catch {
        setOrgLoginError('Unable to check organization status. Please try again.')
      }
      return
    }
    if (orgLoginStage === 2) {
      try {
        const data = await backendRequest<any>('/api/v1/auth/organization/otp/request', {
          method: 'POST',
          body: JSON.stringify({ organizationId: orgLoginId }),
        })
        if (!data.success) {
          setOrgLoginError(data.message || 'Unable to send OTP.')
          return
        }
        setOrgLoginMaskedEmail(data.maskedEmail || orgLoginMaskedEmail)
        setOrgLoginError('')
        setOrgLoginStage(3)
      } catch {
        setOrgLoginError('Unable to send OTP. Please try again.')
      }
      return
    }
    try {
      const data = await backendRequest<any>('/api/v1/auth/organization/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgLoginId, otp: orgOtp }),
      })
      if (!data.success) {
        setOrgLoginError(data.message || 'Invalid OTP.')
        return
      }
      setOrgLoginError('')
      await keycloak.login({
        loginHint: orgLoginId,
        redirectUri: `${window.location.origin}/organization/dashboard`,
      })
    } catch {
      setOrgLoginError('Unable to start Keycloak login. Please try again.')
    }
  }

  useEffect(() => {
    try {
      writeStorage('catalogue_state_v1', JSON.stringify({ organizations, pendingOrganizations, approvedOrganizations, applications, schemas }))
      writeStorage('catalogue_audit_v1', JSON.stringify(auditLogs))
      if (successData) writeStorage('catalogue_last_registration_v1', JSON.stringify(successData))
    } catch {
      // best-effort demo persistence
    }
  }, [organizations, pendingOrganizations, approvedOrganizations, applications, schemas, auditLogs])

  return (
    <CatalogueContext.Provider value={{
      addAudit, appCredentialModal, appFilterStatus, appSearch, applications, approveApplication, approveOrganization, approveSchema,
      approvedOrganizations,
      auditLogs, confirmModal, confirmProcessing, currentOrg, handleOrgLoginSubmit, handlePlatformLogin, loginPolicies, loginPublishModal,
      nextStep, orgApprovalModal, orgLoginChannel, orgLoginError, orgLoginId, orgLoginMaskedEmail, orgLoginStage, orgOtp, orgsFilter,
      organizations, pendingOrganizations, platformLogin, platformLoginError, policyPreviewModal, previousStep, publishModal,
      refreshCatalogueData, registerAppForm, registerAppModal, registrationForm, registrationSteps, rejectApplication, rejectOrganization, rejectSchema, requestModal,
      requestMoreInfo, registerApplication, schemaFilterStatus, schemaSearch, schemas, schemaTab, setAppCredentialModal, setAppFilterStatus, setApplications,
      setAppSearch, setConfirmModal, setConfirmProcessing, setLoginPublishModal, setOrgApprovalModal,
      setOrgLoginChannel, setOrgLoginId, setOrgOtp, setOrgsFilter, setPlatformLogin, setPolicyPreviewModal, setPublishModal,
      setRegisterAppForm, setRegisterAppModal, setRequestModal, setSchemaFilterStatus, setSchemas, setSchemaSearch, setSchemaTab,
      loadIdentitySchemaVersions, registrationError, registrationSubmitting, setOrganizations, setView, step, submitIdentitySchemaVersion, submitRegistration, successData, suspendOrganization, unsuspendOrganization, updateRegistrationField, view,
    }}>
      {children}
    </CatalogueContext.Provider>
  )
}

export const useCatalogue = () => {
  const context = useContext(CatalogueContext)
  if (!context) throw new Error('useCatalogue must be used inside CatalogueProvider')
  return context
}
