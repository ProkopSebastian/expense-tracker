import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { reportError } from "./errorReporting";
import "./styles.css";

function showFatalError(message: string) {
  const root = document.getElementById("root");
  if (!root || root.childElementCount > 0) return;
  const screen = document.getElementById("boot-screen");
  if (screen && screen.dataset.failed !== "true") {
    screen.dataset.failed = "true";
    screen.textContent = `Nie udało się uruchomić interfejsu: ${message}`;
  }
}

window.addEventListener("error", (event) => {
  void reportError({ message: event.message, stack: event.error?.stack ?? "" });
  showFatalError(event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  void reportError({
    message,
    stack: reason instanceof Error ? (reason.stack ?? "") : "",
  });
  showFatalError(message);
});

const root = document.getElementById("root");
if (!root) throw new Error("Brak elementu #root w stronie startowej.");
const appRoot: HTMLElement = root;
ReactDOM.createRoot(appRoot).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
function markReadyAfterFirstRender() {
  if (appRoot.childElementCount === 0) {
    window.requestAnimationFrame(markReadyAfterFirstRender);
    return;
  }
  document.documentElement.dataset.appReady = "true";
  document.getElementById("boot-screen")?.remove();
}
window.requestAnimationFrame(markReadyAfterFirstRender);
