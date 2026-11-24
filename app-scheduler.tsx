import {useState, type FormEvent} from 'react';
import {Badge, Button, Choice, Field, IconButton, Input, Link, RadioGroup, SearchField, Switch, Text, TextArea} from './controls';
import {Empty, List, ReorderList, SettingsList, SettingsRow, Toolbar, type Row} from './collections';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {CodeEditor} from './media';
import {SplitView} from './panels';
import {CombatFields} from './task-combat';
import {number, options, pick, TaskRows, TaskSection, TaskSwitch, text, toggle, type TaskConfig, type TaskField} from './task-fields';
import {TaskRepositoryDialog} from './task-windows';
import {useAppValue} from './app-state';
import {ScriptSettingsForm} from './script-settings';
import type {ScriptResource, ScriptSetting} from './script-resources';

type Kind = 'scripts' | 'pathing' | 'recordings' | 'shell' | 'legacy';
type Item = Row & {
  kind: Kind; enabled: boolean; path?: string; sourceId?: string; notify?: boolean;
  http?: boolean; params?: string; command?: string;
};
type Setting = string | boolean | number;
type Group = {id: string; name: string; rows: Item[]; config?: Record<string, Setting>; next?: string};
type Resource = ScriptResource;
const kindNames: Record<Kind, string> = {
  scripts: 'JS脚本', pathing: '地图追踪任务', recordings: '键鼠脚本', shell: 'Shell', legacy: '独立任务',
};
const kindIcons: Record<Kind, NonNullable<Row['icon']>> = {
  scripts: 'fileCode', pathing: 'globe', recordings: 'monitor', shell: 'code', legacy: 'play',
};
const noGroups: Group[] = [];
const noResources: Resource[] = [];
const unavailable = '需要本机 BetterGI 的调度器接口';

function normalize(row: Item): Item {
  if (row.kind && Object.hasOwn(kindNames, row.kind)) return row;
  const kind = row.detail === 'JS 脚本' ? 'scripts' : row.detail === '地图追踪' ? 'pathing' :
    row.detail === '录制回放' ? 'recordings' : 'legacy';
  return {...row, kind, enabled: row.enabled ?? true};
}

function createItem(kind: Kind, source?: Resource): Item {
  return {
    id: crypto.randomUUID(), label: source?.label ?? kindNames[kind], icon: kindIcons[kind],
    kind, enabled: true, path: source?.filename, sourceId: source?.id,
  };
}

const walking: TaskField[] = [
  toggle('AutoPick', '是否开启自动拾取', true, '推荐开启以拾取路线中的掉落物、采集物'),
  toggle('AutoEat', '是否开启自动吃药', false, '检测到红血状态时自动使用便携营养袋'),
  toggle('AutoSkip', '自动跳过剧情', false, '行走途中意外进入剧情时自动脱离'),
  text('PartyName', '切换到队伍的名称（为空则不切换）'),
  toggle('SkipParty', '跳过队伍切换', false),
  toggle('SafePartySwitch', '切换队伍前强制前往安全的神像区域', false),
  pick('Guardian', '【生存位】在队伍内的编号', options(['未指定', '1', '2', '3', '4'])),
  number('GuardianInterval', '【生存位】释放元素战技的间隔（秒）', 0, 0, 600),
  toggle('GuardianHold', '【生存位】元素战技是否长按', false),
  pick('Walker', '【行走位】主要行走的角色在队伍内的编号', options(['未指定', '1', '2', '3', '4'])),
  number('GadgetInterval', '使用小道具的间隔时间（毫秒）', 0, 0, 99999),
  pick('HealPolicy', '低血量回复时机', options(['任何路径点', '只在传送点', '不回复'])),
  text('SkipDuring', '不在某时执行', '', '填写小时数，范围 0–23。'),
  toggle('HideFromContinuous', '不在连续任务中显示', false),
];
const travel: TaskField[] = [
  pick('TravelCharacter', '赶路角色', options(['未指定', '自动', '玛薇卡', '闲云', '桑多涅', '恰斯卡', '流浪者', '伊法', '希诺宁', '法尔伽', '夜兰'])),
  number('TravelFrameInterval', '覆写赶路帧间隔', 100, 1, 1000),
  pick('TravelMode', '赶路模式', options(['精准靠近', '连续赶路'])),
  number('TravelDistance', '赶路启用距离', 0, 0, 999),
  number('StopDistance', '接近停车距离', 0, 0, 999),
  toggle('WalkNearTarget', '接近时切人步行', false),
  toggle('JumpFly', '启用跳飞赶路', false),
  number('JumpFlyDistance', '跳飞启用距离', 0, 0, 999),
  number('JumpFlyInterval', '跳飞/跳跃间隔（秒）', 0, 0, 60, undefined, .1),
  number('JumpFlySprintCount', '跳飞前额外冲刺次数', 0, 0, 20),
  toggle('DisableBikeSprint', '玛薇卡在车上禁用冲刺', false),
];
const cycle: TaskField[] = [
  number('BoundaryTime', '分界时间', 4, 0, 23),
  toggle('UseServerZone', '分界时间参考服务器时区', false),
  number('Cycle', '周期', 1, 1, 365),
  number('CycleIndex', '执行序号', 1, 1, 365),
];

function GroupSettings({initial, open, onClose, onSave, onRepository, navigate}: {
  initial: Record<string, Setting>; open: boolean; onClose: () => void;
  onSave: (values: Record<string, Setting>) => void; onRepository: () => void; navigate: (route: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const config: TaskConfig = {
    get<T extends Setting>(key: string, fallback: T) {
      return typeof draft[key] === typeof fallback ? draft[key] as T : fallback;
    },
    set: (key, value) => setDraft(old => ({...old, [key]: value})),
    apply: update => setDraft(old => ({...old, ...update})),
    layout: {},
  };
  return <Modal title="配置组设置" open={open} wide onChange={next => {if (!next) onClose();}}
    actions={<><Button onClick={onClose}>取消</Button>
      <Button appearance="primary" onClick={() => {onSave(draft); onClose();}}>保存</Button></>}>
    <SettingsList>
      <TaskSection title="地图追踪行走配置（不启用则使用地图追踪内的条件配置）"
        description="强制修改行走途中配置开盾、回血等角色在队伍内的编号"
        action={<TaskSwitch config={config} name="PathingEnabled" initial={false} label="启用地图追踪行走配置"/>}>
        <TaskRows config={config} fields={walking}/>
        <TaskSection title="自动赶路设置"><TaskRows config={config} fields={travel}/></TaskSection>
        <TaskSection title="执行周期配置" description="以天为单位来决定是否执行此配置组">
          <TaskRows config={config} fields={cycle}/>
        </TaskSection>
      </TaskSection>
      <TaskSection title="战斗配置" description="需开启上方地图追踪配置"
        action={<TaskSwitch config={config} name="CombatEnabled" initial={false} label="启用战斗配置"/>}>
        <CombatFields config={config} onRepository={onRepository} onRecordings={() => navigate('recordings')}/>
      </TaskSection>
    </SettingsList>
  </Modal>;
}

function AddTaskDialog({kind, sources, open, onClose, onAdd}: {
  kind: Kind; sources: readonly Resource[]; open: boolean; onClose: () => void; onAdd: (rows: Item[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const shell = kind === 'shell';
  const shown = sources.filter(item => (item.label + item.filename).toLowerCase().includes(query.trim().toLowerCase()));
  return <Modal title={'添加' + kindNames[kind]} open={open} onChange={value => {if (!value) onClose();}}
    actions={<><Button onClick={onClose}>取消</Button>
      <Button appearance="primary" disabled={shell ? !name.trim() || !command.trim() : !chosen.length} onClick={() => {
        onAdd(shell ? [{...createItem('shell'), label: name.trim(), command}] :
          sources.filter(item => chosen.includes(item.id)).map(item => createItem(kind, item)));
        onClose();
      }}>添加</Button></>}>
    <div className="bgi-stack">
      {shell ? <>
        <Field label="名称"><Input aria-label="Shell 任务名称" value={name} onChange={e => setName(e.currentTarget.value)}/></Field>
        <Field label="命令"><TextArea mono label="Shell 命令" value={command} onChange={setCommand}/></Field>
      </> : <>
        <SearchField label="筛选任务" value={query} onChange={setQuery}/>
        {shown.length ? shown.map(item => <Choice key={item.id} label={item.label} checked={chosen.includes(item.id)}
          onChange={enabled => setChosen(previous => enabled ? [...previous, item.id] : previous.filter(id => id !== item.id))}/>) :
          <Empty title={query ? '没有匹配的任务' : '暂无可添加的任务'}/>}
      </>}
    </div>
  </Modal>;
}

function ProjectEditor({task, custom, open, fields = [], onClose, onSave}: {
  task: Item; custom: boolean; open: boolean; fields?: ScriptSetting[]; onClose: () => void; onSave: (task: Item) => void;
}) {
  const [draft, setDraft] = useState(task);
  const js = task.kind === 'scripts';
  let valid = true;
  let values: Record<string, unknown> = {};
  if (custom) {
    try {
      const result: unknown = JSON.parse(draft.params || '{}');
      valid = Boolean(result) && typeof result === 'object' && !Array.isArray(result);
      if (valid) values = result as Record<string, unknown>;
    } catch {valid = false;}
  }
  return <Modal title={custom ? 'JS脚本自定义配置' : '修改通用配置'} open={open} onChange={value => {if (!value) onClose();}}
    actions={<><Button onClick={onClose}>取消</Button>
      <Button appearance="primary" disabled={!valid} onClick={() => {onSave(draft); onClose();}}>保存</Button></>}>
    <div className="bgi-stack">
      <Text variant="section">{draft.label}</Text>
      {custom ? fields.length ? <ScriptSettingsForm fields={fields} values={values}
        onChange={(key, value) => setDraft({...draft, params: JSON.stringify({...values, [key]: value})})}/> :
        <CodeEditor label="JS脚本自定义配置" language="json" value={draft.params ?? '{}'}
          onChange={params => setDraft({...draft, params})}/> : <>
        <Field label="状态"><RadioGroup label="状态" inline options={options(['启用', '禁用'])}
          value={draft.enabled ? '启用' : '禁用'} onChange={status => setDraft({...draft, enabled: status === '启用'})}/></Field>
        {js && <>
          <SettingsRow inline label="JS 通知权限" control={<Switch label="JS 通知权限" checked={Boolean(draft.notify)}
            onChange={notify => setDraft({...draft, notify})} showLabel={false}/>}/>
          <SettingsRow inline label="JS HTTP权限" description="脚本更新 http_allowed_urls 后需手动重新启用权限。"
            control={<Switch label="JS HTTP权限" checked={Boolean(draft.http)}
              onChange={http => setDraft({...draft, http})} showLabel={false}/>}/>
        </>}
        {task.kind === 'shell' && <Field label="命令"><TextArea label="Shell 命令" mono value={draft.command ?? ''}
          onChange={command => setDraft({...draft, command})}/></Field>}
      </>}
    </div>
  </Modal>;
}

export function SchedulerPage({navigate}: {navigate: (route: string) => void}) {
  const [groups, setGroups] = useAppValue('plans/scheduler', noGroups);
  const [scripts] = useAppValue('library/scripts', noResources);
  const [pathing] = useAppValue('library/pathing', noResources);
  const [recordings] = useAppValue('library/recordings', noResources);
  const [pick, setPick] = useState('');
  const [selected, setSelected] = useState('');
  const [width, setWidth] = useState(190);
  const [operation, setOperation] = useState<'create' | 'rename' | 'copy'>();
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<{title: string; message: string; apply: () => void}>();
  const [add, setAdd] = useState<{key: string; open: boolean; kind: Kind}>();
  const [editor, setEditor] = useState<{key: string; open: boolean; task: Item; custom: boolean}>();
  const [settings, setSettings] = useState<{key: string; open: boolean}>();
  const [repository, setRepository] = useState(false);
  const [run, setRun] = useState<'single' | 'continuous'>();
  const [startGroup, setStartGroup] = useState('');
  const {notify, snackbar} = useSnackbar();
  const group = groups.find(candidate => candidate.id === pick) ?? groups[0];
  const rows = (group?.rows ?? []).map(normalize);
  const task = rows.find(item => item.id === selected);
  const sources = {scripts, pathing, recordings, shell: [], legacy: []};
  const runGroups = groups.filter(item => !item.config?.HideFromContinuous);
  const firstGroup = run === 'continuous' ? Math.max(0, runGroups.findIndex(item => item.id === startGroup)) : 0;
  const runRows: Row[] = run === 'continuous' ? runGroups.slice(firstGroup).map(item => ({
    id: item.id, label: item.name, detail: item.rows.filter(row => normalize(row).enabled).length + ' 项任务',
  })) : rows.slice(Math.max(0, rows.findIndex(item => item.id === group?.next))).filter(item => item.enabled);

  function choose(id: string) {
    setPick(id);
    setSelected('');
  }
  function patch(fields: Partial<Group>) {
    if (group) setGroups(previous => previous.map(item => item.id === group.id ? {...item, ...fields} : item));
  }
  function changeItem(item: Item) {
    patch({rows: rows.map(row => row.id === item.id ? item : row)});
  }
  function openName(mode: 'create' | 'rename' | 'copy') {
    setName(mode === 'create' ? '' : (group?.name ?? '') + (mode === 'copy' ? ' 副本' : ''));
    setOperation(mode);
  }
  function saveName(event: FormEvent) {
    event.preventDefault();
    const input = name.trim();
    if (!input) return;
    if (groups.some(item => item.name === input && (operation !== 'rename' || item.id !== group?.id))) {
      notify('配置组名称已存在。', 'warning');
      return;
    }
    if (operation === 'rename') patch({name: input});
    else {
      const id = crypto.randomUUID();
      const copied = operation === 'copy' && group ? {...group, next: undefined,
        rows: rows.map(row => ({...row, id: crypto.randomUUID()}))} : {rows: []};
      setGroups(previous => [...previous, {...copied, id, name: input}]);
      choose(id);
    }
    setOperation(undefined);
  }
  function remove(taskToRemove: Item, folder: boolean) {
    const related = taskToRemove.path?.includes('/') ? taskToRemove.path.slice(0, taskToRemove.path.lastIndexOf('/') + 1) : '';
    const keep = rows.filter(row => folder && related ? row.kind !== taskToRemove.kind || !row.path?.startsWith(related) :
      row.id !== taskToRemove.id);
    patch({rows: keep, next: keep.some(row => row.id === group?.next) ? group?.next : undefined});
    setSelected('');
    notify('已移除任务。');
  }
  const addItems = (['scripts', 'pathing', 'recordings', 'shell'] as const).map(kind => ({id: kind, label: kindNames[kind]}));
  const openAdd = (kind: Kind) => setAdd({key: crypto.randomUUID(), kind, open: true});

  return <SplitView size={width} onResize={setWidth}
    start={<>
      <Toolbar actions={<IconButton label="新增配置组" icon="plus" onClick={() => openName('create')}/>}>
        <Text variant="section">配置组</Text>
      </Toolbar>
      {groups.length > 0 && <ReorderList label="配置组列表" rows={groups.map(item => ({id: item.id, label: item.name}))}
        selected={group?.id} onSelect={choose} onEdit={id => {
          choose(id);
          const target = groups.find(item => item.id === id);
          if (target) {setName(target.name); setOperation('rename');}
        }}
        onChange={order => setGroups(order.flatMap(row => groups.find(item => item.id === row.id) ?? []))}/>}
      <DropMenu label="配置组操作" items={[
        {id: 'create', label: '新增组'}, {id: 'rename', label: '重命名', disabled: !group},
        {id: 'copy', label: '复制组', disabled: !group}, {id: 'delete', label: '删除组', danger: true, disabled: !group},
        {id: 'start', label: '连续任务从此开始执行', disabled: !group || group.config?.HideFromContinuous === true},
      ]} onSelect={action => {
        if (action === 'create' || action === 'rename' || action === 'copy') openName(action);
        if (action === 'start' && group) {setStartGroup(group.id); setRun('continuous');}
        if (action === 'delete' && group) setConfirm({title: '删除配置组', message: '确定删除「' + group.name + '」？',
          apply: () => {setGroups(items => items.filter(item => item.id !== group.id)); choose('');}});
      }}/>
      <Button disabled={!runGroups.length} onClick={() => {setStartGroup(''); setRun('continuous');}}>连续执行</Button>
    </>}
    end={<>
      {group ? <>
        <Text variant="section">{'（实验功能）配置组 - ' + group.name}</Text>
        <Text variant="caption">拖拽可调整任务执行顺序。支持 JavaScript 脚本、地图追踪任务、键鼠录制脚本和 Shell。</Text>
        <div className="bgi-wrap">
          <Button appearance="primary" icon="play" disabled={!rows.some(item => item.enabled)} onClick={() => setRun('single')}>运行</Button>
          <DropMenu label="添加" items={addItems} onSelect={value => openAdd(value as Kind)}/>
          <DropMenu label="更多功能" items={[
            {id: 'clear', label: '清空', disabled: !rows.length},
            {id: 'logs', label: '日志分析'},
            {id: 'repo', label: '打开脚本仓库'},
            {id: 'folders', label: '根据文件夹更新', disabled: true, disabledReason: unavailable},
            {id: 'reverse', label: '任务倒序排列', disabled: rows.length < 2},
          ]} onSelect={value => {
            if (value === 'reverse') patch({rows: rows.slice().reverse()});
            if (value === 'logs') navigate('history');
            if (value === 'repo') setRepository(true);
            if (value === 'clear') setConfirm({title: '清空任务', message: '确定清空本配置组的全部任务？',
              apply: () => {patch({rows: [], next: undefined}); setSelected('');}});
          }}/>
          <Button icon="settings" onClick={() => setSettings({key: crypto.randomUUID(), open: true})}>设置</Button>
        </div>
        <DropMenu label="任务操作" context items={[
          ...addItems.map(item => ({...item, label: '添加' + item.label})),
          {id: 'next', label: '下一次任务从此处执行', disabled: !task, separatorBefore: true},
          {id: 'edit', label: '修改通用配置', disabled: !task},
          {id: 'custom', label: '修改JS脚本自定义配置', disabled: task?.kind !== 'scripts'},
          {id: 'directory', label: '打开所在目录', disabled: true, disabledReason: unavailable},
          {id: 'remove', label: '移除', disabled: !task, danger: true},
          {id: 'removeFolder', label: '根据文件夹移除', disabled: !task?.path?.includes('/'), danger: true},
        ]}
        trigger={<div className="bgi-scheduler-list" onContextMenuCapture={event => {
          const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-bgi-row]') : null;
          if (row?.dataset.bgiRow) setSelected(row.dataset.bgiRow);
        }}>
          <div className="bgi-scheduler-column-header">
            <span>#</span><span>名称</span><span>类型</span><span>启用状态</span>
          </div>
          <ReorderList label="配置组任务" rows={rows.map(row => ({...row, detail: undefined, status: row.id === group.next ? '下次起点' : undefined}))} showIndex
            selected={selected} onSelect={setSelected} onEdit={id => {
              const value = rows.find(row => row.id === id);
              if (value) setEditor({key: crypto.randomUUID(), task: value, open: true, custom: false});
            }}
            onChange={order => patch({rows: order.flatMap(row => rows.find(item => item.id === row.id) ?? [])})}
            renderDetails={row => {
              const value = rows.find(entry => entry.id === row.id);
              return value && <div className="bgi-scheduler-columns">
                <span>{kindNames[value.kind]}</span>
                <Switch label={'启用 ' + value.label} checked={value.enabled} showLabel={false}
                  onChange={enabled => changeItem({...value, enabled})}/>
              </div>;
            }}/>
        </div>}
        onSelect={value => {
          if (addItems.some(item => item.id === value)) openAdd(value as Kind);
          else if (task && value === 'next') {patch({next: task.id}); notify('已标记下一次执行起点。');}
          else if (task && (value === 'edit' || value === 'custom'))
            setEditor({key: crypto.randomUUID(), task, open: true, custom: value === 'custom'});
          else if (task && (value === 'remove' || value === 'removeFolder')) remove(task, value === 'removeFolder');
        }}/>
      </> : <Empty title="请在左侧栏选择或新增配置组"
        description="配置组内可添加脚本、地图追踪任务和录制回放，并调整它们的执行顺序。"
        action={<><Link href="https://www.bettergi.com/feats/autos/dispatcher.html">点击查看调度器使用教程</Link>
          <Button appearance="primary" icon="plus" onClick={() => openName('create')}>新增配置组</Button></>}/>}
      <Modal title={operation === 'rename' ? '重命名配置组' : operation === 'copy' ? '复制配置组' : '新增配置组'}
        open={operation !== undefined} onChange={value => {if (!value) setOperation(undefined);}}
        actions={<><Button onClick={() => setOperation(undefined)}>取消</Button>
          <Button appearance="primary" form="bgi-scheduler-name" type="submit" disabled={!name.trim()}>确定</Button></>}>
        <form id="bgi-scheduler-name" onSubmit={saveName}>
          <Field label="配置组名称"><Input aria-label="配置组名称" value={name} onChange={event => setName(event.currentTarget.value)}/></Field>
        </form>
      </Modal>
      {add && <AddTaskDialog key={add.key} open={add.open} kind={add.kind} sources={sources[add.kind]}
        onClose={() => setAdd({...add, open: false})} onAdd={items => patch({rows: [...rows, ...items]})}/>}
      {editor && <ProjectEditor key={editor.key} open={editor.open} task={editor.task} custom={editor.custom}
        fields={scripts.find(item => item.id === editor.task.sourceId)?.settings} onSave={changeItem} onClose={() => setEditor({...editor, open: false})}/>}
      {settings && <GroupSettings key={settings.key} initial={group?.config ?? {}} open={settings.open}
        onClose={() => setSettings({...settings, open: false})} onSave={config => patch({config})}
        onRepository={() => {setSettings({...settings, open: false}); setRepository(true);}} navigate={navigate}/>}
      <TaskRepositoryDialog open={repository} onChange={setRepository} onOpenLocal={() => navigate('scripts')}/>
      <Modal title={run === 'continuous' ? '连续执行' : '运行配置组'} open={run !== undefined}
        onChange={value => {if (!value) setRun(undefined);}}
        actions={<><Button onClick={() => setRun(undefined)}>取消</Button>
          <Button appearance="primary" disabled title={unavailable}>开始执行</Button></>}>
        {runRows.length ? <List rows={runRows}/> : <Empty title="暂无可执行任务"/>}
      </Modal>
      <MessageDialog title={confirm?.title ?? ''} message={confirm?.message ?? ''} tone="warning"
        open={confirm !== undefined} onChange={open => {if (!open) setConfirm(undefined);}} confirm={() => confirm?.apply()}/>
      <Snackbar {...snackbar}/>
    </>}/>;
}
