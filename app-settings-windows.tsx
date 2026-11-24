import {useLayoutEffect, useState} from 'react';
import {Button, Input, KeyField, Link, Select, Text} from './controls';
import {Card, Expander, SettingsActionRow, SettingsList, SettingsRow, Tree} from './collections';
import {InfoBar, Modal, Snackbar, useSnackbar} from './overlays';
import {CodeEditor, Image} from './media';
import {logoSource} from './app-images';
import {useAppValue} from './app-state';
import {gameBindings} from './game-key-bindings';

const nativeOnly = '需要连接本机 BetterGI';
const titleIcon = <Image src={logoSource} width={16} height={16} alt=""/>;

const proxyModes = [
  {value: '使用系统代理', label: '跟随系统代理', description: '使用 Windows 设置中的代理'},
  {value: '直连', label: '不使用代理', description: '所有请求直接连接'},
  {value: '手动设置', label: '自定义代理', description: '使用下方填写的代理地址'},
];

export const networkSearchTerms = ['网络与代理', '代理模式', '代理地址', '不使用代理的地址', '测试连接'];

function validateProxyAddress(value: string) {
  if (!value.trim()) return '请填写代理地址，填写前所有请求直接连接';
  try {
    const url = new URL(value.trim());
    if (['http:', 'socks5:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return '';
  } catch {
    // An incomplete URL is valid while the user is typing.
  }
  return '请输入有效的 HTTP 或 SOCKS5 代理地址';
}

export function NetworkSettings({search}: {search: boolean}) {
  const [open, setOpen] = useState(false);
  const [selectedMode, setMode] = useAppValue('settings/网络与代理/代理模式', proxyModes[0].value);
  const mode = proxyModes.find(item => item.value === selectedMode) ?? proxyModes[0];
  const [address, setAddress] = useAppValue('settings/网络与代理/代理地址', '');
  const [bypass, setBypass] = useAppValue('settings/网络与代理/不使用代理的地址', '');
  const [error, setError] = useState('');

  return <Expander title="网络与代理" description="软件联网时使用的代理，修改后对新请求立即生效"
    icon="globe" open={open || search} onChange={setOpen} action={<Text variant="caption">{mode.label}</Text>}>
    <SettingsList separated>
      <SettingsRow inline label="代理模式" description={mode.description} controlWidth={200}
        control={<Select label="代理模式" options={proxyModes} value={mode.value} onValueChange={value => {
          setMode(value);
          setError(value === '手动设置' ? validateProxyAddress(address) : '');
        }}/>}/>
      {mode.value === '手动设置' && <>
        <SettingsRow inline label="代理地址" controlWidth={260}
          description="支持 http:// 和 socks5://，暂不支持需要用户名和密码的代理"
          control={<div className="bgi-stack">
            <Input aria-label="代理地址" aria-invalid={Boolean(error)} placeholder="http://127.0.0.1:7890"
              value={address} onChange={event => {setAddress(event.currentTarget.value); setError('');}}
              onBlur={() => setError(validateProxyAddress(address))}
              onKeyDown={event => {if (event.key === 'Enter') setError(validateProxyAddress(address));}}/>
            {error && <p className="bgi-error-text" role="status">{error}</p>}
          </div>}/>
        <SettingsRow inline label="不使用代理的地址" controlWidth={260}
          description="分号分隔，支持 * 通配，例如 *.mihoyo.com。国内服务可以加入这里以直连，本机地址始终直连"
          control={<Input aria-label="不使用代理的地址" placeholder="localhost;127.*;192.168.*"
            value={bypass} onChange={event => setBypass(event.currentTarget.value)}/>}/>
      </>}
      <SettingsActionRow inline label="测试连接" description="用当前设置访问 CNB、GitHub 和米游社"
        action={<Button disabled title={nativeOnly}>测试连接</Button>}/>
    </SettingsList>
    <Text variant="caption">生效范围：软件内的网络请求、通知推送和 JS 脚本请求。自定义代理模式下也用于脚本仓库的 Git 拉取。网页窗口和云原神网页版跟随系统代理，更新程序不受影响。其他已打开的 BetterGI 实例需要重启后生效。</Text>
  </Expander>;
}

const storageGroups = [
  {label: '缓存', description: '删除后会在需要时重新下载或生成', rows: ['文件缓存', '识别模型编译缓存', '狛荷屋物品图标']},
  {label: '下载', description: '安装包和未完成的下载', rows: ['下载文件']},
  {label: '网页数据', description: '软件内网页和云原神网页版的数据', rows: ['悬浮小窗 · 网页缓存', '悬浮小窗 · 网页数据']},
  {label: '日志与诊断', description: '排查问题用的日志和截图', rows: ['运行日志', '截图', '调试图片']},
  {label: '用户数据', description: '不会被一键清理删除', rows: ['脚本、配置、录制等', '脚本更新备份']},
];
const sizeChoices = [
  {value: '256', label: '256 MB'}, {value: '512', label: '512 MB'}, {value: '1024', label: '1 GB'},
  {value: '2048', label: '2 GB'}, {value: '5120', label: '5 GB'},
];

export function StorageDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  const [limit, setLimit] = useAppValue('settings/storage/file-cache-limit', '1024');
  return <Modal title="存储空间" iconContent={titleIcon} open={open} onChange={onChange} wide width={760} height={680}
    actions={<div className="bgi-hardware-footer">
      <Text variant="caption">清理时会跳过正在使用的文件。用户数据和日志只展示占用，不会被一键清理删除。</Text>
      <Button onClick={() => onChange(false)}>关闭</Button>
    </div>}>
    <div className="bgi-stack">
      <Card title="数据目录" description="未连接本机数据目录" action={<div className="bgi-wrap">
        <Button icon="folder" disabled title={nativeOnly}>打开目录</Button>
        <Button icon="rotate" disabled title={nativeOnly}>重新计算</Button>
      </div>}/>
      <Card title="占用总览" description="连接本机 BetterGI 后显示占用" action={<Text variant="section">—</Text>}>
        <div className="bgi-storage-overview" aria-hidden="true"/>
        <div className="bgi-hardware-footer">
          <Text variant="caption">尚未读取可清理的内容</Text>
          <Button appearance="primary" icon="trash" disabled title={nativeOnly}>一键清理</Button>
        </div>
      </Card>
      {storageGroups.map(group => <Card key={group.label} title={group.label} description={group.description}>
        <SettingsList separated>
          {group.rows.map(label => <SettingsActionRow inline key={label} label={label} action={<>
            <span className="bgi-muted" aria-label="占用未知">—</span>
            <Button disabled title={nativeOnly}>打开</Button>
            {group.label !== '用户数据' && <Button disabled title={nativeOnly}>清理</Button>}
          </>}/>)}</SettingsList>
      </Card>)}
      <Text variant="strong">自动清理</Text>
      <SettingsRow label="文件缓存上限" controlWidth={140}
        description="超过后自动删除最早的缓存，每天检查一次。不包括识别模型编译缓存和下载。"
        control={<Select label="文件缓存上限" options={sizeChoices} value={limit} onValueChange={setLimit}/>}/>
    </div>
  </Modal>;
}

export function AboutDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  return <Modal title="关于" iconContent={titleIcon} open={open} onChange={onChange} width={400} height={300}
    actions={<Button onClick={() => onChange(false)}>关闭</Button>}>
    <div className="bgi-about-content">
      <Text variant="subtitle">BetterGI 更好的原神</Text>
      <div>开源地址：<Link href="https://github.com/babalae/better-genshin-impact">github.com/babalae/better-genshin-impact</Link></div>
      <div>协议：GPLv3</div>
      <div>作者：<Link href="https://github.com/huiyadanli">辉鸭蛋</Link></div>
      <div>文档：<Link href="https://bettergi.com">bettergi.com</Link></div>
      <div>B站账号（视频教程）：<Link href="https://space.bilibili.com/3546777483479879">BetterGI</Link></div>
    </div>
  </Modal>;
}

const sourceOptions = ['自动判断', '国服', '国际服'].map(value => ({value, label: value}));
const gameBindingRows = [
  {id: 'action', label: '动作', children: gameBindings.action},
  {id: 'menu', label: '菜单', children: gameBindings.menu},
];
const initialBindings = new Map([...gameBindings.action, ...gameBindings.menu].map(row => [row.id, row.initial]));

export function GameBindingsDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  const [registry, setRegistry] = useAppValue('settings/game-bindings-source', sourceOptions[0].value);
  const [bindings, setBindings] = useAppValue<Record<string, string>>('settings/game-bindings', {});
  const [selected, setSelected] = useState('');
  return <Modal title="按键绑定设置" iconContent={titleIcon} open={open} onChange={onChange} wide width={800} height={600}>
    <div className="bgi-stack">
      <Text variant="section">按键绑定设置</Text>
      <Text variant="body">此处的按键设置默认对除自动拾取、钓鱼、音游、伐木外的内置功能有效。在设置中打开“启用全局按键映射”可对 JS 脚本、战斗脚本和地图追踪中的简易策略脚本生效。</Text>
      <SettingsActionRow inline label="配置来源" action={<div className="bgi-wrap">
        <Select label="配置来源" width="content" value={registry} options={sourceOptions} onValueChange={setRegistry}/>
        <Button disabled title={nativeOnly}>从注册表读取</Button>
      </div>}/>
      <Tree rows={gameBindingRows} label="原神按键绑定" selected={selected} onSelect={setSelected}
        columns={{name: '动作', fields: ['按键'], render: row => initialBindings.has(row.id) ?
          <KeyField label={row.label} value={bindings[row.id] ?? initialBindings.get(row.id) ?? ''} physical
            onChange={value => setBindings(previous => ({...previous, [row.id]: value}))}/> : null}}/>
    </div>
  </Modal>;
}

export function UpdateSettings() {
  const [expanded, setExpanded] = useState(false);
  const [update, setUpdate] = useState<'stable' | 'alpha'>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [channel, setChannel] = useAppValue('settings/updates/channel', 'github');

  function check(kind: 'stable' | 'alpha') {
    setUpdate(kind);
    setDialogOpen(true);
  }

  return <>
    <Expander title="版本更新" description="检查软件是否有新版本可用" icon="download"
      open={expanded} onChange={setExpanded} action={<Button onClick={() => check('stable')}>检查更新</Button>}>
      <SettingsActionRow inline label="检查是否存在最新测试版"
        description="【测试版】非常不稳定，请谨慎选择更新！"
        action={<Button onClick={() => check('alpha')}>检查更新</Button>}/>
    </Expander>
    <Modal title={update === 'alpha' ? '检查测试版更新' : '版本更新'} iconContent={titleIcon}
      open={dialogOpen} onChange={setDialogOpen} wide width={680} maxHeight={680}
      actions={<div className="bgi-hardware-footer">
        <Link href="https://www.bettergi.com/download.html">手动下载</Link>
        <div className="bgi-actions">
          <Button disabled title={nativeOnly}>不再提示</Button>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
        </div>
      </div>}>
      <div className="bgi-stack">
        <InfoBar title="无法读取本机版本信息" description="检查更新需要连接本机 BetterGI。" tone="info"/>
        <Card title="开源渠道" icon="download" action={<div className="bgi-wrap">
          <Select label="开源渠道" width="content" value={channel} onValueChange={setChannel}
            options={[{value: 'github', label: 'Github'}, {value: 'cnb', label: 'CNB'}]}/>
          <Button appearance="primary" disabled title={nativeOnly}>立即更新</Button>
        </div>}/>
        <Card title="Steambird 服务" description="【国内】普通用户可点此直接更新" icon="cloud"
          action={<Button appearance="primary" disabled title={nativeOnly}>立即更新</Button>}/>
        <Card title="Mirror酱服务" description="【国内】Mirror酱用户可以输入CDK高速更新" icon="cloud"
          action={<div className="bgi-wrap"><Button disabled title={nativeOnly}>修改CDK</Button>
            <Button appearance="primary" disabled title={nativeOnly}>立即更新</Button></div>}/>
      </div>
    </Modal>
  </>;
}

const defaultMask = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: "MiSans", "Microsoft YaHei UI", sans-serif;
      color: rgba(255, 255, 255, 0.9);
    }
    .panel {
      position: absolute;
      left: 20px;
      top: 20px;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.18);
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
    }
  </style>
</head>
<body>
  <div class="panel">BetterGI Custom HTML Mask</div>
</body>
</html>`;
const maskPreviewPolicy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">';

export function HtmlMaskDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  const [saved, setSaved] = useAppValue('settings/html-mask', defaultMask);
  const [draft, setDraft] = useState<string>();
  const [preview, setPreview] = useState(false);
  const {notify, snackbar} = useSnackbar();
  const code = draft ?? saved;

  useLayoutEffect(() => {
    if (open) {
      setPreview(false);
      setDraft(undefined);
    }
  }, [open]);

  return <>
    <Modal title="编辑 HTML 遮罩" iconContent={titleIcon} open={open} onChange={onChange} wide width={900} height={680}
      actions={<>
        <Button onClick={() => {setSaved(code); notify('已保存 HTML', 'success');}}>保存 HTML</Button>
        <Button aria-pressed={preview} onClick={() => setPreview(previous => !previous)}>{preview ? '关闭预览' : '预览 HTML'}</Button>
        <Button onClick={() => setDraft(defaultMask)}>恢复默认 HTML</Button>
        <Button disabled title={nativeOnly}>打开目录</Button>
        <Button onClick={() => onChange(false)}>关闭</Button>
      </>}>
      <div className="bgi-mask-editor bgi-stack">
        <CodeEditor label="HTML 遮罩" language="html" value={code} onChange={setDraft}/>
        {preview && <iframe className="bgi-mask-frame" title="HTML 遮罩预览" sandbox=""
          srcDoc={maskPreviewPolicy + code}/>}
      </div>
    </Modal>
    <Snackbar {...snackbar}/>
  </>;
}
