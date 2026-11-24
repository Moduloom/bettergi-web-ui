import {SettingsActionRow, SettingsRow} from '../../components/collections';
import {Slider, Text} from '../../components/controls';
import {
  number, options, pick, StrategyField, TaskRow, TaskRows, TaskSection, TaskSwitch, text, toggle,
  type TaskConfig, type TaskField,
} from './task-fields';

const scheduler = text('ActionSchedulerByCd', '根据技能CD优化出招人员', '',
  '根据填入人或人和cd，来决定当此人元素战技cd未结束时，跳过此人出招，来优化战斗流程，可填入人名或人名数字（用英文逗号分隔），多种用分号分隔，例如：白术；钟离与12。如果人名，则用内置cd检查（或填入数字也小于0），如果是人名和数字，则把数字当做出招cd(秒)。');
const fastCheck: TaskField[] = [
  text('FastCheckParams', '更快触发战斗结束检查参数', '',
    '快速检查战斗结束的参数，填写数字（秒）时距离上次检查超过该时间则触发检查，填写人名时对应角色动作后触发检查。多项时使用分号分隔，格式如5或5;白术;'),
  toggle('CheckAfterSwitchAvatar', '切人后再执行战斗结束检查', false,
    '切人后无需等待上一个动作后摇。目前仅 JSON 策略下生效。'),
];
const endingDelays: TaskField[] = [
  text('CheckEndDelay', '检查战斗结束的延时', '0.4;钟离,1.4;',
    '等待角色动作后摇结束，也可为角色单独指定延时。'),
  text('BeforeDetectDelay', '按键触发后检查延时', '0.4',
    '按切换队伍键后，等待指定时间再检查画面色块。'),
];
const targeting: TaskField[] = [
  toggle('EnableCombatTargeting', '战斗中持续索敌', false, '战斗过程中情况允许时持续尝试面朝敌人'),
  number('LockLostWaitTime', '脱锁等待时间（秒）', .5, 0, 30, '敌人不可见时等待一定时间后开始旋转索敌', .05),
  pick('DamageNumberRecognitionMode', '伤害数字识别模式', options(['禁用', 'OCR识别', '颜色识别']), '颜色识别',
    '血条不可见时可使用伤害数字辅助定位敌人。'),
  number('TargetingDetectionInterval', '索敌识别间隔（毫秒）', 50, 1, 10000, '每次索敌识别之间的间隔时间'),
  toggle('DrawRecognitionResults', '绘制识别结果位置', true, '在遮罩窗口上显示血条、伤害数字等识别结果的边框'),
];
const guardian: TaskField[] = [
  pick('GuardianAvatar', '盾奶位角色在队伍中的位置',
    [{value: '', label: '未指定'}, ...options(['1', '2', '3', '4'])], '', '实时检测盾奶位战技 CD'),
];
const bottom: TaskField[] = [
  {...number('Timeout', '自动战斗超时(秒)', 120, 0, 3600, '到达指定时间后，自动停止战斗'),
    legacy: '自动战斗超时（秒）'},
  toggle('SwimmingEnabled', '游泳检测(自动战斗过程中)', true, '先回战斗节点，失败则去七天神像'),
];

export function RotationRow({config, keyName, speed, description}: {
  config: TaskConfig; keyName: string; speed: string; description: string;
}) {
  const name = '旋转寻找敌人位置';
  const enabled = config.get(keyName, false, name);
  const action = <TaskSwitch config={config} name={keyName} initial={false} label={name} onChange={value =>
    config.apply(value && keyName === 'RotateFindEnemyEnabled' ? {[keyName]: true, SkipFightEndCheckWhenEnemyVisible: false} :
      {[keyName]: value})}/>;
  return <SettingsActionRow inline label={name} description={description} action={<>
    {enabled && <div className="bgi-task-range"><Slider label="旋转速度" min={1} max={13}
      value={config.get(speed, 12)} onChange={value => config.set(speed, value)}/></div>}
    {action}
  </>}/>;
}

function FightEnd({config}: {config: TaskConfig}) {
  const paimon = config.get('PaimonEndCheckEnabled', false, '派蒙辅助检测');
  const rotation = config.get('RotateFindEnemyEnabled', false, '旋转寻找敌人位置');
  return <TaskSection title="自动检测战斗结束" description="检测到战斗已经结束的情况下，停止自动战斗功能" action={<TaskSwitch config={config}
    name="FightFinishDetectEnabled" initial label="自动检测战斗结束"/>}>
    <TaskSection title="更快触发战斗结束检查" description="快速检查战斗结束，完成一轮动作后，如果满足条件，则触发一次战斗结束检查。" action={<TaskSwitch config={config}
      name="FastCheckEnabled" initial={false} label="更快触发战斗结束检查"/>}>
      <TaskRows config={config} fields={fastCheck}/>
    </TaskSection>
    <SettingsRow inline label="敌人可见时跳过战斗结束检查" description="检测到敌人血条时跳过战斗结束检查。与旋转寻找敌人位置互斥。"
      control={<TaskSwitch config={config} name="SkipFightEndCheckWhenEnemyVisible" initial={false}
        label="敌人可见时跳过战斗结束检查" onChange={enabled => config.apply(enabled ?
          {SkipFightEndCheckWhenEnemyVisible: true, RotateFindEnemyEnabled: false} :
          {SkipFightEndCheckWhenEnemyVisible: false})}/>}/>
    <TaskRow config={config} field={{...number('BlockCheckBeforeBattleSeconds', '开战后一段时间阻断战斗结束检查（秒）',
      0, 0, 10, '开战后该时间内直接视为战斗未结束，0 表示不阻断。', .1), spinner: false}}/>
    <TaskRow config={config} field={toggle('PaimonEndCheckEnabled', '派蒙辅助检测', false,
      '按 L 后当派蒙头像可见时，提前结束战斗检测。')}/>
    {paimon && <TaskRow config={config} field={{...number('PaimonEndCheckDelay', '派蒙检测延时（秒）',
      .2, .05, .4, '按 L 后等待该时间再检测派蒙头像。', .05), spinner: false}}/>}
    <RotationRow config={config} keyName="RotateFindEnemyEnabled" speed="RotaryFactor"
      description="检查战斗结束前判断是否需要靠近或旋转寻找敌人。旋转速度建议单次约 360°。"/>
    {rotation && <TaskRows config={config} fields={[
      toggle('CheckBeforeBurst', 'Q前检测', false, '释放 Q 技能前检测是否结束战斗'),
      toggle('IsFirstCheck', '尝试面敌', false, '开战寻敌，战斗尝试面向敌人'),
    ]}/>}
    <TaskRows config={config} fields={endingDelays}/>
  </TaskSection>;
}

export function CombatFields({config, onRepository, onRecordings}: {
  config: TaskConfig; onRepository: () => void; onRecordings: () => void;
}) {
  const drops = config.get('PickDropsAfterFightEnabled', true, '扫描掉落物光柱');
  const kazuha = config.get('KazuhaPickupEnabled', true, '聚集材料动作');
  return <>
    <StrategyField config={config} onRepository={onRepository} onRecordings={onRecordings}/>
    <TaskRow config={config} field={scheduler}/>
    <FightEnd config={config}/>
    <TaskSection title="战斗中视觉识别配置"><TaskRows config={config} fields={targeting}/></TaskSection>
    <TaskSection title="盾奶位角色优先释放技能" description="战斗过程实时检测和释放盾奶位角E战技（空选为关闭此功能）">
      <TaskRows config={config} fields={guardian}/>
      {config.get('GuardianAvatar', '') && <>
        <SettingsActionRow inline label="禁用该角色的战斗策略" description="自动释放E或Q战技" action={<>
          <div className="bgi-wrap"><Text variant="caption">E战技</Text>
            <TaskSwitch config={config} name="GuardianCombatSkip" initial={false} label="E战技"/></div>
          <div className="bgi-wrap"><Text variant="caption">Q爆发</Text>
            <TaskSwitch config={config} name="BurstEnabled" initial={false} label="Q爆发"/></div>
        </>}/>
        <TaskRow config={config} field={toggle('GuardianAvatarHold', '检测盾奶位战技短按或长按，禁用:短按 / 启用:长按', false)}/>
      </>}
    </TaskSection>
    <TaskSection title="战斗后拾取动作" description="战斗后执行的动作便于拾取掉落物">
      <TaskRow config={config} field={toggle('PickDropsAfterFightEnabled', '扫描掉落物光柱', true,
        '战斗结束后旋转视角寻找掉落物光柱并靠近（仅在无万叶和琴时备用）')}/>
      {drops && <TaskRow config={config} field={number('PickDropsAfterFightSeconds', '扫描掉落物光柱最大时长', 15, 0, 120)}/>}
      <TaskRow config={config} field={toggle('KazuhaPickupEnabled', '聚集材料动作', true,
        '战斗结束后，如队伍中有万叶或琴，则执行长 E 聚集材料。')}/>
      {kazuha && <TaskRow config={config} field={toggle('QinDoublePickUp', '二次拾取', false,
        '琴首次拾取为空时重试；万叶会强制再次拾取。')}/>}
      <TaskRow config={config} field={toggle('ExpBasedPickupEnabled', '基于经验值判断拾取(经验值57/58/60，不含传奇120等数字)', false,
        '未能检测到经验值图标时跳过战斗后拾取动作')}/>
    </TaskSection>
    <TaskRows config={config} fields={bottom}/>
  </>;
}
