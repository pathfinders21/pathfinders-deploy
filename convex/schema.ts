// Monetisation & role system for PathFinders

// Role types for access control
export type UserRole = 'user' | 'mentor' | 'college' | 'admin'

// ============================================================
// pricingConfig - admin-editable pricing configuration
// ============================================================
export type PricingTier = 'free' | 'premium' | 'ai_credit' | 'time_pass' | 'mentorship' | 'promotion'

export interface PricingConfig {
  // GST rate percentage (e.g., 18 for 18%)
  gstRate: number
  // Processing charge in paise per transaction (e.g., 500 = ₹5.00)
  processingChargePaise: number
  // Default free monthly AI credit grant (in paise value equivalent)
  freeMonthlyGrantPaise: number
  // Credit pack denominations: id -> {paise, name, credits}
  creditPacks: Record<string, { paise: number; credits: number; name: string }>
  // Time pass prices: id -> { paise, durationMinutes, name }
  timePassPrices: Record<string, { paise: number; durationMinutes: number; name: string }>
  // Platform commission percentage for mentor payouts
  platformCommissionPct: number
  // AdSense client ID (empty if not configured)
  adsenseClientId: string
}

// Default pricing config - stored as a doc in the pricingConfig table
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  gstRate: 18,
  processingChargePaise: 500,
  freeMonthlyGrantPaise: 10000, // ₹100 equivalent free grant
  creditPacks: {
    'pack-10': { paise: 5000, credits: 10, name: '10 AI Credits' },
    'pack-25': { paise: 10000, credits: 25, name: '25 AI Credits' },
    'pack-50': { paise: 18000, credits: 50, name: '50 AI Credits' },
  },
  timePassPrices: {
    'time-15': { paise: 1000, durationMinutes: 15, name: '15 min AI Access' },
    'time-30': { paise: 1500, durationMinutes: 30, name: '30 min AI Access' },
    'time-60': { paise: 2500, durationMinutes: 60, name: '1 hour AI Access' },
  },
  platformCommissionPct: 20,
  adsenseClientId: '',
}

// ============================================================
// plans - subscription plans (Free, Premium, etc.)
// ============================================================
export interface Plan {
  id: string
  name: string
  tier: 'free' | 'premium'
  // Features enabled for this plan
  features: string[]
  // AI credits per month (0 = unlimited/no limit, or specific number)
  monthlyAiCredits: number
  // Time-based access minutes per month (0 = none)
  timeAccessMinutes: number
  // Mentorship session credits per month
  mentorSessions: number
  // Promotion listing allowance per month
  promotionListings: number
  // Price in paise (0 for free)
  pricePaise: number
  // Whether plan is recurring (subscription) or one-time
  recurring: boolean
  // Trial period in days (0 = no trial)
  trialDays: number
}

// ============================================================
// subscriptions - user subscription records
// ============================================================
export interface Subscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'canceled' | 'expired' | 'past_due'
  startedAt: number
  currentPeriodEnd: number
  canceledAt?: number
  // For recurring: auto-renewal flag
  autoRenew: boolean
}

// ============================================================
// timePasses - time-based AI access (15 min / 30 min / 1 hour)
// ============================================================
export interface TimePass {
  id: string
  userId: string
  planId?: string // which plan granted this
  durationMinutes: number
  status: 'unused' | 'active' | 'expired'
  startedAt?: number
  expiresAt?: number
  // How many times already activated (should be 0 or 1)
  activationCount: number
}

// ============================================================
// creditWallets - user AI credit balances
// ============================================================
export interface CreditWallet {
  id: string
  userId: string
  balance: number // in credits (not paise)
  lastResetAt: number // timestamp of last monthly reset
  // For tracking: month that the current balance belongs to
  currentMonth: number
}

// ============================================================
// creditLedger - append-only ledger of credit transactions
// ============================================================
export interface CreditLedgerEntry {
  id: string
  userId: string
  type: 'monthly_grant' | 'topup' | 'usage' | 'refund' | 'reset'
  amount: number // in credits (positive = added, negative = usage)
  balanceAfter: number
  description?: string
  createdAt: number
}

// ============================================================
// orders - Razorpay orders (one per checkout attempt)
// ============================================================
export interface Order {
  id: string
  userId: string
  razorpayOrderId: string // indexed
  planId?: string
  timePassId?: string
  mentorSessionId?: string
  promotionId?: string
  amount: number // in paise
  currency: 'INR'
  status: 'created' | 'paid' | 'failed'
  paymentId?: string
  attemptedAt: number
  // Breakdown subtotal + gst + processing
  subtotalPaise: number
  gstPaise: number
  processingChargePaise: number
}

// ============================================================
// payments - Razorpay payment records (one per successful payment)
// ============================================================
export interface Payment {
  id: string
  userId: string
  razorpayPaymentId: string // indexed
  razorpayOrderId: string
  amount: number // in paise
  currency: 'INR'
  status: 'captured' | 'failed'
  // Link to what was purchased
  orderId: string // references orders collection
  // Entitlement granted
  grantType: 'subscription' | 'time_pass' | 'credit_topup' | 'mentorship_session' | 'promotion'
  grantId: string // references the granted entity
  capturedAt: number
  // Refund status
  refunded: boolean
  refundId?: string
}

// ============================================================
// refunds - refund records
// ============================================================
export interface Refund {
  id: string
  paymentId: string // references payments collection
  amount: number // in paise
  reason: string
  status: 'processed' | 'failed' | 'pending'
  razorpayRefundId?: string
  processedAt?: number
}

// ============================================================
// webhookEvents - webhook event tracking (dedupe)
// ============================================================
export interface WebhookEvent {
  id: string // razorpay event ID - indexed
  userId: string
  event: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'order.created'
  payload: string // raw body or key fields
  processedAt: number
}

// ============================================================
// mentorProfiles - extended mentor profiles
// ============================================================
export interface MentorProfile {
  id: string // userId
  userId: string
  // Additional mentor fields
  hourlyRate: number // in paise
  availability: string[] // weekly time slots
  totalSessions: number
  totalEarnings: number // in paise
  commissionRate: number // platform commission %
  rating: number
  reviewCount: number
  isAvailable: boolean
  verificationStatus: 'verified' | 'pending' | 'unverified'
}

// ============================================================
// mentorSessions - booked mentor sessions
// ============================================================
export interface MentorSession {
  id: string
  mentorId: string
  menteeId: string
  topic: string
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'
  bookedAt: number
  startTime: number // Date.now() when session starts
  endTime?: number
  // Payment tracking
  orderId: string // references orders
  paymentId: string // references payments
  // Commission tracking
  platformCommission: number // in paise
  menteePayment: number // in paise
}

// ============================================================
// collegeProfiles - college registration & verification
// ==============

// ============================================================
// collegeProfiles - college registration & verification
// ============================================================
export interface CollegeProfile {
  id: string // userId or college ID
  userId: string
  collegeName: string
  officialEmailDomain: string
  verificationStatus: 'draft' | 'pending_review' | 'approved' | 'rejected'
  documentUrl?: string // uploaded document proof
  approvedAt?: number
  // Promotion settings
  allowPromotions: boolean
}

// ============================================================
// promotions - college promotion campaigns
// ============================================================
export interface Promotion {
  id: string
  collegeId: string // references collegeProfiles
  title: string
  type: 'admissions' | 'courses' | 'scholarships' | 'events' | 'hackathons' | 'placement_drives' | 'campus_opportunities'
  // Placement specific
  placementType: 'sponsored' | 'featured' | null
  description: string
  // Pricing
  pricePaise: number
  // Campaign dates
  startDate: number
  endDate: number
  // Status flow: draft -> pending_review -> approved -> live -> ended / rejected
  status: 'draft' | 'pending_review' | 'approved' | 'live' | 'ended' | 'rejected'
  // Razorpay payment link
  razorpayOrderId?: string
  razorpayPaymentId?: string
  // Tracking
  impressionCount: number
  clickCount: number
}

// ============================================================
// promotionEvents - impression/click tracking (dedupe per session)
// ============================================================
export interface PromotionEvent {
  id: string // unique event ID
  promotionId: string // references promotions
  userId?: string // visitor ID (anonymous or authenticated)
  eventType: 'impression' | 'click'
  sessionId: string // deduplication session ID
  // Bot detection
  isBot: boolean
  createdAt: number
}

// ============================================================
// enquiries - student enquiries to colleges
// ============================================================
export interface Enquiry {
  id: string
  collegeId: string // references collegeProfiles
  studentName: string
  studentEmail: string
  studentRole: 'mentee' | 'mentor' | 'other'
  promotedId?: string // which promotion they enquired about
  message: string
  status: 'new' | 'read' | 'replied' | 'closed'
  createdAt: number
  // What data was shared (per rule 8)
  dataShared: 'name_email' | 'name_email_goals' | 'full_profile' | 'none'
}

// ============================================================
// auditLog - admin and payment actions logging (expanded)
// ============================================================
export interface AuditLogEntry {
  id: string
  adminId: string // who performed the action
  action: string // what was done
  targetType: 'order' | 'payment' | 'refund' | 'subscription' | 'time_pass' | 'credit' | 'promotion' | 'user' | 'college'
  targetId: string
  details: string
  createdAt: number
}
