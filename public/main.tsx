import React from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";

let swRegistered = false;

function init(): void {
  // Hydrate React application if a root element exists.
  const rootEl = document.getElementById("root");
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }

  // Register the service worker exactly once.
  if (typeof navigator !== "undefined" && navigator.serviceWorker && !swRegistered) {
    swRegistered = true;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Failure to register is acceptable in offline‑only scenarios.
    });
  }
}

// Defer initialization until the DOM is ready.
if (typeof document !== "undefined" && "addEventListener" in document) {
  document.addEventListener("DOMContentLoaded", init);
}
