import {useState} from 'react';
import {Button, Choice, Input, Link, Select, Switch, Text} from '../../components/controls';
import {SettingsActionRow, SettingsList, SettingsRow} from '../../components/collections';
import {useAppValue} from '../../app/app-state';
import {DiscordTargets, type DiscordTarget} from './discord-targets';

const nativeOnly = '需要连接本机 BetterGI';
const events = [
  {value: 'notify.test', label: '测试通知'},
  {value: 'domain.reward', label: '自动秘境奖励'},
  {value: 'domain.start', label: '自动秘境启动'},
  {value: 'domain.end', label: '自动秘境结束'},
  {value: 'domain.retry', label: '自动秘境重试'},
  {value: 'leyline.start', label: '自动地脉花启动'},
  {value: 'leyline.end', label: '自动地脉花结束'},
  {value: 'leyline.info', label: '自动地脉花详情'},
  {value: 'task.cancel', label: '任务启动'},
  {value: 'task.error', label: '任务错误'},
  {value: 'group.start', label: '配置组启动'},
  {value: 'group.end', label: '配置组结束'},
  {value: 'dragon.start', label: '一条龙启动'},
  {value: 'dragon.end', label: '一条龙结束'},
  {value: 'tcg.start', label: '七圣召唤启动'},
  {value: 'tcg.end', label: '七圣召唤结束'},
  {value: 'album.start', label: '自动音游专辑启动'},
  {value: 'album.end', label: '自动音游专辑结束'},
  {value: 'album.error', label: '自动音游专辑错误'},
  {value: 'daily.reward', label: '检查每日奖励领取状态'},
  {value: 'js.custom', label: 'JS自定义事件'},
  {value: 'js.error', label: 'JS运行时错误'},
  {value: 'autoeat.start', label: '自动吃药启动'},
  {value: 'autoeat.end', label: '自动吃药结束'},
  {value: 'autoeat.info', label: '自动吃药信息'},
];
const emptyTargets: DiscordTarget[] = [];
const discordPrefix = 'notifications/Discord/';
const modeChoices = ['Webhook', '机器人（Bot）'].map(value => ({value, label: value}));
const formatChoices = ['普通消息', '嵌入'].map(value => ({value, label: value}));
const encodingChoices = ['PNG', 'JPEG', 'WebP'].map(value => ({value, label: value}));

export function NotificationEvents() {
  const legacyPrefix = 'notifications/需要通知的事件/';
  const [start] = useAppValue(legacyPrefix + '任务开始', false);
  const [done] = useAppValue(legacyPrefix + '任务完成', false);
  const [error] = useAppValue(legacyPrefix + '任务失败', false);
  const [reward] = useAppValue(legacyPrefix + '检查每日奖励领取状态', false);
  const fallback = [start && 'task.cancel', done && 'group.end', error && 'task.error', reward && 'daily.reward']
    .filter((code): code is string => typeof code === 'string');
  const [selected, setSelected] = useAppValue<string[]>('notifications/events', fallback);
  return <div className="bgi-stack">
    <div>
      <div className="bgi-wrap"><Text variant="strong">需要通知的事件</Text>
        <Link href="https://www.bettergi.com/dev/webhook.html#%E4%BA%8B%E4%BB%B6%E5%88%97%E8%A1%A8">打开文档</Link></div>
      <Text variant="caption">选择需要通知的事件，全部取消选择后按全部通知处理。</Text>
    </div>
    <div className="bgi-wrap">
      <Button onClick={() => setSelected(events.map(({value}) => value))}>全选</Button>
      <Button onClick={() => setSelected([])}>取消选择</Button>
    </div>
    <Text variant="caption">{selected.length ? '已选择 ' + selected.length + ' 项事件' : '当前通知全部事件'}</Text>
    <div className="bgi-notification-events">
      {events.map(({value, label}) => <Choice key={value} label={label} checked={selected.includes(value)}
        onChange={checked => setSelected(previous => checked ? [...previous, value] : previous.filter(item => item !== value))}/>)}
    </div>
  </div>;
}

export function DiscordFields() {
  const [mode, setMode] = useAppValue(discordPrefix + '通知方式', 'Webhook');
  const [url, setUrl] = useAppValue(discordPrefix + 'Webhook 网址', '');
  const [username, setUsername] = useAppValue(discordPrefix + '用户名', '');
  const [avatar, setAvatar] = useAppValue(discordPrefix + '头像网址', '');
  const [format, setFormat] = useAppValue(discordPrefix + '消息格式', '普通消息');
  const [encoding, setEncoding] = useAppValue(discordPrefix + '截图编码', 'PNG');
  const [targets, setTargets] = useAppValue(discordPrefix + 'targets', emptyTargets);
  const [open, setOpen] = useState(false);
  return <>
    <SettingsList separated>
      <SettingsRow label="通知方式" inline description="机器人方式可发到多个频道与私信"
        control={<Select label="通知方式" value={mode} options={modeChoices} onValueChange={setMode}/>}/>
      {mode === 'Webhook' ? <>
        <SettingsRow inline label="Webhook 网址" description="填写 Discord 提供的 Webhook 网址"
          control={<Input aria-label="Webhook 网址" value={url} onChange={event => setUrl(event.currentTarget.value)}/>}/>
        <SettingsRow inline label="用户名" description="为空时使用 Discord 中预先设定的名字"
          control={<Input aria-label="用户名" value={username} onChange={event => setUsername(event.currentTarget.value)}/>}/>
        <SettingsRow inline label="头像网址" description="为空时使用 Discord 中预先设定的头像"
          control={<Input aria-label="头像网址" value={avatar} onChange={event => setAvatar(event.currentTarget.value)}/>}/>
      </> : <>
        <SettingsRow inline label="机器人 Token" description="在 Discord 开发者后台的 Bot 页面复制 Token"
          control={<Input type="password" aria-label="机器人 Token" disabled title={nativeOnly}/>}/>
        <SettingsRow inline label="消息格式" description="机器人可选择纯文本或嵌入卡片"
          control={<Select label="消息格式" options={formatChoices} value={format} onValueChange={setFormat}/>}/>
        <SettingsActionRow inline label="推送目标" description={targets.length ? '已选择 ' + targets.length + ' 个目标' : undefined}
          action={<Button onClick={() => setOpen(true)}>管理目标</Button>}/>
      </>}
      <SettingsRow inline label="截图编码" description="PNG 无损，JPEG 快速压缩，WebP 档案小，按需选择"
        control={<Select label="截图编码" options={encodingChoices} value={encoding} onValueChange={setEncoding}/>}/>
    </SettingsList>
    <DiscordTargets open={open} onChange={setOpen} targets={targets} onSave={setTargets}/>
  </>;
}

export function TelegramProxyFields() {
  const [enabled, setEnabled] = useAppValue('notifications/Telegram/启用代理', false);
  const [address, setAddress] = useAppValue('notifications/Telegram/代理地址', '');
  return <>
    <SettingsRow inline label="启用代理" description="为 Telegram 单独设置代理。关闭时使用「设置 → 网络与代理」。"
      control={<Switch label="启用代理" checked={enabled} showLabel={false} onChange={setEnabled}/>}/>
    {enabled && <SettingsRow inline label="代理地址" description="格式：http://127.0.0.1:7890"
      control={<Input aria-label="代理地址" value={address} onChange={event => setAddress(event.currentTarget.value)}/>}/>}
  </>;
}
