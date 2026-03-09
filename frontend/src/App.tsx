import { useState, useEffect, useCallback } from "react";
import "./App.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UploadSection } from "./components/UploadSection";
import { VisualSection } from "./components/VisualSection";
import { ManualSection } from "./components/ManualSection";
import { ensureSessionToken } from "./api";
import { useUploadMode } from "./hooks/useUploadMode";
import { useCardSelection } from "./hooks/useCardSelection";
import {
  fetchHealth,
  getAvailableProviders,
  type VisionProvider,
  type ProviderOption,
} from "./api/health";

const MODEL_STORAGE_KEY = "set-check-model";

type Mode = "upload" | "manual" | "visual";

function App() {
  const [mode, setMode] = useState<Mode>("visual");
  const [availableProviders, setAvailableProviders] = useState<ProviderOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<VisionProvider | "auto">(() => {
    try {
      return (localStorage.getItem(MODEL_STORAGE_KEY) as VisionProvider | "auto") ?? "auto";
    } catch {
      return "auto";
    }
  });

  const cardSelection = useCardSelection();
  const uploadMode = useUploadMode(selectedModel, mode === "upload");

  useEffect(() => {
    ensureSessionToken().catch(() => {});
    fetchHealth()
      .then((h) => setAvailableProviders(getAvailableProviders(h)))
      .catch(() => {});
  }, []);

  const handleModelChange = useCallback((value: VisionProvider | "auto") => {
    setSelectedModel(value);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, value);
    } catch { /* ignore */ }
  }, []);

  return (
    <>
      <h1>Check for a Set</h1>

      <ErrorBoundary>
        <div className="mode-toggle" role="tablist" aria-label="Input mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "visual"}
            className={`mode-toggle-btn ${mode === "visual" ? "mode-toggle-btn-active" : ""}`}
            onClick={() => setMode("visual")}
          >
            Pick cards visually
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manual"}
            className={`mode-toggle-btn ${mode === "manual" ? "mode-toggle-btn-active" : ""}`}
            onClick={() => setMode("manual")}
          >
            Pick cards manually
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={`mode-toggle-btn ${mode === "upload" ? "mode-toggle-btn-active" : ""}`}
            onClick={() => setMode("upload")}
          >
            Upload & detect
          </button>
        </div>

        {mode === "upload" && (
          <UploadSection
            {...uploadMode}
            providers={availableProviders}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
          />
        )}
        {mode === "visual" && <VisualSection {...cardSelection} />}
        {mode === "manual" && <ManualSection {...cardSelection} />}
      </ErrorBoundary>
    </>
  );
}

export default App;
