import type {IconName} from './controls';

export const taskGroups = [
  {id: 'genius', title: '自动七圣召唤', description: '全自动打牌', icon: 'book'},
  {id: 'wood', title: '自动伐木', description: '装备「王树瑞佑」，通过循环重启游戏刷新并收集木材', icon: 'layers'},
  {id: 'fight', title: '自动战斗', description: '自动执行选择的战斗策略', icon: 'play'},
  {id: 'domain', title: '自动秘境', description: '基于钟离的自动循环刷本', icon: 'package'},
  {id: 'boss', title: '自动首领讨伐', description: '自动传送、战斗并领取奖励', icon: 'play'},
  {id: 'stygian', title: '自动幽境危战', description: '自动传送并进入幽境危战', icon: 'layers'},
  {id: 'fishing', title: '全自动钓鱼（单个鱼塘）', description: '不要携带跟宠！在出现钓鱼 F 按钮的位置启动本任务', icon: 'fish'},
  {id: 'leyline', title: '自动地脉花', description: '自动定位并刷取地脉花', icon: 'map'},
  {id: 'music', title: '自动千音雅集', description: '可以自动演奏单个，也可以全自动完成整个专辑', icon: 'music'},
  {id: 'cook', title: '自动烹饪', description: '在手动烹饪界面运行，自动识别并点击结束烹饪', icon: 'timer'},
  {id: 'combo', title: '自动连招（实验）', description: '', icon: 'activity'},
  {id: 'artifact', title: '自动分解圣遗物', description: '指定匹配表达式逐一筛选分解，支持5星圣遗物', icon: 'archive'},
  {id: 'redeem', title: '自动使用兑换码', description: '自动使用输入的兑换码', icon: 'clipboard'},
  {id: 'icons', title: '截取物品图标（开发者）', description: '需要启用保存截图功能，文件保存在 log/gridIcons', icon: 'image'},
] as const satisfies readonly {id: string; title: string; description: string; icon: IconName}[];

export type TaskDefinition = (typeof taskGroups)[number];

export const nativeTaskIds: Record<TaskDefinition['id'], string> = {
  genius: 'auto_genius_invokation', wood: 'auto_wood', fight: 'auto_fight', domain: 'auto_domain',
  boss: 'auto_boss', stygian: 'auto_stygian_onslaught', fishing: 'auto_fishing', leyline: 'auto_ley_line_outcrop',
  music: 'auto_music_game', cook: 'auto_cook', combo: 'auto_combo_build', artifact: 'auto_artifact_salvage',
  redeem: 'redeem_code', icons: 'get_grid_icons',
};

export const taskGlyphs: Partial<Record<TaskDefinition['id'], string>> = {
  genius: '\uf6d2', wood: '\uf6b2', fight: '\uf71d', domain: '\uf438', boss: '\ue629',
  stygian: '\ue588', fishing: '\ue3a8', leyline: '\uf7ff', cook: '\ue43f', combo: '\uf085',
  artifact: '\uf4bb', icons: '🔧', music: '\uE855', redeem: '\uF1E4',
};
