import { describe, it, expect } from 'vitest';
import { meetingRoomName, meetingRoomUrl } from './meeting.ts';

describe('meeting rooms', () => {
  it('gives the same room to everyone who shares a session id', () => {
    expect(meetingRoomUrl('sess-alex')).toBe(meetingRoomUrl('sess-alex'));
  });

  it('keeps different sessions in different rooms', () => {
    expect(meetingRoomUrl('sess-alex')).not.toBe(meetingRoomUrl('sess-liam'));
  });

  it('produces a URL safe room name from any session id', () => {
    expect(meetingRoomName('sess-alex')).toBe('PathFindersSessAlexRoom');
    expect(meetingRoomName('  sess/elena  ')).toBe('PathFindersSessElenaRoom');
    expect(meetingRoomName('sess elena')).toBe('PathFindersSessElenaRoom');
    expect(meetingRoomUrl('sess-elena')).toMatch(/^https:\/\/meet\.jit\.si\/[A-Za-z0-9]+$/);
  });

  it('never returns a bare base URL that would drop you in a shared room', () => {
    expect(meetingRoomName('')).toBe('PathFindersSessionRoom');
    expect(meetingRoomUrl('')).toMatch(/PathFindersSessionRoom$/);
  });
});
