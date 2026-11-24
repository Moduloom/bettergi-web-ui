import {useState, type ReactNode} from 'react';
import {Button, Input, NumberField, RadioGroup, Select, Slider, Switch, TextArea, type Option} from './controls';
import {Expander, SettingsActionRow, SettingsList, SettingsRow} from './collections';
import {useAppValue} from './app-state';
import {StrategyPicker} from './strategy';
import nativeOptions from './task-options.json';

type NativeLayout = {width?: number; minWidth?: number; minimum?: number; maximum?: number; spinner?: boolean};
const layouts: Record<string, Record<string, NativeLayout>> = nativeOptions.layout;

type TaskValue = string | number | boolean;
type KeyValues = Record<string, TaskValue>;
export type TaskConfig = ReturnType<typeof useTaskConfig>;
type Common = {key: string; label: string; description?: string; disabled?: boolean; width?: number; legacy?: string};
export type TaskField = Common & (
  {type: 'toggle'; initial: boolean} |
  {type: 'number' | 'slider'; initial: number; min: number; max: number; step?: number; unit?: string; spinner?: boolean} |
  {type: 'text' | 'area' | 'secret'; initial: string} |
  {type: 'select' | 'radio'; initial: string; options: readonly (Option & {description?: string})[]}
);

export function useTaskConfig(scope: string, native?: KeyValues) {
  const [values, setValues] = useAppValue<KeyValues>('tasks/config/' + scope, {});
  function get<T extends TaskValue>(key: string, fallback: T, legacy?: string): T {
    const stored = values[key];
    if (typeof stored === typeof fallback) return stored as T;
    if (legacy) {
      try {
        const raw = localStorage.getItem('bettergi-ui:app:tasks/' + scope + '/' + legacy);
        const previous: unknown = raw === null ? undefined : JSON.parse(raw);
        if (typeof previous === typeof fallback) return previous as T;
      } catch {}
    }
    const original = native?.[key];
    return typeof original === typeof fallback ? original as T : fallback;
  }
  return {
    get, values,
    layout: layouts[scope] ?? {},
    set: (key: string, value: TaskValue) => setValues(previous => ({...previous, [key]: value})),
    apply: (update: KeyValues) => setValues(previous => ({...previous, ...update})),
  };
}

export const options = (labels: readonly string[]) => labels.map(label => ({value: label, label}));
export const toggle = (key: string, label: string, initial: boolean, description?: string): TaskField =>
  ({type: 'toggle', key, label, initial, description});
export const text = (key: string, label: string, initial = '', description?: string): TaskField =>
  ({type: 'text', key, label, initial, description, width: 288});
export const area = (key: string, label: string, description?: string): TaskField =>
  ({type: 'area', key, label, initial: '', description});
export const number = (key: string, label: string, initial: number, min: number, max: number, description?: string, step = 1): TaskField =>
  ({type: 'number', key, label, initial, min, max, step, description, width: 120});
export const pick = (key: string, label: string, choices: readonly Option[], initial = choices[0]?.value ?? '', description?: string): TaskField =>
  ({type: 'select', key, label, options: choices, initial, description});
export const slider = (key: string, label: string, initial: number, min: number, max: number, unit?: string): TaskField =>
  ({type: 'slider', key, label, initial, min, max, unit, width: 180});

export function TaskRow({config, field}: {config: TaskConfig; field: TaskField}) {
  const {key, label, description, initial, disabled, width} = field;
  const value = config.get(key, initial, field.legacy ?? field.label);
  const layout = config.layout[key];
  const controlWidth = layout?.width ?? (Math.max(width ?? 0, layout?.minWidth ?? 0) || undefined);
  const onChange = (next: TaskValue) => config.set(key, next);
  let control: ReactNode;
  switch (field.type) {
    case 'toggle':
      control = <Switch label={label} checked={Boolean(value)} onChange={onChange} showLabel={false} disabled={disabled}/>;
      break;
    case 'number':
      control = <NumberField label={label} min={layout?.minimum ?? field.min} max={layout?.maximum ?? field.max}
        value={Number(value)} step={field.step} onChange={onChange} disabled={disabled} spinner={layout?.spinner ?? field.spinner}/>;
      break;
    case 'slider':
      control = <Slider label={label} min={layout?.minimum ?? field.min} max={layout?.maximum ?? field.max} value={Number(value)} unit={field.unit}
        onChange={onChange} disabled={disabled}/>;
      break;
    case 'select':
      control = <Select label={label} value={String(value)} options={field.options} onValueChange={onChange} disabled={disabled}/>;
      break;
    case 'radio':
      control = <RadioGroup label={label} value={String(value)} options={field.options} onChange={onChange} disabled={disabled} cards/>;
      break;
    case 'area':
      control = <TextArea label={label} value={String(value)} onChange={onChange} disabled={disabled}/>;
      break;
    case 'secret':
      control = <Input aria-label={label} type="password" disabled title="由本机 BetterGI 管理"/>;
      break;
    default:
      control = <Input aria-label={label} value={String(value)} disabled={disabled}
        onChange={event => onChange(event.currentTarget.value)}/>;
  }
  return <SettingsRow inline label={label} description={description} controlWidth={controlWidth}
    control={control} stacked={field.type === 'area' || field.type === 'radio'}/>;
}

export function TaskRows({config, fields}: {config: TaskConfig; fields: readonly TaskField[]}) {
  return <>{fields.map(field => <TaskRow key={field.key} field={field} config={config}/>)}</>;
}

export function TaskSection({title, description, action, children}: {
  title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Expander inline icon={null} title={title} description={description} open={open} onChange={setOpen} action={action}>
    <SettingsList>{children}</SettingsList>
  </Expander>;
}

export function TaskSwitch({config, name, initial, label, onChange}: {
  config: TaskConfig; name: string; initial: boolean; label: string; onChange?: (enabled: boolean) => void;
}) {
  return <Switch label={label} checked={config.get(name, initial, label)} showLabel={false}
    onChange={onChange ?? (enabled => config.set(name, enabled))}/>;
}

export function StrategyField({config, description = '用于战斗', onRepository, onRecordings, allowCombo = true, setting = 'StrategyName'}: {
  config: TaskConfig; description?: string; onRepository?: () => void; onRecordings?: () => void; allowCombo?: boolean; setting?: string;
}) {
  return <SettingsRow inline label="选择战斗策略" description={description} controlWidth={288}
    control={<StrategyPicker value={config.get(setting, '根据队伍自动选择')}
      onChange={value => config.set(setting, value)}
      onRepository={onRepository} onRecordings={onRecordings}
      allowed={allowCombo ? undefined : ['auto', 'text', 'json', 'recordings']}/>}/>;
}

export function NativeTaskAction({label, description, action}: {label: string; description?: string; action: string}) {
  return <SettingsActionRow inline label={label} description={description}
    action={<Button disabled title="需要本机 BetterGI 的任务接口">{action}</Button>}/>;
}
