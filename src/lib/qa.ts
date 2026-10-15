/**
 * Should the verification controller be visible?
 *
 * The state switcher is a tool for checking the four routing rules. It used to render
 * for everyone, which meant a shipped site showed a developer control. Now it shows in
 * development, and in a built site only when it is asked for explicitly, so a demo can
 * still exercise all four states on purpose.
 */
export const qaControlsEnabled = (search: string, isDev: boolean): boolean => {
  if (isDev) return true;
  return /(?:^|[?&])qa=1(?:&|$)/.test(search);
};
