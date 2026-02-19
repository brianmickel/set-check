import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "./App.css";
import { MultiSelect } from "./components/MultiSelect";
import { SetBoard } from "./components/SetBoard";
import { SetCardSVG } from "./components/SetCardSVG";
import { SetsFound } from "./components/SetsFound";
import { ensureSessionToken } from "./api";
import { ensureJpegOrPassthrough } from "./utils/heic";
import { resizeImageForAnalyze } from "./utils/imageResize";
import { uploadImage, analyzeImage, type CardWithBbox } from "./api";

const numbers = ["1", "2", "3"];
const colors = ["Red", "Green", "Purple"];
const fills = ["Solid", "Striped", "Empty"];
const shapes = ["Diamond", "Oval", "Squiggle"];
const characteristics = [numbers, colors, fills, shapes];

const allCards: string[] = [];
for (const a of characteristics[0]) {
  for (const b of characteristics[1]) {
    for (const c of characteristics[2]) {
      for (const d of characteristics[3]) {
        allCards.push(`${a}-${b}-${c}-${d}`);
      }
    }
  }
}

const calculateMatch = (a: string, b: string): string => {
  const partsA = a.split("-");
  const partsB = b.split("-");
  const partsMatch: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (partsA[i] === partsB[i]) {
      partsMatch.push(partsA[i]);
    } else {
      const options = new Set(characteristics[i]);
      options.delete(partsA[i]);
      options.delete(partsB[i]);
      partsMatch.push([...options.values()][0]);
    }
  }
  return partsMatch.join("-");
};

/** Return all valid 3-card sets from the given cards (no duplicates). */
function findAllSets(cards: string[]): string[][] {
  const sets: string[][] = [];
  const seen = new Set<string>();
  const available = new Set(cards);
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const third = calculateMatch(cards[i], cards[j]);
      if (third !== cards[i] && third !== cards[j] && available.has(third)) {
        const triplet = [cards[i], cards[j], third].sort();
        const key = triplet.join("|");
        if (!seen.has(key)) {
          seen.add(key);
          sets.push(triplet);
        }
      }
    }
  }
  return sets;
}

/** Sort by top-left of bbox: y_min then x_min */
function sortCardsByTopLeft(cards: CardWithBbox[]): CardWithBbox[] {
  return [...cards].sort((a, b) => {
    if (a.bbox[1] !== b.bbox[1]) return a.bbox[1] - b.bbox[1];
    return a.bbox[0] - b.bbox[0];
  });
}

function App() {
  const [mode, setMode] = useState<"upload" | "manual" | "visual">("visual");

  const [hasCardsSelected, setHasCardsSelected] = useState(false);
  const [manualSelectedCards, setManualSelectedCards] = useState<string[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cardsFromImage, setCardsFromImage] = useState<CardWithBbox[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedCards = useMemo(
    () => (cardsFromImage ? sortCardsByTopLeft(cardsFromImage) : []),
    [cardsFromImage]
  );
  useEffect(() => {
    ensureSessionToken().catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadError(null);
    setCardsFromImage(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    try {
      const converted = await ensureJpegOrPassthrough(file);
      const imageFile = await resizeImageForAnalyze(converted);
      setImageFile(imageFile);
      setPreviewUrl(URL.createObjectURL(imageFile));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Invalid image");
    }
  };

  const runAnalyze = useCallback(async () => {
    if (!imageFile) return;
    setUploadError(null);
    setAnalyzing(true);
    try {
      const { uploadKey } = await uploadImage(imageFile);
      const { cards } = await analyzeImage(uploadKey);
      setCardsFromImage(cards);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Analyze error:", err);
      setUploadError(
        err instanceof Error ? err.message : "Something went wrong — try again later."
      );
    } finally {
      setAnalyzing(false);
    }
  }, [imageFile]);

  useEffect(() => {
    if (mode !== "upload" || !imageFile || !previewUrl || cardsFromImage !== null || analyzing || uploadError !== null)
      return;
    runAnalyze();
  }, [mode, imageFile, previewUrl, cardsFromImage, analyzing, uploadError, runAnalyze]);

  const overlayBoxes = cardsFromImage ?? [];
  const showBboxOverlay =
    overlayBoxes.length > 0 &&
    overlayBoxes.some((item) => item.bbox[2] > 0 && item.bbox[3] > 0);

  return (
    <>
      <h1>Check for a Set</h1>

      <div className="mode-toggle" role="tablist" aria-label="Input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "visual"}
          className={`mode-toggle-btn ${mode === "visual" ? "mode-toggle-btn-active" : ""}`}
          onClick={() => setMode("visual")}
        >
          Pick cards visually
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          className={`mode-toggle-btn ${mode === "manual" ? "mode-toggle-btn-active" : ""}`}
          onClick={() => setMode("manual")}
        >
          Pick cards manually
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          className={`mode-toggle-btn ${mode === "upload" ? "mode-toggle-btn-active" : ""}`}
          onClick={() => setMode("upload")}
        >
          Upload & detect
        </button>
      </div>

      {mode === "upload" && (
        <section className="upload-section">
          <div>Upload a photo of your Set cards.</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFileChange}
            disabled={analyzing}
            className="file-input"
            aria-label="Choose image"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="upload-button"
          >
            Upload photo
          </button>
          {uploadError && (
            <div className="upload-error" role="alert">
              {uploadError}
            </div>
          )}

          {previewUrl && (
            <>
              <div className="upload-preview-wrap">
                <div className="preview-wrap">
                  <img
                    src={previewUrl}
                    alt="Uploaded Set cards"
                    className="preview-image"
                  />
                  {analyzing && (
                    <div className="preview-overlay" aria-hidden="true">
                      <div className="spinner" aria-label="Processing" />
                      <span className="spinner-label">Analyzing…</span>
                    </div>
                  )}
                  {!analyzing && showBboxOverlay && (
                    <div className="bbox-overlay" aria-hidden="true">
                      {overlayBoxes.map((item, i) => (
                        <div
                          key={`card-${i}`}
                          className="bbox-box"
                          style={{
                            left: `${item.bbox[0] * 100}%`,
                            top: `${item.bbox[1] * 100}%`,
                            width: `${item.bbox[2] * 100}%`,
                            height: `${item.bbox[3] * 100}%`,
                          }}
                          title={
                            item.card ? item.card.replace(/-/g, " ") : `Card ${i + 1}`
                          }
                        >
                          <span className="bbox-label">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {cardsFromImage !== null && !analyzing && (
                <div className="upload-board-summary">
                  <SetBoard
                    cards={sortedCards.map((c) => c.card.replace(/Outlined/g, "Empty"))}
                    boardWidth={3}
                  />
                  <SetsFound
                    setsFound={findAllSets(
                      cardsFromImage.map((c) => c.card.replace(/Outlined/g, "Empty"))
                    )}
                    visible={sortedCards.length > 0}
                  />
                </div>
              )}
            </>
          )}
        </section>
      )}

      {mode === "visual" && (
        <section className="visual-section">
          <div className="board-summary">
            <SetBoard cards={manualSelectedCards} boardWidth={3} />
            <SetsFound
            setsFound={findAllSets(manualSelectedCards)}
            visible={hasCardsSelected}
          />
          </div>
          <p className="visual-instruction">Click or tap cards to select or deselect.</p>
          {hasCardsSelected && (
            <div className="clear-cards-wrap">
              <button
                type="button"
                className="clear-cards-btn"
                onClick={() => {
                  setManualSelectedCards([]);
                  setHasCardsSelected(false);
                }}
              >
                Clear selected cards
              </button>
            </div>
          )}
          <div className="set-visual-grid" role="group" aria-label="All Set cards">
            {allCards.map((cardId) => {
              const selected = manualSelectedCards.includes(cardId);
              return (
                <button
                  key={cardId}
                  type="button"
                  className={`set-visual-card ${selected ? "set-visual-card--selected" : ""}`}
                  onClick={() => {
                    const next = selected
                      ? manualSelectedCards.filter((c) => c !== cardId)
                      : [...manualSelectedCards, cardId];
                    setManualSelectedCards(next);
                    setHasCardsSelected(next.length > 0);
                  }}
                  aria-pressed={selected}
                  aria-label={`${cardId.replace(/-/g, " ")}${selected ? ", selected" : ""}`}
                >
                  <SetCardSVG
                    cardId={cardId}
                    width={80}
                    title={cardId.replace(/-/g, " ")}
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode === "manual" && (
        <section className="manual-section">
          <div className="board-summary">
            <SetBoard cards={manualSelectedCards} boardWidth={3} />
            <SetsFound
            setsFound={findAllSets(manualSelectedCards)}
            visible={hasCardsSelected}
          />
          </div>
          <p>Select the visible cards.</p>
          {hasCardsSelected && (
            <div className="clear-cards-wrap">
              <button
                type="button"
                className="clear-cards-btn"
                onClick={() => {
                  setManualSelectedCards([]);
                  setHasCardsSelected(false);
                }}
              >
                Clear selection
              </button>
            </div>
          )}
          <MultiSelect
            options={allCards.map((c) => ({
              label: c.split("-").join(" "),
              value: c,
            }))}
            value={manualSelectedCards.map((c) => ({
              label: c.split("-").join(" "),
              value: c,
            }))}
            onChange={(cards: string[]) => {
              setManualSelectedCards(cards);
              setHasCardsSelected(cards.length > 0);
            }}
          />
        </section>
      )}
    </>
  );
}

export default App;
