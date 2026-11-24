import {useEffect, useState} from 'react';
import {clearAppValue} from '../../app/app-state';
import {emptyInventory, type Inventory} from './inventory-exchange';

const storeName = 'accounts';
const changeName = 'bettergi-inventory-change';

function openInventory() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bettergi-ui-account-inventory', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function legacy(accountId: string): Inventory {
  try {
    const value = JSON.parse(localStorage.getItem('bettergi-ui:app:inventory/' + accountId) ?? 'null');
    return Array.isArray(value?.items) && Array.isArray(value.events) ? value : emptyInventory;
  } catch {
    return emptyInventory;
  }
}

async function loadInventory(accountId: string) {
  const database = await openInventory();
  try {
    return await new Promise<Inventory>((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(accountId);
      request.onsuccess = () => resolve(request.result ?? legacy(accountId));
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function broadcast(accountId: string, value: Inventory) {
  window.dispatchEvent(new CustomEvent(changeName, {detail: {accountId, value}}));
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(changeName);
  channel.postMessage(accountId);
  channel.close();
}

export async function saveInventory(accountId: string, update: (previous: Inventory) => Inventory) {
  const database = await openInventory();
  try {
    const saved = await new Promise<Inventory>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      let next: Inventory;
      const request = store.get(accountId);
      request.onsuccess = () => {
        try {
          next = update(request.result ?? legacy(accountId));
          store.put(next, accountId);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    broadcast(accountId, saved);
    return saved;
  } finally {
    database.close();
  }
}

export async function removeInventory(accountId: string) {
  const database = await openInventory();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(accountId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    clearAppValue('inventory/' + accountId);
    broadcast(accountId, emptyInventory);
  } finally {
    database.close();
  }
}

export function useInventory(accountId: string) {
  const [data, setData] = useState<Inventory>(() => legacy(accountId));
  const [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    let version = 0;
    function load() {
      const current = ++version;
      void loadInventory(accountId).then(value => {
        if (alive && current === version) {setData(value); setStatus('');}
      }).catch(() => {
        if (alive && current === version) setStatus('无法加载本地库存记录。');
      });
    }
    function receive(event: Event) {
      const detail = (event as CustomEvent<{accountId: string; value: Inventory}>).detail;
      if (detail?.accountId !== accountId) return;
      ++version;
      setData(detail.value);
      setStatus('');
    }
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(changeName);
    if (channel) channel.onmessage = event => {if (event.data === accountId) load();};
    window.addEventListener(changeName, receive);
    load();
    return () => {
      alive = false;
      channel?.close();
      window.removeEventListener(changeName, receive);
    };
  }, [accountId]);
  return {data, status};
}
