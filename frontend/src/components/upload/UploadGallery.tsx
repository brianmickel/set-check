import type React from "react";
import { ImageGallery } from "../ImageGallery";
import type { GalleryItem } from "../../api";

interface Props {
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  selectedUploadKey: string | null;
  handleGallerySelect: (key: string) => void;
  handleDelete: (key: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  busy: boolean;
  uploadError: string | null;
}

export function UploadGallery({
  galleryItems,
  galleryLoading,
  selectedUploadKey,
  handleGallerySelect,
  handleDelete,
  fileInputRef,
  handleFileChange,
  busy,
  uploadError,
}: Props) {
  return (
    <>
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
    </>
  );
}
