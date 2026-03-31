import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errorFallback">
          <h1>Design Preview Error</h1>
          <p>
            The browser hit an unexpected render error while building the current design preview. Refresh the page and retry the design. If the same input fails again, keep the request details and reference GenBank together for debugging.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn"
            style={{ margin: "0 0 16px 0" }}
          >
            Reload app
          </button>
          <pre>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("Window error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection", event.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
