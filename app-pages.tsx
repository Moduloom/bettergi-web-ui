import {useEffect, useRef, useState} from 'react';
import {Button, Link, Select, Switch, Text, type Option} from './controls';
import {Empty, Expander, List, SettingsList, SettingsRow, Toolbar} from './collections';
import {InfoBar, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {FileInput} from './media';
import {BetterGIRequestError, type useBetterGIConnection} from './app-runtime';
import {
  inspectPluginDirectory, inspectPluginPackage, type PluginDirectoryEntry, type PluginManifest, type PluginPackage,
} from './plugin-package';

type Feature = {
  id: string; name: string; description?: string; value: string; fallback?: string; options: Option[];
};
type NativePlugin = {
  key: string; manifest: PluginManifest; status: string; enabled: boolean;
  canToggle: boolean; canUninstall: boolean; hasSettings: boolean; implementations: string;
};
type NativePlugins = {canManagePackages: boolean; plugins: NativePlugin[]; features: Feature[]};
type NativeChange = {snapshot: NativePlugins; message?: string; enableKey?: string};
type NativeInspection = {
  manifest: PluginManifest; compatibilityError?: string; fileCount: number;
  totalBytes: number; installedVersion?: string; hash: string; isDowngrade?: boolean;
};
type SelectedPackage = PluginPackage & {file: File; inspection?: NativeInspection};
type PluginAction = 'enable' | 'disable' | 'uninstall' | 'open-directory' | 'settings';

const builtinFeatures: Feature[] = [
  {id: 'ocr', name: 'OCR 模型', description: '识别游戏界面文字使用的模型。', value: 'builtin.ppocr_v6',
    options: [{value: 'builtin.ppocr_v6', label: 'PP-OCRv6 · 内置'}]},
  {id: 'teleport', name: '传送', description: '大地图传送，以及打开大地图、切换区域、移动和缩放地图等大地图操作。',
    value: 'builtin.standard', options: [{value: 'builtin.standard', label: '内置传送 · 内置'}]},
];
const privileges = '插件拥有与 BetterGI 相同的系统权限（管理员），请只安装可信来源的插件。';
const needsHost = '需要本机 BetterGI 的插件管理接口';

function homepageUrl(value: string) {
  try {
    const address = new URL(value);
    return ['http:', 'https:'].includes(address.protocol) ? address.href : undefined;
  } catch {
    return undefined;
  }
}

function nameOf(file: File) {
  return file.name.toLowerCase().endsWith('.nupkg') ? 'nupkg' : 'zip';
}

function pluginError(error: unknown) {
  if (error instanceof BetterGIRequestError && error.status === 404) return '本机 BetterGI 版本尚未提供插件管理接口。';
  return error instanceof Error ? error.message : '本机插件操作失败。';
}

function PluginCard({entry, native, canManage, busy, onBrowse, onAction, onUninstall}: {
  entry?: PluginDirectoryEntry; native?: NativePlugin; canManage?: boolean; busy: boolean;
  onBrowse: () => void; onAction?: (action: PluginAction) => void; onUninstall?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const manifest = native?.manifest ?? entry?.manifest;
  const homepage = manifest && homepageUrl(manifest.homepage);
  const displayName = manifest?.name || entry?.path.split('/').at(-2) || '插件清单';
  const status = native?.status ?? (entry?.error ? '无法加载：' + entry.error : '已从目录读取 · 启用状态由本机管理');
  const description = manifest && [manifest.version, ...manifest.authors].join(' · ');
  const toggle = manifest && <Switch label={native ? '启用' + displayName : displayName + ' 的启用状态由本机管理'}
    showLabel={false} checked={native?.enabled ?? false} disabled={!native?.canToggle || busy}
    onChange={value => onAction?.(value ? 'enable' : 'disable')}/>;
  return <Expander title={displayName} icon="package" description={[description, status].filter(Boolean).join(' · ')}
    open={open} onChange={setOpen}
    action={native?.hasSettings ? <div className="bgi-wrap">
      <Button icon="settings" disabled={busy} onClick={() => onAction?.('settings')}>设置</Button>{toggle}
    </div> : toggle}>
    <div className="bgi-stack">
      {entry?.error && <Text variant="caption">{entry.path}</Text>}
      {manifest?.description && <Text>{manifest.description}</Text>}
      {native && <Text variant="caption">提供的功能：{native.implementations}</Text>}
      {manifest && <>
        <Text variant="caption">标识：{manifest.id}</Text>
        {!native && <Text variant="caption">入口程序集：{manifest.entry}</Text>}
      </>}
      <div className="bgi-wrap">
        <Button icon="folder" disabled={busy} onClick={onBrowse}>打开目录</Button>
        {homepage && <Link href={homepage}>主页</Link>}
        {(!native || canManage) && <Button icon="trash" disabled={!native?.canUninstall || busy}
          title={native ? undefined : needsHost} onClick={onUninstall}>卸载</Button>}
      </div>
    </div>
  </Expander>;
}

export function PluginPage({runtime}: {runtime: ReturnType<typeof useBetterGIConnection>}) {
  const {call, connection} = runtime;
  const online = connection.state === 'online';
  const [native, setNative] = useState<NativePlugins>();
  const [nativeIssue, setNativeIssue] = useState('');
  const [directory, setDirectory] = useState<{name: string; plugins: PluginDirectoryEntry[]}>();
  const [directoryFiles, setDirectoryFiles] = useState<File[]>([]);
  const [chosenPackage, setChosenPackage] = useState<SelectedPackage>();
  const [askEnable, setAskEnable] = useState<NativePlugin>();
  const [askUninstall, setAskUninstall] = useState<NativePlugin>();
  const [browse, setBrowse] = useState<PluginDirectoryEntry>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const packageInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const nativeReady = online && native !== undefined;

  useEffect(() => {
    if (!online) {
      setNative(undefined);
      setNativeIssue('');
      return;
    }
    const controller = new AbortController();
    void call<NativePlugins>('plugins/refresh', {body: {}, signal: controller.signal}).then(snapshot => {
      if (!controller.signal.aborted) {setNative(snapshot); setNativeIssue('');}
    }).catch(error => {
      if (!controller.signal.aborted) setNativeIssue(pluginError(error));
    });
    return () => controller.abort();
  }, [call, online]);

  async function run(operation: () => Promise<void>, syncOnError = false) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      notify(pluginError(error), 'danger');
      if (syncOnError) {
        const snapshot = await call<NativePlugins>('plugins/state').catch(() => undefined);
        if (snapshot) setNative(snapshot);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function readPackage([file]: File[]) {
    if (!file) return;
    void run(async () => {
      if (!/\.(zip|nupkg)$/i.test(file.name)) throw new Error('请选择 ZIP 或 NuGet 插件安装包。');
      if (!nativeReady) {
        setChosenPackage({...await inspectPluginPackage(file), file});
        return;
      }
      const inspection = await call<NativeInspection>('plugins/inspect/' + nameOf(file), {upload: file, timeout: 180000});
      setChosenPackage({file, filename: file.name, manifest: inspection.manifest,
        files: inspection.fileCount, size: inspection.totalBytes, inspection});
    });
  }

  function readDirectory(files: File[]) {
    if (!files.length) return;
    void run(async () => {
      setDirectory(await inspectPluginDirectory(files));
      setDirectoryFiles(files);
    });
  }

  function refresh() {
    return run(async () => {
      const snapshot = await call<NativePlugins>('plugins/refresh', {body: {}});
      setNative(snapshot);
      setNativeIssue('');
    });
  }

  function update(result: NativeChange) {
    setNative(result.snapshot);
    if (result.message) notify(result.message, 'success');
  }

  function nativeAction(entry: NativePlugin, action: PluginAction) {
    if (!nativeReady) return;
    void run(async () => {
      const change = await call<NativeChange>('plugins/entries/' + encodeURIComponent(entry.key) + '/' + action, {body: {}});
      update(change);
    }, true);
  }

  function install() {
    const selected = chosenPackage;
    if (!selected?.inspection || selected.inspection.compatibilityError || !native?.canManagePackages || !nativeReady) return;
    void run(async () => {
      const result = await call<NativeChange>('plugins/install/' + nameOf(selected.file) +
        '?hash=' + encodeURIComponent(selected.inspection!.hash), {upload: selected.file, timeout: 180000});
      update(result);
      setChosenPackage(undefined);
      setAskEnable(result.snapshot.plugins.find(item => item.key === result.enableKey));
    }, true);
  }

  const features = nativeReady ? native.features : builtinFeatures;
  const packageName = chosenPackage?.manifest.name ?? '';
  const existingVersion = chosenPackage?.inspection?.installedVersion ??
    (chosenPackage && !chosenPackage.inspection &&
      directory?.plugins.find(item => item.manifest?.id === chosenPackage.manifest.id && !item.error)?.manifest?.version || undefined);
  const browseRoot = browse ? browse.path.slice(0, browse.path.lastIndexOf('/') + 1) : '';
  const browseFiles = browse ? directoryFiles.filter(file => file.webkitRelativePath.startsWith(browseRoot)) : [];
  const canInstall = Boolean(nativeReady && native.canManagePackages && chosenPackage?.inspection && !chosenPackage.inspection.compatibilityError);

  return <div className="bgi-stack">
    <Toolbar actions={<>
      {(!nativeReady || native.canManagePackages) &&
        <Button appearance="primary" icon="plus" disabled={busy} onClick={() => packageInput.current?.click()}>从文件安装</Button>}
      <Button icon="folder" disabled={busy} onClick={() => nativeReady ?
        run(async () => update(await call<NativeChange>('plugins/browse', {body: {}}))) :
        directoryInput.current?.click()}>打开插件目录</Button>
      <Button icon="rotate" disabled={busy || !online && !directory}
        onClick={() => online ? refresh() : directoryInput.current?.click()}>刷新</Button>
      <FileInput inputRef={packageInput} accept=".zip,.nupkg" onFiles={readPackage}/>
      <FileInput inputRef={directoryInput} directory multiple onFiles={readDirectory}/>
    </>}>
      <Text variant="section">插件</Text>
    </Toolbar>
    <Text variant="caption">插件可以替换 BetterGI 的部分功能，例如 OCR 模型。启用、停用和切换都不需要重启。</Text>
    <InfoBar tone="warning" title={privileges}/>
    {online && nativeIssue && <InfoBar tone="info" title={nativeIssue}/>}
    <Text variant="section">功能选择</Text>
    <SettingsList>
      {features.map(feature => <SettingsRow key={feature.id} icon="sliders" label={feature.name}
        description={feature.fallback ? <>{feature.description}<br/>{feature.fallback}</> : feature.description} controlWidth={260}
        control={<Select label={feature.name} value={feature.value} options={feature.options} disabled={!nativeReady || busy}
          onValueChange={value => run(async () => update(await call<NativeChange>('plugins/features/' +
            encodeURIComponent(feature.id), {body: {value}})), true)}/>}/>)}
    </SettingsList>
    <Text variant="section">已安装插件</Text>
    {nativeReady ? native.plugins.length ? native.plugins.map(entry =>
      <PluginCard key={entry.key} native={entry} canManage={native.canManagePackages} busy={busy}
        onBrowse={() => nativeAction(entry, 'open-directory')} onAction={action => nativeAction(entry, action)}
        onUninstall={() => setAskUninstall(entry)}/>) : <Empty icon="package" title="尚未安装插件"
        description="可以从文件安装，或把插件文件夹放到插件目录后点击刷新。"/> :
      directory?.plugins.length ? <div className="bgi-stack">
        <Text variant="caption">插件目录：{directory.name}</Text>
        {directory.plugins.map(entry => <PluginCard key={entry.path} entry={entry} busy={busy} onBrowse={() => setBrowse(entry)}/>)}
      </div> : <Empty icon="package" title={directory ? '所选目录没有插件' : '尚未读取插件目录'}/>}
    <Modal title="安装插件" open={chosenPackage !== undefined} onChange={open => {if (!open && !busy) setChosenPackage(undefined);}}
      actions={<>
        <Button disabled={busy} onClick={() => setChosenPackage(undefined)}>关闭</Button>
        <Button icon="plus" appearance="primary" title={canInstall ? undefined : needsHost} disabled={!canInstall || busy}
          onClick={install}>安装</Button>
      </>}>
      {chosenPackage && <div className="bgi-stack">
        <Text variant="section">{packageName}</Text>
        <SettingsList separated>
          <SettingsRow inline label="安装包" control={<Text>{chosenPackage.filename}</Text>}/>
          <SettingsRow inline label="标识" control={<Text>{chosenPackage.manifest.id}</Text>}/>
          <SettingsRow inline label="版本" description={chosenPackage.inspection?.isDowngrade ? '安装包版本低于已安装版本。' : undefined}
            control={<Text>{existingVersion ? existingVersion + ' → ' : ''}{chosenPackage.manifest.version}</Text>}/>
          {chosenPackage.manifest.authors.length > 0 && <SettingsRow inline label="作者" control={<Text>{chosenPackage.manifest.authors.join('、')}</Text>}/>}
          <SettingsRow inline label="大小" control={<Text>{(chosenPackage.size / 1024 / 1024).toFixed(1)} MB · {chosenPackage.files} 个文件</Text>}/>
          <SettingsRow inline label="最低支持版本" control={<Text>{chosenPackage.manifest.sdkVersion}</Text>}/>
        </SettingsList>
        {chosenPackage.inspection?.compatibilityError ? <InfoBar tone="danger" title={chosenPackage.inspection.compatibilityError}/> :
          <InfoBar tone={canInstall ? 'warning' : 'info'} title={canInstall ? privileges : needsHost}/>}
      </div>}
    </Modal>
    <MessageDialog title="启用插件" open={askEnable !== undefined} tone="info"
      message={'插件「' + (askEnable?.manifest.name ?? '') + '」已安装，是否立即启用？'}
      onChange={open => {if (!open) setAskEnable(undefined);}}
      confirm={() => {if (askEnable) nativeAction(askEnable, 'enable');}}/>
    <MessageDialog title="卸载插件" open={askUninstall !== undefined} tone="warning"
      message={'确定卸载插件「' + (askUninstall?.manifest.name ?? '') + '」？插件数据会保留，重新安装后可恢复。'}
      onChange={open => {if (!open) setAskUninstall(undefined);}}
      confirm={() => {if (askUninstall) nativeAction(askUninstall, 'uninstall');}}/>
    <Modal title={browse?.manifest?.name ?? '插件目录'} open={browse !== undefined} onChange={open => {if (!open) setBrowse(undefined);}}>
      <List rows={browseFiles.map(file => ({
        id: file.webkitRelativePath, label: file.webkitRelativePath.slice(browseRoot.length), icon: 'file',
      }))}/>
    </Modal>
    <Snackbar {...snackbar}/>
  </div>;
}
