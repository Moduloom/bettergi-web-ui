export type ScriptKind = 'scripts' | 'pathing' | 'recordings';

export type ScriptSetting = {
  name: string; label: string; type: 'separator' | 'input-text' | 'select' | 'checkbox' | 'multi-checkbox' | 'cascade-select';
  options?: string[]; cascade?: Record<string, string[]>; initial?: unknown;
};
export type ScriptResource = {
  id: string; label: string; filename: string; content?: string;
  directory?: string; version?: string; description?: string; settings?: ScriptSetting[];
  settingsHtml?: string; createdAt?: string;
};

const settingTypes = ['separator', 'input-text', 'select', 'checkbox', 'multi-checkbox', 'cascade-select'];

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function field(source: Record<string, unknown> | undefined, ...names: string[]) {
  return names.map(name => source?.[name]).find(value => value !== undefined);
}
function text(value: unknown) {return typeof value === 'string' ? value : '';}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function relative(file: File) {
  const path = file.webkitRelativePath.replaceAll('\\', '/');
  return path ? path.split('/').slice(1).join('/') : file.name;
}
function checkedPath(path: string) {
  const value = path.replaceAll('\\', '/');
  return value && value.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes(':')) ? value : '';
}
function filename(path: string) {
  return path.split('/').at(-1) ?? path;
}

export function readSettings(value: unknown): ScriptSetting[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    const row = object(entry);
    const type = text(field(row, 'type', 'Type'));
    const name = type === 'separator' ? '__separator-' + index : text(field(row, 'name', 'Name'));
    if (!name || seen.has(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || !settingTypes.includes(type)) return [];
    seen.add(name);
    const cascade = object(field(row, 'cascade_options', 'cascadeOptions', 'CascadeOptions')) ?? {};
    return [{
      type: type as ScriptSetting['type'], name, label: text(field(row, 'label', 'Label')),
      options: strings(field(row, 'options', 'Options')),
      cascade: Object.fromEntries(Object.entries(cascade).map(([label, list]) => [label, strings(list)])),
      initial: field(row, 'default', 'Default'),
    }];
  });
}

async function readJson(file: File | undefined) {
  if (!file) return undefined;
  return JSON.parse((await file.text()).replace(/^\uFEFF/, '')) as unknown;
}

export async function importScriptResources(kind: ScriptKind, files: readonly File[]) {
  const accepted: ScriptResource[] = [];
  const issues: string[] = [];
  const byPath = new Map(files.map(file => [relative(file), file]));
  const manifests = kind === 'scripts' && [...byPath.keys()].some(path => filename(path).toLowerCase() === 'manifest.json');

  for (const [path, file] of byPath) {
    if (kind === 'scripts' && !(manifests ? filename(path).toLowerCase() === 'manifest.json' : /\.(?:js|mjs)$/i.test(path))) continue;
    if (kind !== 'scripts' && !/\.json$/i.test(path)) continue;
    try {
      if (manifests) {
        const manifest = object(await readJson(file));
        const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const scope = directory ? directory + '/' : '';
        const main = checkedPath(text(field(manifest, 'main', 'Main')));
        const label = text(field(manifest, 'name', 'Name')).trim();
        const version = text(field(manifest, 'version', 'Version')).trim();
        const script = byPath.get(scope + main);
        if (!label || !version || !main || !script) throw new Error('清单需要名称、版本和存在的入口脚本。');
        const settingsPath = checkedPath(text(field(manifest, 'settings_ui', 'settingsUi', 'SettingsUi')));
        accepted.push({id: crypto.randomUUID(), label, filename: scope + main,
          content: await script.text(), directory, version,
          settings: readSettings(settingsPath ? await readJson(byPath.get(scope + settingsPath)) : undefined),
          settingsHtml: checkedPath(text(field(manifest, 'settings_html', 'settingsHtml', 'SettingsHtml'))),
          description: text(field(manifest, 'description', 'Description'))});
      } else if (kind === 'scripts') {
        accepted.push({id: crypto.randomUUID(), label: filename(path).replace(/\.[^.]+$/, ''),
          filename: path, content: await file.text(), directory: path.split('/').slice(0, -1).join('/')});
      } else {
        const content = await file.text();
        const payload = object(JSON.parse(content.replace(/^\uFEFF/, '')));
        const info = object(field(payload, 'info', 'Info'));
        const rows = kind === 'pathing' ? field(payload, 'positions', 'Positions') : field(payload, 'macroEvents', 'MacroEvents');
        if (!Array.isArray(rows)) throw new Error(kind === 'pathing' ? '缺少地图追踪点位。' : '缺少录制事件。');
        accepted.push({id: crypto.randomUUID(), label: kind === 'recordings' ? filename(path).replace(/\.json$/i, '') :
          text(field(info, 'name', 'Name')) || filename(path).replace(/\.json$/i, ''),
          filename: path, content, description: text(field(info, 'description', 'Description')),
          version: text(field(info, 'version', 'Version'))});
      }
    } catch (error) {
      issues.push(path + '：' + (error instanceof Error ? error.message : '读取失败。'));
    }
  }
  return {accepted, issues};
}

export function mergeResources(previous: ScriptResource[], imported: ScriptResource[]) {
  const result = new Map(previous.map(value => [value.filename, value]));
  for (const source of imported) result.set(source.filename, {...source, id: result.get(source.filename)?.id ?? source.id});
  return [...result.values()];
}
