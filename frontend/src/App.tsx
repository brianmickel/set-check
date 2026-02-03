import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Select from "react-select";
import "./App.css";
import { MultiSelect } from "./components/MultiSelect";
import { SetBoard } from "./components/SetBoard";
import { SetCardSVG } from "./components/SetCardSVG";
import { SetsFound } from "./components/SetsFound";
import { ensureSessionToken } from "./api";
import { ensureJpegOrPassthrough } from "./utils/heic";
import { resizeImageForAnalyze } from "./utils/imageResize";
import {
  uploadImage,
  analyzeImage,
  analyzeImageWithBoxes,
  type CardWithBbox,
} from "./api";

type Bbox = [number, number, number, number]; // x_min, y_min, width, height
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
const MIN_BOX = 0.02;

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
  const [userDrawnBoxes, setUserDrawnBoxes] = useState<Bbox[]>([]);
  const [drawing, setDrawing] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [resizing, setResizing] = useState<{ boxIndex: number; handle: ResizeHandle } | null>(null);

  const [cardsFromImage, setCardsFromImage] = useState<CardWithBbox[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  const clampBbox = useCallback((b: Bbox): Bbox => {
    let [x, y, w, h] = b;
    w = Math.max(MIN_BOX, Math.min(1 - x, w));
    h = Math.max(MIN_BOX, Math.min(1 - y, h));
    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h, y));
    return [x, y, w, h];
  }, []);

  const applyResize = useCallback(
    (boxIndex: number, handle: ResizeHandle, normX: number, normY: number): Bbox => {
      const b = userDrawnBoxes[boxIndex];
      if (!b) return [0.4, 0.4, 0.2, 0.2];
      let [x, y, w, h] = b;
      if (handle.includes("e")) w = Math.max(MIN_BOX, normX - x);
      if (handle.includes("w")) {
        const newW = x + w - normX;
        if (newW >= MIN_BOX) {
          x = normX;
          w = newW;
        }
      }
      if (handle.includes("s")) h = Math.max(MIN_BOX, normY - y);
      if (handle.includes("n")) {
        const newH = y + h - normY;
        if (newH >= MIN_BOX) {
          y = normY;
          h = newH;
        }
      }
      return clampBbox([x, y, w, h]);
    },
    [userDrawnBoxes, clampBbox]
  );

  useEffect(() => {
    if (!resizing || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const onMove = (e: MouseEvent) => {
      const rect = overlay.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setUserDrawnBoxes((prev) => {
        const next = [...prev];
        const newBbox = applyResize(resizing.boxIndex, resizing.handle, normX, normY);
        next[resizing.boxIndex] = newBbox;
        return next;
      });
    };
    const onUp = () => setResizing(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, applyResize]);

  useEffect(() => {
    if (!drawing || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const onMove = (e: MouseEvent) => {
      const rect = overlay.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setDrawing((d) => (d ? { ...d, current: { x, y } } : null));
    };
    const onUp = (e: MouseEvent) => {
      if (!drawing) return;
      const rect = overlayRef.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const xMin = Math.min(drawing.start.x, x);
      const yMin = Math.min(drawing.start.y, y);
      const width = Math.abs(x - drawing.start.x);
      const height = Math.abs(y - drawing.start.y);
      if (width >= MIN_BOX && height >= MIN_BOX) {
        setUserDrawnBoxes((prev) => [...prev, clampBbox([xMin, yMin, width, height])]);
      }
      setDrawing(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drawing, clampBbox]);

  useEffect(() => {
    if (!userDrawnBoxes.length) setSelectedBoxIndex(null);
  }, [userDrawnBoxes.length]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadError(null);
    setCardsFromImage(null);
    setUserDrawnBoxes([]);
    setDrawing(null);
    setSelectedBoxIndex(null);
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

  const handleAnalyze = async () => {
    if (!imageFile) return;
    setUploadError(null);
    setAnalyzing(true);
    try {
      const { uploadKey } = await uploadImage(imageFile);
      const cards =
        userDrawnBoxes.length > 0
          ? (await analyzeImageWithBoxes(uploadKey, userDrawnBoxes)).cards
          : (await analyzeImage(uploadKey)).cards;
      setCardsFromImage(cards);
      setUserDrawnBoxes([]);
      setSelectedBoxIndex(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Analyze error:", err);
      setUploadError(
        err instanceof Error ? err.message : "Something went wrong — try again later."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteDrawnBox = useCallback(() => {
    if (userDrawnBoxes.length === 0 || selectedBoxIndex == null) return;
    setUserDrawnBoxes((prev) => prev.filter((_, i) => i !== selectedBoxIndex));
    setSelectedBoxIndex(
      selectedBoxIndex >= userDrawnBoxes.length - 1
        ? Math.max(0, selectedBoxIndex - 1)
        : selectedBoxIndex
    );
  }, [userDrawnBoxes.length, selectedBoxIndex]);

  useEffect(() => {
    if (!userDrawnBoxes.length || selectedBoxIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleDeleteDrawnBox();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userDrawnBoxes.length, selectedBoxIndex, handleDeleteDrawnBox]);

  const handleDeleteCard = (cardToRemove: CardWithBbox) => {
    setCardsFromImage((prev) => (prev ? prev.filter((c) => c !== cardToRemove) : null));
  };

  const handleAddCard = (card: string) => {
    setCardsFromImage((prev) => [
      ...(prev ?? []),
      { card, bbox: [0, 0, 0, 0] as Bbox },
    ]);
  };

  const overlayBoxes = cardsFromImage ?? userDrawnBoxes.map((bbox) => ({ card: "", bbox }));
  const isPreAnalyze = previewUrl && cardsFromImage === null;
  const showEditableBoxes = isPreAnalyze && userDrawnBoxes.length > 0;

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
              {isPreAnalyze && (
                <div className="box-instruction">
                  <div className="box-instruction-main">
                    Draw a box around each card: click and drag from one corner to the opposite
                    corner. Resize by dragging corners or edges.
                  </div>
                  {userDrawnBoxes.length === 0 && (
                    <div className="box-instruction-nudge">
                      Tip: Drawing boxes around each card before analyzing can improve detection.
                    </div>
                  )}
                </div>
              )}

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
                {!analyzing && (overlayBoxes.length > 0 || drawing || isPreAnalyze) && (
                  <div
                    ref={overlayRef}
                    className={`bbox-overlay ${isPreAnalyze ? "bbox-overlay-editable" : ""}`}
                    aria-hidden="true"
                    onMouseDown={(e) => {
                      if (
                        isPreAnalyze &&
                        !(e.target as HTMLElement).closest(".bbox-box") &&
                        !drawing
                      ) {
                        const rect = overlayRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const x = (e.clientX - rect.left) / rect.width;
                        const y = (e.clientY - rect.top) / rect.height;
                        setDrawing({ start: { x, y }, current: { x, y } });
                      }
                    }}
                  >
                    {overlayBoxes.map((item, i) => (
                      <div
                        key={showEditableBoxes ? `draw-${i}` : `card-${i}`}
                        className={`bbox-box ${selectedBoxIndex === i && showEditableBoxes ? "bbox-box-selected" : ""}`}
                        style={{
                          left: `${item.bbox[0] * 100}%`,
                          top: `${item.bbox[1] * 100}%`,
                          width: `${item.bbox[2] * 100}%`,
                          height: `${item.bbox[3] * 100}%`,
                        }}
                        title={
                          "card" in item && item.card
                            ? item.card.replace(/-/g, " ")
                            : `Box ${i + 1}`
                        }
                        onClick={(e) => {
                          if (
                            showEditableBoxes &&
                            !(e.target as HTMLElement).closest(".bbox-handle")
                          ) {
                            setSelectedBoxIndex(i);
                          }
                        }}
                      >
                        {showEditableBoxes &&
                          (["n", "s", "e", "w", "nw", "ne", "sw", "se"] as ResizeHandle[]).map(
                            (h) => (
                              <div
                                key={h}
                                className={`bbox-handle bbox-handle-${h}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setResizing({ boxIndex: i, handle: h });
                                }}
                                aria-label={`Resize ${h}`}
                              />
                            )
                          )}
                        <span className="bbox-label">{i + 1}</span>
                      </div>
                    ))}
                    {drawing && (
                      <div
                        className="bbox-draw-preview"
                        style={{
                          left: `${Math.min(drawing.start.x, drawing.current.x) * 100}%`,
                          top: `${Math.min(drawing.start.y, drawing.current.y) * 100}%`,
                          width: `${Math.abs(drawing.current.x - drawing.start.x) * 100}%`,
                          height: `${Math.abs(drawing.current.y - drawing.start.y) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
              </div>

              {isPreAnalyze && (
                <div className="analyze-actions">
                  {showEditableBoxes && (
                    <>
                      <button
                        type="button"
                        className="fix-action-btn"
                        onClick={handleDeleteDrawnBox}
                        disabled={selectedBoxIndex == null}
                      >
                        Remove selected box
                      </button>
                      <span className="analyze-actions-hint">
                        Select a box and press Delete to remove.
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    className="fix-action-btn fix-action-btn-primary"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                  >
                    {analyzing ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
              )}

              {cardsFromImage !== null && !analyzing && (
                <div className="image-result">
                  <div>
                    <strong>Cards in image:</strong> {sortedCards.length}
                  </div>
                  <SetsFound
                    setsFound={findAllSets(
                      cardsFromImage.map((c) => c.card.replace(/Outlined/g, "Empty"))
                    )}
                  />
                  {sortedCards.length > 0 && (
                    <div className="card-list">
                      {sortedCards.map((item, i) => {
                        const cardId = item.card.replace(/Outlined/g, "Empty");
                        return (
                          <div key={`${item.card}-${i}`} className="card-list-row">
                            <span className="card-list-num">{i + 1}.</span>
                            <span className="card-list-card">
                              <SetCardSVG
                                cardId={cardId}
                                width={120}
                                title={cardId.replace(/-/g, " ")}
                              />
                            </span>
                            <button
                              type="button"
                              className="card-list-delete"
                              onClick={() => handleDeleteCard(item)}
                              aria-label={`Remove card ${i + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="card-list-add">
                    <label htmlFor="add-card-select">Add card:</label>
                    <Select
                      key={`add-card-${sortedCards.length}`}
                      inputId="add-card-select"
                      placeholder="Choose…"
                      value={null}
                      options={allCards.map((c) => ({ label: c.split("-").join(" "), value: c }))}
                      onChange={(opt) => {
                        if (opt) {
                          handleAddCard(opt.value);
                        }
                      }}
                      formatOptionLabel={(opt) =>
                        opt ? (
                          <SetCardSVG cardId={opt.value} width={108} title={opt.label} />
                        ) : null
                      }
                      className="card-list-add-select-wrap"
                      classNamePrefix="select"
                      isClearable={false}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {mode === "visual" && (
        <section className="visual-section">
          <SetBoard cards={manualSelectedCards} boardWidth={3} />
          <SetsFound
            setsFound={findAllSets(manualSelectedCards)}
            visible={hasCardsSelected}
          />
          <p className="visual-instruction">Click or tap cards to select or deselect.</p>
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
          <SetBoard cards={manualSelectedCards} boardWidth={3} />
          <SetsFound
            setsFound={findAllSets(manualSelectedCards)}
            visible={hasCardsSelected}
          />
          <p>Select the visible cards.</p>
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
