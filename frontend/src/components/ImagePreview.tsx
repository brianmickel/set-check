import type { CardWithBbox } from "../api";

interface Props {
  src: string;
  uploading: boolean;
  analyzing: boolean;
  overlayBoxes: CardWithBbox[];
  showBboxOverlay: boolean;
}

export function ImagePreview({ src, uploading, analyzing, overlayBoxes, showBboxOverlay }: Props) {
  const busy = uploading || analyzing;
  return (
    <div className="upload-preview-wrap">
      <div className="preview-wrap">
        <img src={src} alt="Selected Set cards" className="preview-image" />
        {busy && (
          <div className="preview-overlay" aria-hidden="true">
            <div className="spinner" aria-label="Processing" />
            <span className="spinner-label">{uploading ? "Uploading…" : "Analyzing…"}</span>
          </div>
        )}
        {!busy && showBboxOverlay && (
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
                title={item.card ? item.card.replace(/-/g, " ") : `Card ${i + 1}`}
              >
                <span className="bbox-label">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
