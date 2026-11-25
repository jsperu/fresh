import sharp from 'sharp';

export async function compressImage(src, dest, { maxWidth = 1600, quality = 72 } = {}) {
  await sharp(src)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(dest);
  return dest;
}

export async function pdfFirstPageToJpeg(src, dest, { maxWidth = 1600, quality = 72 } = {}) {
  await sharp(src, { density: 200 })
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(dest);
  return dest;
}
