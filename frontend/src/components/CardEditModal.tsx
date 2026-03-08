import { useEffect, useRef, useState } from "react";
import {
  parseCard,
  buildCard,
  numbers,
  colors,
  fills,
  shapes,
} from "../utils/setLogic";
import "./CardEditModal.css";

export const DEFAULT_CARD = "1-Red-Empty-Diamond";

interface CardEditModalProps {
  isOpen: boolean;
  currentCard: string;
  onClose: () => void;
  /** Edit mode: save changes to existing card */
  onUpdate?: (newCard: string) => void;
  /** Create mode: add new card */
  onCreate?: (newCard: string) => void;
  /** Edit mode only: remove card from board */
  onDelete?: () => void;
  mode: "edit" | "create";
  /** Create mode only: card strings already on the board (for duplicate validation) */
  existingCards?: string[];
}

function AttributeGroup({
  label,
  value,
  options,
  onChange,
  idPrefix,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="card-edit-attr" role="group" aria-labelledby={`${idPrefix}-label`}>
      <span id={`${idPrefix}-label`} className="card-edit-attr-label">
        {label}
      </span>
      <div className="card-edit-attr-options">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`card-edit-opt ${value === opt ? "card-edit-opt--selected" : ""}`}
            onClick={() => onChange(opt)}
            aria-pressed={value === opt}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CardEditModal({
  isOpen,
  currentCard,
  onClose,
  onUpdate,
  onCreate,
  onDelete,
  mode,
  existingCards = [],
}: CardEditModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [number, setNumber] = useState(numbers[0]!);
  const [color, setColor] = useState(colors[0]!);
  const [fill, setFill] = useState(fills[0]!);
  const [shape, setShape] = useState(shapes[0]!);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const parts = parseCard(currentCard);
    setNumber(parts.number);
    setColor(parts.color);
    setFill(parts.fill);
    setShape(parts.shape);
    setCreateError(null);
    dialogRef.current?.showModal();
  }, [isOpen, currentCard]);

  useEffect(() => {
    setCreateError(null);
  }, [number, color, fill, shape]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) dialogRef.current.close();
  };

  const builtCard = buildCard({ number, color, fill, shape });

  const handleSave = () => {
    if (mode === "create" && onCreate) {
      if (existingCards.includes(builtCard)) {
        setCreateError("This card is already on the board.");
        return;
      }
      onCreate(builtCard);
      dialogRef.current?.close();
    } else if (mode === "edit" && onUpdate) {
      onUpdate(builtCard);
      dialogRef.current?.close();
    }
  };

  const handleDelete = () => {
    onDelete?.();
    dialogRef.current?.close();
  };

  const title = mode === "create" ? "Add card" : "Edit card";
  const primaryLabel = mode === "create" ? "Create" : "Update";

  return (
    <dialog
      ref={dialogRef}
      className="card-edit-dialog"
      aria-labelledby="card-edit-title"
      onClick={handleBackdropClick}
    >
      <div className="card-edit-content" onClick={(e) => e.stopPropagation()}>
        <h2 id="card-edit-title" className="card-edit-title">
          {title}
        </h2>
        <AttributeGroup
          label="Number"
          value={number}
          options={numbers}
          onChange={setNumber}
          idPrefix="card-edit-number"
        />
        <AttributeGroup
          label="Color"
          value={color}
          options={colors}
          onChange={setColor}
          idPrefix="card-edit-color"
        />
        <AttributeGroup
          label="Fill"
          value={fill}
          options={fills}
          onChange={setFill}
          idPrefix="card-edit-fill"
        />
        <AttributeGroup
          label="Shape"
          value={shape}
          options={shapes}
          onChange={setShape}
          idPrefix="card-edit-shape"
        />
        {createError && (
          <p className="card-edit-error" role="alert">
            {createError}
          </p>
        )}
        <div className="card-edit-actions">
          <button
            type="button"
            className="card-edit-btn card-edit-btn-primary"
            onClick={handleSave}
          >
            {primaryLabel}
          </button>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              className="card-edit-btn card-edit-btn-danger"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="card-edit-btn card-edit-btn-secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
