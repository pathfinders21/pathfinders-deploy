// @vitest-environment jsdom
/**
 * Taking your own writing off the community board.
 *
 * These pin the two things that matter about a delete control on shared content: it only
 * appears on a row the signed in person actually wrote, and it asks once before anything
 * disappears. Ownership is checked by account id, so a bundled sample post that carries
 * the same display name is still not theirs to remove.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommunityProblemBoard } from './CommunityProblemBoard.tsx';
import type { CommunityProblem, UserProfile } from '../types.ts';

const AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

const ME: UserProfile = {
  id: 'u1',
  name: 'Avik',
  email: 'avik@example.com',
  avatar: AVATAR,
  role: 'mentee',
  isOnboarded: true,
};

const MINE = 'My own thread about the queue';

const problem = (overrides: Partial<CommunityProblem> & { id: string }): CommunityProblem => ({
  authorId: 'u1',
  authorName: 'Avik',
  authorAvatar: AVATAR,
  authorRole: 'Software Engineer',
  title: MINE,
  description: 'A description of the problem.',
  domain: 'AI / Machine Learning',
  urgency: 'medium',
  status: 'open',
  createdAt: 'Just now',
  responses: [],
  ...overrides,
});

const renderBoard = (problems: CommunityProblem[], currentUser: UserProfile | null = ME) => {
  const onDeleteProblem = vi.fn();
  const onDeleteResponse = vi.fn();
  render(
    <CommunityProblemBoard
      problems={problems}
      currentUser={currentUser}
      onPostProblem={vi.fn()}
      onAddResponse={vi.fn()}
      onMarkSolved={vi.fn()}
      onDeleteProblem={onDeleteProblem}
      onDeleteResponse={onDeleteResponse}
      onRequireAuth={vi.fn()}
    />,
  );
  return { onDeleteProblem, onDeleteResponse };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('own posts and answers can be deleted', () => {
  it('offers the control on your own post and on nobody else’s', () => {
    renderBoard([problem({ id: 'prob-mine' }), problem({ id: 'prob-theirs', authorId: 'u2', authorName: 'Sarah', title: 'Someone else’s thread' })]);

    const controls = screen.getAllByRole('button', { name: /^Delete your post:/i });
    expect(controls).toHaveLength(1);
    expect(controls[0]!.getAttribute('aria-label')).toBe(`Delete your post: ${MINE}`);
  });

  it('offers nothing at all to a signed out visitor, even on a post that looks like theirs', () => {
    renderBoard([problem({ id: 'prob-mine' })], null);
    expect(screen.queryByRole('button', { name: /delete your post/i })).toBeNull();
  });

  it('asks once before deleting a post, and calls through with that post id', () => {
    const { onDeleteProblem } = renderBoard([problem({ id: 'prob-mine' })]);

    fireEvent.click(screen.getByRole('button', { name: `Delete your post: ${MINE}` }));
    // Nothing has happened yet: the second press is the one that deletes.
    expect(onDeleteProblem).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this post\?/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `Confirm deleting your post: ${MINE}` }));
    expect(onDeleteProblem).toHaveBeenCalledTimes(1);
    expect(onDeleteProblem).toHaveBeenCalledWith('prob-mine');
  });

  it('lets you change your mind, and deletes nothing', () => {
    const { onDeleteProblem } = renderBoard([problem({ id: 'prob-mine' })]);

    fireEvent.click(screen.getByRole('button', { name: `Delete your post: ${MINE}` }));
    fireEvent.click(screen.getByRole('button', { name: `Keep your post: ${MINE}` }));

    expect(onDeleteProblem).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: `Delete your post: ${MINE}` })).toBeTruthy();
  });

  it('lets you delete your own answer, and not an answer that merely carries your name', () => {
    const { onDeleteResponse } = renderBoard([
      problem({
        id: 'prob-thread',
        authorId: 'u2',
        authorName: 'Sarah',
        responses: [
          {
            id: 'resp-mine',
            authorId: 'u1',
            authorName: 'Avik',
            authorRole: 'Software Engineer',
            authorAvatar: AVATAR,
            isMentor: false,
            content: 'My own answer.',
            createdAt: 'Just now',
          },
          {
            // A bundled sample answer: same display name, no account behind it.
            id: 'resp-seeded',
            authorName: 'Avik',
            authorRole: 'Staff Engineer',
            authorAvatar: AVATAR,
            isMentor: true,
            content: 'A sample answer that is not mine.',
            createdAt: '2 hours ago',
          },
        ],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /offer solution \/ view thread/i }));

    // Exactly one answer is deletable, and it is the one written by this account.
    const controls = screen.getAllByRole('button', { name: /^Delete your answer on/i });
    expect(controls).toHaveLength(1);

    fireEvent.click(controls[0]!);
    fireEvent.click(screen.getByRole('button', { name: /^Confirm deleting your answer on/i }));

    expect(onDeleteResponse).toHaveBeenCalledTimes(1);
    expect(onDeleteResponse).toHaveBeenCalledWith('prob-thread', 'resp-mine');
  });

  it('offers the delete on your own answer even when the thread is someone else’s', () => {
    renderBoard([
      problem({
        id: 'prob-theirs',
        authorId: 'u2',
        authorName: 'Sarah',
        title: 'Someone else’s thread',
        responses: [
          {
            id: 'resp-mine',
            authorId: 'u1',
            authorName: 'Avik',
            authorRole: 'Software Engineer',
            authorAvatar: AVATAR,
            isMentor: false,
            content: 'An answer I wrote on their thread.',
            createdAt: 'Just now',
          },
        ],
      }),
    ]);

    // No delete for the post itself, which is not mine.
    expect(screen.queryByRole('button', { name: /delete your post/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /offer solution \/ view thread/i }));
    expect(screen.getByRole('button', { name: /^Delete your answer on Someone else’s thread$/ })).toBeTruthy();
  });
});
