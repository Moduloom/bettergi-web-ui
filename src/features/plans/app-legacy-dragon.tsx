import {useState, type FormEvent} from 'react';
import {
  Button, CascadingMenuSelect, Choice, Field, IconButton, Input, Select, SoloTaskButton, Switch, Text,
} from '../../components/controls';
import {Empty, ReorderList, SettingsRow, Toolbar, type Row} from '../../components/collections';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {SplitView} from '../../components/panels';
import {
  number, options, pick, StrategyField, TaskRow, TaskRows, TaskSection, TaskSwitch, text, toggle, type TaskConfig,
} from '../tasks/task-fields';
import {TaskResinRow} from '../tasks/task-resin';
import {useAppValue} from '../../app/app-state';
import nativeOptions from '../tasks/task-options.json';

const builtIns = [
  '领取邮件', '合成树脂', '自动秘境', '自动首领讨伐', '自动幽境危战', '自动地脉花', '领取每日奖励', '领取尘歌壶奖励',
];
const countries = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '挪德卡莱', '至冬'];
const days = ['一', '二', '三', '四', '五', '六', '日'];
const merchandise = ['布匹', '须臾树脂', '大英雄的经验', '流浪者的经验', '精锻用魔矿', '摩拉', '祝圣精华', '祝圣油膏'];
const native = '需要本机 BetterGI 的一条龙执行接口';
type Value = boolean | number | string;
type DragonTask = Row & {enabled?: boolean; groupId?: string};
type Dragon = {id: string; name: string; rows: DragonTask[]; settings?: Record<string, Value>; next?: string};
type ScriptGroup = {id: string; name: string};
const noScriptGroups: ScriptGroup[] = [];
const defaultDragon: Dragon = {
  id: 'default', name: '默认配置',
  rows: builtIns.map((label, index) => ({id: 'default-' + index, label, enabled: true})),
};
const defaultDragons = [defaultDragon];
const domainGroups = Object.entries(nativeOptions.domains).map(([label, list]) => ({value: label, label, options: options(list)}));
const bossGroups = Object.entries(nativeOptions.bosses).map(([label, list]) => ({value: label, label, options: options(list)}));
const rewardChoices = [{label: '默认', value: ''}, ...options(['1', '2', '3'])];
const countriesWithDefault = [{label: '默认', value: ''}, ...options(countries)];

function DomainPicker({config, id, label = '选择秘境'}: {config: TaskConfig; id: string; label?: string}) {
  return <CascadingMenuSelect label={label} groups={domainGroups} value={config.get(id, '/')}
    placeholder="当前秘境" onChange={value => config.set(id, value)}/>;
}

function DaySchedule({config, mode}: {config: TaskConfig; mode: 'domain' | 'leyline'}) {
  const domain = mode === 'domain';
  return <div className="bgi-stack">
    <Text variant="caption">{domain ? '周期始于凌晨 4:00。留空使用默认配置。' :
      '仅在勾选的星期执行，未勾选任何星期时每天执行。类型和国家留空时使用独立任务默认设置。'}</Text>
    {days.map((day, index) => <div className="bgi-dragon-day" key={day}>
      {domain ? <>
        <span>周{day}</span>
        <Input aria-label={'周' + day + '队伍'} value={config.get('WeeklyParty' + index, '')}
          onChange={event => config.set('WeeklyParty' + index, event.currentTarget.value)} placeholder="默认队伍"/>
        <DomainPicker config={config} id={'WeeklyDomain' + index} label={'周' + day + '秘境'}/>
        <Select label={'周' + day + '奖励'} options={rewardChoices} value={config.get('WeeklyReward' + index, '')}
          onValueChange={value => config.set('WeeklyReward' + index, value)}/>
      </> : <>
        <Choice label={'周' + day} checked={config.get('LeyLineRun' + index, true)} onChange={value => config.set('LeyLineRun' + index, value)}/>
        <Select label={'周' + day + '地脉花类型'} options={[{value: '', label: '默认'}, ...options(['启示之花', '藏金之花'])]}
          value={config.get('LeyLineType' + index, '')} onValueChange={value => config.set('LeyLineType' + index, value)}/>
        <Select label={'周' + day + '国家'} options={countriesWithDefault} value={config.get('LeyLineCountry' + index, '')}
          onValueChange={value => config.set('LeyLineCountry' + index, value)}/>
      </>}
    </div>)}
  </div>;
}

function DragonSettings({record, onChange}: {record: Dragon; onChange: (fields: Partial<Dragon>) => void}) {
  const values = record.settings ?? {};
  const config: TaskConfig = {
    get<T extends Value>(key: string, fallback: T) {
      return typeof values[key] === typeof fallback ? values[key] as T : fallback;
    },
    set: (key, value) => onChange({settings: {...values, [key]: value}}),
    apply: update => onChange({settings: {...values, ...update}}),
    layout: {},
  };
  const weekly = config.get('WeeklyDomainEnabled', false);
  const training = config.get('DomainSource', '指定秘境') === '跟随培养计划';
  const limit = config.get('AutoBossSpecifyRunCount', false);
  return <div className="bgi-stack">
    <TaskSection title="合成树脂">
      <TaskRows config={config} fields={[
        pick('CraftingBenchCountry', '合成树脂合成台', options(countries), '枫丹', '指定地区合成树脂'),
        number('MinResinToKeep', '合成后保留原粹树脂数量', 0, 0, 200),
      ]}/>
    </TaskSection>
    <TaskSection title="自动秘境" description="其余设置沿用独立任务里的自动秘境配置。">
      <TaskSection title="每日秘境刷取配置" description="前往指定秘境消耗树脂，并自动领取奖励">
        <TaskRows config={config} fields={[
          {...text('PartyName', '进入秘境切换的队伍名称'), description: '留空则不切换队伍。', disabled: weekly},
          {...pick('DomainSource', '秘境来源', options(['指定秘境', '跟随培养计划'])), disabled: weekly},
        ]}/>
        {training ? <TaskSection title="培养计划刷取设置">
          <TaskRows config={config} fields={[
            toggle('TrainingGuideCalculateRunsEnabled', '自动计算今日刷取次数', true),
            pick('TrainingGuideRunPreference', '刷取偏好', options(['适量刷取，依靠合成天赋收益补足材料', '充分刷取，直到满足培养计划需求'])),
          ]}/>
          <SettingsRow inline label="备选秘境" controlWidth={220}
            control={<DomainPicker config={config} id="TrainingFallback" label="备选秘境"/>}/>
        </TaskSection> : <SettingsRow inline label="选择秘境" controlWidth={220}
          control={<DomainPicker config={config} id="DomainName"/>}/>}
        <TaskRow config={config} field={pick('SundayEverySelectedValue', '周日或限时奖励序号', rewardChoices)}/>
      </TaskSection>
      <TaskSection title="每周秘境刷取配置" description="启用后，每日刷取配置将会失效"
        action={<TaskSwitch config={config} name="WeeklyDomainEnabled" initial={false} label="启用每周秘境刷取配置"/>}>
        {weekly && <DaySchedule config={config} mode="domain"/>}
      </TaskSection>
      <TaskResinRow scope="domain" storageKey={'legacy/' + record.id + '/domain'}/>
      <TaskRows config={config} fields={[
        toggle('DomainSalvage', '分解圣遗物', false),
        pick('DomainSalvageStar', '最高的星级', options(['4', '3', '2', '1'])),
        toggle('DomainRewardRecognition', '启用奖励识别', false),
      ]}/>
    </TaskSection>
    <TaskSection title="自动首领讨伐" description="自动传送、战斗并领取奖励">
      <StrategyField config={config} setting="AutoBossStrategyName" allowCombo={false}/>
      <SettingsRow inline label="选择首领" controlWidth={220}
        control={<CascadingMenuSelect label="选择首领" groups={bossGroups} value={config.get('AutoBossName', '/')}
          placeholder="请选择首领" onChange={value => config.set('AutoBossName', value)}/>}/>
      <TaskRows config={config} fields={[
        text('AutoBossTeamName', '切换队伍', '', '留空则不更换队伍'),
        toggle('AutoBossSpecifyRunCount', '成功领奖次数限制', false),
      ]}/>
      {limit && <TaskRows config={config} fields={[
        number('AutoBossRunCount', '单次运行上限', 1, 1, 9999),
        toggle('AutoBossUseTransientResin', '原粹不足时使用须臾树脂补充', false),
        toggle('AutoBossUseFragileResin', '原粹不足时使用脆弱树脂补充', false),
        number('AutoBossTotalRunCountLimit', '累计运行上限', 0, 0, 9999, '累计上限为 0 时不限制'),
      ]}/>}
      <TaskRows config={config} fields={[
        toggle('AutoBossReturnToStatueAfterEachRound', '每轮讨伐后返回七天神像', false),
        number('AutoBossReviveRetryCount', '角色死亡后重试次数', 3, 0, 99),
      ]}/>
    </TaskSection>
    <TaskSection title="自动地脉花" description="其余设置沿用独立任务里的自动地脉花配置。">
      <TaskRows config={config} fields={[
        toggle('LeyLineOneDragonMode', '跳过准备流程', false),
        toggle('LeyLineResinExhaustionMode', '树脂耗尽模式', false),
        toggle('LeyLineOpenModeCountMin', '刷取次数取小值', false),
        number('LeyLineRunCount', '刷取次数', 0, 0, 9999, '填 0 则使用独立任务配置'),
      ]}/>
      <TaskSection title="运行日期配置" description="按星期设置类型与国家"><DaySchedule config={config} mode="leyline"/></TaskSection>
    </TaskSection>
    <TaskSection title="领取奖励"><TaskRows config={config} fields={[
      pick('AdventurersGuildCountry', '领取奖励的冒险者协会', options(countries), '枫丹'),
      text('DailyRewardPartyName', '领取前切换队伍（好感队）'),
    ]}/></TaskSection>
    <TaskSection title="尘歌壶配置">
      <TaskRows config={config} fields={[pick('SereniteaPotTpType', '进壶方式选择', options(['地图传送', '放置尘歌壶']))]}/>
      <Field label="购买日期和商品" description="日期不影响领取好感和钱币。">
        <div className="bgi-wrap">{days.map(day => <Choice key={day} label={'周' + day}
          checked={config.get('PotDay:' + day, false)} onChange={value => config.set('PotDay:' + day, value)}/>)}</div>
        <div className="bgi-wrap">{merchandise.map(item => <Choice key={item} label={item}
          checked={config.get('PotItem:' + item, false)} onChange={value => config.set('PotItem:' + item, value)}/>)}</div>
      </Field>
    </TaskSection>
    <TaskSection title="完成后操作"><TaskRows config={config} fields={[
      pick('CompletionAction', '任务完成后执行的操作', options(['无', '关闭游戏', '关闭软件', '关闭游戏和软件', '关机'])),
    ]}/></TaskSection>
  </div>;
}

export function LegacyDragonPage() {
  const [stored, setStored] = useAppValue('plans/dragon', defaultDragons);
  const configs = stored.length ? stored : defaultDragons;
  const [scripts] = useAppValue('plans/scheduler', noScriptGroups);
  const [current, setCurrent] = useAppValue('legacy-dragon/selected-config', '');
  const [selected, setSelected] = useState('');
  const [pane, setPane] = useState(240);
  const [nameForm, setNameForm] = useState<'create' | 'rename'>();
  const [name, setName] = useState('');
  const [add, setAdd] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [remove, setRemove] = useState(false);
  const {notify, snackbar} = useSnackbar();
  const record = configs.find(item => item.id === current) ?? configs[0];
  const selectedRow = record.rows.find(item => item.id === selected);

  function patch(fields: Partial<Dragon>) {
    setStored(configs.map(item => item.id === record.id ? {...item, ...fields} : item));
  }
  function saveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next || configs.some(item => item.name === next && (nameForm === 'create' || record.id !== item.id))) {
      notify('请输入未使用的配置名称。', 'warning');
      return;
    }
    if (nameForm === 'rename') patch({name: next});
    else {
      const id = crypto.randomUUID();
      setStored([...configs, {id, name: next, rows: builtIns.map(label => ({id: crypto.randomUUID(), label, enabled: true}))}]);
      setSelected('');
      setCurrent(id);
    }
    setNameForm(undefined);
  }

  return <SplitView size={pane} onResize={setPane}
    start={<>
      <Toolbar actions={<SoloTaskButton disabled title={native}/>}>
        <Text variant="section">任务列表</Text>
      </Toolbar>
      <DropMenu label="任务列表操作" context items={[
        {id: 'add', label: '新增配置'},
        {id: 'remove', label: '删除', danger: true, disabled: !selectedRow},
        {id: 'next', label: '从此执行', disabled: !selectedRow || selectedRow.enabled === false},
        {id: 'clear', label: '清除标记', disabled: !record.next},
      ]}
      trigger={<div className="bgi-dragon-list" onContextMenuCapture={event => {
        const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-bgi-row]') : null;
        if (row?.dataset.bgiRow) setSelected(row.dataset.bgiRow);
      }}>
        {record.rows.length ? <ReorderList label="一条龙任务列表" selected={selected} onSelect={setSelected}
          rows={record.rows.map(row => ({...row, status: row.id === record.next ? '从此执行' : undefined}))}
          onChange={order => patch({rows: order.flatMap(row => record.rows.find(item => item.id === row.id) ?? [])})}
          renderDetails={item => {
            const row = record.rows.find(task => task.id === item.id);
            return row && <Switch label={'启用 ' + row.label} checked={row.enabled !== false}
              showLabel={false} onChange={enabled => patch({
                rows: record.rows.map(task => task.id === row.id ? {...task, enabled} : task),
                next: !enabled && row.id === record.next ? undefined : record.next,
              })}/>;
          }}/> : <Empty title="暂无任务"/>}
      </div>}
      onSelect={action => {
        if (action === 'add') {setChosen([]); setAdd(true);}
        if (action === 'remove' && selectedRow) {
          patch({rows: record.rows.filter(row => row.id !== selectedRow.id),
            next: record.next === selectedRow.id ? undefined : record.next});
          setSelected('');
          notify('已删除任务。');
        }
        if (action === 'next' && selectedRow) patch({next: selectedRow.id});
        if (action === 'clear') patch({next: undefined});
      }}/>
      <div><Button icon="plus" onClick={() => {setChosen([]); setAdd(true);}}>添加任务</Button></div>
    </>}
    end={<>
      <Toolbar actions={<>
        <Select label="一条龙配置" options={configs.map(item => ({value: item.id, label: item.name}))}
          value={record.id} onValueChange={id => {setCurrent(id); setSelected('');}} width="content"/>
        <IconButton icon="plus" label="新增配置" onClick={() => {setName(''); setNameForm('create');}}/>
        <IconButton icon="settings" label="重命名配置" onClick={() => {setName(record.name); setNameForm('rename');}}/>
        <IconButton icon="trash" label="删除配置" onClick={() => setRemove(true)}/>
      </>}><Text variant="section">配置</Text></Toolbar>
      <DragonSettings key={record.id} record={record} onChange={patch}/>
      <Modal title={nameForm === 'rename' ? '重命名配置' : '新增配置'} open={nameForm !== undefined}
        onChange={open => {if (!open) setNameForm(undefined);}}
        actions={<><Button onClick={() => setNameForm(undefined)}>取消</Button>
          <Button appearance="primary" form="bgi-dragon-name" type="submit" disabled={!name.trim()}>确定</Button></>}>
        <form id="bgi-dragon-name" onSubmit={saveName}>
          <Field label="配置名称"><Input aria-label="配置名称" value={name} onChange={event => setName(event.currentTarget.value)}/></Field>
        </form>
      </Modal>
      <Modal title="选择增加的配置组（可多选）" open={add} onChange={setAdd}
        actions={<><Button onClick={() => setAdd(false)}>取消</Button>
          <Button appearance="primary" disabled={!chosen.length} onClick={() => {
            const additions = [...builtIns.map(label => ({id: label, name: label})), ...scripts]
              .filter(item => chosen.includes(item.id)).map(item => ({
                id: crypto.randomUUID(), label: item.name, enabled: true,
                groupId: builtIns.includes(item.id) ? undefined : item.id,
              }));
            patch({rows: [...record.rows, ...additions]});
            setAdd(false);
          }}>确认</Button></>}>
        <div className="bgi-stack">
          {[...builtIns.map(label => ({id: label, name: label})), ...scripts].map(item =>
            <Choice key={item.id} label={item.name} checked={chosen.includes(item.id)} onChange={checked =>
              setChosen(old => checked ? [...old, item.id] : old.filter(id => id !== item.id))}/>)}
        </div>
      </Modal>
      <MessageDialog open={remove} onChange={setRemove} title="删除配置" tone="warning"
        message={'确定删除「' + record.name + '」？'}
        confirm={() => {setStored(configs.filter(item => item.id !== record.id)); setCurrent(''); setSelected('');}}/>
      <Snackbar {...snackbar}/>
    </>}/>;
}
