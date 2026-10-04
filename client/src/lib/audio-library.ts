export interface LocalTrack {
  id: string;
  name: string;
  blob: Blob;
}
export type LocalTrackInfo = Omit<LocalTrack, 'blob'>;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('playroom-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('音乐库无法打开，请检查浏览器存储权限。'));
    request.onblocked = () => reject(new Error('请关闭其他旧版本页面后重试导入。'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', mode);
    const request = run(tx.objectStore('tracks'));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('音乐保存失败，浏览器存储空间可能不足。'));
    };
  });
}
export const getLocalTrack = (id: string) =>
  transaction<LocalTrack | undefined>('readonly', (s) => s.get(id));
export async function listLocalTracks(): Promise<LocalTrackInfo[]> {
  const tracks = await transaction<LocalTrack[]>('readonly', (s) => s.getAll());
  return tracks.map(({ id, name }) => ({ id, name }));
}
export async function saveLocalTrack(file: File): Promise<LocalTrackInfo> {
  const track: LocalTrack = {
    id: `custom:${crypto.randomUUID()}`,
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
    blob: file,
  };
  await transaction('readwrite', (s) => s.put(track));
  return { id: track.id, name: track.name };
}
export const removeLocalTrack = (id: string) => transaction('readwrite', (s) => s.delete(id));
