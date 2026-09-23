import { Component } from 'react';
import { reportClientError } from '../lib/reportError';

/**
 * Catches render errors so one broken card doesn't blank the whole app.
 * `scope="page"` sits around the routed page (sidebar stays usable, and the
 * boundary resets when `resetKey` — the path — changes); `scope="app"` is the
 * last line at the root.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClientError(error, { kind: `boundary:${this.props.scope || 'page'}`, componentStack: info?.componentStack });
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isApp = this.props.scope === 'app';
    return (
      <div className={`${isApp ? 'min-h-screen' : 'min-h-[50vh]'} flex items-center justify-center p-6`} role="alert">
        <div className="glass rounded-2xl p-6 max-w-sm text-center">
          <h2 className="text-[17px] font-semibold mb-2">Something broke on this page</h2>
          <p className="text-[13px] text-text-3 mb-5 leading-relaxed">
            Your tasks are safe — this is a display problem, and it has been reported.
            Reloading usually fixes it.
          </p>
          <div className="flex gap-2 justify-center">
            <button type="button" className="gtd-btn gtd-btn-primary text-[13px]" onClick={() => window.location.reload()}>
              Reload
            </button>
            {!isApp && (
              <button type="button" className="gtd-btn gtd-btn-secondary text-[13px]" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
