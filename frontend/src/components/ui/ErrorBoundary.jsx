import { Component } from 'react';

/**
 * Catches render errors so a single bad chart/widget doesn’t blank the whole app.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[FinanceOS]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
          <p className="font-medium">Something went wrong loading this screen.</p>
          <p className="mt-1 opacity-90">{this.state.error?.message || 'Unknown error'}</p>
          <button
            type="button"
            className="mt-3 btn-secondary text-xs"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
