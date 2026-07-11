// Turn a picked image File into a compact data-URL suitable for storing inline
// in localStorage (slides keep everything local — nothing is uploaded). Large
// photos are downscaled and re-encoded as JPEG so a deck with a few images
// stays well under the storage quota.

export async function fileToDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.8,
): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("That file isn't a valid image."));
    im.src = original;
  });

  let { width, height } = img;
  if (!width || !height) return original;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  // JPEG keeps size small (drops transparency, fine for slide images).
  return canvas.toDataURL("image/jpeg", quality);
}
