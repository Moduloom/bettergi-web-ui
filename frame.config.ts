import type {FrameConfig} from 'loom-frame';
import {accentPresets, defaultThemes} from './src/styles/theme.ts';

export default {
  name: 'BetterGI UI',
  outDir: 'dist/bettergi-ui',
  base: process.env.BETTERGI_PREVIEW_BASE,
  storage: {namespace: 'bettergi-ui'},
  libraries: [{
    key: 'bettergi-ui',
    name: 'BetterGI UI',
    description: '以 BetterGI refactor/20260930 分支的 WPF 界面为参考。',
    catalog: './src/preview/catalog.ts',
    renderer: './src/preview/renderer.tsx',
    themeAdapter: './src/styles/theme.ts',
    sourceRoots: ['./src'],
    styles: ['src/styles/styles.css', 'src/styles/window.css'],
    defaults: defaultThemes,
    accentPresets,
  }],
  plugins: [{
    key: 'bettergi-system',
    enabled: process.platform === 'win32',
    runtime: {command: process.execPath, args: ['src/server/system-accent-server.mjs']},
  }],
} satisfies FrameConfig;
