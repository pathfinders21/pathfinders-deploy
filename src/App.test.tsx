// @vitest-environment jsdom
/**
 * The screens are the URL now, so this drives the real app: open a deep link, click the
 * navigation, and fire a hashchange the way the back button would. A pure mapping test
 * cannot show that the two stay in step.
 */
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import App from './App.tsx';

// The app asks the server who is signed in. Stub it so the suite never depends on a
// running backend, and so the signed out path is the one under test.
beforeAll(() => {
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ ok: false, error: 'Sign in required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const heroHeadline = () =>
  screen.getByRole('heading', { level: 1, name: /meets your next beginning/i });

const goTo = (hash: string) => {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
};

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    Element.prototype.scrollIntoView = () => {};
    window.scrollTo = () => {};
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a deep link straight onto that screen', () => {
    goTo('#/mentors');
    render(<App />);
    expect(screen.getByText('Explore Mentors')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: /meets your next beginning/i })).toBeNull();
  });

  it('carries every signed out screen on its own link', () => {
    goTo('#/roadmaps');
    const first = render(<App />);
    expect(screen.getByText(/Target Trajectory/)).toBeTruthy();
    first.unmount();

    goTo('#/community');
    render(<App />);
    expect(screen.getByText(/Mentees post real architectural/i)).toBeTruthy();
  });

  it('writes the screen into the URL when you use the navigation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Roadmaps' }));
    expect(window.location.hash).toBe('#/roadmaps');
    expect(screen.getByText(/Target Trajectory/)).toBeTruthy();
  });

  it('follows a hashchange, which is what the back button sends', () => {
    render(<App />);
    goTo('#/community');
    expect(screen.getByText(/Mentees post real architectural/i)).toBeTruthy();
    goTo('#/');
    expect(heroHeadline()).toBeTruthy();
  });

  it('sends a deep link into a signed in screen home when signed out', () => {
    goTo('#/dashboard');
    render(<App />);
    expect(heroHeadline()).toBeTruthy();
    expect(window.location.hash).toBe('#/');
  });

  it('never renders an empty page for an unknown link', () => {
    goTo('#/not-a-screen');
    const { container } = render(<App />);
    expect(heroHeadline()).toBeTruthy();
    expect(container.textContent?.length).toBeGreaterThan(500);
  });

  it('shows the verification controller in development', () => {
    render(<App />);
    expect(screen.getByText(/CTA Rule State/i)).toBeTruthy();
  });

  it('gives the assistant a screen of its own, reached from the navigation', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));

    expect(window.location.hash).toBe('#/assistant');
    expect(screen.getByRole('heading', { level: 1, name: /stuck\? describe it/i })).toBeTruthy();
    // The floating chat is hidden on its own screen: never a chat inside a chat.
    expect(screen.queryByRole('button', { name: /^ask the assistant$/i })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /assistant/i })).toBeNull();
  });

  it('deep links straight onto the assistant', () => {
    goTo('#/assistant');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /stuck\? describe it/i })).toBeTruthy();
  });

  it('lets the author take their own community post back off the board', () => {
    // Signed in, because only the person who wrote a post may remove it.
    localStorage.setItem(
      'pathfinders_user',
      JSON.stringify({
        id: 'u-rae',
        name: 'Rae Okafor',
        email: 'rae@example.com',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        role: 'mentee',
        isOnboarded: true,
      }),
    );
    goTo('#/community');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /post a problem/i }));
    fireEvent.change(screen.getByPlaceholderText(/Distributed KV cache OOM/i), {
      target: { value: 'Retries duplicate a charge' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Explain the setup/i), {
      target: { value: 'Our worker retries a failed charge and the customer is billed twice.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /publish challenge/i }));

    expect(screen.getByText('Retries duplicate a charge')).toBeTruthy();

    // It is theirs, so it is offered, it asks once, and then it is gone.
    fireEvent.click(screen.getByRole('button', { name: /^Delete your post: Retries duplicate a charge$/ }));
    expect(screen.getByText('Retries duplicate a charge')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /^Confirm deleting your post: Retries duplicate a charge$/ }),
    );

    expect(screen.queryByText('Retries duplicate a charge')).toBeNull();
    // Gone from what this browser stored, not only from the screen.
    expect(localStorage.getItem('pathfinders_community_problems') ?? '').not.toContain(
      'Retries duplicate a charge',
    );
  });
});
