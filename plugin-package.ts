export type PluginManifest = {
  schema: number; id: string; name: string; version: string; authors: string[]; description: string;
  entry: string; sdkVersion: string; maxHostVersion: string; homepage: string;
};

type ArchiveEntry = {name: string; method: number; flags: number; packed: number; size: number; offset: number};
export type PluginPackage = {manifest: PluginManifest; filename: string; files: number; size: number};
export type PluginDirectoryEntry = {path: string; manifest?: PluginManifest; error?: string};
const manifestPath = 'plugin.json';
const manifestLimit = 256 * 1024;
const archiveLimit = 1024 ** 3;
const minimumSdk = '0.66.3-alpha.1';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const decoder = new TextDecoder();

function pathSafe(path: string) {
  return path.split('/').every(part => part.length && part !== '.' && part !== '..'
    && !/[<>:"|?*\u0000-\u001f]/.test(part) && !/[. ]$/.test(part));
}

function compareVersion(left: string, right: string) {
  const a = semver.exec(left)!;
  const b = semver.exec(right)!;
  for (let index = 1; index <= 3; index++) {
    const comparison = Number(a[index]) - Number(b[index]);
    if (comparison) return comparison;
  }
  if (!a[4] || !b[4]) return Number(!a[4]) - Number(!b[4]);
  const aParts = a[4].split('.');
  const bParts = b[4].split('.');
  for (let index = 0; index < Math.min(aParts.length, bParts.length); index++) {
    const x = aParts[index], y = bParts[index];
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x), yNumeric = /^\d+$/.test(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return xNumeric ? Number(x) - Number(y) : x < y ? -1 : 1;
  }
  return aParts.length - bParts.length;
}

function parsePluginManifest(raw: string): PluginManifest {
  let data: unknown;
  try {data = JSON.parse(raw.replace(/^\uFEFF/, ''));}
  catch {throw new Error('插件清单格式错误');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('插件清单为空');
  const fields = data as Record<string, unknown>;
  const text = (key: string) => typeof fields[key] === 'string' ? fields[key].trim() : '';
  return {
    schema: typeof fields.manifest_version === 'number' ? fields.manifest_version : 0,
    id: text('id'), name: text('name'), version: text('version'), entry: text('entry').replaceAll('\\', '/'),
    sdkVersion: text('sdk_version'), maxHostVersion: text('max_host_version'),
    authors: Array.isArray(fields.authors) ? fields.authors.filter((value): value is string => typeof value === 'string') : [],
    description: text('description'), homepage: text('homepage'),
  };
}

function checkManifest(manifest: PluginManifest, hasFile: (path: string) => boolean) {
  const {id, name, version, entry, sdkVersion, maxHostVersion} = manifest;
  if (manifest.schema !== 1) return '不支持的清单版本';
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(id) || ['builtin', 'bgi', 'onnxruntime'].includes(id)) return '插件标识不合法';
  if (!name) return '清单缺少插件名称';
  if (!semver.test(version)) return '插件版本不是有效的版本号';
  if (!pathSafe(entry) || !/\.dll$/i.test(entry)) return '入口程序集路径不合法';
  if (!hasFile(entry)) return '找不到入口程序集 ' + entry;
  if (!semver.test(sdkVersion)) return '开发包版本不是有效的版本号';
  if (compareVersion(sdkVersion, minimumSdk) < 0) return '插件基于旧版本 BetterGI 编译，请更新插件';
  if (maxHostVersion && !semver.test(maxHostVersion)) return '最高支持版本不是有效的版本号';
}

async function listArchive(file: File) {
  const tailStart = Math.max(0, file.size - 65557);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let end = tail.byteLength - 22;
  for (; end >= 0; end--) {
    if (tail.getUint32(end, true) === 0x06054b50 && end + 22 + tail.getUint16(end + 20, true) === tail.byteLength) break;
  }
  if (end < 0) throw new Error('无法读取安装包的 ZIP 目录');
  const count = tail.getUint16(end + 10, true);
  const length = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  if (tail.getUint32(end + 4, true) !== 0 || tail.getUint16(end + 8, true) !== count ||
      count === 65535 || offset + length > tailStart + end || length > 16 * 1024 * 1024) {
    throw new Error('不支持此 ZIP 安装包的目录结构');
  }
  const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  const directory = new DataView(bytes.buffer);
  const entries = new Map<string, ArchiveEntry>();
  let index = 0;
  for (let i = 0; i < count; i++) {
    if (index + 46 > directory.byteLength || directory.getUint32(index, true) !== 0x02014b50) {
      throw new Error('安装包的 ZIP 目录不完整');
    }
    const filenameLength = directory.getUint16(index + 28, true);
    const next = index + 46 + filenameLength + directory.getUint16(index + 30, true) + directory.getUint16(index + 32, true);
    if (next > directory.byteLength) throw new Error('安装包的 ZIP 条目不完整');
    const name = decoder.decode(bytes.subarray(index + 46, index + 46 + filenameLength)).replaceAll('\\', '/');
    entries.set(name.toLowerCase(), {
      name, flags: directory.getUint16(index + 8, true), method: directory.getUint16(index + 10, true),
      packed: directory.getUint32(index + 20, true), size: directory.getUint32(index + 24, true),
      offset: directory.getUint32(index + 42, true),
    });
    index = next;
  }
  return entries;
}

async function readManifest(file: File, entry: ArchiveEntry) {
  if (entry.flags & 1 || entry.size > manifestLimit || entry.packed > manifestLimit + 4096) {
    throw new Error('插件清单加密或超过大小上限');
  }
  const header = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
  if (header.byteLength !== 30 || header.getUint32(0, true) !== 0x04034b50) throw new Error('插件清单条目不完整');
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (start + entry.packed > file.size) throw new Error('插件清单条目被截断');
  const packed = file.slice(start, start + entry.packed);
  if (entry.method === 0 && entry.size === entry.packed) return packed.text();
  if (entry.method !== 8) throw new Error('不支持插件清单的压缩格式');
  const stream = packed.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const plain = new Uint8Array(entry.size);
  let length = 0;
  try {
    while (true) {
      const {value, done} = await stream.read();
      if (done) break;
      if (length + value.length > plain.length) throw new Error('插件清单的大小与安装包记录不符');
      plain.set(value, length);
      length += value.length;
    }
    if (length !== plain.length) throw new Error('插件清单不完整');
    return decoder.decode(plain);
  } finally {
    await stream.cancel().catch(() => {});
    stream.releaseLock();
  }
}

export async function inspectPluginPackage(file: File): Promise<PluginPackage> {
  const entries = await listArchive(file);
  const prefixes = [...new Set([...entries.keys()].filter(name => name.includes('/')).map(name => name.slice(0, name.indexOf('/') + 1)))];
  const root = /\.nupkg$/i.test(file.name) ? 'plugin/' : entries.has(manifestPath) ? '' : prefixes.length === 1 ? prefixes[0] : '';
  const manifestEntry = entries.get(root + manifestPath);
  if (!manifestEntry) throw new Error('安装包中没有 ' + root + manifestPath);
  let files = 0, size = 0;
  for (const [name, entry] of entries) {
    if (!name.startsWith(root) || name.endsWith('/')) continue;
    if (!pathSafe(entry.name.slice(root.length))) throw new Error('安装包含有不安全的路径：' + entry.name);
    size += entry.size;
    if (size > archiveLimit) throw new Error('安装包解压后超过 1 GB');
    files++;
  }
  const manifest = parsePluginManifest(await readManifest(file, manifestEntry));
  const error = checkManifest(manifest, path => entries.has(root + path.toLowerCase()));
  if (error) throw new Error(error);
  return {manifest, filename: file.name, files, size};
}

export async function inspectPluginDirectory(files: File[]) {
  const name = files[0]?.webkitRelativePath.split('/')[0] ?? '';
  const entries = new Map(files.map(file => [file.webkitRelativePath.slice(name.length + 1).toLowerCase(), file]));
  const plugins: PluginDirectoryEntry[] = [];
  const seen = new Map<string, PluginDirectoryEntry>();
  for (const [path, file] of entries) {
    if (!/^(?:[^/]+\/)?plugin\.json$/.test(path)) continue;
    const root = path.slice(0, -manifestPath.length);
    const record: PluginDirectoryEntry = {path: file.webkitRelativePath};
    try {
      if (file.size > manifestLimit) throw new Error('插件清单超过大小上限');
      record.manifest = parsePluginManifest(await file.text());
      record.error = checkManifest(record.manifest, entry => entries.has(root + entry.toLowerCase()));
      if (!record.error) {
        const other = seen.get(record.manifest.id);
        if (other) other.error = record.error = '插件标识重复：' + record.manifest.id;
        seen.set(record.manifest.id, record);
      }
    } catch (error) {
      record.error = error instanceof Error ? error.message : '无法读取插件清单';
    }
    plugins.push(record);
  }
  return {name, plugins: plugins.sort((a, b) => (a.manifest?.name ?? a.path).localeCompare(b.manifest?.name ?? b.path, 'zh-CN'))};
}
