import type {LibraryThemeAdapter, Theme} from 'loom-frame';

export const accentPresets = [
  {name: 'Windows 蓝', color: '#0067c0'},
  {name: '青绿色', color: '#00796b'},
  {name: '紫色', color: '#7252b8'},
];

const defaultAccent = accentPresets[0].color;
let configuredAccent = defaultAccent;
let windowsAccent: string | undefined;
let previewTheme: {theme: Theme; custom: Record<string, string>} | undefined;

export const defaultThemes: Record<Theme['mode'], Theme> = {
  light: {
    mode: 'light', accent: defaultAccent, surface: '#f3f3f3', text: '#1b1b1b',
    muted: '#5d5d5d', border: '#dddddd', radius: 4, fontSize: 14,
    motion: 240, borderWidth: 1, shadow: 'soft',
  },
  dark: {
    mode: 'dark', accent: defaultAccent, surface: '#202020', text: '#ffffff',
    muted: '#c6c6c6', border: '#414141', radius: 4, fontSize: 14,
    motion: 240, borderWidth: 1, shadow: 'soft',
  },
};

export function themeVariables(theme: Theme): Record<string, string> {
  const dark = theme.mode === 'dark';
  return {
    '--bgi-accent': theme.accent,
    '--bgi-on-accent': '#ffffff',
    '--bgi-bg': theme.surface,
    '--bgi-text': theme.text,
    '--bgi-muted': theme.muted,
    '--bgi-border': theme.border,
    '--bgi-border-width': theme.borderWidth + 'px',
    '--bgi-radius': theme.radius + 'px',
    '--bgi-font': theme.fontSize + 'px',
    '--bgi-fast': theme.motion / 2 + 'ms',
    '--bgi-motion': theme.motion + 'ms',
    '--bgi-flyout-shadow': theme.shadow === 'none' ? 'none' : '0 8px 24px #0003',
    '--bgi-window-shadow': theme.shadow === 'none' ? 'none' : '0 12px 42px #0004',
    '--bgi-card': dark ? '#ffffff06' : '#ffffffb3',
    '--bgi-control': dark ? '#ffffff0f' : '#ffffffbd',
    '--bgi-hover': dark ? '#ffffff12' : '#00000009',
    '--bgi-pressed': dark ? '#ffffff0b' : '#0000000f',
    '--bgi-panel': dark ? '#292929' : '#fafafa',
    '--bgi-menu': dark ? '#2c2c2c' : '#fcfcfc',
    '--bgi-success': dark ? '#6ccb5f' : '#0f7b0f',
    '--bgi-warning': dark ? '#fce100' : '#835b00',
    '--bgi-danger': dark ? '#ff99a4' : '#c42b1c',
  };
}

export const themeAdapter: LibraryThemeAdapter = {
  exportCss(theme, custom) {
    const rules = Object.entries({...themeVariables(theme), ...custom})
      .map(([key, value]) => '  ' + key + ': ' + value + ';');
    return ':root {\n  color-scheme: ' + theme.mode + ';\n' + rules.join('\n') + '\n}';
  },
};

function renderTheme(theme: Theme, custom: Record<string, string>) {
  const root = document.documentElement;
  const variables = {...themeVariables(theme), ...custom};
  configuredAccent = variables['--bgi-accent'];
  variables['--bgi-accent'] = windowsAccent ?? configuredAccent;
  root.dataset.bgiMode = theme.mode;
  root.style.colorScheme = theme.mode;
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value);
  }
}

export function applyTheme(theme: Theme, custom: Record<string, string>) {
  previewTheme = {theme, custom};
  renderTheme(theme, custom);
}

export function setWindowsAccent(accent: string | undefined) {
  windowsAccent = accent;
  document.documentElement.style.setProperty('--bgi-accent', accent ?? configuredAccent);
}

export function togglePreviewMode() {
  if (!previewTheme) return;
  const {theme, custom} = previewTheme;
  const mode = document.documentElement.dataset.bgiMode === 'dark' ? 'light' : 'dark';
  const palette = defaultThemes[mode];
  renderTheme(mode === theme.mode ? theme : {...theme, mode, surface: palette.surface,
    text: palette.text, muted: palette.muted, border: palette.border}, custom);
}
