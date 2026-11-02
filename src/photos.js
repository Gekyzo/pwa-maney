// The rules of a receipt photo: its scale (REC-7) and the photos that the sync sweeps at a start
// (SYNC-15). Pure: no DOM, no storage, no clock.
export const PHOTO_MAX = 1600;
export const PHOTO_TYPE = 'image/jpeg';
export const PHOTO_QUALITY = 0.8;

// REC-7: the size that fits `max` on the long side with the same ratio; a side is at least 1 px.
// A picture that fits already keeps its size.
export const fitWithin = (width, height, max = PHOTO_MAX) => {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const side = (value) => Math.max(1, Math.round((value * max) / long));
  return { width: side(width), height: side(height) };
};

const docPhotos = (doc) => doc.receipts.map(({ photo }) => photo).filter(Boolean);

// SYNC-15: the pending photos that no receipt of the doc and no queued receipt upsert names.
export const orphanPhotos = (pendingKeys, doc, queue) => {
  const named = new Set([
    ...docPhotos(doc),
    ...queue.filter(({ kind, op }) => kind === 'receipt' && op === 'upsert').map(({ data }) => data?.photo).filter(Boolean),
  ]);
  return pendingKeys.filter((key) => !named.has(key));
};

// SYNC-15: the photos of the receipt tombstones of the server copy, and the `dropped` photos that a
// pushed receipt no longer names, each once, less those that a receipt of the doc names and those
// already in `gone`.
export const gonePhotos = (server, doc, gone, dropped = []) => {
  const named = new Set(docPhotos(doc));
  const tombstoned = [...server.values()].filter(({ kind, deleted, data }) => kind === 'receipt' && deleted && data?.photo).map(({ data }) => data.photo);
  return [...new Set([...tombstoned, ...dropped])].filter((key) => !named.has(key) && !gone.includes(key));
};
