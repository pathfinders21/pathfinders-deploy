import { describe, it, expect } from 'vitest';
import { VERIFICATION_LABEL, VERIFICATION_TONE, VERIFICATION_NOTE } from './verification.ts';

describe('verification labels', () => {
  it('covers every status with its own label', () => {
    expect(Object.keys(VERIFICATION_LABEL).sort()).toEqual(['pending', 'unverified', 'verified']);
    expect(new Set(Object.values(VERIFICATION_LABEL)).size).toBe(3);
  });

  it('covers every status with its own tone', () => {
    expect(Object.keys(VERIFICATION_TONE).sort()).toEqual(['pending', 'unverified', 'verified']);
  });

  it('never describes verification as an affiliation or an endorsement of skill', () => {
    expect(VERIFICATION_NOTE).toMatch(/not an academic affiliation/i);
    for (const label of Object.values(VERIFICATION_LABEL)) {
      expect(label).not.toMatch(/university|alumni|certified|endorsed/i);
    }
  });

  it('does not present an unreviewed status as a positive claim', () => {
    expect(VERIFICATION_LABEL.unverified).toMatch(/not yet/i);
    expect(VERIFICATION_LABEL.pending).toMatch(/pending/i);
  });
});
