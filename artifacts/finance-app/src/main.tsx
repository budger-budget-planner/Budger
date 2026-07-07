import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { scheduleRateRefreshes } from "@/lib/rates";

document.documentElement.classList.add("dark");

scheduleRateRefreshes();
// Service worker registration is handled by vite-plugin-pwa (autoUpdate).

createRoot(document.getElementById("root")!).render(<App />);
