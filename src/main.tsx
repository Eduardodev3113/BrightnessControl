import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import BrightnessOsd from "./components/BrightnessOsd";
import "./styles/index.css";

// O mesmo bundle React serve as duas janelas (a principal e o popup OSD
// de brilho) - decide o que renderizar pelo label da janela atual.
const isOsd = getCurrentWindow().label === "osd";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOsd ? <BrightnessOsd /> : <App />}</React.StrictMode>
);
