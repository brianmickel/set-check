import { apiUrl } from "./api";

export type VisionProvider = "openai" | "gemini" | "gemini-flash-lite" | "gemini-1.5-flash" | "gemini-pro" | "gemini-2.5-flash" | "gemini-2.5-pro" | "claude";

export interface HealthResponse {
  status: string;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  claudeConfigured: boolean;
}

export interface ProviderOption {
  value: VisionProvider;
  label: string;
}

export const PROVIDER_LABELS: Record<VisionProvider, string> = {
  openai: "OpenAI GPT-4o",
  "gemini-2.5-pro":    "Gemini 2.5 Pro",
  "gemini-2.5-flash":  "Gemini 2.5 Flash",
  gemini:              "Gemini 2.0 Flash",
  "gemini-flash-lite": "Gemini 2.0 Flash Lite",
  "gemini-1.5-flash":  "Gemini 1.5 Flash",
  "gemini-pro":        "Gemini 1.5 Pro",
  claude: "Claude Sonnet 4.6",
};

// Ordered list of Gemini provider keys shown in the dropdown
const GEMINI_PROVIDERS: VisionProvider[] = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini",
  "gemini-flash-lite",
  "gemini-1.5-flash",
  "gemini-pro",
];

let cachedHealth: HealthResponse | null = null;

export async function fetchHealth(): Promise<HealthResponse> {
  if (cachedHealth) return cachedHealth;
  const res = await fetch(apiUrl("health"));
  if (!res.ok) throw new Error("Health check failed");
  cachedHealth = (await res.json()) as HealthResponse;
  return cachedHealth;
}

export function getAvailableProviders(health: HealthResponse): ProviderOption[] {
  const providers: ProviderOption[] = [];
  if (health.geminiConfigured) {
    for (const p of GEMINI_PROVIDERS) {
      providers.push({ value: p, label: PROVIDER_LABELS[p] });
    }
  }
  if (health.claudeConfigured) providers.push({ value: "claude", label: PROVIDER_LABELS.claude });
  if (health.openaiConfigured) providers.push({ value: "openai", label: PROVIDER_LABELS.openai });
  return providers;
}
