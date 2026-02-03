import { useState, useEffect } from "react";
import { SetCardSVG } from "./SetCardSVG";
import "./SetsFound.css";

export interface SetsFoundProps {
  /** Array of sets found; each set is an array of 3 card ids. null = unknown (show —). */
  setsFound: string[][] | null;
  /** Optional: hide the whole block when false (e.g. no cards selected). */
  visible?: boolean;
}

export function SetsFound({ setsFound, visible = true }: SetsFoundProps) {
  const [showPossibleSets, setShowPossibleSets] = useState(false);

  const hasSet = setsFound === null ? null : setsFound.length > 0;

  useEffect(() => {
    if (!hasSet) setShowPossibleSets(false);
  }, [hasSet]);

  if (!visible) return null;

  return (
    <div className="sets-found">
      <div className="sets-found-header">
        Has Set?:{" "}
        {hasSet === null ? "—" : hasSet ? "Yes" : "No"}
        {hasSet && (
          <button
            type="button"
            className="sets-found-toggle"
            onClick={() => setShowPossibleSets((s) => !s)}
          >
            {showPossibleSets ? "Hide possible sets" : "Show possible sets"}
          </button>
        )}
      </div>
      {hasSet && showPossibleSets && setsFound && setsFound.length > 0 && (
        <div className="sets-found-list">
          {setsFound.map((setCards, idx) => (
            <div key={idx} className="sets-found-row">
              {setCards.map((cardId) => (
                <span
                  key={cardId}
                  className="sets-found-card"
                  title={cardId.replace(/-/g, " ")}
                >
                  <SetCardSVG
                    cardId={cardId}
                    width={80}
                    title={cardId.replace(/-/g, " ")}
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
