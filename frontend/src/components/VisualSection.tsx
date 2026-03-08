import { SetBoard } from "./SetBoard";
import { SetsFound } from "./SetsFound";
import { SetCardSVG } from "./SetCardSVG";
import { allCards, findAllSets } from "../utils/setLogic";

interface Props {
  selectedCards: string[];
  hasCards: boolean;
  toggleCard: (cardId: string) => void;
  clearCards: () => void;
}

export function VisualSection({ selectedCards, hasCards, toggleCard, clearCards }: Props) {
  return (
    <section className="visual-section">
      <div className="board-summary">
        <SetBoard cards={selectedCards} boardWidth={3} />
        <SetsFound setsFound={findAllSets(selectedCards)} visible={hasCards} />
      </div>
      <p className="visual-instruction">Click or tap cards to select or deselect.</p>
      {hasCards && (
        <div className="clear-cards-wrap">
          <button type="button" className="clear-cards-btn" onClick={clearCards}>
            Clear selected cards
          </button>
        </div>
      )}
      <div className="set-visual-grid" role="group" aria-label="All Set cards">
        {allCards.map((cardId) => {
          const selected = selectedCards.includes(cardId);
          return (
            <button
              key={cardId}
              type="button"
              className={`set-visual-card ${selected ? "set-visual-card--selected" : ""}`}
              onClick={() => toggleCard(cardId)}
              aria-pressed={selected}
              aria-label={`${cardId.replace(/-/g, " ")}${selected ? ", selected" : ""}`}
            >
              <SetCardSVG cardId={cardId} width={80} title={cardId.replace(/-/g, " ")} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
