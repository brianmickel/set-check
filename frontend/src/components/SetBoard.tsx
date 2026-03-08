/**
 * Renders a grid of Set game cards (card IDs) with a fixed number of cards per row.
 */

import { SetCardSVG } from "./SetCardSVG";
import "./SetBoard.css";

interface SetBoardProps {
  /** Card ids e.g. "2-Green-Empty-Oval" (Outlined is treated as Empty in assets) */
  cards: string[];
  /** Number of cards per row */
  boardWidth: number;
  /** Optional size for each card (CSS width; height scales to card ratio) */
  cardWidth?: number;
  /** When set, each card is clickable and this is called with the card index */
  onCardClick?: (index: number) => void;
}

export function SetBoard({
  cards,
  boardWidth,
  cardWidth = 144,
  onCardClick,
}: SetBoardProps) {
  if (cards.length === 0) return null;

  return (
    <div
      className="set-board"
      style={{ "--set-board-width": boardWidth } as React.CSSProperties}
      role="img"
      aria-label={`Board with ${cards.length} cards`}
    >
      {cards.map((cardId, i) => {
        const content = (
          <SetCardSVG
            cardId={cardId}
            width={cardWidth}
            title={cardId.replace(/-/g, " ")}
          />
        );
        if (onCardClick) {
          return (
            <button
              key={i}
              type="button"
              className="set-board-cell set-board-cell-btn"
              onClick={() => onCardClick(i)}
              aria-label={`Edit card ${i + 1}: ${cardId.replace(/-/g, " ")}`}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={i} className="set-board-cell">
            {content}
          </div>
        );
      })}
    </div>
  );
}
