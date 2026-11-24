import {useEffect, useRef, useState} from 'react';

const appValueEvent = 'bettergi-app-value';

export function clearAppValue(key: string) {
  const storageKey = 'bettergi-ui:app:' + key;
  localStorage.removeItem(storageKey);
  window.dispatchEvent(new StorageEvent('storage', {key: storageKey, newValue: null}));
}

function readAppValue<T>(storageKey: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? fallback : JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function useAppValue<T>(key: string, fallback: T) {
  const storageKey = 'bettergi-ui:app:' + key;
  const [selection, setSelection] = useState(() => ({storageKey, value: readAppValue(storageKey, fallback)}));
  const current = useRef(selection);
  const defaultValue = useRef(fallback);
  defaultValue.current = fallback;
  const matching = selection.storageKey === storageKey ? selection : {storageKey, value: readAppValue(storageKey, fallback)};
  if (matching !== selection) {
    // A reused field can bind to a different setting when its tab or record changes.
    current.current = matching;
    setSelection(matching);
  }

  useEffect(() => {
    function receive(next: T) {
      if (current.current.storageKey !== storageKey || Object.is(current.current.value, next)) return;
      current.current = {storageKey, value: next};
      setSelection(current.current);
    }
    function onValue(event: Event) {
      const detail = (event as CustomEvent<{key: string; value: T}>).detail;
      if (detail.key === storageKey) receive(detail.value);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return;
      try {
        receive(event.newValue === null ? defaultValue.current : JSON.parse(event.newValue) as T);
      } catch {
        receive(defaultValue.current);
      }
    }
    window.addEventListener(appValueEvent, onValue);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(appValueEvent, onValue);
      window.removeEventListener('storage', onStorage);
    };
  }, [storageKey]);

  function update(next: T | ((previous: T) => T)) {
    const previous = current.current.storageKey === storageKey ? current.current.value : readAppValue(storageKey, fallback);
    const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    if (current.current.storageKey === storageKey) {
      current.current = {storageKey, value: result};
      setSelection(current.current);
    }
    window.dispatchEvent(new CustomEvent(appValueEvent, {detail: {key: storageKey, value: result}}));
    try {
      localStorage.setItem(storageKey, JSON.stringify(result));
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }

  return [matching.value, update] as const;
}
