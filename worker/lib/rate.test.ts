import { describe, expect, it } from 'vitest'
import { ACTION_LIMITS, enforceActionLimit } from './rate'
import { StubDb, asD1 } from './test-db'

describe('action limits', () => {
  it('allows up to the limit and then refuses with a 429 that names the action', async () => {
    const db = new StubDb()
    const { limit } = ACTION_LIMITS['message.send']
    for (let i = 0; i < limit; i++) await enforceActionLimit(asD1(db), 'user-1', 'message.send')
    expect(db.actions).toHaveLength(limit)

    await expect(enforceActionLimit(asD1(db), 'user-1', 'message.send')).rejects.toMatchObject({
      status: 429,
    })
    await expect(enforceActionLimit(asD1(db), 'user-1', 'message.send')).rejects.toThrow(/messages in the last/)
  })

  it('counts per user and per action, so one bucket cannot block another', async () => {
    const db = new StubDb()
    for (let i = 0; i < ACTION_LIMITS['request.create'].limit; i++) {
      await enforceActionLimit(asD1(db), 'user-1', 'request.create')
    }
    await expect(enforceActionLimit(asD1(db), 'user-1', 'request.create')).rejects.toThrow()
    // A different user and a different action are unaffected.
    await expect(enforceActionLimit(asD1(db), 'user-2', 'request.create')).resolves.toBeUndefined()
    await expect(enforceActionLimit(asD1(db), 'user-1', 'message.send')).resolves.toBeUndefined()
  })

  it('ignores events older than the window', async () => {
    const db = new StubDb()
    const { limit, windowMs } = ACTION_LIMITS['request.create']
    const longAgo = new Date(Date.now() - windowMs - 60_000).toISOString()
    for (let i = 0; i < limit; i++) {
      db.actions.push({ id: `old-${i}`, user_id: 'user-1', action: 'request.create', created_at: longAgo })
    }
    await expect(enforceActionLimit(asD1(db), 'user-1', 'request.create')).resolves.toBeUndefined()
  })

  it('prunes its own stale rows so the table stays bounded', async () => {
    const db = new StubDb()
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    db.actions.push({ id: 'stale', user_id: 'user-1', action: 'request.create', created_at: stale })
    await enforceActionLimit(asD1(db), 'user-1', 'request.create')
    expect(db.actions.map((a) => a.id)).not.toContain('stale')
  })
})
