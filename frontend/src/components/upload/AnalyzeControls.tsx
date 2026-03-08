import { ModelSelector } from "../ModelSelector";
import type { VisionProvider, ProviderOption } from "../../api/health";

interface Props {
  providers: ProviderOption[];
  selectedModel: VisionProvider | "auto";
  onModelChange: (v: VisionProvider | "auto") => void;
  runAnalyze: () => void;
  busy: boolean;
  analyzing: boolean;
  selectedUploadKey: string | null;
}

export function AnalyzeControls({
  providers,
  selectedModel,
  onModelChange,
  runAnalyze,
  busy,
  analyzing,
  selectedUploadKey,
}: Props) {
  return (
    <div className="analyze-controls">
      <ModelSelector
        providers={providers}
        selected={selectedModel}
        onChange={onModelChange}
        disabled={busy}
      />
      <button
        type="button"
        className="analyze-button"
        onClick={runAnalyze}
        disabled={busy || !selectedUploadKey}
      >
        {analyzing ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  );
}
