// Split out of nav-config.ts purely so it's unit-testable: nav-config imports
// lucide-react icon components, and vitest resolves this project under React's
// "react-server" condition, where those icons fail to load at import time.
export function isNavItemActive(pathname: string, item: { href: string; end?: boolean }): boolean {
  return item.end ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
