import {useEffect, useState, type ReactNode} from 'react';
import {Button, Field, IconButton, Input, Link, RadioGroup, Select, Switch, Text, TextArea, type IconName} from '../../components/controls';
import {Expander, SettingsActionRow, SettingsRow, Tabs} from '../../components/collections';
import {Modal} from '../../components/overlays';
import {SettingRow, type Setting} from '../settings/app-settings';
import {useAppValue} from '../../app/app-state';
import {QuestVoiceDialog} from './app-quest-voice';
import hangoutOptions from './trigger-hangout-options.json';

const prefix = 'triggers/';
const options = (labels: string[]) => labels.map(label => ({label, value: label}));
const toggle = (label: string, description: string, initial = false, storageLabel?: string): Setting =>
  ({type: 'toggle', initial, label, description, storageLabel});
const number = (label: string, initial: number, description: string, max = 10000, step = 1): Setting =>
  ({type: 'number', label, initial, description, min: 0, max, step});
const select = (label: string, description: string, labels: string[], storageLabel?: string): Setting =>
  ({type: 'select', initial: labels[0], label, description, options: options(labels), storageLabel});

function TriggerCard({title, description, icon, initial = false, storageKey, children}: {
  title: string; description: string; icon: IconName;
  initial?: boolean; storageKey?: string; children: ReactNode | ((enabled: boolean) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useAppValue(prefix + (storageKey ?? (title + '/启用' + title)), initial);
  return <Expander title={title} description={description} icon={icon} open={open} onChange={setOpen}
    action={<Switch label={'启用' + title} checked={enabled} onChange={setEnabled} showLabel={false}/>}>
    <div className="bgi-settings-list">{typeof children === 'function' ? children(enabled) : children}</div>
  </Expander>;
}

function TriggerFields({scope, fields}: {scope: string; fields: readonly Setting[]}) {
  return <>{fields.map(field => <SettingRow key={field.label} setting={field}
    storageKey={prefix + scope + '/' + (field.storageLabel ?? field.label)}/>)}</>;
}

const pickupModes = [
  {value: '黑名单模式', label: '黑名单模式', description: '除明确设置为“不拾取”的内容外，其余内容均会拾取'},
  {value: '白名单模式', label: '白名单模式', description: '只拾取列表中的文本，其他文本全部忽略', badge: '推荐'},
];
const pickupSettings = [
  select('选择自动拾取文字识别引擎', 'Paddle 可识别所有文字；Yap 可识别部分文字，速度更快。', ['Paddle', 'Yap'], '文字识别引擎'),
  select('自定义拾取按键', '默认为 F，可在 F、E 和 G 之间选择。', ['F', 'E', 'G']),
];
const pickupRuleTabs = [
  {value: 'exclude', label: '不拾取（主要规则）'}, {value: 'pick', label: '拾取（优先放行）'},
];
const whitelistRuleTabs = [
  {value: 'pick', label: '拾取（基础列表）'}, {value: 'exclude', label: '不拾取（排除项）'},
];

type PickupRules = {pick: string; exclude: string; fuzzy: string; enabled: boolean};

function PickupRulesDialog({blacklist, open, onClose}: {blacklist: boolean; open: boolean; onClose: () => void}) {
  const mode = blacklist ? '黑名单' : '白名单';
  const [legacy] = useAppValue(prefix + '自动拾取/' + mode + '规则', '');
  const [rules, setRules] = useAppValue<PickupRules>(prefix + '自动拾取/' + mode + '模式规则', {
    pick: blacklist ? '' : legacy, exclude: blacklist ? legacy : '', fuzzy: '', enabled: !blacklist,
  });
  const [draft, setDraft] = useState(rules);
  const tabs = blacklist ? pickupRuleTabs : whitelistRuleTabs;
  const [tab, setTab] = useState(tabs[0].value);
  useEffect(() => {
    if (!open) return;
    setDraft(rules);
    setTab(tabs[0].value);
  }, [open, rules, tabs]);

  return <Modal title={mode + '模式配置'} open={open} onChange={open => {if (!open) onClose();}}
    actions={<><Button onClick={onClose}>取消</Button>
      <Button appearance="primary" onClick={() => {setRules(draft); onClose();}}>保存</Button></>}>
    <div className="bgi-stack">
      <Text variant="section">{blacklist ? '默认拾取未被排除的内容' : '仅拾取最终列表中的内容'}</Text>
      <Tabs label={mode + '规则'} options={tabs} value={tab} onChange={setTab}/>
      {((blacklist && tab === 'pick') || (!blacklist && tab === 'exclude')) &&
        <Switch label={blacklist ? '启用拾取规则' : '启用不拾取规则'} checked={draft.enabled}
          onChange={enabled => setDraft({...draft, enabled})}/>}
      <Field label={tab === 'pick' ? '拾取' : '精确匹配'} description="每行填写一条完整的 OCR 文本。">
        <TextArea label={tab === 'pick' ? '拾取' : '精确匹配'}
          value={tab === 'pick' ? draft.pick : draft.exclude}
          onChange={value => setDraft({...draft, [tab === 'pick' ? 'pick' : 'exclude']: value})}/>
      </Field>
      {blacklist && tab === 'exclude' && <Field label="模糊匹配" description="每行填写一个关键词。">
        <TextArea label="模糊匹配" value={draft.fuzzy} onChange={fuzzy => setDraft({...draft, fuzzy})}/>
      </Field>}
    </div>
  </Modal>;
}

function Pickup() {
  const [mode, setMode] = useAppValue(prefix + '自动拾取/黑白名单模式', '白名单模式');
  const [rules, setRules] = useState(false);
  const blacklist = mode === '黑名单模式';
  return <TriggerCard title="自动拾取" description="根据选择的名单模式，自动按下 F 拾取/交互" icon="hand" initial>
    <TriggerFields scope="自动拾取" fields={pickupSettings.slice(0, 1)}/>
    <div className="bgi-stack">
      <Text variant="strong">黑白名单模式</Text>
      <Text variant="caption">选择自动拾取的基础行为，两种模式互斥。</Text>
      <RadioGroup label="黑白名单模式" options={pickupModes} value={mode} onChange={setMode} cards/>
    </div>
    <SettingsActionRow inline label={mode + '规则'} description={blacklist ? '配置拾取、不拾取及模糊匹配规则。' : '配置拾取列表和精确不拾取规则。'}
      action={<Button icon="settings" onClick={() => setRules(true)}>配置规则</Button>}/>
    <TriggerFields scope="自动拾取" fields={pickupSettings.slice(1)}/>
    <PickupRulesDialog blacklist open={rules && blacklist} onClose={() => setRules(false)}/>
    <PickupRulesDialog blacklist={false} open={rules && !blacklist} onClose={() => setRules(false)}/>
  </TriggerCard>;
}

const dialogueStart: Setting[] = [
  toggle('启用后台模式（会只用交互键进行剧情）', '游戏保持打开，必要时鼠标会回到游戏窗口。', false, '启用后台模式'),
  toggle('后台剧情结束后自动切回游戏前台', '仅在后台模式下生效。', false, '后台剧情结束后切回游戏前台'),
];
const dialogueRest: Setting[] = [
  toggle('快速跳过对话文本', '关闭后可以听完主线语音。', true),
  toggle('自定义优先对话选项', '优先于下方的选择选项优先级。'),
  {type: 'area', label: '自定义优先选项文本', description: '多个选项用分号或换行分隔。', initial: ''},
  select('选择选项优先级', '进入对话后选择选项的方式。', ['优先选择第一个选项', '随机选择选项', '优先选择最后一个选项', '不选择选项']),
  number('选择对话选项前的延迟（毫秒）', 0, '给对话选项留出阅读时间。'),
  toggle('听完语音后再选择对话选项', '人声检测结束后继续，无法读取游戏声音时使用固定延迟。'),
  toggle('Silero VAD 实时诊断', '持续读取游戏进程音频并调用模型。'),
  number('语音结束检测最大等待（秒）', 30, '超时后继续选择对话选项。', 600),
  {...number('点击对话框确认按钮之前的延迟（毫秒）', 0, '给确认内容留出阅读时间。'), storageLabel: '点击对话框确认前的延迟（毫秒）'},
  toggle('自动提交物品', '自动提交对话所需的物品。', true),
  toggle('自动关闭弹出页', '关闭对话期间出现的弹出页。', true),
  toggle('凯瑟琳 - 自动领取『每日委托』奖励', '在与凯瑟琳对话时领取奖励。', true, '自动领取每日委托奖励'),
  toggle('凯瑟琳 - 自动重新派遣', '领取探索奖励并重新派遣。', true, '自动重新派遣'),
];

function Dialogue() {
  const [pip, setPip] = useAppValue(prefix + '自动剧情/画中画窗口', false);
  const [source, setSource] = useAppValue(prefix + '自动剧情/画中画来源', '60帧模式');
  return <TriggerCard title="自动剧情" description="快速跳过剧情文本、自动选择选项、自动提交物品等" icon="message" initial>
    <TriggerFields scope="自动剧情" fields={dialogueStart}/>
    <SettingsRow inline label="画中画窗口（建议和后台模式同时开启）"
      description="游戏失焦时展示小窗，滚轮缩放，左键返回游戏，右键关闭。"
      control={<div className="bgi-wrap">
        <Select label="画中画来源" value={source} options={options(['60帧模式', '截图器供图'])} onValueChange={setSource}/>
        <Switch label="启用画中画窗口" checked={pip} onChange={setPip} showLabel={false}/>
      </div>}/>
    <TriggerFields scope="自动剧情" fields={dialogueRest}/>
  </TriggerCard>;
}

const hangouts: Record<string, string[]> = hangoutOptions;

function Hangout() {
  const [character, setCharacter] = useAppValue(prefix + '自动邀约/角色', '');
  const [ending, setEnding] = useAppValue(prefix + '自动剧情/选择邀约分支', '');
  return <TriggerCard title="自动邀约" description="自动剧情开启的情况下此功能才会生效，自动选择邀约选项"
    icon="user" storageKey="自动剧情/自动邀约">
    <TriggerFields scope="自动剧情" fields={[toggle('存在跳过按钮时自动点击', '自动点击邀约左上角的跳过按钮。', true)]}/>
    <SettingsRow inline label="选择邀约分支（不支持气泡联想选择）" description="按所选分支的关键词选择邀约选项。"
      control={<div className="bgi-stack">
        <Select label="邀约角色" placeholder="选择角色" value={character} options={options(Object.keys(hangouts))}
          onValueChange={value => {setCharacter(value); setEnding('');}}/>
        <Select label="邀约结局" placeholder="选择结局" value={ending} options={options(hangouts[character] ?? [])}
          onValueChange={setEnding}/>
      </div>}/>
    <TriggerFields scope="自动剧情" fields={[number('选择邀约选项前的延迟（毫秒）', 0, '给阅读邀约选项留出时间。')]}/>
  </TriggerCard>;
}

const styleFields: Setting[] = [
  number('横坐标', 1520, '范围 0–1920。', 1920), number('纵坐标', 245, '范围 0–1080。', 1080),
  number('计时器间隔', 91.2, '范围 0–200。', 200, .1), number('计时器大小', 1, '范围 0–10。', 10, .1),
  ...[['CD ≥ 0.8s 时数字颜色', '#DA4A23FF'], ['CD ≥ 0.8s 时背景颜色', '#FFFFFFFF'],
    ['CD < 0.8s 时数字颜色', '#5DCC17FF'], ['CD < 0.8s 时背景颜色', '#FFFFFFFF']]
    .map(([label, initial]): Setting => ({type: 'text', label, initial, description: '支持 6 位或 8 位 Hex 格式。'})),
];
type CdRule = {id: string; name: string; seconds: string};

function Cooldowns() {
  const [style, setStyle] = useState(false);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useAppValue<CdRule[]>(prefix + '冷却提示/角色 CD 规则', []);
  const [draft, setDraft] = useState(rules);
  return <TriggerCard title="冷却提示" description="在头像旁显示角色元素战技剩余冷却时间" icon="timer">
    <SettingsActionRow inline label="角色 CD 配置" description="为指定的角色设置未识别到 CD 数字时的默认值。"
      action={<Button onClick={() => {setDraft(rules); setOpen(true);}}>前往配置</Button>}/>
    <TriggerFields scope="冷却提示" fields={[
      toggle('使用战技时触发', '开启后使用战技时也会识别。'),
      toggle('冷却为0时隐藏', '倒计时为 0 时隐藏计时器。', false, '冷却为 0 时隐藏'),
    ]}/>
    <Expander title="计时器样式调节" description="调整计时器的横坐标、纵坐标、间隔、大小和颜色"
      icon="sliders" inline open={style} onChange={setStyle}>
      <div className="bgi-settings-list"><TriggerFields scope="冷却提示" fields={styleFields}/></div>
    </Expander>
    <Modal title="角色 CD 配置" open={open} onChange={setOpen}
      actions={<><Button onClick={() => setOpen(false)}>取消</Button>
        <Button appearance="primary" disabled={draft.some(item => item.name.trim() && item.seconds.trim() &&
          (!Number.isFinite(Number(item.seconds)) || Number(item.seconds) < 0))}
          onClick={() => {setRules(draft.filter(item => item.name.trim())); setOpen(false);}}>保存</Button></>}>
      <div className="bgi-stack">
        <Text variant="body">仅填写角色名时，该角色使用默认 CD。</Text>
        {draft.map((item, index) => <div className="bgi-wrap" key={item.id}>
          <Input className="bgi-grow" aria-label={'角色名 ' + (index + 1)} value={item.name}
            onChange={event => setDraft(draft.map(row => row.id === item.id ? {...row, name: event.currentTarget.value} : row))}/>
          <Input className="bgi-grow" aria-label={'CD（秒） ' + (index + 1)} value={item.seconds} type="number" min={0} step="any"
            onChange={event => setDraft(draft.map(row => row.id === item.id ? {...row, seconds: event.currentTarget.value} : row))}/>
          <IconButton icon="trash" label={'删除配置 ' + (index + 1)} onClick={() => setDraft(draft.filter(row => row.id !== item.id))}/>
        </div>)}
        <Button icon="plus" onClick={() => setDraft([...draft, {id: crypto.randomUUID(), name: '', seconds: ''}])}>新增配置</Button>
      </div>
    </Modal>
  </TriggerCard>;
}

const voiceStages = ['对话界面', 'OCR', '角色', '声线', '合成', '播放'];
function QuestVoice() {
  const [settings, setSettings] = useState(false);
  return <TriggerCard title="自动配音（实验性）" description="识别剧情对白的人物和台词，用语音朗读；截图器启动后自动开始，独立任务运行时暂停"
    icon="volume">
    <SettingsRow inline label="状态" description="连接 BetterGI 桌面服务后显示运行状态。"/>
    <div className="bgi-voice-stages" role="group" aria-label="配音处理阶段">
      {voiceStages.map(label => <span key={label}>{label}</span>)}
    </div>
    <SettingsRow inline label="当前" description="尚未识别对白"/>
    <SettingsRow inline label="最近事件" description="暂无最近运行事件"/>
    <div className="bgi-wrap">
      <Button appearance="primary" icon="settings" onClick={() => setSettings(true)}>设置…</Button>
      <Button disabled>校验配置</Button><Button disabled>打开日志</Button><Button disabled>打开日志目录</Button>
    </div>
    <QuestVoiceDialog open={settings} onChange={setSettings}/>
  </TriggerCard>;
}

export function RealtimeTriggers({navigate}: {navigate: (route: string) => void}) {
  const [hotkeyTeleport, setHotkeyTeleport] = useAppValue(prefix + '快速传送/启用快捷键传送', false);
  return <div className="bgi-stack bgi-trigger-page">
    <h1>实时触发的自动化任务设置</h1>
    <Pickup/>
    <Dialogue/>
    <QuestVoice/>
    <Hangout/>
    <TriggerCard title="半自动钓鱼" description="半自动钓鱼需要手动抛竿（全自动钓鱼已迁移至独立任务下）" icon="fish">
      <SettingsRow inline label="全自动钓鱼已迁移至独立任务下"
        description="全自动钓鱼已迁移至独立任务下，请到独立任务页配合快捷键使用"/>
    </TriggerCard>
    <TriggerCard title="自动吃药" description="检测角色红血状态，自动使用便携营养袋回复生命值" icon="pill">
      <TriggerFields scope="自动吃药" fields={[
        number('触发时间间隔（毫秒）', 150, '检查红血或复活状态的时间间隔。'),
        number('吃药时间间隔（毫秒）', 1000, '防止频繁吃药。'),
      ]}/>
    </TriggerCard>
    <TriggerCard title="快速传送" description="在大地图上点击传送点（或列表中有传送点）时，自动点击传送" icon="route">
      <TriggerFields scope="快速传送" fields={[
        number('点击候选列表传送点的间隔时间（毫秒）', 200, '需要根据文字识别耗时调整，太低会导致点击失败。'),
        number('等待右侧传送弹出界面的时间（毫秒）', 50, '不建议低于 80 毫秒，太低可能无法识别按钮。'),
      ]}/>
      <SettingsRow inline label="启用快捷键传送"
        description={<>按下 <Link onActivate={() => navigate('hotkeys')}>[手动触发快速传送触发快捷键]</Link> 后才进行快速传送</>}
        control={<Switch label="启用快捷键传送" checked={hotkeyTeleport} onChange={setHotkeyTeleport} showLabel={false}/>}/>
    </TriggerCard>
    <TriggerCard title="地图遮罩" description="在遮罩窗口中显示大地图位置与标点信息" icon="map">
      {enabled => <TriggerFields scope="地图遮罩"
        fields={[{...toggle('启用小地图遮罩', '在小地图上显示点位。'), disabled: !enabled}]}/>}
    </TriggerCard>
    <Cooldowns/>
  </div>;
}
