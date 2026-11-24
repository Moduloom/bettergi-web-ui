import type {ReactNode} from 'react';
import {CascadingMenuSelect, RadioGroup, Select, Switch} from './controls';
import {SettingsActionRow, SettingsList, SettingsRow} from './collections';
import {
  number, options, pick, StrategyField, TaskRow, TaskRows, TaskSection, text, toggle,
  type TaskConfig, type TaskField, useTaskConfig,
} from './task-fields';
import {RotationRow} from './task-combat';
import {TargetMaterials, TaskResinRow} from './task-resin';
import {rewardMaterialChoices, trainingChoices, type RewardScope} from './task-reward-state';
import nativeOptions from './task-options.json';

const countries = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '挪德卡莱', '至冬'];
const defaultDomain = {value: '/', label: '当前秘境'};
const strategies = {domain: '用于战斗', boss: '仅用于首领讨伐，不覆盖其他策略设置', stygian: '用于战斗', leyline: '用于战斗'};

function choices(data: Record<string, string[]>, name: string) {
  return [{value: '', label: name, options: [{value: '', label: name}]},
    ...Object.entries(data).map(([label, items]) => ({value: label, label, options: options(items)}))];
}
const bossChoices = choices(nativeOptions.bosses, '请选择首领');
const domainChoices = choices(nativeOptions.domains, defaultDomain.label);
const rewardIndices = [{value: '', label: '未指定'}, ...options(['1', '2', '3'])];

function DomainChooser({label, description, config, setting, rewardKey}: {
  label: string; description?: string; config: TaskConfig; setting: string; rewardKey?: string;
}) {
  const value = config.get(setting, defaultDomain.value);
  return <>
    <SettingsRow inline label={label} description={description} controlWidth={220}
      control={<CascadingMenuSelect label={label} groups={domainChoices} value={value}
        placeholder="当前秘境" onChange={next => config.set(setting, next)}/>}/>
    {rewardKey && <SettingsRow inline label="周日或限时" description="选择序号" controlWidth={72}
      control={<Select label={label + '奖励序号'} options={rewardIndices} value={config.get(rewardKey, '')}
        onValueChange={next => config.set(rewardKey, next)}/>}/>}
  </>;
}

function SalvageRow({config}: {config: TaskConfig}) {
  const shared = useTaskConfig('自动分解圣遗物', {MaxArtifactStar: config.get('MaxArtifactStar', '4')});
  const enabled = config.get('AutoArtifactSalvage', false, '结束后自动分解圣遗物');
  return <SettingsActionRow inline label="结束后自动分解圣遗物" description="需要快速分解圣遗物的最高星级"
    action={<>
      <Select label="需要快速分解圣遗物的最高星级" value={shared.get('MaxArtifactStar', '4', '需要快速分解圣遗物的最高星级')}
        options={options(['4', '3', '2', '1'])} onValueChange={value => shared.set('MaxArtifactStar', value)}
        width="content"/>
      <Switch label="结束后自动分解圣遗物" checked={enabled} showLabel={false}
        onChange={next => config.set('AutoArtifactSalvage', next)}/>
    </>}/>;
}

const domainEnd: TaskField[] = [
  number('FightEndDelay', '战斗完成后等待时间（秒）', 5, 0, 120, '战斗结束后，寻找石化古树前等待技能完全结束。', .1),
  toggle('ShortMovement', '寻找古树时使用小步伐行走（正常用户请不要启用）', false, '寻找古树时间过久时可尝试。'),
  toggle('WalkToF', '步行前往开启秘境和领取奖励', true, '开启秘境或领取奖励时无法点击 F 时可尝试。'),
  number('LeftRightMoveTimes', '寻找古树时确认位置左右移动的次数（正常用户不要修改）', 3, 0, 30, '小步伐行走时左右确认位置的次数。'),
  toggle('AutoEat', '自动吃药', false, '请先装备便携营养袋，红血时自动按 Z 吃药。'),
  toggle('RewardRecognitionEnabled', '启用奖励识别', false, '每轮领取后识别奖励名称与数量。'),
  number('ReviveRetryCount', '角色死亡后重试次数', 3, 0, 99, '秘境战斗中角色死亡时重试的次数。'),
];

function TrainingFields({config}: {config: TaskConfig}) {
  const calculate = config.get('TrainingGuideCalculateRunsEnabled', true);
  const updateRewards = config.get('TrainingGuideRewardRecognitionEnabled', true);
  const preference = config.get('TrainingGuideRunPreference', '适量刷取，依靠合成天赋收益补足材料');
  return <div className="bgi-domain-source"><SettingsList>
    <SettingsRow inline label="培养计划设置" description="需求以游戏内养成计划为准，请先把要培养的角色加入养成计划。"/>
    <TaskRows config={config} fields={[
      toggle('TrainingGuideCalculateRunsEnabled', '自动计算今日刷取次数', true,
        '在秘境入口读取培养材料并计算次数；关闭后只刷提升指南中的第一个秘境。'),
      {...pick('TrainingGuideRunPreference', '刷取偏好', options(trainingChoices)), disabled: !calculate},
      {...number('TrainingGuideCraftingBonusReservePercent', '合成收益预留率', 7, 0, 20,
        '默认 7%，可设置 0%～20%。'), disabled: !calculate || preference.startsWith('充分')},
      {...toggle('TrainingGuideRewardRecognitionEnabled', '按领奖结果更新养成库存', true,
        '开启后可按实际领奖结果动态调整刷取次数。'), disabled: !calculate},
      {...toggle('TrainingGuideRewardFailureBudgetEnabled', '识别失败时按固定预算继续', false,
        '开启后按原预规划树脂预算继续。'), disabled: !calculate || !updateRewards},
    ]}/>
    <DomainChooser label="备选秘境" description="培养计划完成或无可刷秘境时使用" config={config}
      setting="TrainingGuideFallbackDomainName" rewardKey="TrainingGuideFallbackSundaySelectedValue"/>
    <TaskRow config={config} field={{...toggle('TrainingGuideLowARAdaptationEnabled', '低冒险等阶适配', false,
      '秘境难度未解锁时自动选择可用难度。'), disabled: !calculate}}/>
    <TaskSection title="开发者工具"><TaskRow config={config}
      field={toggle('TrainingGuideDiagnosticsEnabled', '培养计划详细诊断', false,
        '保存 OCR 原文、匹配分数、判断过程及诊断截图至 User/Diagnostics。')}/></TaskSection>
  </SettingsList></div>;
}

function DomainFields({config}: {config: TaskConfig}) {
  const source = config.get('DomainSource', '指定秘境', '秘境来源');
  const targets = rewardMaterialChoices('domain', config);
  return <>
    <TaskRow config={config} field={text('PartyName', '自动切换到指定队伍', '', '填写游戏内手动设置的队伍名称，留空不切换。')}/>
    <SettingsRow inline label="秘境来源" controlWidth={288}
      description={source === '跟随培养计划' ? '按游戏内养成计划，从提升指南中选择秘境' :
        '传送到选定的秘境刷取；未选择时从当前秘境门口开始'}
      control={<RadioGroup label="秘境来源" inline options={options(['跟随培养计划', '指定秘境'])}
        value={source} onChange={next => config.set('DomainSource', next)}/>}/>
    {source === '跟随培养计划' ? <TrainingFields config={config}/> : <div className="bgi-domain-source">
      <SettingsList separated>
        <DomainChooser label="秘境" description="自动传送到刷取的秘境" config={config} setting="DomainName"/>
        <TargetMaterials scope="domain" config={config} choices={targets} unavailable="当前秘境没有可用的奖励材料，请先选择秘境"/>
      </SettingsList>
    </div>}
    <TaskResinRow scope="domain" disabled={source !== '跟随培养计划' && targets.length > 0 && config.get('TargetEnabled', false)}/>
    <SalvageRow config={config}/>
    <TaskRows config={config} fields={domainEnd}/>
  </>;
}

function BossFields({config}: {config: TaskConfig}) {
  const rewards = rewardMaterialChoices('boss', config);
  return <>
    <SettingsRow label="选择首领" description="部分首领因机制问题未添加" inline controlWidth={288}
      control={<CascadingMenuSelect label="选择首领" groups={bossChoices}
        placeholder="请选择首领" value={config.get('BossName', '/')} onChange={value => config.set('BossName', value)}/>}/>
    <TaskRow config={config} field={text('TeamName', '切换队伍', '', '留空则不更换队伍')}/>
    <TaskResinRow scope="boss" disabled={rewards.length > 0 && config.get('TargetEnabled', false)}/>
    <TaskRows config={config} fields={[
      toggle('ReturnToStatueAfterEachRound', '每轮讨伐后返回七天神像', false, '每次领奖后先回血，再重新前往首领。'),
      toggle('RewardRecognitionEnabled', '启用奖励识别', false, '每轮领取后识别奖励名称与数量。'),
    ]}/>
    <TargetMaterials scope="boss" config={config} choices={rewards} unavailable="当前首领没有可用的奖励材料，请先选择首领"/>
    <TaskRows config={config} fields={[
      {...number('ReviveRetryCount', '角色死亡后重试次数', 3, 0, 99, '角色死亡时，复活后重新讨伐当前首领。'), spinner: false},
      {...number('Timeout', '自动战斗超时(秒)', 240, 0, 3600, '到达指定时间后，自动停止战斗。'), spinner: false},
    ]}/>
  </>;
}

function LeyLineFields({config, strategy}: {config: TaskConfig; strategy: ReactNode}) {
  const seek = config.get('SeekEnemyEnabled', false);
  const pickup = config.get('KazuhaPickupEnabled', true);
  const drops = config.get('ScanDropsAfterRewardEnabled', false);
  return <>
    <TaskRows config={config} fields={[
      pick('LeyLineOutcropType', '地脉花类型', options(['启示之花', '藏金之花'])),
      pick('Country', '国家', options(countries), '蒙德', '按国家选择对应的地脉花。'),
    ]}/>
    {strategy}
    <TaskRow config={config} field={text('ActionSchedulerByCd', '根据技能CD优化出招人员')}/>
    <RotationRow config={config} keyName="SeekEnemyEnabled" speed="SeekEnemyRotaryFactor"
      description="战斗时按设置的间隔尝试靠近或旋转寻找敌人。"/>
    <TaskRows config={config} fields={[
      {...number('SeekEnemyIntervalSeconds', '寻敌间隔（秒）', 1, 1, 60), disabled: !seek},
      toggle('KazuhaPickupEnabled', '聚集材料动作', true, '战斗结束后，可用万叶或琴执行长 E 聚集材料。'),
      {...toggle('QinDoublePickUp', '二次拾取', false), disabled: !pickup},
      toggle('ScanDropsAfterRewardEnabled', '领取奖励后扫描掉落物光柱', false),
      {...number('ScanDropsAfterRewardSeconds', '领奖后扫描时长（秒）', 12, 0, 60, '0 表示不扫描。'), disabled: !drops},
    ]}/>
    <TaskResinRow scope="leyline"/>
    <TargetMaterials scope="leyline" config={config} unavailable="当前地脉花类型没有可用的奖励材料"
      choices={rewardMaterialChoices('leyline', config)}/>
    <TaskRows config={config} fields={[
      text('Team', '战斗队伍名称', '', '进入战斗前切换到该队伍，留空则不切换。'),
      text('FriendshipTeam', '好感队名称', '', '领取奖励前切换到该队伍，留空则不切换。'),
      number('Timeout', '战斗超时时间（秒）', 120, 1, 9999, '到达指定时间后，自动停止战斗。'),
    ]}/>
  </>;
}

export function RewardFields({scope, config, onRepository, onRecordings}: {
  scope: RewardScope; config: TaskConfig; onRepository: () => void; onRecordings: () => void;
}) {
  const combat = useTaskConfig('自动战斗', {StrategyName: config.get('StrategyName', '根据队伍自动选择')});
  const strategy = <StrategyField config={scope === 'domain' ? combat : config} description={strategies[scope]}
    onRepository={onRepository} onRecordings={onRecordings} allowCombo={scope === 'domain'}/>;
  if (scope === 'leyline') return <LeyLineFields config={config} strategy={strategy}/>;
  return <>
    {strategy}
    {scope === 'domain' ? <DomainFields config={config}/> : scope === 'boss' ? <BossFields config={config}/> : <>
      <TaskRows config={config} fields={[
        pick('BossNum', '指定刷取的战场', options(['1', '2', '3']), '1', '从上到下战场一、二、三'),
        text('FightTeamName', '指定战斗队伍', '', '输入预设队伍的名称，留空则不更换队伍。'),
      ]}/>
      <TaskResinRow scope="stygian"/>
      <SalvageRow config={config}/>
    </>}
  </>;
}
