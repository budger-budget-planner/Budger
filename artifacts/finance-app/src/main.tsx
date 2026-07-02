import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { scheduleRateRefreshes } from "@/lib/rates";

document.documentElement.classList.add("dark");

scheduleRateRefreshes();

createRoot(document.getElementById("root")!).render(<App />);
