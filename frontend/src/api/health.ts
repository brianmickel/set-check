import { apiUrl } from "./api";

export type VisionProvider = "openai" | "gemini" | "claude";

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
  gemini: "Gemini 2.0 Flash",
  claude: "Claude Sonnet 4.6",
};

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
  if (health.geminiConfigured) providers.push({ value: "gemini", label: PROVIDER_LABELS.gemini });
  if (health.claudeConfigured) providers.push({ value: "claude", label: PROVIDER_LABELS.claude });
  if (health.openaiConfigured) providers.push({ value: "openai", label: PROVIDER_LABELS.openai });
  return providers;
}
