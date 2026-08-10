import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'

// Next.js 16 renamed the `middleware` file convention to `proxy` (network-boundary
// routing only — no edge runtime). next-intl's exported function is unaffected by
// the name change, only the file name and this export name matter to Next.js.
const intlProxy = createMiddleware(routing)

// Content Security Policy — REPORT ONLY, deliberately.
//
// The runbook's standing instruction is not to add a CSP blind, and this one
// is strict enough to break things if it were enforced today: no
// 'unsafe-inline', which Next's hydration currently needs unless every
// inline script carries a per-request nonce. Nonces require dynamic
// rendering on every page, and most of this app's locale routes are
// statically generated — that is a real cost to take deliberately, not as a
// side effect of turning on a header.
//
// Report-Only changes nothing for users while making the browser announce
// exactly what a strict policy would have blocked. Once those reports are
// reviewed and the policy adjusted, switch the header name to
// `Content-Security-Policy` and it enforces. See docs/runbook.md.
function contentSecurityPolicy() {
  // Signed Storage URLs, Auth, and the browser's own supabase-js calls all go
  // to the project origin, so it has to be allowed explicitly rather than
  // covered by 'self'.
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseOrigin = supabase ? new URL(supabase).origin : ''

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // data: for the MFA enrolment QR, which arrives from Supabase as a data
    // URI; blob: for previews rendered client-side.
    `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
    // next/font/google is self-hosted at build time, so no external font origin.
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`.trim(),
    // Document and certificate previews are iframed from signed Storage URLs.
    `frame-src 'self' blob: ${supabaseOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Matches the X-Frame-Options: DENY already set in next.config.ts.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function proxy(request: NextRequest) {
  const response = intlProxy(request)
  response.headers.set('Content-Security-Policy-Report-Only', contentSecurityPolicy())
  return response
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
}
