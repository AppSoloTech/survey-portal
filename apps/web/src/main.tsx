import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "react-phone-number-input/style.css";

import { App } from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
