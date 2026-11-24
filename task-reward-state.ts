import {createContext, useContext} from 'react';
import {useAppValue} from './app-state';
import type {TaskConfig} from './task-fields';
import nativeOptions from './task-options.json';

export type RewardScope = 'domain' | 'boss' | 'stygian' | 'leyline';
type Kind = 'condensed' | 'original' | 'transient' | 'fragile';
type Modes = 'exhaust' | 'count' | 'types';
type Tier = '默认' | '优先 40' | '仅 20';
export type Resin = {
  mode: Modes; total: number; tier: Tier;
  allowed: Record<Kind, boolean>; counts: Record<Kind, number>;
};
type NativeResin = {
  mode: 'Exhaust' | 'RunCount' | 'PerType'; runCount: number;
  originalTier: 'Default' | 'Prefer40' | 'Only20'; allowed: Resin['allowed']; counts: Resin['counts'];
};
export type Material = {id: string; label: string; quantity: number};
export type MaterialTarget = {name: string; count: number};
type Scalar = string | number | boolean;
type Fields = Record<string, Scalar>;
type NativeRewardEntry = {resin: NativeResin; fields: Fields; targets: MaterialTarget[]};
export type NativeRewards = Record<RewardScope, NativeRewardEntry>;
export type RewardInput = {
  resin: NativeResin; targets?: MaterialTarget[];
  domain?: Fields; boss?: Fields; stygian?: Fields; leyLine?: Fields;
};

export const NativeRewardSource = createContext<{settings?: NativeRewards; error?: string}>({});
export const rewardScopes = new Set<string>(['domain', 'boss', 'stygian', 'leyline']);
export const trainingGuide = '根据提升指南选择秘境';
export const trainingChoices = ['适量刷取，依靠合成天赋收益补足材料', '充分刷取，直到满足培养计划需求'];
const nativeModes: Record<Modes, NativeResin['mode']> = {exhaust: 'Exhaust', count: 'RunCount', types: 'PerType'};
const nativeTiers: Record<Tier, NativeResin['originalTier']> = {'默认': 'Default', '优先 40': 'Prefer40', '仅 20': 'Only20'};

export function defaultResin(scope: string): Resin {
  return {
    mode: scope === 'leyline' ? 'count' : 'exhaust', total: scope === 'leyline' ? 6 : 1, tier: '默认',
    allowed: {condensed: scope !== 'boss', original: true, transient: false, fragile: false},
    counts: {condensed: 0, original: 0, transient: 0, fragile: 0},
  };
}

export function toNativeResin(value: Resin): NativeResin {
  return {mode: nativeModes[value.mode], runCount: value.total, originalTier: nativeTiers[value.tier],
    allowed: value.allowed, counts: value.counts};
}

export function resinProblem(scope: string, value: Resin): string | undefined {
  if (scope === 'boss') {
    if (value.mode === 'types') return '首领讨伐只按领奖次数控制。';
    if (value.tier !== '默认') return '首领固定使用 40 原粹树脂。';
    if (value.allowed.condensed) return '首领讨伐暂不支持浓缩树脂。';
    if (!value.allowed.original) return '首领讨伐必须开启原粹树脂。';
  }
  if (value.mode === 'types') {
    const counts = Object.values(value.counts);
    if (counts.some(count => !Number.isInteger(count) || count < 0 || count > 999)) return '各树脂领奖次数须为 0–999。';
    if (!counts.some(count => count > 0)) return '请指定至少一种树脂的领奖次数。';
    return;
  }
  if (!Object.values(value.allowed).some(Boolean)) return '请选择至少一种可用树脂。';
  if (value.mode === 'count' && (!Number.isInteger(value.total) || value.total < 1 || value.total > 999))
    return '领奖次数须为 1–999。';
}

export function useRewardResin(scope: string, storageKey = scope) {
  const native = useContext(NativeRewardSource).settings?.[scope as RewardScope]?.resin;
  const [draft, setDraft] = useAppValue<Resin | undefined>('tasks/resin/' + storageKey, undefined);
  const original = native && storageKey === scope ? {
    mode: native.mode === 'RunCount' ? 'count' as const : native.mode === 'PerType' ? 'types' as const : 'exhaust' as const,
    total: native.runCount,
    tier: native.originalTier === 'Prefer40' ? '优先 40' as const : native.originalTier === 'Only20' ? '仅 20' as const : '默认' as const,
    allowed: native.allowed,
    counts: native.counts,
  } : defaultResin(scope);
  return [draft ?? original, setDraft] as const;
}

export function useRewardMaterials(scope: string) {
  const native = useContext(NativeRewardSource).settings?.[scope as RewardScope]?.targets;
  const [draft, setDraft] = useAppValue<Material[] | undefined>('tasks/target-materials/' + scope, undefined);
  const original = native?.map((item, index) => ({id: 'native:' + index, label: item.name, quantity: item.count})) ?? [];
  return [draft ?? original, (change: (previous: Material[]) => Material[]) =>
    setDraft(previous => change(previous ?? original))] as const;
}

function menuValue(name: string, groups: Record<string, string[]>) {
  if (!name) return '/';
  const group = Object.keys(groups).find(key => groups[key].includes(name));
  return (group ?? '') + '/' + name;
}

export function rewardValue(value: string) {
  const slash = value.indexOf('/');
  return slash === -1 ? value : value.slice(slash + 1);
}

export function nativeRewardFields(scope: RewardScope, entry: NativeRewardEntry): Fields {
  const values = Object.fromEntries(Object.entries(entry.fields).map(([key, value]) =>
    [key[0].toUpperCase() + key.slice(1), value]));
  values.TargetEnabled = entry.targets.length > 0;
  if (scope === 'domain') {
    values.DomainSource = values.DomainName === trainingGuide ? '跟随培养计划' : '指定秘境';
    values.DomainName = values.DomainName === trainingGuide ? '/' : menuValue(String(values.DomainName ?? ''), nativeOptions.domains);
    values.TrainingGuideFallbackDomainName = menuValue(String(values.TrainingGuideFallbackDomainName ?? ''), nativeOptions.domains);
    values.TrainingGuideRunPreference = trainingChoices[values.TrainingGuideRunPreference === 1 ? 1 : 0];
  }
  if (scope === 'boss') values.BossName = menuValue(String(values.BossName ?? ''), nativeOptions.bosses);
  if (scope === 'stygian') values.BossNum = String(values.BossNum ?? 1);
  if (!values.StrategyName) values.StrategyName = '根据队伍自动选择';
  return values;
}

export function rewardMaterialChoices(scope: RewardScope, config: TaskConfig): readonly string[] {
  if (scope === 'domain') {
    const name = rewardValue(config.get('DomainName', '/', '秘境名称'));
    return config.get('DomainSource', '指定秘境', '秘境来源') === '跟随培养计划' ? [] :
      (nativeOptions.domainMaterials as Record<string, string[]>)[name] ?? [];
  }
  if (scope === 'boss') {
    const boss = rewardValue(config.get('BossName', '/', '选择首领'));
    return (nativeOptions.bossMaterials as Record<string, string[]>)[boss] ?? [];
  }
  return scope === 'leyline' ?
    config.get('LeyLineOutcropType', '启示之花') === '藏金之花' ? ['摩拉'] : nativeOptions.leylineExp : [];
}

// 旧版草稿每个字段按显示名存储，这些名称保留用于读取旧数据。
const rewardFields: Record<RewardScope, Record<string, string>> = {
  domain: {
    partyName: '自动切换到指定队伍',
    autoArtifactSalvage: '结束后自动分解圣遗物',
    fightEndDelay: '战斗完成后等待时间（秒）',
    shortMovement: '寻找古树时使用小步伐行走（正常用户请不要启用）',
    walkToF: '步行前往开启秘境和领取奖励',
    leftRightMoveTimes: '寻找古树时确认位置左右移动的次数（正常用户不要修改）',
    autoEat: '自动吃药',
    rewardRecognitionEnabled: '启用奖励识别',
    reviveRetryCount: '角色死亡后重试次数',
    trainingGuideCalculateRunsEnabled: '自动计算今日刷取次数',
    trainingGuideCraftingBonusReservePercent: '合成收益预留率',
    trainingGuideRewardRecognitionEnabled: '按领奖结果更新养成库存',
    trainingGuideRewardFailureBudgetEnabled: '识别失败时按固定预算继续',
    trainingGuideLowARAdaptationEnabled: '低冒险等阶适配',
    trainingGuideDiagnosticsEnabled: '培养计划详细诊断',
    trainingGuideFallbackSundaySelectedValue: '周日或限时',
  },
  boss: {
    teamName: '切换队伍', returnToStatueAfterEachRound: '每轮讨伐后返回七天神像',
    rewardRecognitionEnabled: '启用奖励识别', reviveRetryCount: '角色死亡后重试次数', timeout: '自动战斗超时(秒)',
  },
  stygian: {fightTeamName: '指定战斗队伍', autoArtifactSalvage: '结束后自动分解圣遗物'},
  leyline: {
    leyLineOutcropType: '地脉花类型', country: '国家', team: '战斗队伍名称', friendshipTeam: '好感队名称',
    timeout: '战斗超时时间（秒）', scanDropsAfterRewardEnabled: '领取奖励后扫描掉落物光柱', scanDropsAfterRewardSeconds: '领奖后扫描时长（秒）',
    actionSchedulerByCd: '根据技能CD优化出招人员', seekEnemyEnabled: '旋转寻找敌人位置', seekEnemyRotaryFactor: '旋转速度',
    seekEnemyIntervalSeconds: '寻敌间隔（秒）', kazuhaPickupEnabled: '聚集材料动作', qinDoublePickUp: '二次拾取',
  },
};

export function buildRewardInput(scope: RewardScope, config: TaskConfig, entry: NativeRewardEntry,
  resin: Resin, materials: Material[], star: string, used: Set<string>) {
  const fields: Fields = {};
  for (const [key, legacy] of Object.entries(rewardFields[scope])) {
    const property = key[0].toUpperCase() + key.slice(1);
    used.add(property);
    fields[key] = config.get(property, entry.fields[key], legacy);
  }
  if (scope === 'domain') {
    ['DomainName', 'DomainSource', 'TrainingGuideFallbackDomainName', 'TrainingGuideRunPreference'].forEach(key => used.add(key));
    fields.domainName = config.get('DomainSource', '指定秘境', '秘境来源') === '跟随培养计划' ? trainingGuide :
      rewardValue(config.get('DomainName', '/', '秘境名称'));
    fields.trainingGuideFallbackDomainName = rewardValue(config.get('TrainingGuideFallbackDomainName', '/'));
    fields.trainingGuideRunPreference = config.get('TrainingGuideRunPreference', trainingChoices[0], '刷取偏好') === trainingChoices[1] ? 1 : 0;
  }
  if (scope === 'boss') {
    used.add('BossName');
    fields.bossName = rewardValue(config.get('BossName', '/', '选择首领'));
  }
  if (scope === 'stygian') {
    used.add('BossNum');
    fields.bossNum = Number(config.get('BossNum', '1', '指定刷取的战场'));
  }
  if (scope === 'stygian' || scope === 'domain') fields.maxArtifactStar = star;

  const choices = rewardMaterialChoices(scope, config);
  const enabled = choices.length > 0 && config.get('TargetEnabled', false, '按材料数量提前结束');
  used.add('TargetEnabled');
  const targets = enabled ? materials.filter(value => choices.includes(value.label)).map(value =>
    ({name: value.label, count: value.quantity})) : [];
  const targetError = enabled && (!targets.length || targets.some(target =>
    !Number.isInteger(target.count) || target.count < 1 || target.count > 99999999)) ?
    '请先添加有效的材料目标和数量。' : undefined;
  const input: RewardInput = {resin: toNativeResin(resin), [scope === 'leyline' ? 'leyLine' : scope]: fields};
  if (scope !== 'stygian') input.targets = targets;
  return {input, error: resinProblem(scope, resin) ?? targetError};
}
