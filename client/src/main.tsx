import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";
import { registerServiceWorker } from "./lib/push";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { listenForInstall } from "./lib/install";

applyTheme();
watchSystemTheme();
listenForInstall();
registerServiceWorker();
createRoot(document.getElementById("root")!).render(<App />);
