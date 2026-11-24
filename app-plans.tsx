import {useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {Badge, Button, Field, Icon, IconButton, Input, NumberField, Select, Switch, Text} from './controls';
import {Empty, ReorderList, Tabs, Toolbar, Tree, type TreeNode} from './collections';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {FileInput} from './media';
import {SplitView} from './panels';
import {useAppValue} from './app-state';
import {useAccounts} from './account-state';
import {taskGroups} from './task-definitions';
import {
  addTask, copyPlan, copyTask, flattenTasks, newTask, normalizePlan, patchTask, planKinds, removeTask,
  type PlanKind, type PlanTask, type TaskPlan, type TaskSources,
} from './plan-model';
import {RunPreviewDialog, SettingsProfilesDialog, SharedSettingsDialog, TaskNodeDialog, useTaskProfiles} from './plan-dialogs';
import {PlanTriggers} from './plan-triggers';
import {PlanHistory} from './plan-history';

type LibraryEntry = {id: string; label: string; filename: string};
type NameMode = 'create' | 'rename' | 'copy';
type TaskEditor = {key: string; open: boolean; initial: PlanTask; creating: boolean; parent: string};
type SharedEditor = {key: string; open: boolean; taskId: string; value: string};
type InfoModal = 'preview' | 'profiles' | 'triggers' | 'history' | 'import' | 'import-report';
const noPlans: TaskPlan[] = [];
const noRows: LibraryEntry[] = [];
const sections = [{value: 'tasks', label: '任务'}, {value: 'history', label: '执行记录'}, {value: 'triggers', label: '触发方式'}];
const kindOptions = Object.entries(planKinds).map(([id, kind]) => ({
  id, label: kind.action, icon: <Icon name={kind.icon}/>,
}));

function treeRows(rows: readonly PlanTask[]): TreeNode[] {
  return rows.map(task => ({
    id: task.id, label: task.label, icon: planKinds[task.kind].icon, children: task.children && treeRows(task.children),
  }));
}

function dependsOn(plan: TaskPlan, sought: string, plans: readonly TaskPlan[], visited = new Set<string>()): boolean {
  if (plan.id === sought) return true;
  if (visited.has(plan.id)) return false;
  visited.add(plan.id);
  return flattenTasks(plan.rows).some(task => {
    if (task.kind !== 'reference' || !task.sourceId) return false;
    const linked = plans.find(value => value.id === task.sourceId);
    return Boolean(linked && dependsOn(linked, sought, plans, visited));
  });
}

const keyFor = (mode: 'plan' | 'new-dragon') => 'plans/' + mode;
const planLabel = (dragon: boolean) => dragon ? '配置' : '计划';

export function PuloniaEditor({mode, navigate}: {mode: 'plan' | 'new-dragon'; navigate: (route: string) => void}) {
  const dragon = mode === 'new-dragon';
  const [stored, setStored] = useAppValue(keyFor(mode), noPlans);
  const plans = useMemo(() => stored.map(normalizePlan), [stored]);
  const [planCatalog] = useAppValue('plans/plan', noPlans);
  const [accounts] = useAccounts();
  const [scripts] = useAppValue('library/scripts', noRows);
  const [paths] = useAppValue('library/pathing', noRows);
  const [recordings] = useAppValue('library/recordings', noRows);
  const [profiles] = useTaskProfiles();
  const [current, setCurrent] = useState('');
  const [selected, setSelected] = useState('');
  const [reveal, setReveal] = useState('');
  const [tab, setTab] = useState('tasks');
  const [leftWidth, setLeftWidth] = useState(190);
  const [nameForm, setNameForm] = useState<NameMode | null>(null);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [editor, setEditor] = useState<TaskEditor>();
  const [shared, setShared] = useState<SharedEditor>();
  const [modal, setModal] = useState<InfoModal>();
  const [remove, setRemove] = useState<'plan' | 'task'>();
  const [clipboard, setClipboard] = useState<PlanTask>();
  const [undo, setUndo] = useState<TaskPlan[]>([]);
  const [cdAccount, setCdAccount] = useState<string>();
  const [importBody, setImportBody] = useState<TaskPlan[]>();
  const [importError, setImportError] = useState('');
  const [importReport, setImportReport] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const plan = plans.find(item => item.id === current) ?? plans[0];
  const items = useMemo(() => flattenTasks(plan?.rows ?? []), [plan?.rows]);
  const task = items.find(item => item.id === selected);
  const accountsOptions = [{value: '', label: '跟随当前账户'},
    ...accounts.filter(item => item.uid).map(item => ({value: item.id, label: item.name}))];
  const actualAccount = accountsOptions.some(item => item.value === plan?.account) ? plan?.account ?? '' : '';
  const profileOptions = [{value: '', label: '无'}, ...profiles.map(item => ({value: item.id, label: item.label}))];
  const taskSources: TaskSources = {
    solo: [...taskGroups.map(item => item.title), '合成浓缩树脂', '领取每日奖励', '尘歌壶']
      .map(label => ({id: label, label})),
    scripts: scripts.map(item => ({id: item.id, label: item.label, path: item.filename})),
    pathing: paths.map(item => ({id: item.id, label: item.label, path: item.filename})),
    recordings: recordings.map(item => ({id: item.id, label: item.label, path: item.filename})),
    reference: planCatalog.map(normalizePlan).filter(item => dragon || !plan || !dependsOn(item, plan.id, plans))
      .map(item => ({id: item.id, label: item.name})),
  };

  function choosePlan(id: string) {
    setCurrent(id);
    setSelected('');
    setReveal('');
    setTab('tasks');
    setCdAccount(undefined);
    setUndo([]);
  }

  function patch(update: Partial<TaskPlan>, snapshot = true) {
    if (!plan) return;
    if (snapshot) setUndo(previous => [...previous.slice(-19), plan]);
    setStored(previous => previous.map(item => item.id === plan.id ? {...normalizePlan(item), ...update} : item));
  }

  function undoEdit() {
    const previous = undo.at(-1);
    if (!previous || previous.id !== plan?.id) return;
    patch(previous, false);
    setUndo(history => history.slice(0, -1));
  }

  function nameDialog(operation: NameMode, id?: string) {
    const target = id ? plans.find(item => item.id === id) : plan;
    if (target && target.id !== plan?.id) choosePlan(target.id);
    setName(operation === 'create' ? '' : (target?.name ?? '') + (operation === 'copy' ? ' 副本' : ''));
    setProfile(target?.profile ?? '');
    setNameForm(operation);
  }

  function saveName() {
    const value = name.trim();
    if (!value) return;
    if (nameForm === 'rename') patch({name: value});
    else {
      const next = nameForm === 'copy' && plan ? copyPlan(plan, value) :
        {id: crypto.randomUUID(), name: value, account: '', rows: [], profile};
      setStored(previous => [...previous, next]);
      choosePlan(next.id);
    }
    setNameForm(null);
  }

  function closeTask() {
    setEditor(previous => previous && {...previous, open: false});
  }

  function createTask(kind: PlanKind) {
    if (!plan) return;
    setEditor({key: crypto.randomUUID(), open: true, initial: newTask(kind, planKinds[kind].label),
      creating: true, parent: task?.kind === 'group' ? task.id : ''});
  }

  function editTask(id = task?.id) {
    const row = items.find(item => item.id === id);
    if (row) setEditor({key: crypto.randomUUID(), open: true, initial: row, creating: false, parent: ''});
  }

  function saveTask(value: PlanTask) {
    if (!editor || !plan) return;
    patch({rows: editor.creating ? addTask(plan.rows, editor.parent, value) :
      patchTask(plan.rows, value.id, () => value)});
    setSelected(value.id);
    setReveal(value.id);
    closeTask();
  }

  function paste() {
    if (!clipboard || !plan) return;
    const value = copyTask(clipboard);
    const createsCycle = !dragon && flattenTasks([value]).some(entry => {
      const linked = plans.find(item => item.id === entry.sourceId);
      return entry.kind === 'reference' && linked && dependsOn(linked, plan.id, plans);
    });
    if (createsCycle) {notify('这个引用会造成循环。', 'warning'); return;}
    patch({rows: addTask(plan.rows, task?.kind === 'group' ? task.id : '', value)});
    setSelected(value.id);
    setReveal(value.id);
  }

  function removeSelected() {
    if (!plan) return;
    if (remove === 'plan') {
      if (plans.some(candidate => candidate.id !== plan.id && flattenTasks(candidate.rows)
        .some(entry => entry.kind === 'reference' && entry.sourceId === plan.id))) {
        notify('此计划仍被引用，请先移除引用。', 'warning');
        return;
      }
      setStored(previous => previous.filter(candidate => candidate.id !== plan.id));
      choosePlan('');
    } else if (task) {
      const removedIds = new Set(flattenTasks([task]).map(item => item.id));
      patch({rows: removeTask(plan.rows, task.id),
        triggers: plan.triggers?.map(trigger => removedIds.has(trigger.target) ?
          {...trigger, target: '', enabled: false} : trigger)});
      setSelected('');
    }
  }

  function shiftTask(offset: number) {
    if (!plan || !task) return;
    function shift(rows: PlanTask[]): PlanTask[] {
      const index = rows.findIndex(item => item.id === task?.id);
      if (index < 0) return rows.map(item => item.children ? {...item, children: shift(item.children)} : item);
      const next = index + offset;
      if (next < 0 || next >= rows.length) return rows;
      const result = [...rows];
      [result[index], result[next]] = [result[next], result[index]];
      return result;
    }
    patch({rows: shift(plan.rows)});
  }

  function taskKeys(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('input, textarea, [role=combobox]')) return;
    if (event.key === 'F2' && task) {event.preventDefault(); editTask();}
    if (event.key === 'Delete' && task) {event.preventDefault(); setRemove('task');}
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && task) {
      event.preventDefault(); setClipboard(task); notify('已复制任务');
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'v' && clipboard) {event.preventDefault(); paste();}
    if (event.ctrlKey && event.key.toLowerCase() === 'z' && undo.length) {event.preventDefault(); undoEdit();}
  }

  async function readImport([input]: File[]) {
    if (!input) return;
    setImportError('');
    setImportBody(undefined);
    setModal('import');
    try {
      const value: unknown = JSON.parse(await input.text());
      if (!Array.isArray(value) || !value.length || value.some(entry =>
        typeof entry?.name !== 'string' || !Array.isArray(entry.rows))) throw new Error();
      const mapped = (value as TaskPlan[]).map(entry =>
        copyPlan(normalizePlan({...entry, id: entry.id ?? crypto.randomUUID()}), entry.name));
      setImportBody(mapped);
    } catch {
      setImportError('文件中没有可识别的一条龙配置。');
    }
  }

  const taskOperations = [
    {id: 'copy', label: '复制子树', disabled: !task},
    {id: 'paste', label: '粘贴', disabled: !clipboard},
    {id: 'up', label: '上移', disabled: !task},
    {id: 'down', label: '下移', disabled: !task},
    {id: 'delete', label: '删除', disabled: !task, danger: true},
    {id: 'undo', label: '撤销上次编辑', disabled: !undo.length, separatorBefore: true},
  ];

  function runTaskMenu(action: string) {
    switch (action) {
      case 'copy': if (task) {setClipboard(task); notify('已复制任务');} break;
      case 'paste': paste(); break;
      case 'up': shiftTask(-1); break;
      case 'down': shiftTask(1); break;
      case 'delete': setRemove('task'); break;
      case 'undo': undoEdit(); break;
    }
  }

  const selector = plan && <Field label="运行账户"><Select label="运行账户" value={actualAccount}
    options={accountsOptions} onValueChange={account => patch({account})}/></Field>;
  const editorTree = plan && <div className="bgi-stack" onKeyDown={taskKeys}>
    <Toolbar actions={<>
      <DropMenu label={dragon ? '添加任务' : '添加'} items={kindOptions} onSelect={id => createTask(id as PlanKind)}/>
      <IconButton icon="settings" label="编辑选中任务" disabled={!task} onClick={() => editTask()}/>
      <IconButton icon="sliders" label="任务共享设置" disabled={!task}
        onClick={() => task && setShared({key: crypto.randomUUID(), open: true, taskId: task.id, value: task.shared ?? '{}'})}/>
      <DropMenu label="更多任务操作" items={taskOperations} onSelect={runTaskMenu}/>
    </>}><Text variant="section">{dragon ? '任务列表' : '任务'}</Text></Toolbar>
    <Tree key={plan.id} rows={treeRows(plan.rows)} selected={selected} onSelect={setSelected} reveal={reveal}
      onEdit={editTask} empty="这个计划还没有任务" columns={{name: '名称', fields: dragon ? ['启用'] : ['类型', '启用'], render: node => {
        const item = items.find(row => row.id === node.id);
        return item && <>
          {!dragon && <Badge>{planKinds[item.kind].label}</Badge>}
          <Switch label={'启用 ' + item.label} checked={item.enabled} showLabel={false}
            onChange={enabled => patch({rows: patchTask(plan.rows, item.id, entry => ({...entry, enabled}))})}/>
        </>;
      }}}/>
  </div>;

  return <div className="bgi-stack bgi-plan-workspace">
    {!dragon && <Toolbar actions={<>
      <Button disabled title="需要本机 BetterGI 的仓库接口">一键同步并更新</Button>
      <Button disabled title="需要本机 BetterGI 的仓库接口">检查任务资源更新</Button>
    </>}>
      <Button appearance="primary" icon="plus" onClick={() => nameDialog('create')}>新建任务计划</Button>
    </Toolbar>}
    <SplitView size={leftWidth} onResize={setLeftWidth}
      start={dragon ? editorTree ?? <Empty title="还没有任务"/> : <>
        <Toolbar actions={<IconButton icon="plus" label="新建计划" onClick={() => nameDialog('create')}/>}>
          <Text variant="section">计划</Text>
        </Toolbar>
        {plans.length ? <ReorderList label="计划" rows={plans.map(item => ({id: item.id, label: item.name}))}
          selected={plan?.id} onSelect={choosePlan} onEdit={id => nameDialog('rename', id)}
          onChange={rows => setStored(rows.flatMap(row => plans.find(item => item.id === row.id) ?? []))}/> :
          <Empty title="暂无任务计划"/>}
        {plan && <DropMenu label="计划操作" items={[
          {id: 'rename', label: '重命名'}, {id: 'copy', label: '复制'},
          {id: 'profiles', label: '设置方案…'}, {id: 'remove', label: '删除', danger: true},
        ]} onSelect={id => {
          if (id === 'rename' || id === 'copy') nameDialog(id);
          if (id === 'profiles') setModal('profiles');
          if (id === 'remove') setRemove('plan');
        }}/>}
      </>}
      end={plan ? dragon ? <>
        <Toolbar actions={<>
          <DropMenu label="配置操作" items={[
            {id: 'new', label: '新增配置'}, {id: 'rename', label: '重命名配置'},
            {id: 'delete', label: '删除配置', danger: true}, {id: 'import', label: '导入旧配置', separatorBefore: true},
            {id: 'report', label: '查看导入报告', disabled: !importReport},
          ]} onSelect={id => {
            if (id === 'new') nameDialog('create');
            if (id === 'rename') nameDialog('rename');
            if (id === 'delete') setRemove('plan');
            if (id === 'import') file.current?.click();
            if (id === 'report') setModal('import-report');
          }}/>
          <IconButton icon="play" label="开始一条龙" disabled title="需要本机 BetterGI 的任务执行接口"/>
        </>}><Text variant="section">配置</Text></Toolbar>
        <Select label="一条龙配置" value={plan.id} options={plans.map(item => ({value: item.id, label: item.name}))}
          onValueChange={choosePlan}/>
        {selector}
        <div className="bgi-wrap">
          <Button onClick={() => navigate('accounts')}>管理账户与登录资料</Button>
          <Button onClick={() => setModal('triggers')}>定时与热键</Button>
          <Button onClick={() => setModal('history')}>执行记录</Button>
          <Button onClick={() => setShared({key: crypto.randomUUID(), open: true, taskId: '', value: plan.shared ?? '{}'})}>配置共享设置…</Button>
        </div>
        {task ? <>
          <Field label="任务名称"><Input aria-label="所选步骤名称" value={task.label}
            onChange={event => {
              const value = event.currentTarget.value;
              patch({rows: patchTask(plan.rows, task.id, entry => ({...entry, label: value}))});
            }}/></Field>
          <Field label="整组执行次数"><NumberField label="整组执行次数" min={1} max={999} value={task.repetitions}
            onChange={repetitions => patch({rows: patchTask(plan.rows, task.id, entry => ({...entry, repetitions}))})}/></Field>
          <Button onClick={() => editTask()}>高级设置</Button>
        </> : <Empty title="选择左侧任务查看配置。"/>}
      </> : <>
        <Toolbar actions={<>
          <Button onClick={() => nameDialog('rename')}>重命名</Button>
          <Button onClick={() => setShared({key: crypto.randomUUID(), open: true, taskId: '', value: plan.shared ?? '{}'})}>计划共享设置…</Button>
          <Button onClick={() => setModal('preview')}>预览</Button>
          <Button appearance="primary" icon="play" disabled title="需要本机 BetterGI 的任务执行接口">开始执行</Button>
        </>}><Text variant="section">{plan.name}</Text></Toolbar>
        <div className="bgi-cascade">
          {selector}
          <Field label="CD 按账户"><Select label="CD 按账户" options={accountsOptions}
            value={cdAccount ?? actualAccount} onValueChange={setCdAccount}/></Field>
        </div>
        <Tabs label="任务计划内容" options={sections} value={tab} onChange={setTab}/>
        {tab === 'tasks' && editorTree}
        {tab === 'history' && <PlanHistory planId={plan.id}/>}
        {tab === 'triggers' && <PlanTriggers triggers={plan.triggers ?? []} rows={plan.rows}
          onChange={triggers => patch({triggers})}/>}
      </> : <Empty title={dragon ? '暂无一条龙配置' : '请选择或新建任务计划'}
        action={dragon && <div className="bgi-wrap">
          <Button appearance="primary" icon="plus" onClick={() => nameDialog('create')}>新增配置</Button>
          <Button onClick={() => file.current?.click()}>导入旧配置</Button>
        </div>}/>}/>
    <FileInput inputRef={file} accept=".json,application/json" onFiles={readImport}/>
    <Modal title={nameForm === 'rename' ? '重命名' + planLabel(dragon) :
      nameForm === 'copy' ? '复制' + planLabel(dragon) : dragon ? '新增配置' : '新建任务计划'}
      open={nameForm !== null} onChange={open => {if (!open) setNameForm(null);}}
      actions={<><Button onClick={() => setNameForm(null)}>取消</Button>
        <Button appearance="primary" type="submit" form="bgi-pulonia-name" disabled={!name.trim()}>
          {nameForm === 'create' ? '新建' : '确定'}
        </Button></>}>
      <form id="bgi-pulonia-name" className="bgi-stack" onSubmit={event => {event.preventDefault(); saveName();}}>
        <Field label={planLabel(dragon) + '名称'}><Input aria-label={planLabel(dragon) + '名称'} value={name}
          onChange={event => setName(event.currentTarget.value)}/></Field>
        {nameForm === 'create' && !dragon && <Field label="设置方案"><Select label="设置方案"
          value={profile} options={profileOptions} onValueChange={setProfile}/></Field>}
      </form>
    </Modal>
    {editor && <TaskNodeDialog key={editor.key} initial={editor.initial} creating={editor.creating}
      sources={taskSources[editor.initial.kind] ?? []} dragon={dragon} open={editor.open}
      onClose={closeTask} onSave={saveTask}/>}
    {shared && <SharedSettingsDialog key={shared.key} open={shared.open} title={shared.taskId ? '任务共享设置' : '计划共享设置'}
      inherited={shared.taskId ? plan?.shared : profiles.find(item => item.id === plan?.profile)?.shared}
      profile={shared.taskId ? undefined : plan?.profile} onProfile={shared.taskId ? undefined : profile => patch({profile})}
      onManageProfiles={() => setModal('profiles')}
      value={shared.value} onChange={value => {
        if (shared.taskId && plan) patch({rows: patchTask(plan.rows, shared.taskId, entry => ({...entry, shared: value}))});
        else patch({shared: value});
      }} onClose={() => setShared(previous => previous && {...previous, open: false})}/>}
    <SettingsProfilesDialog open={modal === 'profiles'} onClose={() => setModal(undefined)}/>
    {plan && <RunPreviewDialog key={plan.id} open={modal === 'preview'} plan={plan} accounts={accountsOptions}
      onClose={() => setModal(undefined)}/>}
    {plan && dragon && <>
      <Modal title="定时与热键" open={modal === 'triggers'} onChange={open => {if (!open) setModal(undefined);}}>
        <PlanTriggers key={plan.id} triggers={plan.triggers ?? []} rows={plan.rows} onChange={triggers => patch({triggers})}/>
      </Modal>
      <Modal title="执行记录" open={modal === 'history'} onChange={open => {if (!open) setModal(undefined);}}>
        <PlanHistory key={plan.id} planId={plan.id}/>
      </Modal>
    </>}
    <Modal title={modal === 'import-report' ? '导入报告' : '旧数据导入预览'} open={modal === 'import' || modal === 'import-report'}
      onChange={open => {if (!open) setModal(undefined);}}
      actions={<><Button onClick={() => setModal(undefined)}>{modal === 'import-report' ? '关闭' : '取消'}</Button>
        {modal === 'import' && <Button appearance="primary" disabled={!importBody?.length} onClick={() => {
          if (!importBody?.length) return;
          setStored(previous => [...previous, ...importBody]);
          setImportReport('已导入 ' + importBody.length + ' 份配置。');
          choosePlan(importBody[0].id);
          setModal('import-report');
        }}>确认导入</Button>}</>}>
      {modal === 'import-report' ? <Text variant="body">{importReport}</Text> : importError ?
        <p className="bgi-error-text" role="alert">{importError}</p> : importBody &&
          <ReorderList rows={importBody.map(item => ({id: item.id, label: item.name}))}
            onChange={rows => setImportBody(rows.flatMap(row => importBody.find(item => item.id === row.id) ?? []))}/>}
    </Modal>
    <MessageDialog title={remove === 'plan' ? '删除' + planLabel(dragon) : '删除任务'}
      message={'确定删除「' + (remove === 'plan' ? plan?.name : task?.label) + '」？'} tone="warning"
      open={remove !== undefined} onChange={open => {if (!open) setRemove(undefined);}} confirm={removeSelected}/>
    <Snackbar {...snackbar}/>
  </div>;
}
