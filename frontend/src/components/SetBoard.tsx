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
}

export function SetBoard({
  cards,
  boardWidth,
  cardWidth = 144,
}: SetBoardProps) {
  if (cards.length === 0) return null;

  return (
    <div
      className="set-board"
      style={{ "--set-board-width": boardWidth } as React.CSSProperties}
      role="img"
      aria-label={`Board with ${cards.length} cards`}
    >
      {cards.map((cardId) => (
        <div key={cardId} className="set-board-cell">
          <SetCardSVG
            cardId={cardId}
            width={cardWidth}
            title={cardId.replace(/-/g, " ")}
          />
        </div>
      ))}
    </div>
  );
}
