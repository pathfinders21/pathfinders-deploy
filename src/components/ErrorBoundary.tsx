import React from 'react';

/**
 * A render failure must never leave a blank page.
 *
 * React unmounts the whole tree when a render throws, which is what a visitor sees as an
 * empty screen with nothing to act on. This catches that case, shows the message the
 * browser reported, and offers a reload, so a failure is diagnosable instead of silent.
 */
type Props = { children: React.ReactNode };
type State = { message: string | null; detail: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { message: null, detail: '' };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      message: error instanceof Error ? error.message : 'Something failed while drawing this screen.',
      detail: error instanceof Error ? String(error.stack ?? '') : '',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Kept in the console as well, where a developer expects to find it.
    console.error('Render failed:', error, info?.componentStack ?? '');
  }

  render() {
    if (this.state.message === null) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#002244] text-white">
        <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-amber-950/40 p-6 space-y-4">
          <h1 className="text-lg font-medium">This screen could not render</h1>
          <p className="text-sm text-amber-100/85">
            An error stopped the interface from drawing, so nothing below it is shown. The message the browser
            reported is here, word for word.
          </p>
          <p className="text-xs text-amber-100/90 break-words rounded-xl bg-black/30 p-3 font-mono">
            {this.state.message}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-full px-5 py-2.5 text-sm font-medium bg-white text-gray-900 hover:bg-gray-100 transition-colors"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => this.setState({ message: null, detail: '' })}
              className="cursor-pointer text-xs text-amber-100/80 hover:text-white"
            >
              Try drawing it again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
