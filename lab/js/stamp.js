import { SUITS } from "./cards.js?v=26";

/** Cover the artwork's baked-in index and paint the real suit and rank on both corners. */
export function stampCanvas(img, suit, rank) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 400;
  canvas.height = img.naturalHeight || img.height || 622;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(w * 0.03, h * 0.902, w * 0.32, h * 0.08);
  const info = SUITS[suit];
  const text = `${info?.symbol || ""}${rank}`;
  const paint = (x, y) => {
    ctx.font = `700 ${Math.max(12, Math.round(w * 0.07))}px sans-serif`;
    ctx.fillStyle = info?.red ? "#8e2a24" : "#1b1916";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  };
  paint(w * 0.055, h * 0.055);
  paint(w * 0.055, h * 0.948);
  return canvas;
}

export function stampURL(src, suit, rank) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try { resolve(stampCanvas(img, suit, rank).toDataURL("image/jpeg", 0.86)); }
      catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
