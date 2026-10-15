import React from 'react'
import { CheckCircle } from 'lucide-react'
import { InputHTMLAttributes } from 'react'

interface PriceBreakdown {
  subtotal: number // in paise
  gst: number // in paise
  processing: number // in paise
  total: number // in paise
}

interface CheckoutSummaryProps {
  /** The tier or customAmount driving the pricing */
  tier?: string
  customAmount?: number
  /** Callbacks */
  onProceed: () => void
  /** Optional Razorpay order ID if already created */
  razorpayOrderId?: string
  /** If true, show as "already purchased" state */
  purchased?: boolean
  /** Price breakdown - computed server-side */
  breakdown?: {
    subtotal: number
    gst: number
    processing: number
    total: number
    gstRate: number
    processingCharge: number
  }
  /** GST rate for display */
  gstRate?: number
}

/** Format paise (₹ paise) to display string like "₹100.00" */
const formatPaise = (paise: number): string => {
  const rupees = (paise / 100).toFixed(2)
  return `₹${rupees}`
}

/** Format as percentage of GST */
const formatGstRate = (gstRate: number): string => {
  return `${gstRate}%`
}

export const CheckoutSummary: React.FC<CheckoutSummaryProps> = ({
  tier,
  customAmount,
  onProceed,
  razorpayOrderId,
  purchased = false,
  breakdown,
  gstRate = 18,
}) => {
  // If already purchased, show different UI
  if (purchased) {
    return (
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 text-white">
        <div className="flex items-center gap-2 text-sm text-white/60 mb-4">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Access granted</span>
        </div>
        <p className="text-white/70 text-sm">
          Your purchase is complete. You now have access to the purchased content.
        </p>
      </div>
    )
  }

  // Determine base price based on tier
  let basePrice = 0
  let timePassName = '15 min AI Access'

  if (customAmount !== undefined) {
    basePrice = customAmount
  } else if (tier === 'time_pass') {
    basePrice = 1000 // default 15 min
    timePassName = '15 min AI Access'
  } else if (tier === 'mentorship') {
    basePrice = 5000 // default ₹50
    timePassName = 'Mentorship Session'
  } else if (tier === 'promotion') {
    basePrice = 1000 // default ₹10
    timePassName = 'Promotion Campaign'
  }

  // Use provided breakdown or compute defaults
  const subtotal = breakdown?.subtotal ?? basePrice
  const processingCharge = breakdown?.processingCharge ?? 500
  const gst = breakdown?.gst ?? Math.round(basePrice * (gstRate / 100))
  const total = breakdown?.total ?? subtotal + gst + processingCharge

  return (
    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 max-w-md">
      {/* Breakdown Section */}
      <div className="space-y-4 mb-6">
        {/* Base price */}
        <div className="flex justify-between text-sm text-white/60 mb-2">
          <span>Base Price</span>
          <span>{formatPaise(basePrice)}</span>
        </div>

        {/* GST */}
        <div className="flex justify-between text-sm text-white/60 mb-2">
          <span>GST ({formatGstRate(gstRate)})</span>
          <span>{formatPaise(gst)}</span>
        </div>

        {/* Processing charge */}
        <div className="flex justify-between text-sm text-white/60 mb-2">
          <span>Processing Charge</span>
          <span>{formatPaise(processingCharge)}</span>
        </div>

        {/* Total - highlighted */}
        <div className="flex justify-between font-medium text-white pt-2 border-t border-white/10">
          <span>Total Payable</span>
          <span>{formatPaise(total)}</span>
        </div>
      </div>

      {/* Policies / Terms */}
      <div className="text-xs text-white/50 space-y-2">
        <p>
          Total payable exactly equals Razorpay order amount. Recurring billing is never enabled
          without explicit consent; default is one-time purchase.
        </p>
        <p>
          Access duration: {timePassName}. Time passes are separate from AI credits.
        </p>
      </div>

      {/* Pay Button */}
      <div className="mt-6">
        <button
          onClick={onProceed}
          disabled={!!!razorpayOrderId}
          className={`liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white hover:scale-[1.02] transition-transform cursor-pointer flex items-center gap-2 ${!!!razorpayOrderId ? 'opacity-40 cursor-not-allowed' : ''}`}>
          {razorpayOrderId ? ('Pay ₹' + (total / 100).toFixed(2)) : 'Pay Now'}
          <span className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
