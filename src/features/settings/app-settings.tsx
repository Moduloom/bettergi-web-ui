import {Fragment, lazy, Suspense, useRef, useState, type ReactNode} from 'react';
import {
  Button, Field, Input, KeyField, Link, NumberField, SearchField, Select, Slider, Switch, Text,
  TextArea, type IconName, type Option,
} from '../../components/controls';
import {Card, Empty, Expander, SettingsActionRow, SettingsList, SettingsRow, Toolbar, type Row} from '../../components/collections';
import {Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {CodeEditor, FileInput, Image, LogView} from '../../components/media';
import {useAppValue} from '../../app/app-state';
import type {useBetterGIConnection} from '../../services/app-runtime';
import {BackgroundPicture, HomeBanner, bannerSource, logoSource, type useStoredPicture} from '../../components/app-images';
import {CloudInstancesDialog} from '../desktop/app-cloud';
import {DesktopSessionDialog} from '../desktop/app-desktop-session';
import {CapturePicker} from '../../components/capture-picker';
import {HardwareSettings} from './app-hardware-preview';
import {AboutDialog, GameBindingsDialog, HtmlMaskDialog, NetworkSettings, StorageDialog, UpdateSettings, networkSearchTerms} from './app-settings-windows';
import {MaskSettings, matchesMaskSettings} from './app-mask-settings';
import {DiscordFields, NotificationEvents, TelegramProxyFields} from './app-notifications';
import {TemplateEditorEntry} from './recognition-template';
import launchHelp from './gicli.md?raw';

const MarkdownView = lazy(() => import('../../components/markdown').then(module => ({default: module.MarkdownView})));

type Picture = ReturnType<typeof useStoredPicture>;
export type Appearance = {
  opacity: number; setOpacity: (value: number) => void;
  stretch: string; setStretch: (value: string) => void;
  followAccent: boolean; setFollowAccent: (value: boolean) => void; accentAvailable?: boolean;
  windowTheme?: {value: WindowThemePreference; onChange: (value: WindowThemePreference) => void};
};
export type WindowThemePreference = 'system' | 'light' | 'dark';
const systemAccentLabel = '跟随 Windows 系统主题色';
const windowThemeChoices: Option[] = [
  {value: 'system', label: '跟随系统'}, {value: 'light', label: '浅色'}, {value: 'dark', label: '深色'},
];
const stretchOptions = [
  {value: 'fill', label: '填充'}, {value: 'cover', label: '等比填充'},
  {value: 'contain', label: '等比适应'}, {value: 'none', label: '原始尺寸'},
];

export type Setting = {label: string; description?: string; storageLabel?: string; disabled?: boolean} & (
  {type: 'toggle'; initial: boolean} |
  {type: 'number'; initial: number; min: number; max: number; step?: number} |
  {type: 'slider'; initial: number} |
  {type: 'select'; initial: string; options: readonly Option[]} |
  {type: 'text' | 'area' | 'key' | 'secret'; initial: string}
);
type Group = {
  title: string; fields: readonly Setting[]; open?: boolean;
  description?: string; icon?: IconName; header?: string; master?: Setting & {type: 'toggle'};
  flat?: boolean; storeAs?: string;
};
type SettingsRoute = 'notifications' | 'settings';

const toggle = (label: string, initial = false): Setting => ({type: 'toggle', label, initial});
const number = (label: string, initial: number, min = 0, max = 10000, step = 1): Setting =>
  ({type: 'number', label, initial, min, max, step});
const text = (label: string, initial = ''): Setting => ({type: 'text', label, initial});
const area = (label: string): Setting => ({type: 'area', label, initial: ''});
const key = (label: string, initial = ''): Setting => ({type: 'key', label, initial});
const secret = (label: string): Setting => ({type: 'secret', label, initial: ''});
const select = (label: string, labels: string[]): Setting => ({
  type: 'select', label, initial: labels[0], options: labels.map(value => ({value, label: value})),
});
const slider = (label: string, initial: number): Setting => ({type: 'slider', label, initial});

const captureFields: Setting[] = [
  {...select('截图模式', ['BitBlt', 'DwmGetDxSharedSurface', 'WindowsGraphicsCapture',
    'WindowsGraphicsCapture（HDR）', 'WindowsGraphicsCapture V2']),
    description: '推荐选择 BitBlt，问题较少。'},
  {...number('触发器间隔（毫秒）', 50, 10, 1000),
    description: '默认 50ms，普通用户不建议调整这个值，具体调整方式见文档。'},
];
const linkedLaunchFields: Setting[] = [
  {...toggle('启动前自动关闭原神 HDR', true), description: '检测到开启时会自动关闭原神 HDR 注册表设置。'},
  {...toggle('自动进入游戏', true), description: '原神启动后自动进入游戏（自动开门、领取月卡）。'},
  {...toggle('使用 CMD 启动游戏'), description: '原神提示重启机器时可尝试此选项。'},
  {...toggle('使用 Starward 记录游戏时间'), description: '启动游戏后 Starward 将同步记录时间。'},
  {...toggle('自动点击获取月卡'), description: '进入游戏后自动点击月卡，如果有的话。'},
];

const providers: Group[] = [
  {title: 'Webhook', header: '启用 Webhook', description: 'Webhook 相关设置', fields: [text('Webhook 端点'), text('发送对象')]},
  {title: 'WebSocket', header: '启用 WebSocket', description: 'WebSocket 相关设置', fields: [text('WebSocket 端点')]},
  {title: 'Windows 通知', header: '启用 Windows 通知', description: 'Windows 通知别与游戏界面重叠，否则易误点通知', fields: []},
  {title: '飞书', header: '启用飞书通知', description: '飞书通知相关设置', fields: [text('飞书通知地址'), text('飞书 AppId'), secret('飞书 AppSecret')]},
  {title: 'OneBot', header: '启用 OneBot 通知', description: 'OneBot 通知相关设置', fields: [text('OneBot 请求地址'), text('QQ 号'), text('群号'), secret('OneBot Token')]},
  {title: '企业微信', header: '启用企业微信通知', description: '企业微信通知相关设置', fields: [text('企业微信通知地址')]},
  {title: '邮箱', header: '启用邮箱通知', description: '邮箱相关设置（账号密码完全保存于本地）', fields: [
    text('SMTP 服务器'), number('SMTP 端口', 587, 1, 65535), text('SMTP 用户名'), secret('SMTP 密码'),
    text('发件人邮箱'), text('发件人姓名'), text('收件人邮箱'),
  ]},
  {title: 'Bark', header: '启用 Bark 通知', description: 'Bark iOS 推送通知', fields: [
    text('Bark API 端点'), secret('设备 Key'), select('推送级别', ['active', 'passive', 'critical', 'sensitive']),
    text('通知声音'), text('通知图标'), text('通知分组'), toggle('保存推送历史'), secret('加密密钥'),
  ]},
  {title: 'Telegram', header: '启用 Telegram 通知', description: 'Telegram 机器人相关设置', fields: [
    secret('机器人 Token'), text('聊天 ID'), text('API 基础 URL'),
  ]},
  {title: 'xxtui', header: '启用 xxtui 信息推送', description: '信息推送通知相关设置', fields: [secret('API 密钥'), text('通知来源'), text('通知渠道')]},
  {title: '钉钉机器人', header: '启用钉钉机器人通知', description: '钉钉机器人通知相关设置', fields: [text('钉钉机器人通知地址'), secret('钉钉机器人密钥')]},
  {title: 'Discord', header: '启用 Discord 通知', description: '可选择 Webhook 或机器人两种推送方式', fields: []},
  {title: 'ServerChan', header: '启用 ServerChan 通知', description: 'ServerChan 推送通知相关设置', fields: [secret('SendKey')]},
  {title: 'MeoW', header: '启用 MeoW 通知', description: 'MeoW 推送通知相关设置', fields: [text('用户昵称'), text('消息标题')]},
  {title: 'Gotify', header: '启用 Gotify 通知', description: 'Gotify 推送通知相关设置', fields: [text('Gotify 服务地址'), secret('Gotify Token'), number('Gotify 通知优先级', 5, 0, 10)]},
  {title: 'QQ', header: '启用 QQ 通知', description: 'QQ 官方推送，支持文字和截图', fields: [
    text('AppID'), secret('AppSecret'), text('用户 OpenID'), text('群 OpenID'), select('消息格式', ['普通消息', 'Markdown']),
  ]},
  {title: '微信 Clawbot', header: '启用微信 Clawbot 通知', description: '微信 Clawbot 推送，支持文字和截图', fields: [secret('BotToken'), text('目标用户 ID')]},
];

const groups: Record<SettingsRoute, Group[]> = {
  notifications: [
    {title: '全局通知设置', description: '影响下方所有通知的设置', open: true, fields: [
      {...toggle('通知时包含截图'), description: '总是在通知中包含截图'},
      {...toggle('一条龙结束发送汇总通知'), description: '结束时推送体力与每日委托奖励汇总及截图。'},
      {...toggle('是否允许 JS 通知'), description: '开启时允许 JS 脚本发送通知'},
    ]},
    ...providers.map((group): Group => ({...group, icon: 'bell', master: {
      type: 'toggle', label: '启用 ' + group.title, initial: false,
    }})),
  ],
  settings: [
    {title: '软件设置', flat: true, fields: [
      {...select('软件UI语言', ['简体中文', 'English', '日本語']), description: 'UI Language', storageLabel: '软件 UI 语言'},
      {...select('原神游戏语言', ['简体中文', 'English', '日本語']), description: 'Game Language'},
    ]},
    {title: '本机外部访问服务', description: '仅监听 loopback；功能开关和端口将在重启 BetterGI 后生效', fields: [
      toggle('HTTP API'), toggle('WebSocket 实时日志'), toggle('MCP 服务'),
      number('监听端口', 30648, 1024, 65535), secret('访问令牌'),
    ]},
    {title: '网络与代理', fields: []},
    {title: '主窗口自定义背景', description: '使用本地图片装饰软件主窗口，可调整透明度和填充方式', icon: 'image', fields: []},
    {title: '遮罩窗口', fields: []},
    {title: '开发者功能', description: '模板素材制作、调试截图等面向开发和素材维护的工具', icon: 'code', fields: [
      {...toggle('启用保存截图功能'), storageLabel: '启用保存截图'}, key('截图快捷键'),
      toggle('截图遮盖 UID'), toggle('保存奖励识别截图'),
    ]},
    {title: '启动时自动更新已订阅的脚本', storeAs: '软件设置', icon: 'rotate',
      description: '启动时自动同步脚本仓库并更新所有已订阅的脚本',
      master: {type: 'toggle', label: '启动时自动更新已订阅的脚本', initial: false},
      fields: [{...toggle('命令行启动时也自动更新'), description: '通过命令行参数启动配置组/一条龙时，先等待脚本更新完成再执行'}]},
    {title: '退出时最小化到系统托盘', flat: true, storeAs: '软件设置', fields: [
      {...toggle('退出时最小化到系统托盘'), description: '启用后点击右上角退出按钮会最小化到系统托盘继续运行，右键托盘图标退出'},
    ]},
    {title: '按键绑定设置', storeAs: '通用功能设置', icon: 'settings',
      description: '如果你有游戏内改键需求，请在此配置对应的改键',
      fields: [{...toggle('启用全局按键映射'), description: '使按键绑定设置对外部脚本生效'}]},
    {title: '地图追踪优先使用的特征匹配方式', flat: true, storeAs: '通用功能设置', fields: [
      {...select('地图追踪优先使用的特征匹配方式', ['SIFT', 'SURF']),
        storageLabel: '地图追踪特征匹配方式', description: '影响所有地图追踪功能，重启后生效'},
    ]},
    {title: '大地图地图传送设置', storeAs: '通用功能设置', icon: 'map',
      description: '用于地图追踪、自动秘境、一条龙等功能中传送功能的配置', fields: [
      toggle('地图移动过程中是否缩放地图', true), toggle('地图拖动使用相对鼠标移动'),
      number('传送操作间隔倍率', 1, .1, 5, .1),
    ]},
    {title: '七天神像设置', storeAs: '通用功能设置', icon: 'map', description: '用于指定回血的七天神像', fields: [
      toggle('是否就近七天神像恢复血量', true),
      text('七天神像国家'), text('七天神像区域'), number('回血等待间隔（秒）', 5, 1, 30),
    ]},
    {title: '其他设置', description: '设定一些其他功能的配置，失去焦点自动恢复等', fields: [
      toggle('窗口类名优先检测'), toggle('游戏失去焦点后恢复激活'),
      toggle('独立任务期间开启 Windows 勿扰'), toggle('禁用键鼠监听'),
      select('服务器时区', ['亚洲（UTC+8）', '欧洲', '美洲']),
      select('图标识别模型', ['ItemV2', 'GridIcon']),
    ]},
  ],
};

const advancedSettings: Group[] = [
  {title: '米游社相关', description: '用于配置米游社相关的信息如cookie', fields: [
    secret('米游社cookie'), toggle('cookie与调度器日志处同步'),
  ]},
  {title: 'OCR 配置', description: 'OCR 相关配置，面向进阶用户。', fields: [
    {...select('OCR 模型', ['PP-OCRv6']), description: '主程序内置 PP-OCRv6。其他 OCR 模型可在插件页安装。'},
  ]},
  {title: 'WGC V2 设置', description: 'WGC V2 截图方式的专属配置，面向进阶用户。', storeAs: '开发者功能', fields: [
      number('WGC V2 帧率上限（毫秒）', 0), toggle('WGC V2 使用 CPU 颜色转换'),
  ]},
];

export function SettingRow({setting, storageKey, inline = true}: {setting: Setting; storageKey: string; inline?: boolean}) {
  const [value, setValue] = useAppValue<string | boolean | number>(storageKey, setting.initial);
  const label = setting.label;
  let control: ReactNode;
  switch (setting.type) {
    case 'toggle':
      control = <Switch label={label} showLabel={false} checked={Boolean(value)} onChange={setValue} disabled={setting.disabled}/>;
      break;
    case 'number':
      control = <NumberField label={label} value={Number(value)} min={setting.min} max={setting.max}
        step={setting.step} onChange={setValue}/>;
      break;
    case 'slider':
      control = <Slider label={label} unit="%" value={Number(value)} onChange={setValue}/>;
      break;
    case 'select':
      control = <Select label={label} value={String(value)} options={setting.options} onValueChange={setValue}/>;
      break;
    case 'key':
      control = <KeyField label={label} value={String(value)} onChange={setValue}/>;
      break;
    case 'area':
      control = <TextArea label={label} value={String(value)} onChange={setValue}/>;
      break;
    case 'secret':
      control = <Input aria-label={label} type="password" disabled title="需要连接 BetterGI 本机服务"/>;
      break;
    default:
      control = <Input aria-label={label} value={String(value)}
        onChange={event => setValue(event.currentTarget.value)}/>;
  }
  return <SettingsRow label={label} description={setting.description} control={control}
    stacked={setting.type === 'area'} inline={inline}/>;
}

function GroupSwitch({scope, group, master}: {
  scope: string; group: string; master: Setting & {type: 'toggle'};
}) {
  const [enabled, setEnabled] = useAppValue(scope + '/' + group + '/' + master.label, master.initial);
  return <Switch label={master.label} checked={enabled} onChange={setEnabled} showLabel={false}/>;
}

function SettingsGroup({group, scope, search, children, action, leading}: {
  group: Group; scope: string; search?: boolean; children?: ReactNode; action?: ReactNode; leading?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(group.open));
  const storageGroup = group.storeAs ?? group.title;
  const fields = group.fields.map(setting => <SettingRow key={setting.label} inline={!group.flat}
    storageKey={scope + '/' + storageGroup + '/' + (setting.storageLabel ?? setting.label)} setting={setting}/>);
  if (group.flat) return <>{leading}{fields}{children}</>;
  return <Expander title={group.header ?? group.title} description={group.description} icon={group.icon}
    open={Boolean(search) || open} onChange={setOpen} action={group.master ?
      <GroupSwitch scope={scope} group={storageGroup} master={group.master}/> : action}>
    <SettingsList>
      {leading}
      {fields}
      {children}
    </SettingsList>
  </Expander>;
}

function CaptureOptions({onHardware, onPick}: {onHardware: () => void; onPick: (test: boolean) => void}) {
  const [windowed, setWindowed] = useAppValue('home/自动关闭 Windows 11 窗口化优化', true);
  return <SettingsList separated>
    {captureFields.map(setting => <SettingRow key={setting.label}
      storageKey={'home/' + setting.label} setting={setting}/>)}
    <SettingsActionRow inline label="AI推理设备设置" description="修改后需要重启程序生效"
      action={<Button onClick={onHardware}>设置</Button>}/>
    <SettingsActionRow inline label="测试图像捕获" description="测试功能，测试几种截图模式的效果"
      action={<Button onClick={() => onPick(true)}>测试图像捕获</Button>}/>
    <SettingsActionRow inline label="手动选择窗口（无法找到原神窗口时使用）"
      description="原神已经启动的情况下，点击“启动”仍旧提示无法找到窗口时使用"
      action={<Button onClick={() => onPick(false)}>选择捕获窗口</Button>}/>
    <SettingsActionRow inline label="自动关闭 Windows11 窗口化优化以支持 BitBlt"
      description="修改设置后重启游戏生效" action={<>
        <Switch label="自动关闭 Windows11 窗口化优化以支持 BitBlt" checked={windowed} onChange={setWindowed} showLabel={false}/>
        <Button disabled title="由 Windows 打开显示设置">手动设置</Button>
      </>}/>
  </SettingsList>;
}

function LinkedLaunchSettings() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [linked, setLinked] = useAppValue('home/同时启动原神', true);
  const [installPath, setInstallPath] = useAppValue('home/原神安装位置', '');
  const [argumentsText, setArgumentsText] = useAppValue('home/启动参数', '');
  const launcher = useRef<HTMLInputElement>(null);
  return <>
    <Expander title="同时启动原神" description="启动截图器时，如果原神未启动，则自动启动原神。"
      icon="external" open={open} onChange={setOpen}
      action={<Switch label="同时启动原神" checked={linked} onChange={setLinked} showLabel={false}/>}>
      <SettingsList separated>
        <SettingsActionRow inline label="原神安装位置（不支持云原神的联动启动）" description={installPath || undefined}
          action={<>
            <FileInput inputRef={launcher} accept=".exe" onFiles={files => {if (files[0]) setInstallPath(files[0].name);}}/>
            <Button onClick={() => launcher.current?.click()}>浏览</Button>
          </>}/>
        <SettingsRow inline label="启动参数" description={<>
          如果你不知道什么是启动参数请不要填写。 <Link onActivate={() => setHelp(true)}>打开文档</Link>
        </>} control={<Input aria-label="启动参数" value={argumentsText} placeholder="例如：-screen-width 1920"
          onChange={event => setArgumentsText(event.currentTarget.value)}/>}/>
        {linkedLaunchFields.map(setting => <SettingRow key={setting.label}
          storageKey={'home/' + (setting.storageLabel ?? setting.label)} setting={setting}/>)}
      </SettingsList>
    </Expander>
    <Modal title="启动参数说明" open={help} onChange={setHelp} wide width={800} maxHeight={600}
      iconContent={<Image src={logoSource} width={16} height={16} alt=""/>}>
      {help && <Suspense fallback={null}><MarkdownView source={launchHelp}/></Suspense>}
    </Modal>
  </>;
}

export function HomePage({picture, runtime, navigate}: {
  picture: Picture; runtime: ReturnType<typeof useBetterGIConnection>; navigate: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hardware, setHardware] = useState(false);
  const [window, setWindow] = useState<'cloud' | 'desktop' | undefined>();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureView, setCaptureView] = useState<'test' | 'manual' | 'preview'>('test');
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const {notify, snackbar} = useSnackbar();

  function pickCapture(test: boolean) {
    setCaptureView(test ? 'test' : 'manual');
    setCaptureEpoch(previous => previous + 1);
    setCaptureOpen(true);
  }

  function chooseWindow(item: Row) {
    if (captureView === 'test') {
      setCaptureView('preview');
      return;
    }
    setCaptureOpen(false);
    notify('已选择 ' + item.label, 'success');
  }

  return <>
    <HomeBanner picture={picture}/>
    <Expander title="BetterGI 截图器，启动！" icon="play" open={open} onChange={setOpen}
      description="截图器启动后才能使用各项功能，点击展开启动相关配置。"
      action={<Button appearance="primary" icon="play" disabled title="本机 HTTP API 暂未提供截图器控制">启动</Button>}>
      <CaptureOptions onHardware={() => setHardware(true)} onPick={pickCapture}/>
    </Expander>
    <LinkedLaunchSettings/>
    <Card title="云原神网页版" description="每个实例独立保存登录状态，支持同时打开多个。" icon="cloud"
      action={<Button onClick={() => setWindow('cloud')}>管理实例</Button>}/>
    <Card title="BetterGI 桌面分身" description="游戏在桌面分身中运行时，可以不占用当前桌面鼠标。" icon="monitor"
      action={<Button onClick={() => setWindow('desktop')}>打开</Button>}/>
    <HardwareSettings open={hardware} onClose={() => setHardware(false)}/>
    <Modal title={captureView === 'preview' ? 'CaptureTestWindow' : '选择捕获窗口'} open={captureOpen}
      onChange={setCaptureOpen} wide width={800} maxHeight={captureView === 'preview' ? 500 : 450}
      actions={captureView === 'preview' ? undefined : <Button onClick={() => setCaptureOpen(false)}>取消</Button>}>
      {captureView === 'preview' ? <Image className="bgi-capture-result" src={bannerSource} alt="示例捕获画面"/>
        : <CapturePicker key={captureEpoch} onChoose={chooseWindow}/>}
    </Modal>
    <CloudInstancesDialog open={window === 'cloud'} onChange={open => setWindow(open ? 'cloud' : undefined)}
      runtime={runtime} onTasks={() => navigate('tasks')} onConnection={() => navigate('settings')}/>
    <DesktopSessionDialog open={window === 'desktop'} onChange={open => setWindow(open ? 'desktop' : undefined)}
      runtime={runtime} onConnection={() => navigate('settings')}/>
    <Snackbar {...snackbar}/>
  </>;
}

function NativeConnection({runtime}: {runtime: ReturnType<typeof useBetterGIConnection>}) {
  const {connection, log, logStatus, connect, disconnect, hosted} = runtime;
  const [dialog, setDialog] = useState(false);
  const [port, setPort] = useAppValue('connection/port', 30648);
  const [token, setToken] = useState('');
  const [readLogs, setReadLogs] = useState(false);
  const online = connection.state === 'online';
  const busy = connection.state === 'connecting';
  const validPort = hosted || Number.isInteger(port) && port >= 1024 && port <= 65535;

  function changeDialog(open: boolean) {
    setDialog(open);
    if (!open) setToken('');
  }

  return <>
    <Toolbar actions={<Button onClick={online || busy ? disconnect : () => setDialog(true)}>
      {online ? '断开' : busy ? '取消连接' : '连接本机'}
    </Button>}>
      <span role="status">{connection.message}</span>
    </Toolbar>
    <LogView label="运行日志">
      {logStatus && <p className="bgi-muted">{logStatus}</p>}
      {log.length ? log.map(entry => <p key={entry.id}>{entry.text}</p>) :
        <span className="bgi-muted">{online ? '暂无日志' : '尚未连接本机 BetterGI'}</span>}
    </LogView>
    <Modal title="连接本机 BetterGI" open={dialog} onChange={changeDialog}
      actions={<><Button onClick={() => changeDialog(false)}>取消</Button>
        <Button appearance="primary" type="submit" form="bgi-connect-form"
          disabled={!validPort || !token.trim()}>连接</Button></>}>
      <form id="bgi-connect-form" className="bgi-stack" onSubmit={event => {
        event.preventDefault();
        void connect(port, token, readLogs);
        changeDialog(false);
      }}>
        <p className="bgi-muted">{hosted ? '从桌面版「设置 → 本机外部访问服务」复制访问令牌。' :
          '在桌面版「设置 → 本机外部访问服务」启用 HTTP API，再填写监听端口和访问令牌。'}</p>
        {!hosted && <Field label="监听端口"><NumberField label="监听端口" value={port} min={1024} max={65535}
          onChange={setPort}/></Field>}
        <Field label="访问令牌"><Input aria-label="访问令牌" type="password" value={token} autoComplete="off"
          onChange={event => setToken(event.currentTarget.value)}/></Field>
        <Switch label="读取 WebSocket 实时日志" checked={readLogs} onChange={setReadLogs}/>
      </form>
    </Modal>
  </>;
}

function MacroShortcut({title}: {title: string}) {
  const [value, setValue] = useAppValue('macros/' + title + '/绑定快捷键', '');
  return <KeyField label={title + '快捷键'} value={value} onChange={setValue}/>;
}

const expandedMacros: Group[] = [
  {title: '一键领取奖励', description: '识别当前页面的领取按钮或礼物图标并点击。', icon: 'package', fields: [
    select('模式选择', ['点按一次', '按住持续']), toggle('未找到领取图标时滚轮下滑'), number('滚轮下滑幅度', 2, 1, 20),
  ]},
  {title: '那维莱特 - 转圈圈', description: '快速水平平移鼠标。', icon: 'rotate', fields: [
    number('移动鼠标距离', 500, -10000), number('移动鼠标间隔（毫秒）', 10, 1, 1000),
  ]},
  {title: '快速强化圣遗物', description: '快速跳过强化结果展示。', icon: 'up', fields: [
    number('强化的额外等待时间（毫秒）', 0),
  ]},
];
const inlineMacros = [
  {title: '一键购买', description: '在物品购买或兑换页使用，从选中物品开始持续购买。', icon: 'package'},
  {title: '一键进出尘歌壶', description: '打开背包，放置尘歌壶并进入。', icon: 'archive'},
  {title: '一键确认/取消', description: '绑定快捷键到原神的确认或取消按钮。', icon: 'check'},
] as const;

export function MacroSettings({navigate}: {navigate: (route: string) => void}) {
  const [editor, setEditor] = useState(false);
  const [macro, setMacro] = useAppValue('macros/json', '{\n  "macros": []\n}');
  const [space, setSpace] = useAppValue('macros/space-repeat', false);
  const [interact, setInteract] = useAppValue('macros/interact-repeat', false);
  return <div className="bgi-stack bgi-trigger-page">
    <h1>辅助操控设置</h1>
    <Card title="按键宏（不识图）" icon="code"
      description="每个宏单独绑定快捷键，按下后直接执行键鼠序列。支持单次、按住循环、切换循环。"
      action={<Button onClick={() => navigate('key-macros')}>前往设置</Button>}/>
    <SettingsGroup scope="macros" group={{
      title: '一键宏（按角色）', icon: 'user', description: '识别当前出战角色，并根据配置执行对应的宏。',
      master: {type: 'toggle', label: '启用按角色一键宏', initial: false},
      fields: [select('快捷键触发方式', ['按住时重复', '触发']), number('默认战斗宏编号', 1, 1, 5),
        area('角色个性化宏编号设置')],
    }}>
      <SettingsActionRow inline label="宏配置" action={<Button icon="code" onClick={() => setEditor(true)}>编辑 JSON</Button>}/>
    </SettingsGroup>
    {expandedMacros.map(group => <SettingsGroup key={group.title} scope="macros" group={group}
      action={<MacroShortcut title={group.title}/>}/>)}
    {inlineMacros.map(item => <Card key={item.title} {...item} action={<MacroShortcut title={item.title}/>}/>)}
    <Card title="长按空格等于连续按下空格" icon="activity" description="可用于解除冻结。水下也会用到长按空格，原版默认关闭。"
      action={<Switch label="长按空格等于连续按下空格" checked={space} onChange={setSpace} showLabel={false}/>}/>
    <Card title="长按 F 等于连续按下 F" icon="hand" description="用于快速拾取大量掉落物。"
      action={<Switch label="长按 F 等于连续按下 F" checked={interact} onChange={setInteract} showLabel={false}/>}/>
    <Modal title="宏配置" open={editor} onChange={setEditor}
      actions={<Button onClick={() => setEditor(false)}>关闭</Button>}>
      <CodeEditor label="宏配置 JSON" language="json" value={macro} onChange={setMacro}/>
    </Modal>
  </div>;
}

const guideSections: Group[] = [
  {title: '外观与窗口', description: '调整小窗的不透明度、置顶和位置。', icon: 'monitor', fields: [
    slider('不透明度', 85), toggle('始终置顶', true), select('位置', ['自由放置', '跟随游戏窗口']),
    slider('网页缩放', 100), toggle('沉浸模式下按视频比例缩放', true), toggle('显示底部进度线', true),
  ]},
  {title: '鼠标穿透与交互', description: '小窗默认不抢游戏焦点，输入文字时可进入交互模式。', icon: 'hand', fields: [
    toggle('鼠标穿透'), toggle('智能透明', true), slider('淡化后的不透明度', 25),
    number('交互模式自动结束（秒）', 2, 0, 60),
  ]},
  {title: '自动显示与隐藏', description: '进入游戏时打开，游戏切到后台时隐藏，执行任务时让开。', icon: 'monitor', fields: [
    select('进入游戏时', ['恢复上次状态', '打开小窗', '保持关闭']),
    toggle('游戏最小化或切到后台时隐藏', true), toggle('小窗在其他显示器上时不自动隐藏', true),
    toggle('小窗隐藏时暂停视频'), toggle('执行任务时隐藏小窗', true),
    toggle('任务开始时暂停视频', true), toggle('任务结束后恢复小窗', true),
  ]},
  {title: '播放习惯', description: '调整快进步长、倍速、临时加速、续播与字幕。', icon: 'play', fields: [
    number('快进、快退步长', 5, 1, 60), number('倍速调整步长', .25, .05, 1, .05),
    number('按住临时加速的倍速', 2, 1, 5, .25), number('音量调整步长', 10, 1, 100),
    select('从上次位置继续', ['从收藏和观看记录打开时继续', '始终继续', '关闭']),
    toggle('续播时恢复上次的倍速', true), toggle('自动开启中文字幕（B 站）', true), toggle('记住沉浸模式', true),
  ]},
  {title: '字幕浮窗', description: '把视频字幕显示在游戏画面上，并随小窗显示或隐藏。', icon: 'message',
    master: {type: 'toggle', label: '启用字幕浮窗', initial: false}, fields: [
      number('字号', 22, 10, 72), slider('背景不透明度', 40), toggle('开启字幕浮窗时隐藏网页内字幕', true),
    ]},
  {title: '快捷键', icon: 'settings', fields: []},
  {title: '收藏与观看记录', icon: 'book', fields: []},
  {title: '网页数据与快捷打开', description: '小窗使用独立的网页环境。', icon: 'globe', fields: [
    toggle('地图点位视频默认用小窗打开', true), toggle('识别剪贴板中的 B 站链接', true),
  ]},
];

export function GuideSettings({navigate}: {navigate: (route: string) => void}) {
  const [home, setHome] = useAppValue('guide/主页/主页地址', 'https://www.bilibili.com/');
  const [storageOpen, setStorageOpen] = useState(false);
  return <div className="bgi-stack bgi-trigger-page">
    <h1>悬浮小窗</h1>
    <Text variant="body">在游戏中按住 Alt，把鼠标移到小窗上即可操作。</Text>
    <Card title="小窗" icon="monitor" action={<div className="bgi-wrap">
      <Button appearance="primary" disabled>打开小窗</Button><Button disabled>隐藏</Button>
      <Button disabled>关闭</Button><Button disabled>恢复小窗</Button>
    </div>}/>
    <Card title="主页" description="没有上次看过的页面时打开。" icon="globe"
      action={<div className="bgi-wrap"><Input aria-label="主页地址" value={home}
        onChange={event => setHome(event.currentTarget.value)}/>
        <Button onClick={() => setHome('https://www.bilibili.com/')}>恢复 B 站首页</Button>
      </div>}/>
    {guideSections.map(group => <SettingsGroup key={group.title} group={group} scope="guide">
      {group.title === '快捷键' && <Button onClick={() => navigate('hotkeys')}>在快捷键页查看全部快捷键</Button>}
      {group.title === '收藏与观看记录' && <><Empty title="暂无收藏"/><Empty title="暂无观看记录"/></>}
      {group.title === '网页数据与快捷打开' && <SettingsActionRow inline label="网页缓存"
        description="在存储空间中清理“悬浮小窗 · 网页缓存”，下次启动时生效，不会退出登录"
        action={<Button onClick={() => setStorageOpen(true)}>打开存储空间</Button>}/>}
    </SettingsGroup>)}
    <StorageDialog open={storageOpen} onChange={setStorageOpen}/>
  </div>;
}

export function SettingsPage({page, runtime, picture, appearance}: {
  page: SettingsRoute; runtime?: ReturnType<typeof useBetterGIConnection>;
  picture?: Picture; appearance?: Appearance;
}) {
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'about' | 'bindings' | 'mask' | 'storage' | null>(null);
  const search = query.trim().toLowerCase();
  const showAccent = systemAccentLabel.toLowerCase().includes(search);
  const showWindowTheme = Boolean(appearance?.windowTheme) && '窗口主题'.includes(search);
  const showStorage = page === 'settings' && '存储空间管理'.includes(search);
  const showAbout = page === 'settings' && '关于 bettergi'.includes(search);
  const showUpdates = page === 'settings' && ['版本更新', '检查更新', '检查是否存在最新测试版'].some(term => term.includes(search));
  const visibleAdvanced = advancedSettings.filter(group => !search || '其他设置'.includes(search) ||
    group.title.toLowerCase().includes(search) || group.fields.some(field => field.label.toLowerCase().includes(search)));
  const storageCard = showStorage && <Card title="存储空间" description="查看各类数据的占用和清理选项" icon="archive"
    action={<Button onClick={() => setModal('storage')}>管理</Button>}/>;
  const visible = groups[page].flatMap(group => {
    if (!search || (group.header ?? group.title).toLowerCase().includes(search)) return [group];
    if (page === 'notifications' && group.title === '全局通知设置' && '需要通知的事件'.includes(search)) return [{...group, fields: []}];
    if (page === 'notifications' && group.title === 'Discord' && ['通知方式', '管理目标', '推送目标', '截图编码'].some(term => term.includes(search))) return [group];
    if (page === 'notifications' && group.title === 'Telegram' && ['启用代理', '代理地址'].some(term => term.includes(search))) return [{...group, fields: []}];
    if (group.title === '网络与代理' && networkSearchTerms.some(term => term.includes(search))) return [group];
    if (group.title === '遮罩窗口' && matchesMaskSettings(search)) return [group];
    if (group.title === '开发者功能' && 'recognition 模板素材制作'.includes(search)) return [{...group, fields: []}];
    if (group.title === '其他设置' && visibleAdvanced.length) return [{...group, fields: []}];
    const fields = group.fields.filter(field => [field.label, field.storageLabel].some(label => label?.toLowerCase().includes(search)));
    return fields.length || (appearance && group.title === '软件设置' && (showAccent || showWindowTheme)) ? [{...group, fields}] : [];
  });

  return <>
    <Text variant="section">{page === 'settings' ? '软件设置' : '通知设置'}</Text>
    <SearchField label="搜索设置" value={query} onChange={setQuery}/>
    {!visible.length && !showStorage && !showAbout && !showUpdates && <Empty title="没有匹配的设置"/>}
    {visible.map(group => group.title === '网络与代理' ? <Fragment key={group.title}>
      <NetworkSettings search={Boolean(search)}/>{storageCard}
    </Fragment> : group.title === '遮罩窗口' ? <MaskSettings key={group.title} query={search} onEditHtml={() => setModal('mask')}/> :
      <Fragment key={group.title}>
      {group.title === '按键绑定设置' && !search && <Text variant="section">通用功能设置</Text>}
      <SettingsGroup group={group} scope={page} search={Boolean(search)} action={group.title === '按键绑定设置' ?
        <Button onClick={() => setModal('bindings')}>配置</Button> : undefined}
        leading={group.title === '开发者功能' && (!search || 'recognition 模板素材制作'.includes(search)) && <TemplateEditorEntry/>}>
      {group.title === '软件设置' && appearance?.windowTheme && (showWindowTheme || group.title.includes(search)) &&
        <SettingsRow label="窗口主题" control={<Select label="窗口主题" value={appearance.windowTheme.value}
          options={windowThemeChoices} onValueChange={value => appearance.windowTheme?.onChange(value as WindowThemePreference)}/>}/>}
      {group.title === '软件设置' && appearance && (showAccent || group.title.includes(search)) &&
        <SettingsRow label={systemAccentLabel}
          description={appearance.followAccent && appearance.accentAvailable === false ? '暂未读取到系统主题色，当前使用组件库主题。' : undefined}
          control={<Switch label={systemAccentLabel} showLabel={false} checked={appearance.followAccent}
            onChange={appearance.setFollowAccent}/>}/>}
      {group.title === '主窗口自定义背景' && picture && appearance && <>
        <BackgroundPicture picture={picture}/>
        <SettingsRow inline label="背景不透明度" control={<Slider label="背景不透明度"
          value={appearance.opacity} onChange={appearance.setOpacity} unit="%"/>}/>
        <SettingsRow inline label="图片填充方式" control={<Select label="图片填充方式"
          value={appearance.stretch} options={stretchOptions} onValueChange={appearance.setStretch}/>}/>
      </>}
      {group.title === '本机外部访问服务' && runtime && <NativeConnection runtime={runtime}/>}
      {group.title === '其他设置' && visibleAdvanced.map(subgroup => <SettingsGroup key={subgroup.title} group={subgroup}
        scope={page} search={Boolean(search)}/>) }
      {page === 'notifications' && group.title === '全局通知设置' && <NotificationEvents/>}
      {page === 'notifications' && group.title === 'Discord' && <DiscordFields/>}
      {page === 'notifications' && group.title === 'Telegram' && <TelegramProxyFields/>}
      {page === 'notifications' && group.title === 'QQ' && <>
        <SettingsActionRow inline label="绑定 OpenID" action={<Button disabled title="需要连接本机 BetterGI">绑定</Button>}/>
        <SettingsActionRow inline label="绑定群 OpenID" action={<Button disabled title="需要连接本机 BetterGI">绑定群</Button>}/>
      </>}
      {page === 'notifications' && group.title === '微信 Clawbot' && <SettingsActionRow inline label="登录并绑定"
        action={<Button disabled title="需要连接本机 BetterGI">登录并绑定</Button>}/>}
      {page === 'notifications' && group.master && <SettingsActionRow inline
        label={group.title === 'Webhook' ? '测试' : '测试 ' + group.title + (group.title.endsWith('通知') ? '' : ' 通知')}
        description={group.title === 'Webhook' ? '发送测试载荷' : '发送测试通知'}
        action={<Button disabled title="需要连接本机 BetterGI">发送</Button>}/>}
    </SettingsGroup></Fragment>)}
    {showStorage && !visible.some(group => group.title === '网络与代理') && storageCard}
    {page === 'settings' && !search && <Text variant="section">帮助</Text>}
    {showUpdates && <UpdateSettings/>}
    {showAbout && <Card title="关于 BetterGI" description="查看项目、文档等信息" icon="info"
      action={<Button onClick={() => setModal('about')}>查看</Button>}/>}
    {page === 'settings' && <>
      <StorageDialog open={modal === 'storage'} onChange={open => setModal(open ? 'storage' : null)}/>
      <HtmlMaskDialog open={modal === 'mask'} onChange={open => setModal(open ? 'mask' : null)}/>
      <AboutDialog open={modal === 'about'} onChange={open => setModal(open ? 'about' : null)}/>
      <GameBindingsDialog open={modal === 'bindings'} onChange={open => setModal(open ? 'bindings' : null)}/>
    </>}
  </>;
}
