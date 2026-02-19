import { VALID_CARDS } from "./constants.js";

/**
 * Vision model for card detection.
 * - gpt-4o: Best accuracy; use for production.
 * - gpt-4o-mini: Cheaper, less accurate on fine details (stripes, shapes).
 * OpenAI’s current best vision model is gpt-4o; there is no higher-tier vision model.
 */
const VISION_MODEL = "gpt-4o";

const SET_CARDS_PROMPT = `You are analyzing an image of Set game cards. The Set game has 81 unique cards with four attributes. For each card you must identify all four exactly:

- **Number**: Count the symbols on the card — 1, 2, or 3.
- **Color**: Red, Green, or Purple (the color of the symbols).
- **Fill**: Solid (filled in), Striped (has stripes inside), or Outlined (empty outline only, no fill).
- **Shape**: Diamond, Oval, or Squiggle (squiggle is like a tilde ~).

Use ONLY these exact strings: 1 or 2 or 3, Red or Green or Purple, Solid or Striped or Outlined, Diamond or Oval or Squiggle.

For each Set card visible in the image:
1. Identify the card as: Number-Color-Fill-Shape (e.g. 1-Red-Solid-Diamond, 2-Green-Striped-Oval, 3-Purple-Outlined-Squiggle).
2. Give a bounding box in normalized 0–1 coordinates. Use exactly this format: [x_min, y_min, width, height] where (x_min, y_min) is the top-left corner and width, height are the box size as a fraction of image width and height. Do NOT use (x_max, y_max); use width and height.

Reply with ONLY a JSON array, nothing else. Each object: { "card": "<card-string>", "bbox": [x_min, y_min, width, height] }
Example: [{"card":"1-Red-Solid-Diamond","bbox":[0.1,0.2,0.25,0.35]},{"card":"2-Green-Striped-Oval","bbox":[0.4,0.2,0.25,0.35]}]
If no cards are visible or the image is not of Set cards, return [].`;

/** Prompt when bounding boxes are disabled: only ask for card identities. */
const SET_CARDS_PROMPT_NO_BBOX = `You are an expert at the Set card game. Identify every Set card in this image. Each card has exactly four attributes. Work through each card one at a time and decide all four before moving on.

**Attribute rules (follow exactly):**

1. **Number** = how many symbols on the card. Count each symbol: 1 symbol → "1", 2 symbols → "2", 3 symbols → "3". Do not guess—count. Two symbols close together is 2, not 1.

2. **Color** = color of the symbols only (ignore background): Red, Green, or Purple. Purple can look dark in photos—if it's reddish-blue or violet, use Purple. Green is distinctly green.

3. **Fill** (most often confused):
   - **Solid** = shape is completely filled with one solid color. No lines, no gaps inside.
   - **Striped** = you see clear stripes or lines inside the shape (like horizontal bands). If there is any stripe pattern, it is Striped.
   - **Outlined** = only the outline/border of the shape; the inside is empty/hollow. No fill, no stripes inside. If you see shading or lines inside, it is NOT Outlined.

4. **Shape**:
   - **Diamond** = diamond/rhombus shape (◇).
   - **Oval** = pill or stadium shape—two semicircles connected by straight sides. Smooth, rounded.
   - **Squiggle** = wavy, squiggly shape (like ~ or a stretched S). Has curves that wiggle. Not smooth like an oval.

Use ONLY these exact words: 1, 2, 3, Red, Green, Purple, Solid, Striped, Outlined, Diamond, Oval, Squiggle.

**Output:** For each card, one string: Number-Color-Fill-Shape (e.g. 2-Green-Striped-Oval). Go through the image in order (e.g. top-left to bottom-right). Include every card exactly once.

Reply with ONLY a JSON array of these strings. No other text, no markdown.
Example: ["1-Red-Solid-Diamond","2-Green-Striped-Oval","3-Purple-Outlined-Squiggle"]
If there are no Set cards in the image, return [].`;

export interface VisionMessage {
  role: "user";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

export interface CardWithBbox {
  card: string;
  bbox: [number, number, number, number]; // x_min, y_min, width, height normalized 0-1
}

const EMPTY_BBOX: [number, number, number, number] = [0, 0, 0, 0];

export async function analyzeSetImage(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  includeBoundingBoxes = true
): Promise<CardWithBbox[]> {
  const url = "https://api.openai.com/v1/chat/completions";
  const prompt = includeBoundingBoxes ? SET_CARDS_PROMPT : SET_CARDS_PROMPT_NO_BBOX;
  const body = {
    model: VISION_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: "high" as const, // needed to distinguish stripes vs solid, shape details
            },
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      try {
        const err = JSON.parse(errText) as { error?: { code?: string } };
        if (err.error?.code === "insufficient_quota") {
          throw new Error("Image analysis is temporarily unavailable. Please try again later.");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("temporarily unavailable")) throw e;
      }
    }
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  if (includeBoundingBoxes) {
    const parsed = parseCardsWithBboxFromContent(content);
    return parsed.filter((item) => VALID_CARDS.has(item.card));
  }
  const cards = parseCardsOnlyFromContent(content);
  return cards.map((card) => ({ card, bbox: EMPTY_BBOX }));
}

function parseCardsOnlyFromContent(content: string): string[] {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const arr = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item === "string" && VALID_CARDS.has(item)) {
        out.push(item);
      } else if (
        item &&
        typeof item === "object" &&
        "card" in item &&
        typeof (item as { card: unknown }).card === "string"
      ) {
        const card = (item as { card: string }).card;
        if (VALID_CARDS.has(card)) out.push(card);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Normalize bbox to [x_min, y_min, width, height] 0–1. Handles model returning (x_min, y_min, x_max, y_max). */
function normalizeBbox(
  x: number,
  y: number,
  a: number,
  b: number
): [number, number, number, number] {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  // If a,b look like x_max,y_max (top-left + a,b would exceed 1), convert to width/height
  if (x + a > 1.01 || y + b > 1.01) {
    const w = clamp(a - x);
    const h = clamp(b - y);
    return [clamp(x), clamp(y), w, h];
  }
  return [clamp(x), clamp(y), clamp(a), clamp(b)];
}

function parseCardsWithBboxFromContent(content: string): CardWithBbox[] {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const arr = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: CardWithBbox[] = [];
    for (const item of arr) {
      if (
        item &&
        typeof item === "object" &&
        "card" in item &&
        typeof (item as { card: unknown }).card === "string" &&
        "bbox" in item &&
        Array.isArray((item as { bbox: unknown }).bbox)
      ) {
        const raw = (item as { bbox: unknown[] }).bbox;
        if (
          raw.length >= 4 &&
          raw.every((n) => typeof n === "number" && n >= 0 && n <= 1)
        ) {
          const [x, y, a, b] = raw as number[];
          const bbox = normalizeBbox(x, y, a, b);
          out.push({
            card: (item as { card: string }).card,
            bbox,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
