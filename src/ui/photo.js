// REC-7: a photo of the camera, turned as its EXIF says and scaled through a canvas to at most
// 1600 px on its long side, as a JPEG of quality 0.8. Browser only (ENG-9).
import { fitWithin, PHOTO_TYPE, PHOTO_QUALITY } from '#photos';

export const scalePhoto = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the photo could not be encoded'))), PHOTO_TYPE, PHOTO_QUALITY);
  });
};
