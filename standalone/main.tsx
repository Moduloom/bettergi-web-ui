import {useEffect, useLayoutEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import 'loom-frame/ui/styles.css';
import '../styles.css';
import '../window.css';
import './standalone.css';
import {BetterGIApp} from '../app';
import {useAppValue} from '../app-state';
import type {WindowThemePreference} from '../app-settings';
import {applyTheme, defaultThemes} from '../theme';

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const hostedOrigin = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) ? location.origin : undefined;

function App() {
  const [value, onChange] = useAppValue<WindowThemePreference>('appearance/window-theme', 'system');
  const [systemDark, setSystemDark] = useState(darkScheme.matches);
  const mode = value === 'system' ? (systemDark ? 'dark' : 'light') : value;

  useEffect(() => {
    const refresh = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    darkScheme.addEventListener('change', refresh);
    return () => darkScheme.removeEventListener('change', refresh);
  }, []);

  useLayoutEffect(() => {
    applyTheme(defaultThemes[mode], {});
  }, [mode]);

  return <main className="bgi-standalone">
    <BetterGIApp hostedOrigin={hostedOrigin} accentEndpoint={new URL('./system-accent', location.href).href}
      windowTheme={{value, onChange}}/>
  </main>;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App/>);
