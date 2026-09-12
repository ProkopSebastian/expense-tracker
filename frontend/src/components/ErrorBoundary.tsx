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
        <div className="crash-screen">
          <div className="notice error">
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
          <button className="button" onClick={() => window.location.reload()}>
            Odśwież stronę
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
