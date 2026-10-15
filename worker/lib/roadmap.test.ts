import { describe, expect, it } from 'vitest'
import { InputShapeError, stats, validatePlan, type RoadmapStep } from './roadmap'

/**
 * Progress and plan validation are both pure, so they are tested directly.
 * The database half (generation, regeneration, preservation) is verified against
 * `wrangler dev` with a real D1: see PROGRESS.md.
 */

let counter = 0
const step = (over: Partial<RoadmapStep> = {}): RoadmapStep => {
  counter++
  return {
    id: `s-${counter}`,
    parentId: null,
    position: counter,
    title: 'A task',
    detail: '',
    status: 'pending',
    kind: 'task',
    origin: 'ai',
    aiGenerated: true,
    source: 'ai',
    estimate: '',
    deadline: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastTouchedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const NOW = Date.parse('2026-03-01T00:00:00.000Z')

describe('stats: progress is computed from rows', () => {
  it('counts tasks, not milestones', () => {
    const task = step()
    const milestone = step({ kind: 'milestone', parentId: null })
    const result = stats([milestone, task], NOW)
    expect(result.total).toBe(1)
    expect(result.milestones).toBe(1)
  })

  it('derives milestone completion from its children', () => {
    const milestone = step({ kind: 'milestone' })
    const doneChild = step({ parentId: milestone.id, status: 'done' })
    const openChild = step({ parentId: milestone.id, status: 'pending' })

    expect(stats([milestone, doneChild, openChild], NOW).milestonesDone).toBe(0)
    openChild.status = 'done'
    expect(stats([milestone, doneChild, openChild], NOW).milestonesDone).toBe(1)
  })

  it('reports 0% for an empty roadmap rather than NaN', () => {
    expect(stats([], NOW).percent).toBe(0)
  })

  it('counts overdue only where a real deadline has passed', () => {
    const past = step({ deadline: '2026-02-01T00:00:00.000Z' })
    const future = step({ deadline: '2026-04-01T00:00:00.000Z' })
    const noDeadline = step()
    const finishedLate = step({ deadline: '2026-02-01T00:00:00.000Z', status: 'done' })

    const result = stats([past, future, noDeadline, finishedLate], NOW)
    expect(result.overdue).toBe(1)
    expect(result.nextDeadline).toBe('2026-04-01T00:00:00.000Z')
  })
})

describe('validatePlan: a confirmed plan is re-checked before it is written', () => {
  const valid = {
    title: 'Path',
    rationale: 'Because.',
    milestones: [
      {
        title: 'First',
        why: 'Start small.',
        tasks: [{ title: 'Do a thing', detail: 'It is done when it runs.', estimate: '1 hour' }],
      },
      { title: 'Second', why: '', tasks: [{ title: 'Then another', detail: '...' }] },
    ],
  }

  it('accepts a well-formed plan', () => {
    const plan = validatePlan(valid)
    expect(plan.milestones).toHaveLength(2)
    expect(plan.milestones[0]!.tasks[0]!.title).toBe('Do a thing')
  })

  it('rejects a plan that is missing its milestones', () => {
    expect(() => validatePlan({ title: 'Path', rationale: 'x' })).toThrow(InputShapeError)
  })

  it('rejects a milestone with no tasks', () => {
    expect(() => validatePlan({ ...valid, milestones: [{ title: 'Empty', tasks: [] }] })).toThrow(InputShapeError)
  })

  it('rejects a task whose detail is the wrong type', () => {
    expect(() =>
      validatePlan({ ...valid, milestones: [{ title: 'X', tasks: [{ title: 'Y', detail: 12 }] }] }),
    ).toThrow(/not valid/)
  })

  it('caps the plan at six milestones', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `M${i}`,
      why: '',
      tasks: [{ title: 'T', detail: 'D' }],
    }))
    expect(validatePlan({ ...valid, milestones: many }).milestones).toHaveLength(6)
  })

  it('truncates an over-long field instead of storing it', () => {
    const plan = validatePlan({ ...valid, title: 'x'.repeat(500) })
    expect(plan.title.length).toBe(160)
  })
})
