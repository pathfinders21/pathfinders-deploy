import { describe, expect, it } from 'vitest'
import { StubDb, asD1 } from './test-db'
import { MAX_MESSAGE_BODY, listThreads, markThreadRead, sendMessage, validateBody } from './messaging'

/**
 * Messaging is the module where a mistake leaks one student's words to another,
 * so these tests are about the boundaries rather than the happy path: who can
 * read a thread, who can write to it, and who the recipient is when two people
 * share it.
 */

function fixture() {
  const db = new StubDb()
  db.profiles.push(
    { user_id: 'mentee-1', display_name: 'Sam Student', education: '{}' },
    { user_id: 'mentor-1', display_name: 'Rae Mentor', education: '{}' },
    { user_id: 'mentor-2', display_name: 'Other Mentor', education: '{}' },
  )
  db.requests.push(
    {
      id: 'req-accepted', mentee_id: 'mentee-1', mentor_id: 'mentor-1', goal_id: 'goal-1',
      status: 'accepted', message: 'hi', created_at: '2026-02-01T10:00:00.000Z', updated_at: '2026-02-02T10:00:00.000Z',
    },
    {
      id: 'req-pending', mentee_id: 'mentee-1', mentor_id: 'mentor-2', goal_id: null,
      status: 'pending', message: 'hi', created_at: '2026-02-03T10:00:00.000Z', updated_at: '2026-02-03T10:00:00.000Z',
    },
  )
  db.goals.push({ id: 'goal-1', title: 'Land a backend internship' })
  return db
}

describe('messaging authorisation', () => {
  it('404s an unknown mentorship', async () => {
    const db = fixture()
    await expect(sendMessage(asD1(db), 'mentor-1', 'nope', 'hello')).rejects.toThrow(/No such mentorship request/)
  })

  it('refuses a thread whose request is not accepted', async () => {
    const db = fixture()
    await expect(sendMessage(asD1(db), 'mentor-2', 'req-pending', 'hello')).rejects.toThrow(/opens once the mentor accepts/)
  })

  it('refuses an outsider, and tells them nothing about the thread', async () => {
    const db = fixture()
    await expect(sendMessage(asD1(db), 'mentor-2', 'req-accepted', 'hello')).rejects.toThrow(/not part of this mentorship/)
    await expect(markThreadRead(asD1(db), 'mentor-2', 'req-accepted')).rejects.toThrow(/not part of this mentorship/)
  })

  it('addresses the other participant, never a client-supplied id', async () => {
    const db = fixture()
    await sendMessage(asD1(db), 'mentee-1', 'req-accepted', 'hello from the student')
    await sendMessage(asD1(db), 'mentor-1', 'req-accepted', 'hello from the mentor')
    expect(db.messages.map((m) => [m.sender_id, m.recipient_id])).toEqual([
      ['mentee-1', 'mentor-1'],
      ['mentor-1', 'mentee-1'],
    ])
  })

  it('lists the thread to both participants, with unread counted per recipient', async () => {
    const db = fixture()
    await sendMessage(asD1(db), 'mentee-1', 'req-accepted', 'first')
    await sendMessage(asD1(db), 'mentor-1', 'req-accepted', 'reply')

    const forMentee = await listThreads(asD1(db), 'mentee-1')
    expect(forMentee).toHaveLength(1)
    expect(forMentee[0].counterpart).toEqual({ id: 'mentor-1', name: 'Rae Mentor', role: 'mentor' })
    expect(forMentee[0].goalTitle).toBe('Land a backend internship')
    expect(forMentee[0].unread).toBe(1)
    expect(forMentee[0].messages.map((m) => m.mine)).toEqual([true, false])

    const forMentor = await listThreads(asD1(db), 'mentor-1')
    expect(forMentor[0].unread).toBe(1)
    expect(forMentor[0].counterpart.role).toBe('mentee')
  })

  it('does not show a thread to a mentor whose request was never accepted', async () => {
    const db = fixture()
    expect(await listThreads(asD1(db), 'mentor-2')).toHaveLength(0)
  })

  it('marks read only the messages addressed to the caller', async () => {
    const db = fixture()
    await sendMessage(asD1(db), 'mentee-1', 'req-accepted', 'first')
    await sendMessage(asD1(db), 'mentor-1', 'req-accepted', 'reply')

    const marked = await markThreadRead(asD1(db), 'mentee-1', 'req-accepted')
    expect(marked).toBe(1)
    // The mentee's own outgoing message must stay unread for the mentor.
    expect(db.messages.filter((m) => !m.read_at)).toHaveLength(1)
    expect((await listThreads(asD1(db), 'mentor-1'))[0].unread).toBe(1)
  })
})

describe('message validation', () => {
  it('rejects empty and oversized bodies', () => {
    expect(() => validateBody('   ')).toThrow(/Write a message/)
    expect(() => validateBody(42)).toThrow(/Write a message/)
    expect(() => validateBody('x'.repeat(MAX_MESSAGE_BODY + 1))).toThrow(/under/)
    expect(validateBody('  trimmed  ')).toBe('trimmed')
  })
})
