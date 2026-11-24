import {useState} from 'react';
import {Button, Field, IconButton, NumberField, RadioGroup, Select, Switch, Text} from '../../components/controls';
import {SettingsActionRow, SettingsList, SettingsRow} from '../../components/collections';
import {MessageDialog, Modal} from '../../components/overlays';
import {options, type TaskConfig} from './task-fields';
import {resinProblem, useRewardMaterials, useRewardResin, type Resin} from './task-reward-state';

const classes = [
  {id: 'condensed', label: '浓缩树脂'}, {id: 'original', label: '原粹树脂'},
  {id: 'transient', label: '须臾树脂'}, {id: 'fragile', label: '脆弱树脂'},
] as const;
type ResinKind = (typeof classes)[number]['id'];
const modes = [
  {value: 'exhaust', label: '刷至树脂耗尽', description: '按顺序使用允许的树脂，不足一次领奖时结束'},
  {value: 'count', label: '指定领奖次数', description: '达到次数后结束，树脂不足时提前结束'},
  {value: 'types', label: '按树脂分别指定', description: '每种树脂各领奖指定次数'},
];
const tiers = options(['默认', '优先 40', '仅 20']);

function summary(value: Resin) {
  const selected = classes.filter(kind => value.mode === 'types' ? value.counts[kind.id] : value.allowed[kind.id]);
  const sequence = selected.map(kind => kind.label + (value.mode === 'types' ? ' ' + value.counts[kind.id] + ' 次' : '')).join('、');
  if (!sequence) return '尚未选择可用树脂';
  return value.mode === 'count' ? '指定领奖 ' + value.total + ' 次 · ' + sequence :
    value.mode === 'types' ? sequence : '刷至树脂耗尽 · ' + sequence;
}

export function TaskResinRow({scope, storageKey = scope, disabled}: {scope: string; storageKey?: string; disabled?: boolean}) {
  const [value, setValue] = useRewardResin(scope, storageKey);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<{name: string; action: () => void}>();
  const boss = scope === 'boss';
  const modeOptions = boss ? modes.filter(mode => mode.value !== 'types') : modes;
  const error = resinProblem(scope, draft);

  function changeMode(next: Resin['mode']) {
    const action = () => setDraft(previous => ({...previous, mode: next}));
    if (next === 'exhaust' && (draft.allowed.transient || draft.allowed.fragile)) {
      setConfirm({name: '切换到刷至树脂耗尽', action});
    } else action();
  }

  function allow(kind: ResinKind, next: boolean) {
    const action = () => setDraft(previous => ({...previous, allowed: {...previous.allowed, [kind]: next}}));
    if (draft.mode === 'exhaust' && next && (kind === 'transient' || kind === 'fragile')) {
      setConfirm({name: '使用' + classes.find(item => item.id === kind)?.label, action});
    } else action();
  }

  return <>
    <SettingsActionRow inline label="树脂使用" description={summary(value)}
      action={<Button disabled={disabled} onClick={() => {setDraft(value); setOpen(true);}}>设置</Button>}/>
    <Modal title="树脂使用" open={open} onChange={setOpen} actions={<>
      <Button onClick={() => setOpen(false)}>取消</Button>
      <Button appearance="primary" disabled={Boolean(error)} onClick={() => {setValue(draft); setOpen(false);}}>确定</Button>
    </>}>
      <div className="bgi-stack">
        <Field label="使用方式"><RadioGroup label="使用方式" cards options={modeOptions}
          value={draft.mode} onChange={mode => changeMode(mode as Resin['mode'])}/></Field>
        {draft.mode === 'count' && <SettingsRow inline label="领奖次数" description="只统计成功领取奖励的次数"
          controlWidth={120} control={<NumberField label="领奖次数" min={1} max={999}
            value={draft.total} onChange={total => setDraft({...draft, total})}/>}/>}
        <Text variant="section">{draft.mode === 'types' ? '各树脂领奖次数' : '可用树脂'}</Text>
        <Text variant="caption">{draft.mode === 'types' ? '0 表示不使用此类树脂。' : '按从上到下的顺序使用。'}</Text>
        <SettingsList>
          {classes.map(kind => <SettingsRow key={kind.id} inline label={kind.label}
            description={boss && kind.id === 'condensed' ? '首领讨伐暂不支持浓缩树脂' : undefined}
            controlWidth={draft.mode === 'types' ? 108 : undefined}
            control={draft.mode === 'types' ?
              <NumberField label={kind.label + '领奖次数'} min={0} max={999} value={draft.counts[kind.id]}
                onChange={count => setDraft({...draft, counts: {...draft.counts, [kind.id]: count}})}/> :
              <Switch label={kind.label} showLabel={false} checked={draft.allowed[kind.id]}
                disabled={boss && (kind.id === 'condensed' || kind.id === 'original')}
                onChange={next => allow(kind.id, next)}/>}/>)}
        </SettingsList>
        <SettingsRow inline label="原粹树脂档位" description={boss ? '首领固定使用 40 原粹树脂' : undefined}
          control={<Select label="原粹树脂档位" options={boss ? tiers.slice(0, 1) : tiers}
            value={draft.tier} onValueChange={tier => setDraft({...draft, tier: tier as Resin['tier']})} disabled={boss}/>}/>
        {error ? <p className="bgi-error-text" role="status">{error}</p> : <Text variant="caption">{summary(draft)}</Text>}
      </div>
    </Modal>
    <MessageDialog title={confirm?.name ?? ''} message="刷至树脂耗尽时会持续消耗已选的补充树脂，直到用完。确定继续？"
      tone="warning" open={confirm !== undefined} onChange={next => {if (!next) setConfirm(undefined);}}
      confirm={() => confirm?.action()}/>
  </>;
}

export function TargetMaterials({config, scope, choices, unavailable}: {
  config: TaskConfig; scope: string; choices: readonly string[]; unavailable: string;
}) {
  const [values, setValues] = useRewardMaterials(scope);
  const enabled = config.get('TargetEnabled', false, '按材料数量提前结束');
  const valid = values.filter(value => choices.includes(value.label));
  const addable = choices.find(name => !valid.some(value => value.label === name));
  return <>
    <SettingsRow inline label="按材料数量提前结束" description="达到全部目标后停止任务"
      control={<Switch label="按材料数量提前结束" checked={enabled && choices.length > 0}
        disabled={!choices.length} showLabel={false} onChange={value => config.set('TargetEnabled', value)}/>}/>
    {!choices.length && <Text variant="caption">{unavailable}</Text>}
    {enabled && choices.length > 0 && <div className="bgi-stack">
      {valid.map((value, index) => <div key={value.id} className="bgi-target-material">
        <Select label={'材料 ' + (index + 1)} options={choices.map(name => ({value: name, label: name,
          disabled: name !== value.label && valid.some(other => other.label === name)}))}
          value={value.label} onValueChange={label => setValues(previous =>
            previous.map(other => other.id === value.id ? {...other, label} : other))}/>
        <NumberField label={'材料数量 ' + (index + 1)} value={value.quantity} min={1} max={99999999}
          onChange={quantity => setValues(previous => previous.map(other => other.id === value.id ? {...other, quantity} : other))}/>
        <IconButton icon="trash" label={'删除材料 ' + (index + 1)} onClick={() =>
          setValues(previous => previous.filter(other => other.id !== value.id))}/>
      </div>)}
      <div><Button icon="plus" disabled={!addable} onClick={() => addable && setValues(previous =>
        [...previous, {id: crypto.randomUUID(), label: addable, quantity: 1}])}>添加材料</Button></div>
    </div>}
  </>;
}
