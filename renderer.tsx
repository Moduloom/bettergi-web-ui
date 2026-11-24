import {lazy, Suspense, useRef, useState, type ReactNode} from 'react';
import type {LibraryRenderer, RenderProps, Value} from 'loom-frame';
import type {DropdownMenuItem} from 'loom-frame/ui';
import {BetterGIApp} from './app';
import {runtimeUrl} from 'loom-frame/client';
import {bannerSource} from './app-images';
import {
  Badge, Button, CascadingMenuSelect, CascadingSelect, Choice, Field, FontIcon, Icon, IconButton, Input, InputActionRow, KeyField,
  Link, MultiSelect, NumberField, Progress, RadioGroup, SearchField, Select, Slider, SoloTaskButton,
  Switch, Text, TextArea, type IconName, type Tone,
} from './controls';
import {
  Card, DataGrid, Empty, Expander, List, Navigation, ReorderList, SettingsActionRow, SettingsRow, Tabs, Toolbar, Tree, type Row,
} from './collections';
import {
  DropMenu, Flyout, HelpTip, InfoBar, MessageDialog, Modal, Snackbar, TitleBar, useSnackbar,
  WindowFrame, type FeedbackTone,
} from './overlays';
import {
  AudioPlayer, CanvasViewer, CodeEditor, FilePicker, HostedSurface, Image, LogView,
  saveText, SubtitleWindow,
} from './media';
import {
  CronEditor, HistoryView, inventoryRows, PlanBoard, ResinEditor, ResourceList,
  SplitView, StrategyPicker, taskRows, TriggerPanel,
} from './panels';
import {applyTheme} from './theme';
import 'loom-frame/ui/styles.css';
import './styles.css';
import './window.css';

const MarkdownView = lazy(() => import('./markdown').then(module => ({default: module.MarkdownView})));

const languages = [
  {value: 'zh', label: '简体中文'}, {value: 'en', label: 'English'}, {value: 'ja', label: '日本語'},
];
const regions = [
  {value: 'mondstadt', label: '蒙德', options: [{value: 'valley', label: '塞西莉亚苗圃'}]},
  {value: 'liyue', label: '璃月', options: [{value: 'palace', label: '太山府'}]},
  {value: 'fontaine', label: '枫丹', options: [
    {value: 'echo', label: '深潮的余响'}, {value: 'end', label: '罪祸的终末'},
  ]},
];
const resinOptions = [
  {value: 'default', label: '按默认数量合成'}, {value: 'reserve', label: '保留原粹树脂'},
];
const planTabs = [
  {value: 'configuration', label: '任务编排'}, {value: 'triggers', label: '触发方式'},
  {value: 'history', label: '执行记录'},
];
const navigation = [
  {value: 'home', label: '启动', icon: 'play'}, {value: 'triggers', label: '实时触发', icon: 'timer'},
  {value: 'tasks', label: '独立任务', icon: 'list'}, {value: 'plan', label: '任务计划', icon: 'layers'},
  {value: 'inventory', label: '账号记录', icon: 'archive'}, {value: 'settings', label: '通用设置', icon: 'settings'},
] satisfies {value: string; label: string; icon: IconName}[];
const actions: DropdownMenuItem[] = [
  {id: 'run', label: '运行', icon: <Icon name="play"/>},
  {id: 'edit', label: '配置', icon: <Icon name="settings"/>},
  {id: 'move', label: '移动到', children: [
    {id: 'first', label: '移到顶部'}, {id: 'last', label: '移到底部'},
  ]},
  {id: 'copy', label: '复制', icon: <Icon name="copy"/>},
  {id: 'remove', label: '移除', icon: <Icon name="trash"/>, separatorBefore: true, danger: true},
];
const trayActions: DropdownMenuItem[] = [
  {id: 'show', label: '显示 BetterGI', icon: <Icon name="monitor"/>},
  {id: 'settings', label: '打开设置', icon: <Icon name="settings"/>},
  {id: 'exit', label: '关闭预览窗体', separatorBefore: true, icon: <Icon name="x"/>},
];
const events: Row[] = [
  {id: 'import', label: '导入库存记录', detail: '今天 08:36', icon: 'download', status: '已完成'},
  {id: 'record', label: '更新原石数量', detail: '昨天 20:14', icon: 'clipboard', status: '已完成'},
];
const planTree = [
  {id: 'first', label: '启动前检查', detail: '任务组', children: [taskRows[0], taskRows[3]]},
  {id: 'last', label: '日常执行', detail: '任务组', children: [taskRows[1], taskRows[2]]},
];
const lexical = (value: Value | undefined) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const nameOf = (id: string) =>
  [...actions, ...actions.flatMap(action => action.children ?? []), ...trayActions]
    .find(action => action.id === id)?.label;

function Inventory() {
  const [view, setView] = useState('items');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Row>();
  const [detailOpen, setDetailOpen] = useState(false);
  const items = view === 'items' ? inventoryRows : events;
  const visible = items.filter(row => (row.label + (row.detail ?? '')).includes(query.trim()));
  function choose(id: string) {
    setSelected(id);
    setDetail(items.find(row => row.id === id));
    setDetailOpen(true);
  }
  return <div className="bgi-stack">
    <Tabs label="账号记录" options={[{value: 'items', label: '库存'}, {value: 'events', label: '事件'}]}
      value={view} onChange={setView}/>
    <SearchField label="搜索记录" value={query} onChange={setQuery}/>
    {view === 'items' ? <DataGrid rows={visible} selected={selected} onSelect={choose}/> :
      <List rows={visible} selected={selected} onSelect={choose}/>}
    <Modal title={detail?.label ?? '记录详情'} open={detailOpen} onChange={setDetailOpen}
      actions={<Button appearance="primary" onClick={() => setDetailOpen(false)}>关闭</Button>}>
      {detail && <div className="bgi-stack">
        <span>{detail.detail}</span>
        {typeof detail.number === 'number' && <span>数量 {detail.number.toLocaleString('zh-CN')}</span>}
        {detail.status && <Badge>{detail.status}</Badge>}
      </div>}
    </Modal>
  </div>;
}

function ToolPreview({title, open, onChange}: {
  title: string; open: boolean; onChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState('scripts');
  const usage: Row[] = [
    {id: 'scripts', label: '用户脚本', detail: '128 MB', number: 128, icon: 'fileCode'},
    {id: 'cache', label: '缓存', detail: '64 MB', number: 64, icon: 'archive'},
    {id: 'logs', label: '运行日志', detail: '24 MB', number: 24, icon: 'file'},
  ];
  const row = usage.find(row => row.id === selected) ?? usage[0];
  return open ? <WindowFrame title={title} onClose={() => onChange(false)}>
    <div className="bgi-stack">
      <Progress label={'已使用 ' + row.detail} value={Math.round((row.number ?? 0) / 2.56)}/>
      <List rows={usage} selected={selected} onSelect={setSelected}/>
    </div>
  </WindowFrame> : <Button icon="monitor" onClick={() => onChange(true)}>打开窗口</Button>;
}

function FormPreview({open, title, value, onChange, setValue, drawer = false}: {
  open: boolean; title: string; value: string; onChange: (open: boolean) => void;
  setValue: (value: string) => void; drawer?: boolean;
}) {
  const [category, setCategory] = useState('custom');
  const [note, setNote] = useState('');
  const {notify, snackbar} = useSnackbar();
  return <div className="bgi-stack">
    <Button onClick={() => onChange(true)}>{drawer ? '打开抽屉' : '打开表单'}</Button>
    <Modal open={open} onChange={onChange} title={title} drawer={drawer}
      actions={<>
        <Button onClick={() => onChange(false)}>取消</Button>
        <Button appearance="primary" disabled={!value.trim()} onClick={() => {
          notify('已保存 ' + value.trim(), 'success');
          onChange(false);
        }}>{drawer ? '保存' : '创建'}</Button>
      </>}>
      <div className="bgi-stack">
        <Field label="名称"><Input aria-label="名称" value={value}
          onChange={event => setValue(event.currentTarget.value)}/></Field>
        {!drawer && <Field label="类型"><Select label="类型" value={category} onValueChange={setCategory}
          options={[{value: 'custom', label: '自定义计划'}, {value: 'daily', label: '每日计划'}]}/></Field>}
        <Field label="备注"><TextArea label="备注" value={note} onChange={setNote}/></Field>
      </div>
    </Modal>
    <Snackbar {...snackbar}/>
  </div>;
}

function Demo({entry, props, onPatch, onEvent, theme, scene = false}: RenderProps & {scene?: boolean}) {
  const initial = (key: string) => props[key] ?? entry.props[key];
  const str = (key: string) => String(initial(key) ?? '');
  const flag = (key: string) => Boolean(initial(key));
  const number = (key: string) => Number(initial(key)) || 0;
  const send = (key: string) => (value: Value) => onPatch(key, value);
  const label = str('label');
  const value = str('value');
  const hint = str('hint');
  const disabled = flag('disabled');
  const open = flag('open');
  const checked = flag('checked');
  const {notify, snackbar} = useSnackbar();
  const [local, setLocal] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const slug = entry.id.slice('bettergi-ui:'.length);
  const tone = str('tone') as FeedbackTone;
  const button = (title: string, run: () => void) => <Button onClick={run}>{title}</Button>;
  const showcase = (children: ReactNode, size = 'regular') => <>
    <div className="bgi-showcase" data-size={size}>{children}</div>
    <Snackbar {...snackbar}/>
  </>;

  switch (slug) {
    case 'all': return <BetterGIApp accentEndpoint={runtimeUrl('bettergi-system', 'accent')}
      mapAssetsBase={runtimeUrl('bettergi-system')}/>;
    case 'typography': return showcase(<Text variant={str('variant') as Parameters<typeof Text>[0]['variant']}>{label}</Text>);
    case 'link': return showcase(<Link href={str('href')}>{label}</Link>, 'compact');
    case 'image': return showcase(<Image src={bannerSource} alt="BetterGI 首页背景"
      className="bgi-picture-example" fit={str('fit') as Parameters<typeof Image>[0]['fit']}/>, 'roomy');
    case 'font-icon': return showcase(<FontIcon glyph={str('glyph')} size={number('size')}/>, 'compact');
    case 'icon': return showcase(<Icon name={str('icon') as IconName} size={number('size')}/>, 'compact');
    case 'badge': return showcase(<Badge tone={str('tone') as Parameters<typeof Badge>[0]['tone']}>{label}</Badge>, 'compact');
    case 'button': return showcase(<Button appearance={str('appearance') as Tone} disabled={disabled}
      onClick={() => onEvent('click')}>{label}</Button>, 'compact');
    case 'icon-button': return showcase(<IconButton appearance={str('appearance') as Tone}
      label={label} icon={str('icon') as IconName} disabled={disabled}
      onClick={() => onEvent('click')}/>, 'compact');
    case 'toggle-button': return showcase(<Button appearance={checked ? 'default' : 'primary'}
      aria-pressed={checked} icon={checked ? 'stop' : 'play'} disabled={disabled}
      onClick={() => send('checked')(!checked)}>{checked ? '停止' : '启动'}</Button>, 'compact');
    case 'switch': return showcase(<Switch label={label} checked={checked} disabled={disabled}
      onChange={send('checked')}/>, 'compact');
    case 'checkbox': return showcase(<Choice label={label} checked={checked} disabled={disabled}
      onChange={send('checked')}/>, 'compact');
    case 'radio-group': return showcase(<RadioGroup label="树脂合成方式" options={resinOptions} value={value}
      onChange={send('value')} disabled={disabled}/>, 'compact');
    case 'input': case 'password': return showcase(<Field label={label}>
      <Input aria-label={label} value={value} disabled={disabled} type={slug === 'password' ? 'password' : 'text'}
        onChange={event => send('value')(event.currentTarget.value)}/>
    </Field>);
    case 'textarea': return showcase(<Field label={label}>
      <TextArea label={label} value={value} onChange={send('value')} disabled={disabled}/>
    </Field>);
    case 'number': return showcase(<Field label={label}><NumberField label={label} value={number('value')}
      onChange={send('value')} disabled={disabled}/></Field>);
    case 'search': return showcase(<SearchField label={label} value={value} onChange={send('value')} disabled={disabled}/>);
    case 'hotkey': return showcase(<Field label={label}><KeyField label={label} value={value}
      onChange={send('value')} disabled={disabled}/></Field>);
    case 'select': return showcase(<Field label={label}><Select label={label} options={languages} value={value}
      onValueChange={send('value')} disabled={disabled}/></Field>);
    case 'multi-select': return showcase(<MultiSelect label={label} values={lexical(initial('values'))}
      options={regions} onValuesChange={send('values')} disabled={disabled}/>);
    case 'cascading-select': return showcase(str('presentation') === 'menu'
      ? <CascadingMenuSelect label="副本选择" groups={regions} value={value} onChange={send('value')} placeholder="请选择副本"/>
      : <CascadingSelect label="副本选择" groups={regions} value={value} onChange={send('value')}/>);
    case 'slider': return showcase(<Field label={label}><Slider label={label} value={number('value')}
      onChange={send('value')} disabled={disabled} unit="%"/></Field>);
    case 'cron': return showcase(<CronEditor value={value} onChange={send('value')}/>);
    case 'tabs': return showcase(<Tabs label="任务计划" options={planTabs} value={value} onChange={send('value')}>
      <Text variant="body">{planTabs.find(tab => tab.value === value)?.label ?? '任务编排'}</Text>
    </Tabs>);
    case 'navigation': return showcase(<Navigation items={navigation} value={value} onChange={send('value')}
      compact={flag('compact')}/>, 'compact');
    case 'menu': case 'context-menu': case 'tray': return showcase(<DropMenu
      label={slug === 'tray' ? 'BetterGI 托盘' : '任务操作'} items={slug === 'tray' ? trayActions : actions}
      context={slug === 'context-menu'} onSelect={action => notify('已选择「' + (nameOf(action) ?? action) + '」')}/>, 'compact');
    case 'flyout': return showcase(<Flyout label="运行选项" open={open} onChange={send('open')}>
      <div className="bgi-stack"><Switch label="运行前检查" checked={local} onChange={setLocal}/>
        {button('应用', () => send('open')(false))}</div>
    </Flyout>, 'compact');
    case 'tooltip': return showcase(<HelpTip label={label} hint={hint}/>, 'compact');
    case 'card': return showcase(<Card title={label} description={hint} icon="sliders"
      action={button('查看', () => notify('已打开' + label))}/>);
    case 'settings-row': return showcase(<SettingsRow label={label} description={hint} icon="settings"
      control={<Switch label={label} checked={checked} onChange={send('checked')} showLabel={false}/>}/>);
    case 'solo-task-button': return showcase(<SoloTaskButton
      state={value as Parameters<typeof SoloTaskButton>[0]['state']} active={number('active')} disabled={disabled}
      onClick={() => notify('已触发操作')}/>, 'compact');
    case 'settings-action-row': return showcase(<SettingsActionRow label={label} description={hint}
      inline={flag('inline')} action={<Button disabled={disabled} onClick={() => notify('已触发操作')}>
        {str('action')}
      </Button>}/>, 'roomy');
    case 'expander': return showcase(<Expander title={label} description="在本机提供访问服务"
      icon="globe" open={open} onChange={send('open')}
      action={<Switch label="启用 HTTP API" checked={checked} showLabel={false} onChange={send('checked')}/>}>
      <Text variant="body">HTTP API 和 WebSocket 共用监听端口。</Text>
    </Expander>);
    case 'divider': return showcase(<><span>运行选项</span><hr className="bgi-divider"/><span>调试选项</span></>);
    case 'toolbar': return showcase(<Toolbar actions={<>
      <IconButton icon="download" label="刷新" onClick={() => notify('已刷新')}/>
      <Button icon="plus" appearance="primary" onClick={() => notify('已打开新建入口')}>新建</Button>
    </>}>
      <div className="bgi-grow"><SearchField label="搜索任务" value={value} onChange={send('value')}/></div>
    </Toolbar>, 'roomy');
    case 'split': return showcase(<SplitView size={number('value')} onResize={send('value')}
      start={<List rows={taskRows}/>}
      end={<><Text variant="section">任务详情</Text><p>执行前确认游戏窗口已就绪。</p></>}/>, 'roomy');
    case 'list': return showcase(<List rows={flag('empty') ? [] : taskRows.map(row => ({...row, group: row.detail}))}
      selected={value} onSelect={flag('selectable') ? send('value') : undefined} grouped={flag('grouped')}/>);
    case 'virtual-list': return showcase(<List virtual selected={value} onSelect={send('value')}
      rows={Array.from({length: Math.min(500, Math.max(0, number('count')))}, (_, i) => ({
        id: 'script-' + (i + 1), label: '地图追踪脚本 ' + (i + 1), detail: '本地脚本', icon: 'file',
      }))}/>, 'roomy');
    case 'reorder': return showcase(<ReorderList allowRemove
      rows={lexical(initial('order')).flatMap(id => taskRows.filter(row => row.id === id))}
      onChange={rows => send('order')(rows.map(row => row.id))}/>, 'roomy');
    case 'table': return showcase(<DataGrid rows={flag('empty') ? [] : inventoryRows} selected={value}
      onSelect={send('value')}/>, 'roomy');
    case 'tree': return showcase(<Tree rows={planTree} selected={value} onSelect={send('value')} table={flag('table')}/>, 'roomy');
    case 'empty': return showcase(<Empty title={label} description={hint}
      action={<><Button icon="folder" onClick={() => file.current?.click()}>导入记录</Button>
        <input ref={file} hidden type="file" accept=".json" onChange={event => {
          const picked = event.currentTarget.files?.[0];
          if (picked) notify('已选择 ' + picked.name);
        }}/></>}/>);
    case 'progress': case 'progress-ring': return showcase(<Progress ring={slug === 'progress-ring'}
      label={label} value={flag('busy') ? null : number('value')}/>, slug === 'progress-ring' ? 'compact' : 'regular');
    case 'info-bar': return showcase(open ? <InfoBar tone={tone} title={label} description={hint}
      onDismiss={() => send('open')(false)}/> : button('显示提示', () => send('open')(true)));
    case 'snackbar': return showcase(<>
      {button('显示消息', () => send('open')(true))}
      <Snackbar title={label} tone={tone} open={open} onClose={() => send('open')(false)}/>
    </>, 'compact');
    case 'dialog': return showcase(<>
      {button('打开弹窗', () => send('open')(true))}
      <MessageDialog title={label} message={hint} tone={tone} open={open} onChange={send('open')}
        confirm={() => notify('已确认')}/>
    </>, scene ? 'center' : 'compact');
    case 'form-dialog': case 'drawer': return showcase(<FormPreview title={label || '脚本配置'} open={open}
      value={value} drawer={slug === 'drawer'} onChange={send('open')} setValue={send('value')}/>,
      scene ? 'center' : 'compact');
    case 'title-bar': return showcase(<WindowFrame title={label} icon="monitor"
      onClose={() => notify('关闭窗口')} onMinimize={flag('compact') ? undefined : () => notify('窗口最小化')}
      onMaximize={flag('compact') ? undefined : () => notify('窗口尺寸已切换')}><span>窗口内容</span></WindowFrame>,
      'roomy');
    case 'window': return <BetterGIApp title={label} selectedRoute={value} compactNavigation={flag('compact')}
      accentEndpoint={runtimeUrl('bettergi-system', 'accent')}
      onRouteChange={send('value')} onCompactChange={send('compact')} scene={scene}/>;
    case 'tool-window': return showcase(<ToolPreview title={label} open={open} onChange={send('open')}/>, 'roomy');
    case 'markdown': return showcase(<Suspense fallback={null}>
      <MarkdownView source={value} baseUrl={str('baseUrl')} mode={theme.mode}/>
    </Suspense>, 'roomy');
    case 'log': return showcase(flag('empty')
      ? <LogView label="运行日志"><Empty title="暂无运行日志"/></LogView>
      : <LogView label="运行日志" code>{value}</LogView>, 'roomy');
    case 'code-editor': return showcase(<CodeEditor label="代码内容" value={value} onChange={send('value')}
      language={str('language') as Parameters<typeof CodeEditor>[0]['language']}/>, 'roomy');
    case 'file-picker': return showcase(<FilePicker label={flag('directory') ? '选择目录' : '选择文件'}
      names={lexical(initial('files'))} directory={flag('directory')} onChange={send('files')}/>);
    case 'export': return showcase(<Field label="文件名">
      <InputActionRow onSubmit={event => {
        event.preventDefault();
        const filename = value.trim();
        if (filename) saveText(filename, JSON.stringify(taskRows, null, 2));
      }}>
        <Input aria-label="文件名" value={value}
          onChange={event => send('value')(event.currentTarget.value)}/>
        <Button type="submit" icon="download" disabled={!value.trim()}>导出</Button>
      </InputActionRow>
    </Field>);
    case 'canvas': return showcase(<CanvasViewer mode={str('mode') as Parameters<typeof CanvasViewer>[0]['mode']}/>, 'roomy');
    case 'player': return showcase(<AudioPlayer voice={flag('voice')}/>, 'roomy');
    case 'subtitles': return showcase(<SubtitleWindow text={label}/>, 'compact');
    case 'native-window': return showcase(<HostedSurface kind={str('kind') as Parameters<typeof HostedSurface>[0]['kind']}/>, 'roomy');
    case 'trigger-panel': return showcase(<TriggerPanel/>, 'roomy');
    case 'task-plan': return showcase(<PlanBoard title={label} showTabs={flag('showTabs')}/>, 'full');
    case 'run-history': return showcase(<HistoryView/>, 'roomy');
    case 'strategy': return showcase(<StrategyPicker value={value} onChange={send('value')} demo/>, 'regular');
    case 'inventory': return showcase(<Inventory/>, 'roomy');
    case 'resin': return showcase(<ResinEditor/>);
    case 'resource-center': return showcase(<ResourceList key={str('kind')}
      variant={str('kind') as Parameters<typeof ResourceList>[0]['variant']}/>, 'roomy');
    default: return <Empty title="组件未登记"/>;
  }
}

export const renderer: LibraryRenderer = {
  render: props => <Demo {...props}/>,
  renderScene: props => <div className="bgi-scene-content"><Demo {...props} scene/></div>,
  applyTheme,
};
