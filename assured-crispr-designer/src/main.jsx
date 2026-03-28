import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

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
        <div style={{ minHeight: "100vh", background: "#07111c", color: "#e5eef7", fontFamily: "Segoe UI, sans-serif", padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px 0" }}>Design Preview Error</h1>
          <p style={{ margin: "0 0 12px 0", maxWidth: 720, lineHeight: 1.6 }}>
            The browser hit an unexpected render error while building the current design preview. Refresh the page and retry the design. If the same input fails again, keep the request details and reference GenBank together for debugging.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #213754",
              background: "#0f1c2e",
              color: "#e5eef7",
              fontWeight: 700,
              cursor: "pointer",
              margin: "0 0 16px 0",
            }}
          >
            Reload app
          </button>
          <pre style={{ whiteSpace: "pre-wrap", background: "#0f1c2e", border: "1px solid #213754", borderRadius: 12, padding: 16 }}>
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
