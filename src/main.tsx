import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { hydrateStore } from "@/lib/store";
import "./index.css";

// Load saved projects/settings from the file before the app renders, so every
// tab opens with the user's data already in place.
hydrateStore().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
