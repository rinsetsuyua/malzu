import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadAtlas } from "./data/atlas";
import "./styles.css";

// index.html ships a static boot state inside #root (title + one-line
// description) that stays up while atlas.json loads; the first render replaces it.
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

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
