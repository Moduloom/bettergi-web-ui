import {useState} from 'react';
import {Button, Field, Input, NumberField, SearchField, Select, Switch, Text} from './controls';
import {Card, Empty, Expander, List, SettingsRow, Toolbar, type Row} from './collections';
import {Modal, MessageDialog, useSnackbar, Snackbar} from './overlays';
import {CodeEditor} from './media';
import {SplitView} from './panels';
import {useAppValue} from './app-state';
import {flattenTasks, parseSettings, planKinds, planRows, type PlanTask, type TaskPlan, type TaskSource} from './plan-model';
import {RepositoryManagerDialog, RepositorySelect, usePlanRepositories} from './plan-repositories';
import {SharedSettingsForm} from './plan-shared-settings';

export type SettingsProfile = {id: string; label: string; shared: string};
export function useTaskProfiles() {
  return useAppValue<SettingsProfile[]>('pulonia/settings-profiles', []);
}

type TaskDialogProps = {
  initial: PlanTask; sources: readonly TaskSource[]; creating: boolean; dragon: boolean;
  open: boolean; onClose: () => void; onSave: (task: PlanTask) => void;
};

function JsonField({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
  return <Field label={label}><CodeEditor label={label} language="json" value={value} onChange={onChange}/></Field>;
}

export function TaskNodeDialog({initial, sources, creating, dragon, open, onClose, onSave}: TaskDialogProps) {
  const [draft, setDraft] = useState(initial);
  const [search, setSearch] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [shared, setShared] = useState(false);
  const [repositories, setRepositories] = usePlanRepositories();
  const [repository, setRepository] = useState(sources.length ? 'imported' : 'official');
  const [manage, setManage] = useState(false);
  const supportsRepositories = creating && (draft.kind === 'scripts' || draft.kind === 'pathing');
  const available = supportsRepositories && repository !== 'imported' ? [] : sources;
  const query = search.trim().toLowerCase();
  const visible = available.filter(item => (item.label + ' ' + (item.path ?? '')).toLowerCase().includes(query));
  const sourceKind = ['solo', 'pathing', 'scripts', 'recordings', 'reference'].includes(draft.kind);
  const sourcePath = ['pathing', 'scripts', 'recordings', 'shell', 'csharp'].includes(draft.kind);
  const picked = sources.find(item => item.id === draft.sourceId);
  const canSave = Boolean(draft.label.trim()) && (draft.kind !== 'reference' || Boolean(picked))
    && [draft.parameters, draft.shared, draft.policy, draft.source].every(value => parseSettings(value ?? '{}'));

  function edit(update: Partial<PlanTask>) {
    setDraft(previous => ({...previous, ...update}));
  }

  function choose(id: string) {
    const item = sources.find(source => source.id === id);
    if (!item) return;
    edit({
      sourceId: item.id, sourcePath: item.path,
      label: draft.label === planKinds[draft.kind].label || draft.label === picked?.label ? item.label : draft.label,
    });
  }

  function chooseRepository(id: string) {
    setRepository(id);
    edit({sourceId: undefined, sourcePath: undefined});
  }

  return <><Modal title={creating ? dragon ? '添加步骤' : '添加' + planKinds[draft.kind].label :
    dragon ? '一条龙步骤配置' : '编辑任务配置'} open={open} onChange={value => {if (!value) onClose();}}
    actions={<><Button onClick={onClose}>取消</Button>
      <Button appearance="primary" disabled={!canSave} onClick={() => onSave({...draft, label: draft.label.trim()})}>
        {creating ? dragon ? '添加步骤' : '添加任务' : '保存'}
      </Button></>}>
    <div className="bgi-stack">
      {creating && sourceKind && <div className="bgi-stack">
        <Text variant="section">{draft.kind === 'reference' ? '选择任务计划' : '选择' + planKinds[draft.kind].label}</Text>
        {supportsRepositories && <Card title="仓库"
          description="当前列表读取本机仓库副本或本地仓库。如需最新内容，请先同步仓库。"
          action={<div className="bgi-wrap"><div className="bgi-repository-choice">
            <RepositorySelect value={repository} onChange={chooseRepository} repositories={repositories}
              includeImported={sources.length > 0}/>
          </div><Button onClick={() => setManage(true)}>管理仓库</Button></div>}/>}
        <SearchField label="筛选任务资源" value={search} onChange={setSearch}/>
        {visible.length ? <List rows={visible.map(item => ({id: item.id, label: item.label, detail: item.path, icon: planKinds[draft.kind].icon}))}
          selected={draft.sourceId ?? ''} onSelect={choose}/> :
          <Empty title={search ? '没有匹配的资源' : '暂无可选资源'}
            description={supportsRepositories && repository !== 'imported' ? '当前仓库暂无可选的本机资源。' : '到对应资源页导入后可在这里选择。'}
            action={supportsRepositories && !search && <Button onClick={() => setManage(true)}>打开仓库管理</Button>}/>}
      </div>}
      <Field label={dragon ? '步骤名称' : '任务名称'} description="显示在任务列表中的名称。">
        <Input aria-label={dragon ? '步骤名称' : '任务名称'} value={draft.label}
          onChange={event => edit({label: event.currentTarget.value})}/>
      </Field>
      {!creating && <SettingsRow inline label={dragon ? '启用此步骤' : '启用此任务'}
        description="停用后运行计划时跳过此任务。"
        control={<Switch label={dragon ? '启用此步骤' : '启用此任务'} checked={draft.enabled}
          onChange={enabled => edit({enabled})} showLabel={false}/>}/>}
      <Field label={draft.kind === 'group' || draft.kind === 'reference' ? '整组执行次数' : '执行次数'}>
        <NumberField label="执行次数" value={draft.repetitions} min={1} max={999}
          onChange={repetitions => edit({repetitions})}/>
      </Field>
      {sourcePath && <Field label="资源路径">
        <Input aria-label="资源路径" value={draft.sourcePath ?? ''}
          onChange={event => edit({sourcePath: event.currentTarget.value})}/>
      </Field>}
      {!creating && <>
        <Expander title="共享设置" description="队伍、战斗、拾取与行走等" open={shared} onChange={setShared}>
          <SharedSettingsForm value={draft.shared ?? '{}'} onChange={value => edit({shared: value})} compact/>
        </Expander>
        <Expander title="高级设置" description="任务参数、执行策略与引用来源" open={advanced} onChange={setAdvanced}>
          <div className="bgi-stack">
            <JsonField label="任务参数" value={draft.parameters ?? '{}'} onChange={value => edit({parameters: value})}/>
            <Button appearance="transparent" onClick={() => edit({parameters: '{}'})}>清空本任务参数</Button>
            <JsonField label="执行策略" value={draft.policy ?? '{}'} onChange={value => edit({policy: value})}/>
            <JsonField label="引用来源" value={draft.source ?? '{}'} onChange={value => edit({source: value})}/>
          </div>
        </Expander>
      </>}
    </div>
  </Modal>
  {supportsRepositories && <RepositoryManagerDialog open={manage} onChange={setManage} repositories={repositories}
    onRepositories={setRepositories} selected={repository} onSelect={chooseRepository}/>}
  </>;
}

export function SharedSettingsDialog({open, title, value, inherited, onChange, onClose, profile, onProfile, onManageProfiles}: {
  open: boolean; title: string; value: string; inherited?: string;
  onChange: (value: string) => void; onClose: () => void;
  profile?: string; onProfile?: (id: string) => void; onManageProfiles: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [profiles, setProfiles] = useTaskProfiles();
  const [saveAs, setSaveAs] = useState(false);
  const [profileName, setProfileName] = useState('');
  const canSaveProfile = profileName.trim() && !profiles.some(item => item.label === profileName.trim());

  function createProfile() {
    if (!canSaveProfile || !onProfile) return;
    const id = crypto.randomUUID();
    setProfiles(previous => [...previous, {id, label: profileName.trim(), shared: draft}]);
    onProfile(id);
    setSaveAs(false);
  }

  return <><Modal open={open} title={title} wide width={980} height={720} onChange={next => {if (!next) onClose();}}
    actions={<div className="bgi-hardware-footer">
      <Text variant="caption">修改自动保存。关闭窗口后可在任务计划中撤销。</Text>
      <Button onClick={onClose}>关闭</Button>
    </div>}>
    <SharedSettingsForm value={draft} inherited={inherited} onChange={next => {setDraft(next); onChange(next);}}
      profileActions={onProfile && <Toolbar actions={<>
        <Button onClick={() => {setProfileName(''); setSaveAs(true);}}>另存为方案…</Button>
        <Button onClick={onManageProfiles}>管理方案…</Button>
      </>}>
        <Field label="设置方案"><Select label="设置方案" value={profile ?? ''} onValueChange={onProfile}
          options={[{value: '', label: '无'}, ...profiles.map(item => ({value: item.id, label: item.label}))]}/></Field>
      </Toolbar>}/>
  </Modal>
  <Modal title="另存为方案" open={saveAs} onChange={setSaveAs} width={420} actions={<>
    <Button onClick={() => setSaveAs(false)}>取消</Button>
    <Button appearance="primary" disabled={!canSaveProfile} onClick={createProfile}>保存</Button>
  </>}>
    <Field label="方案名称"><Input aria-label="方案名称" value={profileName}
      onChange={event => setProfileName(event.currentTarget.value)}/></Field>
  </Modal></>;
}

export function SettingsProfilesDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const [profiles, setProfiles] = useTaskProfiles();
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<SettingsProfile>();
  const [width, setWidth] = useState(178);
  const [remove, setRemove] = useState<SettingsProfile>();
  const {notify, snackbar} = useSnackbar();
  const active = profiles.find(item => item.id === selected);

  function edit(value: SettingsProfile) {
    setSelected(value.id);
    setDraft({...value});
  }

  function save() {
    if (!draft?.label.trim() || !parseSettings(draft.shared)) return;
    const next = {...draft, label: draft.label.trim()};
    setProfiles(previous => previous.some(item => item.id === next.id) ?
      previous.map(item => item.id === next.id ? next : item) : [...previous, next]);
    edit(next);
    notify('已保存设置方案', 'success');
  }

  return <>
    <Modal title="设置方案" open={open} onChange={value => {if (!value) onClose();}}
      actions={<Button onClick={onClose}>关闭</Button>}>
      <div className="bgi-stack">
        <Text variant="body">方案是一组可复用的共享设置，可以挂在任意计划的任意节点上。</Text>
        <Toolbar actions={active && <>
          <Button onClick={() => edit({...active, id: crypto.randomUUID(), label: active.label + ' 副本'})}>复制</Button>
          <Button appearance="danger" onClick={() => setRemove(active)}>删除</Button>
        </>}>
          <Button icon="plus" appearance="primary" onClick={() => edit({id: crypto.randomUUID(), label: '', shared: '{}'})}>新建</Button>
        </Toolbar>
        <SplitView size={width} onResize={setWidth} embedded
          start={profiles.length ? <List rows={profiles} selected={selected}
            onSelect={id => {const next = profiles.find(profile => profile.id === id); if (next) edit(next);}}/> :
            <Empty title="还没有设置方案"/>}
          end={draft ? <>
            <Field label="方案名称"><Input aria-label="方案名称" value={draft.label}
              onChange={event => setDraft({...draft, label: event.currentTarget.value})}/></Field>
            <SharedSettingsForm value={draft.shared} onChange={shared => setDraft({...draft, shared})} compact/>
            <div className="bgi-actions">
              <Button onClick={() => setDraft(active)}>放弃修改</Button>
              <Button appearance="primary" disabled={!draft.label.trim() || !parseSettings(draft.shared)}
                onClick={save}>保存</Button>
            </div>
          </> : <Empty title="选择或新建设置方案"/>}/>
      </div>
    </Modal>
    <MessageDialog title="删除设置方案" message={'确定删除「' + (remove?.label ?? '') + '」？'} tone="warning"
      open={remove !== undefined} onChange={value => {if (!value) setRemove(undefined);}}
      confirm={() => {
        if (!remove) return;
        setProfiles(previous => previous.filter(item => item.id !== remove.id));
        if (remove.id === selected) {setSelected(''); setDraft(undefined);}
      }}/>
    <Snackbar {...snackbar}/>
  </>;
}

export function RunPreviewDialog({open, plan, accounts, onClose}: {
  open: boolean; plan: TaskPlan; accounts: readonly {value: string; label: string}[]; onClose: () => void;
}) {
  const [account, setAccount] = useState(plan.account);
  const [onlySkipped, setOnlySkipped] = useState(false);
  const rows: Row[] = planRows(plan.rows).filter(({enabled}) => !onlySkipped || !enabled)
    .map(({task, enabled}) => ({
      id: task.id, label: task.label, icon: planKinds[task.kind].icon,
      detail: planKinds[task.kind].label + (task.repetitions > 1 ? ' · ' + task.repetitions + ' 次' : ''),
      status: enabled ? '会执行' : '已停用',
    }));
  return <Modal title="预览本次执行" wide open={open} onChange={value => {if (!value) onClose();}}
    actions={<><Button onClick={onClose}>关闭</Button>
      <Button appearance="primary" disabled title="需要本机 BetterGI 的任务执行接口">开始执行</Button></>}>
    <div className="bgi-stack">
      <Field label="CD 按账户"><Select label="CD 按账户" value={account} options={accounts} onValueChange={setAccount}/></Field>
      <Switch label="只看会跳过的项" checked={onlySkipped} onChange={setOnlySkipped}/>
      {rows.length ? <List rows={rows}/> : <Empty title={onlySkipped ? '没有会跳过的项' : '计划中还没有任务'}/>}
      <p className="bgi-muted">已列出本计划的启用状态。路线 CD 需由本机 BetterGI 读取。</p>
    </div>
  </Modal>;
}
