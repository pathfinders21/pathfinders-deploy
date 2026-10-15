/**
 * The rules the in-browser analysis must not break.
 *
 * This engine exists because there is often no server to ask (the published build is a
 * static site). It mirrors `worker/lib/assessment.ts` and `worker/lib/demo.ts`, so these
 * tests pin the two rules that decide whether a result is honest at all (the readiness
 * gate, and the evidenced to self reported downgrade) plus the promise that it never
 * claims to be the model and never touches the network.
 */
import { describe, expect, it } from 'vitest';
import { EVIDENCE_MIN_CHARS, localAssessment, localReadiness } from './localAssessment.ts';

const READY_INPUT = {
  goalText: 'Move from frontend work into backend engineering on payments systems',
  skillsHave: ['TypeScript', 'React', 'SQL'],
  skillsWant: ['Kafka'],
  hoursPerWeek: '6',
  projectText: '',
};

/** Longer than the evidence minimum, so a skill can actually be shown in use. */
const REAL_WORK = 'I built a payments reconciliation service with a queue, and made retrying a failed charge safe.';

describe('the in-browser assessment', () => {
  it('answers a thin input with what is missing rather than inventing findings', () => {
    const result = localAssessment({
      goalText: 'Backend',
      skillsHave: [],
      skillsWant: [],
      hoursPerWeek: '',
      projectText: '',
    });

    expect(result.needsMoreInfo).toBe(true);
    expect(result.assessment ?? null).toBeNull();
    expect(result.missing).toEqual([
      'the direction or role you are aiming at, in your own words',
      'a few things you can already do, or a description of something you have built',
    ]);
    expect(result.improvements?.length).toBeGreaterThan(0);
  });

  it('demotes an evidenced finding when no real work is described, and caps its confidence', () => {
    // Just under the evidence minimum: enough to look like work, not enough to show a
    // skill in use. The same rule the server enforces has to apply here.
    const short = localAssessment({ ...READY_INPUT, projectText: 'I built a small billing script.' });
    const shortAssessment = short.assessment!;

    expect('I built a small billing script.'.length).toBeLessThan(EVIDENCE_MIN_CHARS);
    expect(shortAssessment.downgraded).toBe(shortAssessment.strengths.length);
    expect(shortAssessment.strengths.every((finding) => finding.source === 'self_reported')).toBe(true);
    expect(shortAssessment.strengths.every((finding) => finding.confidence <= 0.4)).toBe(true);
    expect(shortAssessment.strengths[0]!.evidence).toMatch(/rests on your own report/);
    // Nothing described real work, so the result is labelled provisional.
    expect(shortAssessment.provisional).toBe(true);
  });

  it('keeps findings evidenced when real work is described, with the time commitment given', () => {
    const result = localAssessment({ ...READY_INPUT, projectText: REAL_WORK });
    const assessment = result.assessment!;

    expect(assessment.downgraded).toBe(0);
    expect(assessment.strengths.every((finding) => finding.source === 'evidenced')).toBe(true);
    expect(assessment.provisional).toBe(false);
    expect(localReadiness({ ...READY_INPUT, projectText: REAL_WORK }).ready).toBe(true);
  });

  it('never reports something held as also missing, and lists only what was asked for', () => {
    const result = localAssessment({ ...READY_INPUT, skillsWant: ['SQL', 'Kafka'] });
    const assessment = result.assessment!;

    expect(assessment.gaps.map((gap) => gap.skill)).toEqual(['Kafka']);
    expect(assessment.strengths.map((finding) => finding.skill)).toEqual(['TypeScript', 'React', 'SQL']);
  });

  it('is labelled the demo engine, computed in the browser, and stored nowhere', () => {
    const result = localAssessment({ ...READY_INPUT, projectText: REAL_WORK });
    const assessment = result.assessment!;

    expect(assessment.engine).toBe('demo');
    expect(assessment.targetRole).toBe(READY_INPUT.goalText);
    expect(assessment.summary).toMatch(/demo engine/i);
    expect(result.note).toMatch(/in your browser/i);
    expect(result.note).toMatch(/nothing was saved/i);
    expect(result.cached).toBe(false);
    expect(result.history).toEqual([]);
  });
});
