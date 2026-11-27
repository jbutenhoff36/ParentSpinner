import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Import fonts
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';

createRoot(document.getElementById("root")!).render(<App />);
