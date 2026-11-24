import {useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {Button, Field, FontIcon, IconButton, Input, Select, Text, TextArea} from './controls';
import {Expander, SettingsActionRow, SettingsList, SettingsRow} from './collections';
import {useAppValue} from './app-state';
import {ArtifactOcrDialog, ArtifactScriptDialog, TaskRepositoryDialog} from './task-windows';
import {
  area, NativeTaskAction, number, options, pick, TaskRow, TaskRows, text, toggle, useTaskConfig,
  type TaskConfig, type TaskField,
} from './task-fields';
import {CombatFields} from './task-combat';
import {RewardFields} from './task-rewards';
import {nativeTaskIds, taskGlyphs, taskGroups, type TaskDefinition} from './task-definitions';
import {useStandaloneTaskRuntime, type TaskBinding} from './app-task-runtime';
import {BetterGIRequestError, type useBetterGIConnection} from './app-runtime';
import {NativeStrategySource, type Strategy} from './strategy';
import {
  buildRewardInput, nativeRewardFields, NativeRewardSource, rewardScopes, useRewardMaterials, useRewardResin,
  type Material, type NativeRewards, type Resin, type RewardScope,
} from './task-reward-state';
import nativeOptions from './task-options.json';

const wiki = 'https://www.bettergi.com/';
const guides: Partial<Record<TaskDefinition['id'], string>> = {
  genius: 'feats/task/tcg.html', wood: 'feats/task/felling.html', fight: 'feats/task/domain.html',
  domain: 'feats/task/domain.html', stygian: 'feats/task/stygian.html', fishing: 'feats/task/fish.html',
  leyline: 'feats/task/leyline.html', music: 'feats/task/music.html', artifact: 'feats/task/artifactSalvage.html',
  icons: 'dev/getGridIcons.html',
};
const noRuntime = '需要本机 BetterGI 的任务接口';
const wood: TaskField[] = [
  {...toggle('UseWonderlandRefresh', '使用进出千星奇域刷新树木CD', true, '需要确保已解锁并进入过千星奇域'),
    legacy: '使用进出千星奇域刷新树木 CD'},
  number('AutoWoodRoundNum', '循环次数', 0, 0, 99999, '输入 0 则为无限循环，直到手动终止。'),
  {...toggle('WoodCountOcrEnabled', '启用OCR伐木数量限制（需1080P以上分辨率）', false,
    '伐木后识别并累计木材数，达到上限后自动停止。'), legacy: '启用 OCR 伐木数量限制'},
  {...number('AutoWoodDailyMaxCount', '伐木数量上限（原神每日每种木材最多2000）', 2000, 0, 2000,
    '启用伐木数量限制后生效。'), legacy: '伐木数量上限'},
  number('AfterZSleepDelay', '使用小道具后的额外延迟（毫秒）', 0, 0, 10000,
    '可调整延迟，以便看到使用小道具后获得木材的提示。'),
];
const fishing: TaskField[] = [
  number('AutoThrowRodTimeOut', '上钩等待超时时间', 15, 5, 60, '超时后自动提竿，重新识别并选择鱼饵。'),
  number('WholeProcessTimeoutSeconds', '整个任务超时时间', 300, 0, 1800, '超时后强制结束任务。'),
  pick('FishingTimePolicy', '昼夜策略', options(nativeOptions.fishing), '全天', '选择全天、白天、夜晚，或不调整时间。'),
];
const cooking: TaskField[] = [
  number('CheckIntervalMs', '检测间隔（毫秒）', 10, 1, 1000, '每次截图检测的时间间隔，最小 1ms。'),
  toggle('StopTaskWhenRecoverButtonDetected', '自动结束烹饪任务', true,
    '检测到「自动烹饪」按钮后点击并结束当前任务。'),
];
const providers = [
  {value: 'openai', label: 'OpenAI 兼容'}, {value: 'anthropic', label: 'Anthropic'},
  {value: 'fishrelief', label: '发鱼站'},
];

type AvatarDescription = {id: string; label: string; description: string};
function ComboFields({config}: {config: TaskConfig}) {
  const [avatars, setAvatars] = useAppValue<AvatarDescription[]>('tasks/combo/avatar-descriptions', []);
  const provider = config.get('Provider', 'openai');
  return <>
    <TaskRow config={config} field={pick('Provider', 'LLM服务商', providers, 'openai',
      'OpenAI 兼容可指向兼容服务或本机模型，Anthropic 使用官方 Messages API。')}/>
    {provider !== 'fishrelief' && <>
      <TaskRow config={config} field={text('PlanningLlmEndpoint', '服务地址', '',
        '使用 HTTPS；本机 localhost 或 127.0.0.1 除外。Anthropic 使用官方地址时可留空。')}/>
      <SettingsActionRow inline label="模型" action={<>
        <Input aria-label="模型" value={config.get('ModelName', '', '模型')}
          onChange={event => config.set('ModelName', event.currentTarget.value)}/>
        <Button disabled title={noRuntime}>拉取模型列表</Button>
      </>}/>
      <TaskRows config={config} fields={[
        {type: 'secret', key: 'ApiKey', label: 'API 密钥', initial: '', description: '注意保护好密钥。'},
        area('ExtraPrompt', '自定义要求', '追加给 LLM 的自定义要求，留空则不注入。'),
        area('MainPrompt', '主提示词', '当前队伍和元素反应等内容由程序追加。'),
        area('FallbackPrompt', '备用提示词', '当前队伍由程序追加，留空使用默认正文。'),
      ]}/>
      <Text variant="section">自定义角色的战术描述</Text>
      <Text variant="caption">未覆盖的角色使用内置描述。删除一行可恢复内置描述。</Text>
      {avatars.map(item => <div className="bgi-task-avatar" key={item.id}>
        <Select label="角色名称" placeholder="选择角色" options={nativeOptions.avatars.map(label => ({
          label, value: label, disabled: label !== item.label && avatars.some(row => row.label === label),
        }))} value={item.label} onValueChange={label =>
          setAvatars(previous => previous.map(row => row.id === item.id ? {...row, label} : row))}/>
        <TextArea label="战术描述" value={item.description} onChange={description =>
          setAvatars(previous => previous.map(row => row.id === item.id ? {...row, description} : row))}/>
        <IconButton icon="trash" label="删除角色" onClick={() =>
          setAvatars(previous => previous.filter(row => row.id !== item.id))}/>
      </div>)}
      <div><Button icon="plus" onClick={() =>
        setAvatars(previous => [...previous, {id: crypto.randomUUID(), label: '', description: ''}])}>添加角色</Button></div>
    </>}
  </>;
}

function GeniusFields({config, onRepository}: {config: TaskConfig; onRepository: () => void}) {
  return <>
    <SettingsActionRow inline label="选择卡组" description="选择你想要使用的卡组与策略" action={<>
      <Button icon="folder" onClick={onRepository}>脚本仓库</Button>
      <Select label="选择卡组" options={options(nativeOptions.decks)} width="content"
        value={config.get('StrategyName', '1.莫娜砂糖琴')}
        onValueChange={value => config.set('StrategyName', value)}/>
    </>}/>
    <TaskRow config={config} field={number('SleepDelay', '设置延时（毫秒）', 0, 0, 5000,
      '如果操作速度过快，动画未播完，可以增加延时。')}/>
  </>;
}

type TaskAction = (id?: string, title?: string) => ReactNode;

function MusicFields({config, action}: {config: TaskConfig; action: TaskAction}) {
  return <>
    <SettingsActionRow inline label="【乐曲】 演奏单个乐曲" description="进入演奏界面使用；下落模式须选择垂落模式。"
      action={action('auto_music_game', '演奏单个乐曲')}/>
    <SettingsActionRow inline label="【专辑】 全自动完成整个专辑" description="进入专辑界面使用，自动演奏未完成乐曲。"
      action={action('auto_album', '全自动完成整个专辑')}/>
    <TaskRows config={config} fields={[
      toggle('MustCanorusLevel', '【专辑】 自动演奏未达成【大音天籁】的乐曲', false,
        '关闭时跳过已领取奖励的乐曲，开启时仅跳过已经达成大音天籁的乐曲。'),
      pick('MusicLevel', '【专辑】 自动演奏的目标难度选择',
        [{value: '', label: '未指定'}, ...options(['传说', '大师', '困难', '普通', '所有'])], '',
        '选择「所有」将自动演奏全部难度。'),
      toggle('UseCapturePipeline', '音符检测使用截图管线', false, '音符检测走全局截图器，推荐 WGC V2。'),
    ]}/>
  </>;
}

function ArtifactFields({config}: {config: TaskConfig}) {
  const [test, setTest] = useState(false);
  const [script, setScript] = useState(false);
  return <>
    <SettingsActionRow inline label="测试识别效果" description="请先将游戏界面切换至圣遗物分解界面"
      action={<Button onClick={() => setTest(true)}>打开测试窗口</Button>}/>
    <SettingsActionRow inline label="匹配表达式" description="只要满足表达式的圣遗物都会被选中"
      action={<Button onClick={() => setScript(true)}>从脚本仓库复制</Button>}/>
    <Field label="JavaScript 匹配规则"><TextArea label="JavaScript 匹配规则" mono
      value={config.get('JavaScript', '', '匹配表达式')} onChange={value => config.set('JavaScript', value)}/></Field>
    <TaskRows config={config} fields={[
      text('ArtifactSetFilter', '按套装筛选', '', '可填入一个或多个套装内生之花名称，留空则不启用。'),
      pick('MaxArtifactStar', '需要快速分解圣遗物的最高星级', options(['4', '3', '2', '1']), '4',
        '程序会先进行一次快速分解选择。'),
      number('MaxNumToCheck', '最大检查数量', 100, 0, 9999, '达到最大检查数量后停止。'),
      pick('RecognitionFailurePolicy', '识别失败策略', options(nativeOptions.artifactFailures)),
    ]}/>
    <ArtifactOcrDialog open={test} onChange={setTest}/>
    <ArtifactScriptDialog open={script} onChange={setScript} onCopy={value => config.set('JavaScript', value)}/>
  </>;
}

function IconFields({config, action}: {config: TaskConfig; action: TaskAction}) {
  const [screenshots] = useAppValue('settings/开发者功能/启用保存截图', false);
  const canShow = screenshots || config.get('ShowTestControls', false);
  return <>
    <TaskRows config={config} fields={[
      pick('GridName', '界面名称', options(nativeOptions.grid), '养成道具', '不同界面的扫描参数不同。'),
      toggle('StarAsSuffix', '使用星星作为名称后缀', false, '用于区分同名但星数不同的物品。'),
      {...toggle('LvAsSuffix', '使用等级作为名称后缀（待开发）', false), disabled: true},
      number('MaxNumToGet', '最大截取数量', 2147483647, 1, 2147483647, '达到最大截取数量后停止。'),
    ]}/>
    <SettingsActionRow inline label="测试识别效果" description="请先将游戏界面切换至待测试分类界面"
      action={action('grid_icons_accuracy_test', '测试物品图标识别效果')}/>
    {canShow && <SettingsActionRow inline label="数量 OCR 测试" description="将数量 OCR 结果截图保存至本地"
      action={<>
        <Select label="数量 OCR 测试分类" options={options(['养成道具', '食物', '材料', '当前一页'])}
          value={config.get('InventoryCountComparisonTarget', '养成道具')}
          onValueChange={value => config.set('InventoryCountComparisonTarget', value)} width="content"/>
        {action('inventory_count_comparison', '数量 OCR 测试')}
      </>}/>}
  </>;
}

const strategyTasks = new Set<TaskDefinition['id']>(['genius', 'fight', 'domain', 'boss', 'stygian', 'leyline']);

type RewardTaskDraft = {
  scope: RewardScope; entry?: NativeRewards[RewardScope]; resin: Resin; materials: Material[]; star: string; error?: string;
};

function taskBinding(task: TaskDefinition, config: TaskConfig, combat: TaskConfig, id: string, title: string,
  reward?: RewardTaskDraft): TaskBinding {
  const input: NonNullable<TaskBinding['input']> = {};
  const used = new Set<string>();
  const integral = (key: string) => {
    const value = config.values[key];
    if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
    used.add(key);
    return value;
  };
  const string = (key: string) => {
    used.add(key);
    const value = config.values[key];
    return typeof value === 'string' ? value : undefined;
  };
  const bool = (key: string) => {
    used.add(key);
    const value = config.values[key];
    return typeof value === 'boolean' ? value : undefined;
  };
  if (strategyTasks.has(task.id)) {
    used.add('StrategyName');
    const strategyConfig = task.id === 'domain' ? combat : config;
    input.strategyName = strategyConfig.get('StrategyName', task.id === 'genius' ? '1.莫娜砂糖琴' :
      config.get('StrategyName', '根据队伍自动选择'),
      task.id === 'genius' ? '选择卡组' : '选择战斗策略');
  }
  if (task.id === 'wood') {
    input.rounds = integral('AutoWoodRoundNum');
    input.dailyMax = integral('AutoWoodDailyMaxCount');
  }
  if (task.id === 'fishing') input.fishing = {
    wholeProcessSeconds: integral('WholeProcessTimeoutSeconds'), throwRodSeconds: integral('AutoThrowRodTimeOut'),
    policy: string('FishingTimePolicy'), saveScreenshot: bool('SaveScreenshotOnKeyTick'),
  };
  if (task.id === 'artifact') {
    const star = string('MaxArtifactStar');
    input.artifact = {
      star: star === undefined ? undefined : Number(star), javaScript: string('JavaScript'),
      setFilter: string('ArtifactSetFilter'), maxToCheck: integral('MaxNumToCheck'), failurePolicy: string('RecognitionFailurePolicy'),
    };
  }
  if (task.id === 'icons') {
    input.grid = id === 'inventory_count_comparison' ? {target: string('InventoryCountComparisonTarget')}
      : {screen: string('GridName'), limit: integral('MaxNumToGet'), starSuffix: bool('StarAsSuffix')};
    used.add('ShowTestControls');
  }
  let startProblem: string | undefined;
  if (reward?.entry) {
    const result = buildRewardInput(reward.scope, config, reward.entry, reward.resin, reward.materials, reward.star, used);
    input.reward = result.input;
    startProblem = result.error;
  } else if (reward) {
    startProblem = reward.error ?? '尚未读取本机领奖设置，请稍候。';
  }
  const localDraftKeys = task.id === 'combo' ? ['tasks/combo/avatar-descriptions'] : [];
  return {id, title, input, startProblem, localDraftKeys, usesLocalDraft: Object.keys(config.values).some(key => !used.has(key))};
}

function TaskCard({task, combat, renderAction, onRepository, onRecordings}: {
  task: TaskDefinition; combat: TaskConfig; renderAction: (binding: TaskBinding) => ReactNode;
  onRepository: () => void; onRecordings: () => void;
}) {
  const rewards = useContext(NativeRewardSource);
  const scope = rewardScopes.has(task.id) ? task.id as RewardScope : undefined;
  const entry = scope && rewards.settings?.[scope];
  const config = useTaskConfig(task.title, scope && entry ? nativeRewardFields(scope, entry) : undefined);
  const [resin] = useRewardResin(task.id);
  const [materials] = useRewardMaterials(task.id);
  const salvage = useTaskConfig('自动分解圣遗物', {MaxArtifactStar: config.get('MaxArtifactStar', '4')});
  const [open, setOpen] = useState(false);
  const [screenshots] = useAppValue('settings/开发者功能/启用保存截图', false);
  const guide = guides[task.id];
  const reward = scope ? {scope, entry, resin, materials,
    star: salvage.get('MaxArtifactStar', '4', '需要快速分解圣遗物的最高星级'), error: rewards.error} : undefined;
  const taskAction: TaskAction = (id = nativeTaskIds[task.id], title = task.title) =>
    renderAction(taskBinding(task, config, combat, id, title, reward));
  let fields: ReactNode;
  switch (task.id) {
    case 'genius': fields = <GeniusFields config={config} onRepository={onRepository}/>; break;
    case 'wood': fields = <TaskRows config={config} fields={wood}/>; break;
    case 'fight': fields = <CombatFields config={config} onRepository={onRepository} onRecordings={onRecordings}/>; break;
    case 'domain': case 'boss': case 'stygian': case 'leyline':
      fields = <RewardFields scope={task.id} config={config} onRepository={onRepository} onRecordings={onRecordings}/>;
      break;
    case 'fishing': fields = <TaskRows config={config} fields={[
      ...fishing, {...toggle('SaveScreenshotOnKeyTick', '关键帧保存截图（开发者）', false,
        '保存流程关键时刻的截图，需要先启用保存截图功能。'), disabled: !screenshots},
    ]}/>; break;
    case 'music': fields = <MusicFields config={config} action={taskAction}/>; break;
    case 'cook': fields = <TaskRows config={config} fields={cooking}/>; break;
    case 'combo': fields = <ComboFields config={config}/>; break;
    case 'artifact': fields = <ArtifactFields config={config}/>; break;
    case 'redeem': fields = <TaskRow config={config} field={toggle('ClipboardListenerEnabled', '获取剪切板上的兑换码', true,
      '切换到软件界面时，自动提取兑换码并提示。')}/>; break;
    case 'icons': fields = <IconFields config={config} action={taskAction}/>; break;
  }

  const action = task.id === 'music' ? undefined : task.id === 'combo' ? <div className="bgi-wrap">
    <Button disabled title={noRuntime}>测试运行</Button>{taskAction()}
  </div> : taskAction();

  const glyph = taskGlyphs[task.id];
  return <Expander title={task.title} description={task.description || undefined} icon={task.icon}
    iconContent={glyph ? <FontIcon glyph={glyph} family={task.id === 'music' || task.id === 'redeem' ? 'fluent' : 'fgi'}/> : undefined}
    descriptionLink={guide ? {href: wiki + guide, label: '点击查看使用教程'} : undefined}
    open={open} onChange={setOpen} action={action}>
    <SettingsList>{fields}</SettingsList>
  </Expander>;
}

export function StandaloneTasks({navigate, runtime}: {
  navigate: (route: string) => void; runtime: ReturnType<typeof useBetterGIConnection>;
}) {
  const [repository, setRepository] = useState(false);
  const combat = useTaskConfig('自动战斗');
  const operations = useStandaloneTaskRuntime(runtime);
  const {call} = runtime;
  const [rewards, setRewards] = useState<NativeRewards>();
  const [rewardError, setRewardError] = useState<string>();
  useEffect(() => {
    if (!operations.online) {
      setRewards(undefined);
      setRewardError(undefined);
      return;
    }
    const controller = new AbortController();
    void call<NativeRewards>('solo-tasks/reward-settings', {signal: controller.signal}).then(settings => {
      if (!controller.signal.aborted) {setRewards(settings); setRewardError(undefined);}
    }).catch(reason => {
      if (!controller.signal.aborted) setRewardError(reason instanceof BetterGIRequestError && reason.status === 404 ?
        '本机 BetterGI 版本尚未提供领奖设置接口。' : '无法读取本机领奖设置。');
    });
    return () => controller.abort();
  }, [call, operations.online]);
  const loadStrategies = useCallback((signal: AbortSignal) => call<Strategy[]>('solo-tasks/strategies', {signal}), [call]);
  return <div className="bgi-stack bgi-trigger-page">
    <h1>独立任务设置</h1>
    {operations.online && <Text variant="caption">任务沿用本机设置，已接入的网页参数会随本次启动传入。</Text>}
    <NativeStrategySource.Provider value={operations.online ? loadStrategies : undefined}>
      <NativeRewardSource.Provider value={{settings: rewards, error: rewardError}}>
        {taskGroups.map(task => <TaskCard key={task.id} task={task} combat={combat} renderAction={operations.button}
          onRepository={() => setRepository(true)} onRecordings={() => navigate('recordings')}/>)}
      </NativeRewardSource.Provider>
    </NativeStrategySource.Provider>
    <TaskRepositoryDialog open={repository} onChange={setRepository} onOpenLocal={() => navigate('scripts')}/>
    {operations.windows}
  </div>;
}
