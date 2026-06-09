import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadAtlas } from "./data/atlas";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <div className="boot" role="status" aria-label="Loading atlas">
    <span className="boot-mark" aria-hidden="true" />
  </div>,
);

loadAtlas()
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(
      <div className="boot boot-error" role="alert">
        <p>Could not load the atlas data.</p>
        <button onClick={() => window.location.reload()} type="button">
          Retry
        </button>
      </div>,
    );
  });
