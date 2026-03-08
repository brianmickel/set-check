import type { VisionProvider, ProviderOption } from "../api/health";

interface Props {
  providers: ProviderOption[];
  selected: VisionProvider | "auto";
  onChange: (value: VisionProvider | "auto") => void;
  disabled?: boolean;
}

export function ModelSelector({ providers, selected, onChange, disabled }: Props) {
  if (providers.length === 0) return null;

  return (
    <label className="model-selector" htmlFor="set-check-model-select">
      <span className="model-selector-label">Model</span>
      <select
        id="set-check-model-select"
        value={selected}
        onChange={(e) => onChange(e.target.value as VisionProvider | "auto")}
        disabled={disabled}
        className="model-selector-select"
      >
        <option value="auto">Auto</option>
        {providers.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
