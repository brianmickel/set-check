import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ensureJpegOrPassthrough } from "../utils/heic";
import { resizeImageForAnalyze } from "../utils/imageResize";
import {
  uploadImage,
  analyzeImage,
  listUploads,
  getImageUrl,
  deleteUpload,
  type CardWithBbox,
  type GalleryItem,
} from "../api";
import { sortCardsByTopLeft } from "../utils/setLogic";
import type { VisionProvider } from "../api/health";

export function useUploadMode(selectedModel: VisionProvider | "auto", isActive: boolean) {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [selectedUploadKey, setSelectedUploadKey] = useState<string | null>(null);
  const [freshBlobUrl, setFreshBlobUrl] = useState<string | null>(null);
  const [cardsFromImage, setCardsFromImage] = useState<CardWithBbox[] | null>(null);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (freshBlobUrl) URL.revokeObjectURL(freshBlobUrl);
    };
  }, [freshBlobUrl]);

  // Load gallery when tab becomes active
  useEffect(() => {
    if (!isActive) return;
    setGalleryLoading(true);
    listUploads()
      .then((items) => {
        setGalleryItems(items);
        if (items.length > 0 && !selectedUploadKey) {
          const newest = [...items].sort((a, b) => b.uploadedAt - a.uploadedAt)[0];
          setSelectedUploadKey(newest.key);
        }
      })
      .finally(() => setGalleryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadError(null);
    setCardsFromImage(null);

    let processedFile: File;
    try {
      const converted = await ensureJpegOrPassthrough(file);
      processedFile = await resizeImageForAnalyze(converted);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Invalid image");
      return;
    }

    if (freshBlobUrl) URL.revokeObjectURL(freshBlobUrl);
    setFreshBlobUrl(URL.createObjectURL(processedFile));
    setSelectedUploadKey(null);

    setUploading(true);
    try {
      const { uploadKey } = await uploadImage(processedFile);
      const newEntry: GalleryItem = {
        key: uploadKey,
        uploadedAt: Date.now(),
        mime: processedFile.type || "image/jpeg",
      };
      setGalleryItems((prev) => [newEntry, ...prev].slice(0, 10));
      setSelectedUploadKey(uploadKey);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed — try again.");
      if (freshBlobUrl) URL.revokeObjectURL(freshBlobUrl);
      setFreshBlobUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleGallerySelect = useCallback(
    (key: string) => {
      if (freshBlobUrl) {
        URL.revokeObjectURL(freshBlobUrl);
        setFreshBlobUrl(null);
      }
      setSelectedUploadKey(key);
      setCardsFromImage(null);
      setUploadError(null);
    },
    [freshBlobUrl]
  );

  const handleDelete = useCallback(
    async (key: string) => {
      setUploadError(null);
      try {
        await deleteUpload(key);
        setGalleryItems((prev) => prev.filter((e) => e.key !== key));
        if (selectedUploadKey === key) {
          setSelectedUploadKey(null);
          setCardsFromImage(null);
          if (freshBlobUrl) {
            URL.revokeObjectURL(freshBlobUrl);
            setFreshBlobUrl(null);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("Delete error:", err);
        setUploadError(err instanceof Error ? err.message : "Could not delete — try again.");
      }
    },
    [selectedUploadKey, freshBlobUrl]
  );

  const runAnalyze = useCallback(async () => {
    if (!selectedUploadKey) return;
    setUploadError(null);
    setAnalyzing(true);
    try {
      const provider = selectedModel === "auto" ? undefined : selectedModel;
      const { cards } = await analyzeImage(selectedUploadKey, provider);
      setCardsFromImage(cards);
      setEditingCardIndex(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Analyze error:", err);
      setUploadError(
        err instanceof Error ? err.message : "Something went wrong — try again later."
      );
    } finally {
      setAnalyzing(false);
    }
  }, [selectedUploadKey, selectedModel]);

  const sortedCards = useMemo(
    () => (cardsFromImage ? sortCardsByTopLeft(cardsFromImage) : []),
    [cardsFromImage]
  );

  const editingCard = useMemo(
    () =>
      editingCardIndex != null ? sortedCards[editingCardIndex] ?? null : null,
    [editingCardIndex, sortedCards]
  );

  const handleCardClick = useCallback((index: number) => {
    setEditingCardIndex(index);
  }, []);

  const handleUpdateCard = useCallback((index: number, newCard: string) => {
    setCardsFromImage((prev) => {
      if (!prev) return prev;
      const sorted = sortCardsByTopLeft(prev);
      const target = sorted[index];
      if (!target) return prev;
      return prev.map((c) => (c === target ? { ...c, card: newCard } : c));
    });
    setEditingCardIndex(null);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setEditingCardIndex(null);
  }, []);

  const busy = uploading || analyzing;
  const previewSrc = freshBlobUrl ?? (selectedUploadKey ? getImageUrl(selectedUploadKey) : null);
  const overlayBoxes = cardsFromImage ?? [];
  const showBboxOverlay =
    overlayBoxes.length > 0 && overlayBoxes.some((item) => item.bbox[2] > 0 && item.bbox[3] > 0);

  return {
    galleryItems,
    galleryLoading,
    selectedUploadKey,
    cardsFromImage,
    sortedCards,
    uploading,
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
  };
}
