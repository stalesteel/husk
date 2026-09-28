// Krymper et bilde fra kamera eller bildebibliotek til JPEG før opplasting.
// Hele bildet beholdes (ikke beskåret til kvadrat), så det kan brukes med et
// annet utsnitt senere. 1600 px på den lengste siden er godt nok på alle
// mobilskjermer og holder filene på et par hundre kB.
export async function prepareImage(file, maxSize = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kunne ikke lage JPEG'))), 'image/jpeg', quality);
  });
}
