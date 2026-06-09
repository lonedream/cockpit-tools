import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "./i18n";
import { AppRuntimeGuard } from "./components/AppRuntimeGuard";
import "./App.css";

void initI18n();

const App = React.lazy(() => import("./App"));

function PreviewApp() {
  return (
    <React.Suspense fallback={null}>
      <App />
    </React.Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppRuntimeGuard>
      <PreviewApp />
    </AppRuntimeGuard>
  </React.StrictMode>,
);
