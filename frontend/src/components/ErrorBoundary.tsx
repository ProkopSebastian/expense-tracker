import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    fetch("/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack ?? "",
        component_stack: info.componentStack ?? "",
        url: window.location.href,
      }),
    }).catch(() => {});
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
            Błąd został zapisany w dzienniku aplikacji. Spróbuj odświeżyć
            stronę — jeśli problem wróci, opisz co robiłeś/aś przed jego
            wystąpieniem.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Odśwież stronę
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
