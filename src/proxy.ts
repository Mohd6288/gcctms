import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

// Next.js 16 renamed the `middleware` file convention to `proxy` (network-boundary
// routing only — no edge runtime). next-intl's exported function is unaffected by
// the name change, only the file name and this export name matter to Next.js.
export const proxy = createMiddleware(routing)

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
}
