import {useEffect, useState} from 'react';
import {setWindowsAccent} from './theme';

export function useWindowsAccent(enabled: boolean, endpoint?: string) {
  const [available, setAvailable] = useState<boolean>();
  useEffect(() => {
    if (!enabled || !endpoint) return;
    const url = endpoint;
    const controller = new AbortController();
    let pending = false;

    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch(url, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw new Error();
        const {accent} = await response.json();
        if (typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent)) throw new Error();
        if (controller.signal.aborted) return;
        setWindowsAccent(accent);
        setAvailable(true);
      } catch {
        if (controller.signal.aborted) return;
        setWindowsAccent(undefined);
        setAvailable(false);
      } finally {
        pending = false;
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 6000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      setWindowsAccent(undefined);
    };
  }, [enabled, endpoint]);
  return enabled && endpoint ? available : undefined;
}
