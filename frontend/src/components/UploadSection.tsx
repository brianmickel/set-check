import type React from "react";
import { ModelSelector } from "./ModelSelector";
import { ImageGallery } from "./ImageGallery";
import { ImagePreview } from "./ImagePreview";
import { SetBoard } from "./SetBoard";
import { SetsFound } from "./SetsFound";
import { CardEditModal, DEFAULT_CARD } from "./CardEditModal";
import { findAllSets } from "../utils/setLogic";
import type { CardWithBbox, GalleryItem } from "../api";
import type { VisionProvider, ProviderOption } from "../api/health";

interface Props {
  // from useUploadMode
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  selectedUploadKey: string | null;
  cardsFromImage: CardWithBbox[] | null;
  sortedCards: CardWithBbox[];
  uploading: boolean;
  analyzing: boolean;
  uploadError: string | null;
  busy: boolean;
  previewSrc: string | null;
  overlayBoxes: CardWithBbox[];
  showBboxOverlay: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGallerySelect: (key: string) => void;
  handleDelete: (key: string) => void;
  runAnalyze: () => void;
  editingCard: CardWithBbox | null;
  editingCardIndex: number | null;
  handleCardClick: (index: number) => void;
  handleUpdateCard: (index: number, newCard: string) => void;
  handleCloseEditModal: () => void;
  handleDeleteCard: () => void;
  isAddCardModalOpen: boolean;
  handleOpenAddCard: () => void;
  handleCloseAddCardModal: () => void;
  handleAddCard: (newCard: string) => void;
  lastAnalyzeProvider: string | null;
  analysisFromCache: boolean;
  confirming: boolean;
  confirmError: string | null;
  confirmSuccess: boolean;
  handleConfirmCorrect: () => void;
  invalidating: boolean;
  invalidateError: string | null;
  handleInvalidateCache: () => void;
  // from App
  providers: ProviderOption[];
  selectedModel: VisionProvider | "auto";
  onModelChange: (v: VisionProvider | "auto") => void;
}

export function UploadSection({
  galleryItems,
  galleryLoading,
  selectedUploadKey,
  cardsFromImage,
  sortedCards,
  analyzing,
  uploadError,
  busy,
  previewSrc,
  overlayBoxes,
  showBboxOverlay,
  fileInputRef,
  handleFileChange,
  handleGallerySelect,
  handleDelete,
  runAnalyze,
  editingCard,
  editingCardIndex,
  handleCardClick,
  handleUpdateCard,
  handleCloseEditModal,
  handleDeleteCard,
  isAddCardModalOpen,
  handleOpenAddCard,
  handleCloseAddCardModal,
  handleAddCard,
  lastAnalyzeProvider: _lastAnalyzeProvider,
  analysisFromCache,
  confirming,
  confirmError,
  confirmSuccess,
  handleConfirmCorrect,
  invalidating,
  invalidateError,
  handleInvalidateCache,
  providers,
  selectedModel,
  onModelChange,
  uploading,
}: Props) {
  return (
    <section className="upload-section">
      {isAddCardModalOpen && (
        <CardEditModal
          isOpen
          mode="create"
          currentCard={DEFAULT_CARD}
          onClose={handleCloseAddCardModal}
          onCreate={handleAddCard}
          existingCards={sortedCards.map((c) => c.card.replace(/Outlined/g, "Empty"))}
        />
      )}
      {editingCard != null && editingCardIndex != null && (
        <CardEditModal
          isOpen
          mode="edit"
          currentCard={editingCard.card.replace(/Outlined/g, "Empty")}
          onClose={handleCloseEditModal}
          onUpdate={(newCard) => handleUpdateCard(editingCardIndex, newCard)}
          onDelete={handleDeleteCard}
        />
      )}
      {cardsFromImage !== null && !analyzing && (
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
            cards={sortedCards.map((c) => c.card.replace(/Outlined/g, "Empty"))}
            boardWidth={3}
            onCardClick={handleCardClick}
            onAddCard={handleOpenAddCard}
          />
          <SetsFound
            setsFound={findAllSets(cardsFromImage.map((c) => c.card.replace(/Outlined/g, "Empty")))}
            visible={sortedCards.length > 0}
          />
        </div>
      )}

      <div className="analyze-controls">
        <ModelSelector
          providers={providers}
          selected={selectedModel}
          onChange={onModelChange}
          disabled={busy}
        />
        <button
          type="button"
          className="analyze-button"
          onClick={runAnalyze}
          disabled={busy || !selectedUploadKey}
        >
          {analyzing ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {previewSrc && (
        <ImagePreview
          src={previewSrc}
          uploading={uploading}
          analyzing={analyzing}
          overlayBoxes={overlayBoxes}
          showBboxOverlay={showBboxOverlay}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFileChange}
        disabled={busy}
        className="file-input"
        aria-label="Choose image"
      />

      {galleryLoading && (
        <div className="gallery-loading">Loading your photos…</div>
      )}

      {!galleryLoading && (
        <ImageGallery
          items={galleryItems}
          selectedKey={selectedUploadKey}
          onSelect={handleGallerySelect}
          onUploadNew={() => fileInputRef.current?.click()}
          onDelete={handleDelete}
          disabled={busy}
        />
      )}

      {uploadError && (
        <div className="upload-error" role="alert">
          {uploadError}
        </div>
      )}
    </section>
  );
}
