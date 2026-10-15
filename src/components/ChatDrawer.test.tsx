// @vitest-environment jsdom
/**
 * The chat drawer, driven through its real controls. These tests exist because the
 * attachment path is the one thing a typecheck cannot confirm: that a file chosen from
 * the device is staged, sent and rendered, that an oversized one is refused instead of
 * silently dropped, and that no link based input survives anywhere in the drawer.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ChatDrawer } from './ChatDrawer.tsx';

const baseProps = {
  isOpen: true,
  channelId: 'test-channel',
  recipientName: 'Elena Rostova',
  recipientRole: 'Staff Engineer',
  recipientAvatar: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  topic: 'GPU inference',
  currentUserName: 'Avik',
  onClose: () => {},
};

const chooseFile = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
};

describe('ChatDrawer attachments', () => {
  beforeEach(() => {
    localStorage.clear();
    let n = 0;
    // jsdom has no object URL support, and the component only needs a stable handle
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => `blob:test-${++n}`,
      revokeObjectURL: () => {},
    });
    Element.prototype.scrollIntoView = () => {};
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('offers a device picker and no link based input', () => {
    const { container } = render(<ChatDrawer {...baseProps} />);
    expect(container.querySelector('input[type="url"]')).toBeNull();
    expect(container.querySelector('input[accept="image/*"]')).not.toBeNull();
    expect(container.querySelector('input[accept="video/*"]')).not.toBeNull();
    expect(container.querySelectorAll('input[type="file"]').length).toBe(3);
    expect(screen.queryByText(/paste/i)).toBeNull();
  });

  it('stages a chosen photo, then sends it as a real message', () => {
    const { container } = render(<ChatDrawer {...baseProps} />);
    const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    const photo = new File(['pixels'], 'architecture.png', { type: 'image/png' });

    chooseFile(input, photo);

    expect(screen.getByText(/1 file from this device, ready to send/i)).toBeTruthy();
    expect(screen.getByAltText('architecture.png')).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /send photo/i }));
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryByText(/ready to send/i)).toBeNull();
    expect(screen.getByText('Sent photo')).toBeTruthy();
    expect(screen.getByAltText('architecture.png')).toBeTruthy();
  });

  it('refuses a file over the limit instead of attaching it', () => {
    const { container } = render(<ChatDrawer {...baseProps} />);
    const input = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    const huge = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 40 * 1024 * 1024 });

    chooseFile(input, huge);

    expect(screen.getByText(/over the 15\.0 MB limit/i)).toBeTruthy();
    expect(screen.queryByText(/ready to send/i)).toBeNull();
    expect(screen.queryByText('Sent photo')).toBeNull();
  });

  it('will not carry an attachment from an earlier session as a live file', () => {
    localStorage.setItem(
      'pathfinders_chat_test-channel',
      JSON.stringify([
        {
          id: 'old-1',
          sender: 'user',
          senderName: 'Avik',
          text: 'Sent a video',
          attachment: {
            type: 'video',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            name: 'walkthrough.mp4',
          },
          timestamp: 'Yesterday',
        },
      ])
    );

    const { container } = render(<ChatDrawer {...baseProps} />);

    expect(screen.getByText(/attached in an earlier session and no longer held/i)).toBeTruthy();
    expect(container.querySelector('video')).toBeNull();
    expect(JSON.stringify(localStorage.getItem('pathfinders_chat_test-channel'))).not.toContain(
      'gtv-videos-bucket'
    );
  });
});
