import React from 'react'
import { Check } from 'lucide-react'

/** Plan feature flags */
type PlanFeature = {
  id: string
  name: string
  tier: 'free' | 'premium'
  price: string // display price
  features: string[]
  monthlyAiCredits: number
  timeAccessMinutes: number
  mentorSessions: number
  promotionListings: number
  recurring: boolean
  trialDays: number
}

/** Mock plans data - in production, these would come from the pricingConfig */
const FREE_PLAN: PlanFeature = {
  id: 'free',
  name: 'Free',
  tier: 'free',
  price: 'Free',
  features: [
    'Basic AI roadmap generation',
    '3 mentor matching requests per month',
    'Community problem board access',
  ],
  monthlyAiCredits: 0,
  timeAccessMinutes: 0,
  mentorSessions: 0,
  promotionListings: 0,
  recurring: false,
  trialDays: 0,
}

const PREMIUM_PLAN: PlanFeature = {
  id: 'premium',
  name: 'Premium',
  tier: 'premium',
  price: '₹499/month',
  features: [
    'Unlimited AI roadmap generation',
    'Unlimited mentor matching requests',
    'Priority community problem board',
    'Monthly AI credit grant',
    '1 hour time-based AI access per month',
    '1 mentorship session per month',
    'Featured promotion listing',
  ],
  monthlyAiCredits: 10,
  timeAccessMinutes: 60,
  mentorSessions: 1,
  promotionListings: 1,
  recurring: true,
  trialDays: 7,
}

export const PlansPage: React.FC = () => {
  return (
    <div className="min-h-screen pt-28 pb-16 px-6 max-w-7xl mx-auto text-white">
      <div className="flex flex-row gap-8">
        <h2 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-4xl sm:text-5xl text-white font-normal">
          Choose Your Plan
        </h2>
        <p className="text-white/60 text-sm mb-2">
          Select a plan that fits your needs and goals.
        </p>

        {/* Free Plan Card */}
        <div
          className={`p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/30 transition-all cursor-pointer`}
        >
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-4">
            <span className="text-3xl">F</span>
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Free</h3>
          <p className="text-white/60 text-sm">Get started at no cost</p>
          <ul className="text-xs text-white/50 space-y-1">
            {FREE_PLAN.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="text-emerald-400 text-xs mt-0.5"><Check className="w-2.5 h-2.5" /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="text-white/50">
            <span className="text-white font-medium">₹0/month</span>
            <span className="text-white/40 text-xs">· No recurring billing</span>
          </div>
        </div>

        {/* Premium Plan Card */}
        <div
          className={`p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/30 transition-all cursor-pointer`}
        >
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-4">
            <span className="text-3xl">P</span>
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Premium</h3>
          <p className="text-white/60 text-sm">Full access to PathFinders</p>
          <ul className="text-xs text-white/50 space-y-1">
            {PREMIUM_PLAN.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="text-emerald-400 text-xs mt-0.5"><Check className="w-2.5 h-2.5" /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="text-white/50">
            <span className="text-white font-medium">₹499/month</span>
            <span className="text-white/40 text-xs">· Recurring billing</span>
          </div>
          <div className="text-xs text-white/50">
            7-day free trial
          </div>
        </div>
      </div>

      {/* Plan comparison metrics only (no plan duplication) */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <h3 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-base uppercase tracking-wider text-white/50 mb-4">Features Comparison</h3>
          <ul className="space-y-2 text-white/60 text-sm">
            <li>GST: 18% on all purchases</li>
            <li>Processing charge: ₹5.00 per transaction</li>
            <li>Recurring plans auto-renew</li>
            <li>One-time purchases never recur</li>
            <li>Refunds available per policy</li>
          </ul>
        </div>
        <div key="comparison-col-2" />
        <div key="comparison-col-3" />
      </div>
    </div>
  )
}
