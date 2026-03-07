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

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function analyzeSetImage(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  includeBoundingBoxes = true,
  model = "gemini-2.0-flash"
): Promise<CardWithBbox[]> {
  const prompt = includeBoundingBoxes ? SET_CARDS_PROMPT : SET_CARDS_PROMPT_NO_BBOX;
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 2048,
      response_mime_type: "application/json",
      temperature: 0,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Gemini quota exceeded — try again later or switch to a different provider.");
    }
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) return [];

  if (includeBoundingBoxes) {
    return parseCardsWithBboxFromContent(content).filter((item) => VALID_CARDS.has(item.card));
  }
  return parseCardsOnlyFromContent(content).map((card) => ({ card, bbox: EMPTY_BBOX }));
}
