import {useRef, useState} from 'react';
import {Button, Field, Input, Select, Switch, Text, TextArea} from '../../components/controls';
import {Card, Empty, List, SettingsActionRow, SettingsList, SettingsRow, Tabs, Toolbar} from '../../components/collections';
import {Modal} from '../../components/overlays';
import {FileInput, Image} from '../../components/media';
import {SplitView} from '../../components/panels';
import {SettingRow, type Setting} from '../settings/app-settings';
import {logoSource} from '../../components/app-images';
import {useAppValue} from '../../app/app-state';

type Voice = {id: string; label: string; engine: string; voiceId: string; gpt: string; sovits: string; audio: string; reference: string};
type VoiceRole = {id: string; label: string; aliases: string; corrections: string; voice: string};
const emptyVoices: Voice[] = [];
const emptyRoles: VoiceRole[] = [];
const scope = 'triggers/自动配音/';
const nativeOnly = '需要连接本机 BetterGI';
const engines = [
  {id: 'gpt', label: 'GPT-SoVITS', description: '连接自行启动的 api_v2 服务。声线由 GPT 权重、SoVITS 权重和参考音频组成。'},
  {id: 'vits', label: 'vits-simple-api', description: '支持 VITS 与 BERT-VITS2 文本合成。'},
  {id: 'openai', label: 'OpenAI 兼容语音 API', description: '请填写服务的完整 Base URL。兼容服务可填写自定义 voice ID。'},
  {id: 'voicevox', label: 'VOICEVOX', description: '连接自行启动的引擎，刷新读取 speaker / talk style。'},
];
const options = (labels: readonly string[]) => labels.map(value => ({value, label: value}));
const sections = options(['引擎与声线', '角色', '识别', '高级']);
const toggle = (label: string): Setting => ({type: 'toggle', label, initial: false});
const number = (label: string, initial: number, min: number, max: number, step = 1): Setting =>
  ({type: 'number', label, initial, min, max, step});
const text = (label: string, initial = ''): Setting => ({type: 'text', label, initial});
const choice = (label: string, labels: string[]): Setting => ({type: 'select', label, options: options(labels), initial: labels[0]});
const secret = (label: string): Setting => ({type: 'secret', label, initial: ''});
const engineFields: Record<string, Setting[]> = {
  gpt: [toggle('按句流式合成与增量播放')],
  vits: [secret('API Key'), text('复合声音 ID', 'VITS:0'), text('语言', 'auto'), number('速度倍率', 1, .5, 2, .05)],
  openai: [secret('API Key'), text('模型', 'tts-1'), text('Voice ID', 'alloy'),
    choice('响应格式', ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']), number('速度倍率', 1, .25, 4, .05)],
  voicevox: [number('Style ID', 0, 0, 65535), number('速度倍率', 1, .5, 2, .05), number('音高', 0, -.15, .15, .01)],
};

function FileField({label, value, onChange, accept}: {label: string; value: string; onChange: (value: string) => void; accept: string}) {
  const file = useRef<HTMLInputElement>(null);
  return <Field label={label}><div className="bgi-input-actions">
    <Input aria-label={label} value={value} onChange={event => onChange(event.currentTarget.value)}/>
    <FileInput inputRef={file} accept={accept} onFiles={files => {if (files[0]) onChange(files[0].name);}}/>
    <Button icon="folder" onClick={() => file.current?.click()}>浏览</Button>
  </div></Field>;
}

function VoiceSelect({label, voices, value, onChange}: {label: string; voices: Voice[]; value: string; onChange: (value: string) => void}) {
  return <Select label={label} value={value} onValueChange={onChange} options={[
    {value: '', label: '不指定'}, ...voices.map(voice => ({value: voice.id, label: voice.label})),
  ]}/>;
}

function EngineSettings() {
  const [active, setActive] = useAppValue(scope + '选中引擎', 'gpt');
  const [width, setWidth] = useState(172);
  const [configured, setConfigured] = useAppValue(scope + '默认引擎', 'gpt');
  const [voices, setVoices] = useAppValue(scope + '声线', emptyVoices);
  const [selected, setSelected] = useState('');
  const [sample, setSample] = useState('你好，听得到我说话吗？');
  const engine = engines.find(item => item.id === active) ?? engines[0];
  const visible = voices.filter(voice => voice.engine === engine.id);
  const voice = visible.find(item => item.id === selected) ?? visible[0];
  const [roles] = useAppValue(scope + '角色目录', emptyRoles);
  const [npc] = useAppValue(scope + '默认 NPC 声线', '');
  const [narrator] = useAppValue(scope + '旁白声线', '');
  const [traveler] = useAppValue(scope + '旅行者声线', '');
  const inUse = voice && [npc, narrator, traveler, ...roles.map(role => role.voice)].includes(voice.id);
  const gpt = engine.id === 'gpt';

  function edit(update: Partial<Voice>) {
    if (voice) setVoices(previous => previous.map(item => item.id === voice.id ? {...item, ...update} : item));
  }

  function add() {
    const id = crypto.randomUUID();
    setVoices(previous => [...previous, {id, label: '新声线', engine: engine.id,
      voiceId: '', gpt: '', sovits: '', audio: '', reference: ''}]);
    setSelected(id);
  }

  return <SplitView embedded size={width} onResize={setWidth} start={<List rows={engines.map(item => ({
    id: item.id, label: item.label, detail: configured === item.id ? '默认引擎' : undefined,
  }))} selected={active} onSelect={id => {setActive(id); setSelected('');}}/>} end={<div className="bgi-stack">
    <Toolbar actions={<Button disabled={configured === engine.id} onClick={() => setConfigured(engine.id)}>设为默认引擎</Button>}>
      <Text variant="section">{engine.label}</Text>
    </Toolbar>
    <Text variant="caption">{engine.description}</Text>
    <Card title="服务实例">
      <SettingsList separated>
        {[toggle('使用远程实例'), text('本地 / 默认 Base URL'), text('远程 Base URL'), ...engineFields[engine.id]].map(setting =>
          <SettingRow key={setting.label} storageKey={scope + engine.id + '/' + setting.label} setting={setting}/>)}
        <SettingsActionRow inline label={gpt ? '连接状态' : '服务声音'} action={<Button disabled title={nativeOnly}>
          {gpt ? '测试连接' : '刷新声音列表'}
        </Button>}/>
      </SettingsList>
    </Card>
    <Card title="本引擎的声线" action={<Button icon="plus" onClick={add}>{gpt ? '新增' : '添加为声线'}</Button>}>
      <div className="bgi-stack">
        {visible.length ? <List rows={visible} selected={voice?.id} onSelect={setSelected}/> : <Empty title="暂无声线" icon="volume"/>}
        {voice && <>
          <Field label="显示名称"><Input aria-label="显示名称" value={voice.label} onChange={event => edit({label: event.currentTarget.value})}/></Field>
          {gpt ? <>
            <FileField label="GPT 权重（.ckpt）" accept=".ckpt" value={voice.gpt} onChange={gpt => edit({gpt})}/>
            <FileField label="SoVITS 权重（.pth）" accept=".pth" value={voice.sovits} onChange={sovits => edit({sovits})}/>
            <FileField label="参考音频" accept="audio/*" value={voice.audio} onChange={audio => edit({audio})}/>
            <Field label="参考台词"><TextArea label="参考台词" value={voice.reference} onChange={reference => edit({reference})}/></Field>
          </> : <Field label="声音 ID"><Input aria-label="声音 ID" value={voice.voiceId} onChange={event => edit({voiceId: event.currentTarget.value})}/></Field>}
          <div className="bgi-actions"><Button appearance="danger" disabled={Boolean(inUse)}
            title={inUse ? '请先解除对这条声线的引用' : undefined}
            onClick={() => setVoices(previous => previous.filter(item => item.id !== voice.id))}>删除所选声线</Button></div>
        </>}
      </div>
    </Card>
    <Field label="试听文本"><TextArea label="试听文本" value={sample} onChange={setSample}/></Field>
    <div className="bgi-actions"><Button disabled title={nativeOnly}>试听{gpt ? '选中声线' : '当前引擎声音'}</Button>
      <Button disabled>停止试听</Button></div>
  </div>}/>;
}

function VoiceRoleSettings() {
  const [enabled, setEnabled] = useAppValue(scope + '启用角色声线', false);
  const [voices] = useAppValue(scope + '声线', emptyVoices);
  const [roles, setRoles] = useAppValue(scope + '角色目录', emptyRoles);
  const [defaultVoice, setDefaultVoice] = useAppValue(scope + '默认 NPC 声线', '');
  const [narrator, setNarrator] = useAppValue(scope + '旁白声线', '');
  const [traveler, setTraveler] = useAppValue(scope + '旅行者声线', '');
  const [nicknames, setNicknames] = useAppValue(scope + '旅行者昵称', '');
  const [selected, setSelected] = useState('');
  const role = roles.find(item => item.id === selected) ?? roles[0];

  function edit(update: Partial<VoiceRole>) {
    if (role) setRoles(previous => previous.map(item => item.id === role.id ? {...item, ...update} : item));
  }

  return <div className="bgi-stack">
    <SettingsRow label="启用角色声线" description="开启后按角色分配的声线朗读，未匹配的角色使用默认 NPC 声线。"
      control={<Switch label="启用角色声线" checked={enabled} onChange={setEnabled} showLabel={false}/>}/>
    <SettingsRow label="默认 NPC 声线" control={<VoiceSelect label="默认 NPC 声线" voices={voices} value={defaultVoice} onChange={setDefaultVoice}/>}/>
    <SettingsRow label="旁白声线" description="旁白识别尚未接通。"
      control={<VoiceSelect label="旁白声线" voices={voices} value={narrator} onChange={setNarrator}/>}/>
    <Card title="旅行者"><div className="bgi-stack">
      <Field label="游戏内昵称（一行一个）"><TextArea label="游戏内昵称" value={nicknames} onChange={setNicknames}/></Field>
      <Field label="旅行者声线"><VoiceSelect label="旅行者声线" voices={voices} value={traveler} onChange={setTraveler}/></Field>
    </div></Card>
    <Toolbar actions={<Button icon="plus" onClick={() => {
      const id = crypto.randomUUID();
      setRoles(previous => [...previous, {id, label: '新角色', aliases: '', corrections: '', voice: ''}]);
      setSelected(id);
    }}>添加角色</Button>}><Text variant="strong">角色</Text></Toolbar>
    {roles.length ? <List rows={roles} selected={role?.id} onSelect={setSelected}/> : <Empty title="暂无角色" icon="user"/>}
    {role && <>
      <Field label="正式名称（一行一个）"><TextArea label="正式名称" value={role.label} onChange={label => edit({label})}/></Field>
      <Field label="别名（一行一个）"><TextArea label="别名" value={role.aliases} onChange={aliases => edit({aliases})}/></Field>
      <Field label="识别纠错（一行一个）"><TextArea label="识别纠错" value={role.corrections} onChange={corrections => edit({corrections})}/></Field>
      <Field label="角色声线"><VoiceSelect label="角色声线" voices={voices} value={role.voice} onChange={voice => edit({voice})}/></Field>
      <Field label="角色 ID"><Input aria-label="角色 ID" readOnly value={role.id}/></Field>
      <div className="bgi-actions"><Button appearance="danger" onClick={() => setRoles(previous => previous.filter(item => item.id !== role.id))}>删除</Button></div>
    </>}
  </div>;
}

export function QuestVoiceDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  const [tab, setTab] = useState(sections[0].value);
  const [catalog, setCatalog] = useAppValue(scope + '角色目录文件', '');
  return <Modal title="自动配音设置" open={open} onChange={onChange} width={980} height={780}
    iconContent={<Image src={logoSource} alt="" width={16} height={16}/>}
    actions={<div className="bgi-hardware-footer"><Text variant="caption">修改自动保存。</Text>
      <Button onClick={() => onChange(false)}>关闭</Button></div>}>
    <Tabs label="配音设置" options={sections} value={tab} onChange={setTab}>
      {tab === '引擎与声线' ? <EngineSettings/> : tab === '角色' ? <VoiceRoleSettings/> : tab === '识别' ? <div className="bgi-stack">
        <Card title="OCR" description="直接使用 BetterGI 全局 OCR，模型和推理设备跟随软件设置。"/>
        <SettingRow inline={false} storageKey={scope + '采样间隔（毫秒）'} setting={{...number('采样间隔（毫秒）', 100, 50, 500),
          description: '从截图器已有的画面中按此间隔取样，不另外截图。'}}/>
      </div> : <div className="bgi-stack">
        <Card title="网络超时（秒，对所有引擎生效）"><SettingsList separated>
          {[number('连接超时（秒）', 10, 1, 120), number('请求超时（秒）', 30, 1, 600), number('合成超时（秒）', 120, 1, 600)].map(setting =>
            <SettingRow key={setting.label} storageKey={scope + setting.label} setting={setting}/>)}
        </SettingsList></Card>
        <SettingRow inline={false} storageKey={scope + '找不到角色声线时'} setting={choice('找不到角色声线时', ['改用默认 NPC 声线', '报错'])}/>
        <Card title="角色目录文件"><div className="bgi-stack">
          <FileField label="角色目录文件" accept=".json" value={catalog} onChange={setCatalog}/>
          <Text variant="caption">角色、旅行者和声线保存在这个 JSON 文件中。</Text>
          <div className="bgi-wrap">{['重新加载', '校验', '导入…', '导出…', '新建空目录'].map(label =>
            <Button key={label} disabled title={nativeOnly}>{label}</Button>)}</div>
        </div></Card>
      </div>}
    </Tabs>
  </Modal>;
}
