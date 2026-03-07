import { VALID_CARDS } from "./constants.js";
import {
  type CardWithBbox,
  EMPTY_BBOX,
  SET_CARDS_PROMPT,
  SET_CARDS_PROMPT_NO_BBOX,
  parseCardsWithBboxFromContent,
  parseCardsOnlyFromContent,
} from "./vision.js";

export type { CardWithBbox };

const CLAUDE_MODEL = "claude-sonnet-4-6";

export async function analyzeSetImage(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  includeBoundingBoxes = true
): Promise<CardWithBbox[]> {
  const prompt = includeBoundingBoxes ? SET_CARDS_PROMPT : SET_CARDS_PROMPT_NO_BBOX;

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user" as const,
        content: [
          // Image before text — Claude performs better with this ordering
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: imageBase64,
            },
          },
          { type: "text" as const, text: prompt },
        ],
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Claude quota exceeded — try again later or switch to a different provider.");
    }
    const errText = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const content = data.content?.find((b) => b.type === "text")?.text?.trim();
  if (!content) return [];

  if (includeBoundingBoxes) {
    return parseCardsWithBboxFromContent(content).filter((item) => VALID_CARDS.has(item.card));
  }
  return parseCardsOnlyFromContent(content).map((card) => ({ card, bbox: EMPTY_BBOX }));
}
