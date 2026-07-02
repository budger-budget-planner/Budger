import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { scheduleRateRefreshes } from "@/lib/rates";
import { registerServiceWorker } from "@/lib/push-notifications";

document.documentElement.classList.add("dark");

scheduleRateRefreshes();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
