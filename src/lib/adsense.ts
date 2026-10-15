/** -------------------------------------------------------
 * AdSense configuration and utility functions
 * ------------------------------------------------------- */

// AdSense client ID from env vars
export const ADSENSE_CLIENT_ID = typeof window !== 'undefined'
  ? (window as any).__CONFIG?.adsenseClientId || process.env.VITE_ADSENSE_CLIENT_ID || ''
  : process.env.VITE_ADSENSE_CLIENT_ID || ''

// Allowlisted routes for AdSense (paths where ads can be shown)
export const AdSenseAllowlist = ['/', '/mentors', '/roadmaps', '/community', '/assess']

// Routes where AdSense should NOT be shown
export const AdSenseBlocklist = [
  '/dashboard',
  '/account',
  '/checkout',
  '/payments',
  '/mentor',
  '/admin',
]

/** -------------------------------------------------------
 * Should AdSense be enabled for the current context?
 * Checks: user role, route, and AdSense configuration.
 * ------------------------------------------------------- */
export function shouldShowAdSense(
  currentPath: string,
  userRole: 'user' | 'mentor' | 'college' | 'admin' | null,
  hasPremiumAccess: boolean = false
): boolean {
  // If user has premium access, no ads
  if (hasPremiumAccess) return false

  // If user is admin, mentor, or college (non-user roles), no ads
  if (userRole && userRole !== 'user') return false

  // Check if the current path is in the allowlist
  const pathMatch = AdSenseAllowlist.some(path =>
    currentPath === path || currentPath.startsWith(path + '/')
  )

  if (!pathMatch) return false

  // Check if the path is in the blocklist
  const pathBlock = AdSenseBlocklist.some(path =>
    currentPath === path || currentPath.startsWith(path + '/')
  )

  if (pathBlock) return false

  // Check if AdSense client ID is configured
  if (!ADSENSE_CLIENT_ID) return false

  return true
}

/** -------------------------------------------------------
 * Ad slot configuration - reserved heights to avoid layout shift
 * ------------------------------------------------------- */
export const AdSlotConfig = {
  landing: { width: [728, 468, 320], height: [90, 728] },
  listing: { width: [300, 250], height: [250] },
  roadmap: { width: [728, 468], height: [90, 728] },
  community: { width: [300, 250], height: [250] },
  default: { width: [300, 250], height: [250] },
} as const

/** -------------------------------------------------------
 * Generate ads.txt content for the domain
 * ------------------------------------------------------- */
export function generateAdsTxtContent(clientId: string): string {
  return `googleadclient: ca-pub-${clientId}
protect: {domain}
preamble openrtb 2.0`
}
