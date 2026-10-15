/**
 * Where a session's video room lives.
 *
 * This build has no conferencing account, no API key and no backend to mint a room,
 * so sessions use a stable public room URL derived from the session id: anyone who
 * opens the same link lands in the same room, which is exactly what two people who
 * agreed on a session need. A deployment that buys a conferencing provider replaces
 * this one function and nothing else.
 */
const ROOM_BASE = 'https://meet.jit.si';

/** Session ids are ours, so a room name is stable for the life of the session. */
export const meetingRoomName = (sessionId: string): string => {
  const safe = sessionId
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `PathFinders${safe || 'Session'}Room`;
};

export const meetingRoomUrl = (sessionId: string): string =>
  `${ROOM_BASE}/${meetingRoomName(sessionId)}`;
