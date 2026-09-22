import { NextRequest, NextResponse } from 'next/server'

const ONBOARDING_API_BASE_URL =
  process.env.ONBOARDING_API_BASE_URL ||
  process.env.NEXT_PUBLIC_ONBOARDING_API_BASE_URL ||
  'http://localhost:8081'
const AUTH_API_BASE_URL =
  process.env.AUTH_API_BASE_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_BASE_URL ||
  'http://localhost:8082'

const uniqueUrls = (urls: string[]) => Array.from(new Set(urls.filter(Boolean)))

const serviceBaseUrls = (isAuthPath: boolean) => {
  if (isAuthPath) {
    return uniqueUrls([
      AUTH_API_BASE_URL,
      process.env.NEXT_PUBLIC_AUTH_API_BASE_URL || '',
      'http://127.0.0.1:8082',
      'http://localhost:8082',
    ])
  }

  return uniqueUrls([
    ONBOARDING_API_BASE_URL,
    process.env.NEXT_PUBLIC_ONBOARDING_API_BASE_URL || '',
    'http://127.0.0.1:8081',
    'http://localhost:8081',
  ])
}

interface RouteContext {
  params: Promise<{ path: string[] }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyOnboardingRequest(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyOnboardingRequest(request, context)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyOnboardingRequest(request, context)
}

async function proxyOnboardingRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const upstreamPath = path.join('/')

  const isOnboardingPath = upstreamPath.startsWith('api/v1/onboarding/')
  const isAuthPath = upstreamPath.startsWith('api/v1/auth/')
  if (!isOnboardingPath && !isAuthPath) {
    return NextResponse.json({ message: 'Unsupported catalogue route' }, { status: 404 })
  }

  const targets = serviceBaseUrls(isAuthPath).map((baseUrl) => {
    const target = new URL(`${baseUrl.replace(/\/$/, '')}/${upstreamPath}`)
    request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value))
    return target
  })

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.text()
  let lastStatus = 502
  let lastBody = ''
  let lastContentType = 'application/json'
  try {
    for (const target of targets) {
      try {
        const response = await fetch(target, {
          method: request.method,
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': request.headers.get('content-type') || 'application/json',
            ...(request.headers.get('authorization') ? { Authorization: request.headers.get('authorization') as string } : {}),
          },
          body,
        })
        const responseBody = await response.text()
        lastStatus = response.status
        lastBody = responseBody
        lastContentType = response.headers.get('content-type') || 'application/json'

        if (response.status === 204 || response.status === 304) {
          return new NextResponse(null, { status: response.status })
        }

        return new NextResponse(responseBody, {
          status: response.status,
          headers: {
            'Content-Type': lastContentType,
          },
        })
      } catch (error) {
        console.error(`Catalogue proxy failed for ${target.href}:`, error)
        // Try the next configured host alias before returning 502.
      }
    }
  } catch {
    lastStatus = 502
  }

  const serviceName = isAuthPath ? 'authentication service' : 'onboarding service'
  if (lastBody) {
    return new NextResponse(lastBody, {
      status: lastStatus,
      headers: {
        'Content-Type': lastContentType,
      },
    })
  }
  return NextResponse.json({ message: `Unable to reach ${serviceName}` }, { status: 502 })
}
