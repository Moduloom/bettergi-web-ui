import type {FrameConfig} from 'loom-frame';
import {accentPresets, defaultThemes} from './theme.ts';

export default {
  name: 'BetterGI UI',
  outDir: 'dist/bettergi-ui',
  storage: {namespace: 'bettergi-ui'},
  libraries: [{
    key: 'bettergi-ui',
    name: 'BetterGI UI',
    description: '以 BetterGI refactor/20260930 分支的 WPF 界面为参考。',
    catalog: './catalog.ts',
    renderer: './renderer.tsx',
    themeAdapter: './theme.ts',
    sourceRoots: ['.'],
    styles: ['styles.css', 'window.css'],
    defaults: defaultThemes,
    accentPresets,
  }],
  plugins: [{
    key: 'bettergi-system',
    enabled: process.platform === 'win32',
    runtime: {command: process.execPath, args: ['system-accent-server.mjs']},
  }],
} satisfies FrameConfig;
