import type { MentorVerification } from '../types.ts';

/**
 * What a mentor's verification status means, in one place so no screen can quietly
 * dress it up. Verification is the review state of evidence a mentor submitted. It is
 * never an academic affiliation, and it says nothing about seniority.
 */
export const VERIFICATION_LABEL: Record<MentorVerification, string> = {
  verified: 'Verified',
  pending: 'Review pending',
  unverified: 'Not yet verified',
};

export const VERIFICATION_TONE: Record<MentorVerification, string> = {
  verified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  unverified: 'bg-white/5 text-white/50 border-white/15',
};

export const VERIFICATION_NOTE =
  'Verification reflects the review state of the evidence a mentor submitted. It is not an academic affiliation, and it does not rank teaching ability.';

export const VERIFICATION_SHORT = 'Evidence reviewed by a moderator. Shown on every profile.';
