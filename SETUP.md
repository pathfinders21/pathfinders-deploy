# PathFinders Monetisation System - Setup Guide

## Required Environment Variables

Add the following to your `.env` file or Convex/Vite environment:

### Razorpay Payment Integration
- `RAZORPAY_KEY_ID`: Razorpay Key ID (public)
- `RAZORPAY_KEY_SECRET`: Razorpay Key Secret (KEEP THIS SECRET! server-side only)
- `RAZORPAY_WEBHOOK_SECRET`: Razorpay Webhook Signing Secret

### Google AdSense
- `VITE_ADSENSE_CLIENT_ID`: AdSense publisher client ID (can be empty if not using ads)

### Pricing Configuration (admin-editable via Convex)
These are stored in the `pricingConfig` table and have defaults:
- `GST_RATE`: GST percentage (default: 18)
- `PROCESSING_CHARGE_PAISE`: Processing charge in paise per transaction (default: 500 = ₹5.00)
- `FREE_MONTHLY_GRANT_PAISE`: Free monthly AI credit grant in paise equivalent (default: 10000 = ₹100)
- `PLATFORM_COMMISSION_PCT`: Platform commission percentage for mentor payouts (default: 20)

### Credit Pack Denominations (configured in pricingConfig)
Default packs are defined in the schema:
- `pack-10`: 10 AI Credits for 500 paise (₹50)
- `pack-25`: 25 AI Credits for 10000 paise (₹100)
- `pack-50`: 50 AI Credits for 18000 paise (₹180)

### Time Pass Prices (configured in pricingConfig)
Default time passes:
- `time-15`: 15 min AI Access for 1000 paise (₹10)
- `time-30`: 30 min AI Access for 1500 paise (₹15)
- `time-60`: 1 hour AI Access for 2500 paise (₹25)

### AdSense Configuration
- `VITE_ADSENSE_CLIENT_ID`: AdSense client ID (optional, empty if not using ads)

## Razorpay Webhook Setup

### Webhook URL
The Convex deployment URL can be obtained by running:
```
npx convex dev
```
or check the Convex dashboard for the deployment URL.

Set the webhook URL to:
```
https://YOUR_CONVEX_SITE_URL/razorpay/webhook
```

### Razorpay Webhook Events to Enable
In the Razorpay dashboard, enable these events for your application:
- `payment.captured` - When a payment is successfully captured
- `payment.failed` - When a payment fails
- `refund.processed` - When a refund is processed

### Webhook Configuration Steps
1. Go to Razorpay Dashboard → Payments → Webhooks
2. Click "Add Webhook"
3. Enter the URL: `https://YOUR_CONVEX_SITE_URL/razorpay/webhook`
4. Select the above events
5. Click "Create"
6. Copy the "Verify Signature" string - this should match `RAZORPAY_KEY_SECRET`

## Cron Jobs

### Monthly AI Credit Grant
A Convex cron job grants free monthly AI credits idempotently per (userId, month).

To set up, add a cron job in your Convex deployment configuration or use the Convex dashboard:

```
Schedule: Monthly on the 1st day of each month
Function: grantMonthlyCredits
Description: Idempotent free monthly AI credit grant
```

The `grantMonthlyCredits` internal mutation is already implemented in `convex/actions.ts` and can be triggered via Convex cron.

### Webhook Processing
The `razorpayWebhook` httpAction handles incoming webhook events from Razorpay. It's automatically triggered when Razorpay sends events to the configured webhook URL.

## Test-Mode Payments

### Running in Test Mode
Razorpay provides test card numbers for development:
- Card Number: `4242 4242 4242 4242`
- Expiry: Any future date
- CVV: Any 3 digits

### Test Scenarios
- **Successful payment**: Use test card details, payment will be captured
- **Failed payment**: Use a card that will fail validation
- **Refunds**: After a successful payment, use the Razorpay dashboard to initiate a refund

### Convex Local Development
1. Run `npx convex dev` to start the local development environment
2. The local Convex instance will use a SQLite database (`.wrangler/state/v3/d1`)
3. Webhooks can be tested using tools like [RequestBin](https://requestbin.com/) or [ngrok](https://ngrok.com/)

### Idempotency
The system is designed to grant entitlements exactly once:
- The `verifyPayment` internal mutation checks if a `paymentId` was already processed
- The webhook deduplication checks `webhookEvents` by `eventId`
- Double submissions or race between client-verify and webhook will result in exactly one grant

## Admin Operations

### Managing Pricing Configuration
The `pricingConfig` table is admin-editable. To modify:
- Use the Convex dashboard or admin tools
- Modify `gstRate`, `processingChargePaise`, `freeMonthlyGrantPaise`, etc.
- Changes affect all subsequent transactions

### College Verification Workflow
1. College registers via `/register-college` route
2. Profile created with `verificationStatus: pending_review`
3. Admin reviews and approves/rejects via `approveCollege` / `rejectCollege` mutations
4. Only approved colleges can create promotions

### Promotion Management
1. College creates a promotion campaign (status: `pending_review`)
2. Admin reviews and approves (status: `approved`) or rejects (status: `rejected`)
3. After payment, promotion goes live (status: `live`)
4. Admin can take down misleading listings or reject promotions

### Audit Log
All admin and payment actions are logged in the `auditLog` table. To view:
- Query the `auditLog` table in the Convex dashboard
- Filter by `action`, `targetType`, or `adminId`
- All actions include `details` and `createdAt` timestamps

## Project Structure Summary

### Convex Functions (convex/actions.ts)
- `createOrder`: Creates Razorpay order with breakdown
- `verifyPayment`: HMAC-SHA256 verification, grants entitlement
- `razorpayWebhook`: Handles webhook events, dedupe
- `activatePass`: Activates time-based AI access
- `topupCredits`: Adds AI credits to wallet
- `useCredits`: Atomically deducts credits for AI calls
- `grantMonthlyCredits`: Convex cron for monthly grant
- `bookMentorSession`: Books a mentorship session
- `confirmMentorSession`: Confirms session after payment
- `cancelMentorSession`: Cancels session with refund
- `registerCollege`: College registration
- `approveCollege` / `rejectCollege`: Admin college management
- `createPromotion` / `approvePromotion` / `rejectPromotion`: Promotion management
- `processPromotionPayment`: Promotion payment processing
- `trackPromotionEvent`: Impression/click tracking
- `submitEnquiry`: Student enquiry to college

### Convex Queries (convex/queries.ts)
- `getPricingConfig`: Gets current pricing config with defaults
- `getEntitlements`: Single source of truth for user access
- `getCheckoutSummary`: Breakdown for display

### Client Components
- `src/components/CheckoutSummary.tsx`: Price breakdown UI
- `src/components/PlansPage.tsx`: Free/Premium plan comparison
- `src/components/AdSense.tsx`: Google AdSense (allowlisted routes only)
- `src/lib/adsense.ts`: AdSense utility functions

## What Still Needs External Action

1. **Razorpay KYC/Live Keys**: Set up Razorpay account, complete KYC, and add live keys
2. **AdSense Site Approval**: Submit site for Google AdSense approval if using ads
3. **Legal Review of GST and Refund Wording**: Have legal team review the GST calculation and refund policy wording
4. **Domain Configuration**: Configure custom domain with Convex and Razorpay
5. **Database Initialization**: Run `npx convex dev` to initialize the D1 database, then populate `pricingConfig` with admin-editable values
6. **SSL/TLS**: Ensure the deployed site has valid HTTPS for Razorpay webhook security
