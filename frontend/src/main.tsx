import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

function reportError(message: string, stack: string) {
  fetch("/report-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stack, url: window.location.href }),
  }).catch(() => {});
}

window.addEventListener("error", (event) => {
  reportError(event.message, event.error?.stack ?? "");
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportError(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? (reason.stack ?? "") : "",
  );
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
