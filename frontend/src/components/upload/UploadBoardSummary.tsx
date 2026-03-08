import { SetBoard } from "../SetBoard";
import { SetsFound } from "../SetsFound";
import { findAllSets } from "../../utils/setLogic";
import type { CardWithBbox } from "../../api";

interface Props {
  cardsFromImage: CardWithBbox[];
  sortedCards: CardWithBbox[];
  analysisFromCache: boolean;
  confirming: boolean;
  confirmError: string | null;
  confirmSuccess: boolean;
  handleConfirmCorrect: () => void;
  invalidating: boolean;
  invalidateError: string | null;
  handleInvalidateCache: () => void;
  busy: boolean;
  handleCardClick: (index: number) => void;
  handleOpenAddCard: () => void;
}

export function UploadBoardSummary({
  cardsFromImage,
  sortedCards,
  analysisFromCache,
  confirming,
  confirmError,
  confirmSuccess,
  handleConfirmCorrect,
  invalidating,
  invalidateError,
  handleInvalidateCache,
  busy,
  handleCardClick,
  handleOpenAddCard,
}: Props) {
  const cardIds = sortedCards.map((c) => c.card.replace(/Outlined/g, "Empty"));
  const allCardIds = cardsFromImage.map((c) => c.card.replace(/Outlined/g, "Empty"));
  const setsFound = findAllSets(allCardIds);

  return (
    <div className="upload-board-summary">
      {analysisFromCache && (
        <p className="analysis-cache-hint analysis-cache-hint-with-invalidate" role="status">
          From saved result (no LLM used).
          <button
            type="button"
            className="invalidate-cache-btn"
            onClick={handleInvalidateCache}
            disabled={invalidating || busy}
            aria-busy={invalidating}
          >
            {invalidating ? "Clearing…" : "Invalidate"}
          </button>
        </p>
      )}
      {invalidateError && (
        <p className="confirm-error" role="alert">
          {invalidateError}
        </p>
      )}
      {!analysisFromCache && !confirmSuccess && (
        <div className="confirm-correct-row">
          <span className="confirm-correct-label">Result correct?</span>
          <button
            type="button"
            className="confirm-correct-btn"
            onClick={handleConfirmCorrect}
            disabled={confirming || busy}
            aria-busy={confirming}
          >
            {confirming ? "Saving…" : "Mark as correct"}
          </button>
        </div>
      )}
      {confirmSuccess && (
        <p className="confirm-success" role="status">
          Saved — this result will be reused for this image next time.
        </p>
      )}
      {confirmError && (
        <p className="confirm-error" role="alert">
          {confirmError}
        </p>
      )}
      <SetBoard
        cards={cardIds}
        boardWidth={3}
        onCardClick={handleCardClick}
        onAddCard={handleOpenAddCard}
      />
      <SetsFound setsFound={setsFound} visible={sortedCards.length > 0} />
    </div>
  );
}
