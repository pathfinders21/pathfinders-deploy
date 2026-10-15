import { query } from './_generated/server'
import { DEFAULT_PRICING_CONFIG } from '../convex/schema'

/** -------------------------------------------------------
 * Get the current pricing config (with defaults fallback)
 * ------------------------------------------------------- */
export const getPricingConfig = query({
  handler: async (ctx) => {
    const doc = await ctx.db.get('pricingConfig', 'default')
    return { ...DEFAULT_PRICING_CONFIG, ...doc }
  },
})

/** -------------------------------------------------------
 * Get entitlements for a user - the single source of truth
 * for what access a user has.
 * ------------------------------------------------------- */
export const getEntitlements = query({
  handler: async (ctx, userId: string) => {
    const role = ctx.session?.profile?.role ?? 'user'

    // Read subscription status
    const subscriptions = await ctx.db
      .query('subscriptions')
      .filter(q => q.userId === userId && q.status === 'active')
      .collect()

    // Read time passes
    const activePasses = await ctx.db
      .query('timePasses')
      .filter(q => q.userId === userId && q.status === 'active' && q.expiresAt && q.expiresAt > Date.now())
      .collect()

    // Read credit wallet
    const wallets = await ctx.db
      .query('creditWallets')
      .filter(q => q.userId === userId)
      .collect()

    // Read orders that were paid (for completed purchases)
    const paidOrders = await ctx.db
      .query('orders')
      .filter(q => q.userId === userId && q.status === 'paid')
      .collect()

    // Read mentor sessions that are confirmed
    const mentorSessions = await ctx.db
      .query('mentorSessions')
      .filter(q => q.menteeId === userId && q.status === 'confirmed')
      .collect()

    // Read promotions that are active and approved
    const promotions = await ctx.db
      .query('promotions')
      .filter(q => q.status === 'approved' && q.startDate <= Date.now() && q.endDate >= Date.now())
      .collect()

    // Build entitlements object
    const entitlements: any = {
      role,
      hasPremium: subscriptions.length > 0,
      activeTimePasses: activePasses.length,
      creditBalance: wallets.length > 0 ? wallets[0].balance : 0,
      activeMentorSessions: mentorSessions.length,
      accessiblePromotions: promotions,
    }

    // Add subscription details
    if (subscriptions.length > 0) {
      entitlements.subscription = subscriptions[0]
    }

    // Add active time pass details
    if (activePasses.length > 0) {
      entitlements.activeTimePass = activePasses[0]
    }

    return entitlements
  },
})

/** -------------------------------------------------------
 * Get the checkout summary breakdown for display
 * ------------------------------------------------------- */
export const getCheckoutSummary = query({
  handler: async (ctx, { tier, customAmount }: { tier?: string; customAmount?: number }) => {
    const pricing = await ctx.query(getPricingConfig)

    let subtotalPaise = 0
    let gstPaise = 0
    let processingChargePaise = pricing.processingChargePaise

    if (customAmount !== undefined) {
      subtotalPaise = customAmount
    } else if (tier === 'time_pass') {
      // Default 15 min time pass
      subtotalPaise = pricing.timePassPrices['time-15']?.paise || 1000
    } else if (tier === 'mentorship') {
      subtotalPaise = 5000 // default ₹50
    } else if (tier === 'promotion') {
      subtotalPaise = 1000 // default ₹10
    }

    const gstRate = pricing.gstRate / 100
    gstPaise = Math.round(subtotalPaise * gstRate)
    const totalAmount = subtotalPaise + gstPaise + processingChargePaise

    return {
      subtotal: subtotalPaise,
      gst: gstPaise,
      processing: processingChargePaise,
      total: totalAmount,
      gstRate: pricing.gstRate,
      processingCharge: pricing.processingChargePaise,
    }
  },
})
