// Photo downscaling before upload. Browser only.

async function drawScaled(file: Blob, maxDim: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** The photo with its longer side at most `maxDim` px, as a JPEG data URL. */
export async function resizeImage(file: Blob, maxDim = 1024, quality = 0.82): Promise<string> {
  return (await drawScaled(file, maxDim)).toDataURL("image/jpeg", quality);
}

/** The same as a JPEG Blob, for multipart uploads. */
export async function resizeImageBlob(file: Blob, maxDim = 1024, quality = 0.82): Promise<Blob> {
  const canvas = await drawScaled(file, maxDim);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))), "image/jpeg", quality),
  );
}
