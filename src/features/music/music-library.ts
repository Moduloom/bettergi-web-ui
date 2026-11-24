import {readScore, type Score} from './music-score';

export type ScoreDirectory = {id: string; name: string; scores: Score[]};
const changes = 'bettergi-music-library';
const storeName = 'directories';

async function openLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(changes, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readDirectories(): Promise<ScoreDirectory[]> {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveDirectory(directory: ScoreDirectory | string) {
  const database = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      if (typeof directory === 'string') store.delete(directory);
      else store.put(directory);
    });
  } finally {
    database.close();
  }
  window.dispatchEvent(new Event(changes));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(changes);
    channel.postMessage(null);
    channel.close();
  }
}

export function watchDirectories(update: () => void) {
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(changes);
  channel?.addEventListener('message', update);
  window.addEventListener(changes, update);
  return () => {
    channel?.close();
    window.removeEventListener(changes, update);
  };
}

export async function scanScores(files: File[], previous?: ScoreDirectory, legacy = false) {
  const result: Score[] = [];
  const previousIds = new Map(previous?.scores.map(score => [score.filename, score.id]));
  for (const file of files) {
    if (!legacy && !/\.(json|midi?)$/i.test(file.name)) continue;
    const score = await readScore(file);
    result.push({...score, id: previousIds.get(score.filename) ?? score.id});
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', {numeric: true}));
}
