import {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowUp,
  Bell, BookOpen, Fish, Hand, Map, MessageSquare, Pill, Route, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp,
  Clipboard, Clock, Cloud, Code, Copy, Download, Ellipsis, ExternalLink, FileCode,
  FileText, FolderOpen, Gift, Globe, GripVertical, Image, Info, Layers, List, Maximize, Menu, Moon,
  Minus, Monitor, Music, Package, Pause, Play, Plus, RotateCcw, Search, Settings, SkipBack,
  SkipForward, SlidersHorizontal, Square, Timer, Trash2, User, Volume2, X,
} from 'lucide-react';
import {
  useId, useState, type ButtonHTMLAttributes, type CSSProperties, type FormEventHandler,
  type InputHTMLAttributes, type ReactNode, type Ref,
} from 'react';
import {DropdownMenu, MultiSelectField, OverlayScrollArea, Select as LoomSelect} from 'loom-frame/ui';

import {checkIconDefinition} from './moduloom/icons/src/collections/essential';
import {createIcon} from './moduloom/icons/src/factory';

const CheckIcon = createIcon(checkIconDefinition);

const glyphs = {
  activity: Activity, alert: AlertTriangle, archive: Archive, bell: Bell, book: BookOpen,
  check: CheckIcon, clock: Clock, cloud: Cloud, code: Code, copy: Copy, down: ArrowDown,
  download: Download, ellipsis: Ellipsis, error: AlertCircle, external: ExternalLink, fish: Fish,
  file: FileText, fileCode: FileCode, folder: FolderOpen, gift: Gift, globe: Globe, grip: GripVertical,
  hand: Hand, help: CircleHelp, image: Image, info: Info, layers: Layers, left: ArrowLeft, list: List,
  map: Map, maximize: Maximize, menu: Menu, message: MessageSquare, minus: Minus, monitor: Monitor, moon: Moon, music: Music,
  next: SkipForward, package: Package, pause: Pause, pill: Pill, play: Play, plus: Plus, previous: SkipBack,
  right: ChevronRight, back: ChevronLeft, expand: ChevronDown, collapse: ChevronUp,
  rotate: RotateCcw, route: Route, search: Search, settings: Settings, sliders: SlidersHorizontal, square: Square, stop: Square,
  timer: Timer, trash: Trash2, up: ArrowUp, user: User, volume: Volume2, x: X, clipboard: Clipboard,
};

export type IconName = keyof typeof glyphs;
export type Tone = 'default' | 'primary' | 'transparent' | 'danger' | 'warning' | 'success';
export type Option = {value: string; label: string; disabled?: boolean};

export function Icon({name, size = 18}: {name: IconName; size?: number}) {
  const Glyph = glyphs[name] ?? Info;
  return <Glyph size={size} strokeWidth={1.65} aria-hidden="true" focusable="false"
    className={name === 'check' ? 'bgi-check-glyph' : undefined}/>;
}

export function FontIcon({glyph, size = 19, family = 'fgi'}: {glyph: string; size?: number; family?: 'fgi' | 'fluent'}) {
  return <span aria-hidden="true" className="bgi-font-icon" data-family={family} style={{fontSize: size}}>{glyph}</span>;
}

export function Button({
  appearance = 'default', icon, trailingIcon, children, className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  appearance?: Tone; icon?: IconName; trailingIcon?: IconName; ref?: Ref<HTMLButtonElement>;
}) {
  return <button type="button" {...props}
    className={['bgi-button', className].filter(Boolean).join(' ')}
    data-appearance={appearance}>
    {icon && <Icon name={icon}/>}
    {typeof children === 'string' || typeof children === 'number'
      ? <span className="bgi-button-label">{children}</span> : children}
    {trailingIcon && <Icon name={trailingIcon} size={15}/>}
  </button>;
}

export function IconButton({
  icon, label, ...props
}: Omit<Parameters<typeof Button>[0], 'children' | 'icon' | 'trailingIcon'> & {icon: IconName; label: string}) {
  return <Button {...props} icon={icon} aria-label={label} title={label}
    className={['bgi-icon-button', props.className].filter(Boolean).join(' ')}/>;
}

export type SoloTaskState = 'idle' | 'starting' | 'running' | 'stopping' | 'pending' | 'manage';

export function SoloTaskButton({state = 'idle', active = 0, label, ...props}: Omit<Parameters<typeof Button>[0], 'children'> & {
  state?: SoloTaskState; active?: number; label?: string;
}) {
  const text: Record<SoloTaskState, string> = {
    idle: '启动', starting: '启动中', running: '停止', stopping: '停止中', pending: '处理中…', manage: '管理（' + active + '）',
  };
  const busy = state === 'starting' || state === 'stopping' || state === 'pending';
  return <Button icon={state === 'running' ? 'stop' : state === 'manage' ? 'monitor' : 'play'}
    appearance={state === 'running' ? 'danger' : 'primary'} {...props}
    aria-busy={busy || undefined} disabled={busy || props.disabled}>{label ?? text[state] ?? text.idle}</Button>;
}

export function Text({variant, children}: {
  variant: 'title' | 'section' | 'subtitle' | 'body' | 'strong' | 'caption';
  children: ReactNode;
}) {
  const Tag = variant === 'title' ? 'h1' : variant === 'section' ? 'h2' : 'p';
  return <Tag className={'bgi-text bgi-text--' + variant}>{children}</Tag>;
}

export function Link(props: ({href: string} | {onActivate: () => void}) & {children: ReactNode}) {
  if ('onActivate' in props) {
    return <button type="button" className="bgi-link bgi-link-action" onClick={props.onActivate}>{props.children}</button>;
  }
  const url = /^https?:\/\//i.test(props.href) ? props.href : 'https://www.bettergi.com/';
  return <a className="bgi-link" href={url} target="_blank" rel="noreferrer">{props.children}</a>;
}

export function Badge({children, tone = 'default'}: {
  children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary';
}) {
  return <span className="bgi-badge" data-tone={tone}>{children}</span>;
}

export function Field({label, description, children}: {
  label: string; description?: string; children: ReactNode;
}) {
  const title = useId();
  return <div className="bgi-field" role="group" aria-labelledby={title}>
    <span className="bgi-field-label" id={title}>{label}</span>
    {children}
    {description && <span className="bgi-muted">{description}</span>}
  </div>;
}

export function InputActionRow({children, onSubmit}: {
  children: ReactNode; onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  return onSubmit
    ? <form className="bgi-input-actions" onSubmit={onSubmit}>{children}</form>
    : <div className="bgi-input-actions">{children}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['bgi-input', props.className].filter(Boolean).join(' ')}/>;
}

export function TextArea({label, value, onChange, disabled = false, mono = false}: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean; mono?: boolean;
}) {
  return <OverlayScrollArea areaClassName="bgi-textarea-scroll"
    textarea={<textarea className={'bgi-input bgi-textarea' + (mono ? ' bgi-mono' : '')}
      aria-label={label} rows={4} value={value} disabled={disabled} spellCheck={!mono}
      onChange={event => onChange(event.currentTarget.value)}/>}/>;
}

export function SearchField({label = '搜索', value, onChange, disabled = false}: {
  label?: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <div className="bgi-search">
    <Icon name="search"/>
    <Input aria-label={label} placeholder={label} value={value} disabled={disabled}
      onChange={event => onChange(event.currentTarget.value)}/>
    {value && <IconButton appearance="transparent" label="清空搜索" icon="x"
      disabled={disabled} onClick={() => onChange('')}/>}
  </div>;
}

export function NumberField({label, value, onChange, min = 0, max = 60, step = 1, disabled, spinner = true}: {
  label: string; value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number; disabled?: boolean; spinner?: boolean;
}) {
  const move = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return <div className="bgi-number">
    <Input type="number" aria-label={label} value={value} min={min} max={max} step={step}
      disabled={disabled} onChange={event => {
        const number = event.currentTarget.valueAsNumber;
        if (Number.isFinite(number)) onChange(number);
      }} onBlur={() => move(0)}/>
    {spinner && <div className="bgi-spin">
      <IconButton label="增加" icon="collapse" appearance="transparent"
        disabled={disabled || value >= max} onClick={() => move(step)}/>
      <IconButton label="减少" icon="expand" appearance="transparent"
        disabled={disabled || value <= min} onClick={() => move(-step)}/>
    </div>}
  </div>;
}

export function Switch({label, checked, onChange, disabled, showLabel = true}: {
  label: string; checked: boolean; onChange: (value: boolean) => void;
  disabled?: boolean; showLabel?: boolean;
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label}
    disabled={disabled} className="bgi-switch" onClick={() => onChange(!checked)}>
    <span className="bgi-switch-track"><span/></span>
    {showLabel && <span>{label}</span>}
  </button>;
}

export function Choice({label, checked, onChange, disabled, radio, name, description, badge, card}: {
  label: string; checked: boolean; onChange: (value: boolean) => void;
  disabled?: boolean; radio?: boolean; name?: string;
  description?: string; badge?: string; card?: boolean;
}) {
  const descriptionId = useId();
  return <label className="bgi-choice" data-card={card || undefined}>
    <input type={radio ? 'radio' : 'checkbox'} checked={checked} disabled={disabled}
      name={name} aria-label={label} aria-describedby={description ? descriptionId : undefined}
      onChange={event => onChange(event.currentTarget.checked)}/>
    <span className="bgi-choice-mark" aria-hidden="true">{!radio && <Icon name="check" size={17}/>}</span>
    {card ? <span className="bgi-grow">
      <span className="bgi-wrap bgi-choice-title">{label}{badge && <Badge tone="primary">{badge}</Badge>}</span>
      {description && <span className="bgi-muted" id={descriptionId}>{description}</span>}
    </span> : <span>{label}</span>}
  </label>;
}

export function RadioGroup({label, options, value, onChange, disabled, cards = false, inline = false}: {
  label: string; options: readonly (Option & {description?: string; badge?: string})[]; value: string;
  onChange: (value: string) => void; disabled?: boolean; cards?: boolean; inline?: boolean;
}) {
  const name = useId();
  return <div role="radiogroup" aria-label={label} className={cards ? 'bgi-radio-cards' : inline ? 'bgi-wrap' : 'bgi-stack'}>
    {options.map(option => <Choice key={option.value} radio name={name} label={option.label}
      disabled={disabled || option.disabled} checked={option.value === value} card={cards}
      description={cards ? option.description : undefined} badge={cards ? option.badge : undefined}
      onChange={() => onChange(option.value)}/>)}
  </div>;
}

export function Select(props: Parameters<typeof LoomSelect>[0]) {
  return <LoomSelect fitOptions {...props} className="bgi-select" popoverClassName="bgi-options"
    selectionIndicator={<Icon name="check" size={16}/>}/>;
}

export function MultiSelect(props: Parameters<typeof MultiSelectField>[0]) {
  return <div className="bgi-multi"><MultiSelectField {...props} animatePresence
    chevron={<Icon name="expand" size={15}/>}
    selectionIndicator={<Icon name="check" size={16}/>}/></div>;
}

export function CascadingMenuSelect({label, groups, value, onChange, placeholder}: {
  label: string; groups: readonly (Option & {options: Option[]})[];
  value: string; onChange: (value: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [groupKey, itemKey] = value.split('/');
  const selected = groups.find(group => group.value === groupKey)?.options.find(option => option.value === itemKey);
  return <DropdownMenu open={open} onOpenChange={setOpen} label={label} selectionMode="single"
    panelClassName="bgi-menu" anchorClassName="bgi-cascading-menu-anchor" matchTriggerWidth overlayScroll
    items={[{id: '/', label: placeholder, checked: !itemKey}, ...groups.filter(group => group.value).map(group => ({
      id: group.value, label: group.label, children: group.options.map(option => ({
        id: group.value + '/' + option.value, label: option.label,
        checked: value === group.value + '/' + option.value, disabled: option.disabled,
      })),
    }))]} onSelect={next => {onChange(next); setOpen(false);}}
    trigger={<Button className="bgi-cascading-menu-trigger" aria-label={label}
      trailingIcon="expand">{selected?.label || itemKey || placeholder}</Button>}/>;
}

export function CascadingSelect({label, groups, value, onChange}: {
  label: string; groups: readonly (Option & {options: Option[]})[];
  value: string; onChange: (value: string) => void;
}) {
  const [groupId, item] = value.split('/');
  const group = groups.find(group => group.value === groupId) ?? groups[0];
  return <div className="bgi-cascade" role="group" aria-label={label}>
    <Select label="类别" options={groups} value={group?.value ?? ''} onValueChange={key => {
      const first = groups.find(option => option.value === key)?.options[0]?.value ?? '';
      onChange(key + '/' + first);
    }}/>
    <Select label="项目" options={group?.options ?? []} value={item ?? ''} onValueChange={key => {
      onChange((group?.value ?? '') + '/' + key);
    }}/>
  </div>;
}

const mouseKeys = ['MouseLeftButton', 'MouseMiddleButton', 'MouseRightButton', 'MouseSideButton1', 'MouseSideButton2'];
const modifierKeys: Record<string, string> = {
  ControlLeft: 'LeftCtrl', ControlRight: 'RightCtrl', AltLeft: 'LeftAlt', AltRight: 'RightAlt',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
};

export function KeyField({label, value, onChange, disabled, single = false, physical = false}: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean; single?: boolean; physical?: boolean;
}) {
  return <div className="bgi-number">
    <Input aria-label={label} readOnly value={value} placeholder={physical ? '按下对应按键' : '按下组合键'} disabled={disabled}
      onPointerDown={physical ? event => {
        if (!mouseKeys[event.button] || event.currentTarget !== document.activeElement) return;
        event.preventDefault();
        onChange(mouseKeys[event.button]);
      } : undefined}
      onContextMenu={physical ? event => event.preventDefault() : undefined}
      onKeyDown={event => {
        if (physical && event.key !== 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          const code = event.code;
          const key = modifierKeys[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3) :
            /^Digit[0-9]$/.test(code) ? 'D' + code.slice(5) : code || event.key);
          onChange(key);
          return;
        }
        if (event.key === 'Tab' || event.key === 'Escape') return;
        event.preventDefault();
        if (event.key === 'Delete' || event.key === 'Backspace') return onChange('');
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
        const parts = [
          !single && event.ctrlKey && 'Ctrl', !single && event.altKey && 'Alt', !single && event.shiftKey && 'Shift',
          !single && event.metaKey && 'Win', event.key === ' ' ? 'Space' :
            event.key.length === 1 ? event.key.toUpperCase() : event.key,
        ];
        onChange(parts.filter(Boolean).join(' + '));
      }}/>
    <IconButton appearance="transparent" label="清除按键" icon="x"
      disabled={disabled || !value} onClick={() => onChange('')}/>
  </div>;
}

export function Slider({label, value, onChange, min = 0, max = 100, step = 1, disabled, unit = '', valueText, showValue = true}: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string; valueText?: string; showValue?: boolean;
  disabled?: boolean; onChange: (value: number) => void;
}) {
  const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const style = {'--bgi-slider-progress': fraction * 100 + '%'} as CSSProperties;
  return <div className="bgi-slider">
    <div className="bgi-slider-control" style={style}>
      <input type="range" aria-label={label} aria-valuetext={valueText} min={min} max={max} step={step} value={value}
        disabled={disabled} onChange={event => onChange(event.currentTarget.valueAsNumber)}/>
    </div>
    {showValue && <output>{value}{unit}</output>}
  </div>;
}

export function Progress({label, value, ring = false}: {label: string; value: number | null; ring?: boolean}) {
  const percent = value === null ? null : Math.min(100, Math.max(0, value));
  if (!ring) return <div className="bgi-progress"><span>{label}</span>
    <progress aria-label={label} value={percent ?? undefined} max={100}/>
    {percent !== null && <output>{percent}%</output>}
  </div>;
  return <div className="bgi-ring" role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle className="bgi-ring-track" cx="24" cy="24" r="20"/>
      <circle className="bgi-ring-fill" cx="24" cy="24" r="20" pathLength="100"
        strokeDasharray={(percent ?? 25) + ' 100'}/>
    </svg>
    {percent !== null && <span>{percent}%</span>}
  </div>;
}
