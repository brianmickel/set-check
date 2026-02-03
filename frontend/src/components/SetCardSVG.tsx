/**
 * Renders a single Set game card by loading the pre-generated SVG from src/assets/cards.
 * Card id format: "N-Color-Fill-Shape" e.g. "2-Green-Empty-Oval"
 * Outlined is treated as Empty (same asset).
 */

import { getCardUrl } from "../assets/cards";

/** Normalize card id for asset lookup (Outlined -> Empty). */
export function cardIdToAssetId(cardId: string): string {
  return cardId.replace(/Outlined/g, "Empty");
}

interface SetCardSVGProps {
  /** Card id e.g. "2-Green-Empty-Oval" (Outlined is treated as Empty) */
  cardId: string;
  /** Width in CSS units; height scales to card ratio (90:60) */
  width?: number | string;
  /** Optional className for the root element */
  className?: string;
  /** Optional title/accessible label */
  title?: string;
}

const CARD_ASPECT = 90 / 60;

export function SetCardSVG({
  cardId,
  width = 144,
  className,
  title,
}: SetCardSVGProps) {
  const src = getCardUrl(cardId);
  const label = title ?? cardId.replace(/-/g, " ").replace(/Outlined/g, "Empty");

  const numericWidth = typeof width === "string" ? parseFloat(width) || 144 : width;
  const height = numericWidth / CARD_ASPECT;

  return (
    <img
      src={src}
      alt={label}
      title={label}
      width={width}
      height={height}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
