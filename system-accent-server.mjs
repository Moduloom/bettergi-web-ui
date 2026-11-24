import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {promisify} from 'node:util';

const readAccent = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $settings = [Windows.UI.ViewManagement.UISettings, Windows.UI.ViewManagement, ContentType=WindowsRuntime]::new()
  $kind = [Windows.UI.ViewManagement.UIColorType, Windows.UI.ViewManagement, ContentType=WindowsRuntime]::Accent
  $color = $settings.GetColorValue($kind)
  '#{0:x2}{1:x2}{2:x2}' -f $color.R, $color.G, $color.B
} catch {
  $color = Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Microsoft\Windows\DWM' -Name AccentColor
  '#{0:x2}{1:x2}{2:x2}' -f ($color -band 255), (($color -shr 8) -band 255), (($color -shr 16) -band 255)
}
`;
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const run = promisify(execFile);
let reading;
let current;
let refreshed = 0;

const mapAssets = process.env.LOOM_BETTERGI_MAP_ASSETS;
const mapImages = new Map([
  ['Teyvat', 'Teyvat_0_256.png'], ['TheChasm', 'TheChasm_0_1024.png'],
  ['Enkanomiya', 'Enkanomiya_0_1024.png'], ['SeaOfBygoneEras', 'SeaOfBygoneEras_0_1024.png'],
  ['AncientSacredMountain', 'AncientSacredMountain_0_1024.png'], ['TempleOfSpace', 'TempleOfSpace_0_1024.png'],
  ['MoonCanon', 'MoonCanon_0_1024.png'],
]);

function serveAsset(response, filename, contentType, trailer = '') {
  const asset = createReadStream(filename);
  asset.once('error', () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(404).end();
  });
  asset.once('open', () => {
    response.writeHead(200, {'Content-Type': contentType, 'Cache-Control': 'private, max-age=300'});
    asset.pipe(response, {end: !trailer});
  });
  if (trailer) asset.once('end', () => response.end(trailer));
  response.once('close', () => asset.destroy());
}

function editorTheme(accent) {
  if (!/^#[0-9a-f]{6}$/i.test(accent ?? '')) return '';
  const channels = accent.slice(1).match(/../g).map(value => parseInt(value, 16));
  const tint = ratio => channels.map(value => Math.round(value + (255 - value) * ratio)).join(',');
  const darken = ratio => channels.map(value => Math.round(value * ratio)).join(',');
  return `<style>
    :root, body, body[arco-theme] {
      --bgi-accent: ${accent}; --bgi-on-accent: white;
      --brand: var(--bgi-accent) !important;
      --brand-soft: color-mix(in srgb,var(--bgi-accent) 12%,white) !important;
      --primary-1: ${tint(.92)} !important; --primary-2: ${tint(.82)} !important; --primary-3: ${tint(.66)} !important;
      --primary-4: ${tint(.35)} !important; --primary-5: ${tint(.12)} !important; --primary-6: ${channels.join(',')} !important;
      --primary-7: ${darken(.88)} !important; --primary-8: ${darken(.74)} !important;
      --primary-9: ${darken(.62)} !important; --primary-10: ${darken(.5)} !important;
    }
    .arco-btn-primary:not(.arco-btn-status-danger,.arco-btn-status-success,.arco-btn-status-warning) { color: var(--bgi-on-accent); }
    @media (max-width: 1040px) {
      .route-bar .empty-route-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .route-toolbar .map-select { width: 118px; min-width: 0; }
      .route-heading, .arco-card-header-title { white-space: nowrap; }
      .arco-card-header:has(.point-header-actions) { height: auto; min-height: 48px; padding-block: 8px; column-gap: 8px; }
      .arco-card-header:has(.point-header-actions) > .arco-card-header-title { flex: 0 0 auto; }
      .arco-card-header:has(.point-header-actions) > .arco-card-header-extra { flex: 1 1 auto; min-width: 0; }
      .point-header-actions { flex-wrap: wrap; justify-content: flex-end; }
    }
  </style>`;
}

async function systemAccent() {
  if (current && Date.now() - refreshed < 2000) return current;
  if (!reading) {
    reading = run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', readAccent], {
      windowsHide: true, timeout: 4500, maxBuffer: 16384,
    }).then(({stdout}) => {
      const value = stdout.trim().toLowerCase();
      if (!/^#[a-f0-9]{6}$/.test(value)) throw new Error('Windows 未返回有效主题色');
      current = value;
      refreshed = Date.now();
      return value;
    }).finally(() => {reading = undefined;});
  }
  return reading;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(404).end();
    return;
  }
  const {pathname, searchParams} = new URL(request.url, 'http://127.0.0.1');
  if (pathname.startsWith('/map-') && !mapAssets) {
    response.writeHead(404).end();
    return;
  }
  if (pathname === '/map-editor-origin') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({origin: 'http://127.0.0.1:' + server.address().port}));
    return;
  }
  if (pathname === '/map-editor') {
    serveAsset(response, join(mapAssets, 'Editor', 'index.html'), 'text/html; charset=utf-8',
      editorTheme(searchParams.get('accent')));
    return;
  }
  if (pathname === '/map-image') {
    const name = searchParams.get('map');
    const filename = mapImages.get(name);
    if (filename) serveAsset(response, join(mapAssets, name, filename), 'image/png');
    else response.writeHead(404).end();
    return;
  }
  if (pathname !== '/accent') {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  try {
    response.end(JSON.stringify({accent: await systemAccent()}));
  } catch {
    response.writeHead(503).end(JSON.stringify({error: 'Windows 系统主题色暂不可用'}));
  }
});

process.stdin.resume();
process.stdin.once('end', () => server.close());
server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({port: server.address().port}) + '\n'));
