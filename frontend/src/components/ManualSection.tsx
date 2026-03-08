import { SetBoard } from "./SetBoard";
import { SetsFound } from "./SetsFound";
import { MultiSelect } from "./MultiSelect";
import { allCards, findAllSets } from "../utils/setLogic";

interface Props {
  selectedCards: string[];
  hasCards: boolean;
  setCards: (cards: string[]) => void;
  clearCards: () => void;
}

export function ManualSection({ selectedCards, hasCards, setCards, clearCards }: Props) {
  return (
    <section className="manual-section">
      <div className="board-summary">
        <SetBoard cards={selectedCards} boardWidth={3} />
        <SetsFound setsFound={findAllSets(selectedCards)} visible={hasCards} />
      </div>
      <p>Select the visible cards.</p>
      {hasCards && (
        <div className="clear-cards-wrap">
          <button type="button" className="clear-cards-btn" onClick={clearCards}>
            Clear selection
          </button>
        </div>
      )}
      <MultiSelect
        options={allCards.map((c) => ({ label: c.split("-").join(" "), value: c }))}
        value={selectedCards.map((c) => ({ label: c.split("-").join(" "), value: c }))}
        onChange={setCards}
      />
    </section>
  );
}
