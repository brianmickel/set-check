import type React from "react";
import { ModelSelector } from "./ModelSelector";
import { ImageGallery } from "./ImageGallery";
import { ImagePreview } from "./ImagePreview";
import { SetBoard } from "./SetBoard";
import { SetsFound } from "./SetsFound";
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
  providers,
  selectedModel,
  onModelChange,
  uploading,
}: Props) {
  return (
    <section className="upload-section">
      {cardsFromImage !== null && !analyzing && (
        <div className="upload-board-summary">
          <SetBoard
            cards={sortedCards.map((c) => c.card.replace(/Outlined/g, "Empty"))}
            boardWidth={3}
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
