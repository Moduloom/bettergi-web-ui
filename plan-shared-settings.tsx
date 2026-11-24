import {useState, type ReactNode} from 'react';
import {Button, Choice, Field, IconButton, Input, NumberField, SearchField, Select, Switch, Text} from './controls';
import {Empty, List, SettingsList, SettingsRow} from './collections';
import {Modal} from './overlays';
import {SplitView} from './panels';
import {StrategyPicker} from './strategy';
import {parseSettings} from './plan-model';
import {sharedSettingFields, sharedSettingGroups, type SharedSettingCondition, type SharedSettingField} from './shared-setting-fields';

const fieldsById = new Map(sharedSettingFields.map(field => [field.id, field]));
const overwrite = (values: Record<string, unknown>, id: string, value: unknown) => ({...values, [id]: value});
const cooldownModes = [
  {value: 'auto', label: '自动识别'}, {value: 'disabled', label: '不检查 CD'},
  {value: 'rolling', label: '按成功时间顺延'}, {value: 'daily', label: '每日固定时间刷新'},
  {value: 'calendar_days', label: '每隔自然日刷新'}, {value: 'weekly', label: '每周固定时间刷新'},
  {value: 'once', label: '仅执行一次'},
];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, i) => ({value: String(i + 1), label}));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function RouteCooldownField({value, onChange}: {value: unknown; onChange: (value: unknown) => void}) {
  const [open, setOpen] = useState(false);
  const saved = isRecord(value) ? value : {mode: 'auto'};
  const [draft, setDraft] = useState(saved);
  const mode = String(draft.mode ?? 'auto');
  return <>
    <div className="bgi-wrap">
      <Text variant="caption">{cooldownModes.find(item => item.value === saved.mode)?.label ?? '自动识别'}</Text>
      <Button onClick={() => {setDraft(saved); setOpen(true);}}>配置…</Button>
    </div>
    <Modal title="路线 CD" open={open} onChange={setOpen} width={480} actions={<>
      <Button onClick={() => setOpen(false)}>取消</Button>
      <Button appearance="primary" onClick={() => {onChange(draft); setOpen(false);}}>确定</Button>
    </>}>
      <div className="bgi-stack">
        <Field label="刷新规则"><Select label="刷新规则" options={cooldownModes} value={mode}
          onValueChange={mode => setDraft(mode === 'rolling' ? {mode, hours: 24} :
            mode === 'calendar_days' ? {mode, days: 2} : {mode})}/></Field>
        {mode === 'rolling' && <Field label="刷新间隔（小时）"><NumberField label="刷新间隔（小时）"
          min={.1} max={8760} step={.1} value={Number(draft.hours ?? 24)}
          onChange={hours => setDraft(previous => ({...previous, hours}))}/></Field>}
        {mode === 'calendar_days' && <Field label="刷新间隔（天）"><NumberField label="刷新间隔（天）"
          min={1} max={365} value={Number(draft.days ?? 2)}
          onChange={days => setDraft(previous => ({...previous, days}))}/></Field>}
        {mode === 'weekly' && <Field label="刷新星期"><Select label="刷新星期" options={weekdays}
          value={String(draft.reset_weekday ?? 1)} onValueChange={day => setDraft(previous => ({...previous, reset_weekday: Number(day)}))}/></Field>}
        {['daily', 'calendar_days', 'weekly'].includes(mode) && <Field label="刷新小时（服务器时间）">
          <NumberField label="刷新小时（服务器时间）" min={0} max={23} value={Number(draft.reset_hour ?? 4)}
            onChange={reset_hour => setDraft(previous => ({...previous, reset_hour}))}/>
        </Field>}
      </div>
    </Modal>
  </>;
}

function SettingControl({field, value, onChange, disabled}: {
  field: SharedSettingField; value: unknown; onChange: (value: unknown) => void; disabled: boolean;
}) {
  const label = field.label;
  switch (field.kind) {
    case 'toggle': return <Switch label={label} checked={value === true} showLabel={false} disabled={disabled} onChange={onChange}/>;
    case 'strategy': return <StrategyPicker value={String(value ?? '')} onChange={onChange}/>;
    case 'choice': return <Select label={label} value={String(value ?? '')} disabled={disabled}
      options={(field.options ?? []).map(item => ({value: String(item.value), label: item.label}))}
      onValueChange={key => onChange(field.options?.find(item => String(item.value) === key)?.value ?? key)}/>;
    case 'cooldown': return <RouteCooldownField value={value} onChange={onChange}/>;
    case 'number':
    case 'integer':
      if (field.initial === null) return <Input type="number" aria-label={label} disabled={disabled}
        value={value == null ? '' : Number(value)} onChange={event => {
          const next = event.currentTarget.value;
          onChange(next ? Number(next) : null);
        }}/>;
      return <NumberField label={label} value={Number(value)} min={0} max={Number.MAX_SAFE_INTEGER}
        step={field.kind === 'integer' ? 1 : .1} disabled={disabled} onChange={onChange}/>;
    default: return <Input aria-label={label} value={String(value ?? '')} disabled={disabled}
      onChange={event => onChange(event.currentTarget.value)}/>;
  }
}

export function SharedSettingsForm({value, inherited, onChange, compact = false, profileActions}: {
  value: string; inherited?: string; onChange: (value: string) => void; compact?: boolean; profileActions?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [selected, setSelected] = useState('party');
  const [width, setWidth] = useState(176);
  const saved = parseSettings(value) ?? {};
  const inheritedValues = parseSettings(inherited ?? '') ?? {};
  const effective = (id: string) => Object.hasOwn(saved, id) ? saved[id] : Object.hasOwn(inheritedValues, id) ?
    inheritedValues[id] : fieldsById.get(id)?.initial;
  const inheritedValue = (id: string) => Object.hasOwn(inheritedValues, id) ? inheritedValues[id] : fieldsById.get(id)?.initial;
  const matches = (conditions?: readonly SharedSettingCondition[]) => !conditions || conditions.every(condition =>
    condition.values.includes(effective(condition.key) as typeof condition.values[number]) !== Boolean(condition.negate));
  const search = query.trim().toLowerCase();
  const visible = sharedSettingFields.filter(field => (!field.advanced || advanced) && matches(field.visible) &&
    (!overridden || Object.hasOwn(saved, field.id)) && (!search ||
      [field.label, field.description, sharedSettingGroups.find(group => field.id.startsWith(group.id + '.'))?.label]
        .some(item => item?.toLowerCase().includes(search))));
  const sections = sharedSettingGroups.map(group => ({...group,
    fields: visible.filter(field => field.id.startsWith(group.id + '.'))}));
  const active = sections.find(group => group.id === selected && group.fields.length) ?? sections.find(group => group.fields.length);
  const updated = (data: Record<string, unknown>) => onChange(JSON.stringify(data, null, 2));
  const overrides = Object.keys(saved).filter(id => fieldsById.has(id));
  const redundant = overrides.filter(id => JSON.stringify(saved[id]) === JSON.stringify(inheritedValue(id)));

  const rows = active ? <SettingsList separated>{active.fields.map(field => {
    const changed = Object.hasOwn(saved, field.id);
    const enabled = matches(field.enabled);
    const details = [field.description, field.unit && '单位 ' + field.unit, !enabled && field.disabledReason].filter(Boolean).join(' ');
    return <SettingsRow inline key={field.id} label={field.label} description={details}
      control={<div className="bgi-shared-control">
        <SettingControl field={field} value={effective(field.id)} disabled={!enabled}
          onChange={next => updated(overwrite(saved, field.id, next))}/>
        <IconButton icon="rotate" appearance="transparent" label={'恢复继承 ' + field.label}
          disabled={!changed} onClick={() => updated(Object.fromEntries(Object.entries(saved).filter(([id]) => id !== field.id)))}/>
      </div>}/>;
  })}</SettingsList> : <Empty title={overridden ? '没有已修改的共享设置' : '没有匹配的共享设置'}/>;

  return <div className="bgi-stack">
    {profileActions}
    <SearchField label="搜索设置，例如“万叶”“赶路”" value={query} onChange={setQuery}/>
    <div className="bgi-wrap">
      <Choice label="只显示已修改的设置" checked={overridden} onChange={setOverridden}/>
      <Choice label="显示高级设置" checked={advanced} onChange={setAdvanced}/>
    </div>
    {compact ? <>
      <Select label="设置分类" value={active?.id ?? ''} options={sections.filter(group => group.fields.length)
        .map(group => ({value: group.id, label: group.label}))} onValueChange={setSelected}/>
      {rows}
    </> : <SplitView embedded size={width} onResize={setWidth}
      start={<List rows={sections.map(group => ({id: group.id, label: group.label,
        detail: search && group.fields.length ? String(group.fields.length) + ' 项' : undefined}))}
        selected={active?.id} onSelect={setSelected}/>}
      end={<div className="bgi-stack">{active && <Text variant="strong">{active.label}</Text>}{rows}</div>}/>}
    <div className="bgi-actions">
      <Button disabled={!redundant.length} onClick={() => updated(Object.fromEntries(Object.entries(saved)
        .filter(([id]) => !redundant.includes(id))))}>清除与继承值相同的修改</Button>
      <Button disabled={!overrides.length} onClick={() => updated(Object.fromEntries(Object.entries(saved)
        .filter(([id]) => !fieldsById.has(id))))}>恢复全部继承</Button>
    </div>
  </div>;
}
