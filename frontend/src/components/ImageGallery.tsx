import { getImageUrl, type GalleryItem } from "../api";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  items: GalleryItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onUploadNew: () => void;
  disabled?: boolean;
}

export function ImageGallery({ items, selectedKey, onSelect, onUploadNew, disabled }: Props) {
  // Show newest first
  const sorted = [...items].sort((a, b) => b.uploadedAt - a.uploadedAt);

  return (
    <div className="gallery">
      <div className="gallery-grid">
        <button
          type="button"
          className="gallery-upload-tile"
          onClick={onUploadNew}
          disabled={disabled}
          aria-label="Upload new photo"
        >
          <span className="gallery-upload-icon">+</span>
          <span className="gallery-upload-label">New photo</span>
        </button>
        {sorted.map((item) => {
          const selected = item.key === selectedKey;
          return (
            <button
              key={item.key}
              type="button"
              className={`gallery-tile ${selected ? "gallery-tile--selected" : ""}`}
              onClick={() => onSelect(item.key)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`Photo from ${timeAgo(item.uploadedAt)}`}
            >
              <img
                src={getImageUrl(item.key)}
                alt=""
                className="gallery-thumb"
                loading="lazy"
              />
              <span className="gallery-tile-time">{timeAgo(item.uploadedAt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
