import {useEffect, useRef, useState} from 'react';
import {Button, Field, IconButton, Input, Link, Select, Text} from './controls';
import {DataGrid, Empty, SettingsList, Toolbar, Tree, type GridColumn, type Row, type TreeNode} from './collections';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {FileInput, Image, LogView} from './media';
import {logoSource} from './app-images';
import {TaskRepositoryDialog} from './task-windows';
import {useAppValue} from './app-state';
import {importScriptResources, mergeResources, type ScriptKind, type ScriptResource} from './script-resources';
import {number, options, pick, TaskRows, TaskSection, toggle, useTaskConfig} from './task-fields';

const meta = {
  scripts: {
    title: '自定义 Javascript 脚本（实验功能）',
    brief: '可以通过 Javascript 调用 BetterGI 在原神中的各项能力。请在调度器中使用！',
    path: 'jsscript', guide: '点击查看 Javascript 脚本使用与编写教程', open: '打开脚本目录', run: '执行脚本',
  },
  pathing: {
    title: '地图追踪（实验功能）',
    brief: '可以实现自动采集、自动挖矿、自动锄地等功能。请在调度器中使用！',
    path: 'pathing', guide: '点击查看地图追踪与录制使用教程', open: '打开任务目录', run: '执行任务',
  },
  recordings: {
    title: '键鼠录制回放功能（实验功能）',
    brief: '建议在游戏内使用快捷键进行录制，录制完成后在调度器中使用。',
    path: 'kmscript', guide: '点击查看键鼠录制回放功能教程', open: '打开脚本目录', run: '播放脚本',
  },
};
const blank: ScriptResource[] = [];
const runtime = '需要本机 BetterGI 的对应功能';
const mapOptions = [
  {value: 'Teyvat', label: '提瓦特大陆'}, {value: 'TheChasm', label: '层岩巨渊'},
  {value: 'Enkanomiya', label: '渊下宫'}, {value: 'SeaOfBygoneEras', label: '旧日之海'},
  {value: 'AncientSacredMountain', label: '远古圣山'}, {value: 'TempleOfSpace', label: '空之神殿'},
  {value: 'MoonCanon', label: '霜月'},
];

function OriginalMapEditor({assetsBase, map}: {assetsBase: string; map: string}) {
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(assetsBase + 'map-editor-origin', {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error();
      const {origin} = await response.json();
      if (typeof origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin)) throw new Error();
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--bgi-accent').trim();
      const params = new URLSearchParams({map, accent});
      if (!controller.signal.aborted) setSource(origin + '/map-editor?' + params);
    }).catch(() => {if (!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  }, [assetsBase, map]);
  if (!source) return <Empty title={failed ? '无法读取原版地图编辑器' : '正在读取地图编辑器'} icon="map"/>;
  return <iframe className="bgi-map-recorder" title="地图路径点位编辑器"
    sandbox="allow-scripts allow-same-origin allow-downloads" src={source}/>;
}

function MapDeveloperTools({open, onChange, assetsBase}: {open: boolean; onChange: (value: boolean) => void; assetsBase?: string}) {
  const [map, setMap] = useAppValue('pathing/developer/record-map', 'Teyvat');
  const [viewer, setViewer] = useState<{type: 'map' | 'editor'; open: boolean}>();
  const [mapError, setMapError] = useState(false);
  return <><Modal title="地图追踪开发者工具" open={open} onChange={onChange} width={320}
    iconContent={<Image src={logoSource} alt="" width={16} height={16}/>}>
    <div className="bgi-stack">
      <Text variant="caption">下方地图选择会影响路径录制所在的独立地图。</Text>
      <Field label="请选择地图"><Select label="请选择地图" options={mapOptions} value={map} onValueChange={setMap}/></Field>
      <Button disabled={!assetsBase} onClick={() => {setMapError(false); setViewer({type: 'map', open: true});}}>查看实时追踪地图</Button>
      <Button disabled={!assetsBase} onClick={() => setViewer({type: 'editor', open: true})}>录制编辑器</Button>
    </div>
  </Modal>
    {viewer && assetsBase && <Modal title={viewer.type === 'map' ? '地图' : '地图路径点编辑器'} open={viewer.open}
      onChange={value => setViewer({...viewer, open: value})} onExited={() => setViewer(undefined)}
      width={viewer.type === 'map' ? 512 : 1366} height={viewer.type === 'map' ? 512 : 768}
      iconContent={<Image src={logoSource} alt="" width={16} height={16}/>}>
      {viewer.type === 'map' ? mapError ? <Empty title="地图资源暂不可用" icon="map"/> :
        <Image className="bgi-map-viewer" src={assetsBase + 'map-image?map=' + encodeURIComponent(map)}
          alt={mapOptions.find(item => item.value === map)?.label ?? '地图'} onError={() => setMapError(true)}/> :
        <OriginalMapEditor assetsBase={assetsBase} map={map}/>}
    </Modal>}
  </>;
}

function buildFolders(items: readonly ScriptResource[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const item of items) {
    const parts = item.filename.replaceAll('\\', '/').split('/').slice(0, -1);
    let nodes = root;
    let path = '';
    for (const part of parts) {
      path += '/' + part;
      let folder = nodes.find(node => node.id === 'folder:' + path);
      if (!folder) {
        folder = {id: 'folder:' + path, label: part, icon: 'folder', children: []};
        nodes.push(folder);
      }
      nodes = folder.children as TreeNode[];
    }
    nodes.push({id: item.id, label: item.label, icon: 'file'});
  }
  return root;
}

type Condition = {id: string; type: string; condition: string; target: string};
const conditionTypes = options(['动作', '采集物', '地图']);
function Rules({label, scope, outcome}: {label: string; scope: string; outcome: string}) {
  const [rows, setRows] = useAppValue<Condition[]>('pathing/conditions/' + scope, []);
  function patch(id: string, change: Partial<Condition>) {
    setRows(previous => previous.map(item => item.id === id ? {...item, ...change} : item));
  }
  return <TaskSection title={label}>
    {rows.map(row => <div key={row.id} className="bgi-script-rule">
      <Select label="条件类型" options={conditionTypes} value={row.type} onValueChange={type => patch(row.id, {type})}/>
      <Input aria-label="条件值" value={row.condition} onChange={event => patch(row.id, {condition: event.currentTarget.value})}/>
      <Input aria-label={outcome} placeholder={outcome} value={row.target}
        onChange={event => patch(row.id, {target: event.currentTarget.value})}/>
      <IconButton icon="trash" label="删除条件" onClick={() => setRows(previous => previous.filter(item => item.id !== row.id))}/>
    </div>)}
    <Button icon="plus" onClick={() => {
      setRows(previous => [...previous, {id: crypto.randomUUID(), type: '动作', condition: '', target: ''}]);
    }}>添加条件</Button>
  </TaskSection>;
}

function PathingSettings({open, onChange}: {open: boolean; onChange: (value: boolean) => void}) {
  const config = useTaskConfig('地图追踪');
  return <Modal title="地图追踪设置" wide open={open} onChange={onChange}
    actions={<Button onClick={() => onChange(false)}>关闭</Button>}>
    <SettingsList>
      <Text variant="caption">相关配置优先级从高到低</Text>
      <Rules label="队伍切换设置" scope="party" outcome="则切换到队伍"/>
      <Rules label="角色设置" scope="character" outcome="则角色执行"/>
      <TaskRows config={config} fields={[
        number('UseGadgetIntervalMs', '使用小道具的间隔时间（毫秒）', 0, 0, 99999),
        toggle('AutoEat', '开启自动吃药', false),
        pick('HealPolicy', '低血量回复时机', options(['任何路径点', '只在传送点', '不回复'])),
      ]}/>
    </SettingsList>
  </Modal>;
}

export function ScriptResourcePage({kind, mapAssetsBase}: {kind: ScriptKind; mapAssetsBase?: string}) {
  const [items, setItems] = useAppValue('library/' + kind, blank);
  const [selected, setSelected] = useState('');
  const [repo, setRepo] = useState(false);
  const [settings, setSettings] = useState(false);
  const [developer, setDeveloper] = useState(false);
  const [details, setDetails] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState('');
  const [remove, setRemove] = useState<ScriptResource>();
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const directory = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const current = items.find(item => item.id === selected);
  const page = meta[kind];

  async function load(files: File[]) {
    setLoading(true);
    try {
      const result = await importScriptResources(kind, files);
      if (result.accepted.length) {
        setItems(previous => mergeResources(previous, result.accepted));
        notify('已读取 ' + result.accepted.length + ' 项资源', 'success');
      } else notify('未找到可导入的资源。', 'warning');
      setIssues(result.issues);
    } finally {setLoading(false);}
  }

  const rows: Row[] = kind === 'scripts' ? items.map(item => ({
    id: item.id, label: item.directory || item.filename.split('/').slice(0, -1).join('/') || item.filename,
    detail: item.label, status: item.version || '—',
  })) : items.map(item => ({
    id: item.id, label: item.label, recordedAt: item.createdAt || '—',
  }));
  const columns: GridColumn[] = kind === 'scripts' ?
    [{key: 'label', label: '目录', width: 200}, {key: 'detail', label: '名称'}, {key: 'status', label: '版本'}] :
    [{key: 'label', label: '名称'}, {key: 'recordedAt', label: '创建时间'},
      {key: 'status', label: '操作', sortable: false, render: () => <Button disabled title={runtime}>播放脚本</Button>}];

  return <div className="bgi-stack bgi-trigger-page">
    <h1>{page.title}</h1>
    <Text variant="body">{page.brief} <Link href={'https://www.bettergi.com/feats/autos/' + page.path + '.html'}>{page.guide}</Link></Text>
    <div className="bgi-wrap">
      <Button icon="folder" disabled={loading} onClick={() => directory.current?.click()}>{page.open}</Button>
      <Button icon="package" onClick={() => setRepo(true)}>脚本仓库</Button>
      {kind === 'pathing' && <>
        <Button icon="settings" onClick={() => setSettings(true)}>设置</Button>
        <Button icon="sliders" onClick={() => setDeveloper(true)}>开发者工具</Button>
      </>}
      {kind === 'recordings' && <>
        <Button appearance="primary" icon="play" disabled title={runtime}>开始录制</Button>
        <Button icon="stop" disabled title={runtime}>停止录制</Button>
      </>}
    </div>
    <FileInput inputRef={directory} directory multiple onFiles={load}/>
    <FileInput inputRef={picker} accept={kind === 'scripts' ? '.js,.mjs' : '.json'} multiple onFiles={load}/>
    <DropMenu label="资源操作" context items={[
      {id: 'import', label: '导入文件…'},
      {id: 'details', label: '打开目录', disabled: kind !== 'scripts' || !current},
      {id: 'run', label: page.run, disabled: true, disabledReason: runtime},
      {id: 'refresh', label: '刷新', disabled: loading},
      {id: 'rename', label: '修改名称', disabled: kind !== 'recordings' || !current},
      {id: 'remove', label: '删除', disabled: !current, danger: true},
    ]} onSelect={action => {
      if (action === 'import') picker.current?.click();
      if (action === 'refresh') directory.current?.click();
      if (current && action === 'details') setDetails(true);
      if (current && action === 'rename') {setName(current.label); setRename(true);}
      if (current && action === 'remove') setRemove(current);
    }}
    trigger={<div className="bgi-script-resource-list" onContextMenuCapture={event => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-bgi-row], [data-node-id]') : null;
      if (item) setSelected(item.dataset.bgiRow ?? item.dataset.nodeId ?? '');
    }}>
      {kind === 'pathing' ?
        <Tree label="地图追踪任务" rows={buildFolders(items)} selected={selected} onSelect={setSelected}
          empty="暂无地图追踪任务"/> :
        <DataGrid rows={rows} columns={columns} selected={selected} onSelect={setSelected}
          empty={<Empty title={kind === 'scripts' ? '暂无脚本' : '暂无录制脚本'}/>}/>}
    </div>}/>
    <TaskRepositoryDialog open={repo} onChange={setRepo} onOpenLocal={() => directory.current?.click()}/>
    <PathingSettings open={settings} onChange={setSettings}/>
    <MapDeveloperTools open={developer} onChange={setDeveloper} assetsBase={mapAssetsBase}/>
    <Modal title={current?.label ?? '脚本目录'} open={details} wide onChange={setDetails}
      actions={<Button onClick={() => setDetails(false)}>关闭</Button>}>
      <div className="bgi-stack">
        {current?.description && <Text variant="body">{current.description}</Text>}
        {current && <Text variant="caption">{current.filename}</Text>}
        {current?.content && <LogView code label="脚本文件">{current.content}</LogView>}
      </div>
    </Modal>
    <Modal title="修改名称" open={rename} onChange={setRename}
      actions={<><Button onClick={() => setRename(false)}>取消</Button>
        <Button appearance="primary" disabled={!name.trim()} onClick={() => {
          setItems(previous => previous.map(value => current?.id === value.id ? {...value, label: name.trim()} : value));
          setRename(false);
        }}>保存</Button></>}>
      <Field label="名称"><Input aria-label="名称" value={name} onChange={event => setName(event.currentTarget.value)}/></Field>
    </Modal>
    <MessageDialog title="删除" message={'确定移除「' + (remove?.label ?? '') + '」？'}
      tone="warning" open={Boolean(remove)} onChange={open => {if (!open) setRemove(undefined);}}
      confirm={() => {setItems(previous => previous.filter(value => value.id !== remove?.id)); setSelected('');}}/>
    <Modal title="读取资源失败" open={issues.length > 0} onChange={open => {if (!open) setIssues([]);}}
      actions={<Button onClick={() => setIssues([])}>关闭</Button>}>
      <LogView label="读取错误">{issues.map((message,index) => <p key={index}>{message}</p>)}</LogView>
    </Modal>
    <Snackbar {...snackbar}/>
  </div>;
}
