import type React from "react";
import { ImagePreview } from "./ImagePreview";
import { CardEditModal, DEFAULT_CARD } from "./CardEditModal";
import { AnalyzeControls, UploadBoardSummary, UploadGallery } from "./upload";
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
        <UploadBoardSummary
          cardsFromImage={cardsFromImage}
          sortedCards={sortedCards}
          analysisFromCache={analysisFromCache}
          confirming={confirming}
          confirmError={confirmError}
          confirmSuccess={confirmSuccess}
          handleConfirmCorrect={handleConfirmCorrect}
          invalidating={invalidating}
          invalidateError={invalidateError}
          handleInvalidateCache={handleInvalidateCache}
          busy={busy}
          handleCardClick={handleCardClick}
          handleOpenAddCard={handleOpenAddCard}
        />
      )}

      <AnalyzeControls
        providers={providers}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        runAnalyze={runAnalyze}
        busy={busy}
        analyzing={analyzing}
        selectedUploadKey={selectedUploadKey}
      />

      {previewSrc && (
        <ImagePreview
          src={previewSrc}
          uploading={uploading}
          analyzing={analyzing}
          overlayBoxes={overlayBoxes}
          showBboxOverlay={showBboxOverlay}
        />
      )}

      <UploadGallery
        galleryItems={galleryItems}
        galleryLoading={galleryLoading}
        selectedUploadKey={selectedUploadKey}
        handleGallerySelect={handleGallerySelect}
        handleDelete={handleDelete}
        fileInputRef={fileInputRef}
        handleFileChange={handleFileChange}
        busy={busy}
        uploadError={uploadError}
      />
    </section>
  );
}
