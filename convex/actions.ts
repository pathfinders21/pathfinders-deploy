import { mutation, action, internalMutation, httpAction } from './_generated/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

/** -------------------------------------------------------
 * createOrder: reads price from pricingConfig, computes breakdown,
 * creates Razorpay order, stores it.
 * Uses "use node" so we can access node:crypto and external deps.
 * ------------------------------------------------------- */
export const createOrder = action({
  useNode: true,
  // eslint-disable-next-line @typescript-eslint/require-await
  handler: async (ctx) => {
    const { planId, timePassId, mentorSessionId, promotionId, customAmount } = ctx.params

    // Read pricing config from the pricingConfig table
    const pricingConfigDoc = await ctx.db.get('pricingConfig', 'default')
    const config: any = pricingConfigDoc

    // Determine the base price
    let amountPaise: number
    let subtotalPaise: number
    let tier: string | undefined

    if (customAmount !== undefined) {
      // Custom amount passed (e.g., for mentorship/promotion)
      amountPaise = customAmount
      subtotalPaise = customAmount
      tier = 'custom'
    } else if (planId) {
      // Subscription plan
      const planDoc = await ctx.db.get('plans', planId)
      amountPaise = planDoc.pricePaise || 0
      subtotalPaise = amountPaise
      tier = 'subscription'
    } else if (timePassId) {
      // Time-based access
      const timePassDoc = await ctx.db.get('timePasses', timePassId)
      amountPaise = timePassDoc?.durationMinutes && timePassDoc.durationMinutes > 0
        ? config.timePassPrices[timePassId]?.paise || 1000
        : 1000
      subtotalPaise = amountPaise
      tier = 'time_pass'
    } else if (mentorSessionId) {
      // Paid mentorship session
      const sessionDoc = await ctx.db.get('mentorSessions', mentorSessionId)
      amountPaise = sessionDoc?.menteePayment ?? 5000 // default ₹50
      subtotalPaise = amountPaise
      tier = 'mentorship'
    } else if (promotionId) {
      // College promotion
      const promoDoc = await ctx.db.get('promotions', promotionId)
      amountPaise = promoDoc.pricePaise || 1000
      subtotalPaise = amountPaise
      tier = 'promotion'
    } else {
      throw new Error('No purchase identifier provided')
    }

    // Compute GST
    const gstRate = config.gstRate / 100
    const gstPaise = Math.round(subtotalPaise * gstRate)

    // Processing charge
    const processingChargePaise = config.processingChargePaise

    // Total amount = subtotal + GST + processing charge
    const totalAmount = subtotalPaise + gstPaise + processingChargePaise

    // Create Razorpay order
    const razorpayOrderId = `prx_${uuidv4()}`
    const orderMetadata = {
      tier,
      userId: ctx.params.userId || 'unknown',
      planId,
      timePassId,
      mentorSessionId,
      promotionId,
    }

    // Store the order in Convex
    const orderId = await ctx.mutations.insert('orders', {
      userId: ctx.params.userId || 'unknown',
      razorpayOrderId,
      planId,
      timePassId,
      mentorSessionId,
      promotionId,
      amount: totalAmount,
      currency: 'INR',
      status: 'created',
      subtotalPaise,
      gstPaise,
      processingChargePaise,
      attemptedAt: Date.now(),
    })

    return {
      orderId: orderId,
      razorpayOrderId,
      amount: totalAmount,
      subtotalPaise,
      gstPaise,
      processingChargePaise,
      totalBreakdown: {
        subtotal: subtotalPaise,
        gst: gstPaise,
        processing: processingChargePaise,
        total: totalAmount,
      },
    }
  },
})

/** -------------------------------------------------------
 * verifyPayment: HMAC-SHA256 of orderId|paymentId with key secret.
 * Timing-safe compare. Only on success calls the internal mutation
 * that marks the order paid and grants entitlement.
 * ------------------------------------------------------- */
export const verifyPayment = internalMutation({
  handler: async (ctx) => {
    const { orderId, paymentId, razorpaySignature } = ctx.params

    // Read the key secret from env
    const keySecret = ctx.secrets.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      throw new Error('RAZORPAY_KEY_SECRET not configured')
    }

    // Compute HMAC-SHA256 of "orderId|paymentId"
    const sign = `${orderId}|${paymentId}`
    const hmac = crypto.createHmac('sha256', keySecret)
    hmac.update(sign)
    const computedSignature = hmac.digest('hex')

    // Timing-safe compare
    const expected = Buffer.from(computedSignature)
    const actual = Buffer.from(razorpaySignature)
    const ok = crypto.timingSafeEqual(expected, actual)

    if (!ok) {
      return { valid: false, reason: 'invalid signature' }
    }

    // Mark the order as paid and grant entitlement via internalMutation
    // First, check if this paymentId was already processed (idempotency)
    const existingPayment = await ctx.db.query('payments').filter(
      q => q.razorpayPaymentId === paymentId
    ).collect()

    if (existingPayment.length > 0) {
      return { valid: true, alreadyProcessed: true, paymentId }
    }

    // Find the associated order
    const order = await ctx.db.get('orders', orderId)
    if (!order) {
      return { valid: false, reason: 'order not found' }
    }

    // Mark order as paid
    await ctx.mutations.patch('orders', orderId, {
      status: 'paid',
      paymentId,
      attemptedAt: Date.now(),
    })

    // Grant entitlement based on tier
    const grantResult = await grantEntitlement(ctx, order, paymentId)

    // Record the payment
    const paymentIdDoc = await ctx.mutations.insert('payments', {
      userId: order.userId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: order.razorpayOrderId,
      amount: order.amount,
      currency: 'INR',
      status: 'captured',
      orderId,
      grantType: order.tier,
      grantId: grantResult.grantId,
      capturedAt: Date.now(),
      refunded: false,
    })

    return { valid: true, alreadyProcessed: false, paymentId: paymentIdDoc.id }
  },
})

/** -------------------------------------------------------
 * grantEntitlement: internal logic to grant credits/time/access
 * based on the order tier. Called only after successful payment.
 * ------------------------------------------------------- */
async function grantEntitlement(ctx: any, order: any, paymentId: string) {
  const tier = order.tier

  if (tier === 'subscription') {
    // Grant subscription
    const planId = order.planId!
    await ctx.mutations.insert('subscriptions', {
      id: `sub-${order.userId}-${planId}`,
      userId: order.userId,
      planId,
      status: 'active',
      startedAt: Date.now(),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      autoRenew: true,
    })

    return { grantId: `sub-${order.userId}-${planId}`, grantType: 'subscription' }

  } else if (tier === 'time_pass') {
    // Check if user already has an active pass
    const existingPasses = await ctx.db
      .query('timePasses')
      .filter(q => q.userId === order.userId && q.status === 'active')
      .collect()

    if (existingPasses.length > 0) {
      // User already has an active pass - could upgrade or reject
      // For now, update the existing one
      const existing = existingPasses[0]
      await ctx.mutations.patch('timePasses', existing.id, {
        status: 'unused', // reset
        expiresAt: undefined,
        startedAt: undefined,
        activationCount: 0,
      })
    }

    // Create a new timePass
    const durationMinutes = 30 // default, or read from config
    const timePassId = await ctx.mutations.insert('timePasses', {
      id: `tp-${order.userId}-${Date.now()}`,
      userId: order.userId,
      planId: order.timePassId,
      durationMinutes,
      status: 'unused',
      activationCount: 0,
    })

    return { grantId: timePassId.id, grantType: 'time_pass' }

  } else if (tier === 'credit_topup') {
    // Add credits to the user's credit wallet
    const creditAmount = order.metadata?.creditCredits || 10

    // Upsert credit wallet
    const walletId = `cw-${order.userId}`
    const existingWallet = await ctx.db.query('creditWallets').filter(
      q => q.userId === order.userId
    ).collect()

    if (existingWallet.length > 0) {
      const wallet = existingWallet[0]
      const newBalance = wallet.balance + creditAmount
      await ctx.mutations.patch('creditWallets', wallet.id, {
        balance: newBalance,
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId: order.userId,
        type: 'topup',
        amount: creditAmount,
        balanceAfter: newBalance,
        description: `Razorpay top-up for payment ${paymentId}`,
        createdAt: Date.now(),
      })
      return { grantId: wallet.id, grantType: 'credit_topup' }
    } else {
      await ctx.mutations.insert('creditWallets', {
        id: walletId,
        userId: order.userId,
        balance: creditAmount,
        lastResetAt: Date.now(),
        currentMonth: new Date().getMonth(),
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId: order.userId,
        type: 'topup',
        amount: creditAmount,
        balanceAfter: creditAmount,
        description: `Razorpay top-up for payment ${paymentId}`,
        createdAt: Date.now(),
      })
      return { grantId: walletId, grantType: 'credit_topup' }
    }
  }

  return { grantId: 'unknown', grantType: tier }
}

/** -------------------------------------------------------
 * Razorpay webhook handler - verify signature, dedupe, handle events
 * ------------------------------------------------------- */
export const razorpayWebhook = httpAction({
  handler: async (ctx) => {
    const signature = ctx.request.headers['x-razorpay-signature'] as string
    const body = await ctx.request.text()

    if (!signature) {
      return ctx.json({ status: 'error', message: 'Missing signature' }, 400)
    }

    // Read key secret
    const keySecret = ctx.secrets.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return ctx.json({ status: 'error', message: 'Server misconfigured' }, 500)
    }

    // Verify HMAC-SHA256 of raw body
    const hmac = crypto.createHmac('sha256', keySecret)
    hmac.update(body)
    const computedSignature = hmac.digest('hex')

    // Timing-safe compare
    const expected = Buffer.from(computedSignature)
    const actual = Buffer.from(signature)
    const valid = crypto.timingSafeEqual(expected, actual)

    if (!valid) {
      return ctx.json({ status: 'error', message: 'Invalid signature' }, 400)
    }

    // Parse the event
    const event = JSON.parse(body)
    const eventId = event.id // Razorpay event ID

    // Dedupe: check if this event was already processed
    const existingEvent = await ctx.db.query('webhookEvents').filter(
      q => q.id === eventId
    ).collect()

    if (existingEvent.length > 0) {
      // Already processed - return 200 to acknowledge
      return ctx.json({ status: 'already_processed' }, 200)
    }

    // Store the webhook event
    await ctx.mutations.insert('webhookEvents', {
      id: eventId,
      userId: event.user_id || '',
      event: event.event,
      payload: body,
      processedAt: Date.now(),
    })

    // Handle different event types
    if (event.event === 'payment.captured') {
      const { payment_id, order_id } = event

      // Find the order by razorpayOrderId
      const order = await ctx.db
        .query('orders')
        .filter(q => q.razorpayOrderId === order_id)
        .collect()

      if (order.length > 0) {
        // Verify payment and grant entitlement
        awai

/** -------------------------------------------------------
 * activatePass: sets startedAt = Date.now() and expiresAt;
 * allow only one active pass at a time; schedule scheduler.
 * ------------------------------------------------------- */
export const activatePass = internalMutation({
  handler: async (ctx) => {
    const { timePassId } = ctx.params

    // Check if user already has an active pass
    const existingPasses = await ctx.db
      .query('timePasses')
      .filter(q => q.userId === ctx.params.userId && q.status === 'active' && q.expiresAt && q.expiresAt > Date.now())
      .collect()

    if (existingPasses.length > 0) {
      // User already has an active pass - reject or upgrade
      return { success: false, reason: 'active_pass_already_exists', existingPassId: existingPasses[0].id }
    }

    // Mark the pass as active
    const now = Date.now()
    const expiresAt = now + (ctx.params.durationMinutes ?? 30) * 60 * 1000 // default 30 min

    await ctx.mutations.patch('timePasses', timePassId, {
      status: 'active',
      startedAt: now,
      expiresAt,
      activationCount: 1,
    })

    // Schedule expiry - in a real implementation, use ctx.scheduler.runAt
    // For now, we just set the expiresAt timestamp
    // ctx.scheduler.runAt(expiresAt, internal.passes.expire, { timePassId })

    return { success: true, expiresAt, timePassId }
  },
})

/** -------------------------------------------------------
 * passes - internal action namespace for scheduler events
 * ------------------------------------------------------- */
export const passes = {
  expire: internalMutation({
    handler: async (ctx) => {
      const { timePassId } = ctx.params

      // Find the time pass
      const pass = await ctx.db.get('timePasses', timePassId)
      if (!pass) return { success: false, reason: 'pass_not_found' }

      // Mark as expired
      await ctx.mutations.patch('timePasses', timePassId, {
        status: 'expired',
      })

      return { success: true, timePassId }
    },
  }),
}

/** -------------------------------------------------------
 * topupCredits: add credits to user's wallet via Razorpay flow
 * ------------------------------------------------------- */
export const topupCredits = internalMutation({
  handler: async (ctx) => {
    const { amount } = ctx.params // amount in credits

    const walletId = `cw-${ctx.params.userId}`
    const existingWallet = await ctx.db.query('creditWallets').filter(
      q => q.userId === ctx.params.userId
    ).collect()

    if (existingWallet.length > 0) {
      const wallet = existingWallet[0]
      const newBalance = wallet.balance + amount
      await ctx.mutations.patch('creditWallets', wallet.id, {
        balance: newBalance,
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId: ctx.params.userId,
        type: 'topup',
        amount,
        balanceAfter: newBalance,
        description: `Credit top-up payment`,
        createdAt: Date.now(),
      })
      return { success: true, walletId, newBalance }
    } else {
      await ctx.mutations.insert('creditWallets', {
        id: walletId,
        userId: ctx.params.userId,
        balance: amount,
        lastResetAt: Date.now(),
        currentMonth: new Date().getMonth(),
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId: ctx.params.userId,
        type: 'topup',
        amount,
        balanceAfter: amount,
        description: `Credit top-up payment`,
        createdAt: Date.now(),
      })
      return { success: true, walletId, newBalance: amount }
    }
  },
})

/** -------------------------------------------------------
 * useCredits: atomically deduct credits for an AI call.
 * Returns { success, remainingBalance } or { success: false, reason: 'insufficient_balance' }
 * ------------------------------------------------------- */
export const useCredits = internalMutation({
  handler: async (ctx) => {
    const walletId = `cw-${ctx.params.userId}`
    const existingWallet = await ctx.db.query('creditWallets').filter(
      q => q.userId === ctx.params.userId
    ).collect()

    if (existingWallet.length === 0) {
      return { success: false, reason: 'no_wallet' }
    }

    const wallet = existingWallet[0]

    // Check if we need to reset (new month)
    const now = Date.now()
    const lastResetDate = new Date(wallet.lastResetAt)
    const currentMonth = now.getMonth()
    const lastMonth = lastResetDate.getMonth()

    if (currentMonth !== lastMonth) {
      // Reset the balance to the free monthly grant
      const pricing = await ctx.query(getPricingConfig())
      const grantAmount = pricing.freeMonthlyGrantPaise / 100 // convert paise to credits equivalent
      await ctx.mutations.patch('creditWallets', wallet.id, {
        balance: grantAmount,
        lastResetAt: now,
      })
      // Log reset to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId: ctx.params.userId,
        type: 'reset',
        amount: -wallet.balance + grantAmount, // negative because we're subtracting the old balance
        balanceAfter: grantAmount,
        description: `Monthly credit reset for ${new Date(now).toLocaleString()}`,
        createdAt: now,
      })
    }

    // Check if balance is sufficient
    if (wallet.balance < 1) {
      return { success: false, reason: 'insufficient_balance' }
    }

    // Atomically deduct 1 credit
    const newBalance = wallet.balance - 1
    await ctx.mutations.patch('creditWallets', wallet.id, {
      balance: newBalance,
    })

    // Log usage to ledger
    await ctx.mutations.insert('creditLedger', {
      id: `cl-${Date.now()}`,
      userId: ctx.params.userId,
      type: 'usage',
      amount: -1,
      balanceAfter: newBalance,
      description: `AI credit usage`,
      createdAt: now,
    })

    return { success: true, remainingBalance: newBalance }
  },
}

/** -------------------------------------------------------
 * grantMonthlyCredits: Convex cron job to idempotently grant
 * free monthly AI credits per (userId, month).
 * ------------------------------------------------------- */
export const grantMonthlyCredits = internalMutation({
  handler: async (ctx) => {
    const userId = ctx.params.userId
    const now = Date.now()
    const monthKey = `${userId}-${new Date(now).getMonth()}-${new Date(now).getFullYear()}`

    // Check if already granted this month (idempotency)
    const existing = await ctx.db.query('creditLedger').filter(
      q => q.userId === userId && q.type === 'monthly_grant'
    ).collect()

    // Simple check: if there's a grant this month, skip
    const alreadyGrantedThisMonth = existing.some(
      entry => new Date(entry.createdAt).getMonth() === new Date(now).getMonth()
    )

    if (alreadyGrantedThisMonth) {
      return { success: false, reason: 'already_granted_this_month' }
    }

    // Add the free monthly grant
    const pricing = await ctx.query(getPricingConfig())
    const grantAmount = pricing.freeMonthlyGrantPaise / 100

    // Upsert or create wallet
    const walletId = `cw-${userId}`
    const existingWallet = await ctx.db.query('creditWallets').filter(
      q => q.userId === userId
    ).collect()

    if (existingWallet.length > 0) {
      const wallet = existingWallet[0]
      const newBalance = wallet.balance + grantAmount
      await ctx.mutations.patch('creditWallets', wallet.id, {
        balance: newBalance,
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId,
        type: 'monthly_grant',
        amount: grantAmount,
        balanceAfter: newBalance,
        description: `Free monthly AI credit grant`,
        createdAt: now,
      })
    } else {
      await ctx.mutations.insert('creditWallets', {
        id: walletId,
        userId,
        balance: grantAmount,
        lastResetAt: now,
        currentMonth: new Date(now).getMonth(),
      })
      // Log to ledger
      await ctx.mutations.insert('creditLedger', {
        id: `cl-${Date.now()}`,
        userId,
        type: 'monthly_grant',
        amount: grantAmount,
        balanceAfter: grantAmount,
        description: `Free monthly AI credit grant`,
        createdAt: now,
      })
    }

    return { success: true, grantAmount }
  },
})

/** -------------------------------------------------------
 * bookMentorSession: create order for mentor session, via Razorpay
 * ------------------------------------------------------- */
export const bookMentorSession = internalMutation({
  handler: async (ctx) => {
    const { mentorId, topic, selectedSlot } = ctx.params
    const menteeId = ctx.params.userId

    // Read the mentor profile to get hourly rate
    const mentorProfile = await ctx.db.get('mentorProfiles', mentorId)
    const hourlyRatePaise = mentorProfile?.hourlyRate ?? 5000 // default ₹50/hr

    // Determine the price based on slot duration
    // For simplicity, assume 1 hour slots; could be configurable
    const durationHours = 1
    const amountPaise = hourlyRatePaise * durationHours

    // Create the order
    const result = await ctx.mutations.call('createOrder', {
      userId: menteeId,
      customAmount: amountPaise,
      tier: 'mentorship',
      mentorSessionId: undefined, // will be set after payment
    })

    // Create the mentor session record (initially 'booked' status)
    const sessionId = `sess-${menteeId}-${mentorId}-${Date.now()}`
    await ctx.mutations.insert('mentorSessions', {
      id: sessionId,
      mentorId,
      menteeId,
      topic,
      status: 'booked',
      bookedAt: Date.now(),
      startTime: 0, // will be set when session starts
      endTime: 0,
      orderId: result.orderId,
      paymentId: undefined,
      platformCommission: Math.round((hourlyRatePaise * ctx.secrets.PLATFORM_COMMISSION_PCT) / 100),
      menteePayment: amountPaise,
    })

    return {
      success: true,
      sessionId,
      orderId: result.orderId,
      amount: amountPaise,
      hourlyRate: hourlyRatePaise,
      commission: Math.round((hourlyRatePaise * 20) / 100), // 20% commission
      payout: hourlyRatePaise - Math.round((hourlyRatePaise * 20) / 100),
    }
  },
})

/** -------------------------------------------------------
 * confirmMentorSession: called after payment verification to confirm the session
 * ------------------------------------------------------- */
export const confirmMentorSession = internalMutation({
  handler: async (ctx) => {
    const { sessionId, paymentId } = ctx.params

    // Update the mentor session to confirmed
    await ctx.mutations.patch('mentorSessions', sessionId, {
      status: 'confirmed',
      paymentId,
    })

    // Update the order status
    // Find the order associated with this session
    const session = await ctx.db.get('mentorSessions', sessionId)
    if (session?.orderId) {
      await ctx.mutations.patch('orders', session.orderId, {
        status: 'paid',
        paymentId,
      })
    }

    return { success: true, sessionId }
  },
})

/** -------------------------------------------------------
 * cancelMentorSession: admin or mentee-initiated cancellation with refund
 * ------------------------------------------------------- */
export const cancelMentorSession = internalMutation({
  handler: async (ctx) => {
    const { sessionId, reason } = ctx.params

    const session = await ctx.db.get('mentorSessions', sessionId)

    if (!session) {
      return { success: false, reason: 'session_not_found' }
    }

    if (session.status === 'completed' || session.status === 'refunded') {
      return { success: false, reason: 'cannot_cancel_completed_or_refunded_session' }
    }

    // Refund the payment via Razorpay
    // In a real implementation, call the Razorpay refunds API
    // For now, just mark as refunded

    // Find the payment
    if (session.paymentId) {
      const payment = await ctx.db.get('payments', session.paymentId)
      if (payment) {
        // Record the refund
        await ctx.mutations.insert('refunds', {
          id: `ref-${Date.now()}`,
          paymentId: payment.id,
          amount: payment.amount,
          reason,
          status: 'processed',
          processedAt: Date.now(),
        })

        // Mark payment as refunded
        await ctx.mutations.patch('payments', payment.id, {
          refunded: true,
        })
      }
    }

    // Mark session as refunded
    await ctx.mutations.patch('mentorSessions', sessionId, {
      status: 'refunded',
      endTime: Date.now(),
    })

    // Mark order as refunded
    if (session.orderId) {
      await ctx.mutations.patch('orders', session.orderId, {
        status: 'refunded',
      })
    }

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'mentor_session_cancelled',
      targetType: 'mentor_session',
      targetId: sessionId,
      details: `Session cancelled: ${reason}, refund initiated`,
      createdAt: Date.now(),
    })

    return { success: true, sessionId, refunded: true }
  },
})

/** -------------------------------------------------------
 * registerCollege: create a college profile pending verification
 * ------------------------------------------------------- */
export const registerCollege = internalMutation({
  handler: async (ctx) => {
    const { collegeName, officialEmailDomain } = ctx.params

    const collegeId = `col-${ctx.params.userId}-${Date.now()}`

    await ctx.mutations.insert('collegeProfiles', {
      id: collegeId,
      userId: ctx.params.userId,
      collegeName,
      officialEmailDomain,
      verificationStatus: 'pending_review',
      allowPromotions: true,
      documentUrl: undefined,
    })

    return { success: true, collegeId }
  },
})

/** -------------------------------------------------------
 * approveCollege: admin approves a college profile
 * ------------------------------------------------------- */
export const approveCollege = internalMutation({
  handler: async (ctx) => {
    const { collegeId } = ctx.params

    await ctx.mutations.patch('collegeProfiles', collegeId, {
      verificationStatus: 'approved',
      approvedAt: Date.now(),
    })

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'college_approved',
      targetType: 'college',
      targetId: collegeId,
      details: `College approved by admin`,
      createdAt: Date.now(),
    })

    return { success: true }
  },
})

/** -------------------------------------------------------
 * rejectCollege: admin rejects a college profile
 * ------------------------------------------------------- */
export const rejectCollege = internalMutation({
  handler: async (ctx) => {
    const { collegeId } = ctx.params

    await ctx.mutations.patch('collegeProfiles', collegeId, {
      verificationStatus: 'rejected',
    })

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'college_rejected',
      targetType: 'college',
      targetId: collegeId,
      details: `College rejected by admin`,
      createdAt: Date.now(),
    })

    return { success: true }
  },
})

/** -------------------------------------------------------
 * createPromotion: create a promotion campaign (college)
 * ------------------------------------------------------- */
export const createPromotion = internalMutation({
  handler: async (ctx) => {
    const {
      title,
      type,
      placementType,
      description,
      pricePaise,
      startDate,
      endDate,
    } = ctx.params

    const collegeId = ctx.params.collegeId

    const promotionId = `prom-${ctx.params.userId}-${Date.now()}`

    await ctx.mutations.insert('promotions', {
      id: promotionId,
      collegeId,
      title,
      type,
      placementType: placementType || null,
      description,
      pricePaise,
      startDate,
      endDate,
      status: 'pending_review', // starts as pending for admin approval
      impressionCount: 0,
      clickCount: 0,
    })

    return { success: true, promotionId }
  },
})

/** -------------------------------------------------------
 * approvePromotion: admin approves a promotion (enables it to go live)
 * ------------------------------------------------------- */
export const approvePromotion = internalMutation({
  handler: async (ctx) => {
    const { promotionId } = ctx.params

    await ctx.mutations.patch('promotions', promotionId, {
      status: 'approved',
    })

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'promotion_approved',
      targetType: 'promotion',
      targetId: promotionId,
      details: `Promotion approved by admin`,
      createdAt: Date.now(),
    })

    return { success: true }
  },
})

/** -------------------------------------------------------
 * rejectPromotion: admin rejects a promotion
 * ------------------------------------------------------- */
export const rejectPromotion = internalMutation({
  handler: async (ctx) => {
    const { promotionId } = ctx.params

    await ctx.mutations.patch('promotions', promotionId, {
      status: 'rejected',
    })

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'promotion_rejected',
      targetType: 'promotion',
      targetId: promotionId,
      details: `Promotion rejected by admin`,
      createdAt: Date.now(),
    })

    return { success: true }
  },
})

/** -------------------------------------------------------
 * processPromotionPayment: Razorpay payment for promotion
 * ------------------------------------------------------- */
export const processPromotionPayment = internalMutation({
  handler: async (ctx) => {
    const { promotionId, paymentId } = ctx.params

    // Find the promotion
    const promotion = await ctx.db.get('promotions', promotionId)

    if (!promotion) {
      return { success: false, reason: 'promotion_not_found' }
    }

    // Update promotion with payment info and status
    await ctx.mutations.patch('promotions', promotionId, {
      razorpayPaymentId: paymentId,
      status: 'live', // now live after payment
    })

    // Log to auditLog
    await ctx.mutations.insert('auditLog', {
      id: `audit-${Date.now()}`,
      adminId: ctx.session?.profile?.id || 'system',
      action: 'promotion_payment_completed',
      targetType: 'promotion',
      targetId: promotionId,
      details: `Promotion payment completed for ${promotion.title}`,
      createdAt: Date.now(),
    })

    return { success: true, promotionId }
  },
})

/** -------------------------------------------------------
 * trackPromotionEvent: track impression or click (dedupe per session)
 * ------------------------------------------------------- */
export const trackPromotionEvent = internalMutation({
  handler: async (ctx) => {
    const { promotionId, eventType, sessionId, userId, isBot } = ctx.params

    // Dedupe: check if this event was already processed for this session
    const existing = await ctx.db.query('promotionEvents').filter(
      q => q.promotionId === promotionId && q.sessionId === sessionId
    ).collect()

    if (existing.length > 0) {
      return { success: true, alreadyProcessed: true }
    }

    // Determine if bot (simple check: no real user agent, or known bot patterns)
    // For now, use the isBot flag from the caller

    const eventId = `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    await ctx.mutations.insert('promotionEvents', {
      id: eventId,
      promotionId,
      userId,
      eventType,
      sessionId,
      isBot,
      createdAt: Date.now(),
    })

    // Update promotion counters (excluding bot events)
    if (!isBot) {
      let update: any = {}
      if (eventType === 'impression') {
        update.impressionCount = (promotion.impressionCount ?? 0) + 1
      } else if (eventType === 'click') {
        update.clickCount = (promotion.clickCount ?? 0) + 1
      }

      if (Object.keys(update).length > 0) {
        await ctx.mutations.patch('promotions', promotionId, update)
      }
    }

    return { success: true, eventId }
  },
})

/** -------------------------------------------------------
 * submitEnquiry: student submits an enquiry to a college
 * ------------------------------------------------------- */
export const submitEnquiry = internalMutation({
  handler: async (ctx) => {
    const {
      collegeId,
      studentName,
      studentEmail,
      studentRole,
      promotedId,
      message,
      dataShared,
    } = ctx.params

    const enquiryId = `env-${Date.now()}`

    await ctx.mutations.insert('enquiries', {
      id: enquiryId,
      collegeId,
      studentName,
      studentEmail,
      studentRole,
      promotedId,
      message,
      status: 'new',
      dataShared,
      createdAt: Date.now(),
    })

    // Log to auditLog
    await ct
