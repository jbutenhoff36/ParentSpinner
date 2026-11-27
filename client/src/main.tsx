import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";
import { registerServiceWorker } from "./lib/push";

registerServiceWorker();
createRoot(document.getElementById("root")!).render(<App />);
