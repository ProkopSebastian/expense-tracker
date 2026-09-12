import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { reportError } from "../errorReporting";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reported: boolean | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reported: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, reported: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError({
      message: error.message,
      stack: error.stack ?? "",
      component_stack: info.componentStack ?? "",
    }).then((reported) => this.setState({ reported }));
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto my-20 max-w-lg px-5 text-center [&_p]:my-5 [&_p]:text-muted [&_details]:mb-5 [&_details]:text-left [&_pre]:max-h-56 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
          <div className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed [&_svg]:shrink-0 bg-rose-50 text-rose-700">
            <AlertCircle size={17} />
            Coś poszło nie tak i aplikacja nie mogła wyświetlić tego widoku.
          </div>
          <p>
            {this.state.reported === null
              ? "Zapisywanie szczegółów błędu…"
              : this.state.reported
                ? "Błąd został zapisany w dzienniku aplikacji."
                : "Nie udało się zapisać błędu. Skopiuj poniższe szczegóły."}
          </p>
          <details>
            <summary>Szczegóły techniczne</summary>
            <pre>{this.state.error.stack ?? this.state.error.message}</pre>
          </details>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
            onClick={() => window.location.reload()}
          >
            Odśwież stronę
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
