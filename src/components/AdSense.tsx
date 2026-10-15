import React, { useEffect, useState } from 'react'
import { shouldShowAdSense, AdSlotConfig, ADSENSE_CLIENT_ID } from '../lib/adsense'

interface AdSenseProps {
  /** The ad slot name (matches AdSlotConfig keys) */
  slot: keyof typeof AdSlotConfig
  /** Optional custom className */
  className?: string
}

/** AdSense component - only renders on allowlisted routes */
export const AdSense: React.FC<AdSenseProps> = ({ slot, className }) => {
  const [loaded, setLoaded] = useState(false)
  const [showAd, setShowAd] = useState(false)
  const [userRole, setUserRole] = useState<'user' | 'mentor' | 'college' | 'admin' | null>(null)
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false)

  // Determine user role and premium access from session
  useEffect(() => {
    const checkAdVisibility = () => {
      setShowAd(shouldShowAdSense(window.location.pathname, userRole || 'user', hasPremiumAccess))
    }

    checkAdVisibility()
  }, [userRole, hasPremiumAccess, slot])

  // Effect to detect role changes (would connect to context in real app)
  useEffect(() => {
    const handleHashChange = () => {
      setShowAd(shouldShowAdSense(window.location.pathname, userRole || 'user', hasPremiumAccess))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [userRole, hasPremiumAccess])

  useEffect(() => {
    // Check if AdSense is allowed for this context
    const allowed = shouldShowAdSense(window.location.pathname, userRole || 'user', hasPremiumAccess)
    setShowAd(allowed)

    if (!allowed) return

    // Load the AdSense script if not already loaded
    if (!loaded && ADSENSE_CLIENT_ID) {
      const script = document.createElement('script')
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`

      script.onload = () => {
        setLoaded(true)
      }

      script.onerror = () => {
        console.error('Failed to load AdSense script')
      }

      document.head.appendChild(script)
    }
  }, [loaded, slot])

  // If AdSense is not allowed, render nothing
  if (!showAd) return null

  const config = AdSlotConfig[slot]
  if (!config) return null

  return (
    <div
      className={`adsbygoogle ${className || ''}`}
      style={{
        width: '100%',
        height: config.height.join(', '),
        minHeight: config.height[0],
        boxSizing: 'border-box' as const
      }}
    >
      <ins
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          height: config.height.join('px '),
        }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

/** ------------------------------------------------------- */
/* Manual ad loading - no auto-refresh */
/* ------------------------------------------------------- */
export const useAdSenseManual = () => {
  const [adsLoaded, setAdsLoaded] = useState(false)

  useEffect(() => {
    // Manual ad loading - no auto-refresh
    const checkAndLoadAds = () => {
      if (adsLoaded) return
      if (shouldShowAdSense(window.location.pathname, 'user', false)) {
        // Ads will be loaded by the AdSense component
        setAdsLoaded(true)
      }
    }

    checkAndLoadAds()
    const handleResize = () => checkAndLoadAds()
    const handleHashChange = () => checkAndLoadAds()

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('resize', handleResize)
    }
  }, [adsLoaded])

  return { adsLoaded }
}