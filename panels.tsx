import {useId, useMemo, useRef, useState, type ReactNode} from 'react';
import {ResizablePanelGroup} from 'loom-frame/ui';
import {
  Badge, Button, Choice, Field, Icon, IconButton, Input, InputActionRow, KeyField, NumberField, Progress,
  SearchField, Select, Switch, Text, TextArea, type IconName, type Option,
} from './controls';
import {Card, Empty, List, ReorderList, Tabs, Toolbar, Tree, type Row, type TreeNode} from './collections';
import {LogView} from './media';
import {Flyout, InfoBar, Modal, Snackbar, useSnackbar} from './overlays';

export const taskRows: Row[] = [
  {id: 'daily', label: '领取每日奖励', detail: '独立任务', icon: 'timer'},
  {id: 'route', label: '枫丹采集路线', detail: '地图追踪', icon: 'layers'},
  {id: 'resin', label: '合成浓缩树脂', detail: '独立任务', icon: 'package'},
  {id: 'mail', label: '领取邮件奖励', detail: 'JS 脚本', icon: 'fileCode'},
];

export const inventoryRows: Row[] = [
  {id: 'stone', label: '原石', detail: '货币', number: 1280, status: '已记录', icon: 'package'},
  {id: 'mora', label: '摩拉', detail: '货币', number: 264580, status: '已记录', icon: 'package'},
  {id: 'resin', label: '浓缩树脂', detail: '消耗品', number: 4, status: '待刷新', icon: 'archive'},
  {id: 'hero', label: '大英雄的经验', detail: '养成材料', number: 72, status: '已记录', icon: 'book'},
];

const scheduleModes: Option[] = [
  {value: 'period', label: '周期执行'}, {value: 'fixed', label: '固定时间执行'},
];
const frequencies = [
  {value: 'daily', label: '每天'}, {value: 'weekdays', label: '工作日'},
  {value: 'weekly', label: '每周'}, {value: 'monthly', label: '每月'},
];
const periodUnits = [{value: 'minute', label: '分钟'}, {value: 'hour', label: '小时'}];
const weekdays = ['日', '一', '二', '三', '四', '五', '六'].map((day, index) =>
  ({value: String(index), label: '周' + day}));
const numbered = (values: readonly number[], unit: string): Option[] => values.map(value =>
  ({value: String(value), label: String(value) + ' ' + unit}));
const consecutive = (count: number, start = 0) => Array.from({length: count}, (_, i) => start + i);
const hours = numbered(consecutive(24), '时');
const minutes = numbered(consecutive(60), '分');
const monthDays = numbered(consecutive(31, 1), '日');
const minuteIntervals = numbered([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30], '分钟');
const hourIntervals = numbered([1, 2, 3, 4, 6, 8, 12], '小时');
const cronPresets = [
  ['每 5 分钟', '*/5 * * * *'], ['每 15 分钟', '*/15 * * * *'],
  ['每小时', '0 * * * *'], ['每天 04:00', '0 4 * * *'],
  ['工作日 09:00', '0 9 * * 1-5'], ['每周一 04:00', '0 4 * * 1'],
  ['每月 1 日 04:00', '0 4 1 * *'],
];

export function CronEditor({value, onChange}: {
  value: string; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('period');
  const [unit, setUnit] = useState('minute');
  const [minuteInterval, setMinuteInterval] = useState('5');
  const [hourInterval, setHourInterval] = useState('1');
  const [startMinute, setStartMinute] = useState('0');
  const [frequency, setFrequency] = useState('daily');
  const [hour, setHour] = useState('4');
  const [minute, setMinute] = useState('0');
  const [day, setDay] = useState('1');
  const [monthDay, setMonthDay] = useState('1');
  const [edited, setEdited] = useState(false);
  const fields = value.trim().split(/\s+/);
  const valid = fields.length === 5 && fields.every(field => /^[\d*,/\-]+$/.test(field));
  const intervalStep = (value: string) => value === '1' ? '*' : '*/' + value;
  const dayOfWeek = frequency === 'weekdays' ? '1-5' : frequency === 'weekly' ? day : '*';
  const generated = mode === 'fixed'
    ? [minute, hour, frequency === 'monthly' ? monthDay : '*', '*', dayOfWeek].join(' ')
    : unit === 'minute' ? intervalStep(minuteInterval) + ' * * * *'
      : [startMinute, intervalStep(hourInterval), '*', '*', '*'].join(' ');
  const apply = (expression: string) => {
    onChange(expression);
    setOpen(false);
  };
  return <div className="bgi-cron">
    <Field label="Cron 表达式" description="分钟、小时、日、月、星期">
      <InputActionRow>
        <Input value={value} aria-label="Cron 表达式" aria-invalid={edited && !valid}
          onChange={event => {setEdited(true); onChange(event.currentTarget.value);}}/>
        <Flyout label="快捷设置" open={open} onChange={setOpen} align="end">
          <div className="bgi-schedule-popup">
            <Text variant="section">Cron 快捷设置</Text>
            <div className="bgi-wrap">
              {cronPresets.map(([label, expression]) => <Button key={label}
                onClick={() => apply(expression)}>{label}</Button>)}
            </div>
            <Tabs label="生成方式" options={scheduleModes} value={mode} onChange={setMode}/>
            {mode === 'period' ? <>
              <Field label="周期单位"><Select label="周期单位" options={periodUnits}
                value={unit} onValueChange={setUnit}/></Field>
              {unit === 'minute' ? <Field label="间隔分钟"><Select label="间隔分钟"
                options={minuteIntervals} value={minuteInterval} onValueChange={setMinuteInterval}/></Field> :
                <div className="bgi-cascade">
                  <Field label="间隔小时"><Select label="间隔小时" options={hourIntervals}
                    value={hourInterval} onValueChange={setHourInterval}/></Field>
                  <Field label="起始分钟"><Select label="起始分钟" options={minutes}
                    value={startMinute} onValueChange={setStartMinute}/></Field>
                </div>}
            </> : <>
              <Field label="执行频率"><Select label="执行频率" options={frequencies}
                value={frequency} onValueChange={setFrequency}/></Field>
              {frequency === 'weekly' && <Field label="星期"><Select label="星期" options={weekdays}
                value={day} onValueChange={setDay}/></Field>}
              {frequency === 'monthly' && <Field label="日期"><Select label="日期" options={monthDays}
                value={monthDay} onValueChange={setMonthDay}/></Field>}
              <div className="bgi-cascade">
                <Field label="小时"><Select label="小时" options={hours} value={hour} onValueChange={setHour}/></Field>
                <Field label="分钟"><Select label="分钟" options={minutes} value={minute}
                  onValueChange={setMinute}/></Field>
              </div>
            </>}
            <div className="bgi-toolbar">
              <output className="bgi-mono" aria-label="生成的表达式">{generated}</output>
              <Button appearance="primary" onClick={() => apply(generated)}>应用到表达式</Button>
            </div>
          </div>
        </Flyout>
      </InputActionRow>
    </Field>
    {edited && !valid && <div role="alert" className="bgi-error-text">请填写五段 Cron 字段。</div>}
  </div>;
}

const zones = [
  {value: 'Asia/Shanghai', label: '亚洲服务器（UTC+8）'},
  {value: 'America/New_York', label: '美洲服务器（纽约时间）'},
  {value: 'Europe/Berlin', label: '欧洲服务器（柏林时间）'},
];
const planTypes = [{value: 'time', label: '定时触发'}, {value: 'key', label: '快捷键触发'}];

export type TriggerConfiguration = {
  enabled: {time: boolean; key: boolean}; cron: string; zone: string; hotkey: string;
};

export function TriggerPanel({initial, onSave}: {
  initial?: TriggerConfiguration; onSave?: (config: TriggerConfiguration) => void;
} = {}) {
  const [value, setValue] = useState('time');
  const [enabled, setEnabled] = useState(initial?.enabled ?? {time: true, key: false});
  const [cron, setCron] = useState(initial?.cron ?? '0 4 * * *');
  const [zone, setZone] = useState(initial?.zone ?? 'Asia/Shanghai');
  const [hotkey, setHotkey] = useState(initial?.hotkey ?? 'Ctrl + F9');
  const {notify, snackbar} = useSnackbar();
  const type = value === 'time' ? 'time' : 'key';
  return <div className="bgi-stack">
    <Tabs label="触发方式" options={planTypes} value={value} onChange={next => {
      setValue(next);
      snackbar.onClose();
    }}/>
    <Card title={type === 'time' ? '每日任务' : '快捷运行'} icon={type === 'time' ? 'clock' : 'play'}
      action={<Switch label="启用触发器" checked={enabled[type]} showLabel={false}
        onChange={next => setEnabled(old => ({...old, [type]: next}))}/>}/>
    {type === 'time' ? <>
      <CronEditor value={cron} onChange={value => {setCron(value); snackbar.onClose();}}/>
      <Field label="服务器时区">
        <Select label="服务器时区" options={zones} value={zone} onValueChange={value => {
          setZone(value);
          snackbar.onClose();
        }}/>
      </Field>
    </> : <Field label="运行快捷键">
      <KeyField label="运行快捷键" value={hotkey} onChange={value => {setHotkey(value); snackbar.onClose();}}/>
    </Field>}
    <div className="bgi-actions">
      <Button appearance="primary" disabled={type === 'key' ? !hotkey : !cron.trim()}
        onClick={() => {
          onSave?.({enabled, cron, zone, hotkey});
          notify(onSave ? '已保存触发配置' : '已保存预览配置', 'success');
        }}>保存</Button>
    </div>
    <Snackbar {...snackbar}/>
  </div>;
}

export function SplitView({size, onResize, start, end, embedded = false}: {
  size: number; onResize: (value: number) => void; start: ReactNode; end: ReactNode; embedded?: boolean;
}) {
  return <div className="bgi-split-boundary">
    <ResizablePanelGroup className={embedded ? 'bgi-split bgi-split--embedded' : 'bgi-split'}
      start={<div className="bgi-pane bgi-stack">{start}</div>}
      end={<div className="bgi-pane bgi-stack">{end}</div>} size={size}
      minSize={155} maxSize={350} onSizeChange={onResize} resizeLabel="调整分栏宽度"/>
  </div>;
}

const planTabs: Option[] = [
  {value: 'configuration', label: '任务编排'}, {value: 'triggers', label: '触发方式'},
  {value: 'history', label: '执行记录'},
];

export function PlanBoard({
  title, initialRows = taskRows, showTabs = true, rows: controlledRows, onRowsChange,
  trigger, onTriggerSave, browserPlan = false, library = taskRows,
}: {
  title: string; initialRows?: readonly Row[]; showTabs?: boolean;
  rows?: Row[]; onRowsChange?: (rows: Row[]) => void;
  trigger?: TriggerConfiguration; onTriggerSave?: (value: TriggerConfiguration) => void;
  browserPlan?: boolean; library?: readonly Row[];
}) {
  const [view, setView] = useState('configuration');
  const [localRows, setLocalRows] = useState([...initialRows]);
  const rows = controlledRows ?? localRows;
  const setRows = onRowsChange ?? setLocalRows;
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState('');
  const [pane, setPane] = useState(208);
  const [preview, setPreview] = useState(false);
  const available = library.filter(row => row.label.includes(query.trim()));
  const selected = available.find(row => row.id === current);
  function add() {
    if (!selected) return;
    setRows([...rows, {...selected, id: crypto.randomUUID()}]);
  }
  return <div className="bgi-plan bgi-stack">
    <Toolbar actions={<Button icon="play" appearance="primary" disabled={!rows.length}
      onClick={() => setPreview(true)}>运行预览</Button>}>
      <Text variant="section">{title}</Text>
    </Toolbar>
    {showTabs && <Tabs label="任务计划" options={planTabs} value={view} onChange={setView}/>}
    {view === 'configuration' && <SplitView size={pane} onResize={setPane} embedded={browserPlan}
      start={<>
        <Toolbar actions={<IconButton icon="plus" label="添加选中任务" disabled={!selected} onClick={add}/>}>
          <strong>任务库</strong>
        </Toolbar>
        <SearchField label="搜索任务" value={query} onChange={setQuery}/>
        <List rows={available} selected={current} onSelect={setCurrent}/>
      </>} end={<>
        <strong>执行顺序</strong>
        <ReorderList rows={rows} onChange={setRows} allowRemove/>
      </>}/>}
    {view === 'triggers' && <TriggerPanel initial={trigger} onSave={onTriggerSave}/>}
    {view === 'history' && (browserPlan ? <Empty title="暂无执行记录"/> : <HistoryView/>)}
    <Modal open={preview} onChange={setPreview} title="运行预览"
      actions={<Button appearance="primary" onClick={() => setPreview(false)}>返回</Button>}>
      <List rows={rows}/>
    </Modal>
  </div>;
}

export function HistoryView() {
  const runs: Row[] = [
    {id: 'today', label: '每日任务', detail: '今天 04:00', status: '成功', icon: 'check'},
    {id: 'yesterday', label: '每日任务', detail: '昨天 04:00', status: '已取消', icon: 'minus'},
    {id: 'manual', label: '手动运行', detail: '11 月 19 日 21:40', status: '失败', icon: 'error'},
  ];
  const [selected, setSelected] = useState(runs[0].id);
  const [size, setSize] = useState(210);
  const run = runs.find(run => run.id === selected);
  return <SplitView size={size} onResize={setSize}
    start={<List rows={runs} selected={selected} onSelect={setSelected}/>}
    end={<>
      <div className="bgi-toolbar"><strong>{run?.label}</strong><Badge
        tone={run?.status === '成功' ? 'success' : run?.status === '失败' ? 'danger' : 'default'}>
        {run?.status}
      </Badge></div>
      <span className="bgi-muted">{run?.detail}</span>
      <LogView label="执行日志">
        <p>[04:00:00] 开始执行计划</p>
        <p>{run?.status === '失败' ? '[04:00:06] 游戏窗口未就绪' :
          run?.status === '已取消' ? '[04:00:04] 已接收停止请求' : '[04:00:12] 已完成所有任务'}</p>
      </LogView>
    </>}/>
}

export {StrategyPicker} from './strategy';

export function ResinEditor() {
  const id = useId();
  const [reserve, setReserve] = useState(false);
  const [number, setNumber] = useState(20);
  return <div className="bgi-stack">
    <Text variant="section">合成浓缩树脂</Text>
    <Choice radio name={id} label="按默认数量合成" checked={!reserve} onChange={() => setReserve(false)}/>
    <Choice radio name={id} label="保留原粹树脂" checked={reserve} onChange={() => setReserve(true)}/>
    {reserve && <Field label="保留数量"><NumberField label="保留数量" value={number} min={0}
      max={200} onChange={setNumber}/></Field>}
  </div>;
}

export function ResourceList({variant}: {variant: 'repositories' | 'cooldown' | 'download' | 'voice'}) {
  const [progress, setProgress] = useState(64);
  const [choice, setChoice] = useState('');
  const [query, setQuery] = useState('');
  const [repositoryName, setRepositoryName] = useState('');
  const [extra, setExtra] = useState<Row[]>([]);
  const rows: Record<typeof variant, Row[]> = {
    repositories: [
      {id: 'local', label: '本地脚本仓库', detail: '本地目录', icon: 'folder'},
      {id: 'remote', label: '脚本仓库', detail: 'Git 远程仓库', icon: 'cloud'},
    ],
    cooldown: [
      {id: 'rose', label: '虹彩蔷薇', detail: '枫丹采集路线', status: '剩余 18 小时', icon: 'clock'},
      {id: 'water', label: '湖光铃兰', detail: '优兰尼娅湖路线', status: '可执行', icon: 'check'},
    ],
    download: [{id: 'script', label: '更新脚本仓库', detail: '脚本资源', icon: 'download'}],
    voice: [
      {id: 'voicevox', label: 'VOICEVOX', detail: '本地语音引擎', icon: 'volume'},
      {id: 'vits', label: 'VITS', detail: '兼容语音引擎', icon: 'volume'},
    ],
  };
  return <div className="bgi-stack">
    <SearchField label="搜索项目" value={query} onChange={setQuery}/>
    <List rows={[...rows[variant], ...extra].filter(row => row.label.toLowerCase().includes(query.toLowerCase()))}
      selected={choice} onSelect={setChoice}/>
    {variant === 'download' && <>
      <Progress label="下载进度" value={progress}/>
      <div className="bgi-actions"><Button disabled={progress === 0} onClick={() => setProgress(0)}>取消</Button>
        <Button appearance="primary" disabled={progress === 100} onClick={() => setProgress(100)}>完成预览</Button>
      </div>
    </>}
    {variant === 'repositories' && <InputActionRow>
      <Input aria-label="仓库名称" placeholder="仓库名称" value={repositoryName}
        onChange={event => setRepositoryName(event.currentTarget.value)}/>
      <Button icon="plus" disabled={!repositoryName.trim()} onClick={() => {
        setExtra(old => [...old, {id: 'repo-' + old.length, label: repositoryName.trim(), icon: 'folder'}]);
        setRepositoryName('');
      }}>添加</Button>
    </InputActionRow>}
    {variant === 'voice' && choice && <InfoBar tone="info" title={'当前引擎：' +
      (rows.voice.find(row => row.id === choice)?.label ?? '')}/>}
    {variant === 'cooldown' && choice && <InfoBar tone="info" title={'路线状态：' +
      (rows.cooldown.find(row => row.id === choice)?.status ?? '')}/>}
  </div>;
}
