import {
  useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties,
  type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react';
import {flushSync} from 'react-dom';
import {OverlayScrollArea, VirtualList as LoomVirtualList} from 'loom-frame/ui';
import {Badge, Button, Icon, IconButton, Link, type IconName, type Option} from './controls';
import {duration, renderedRowOffset, retarget, useFlipRows} from './motion';

export type Row = {
  id: string; label: string; detail?: string; number?: number;
  status?: string; group?: string; icon?: IconName;
  recordedAt?: string; expiresAt?: string; source?: string;
  title?: string;
};
export type TreeNode = Row & {children?: readonly TreeNode[]};

export function Card({title, description, icon, action, children, selected, onSelect}: {
  title: string; description?: string; icon?: IconName; action?: ReactNode; children?: ReactNode;
  selected?: boolean; onSelect?: () => void;
}) {
  const content = <>
    {icon && <span className="bgi-card-icon"><Icon name={icon} size={22}/></span>}
    <span className="bgi-grow"><strong>{title}</strong>
      {description && <span className="bgi-muted">{description}</span>}
    </span>
  </>;
  return <section className="bgi-card">
    {onSelect ? <div className="bgi-card-selection" data-selected={selected}>
      <button type="button" className="bgi-card-row bgi-card-trigger" aria-pressed={selected}
        onClick={onSelect}>{content}</button>
      {action && <div className="bgi-card-action">{action}</div>}
    </div> : <div className="bgi-card-row">
      {content}
      {action && <div className="bgi-card-action">{action}</div>}
    </div>}
    {children != null && <div className="bgi-card-content">{children}</div>}
  </section>;
}

type SettingsRowProps = {
  label: string; description?: ReactNode; control?: ReactNode; icon?: IconName;
  stacked?: boolean; inline?: boolean; fitControl?: boolean; controlWidth?: number;
};

export function SettingsRow({label, description, control, icon, stacked = false, inline = false, fitControl, controlWidth}: SettingsRowProps) {
  const id = useId();
  return <div className={inline ? 'bgi-settings-row' : 'bgi-card bgi-settings-row'}
    role="group" aria-labelledby={id} data-stacked={stacked || undefined}
    data-fit-control={fitControl || undefined} data-control-width={controlWidth || undefined}
    style={controlWidth ? {'--bgi-setting-control-width': controlWidth + 'px'} as CSSProperties : undefined}>
    {icon && <span className="bgi-card-icon"><Icon name={icon} size={22}/></span>}
    <div className="bgi-setting-heading"><span id={id}>{label}</span>
      {description && <span className="bgi-muted">{description}</span>}
    </div>
    {control != null && <div className="bgi-setting-control">{control}</div>}
  </div>;
}

export function SettingsActionRow({action, ...row}: Omit<SettingsRowProps, 'control' | 'fitControl' | 'stacked'> & {
  action: ReactNode;
}) {
  return <SettingsRow {...row} control={action} fitControl/>;
}

export function SettingsList({children, separated = false}: {children: ReactNode; separated?: boolean}) {
  return <div className="bgi-settings-list" data-separated={separated || undefined}>{children}</div>;
}

export function Toolbar({children, actions}: {children: ReactNode; actions?: ReactNode}) {
  return <div className="bgi-toolbar">
    {children}
    {actions && <div className="bgi-wrap">{actions}</div>}
  </div>;
}

export function Expander({title, description, descriptionLink, icon = 'settings', iconContent, open, onChange, children, action, inline = false}: {
  title: string; description?: string; descriptionLink?: {href: string; label: string};
  icon?: IconName | null; iconContent?: ReactNode; open: boolean;
  onChange: (open: boolean) => void; children: ReactNode; action?: ReactNode; inline?: boolean;
}) {
  const id = useId();
  const iconGlyph = iconContent ?? (icon && <Icon name={icon} size={22}/>);
  const iconLabel = iconGlyph && <span className="bgi-card-icon">{iconGlyph}</span>;
  return <section className="bgi-card" data-inline={inline || undefined}>
    <div className="bgi-card-expander-header" data-action={action != null || undefined}
      data-link={descriptionLink != null || undefined} data-expanded={open}
      data-bgi-clickable={descriptionLink != null ? '' : undefined}
      onClick={descriptionLink && (event => {
        if (!(event.target instanceof Element) || event.target.closest('button, a, .bgi-card-expander-action')) return;
        onChange(!open);
      })}>
      {descriptionLink ? <div className="bgi-card-row bgi-card-linked-title">
        {iconLabel}
        <div className="bgi-grow">
          <button type="button" className="bgi-card-trigger bgi-card-linked-toggle"
            aria-describedby={id + '-detail'} aria-expanded={open} aria-controls={id} onClick={() => onChange(!open)}>
            <strong>{title}</strong>
            <span className="bgi-expander-arrow" aria-hidden="true"><Icon name="expand"/></span>
          </button>
          <div className="bgi-muted" id={id + '-detail'}>
            {description && <>{description} - </>}<Link href={descriptionLink.href}>{descriptionLink.label}</Link>
          </div>
        </div>
      </div> : <button type="button" className="bgi-card-row bgi-card-trigger"
        aria-expanded={open} aria-controls={id} onClick={() => onChange(!open)}>
        {iconLabel}
        <span className="bgi-grow"><strong>{title}</strong>
          {description && <span className="bgi-muted">{description}</span>}
        </span>
        <span className="bgi-expander-arrow"><Icon name="expand"/></span>
      </button>}
      {action != null && <div className="bgi-card-expander-action">{action}</div>}
    </div>
    <div className="bgi-expansion" data-open={open} id={id} inert={!open} aria-hidden={!open || undefined}>
      <div><div className="bgi-card-content">{children}</div></div>
    </div>
  </section>;
}

export function Tabs({label, options, value, onChange, children}: {
  label: string; options: readonly Option[]; value: string; onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const previous = useRef<{left: number; width: number} | null>(null);
  const active = useRef<Animation | undefined>(undefined);
  const id = useId();
  const currentOption = options.find(option => option.value === value && !option.disabled)
    ?? options.find(option => !option.disabled);

  useLayoutEffect(() => {
    const root = list.current;
    const indicator = marker.current;
    if (!root || !indicator) return;
    const place = (animate: boolean) => {
      const current = root.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!current) {
        indicator.hidden = true;
        return;
      }
      indicator.hidden = false;
      const next = {left: current.offsetLeft + 8, width: Math.max(4, current.offsetWidth - 16)};
      const last = previous.current;
      if (last && next.left === last.left && next.width === last.width) return;
      const transform = new DOMMatrixReadOnly(getComputedStyle(indicator).transform);
      active.current?.cancel();
      indicator.style.left = next.left + 'px';
      indicator.style.width = next.width + 'px';
      previous.current = next;
      const time = duration(indicator, .83);
      if (last && animate && time) {
        active.current = indicator.animate([
          {transform: 'translateX(' + (last.left + transform.m41 - next.left) + 'px) scaleX(' +
            last.width * transform.a / next.width + ')'},
          {transform: 'none'},
        ], {duration: time, easing: 'cubic-bezier(.4,0,.2,1)'});
      }
    };
    place(true);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    for (const tab of root.querySelectorAll('[role=tab]')) observer.observe(tab);
    return () => observer.disconnect();
  }, [currentOption?.value, options]);
  useLayoutEffect(() => () => active.current?.cancel(), []);

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const enabled = options.filter(option => !option.disabled);
    const index = enabled.findIndex(option => option.value === currentOption?.value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
      event.key === 'ArrowRight' ? (index + 1) % enabled.length :
      event.key === 'ArrowLeft' ? (index - 1 + enabled.length) % enabled.length : -1;
    if (next < 0 || !enabled[next]) return;
    event.preventDefault();
    onChange(enabled[next].value);
    list.current?.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')[next]?.focus();
  }

  return <div className="bgi-tabs">
    <OverlayScrollArea horizontal areaClassName="bgi-tab-scroll">
    <div className="bgi-tab-list" ref={list} role="tablist" aria-label={label}>
      {options.map(option => <button key={option.value} type="button" role="tab"
        id={id + '-' + option.value} aria-selected={option.value === currentOption?.value}
        aria-controls={children ? id + '-panel' : undefined}
        tabIndex={option.value === currentOption?.value ? 0 : -1}
        disabled={option.disabled} onClick={() => onChange(option.value)} onKeyDown={move}>
        {option.label}
      </button>)}
      <span aria-hidden="true" className="bgi-tab-indicator" ref={marker}/>
    </div>
    </OverlayScrollArea>
    {children && <div role="tabpanel" id={id + '-panel'} tabIndex={0}
      aria-labelledby={id + '-' + currentOption?.value} className="bgi-tab-panel">{children}</div>}
  </div>;
}

type NavigationItem = Option & {icon: IconName; expanded?: boolean; children?: readonly (Option & {icon: IconName})[]};

export function Navigation({items, value, onChange, compact, label = 'BetterGI 导航'}: {
  items: readonly NavigationItem[];
  value: string; onChange: (value: string) => void; compact?: boolean; label?: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const hasSelection = items.some(item => item.value === value ||
    item.expanded && item.children?.some(child => child.value === value));

  useLayoutEffect(() => {
    const root = nav.current;
    const marker = indicator.current;
    const current = root?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!root || !marker || !current) return;

    const place = () => {
      marker.style.height = current.offsetHeight + 'px';
      marker.style.translate = '0 ' + current.offsetTop + 'px';
      if (!marker.dataset.ready) {
        // Settle the initial position before enabling transitions.
        marker.getBoundingClientRect();
        marker.dataset.ready = 'true';
      }
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(root);
    resize.observe(current);
    return () => resize.disconnect();
  }, [items, value]);

  function renderButton(item: NavigationItem, nested = false) {
    return <button type="button" key={item.value} disabled={item.disabled}
      title={compact ? item.label : undefined} aria-label={item.label}
      aria-current={item.value === value ? 'page' : undefined}
      aria-expanded={item.expanded} data-nested={nested || undefined}
      onClick={() => onChange(item.value)}>
      <Icon name={item.icon}/>{!compact && <span>{item.label}</span>}
      {item.expanded !== undefined && !compact &&
        <span className="bgi-nav-disclosure"><Icon name="expand" size={14}/></span>}
    </button>;
  }

  return <nav ref={nav} aria-label={label} className="bgi-navigation" data-compact={compact}>
    <span ref={indicator} className="bgi-navigation-indicator" aria-hidden="true" hidden={!hasSelection}/>
    {items.map(item => item.children ? <div className="bgi-nav-group" key={item.value}>
      {renderButton(item)}
      <div className="bgi-expansion" data-open={item.expanded} inert={!item.expanded} aria-hidden={!item.expanded || undefined}>
        <div><div className="bgi-nav-children">{item.children.map(child => renderButton(child, true))}</div></div>
      </div>
    </div> : renderButton(item))}
  </nav>;
}

export function Empty({title, description, icon = 'archive', action, artwork}: {
  title: string; description?: string; icon?: IconName; action?: ReactNode; artwork?: ReactNode;
}) {
  return <div className="bgi-empty" data-artwork={artwork != null || undefined}>
    {artwork ?? <Icon name={icon} size={28}/>}
    <strong>{title}</strong>
    {description && <span className="bgi-muted">{description}</span>}
    {action}
  </div>;
}

function RowContent({row}: {row: Row}) {
  return <>
    {row.icon && <Icon name={row.icon}/>}
    <span className="bgi-grow"><span className="bgi-truncate">{row.label}</span>
      {row.detail && <small className="bgi-muted bgi-truncate">{row.detail}</small>}
    </span>
    {row.status && <Badge>{row.status}</Badge>}
  </>;
}

type RowRipple = {id: number; x: number; y: number; diameter: number};
type RowSelectionProps = {row: Row; selected: boolean; onSelect: (id: string) => void; onActivate?: (id: string) => void};

function useRowRipple() {
  const [ripples, setRipples] = useState<RowRipple[]>([]);
  const nextRipple = useRef(0);

  function play(event: MouseEvent<HTMLElement>, host: HTMLElement | null = event.currentTarget) {
    if (!host || duration(host) <= 0) return;
    const {left, top, width, height} = host.getBoundingClientRect();
    const x = event.detail ? Math.min(width, Math.max(0, event.clientX - left)) : width / 2;
    const y = event.detail ? Math.min(height, Math.max(0, event.clientY - top)) : height / 2;
    const diameter = 2 * Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    const ripple = {id: nextRipple.current++, x, y, diameter};
    setRipples(current => [...current.slice(-2), ripple]);
  }

  const layer = <span className="bgi-row-ripple-layer" aria-hidden="true">
    {ripples.map(({id, x, y, diameter}) => <span key={id} className="bgi-row-ripple"
      style={{left: x - diameter / 2, top: y - diameter / 2, width: diameter, height: diameter}}
      onAnimationEnd={() => setRipples(current => current.filter(ripple => ripple.id !== id))}/>)}
  </span>;
  return {play, layer};
}

function SelectableListRow({row, selected, onSelect, onActivate}: RowSelectionProps) {
  const {play, layer} = useRowRipple();
  return <button type="button" className="bgi-row bgi-selectable-row bgi-row-ripple-host"
    title={row.title} aria-pressed={selected}
    onClick={event => {play(event); onSelect(row.id);}}
    onDoubleClick={onActivate && (() => onActivate(row.id))}
    onKeyDown={onActivate && (event => {
      if (event.key === 'Enter') {event.preventDefault(); onActivate(row.id);}
    })}>
    {layer}
    <RowContent row={row}/>
  </button>;
}

export function List({rows, selected, onSelect, onActivate, grouped = false, virtual = false, scroll = true}: {
  rows: readonly Row[]; selected?: string; onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  grouped?: boolean; virtual?: boolean; scroll?: boolean;
}) {
  const content = (row: Row) => onSelect ?
    <SelectableListRow row={row} selected={selected === row.id} onSelect={onSelect} onActivate={onActivate}/> :
    <div className="bgi-row"><RowContent row={row}/></div>;
  const groups = grouped ? Array.from(new Set(rows.map(row => row.group ?? '其他'))) : [''];
  if (!rows.length) return <Empty title="暂无项目"/>;
  if (virtual) return <LoomVirtualList overlayScroll className="bgi-list bgi-virtual" aria-label="项目列表"
    items={rows} itemHeight={48} getItemKey={row => row.id} renderItem={content}/>;
  const sections = groups.map(group => <section key={group}>
    {group && <h3 className="bgi-group-title">{group}</h3>}
    <ul>{rows.filter(row => !group || (row.group ?? '其他') === group)
      .map(row => <li key={row.id}>{content(row)}</li>)}</ul>
  </section>);
  return scroll
    ? <OverlayScrollArea areaClassName="bgi-list">{sections}</OverlayScrollArea>
    : <div className="bgi-list">{sections}</div>;
}

type DragRow = {node: HTMLLIElement; top: number; height: number};
type Drag = {
  pointer: number;
  source: number;
  target: number;
  startY: number;
  pointerY: number;
  grabOffset: number;
  footprint: number;
  layout: DragRow[];
  frame: number;
  active: boolean;
};

function dragTarget(current: Drag, contentY: number) {
  const center = contentY + current.layout[current.source].height / 2;
  let index = current.source;
  const centerOf = ({top, height}: DragRow) => top + height / 2;
  while (index + 1 < current.layout.length && center >= centerOf(current.layout[index + 1])) index++;
  while (index > 0 && center <= centerOf(current.layout[index - 1])) index--;
  return index;
}

export function ReorderList({rows, onChange, allowRemove = false, selected, onSelect, onEdit, showIndex, renderDetails, label = '执行顺序'}: {
  rows: readonly Row[]; onChange: (rows: Row[]) => void; allowRemove?: boolean;
  selected?: string; onSelect?: (id: string) => void; onEdit?: (id: string) => void; label?: string;
  showIndex?: boolean; renderDetails?: (row: Row) => ReactNode;
}) {
  const list = useRef<HTMLUListElement>(null);
  const scrollport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const landing = useRef(new Map<HTMLElement, Animation>());
  const [announcement, setAnnouncement] = useState('');
  const order = JSON.stringify(rows.map(row => row.id));
  const flip = useFlipRows(list, order, scrollport);

  useLayoutEffect(() => {
    const current = drag.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    delete current.layout[current.source].node.dataset.bgiDragging;
    drag.current = null;
  }, [order]);

  useLayoutEffect(() => () => {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    landing.current.clear();
  }, []);

  function move(source: number, target: number, keepAnchor = true) {
    const row = rows[source];
    if (!row || source === target || target < 0 || target >= rows.length) return false;
    const focused = document.activeElement;
    flip.beforeChange(keepAnchor);
    const next = [...rows];
    next.splice(source, 1);
    next.splice(target, 0, row);
    flushSync(() => onChange(next));
    if (flip.hasPendingChange()) flip.releaseProjection();
    if (focused instanceof HTMLElement && list.current?.contains(focused)) {
      focused.focus({preventScroll: true});
    }
    setAnnouncement(row.label + '已移动到第 ' + (target + 1) + ' 项');
    return true;
  }

  function remove(row: Row) {
    flip.beforeChange();
    flushSync(() => onChange(rows.filter(value => value.id !== row.id)));
    if (flip.hasPendingChange()) flip.releaseProjection();
    setAnnouncement('已移除' + row.label);
  }

  function start(event: PointerEvent<HTMLButtonElement>, source: number) {
    const root = list.current;
    const port = scrollport.current;
    if (event.button !== 0 || drag.current || !root || !port) return;
    const listTop = port.getBoundingClientRect().top;
    const scrollTop = port.scrollTop;
    const layout = Array.from(root.querySelectorAll<HTMLLIElement>(':scope > [data-bgi-row]'), node => {
      const bounds = node.getBoundingClientRect();
      return {node, top: bounds.top - renderedRowOffset(node) - listTop + scrollTop, height: bounds.height};
    });
    const entry = layout[source];
    if (!entry) return;
    const following = layout[source + 1];
    const preceding = layout[source - 1];
    const gap = following ? following.top - entry.top - entry.height :
      preceding ? entry.top - preceding.top - preceding.height : 0;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId, source, target: source, layout,
      startY: event.clientY, pointerY: event.clientY, frame: 0, active: false,
      grabOffset: event.clientY - entry.node.getBoundingClientRect().top,
      footprint: entry.height + gap,
    };
  }

  function draw(current: Drag) {
    current.frame = 0;
    const root = scrollport.current;
    if (drag.current !== current || !root) return;

    const bounds = root.getBoundingClientRect();
    const edge = Math.min(30, bounds.height / 4);
    const nearTop = bounds.top + edge - current.pointerY;
    const nearBottom = current.pointerY - (bounds.bottom - edge);
    const scroll = current.pointerY >= bounds.top && current.pointerY <= bounds.bottom
      ? nearTop > 0 ? -nearTop * .32 : nearBottom > 0 ? nearBottom * .32 : 0
      : 0;
    const previousScroll = root.scrollTop;
    if (scroll) root.scrollTop += scroll;

    const contentY = current.pointerY - current.grabOffset - bounds.top + root.scrollTop;
    const source = current.layout[current.source];
    flip.follow(source.node, contentY - source.top);

    const target = dragTarget(current, contentY);
    if (target !== current.target) {
      current.target = target;
      const positions = current.layout.flatMap(({node}, index) => {
        if (index === current.source) return [];
        const offset = index > current.source && index <= target ? -current.footprint :
          index < current.source && index >= target ? current.footprint : 0;
        return [{node, offset}];
      });
      flip.project(positions);
    }
    if (root.scrollTop !== previousScroll) current.frame = requestAnimationFrame(() => draw(current));
  }

  function follow(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.pointerY = event.clientY;
    if (!current.active) {
      if (Math.abs(current.pointerY - current.startY) < 4) return;
      current.active = true;
      const node = current.layout[current.source].node;
      landing.current.delete(node);
      node.dataset.bgiDragging = '';
    }
    if (!current.frame) current.frame = requestAnimationFrame(() => draw(current));
  }

  function finish(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    if (!current.active) return;

    const node = current.layout[current.source].node;
    const root = scrollport.current;
    const contentY = root
      ? event.clientY - current.grabOffset - root.getBoundingClientRect().top + root.scrollTop
      : 0;
    const target = commit && root ? dragTarget(current, contentY) : current.source;
    if (!move(current.source, target, false)) flip.releaseProjection();

    const animation = flip.animationFor(node);
    if (!animation) {
      delete node.dataset.bgiDragging;
      return;
    }
    landing.current.set(node, animation);
    void animation.finished.catch(() => {}).then(() => {
      if (landing.current.get(node) !== animation) return;
      landing.current.delete(node);
      delete node.dataset.bgiDragging;
    });
  }

  return <div className="bgi-reorder">
    <p className="bgi-sr-only" aria-live="polite">{announcement}</p>
    <OverlayScrollArea areaClassName="bgi-list bgi-reorder-scroll" viewportRef={scrollport}>
      <ul ref={list} aria-label={label}>
      {rows.map((row, index) => <li key={row.id} data-bgi-row={row.id} data-selected={onSelect ? row.id === selected : undefined}>
        <IconButton appearance="transparent" icon="grip" className="bgi-grip"
          label={'移动' + row.label} onPointerDown={event => start(event, index)}
          onPointerMove={follow} onPointerUp={event => finish(event, true)}
          onPointerCancel={event => finish(event, false)}
          onLostPointerCapture={event => finish(event, false)}
          onKeyDown={event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
          }}/>
        {(showIndex ?? !onSelect) && <span className="bgi-order-number">{index + 1}</span>}
        {onSelect ? <button type="button" className="bgi-reorder-label" aria-pressed={row.id === selected}
          onClick={() => onSelect(row.id)} onDoubleClick={() => onEdit?.(row.id)}><RowContent row={row}/></button>
          : <RowContent row={row}/>}
        {renderDetails?.(row)}
        {allowRemove && <IconButton appearance="transparent" icon="x" label={'移除' + row.label}
          onClick={() => remove(row)}/>}
      </li>)}
      </ul>
    </OverlayScrollArea>
    {!rows.length && <Empty title="暂无执行项"/>}
  </div>;
}

type GridKey = 'label' | 'detail' | 'number' | 'status' | 'recordedAt' | 'expiresAt' | 'source';
export type GridColumn = {key: GridKey; label: string; width?: number; sortable?: boolean; render?: (row: Row) => ReactNode};
const defaultGridColumns: GridColumn[] = [
  {key: 'label', label: '名称', width: 208}, {key: 'detail', label: '类别'},
  {key: 'number', label: '数量'}, {key: 'status', label: '状态'},
];

function SelectableGridRow({row, selected, onSelect, columns, onOpen}: RowSelectionProps & {
  columns: readonly GridColumn[]; onOpen?: (id: string) => void;
}) {
  const {play, layer} = useRowRipple();
  return <tr className="bgi-row-ripple-host" data-bgi-row={row.id} data-bgi-clickable="" data-selected={selected}
    onClick={event => {play(event); onSelect(row.id);}}
    onDoubleClick={onOpen && (() => onOpen(row.id))}>
    <td>
      {layer}
      <button type="button" className="bgi-grid-name" aria-pressed={selected}>
        {row.icon && <Icon name={row.icon} size={17}/>}<span>{row.label}</span>
      </button>
    </td>
    {columns.slice(1).map(column => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
  </tr>;
}

function GridSortButton({label, active, descending, onSort}: {
  label: string; active: boolean; descending: boolean; onSort: () => void;
}) {
  const {play, layer} = useRowRipple();
  return <button type="button" className="bgi-grid-sort bgi-row-ripple-host"
    onClick={event => {play(event); onSort();}}>
    {layer}
    <span>{label}</span>
    <span className="bgi-grid-sort-arrow" data-active={active}
      data-descending={descending} aria-hidden="true">
      <Icon name="up" size={14}/>
    </span>
  </button>;
}

export function DataGrid({rows, selected, onSelect, onOpen, columns = defaultGridColumns, empty}: {
  rows: readonly Row[]; selected: string; onSelect: (id: string) => void;
  columns?: readonly GridColumn[]; empty?: ReactNode; onOpen?: (id: string) => void;
}) {
  type Sort = {key: GridKey; asc: boolean};
  const body = useRef<HTMLTableSectionElement>(null);
  const transition = useRef<Animation | undefined>(undefined);
  const [width, setWidth] = useState(columns[0]?.width ?? 208);
  const [sort, setSort] = useState<Sort>({key: 'label', asc: true});
  const [displayedSort, setDisplayedSort] = useState(sort);
  const requested = useRef(sort);
  const displayed = useRef(displayedSort);
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    const left = a[displayedSort.key] ?? '';
    const right = b[displayedSort.key] ?? '';
    const comparison = typeof left === 'number' && typeof right === 'number' ?
      left - right : String(left).localeCompare(String(right), 'zh-CN', {numeric: true});
    return displayedSort.asc ? comparison : -comparison;
  }), [rows, displayedSort]);

  useLayoutEffect(() => () => transition.current?.cancel(), []);

  function changeSort(key: GridKey) {
    const last = requested.current;
    const next: Sort = {key, asc: last.key === key ? !last.asc : true};
    requested.current = next;
    setSort(next);

    const commit = () => {
      displayed.current = next;
      setDisplayedSort(next);
    };
    const node = body.current;
    if (!node || rows.length < 2 || duration(node) === 0) {
      transition.current?.cancel();
      transition.current = undefined;
      node?.style.removeProperty('opacity');
      node?.style.removeProperty('transform');
      commit();
      return;
    }

    if (displayed.current.key === next.key && displayed.current.asc === next.asc) {
      transition.current = retarget(node, transition.current, {opacity: 1, transform: 'none'}, duration(node, .55));
      return;
    }

    const outgoing = retarget(node, transition.current, {opacity: 0, transform: 'none'}, duration(node, .32));
    transition.current = outgoing;
    void outgoing.finished.then(() => {
      if (transition.current !== outgoing) return;
      // Commit the order at the handoff so moving rows cannot overlap each other.
      flushSync(commit);
      node.style.transform = 'translateY(4px)';
      transition.current = retarget(node, outgoing, {opacity: 1, transform: 'none'}, duration(node, .6));
    }, () => {});
  }
  const resize = (event: PointerEvent<HTMLButtonElement>) => {
    const target = event.currentTarget;
    const start = event.clientX;
    target.setPointerCapture(event.pointerId);
    const follow = (event: globalThis.PointerEvent) =>
      setWidth(Math.max(120, Math.min(480, width + event.clientX - start)));
    const stop = () => target.removeEventListener('pointermove', follow);
    target.addEventListener('pointermove', follow);
    target.addEventListener('lostpointercapture', stop, {once: true});
  };
  return <OverlayScrollArea areaClassName="bgi-grid-scroll" horizontal
    viewportProps={{tabIndex: 0, role: 'region', 'aria-label': '库存表格'}}>
    <table className="bgi-grid">
      <colgroup>{columns.map((column, index) => <col key={column.key}
        style={{width: index === 0 ? width : column.width}}/>)}</colgroup>
      <thead><tr>{columns.map((column, index) =>
        <th key={column.key} aria-sort={displayedSort.key === column.key ?
          displayedSort.asc ? 'ascending' : 'descending' : 'none'}>
          {column.sortable === false ? <span className="bgi-grid-column-label">{column.label}</span> :
            <GridSortButton label={column.label} active={sort.key === column.key}
              descending={sort.key === column.key && !sort.asc} onSort={() => changeSort(column.key)}/>}
          {index === 0 && <button type="button" className="bgi-column-grip" aria-label="调整名称列宽"
            onPointerDown={resize} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              setWidth(value => Math.max(120, Math.min(480, value + (event.key === 'ArrowLeft' ? -12 : 12))));
            }}/>}
        </th>)}</tr></thead>
      <tbody ref={body}>{ordered.map(row => <SelectableGridRow key={row.id} row={row}
        selected={row.id === selected} onSelect={onSelect} columns={columns} onOpen={onOpen}/>)}</tbody>
    </table>
    {!rows.length && (empty ?? <Empty title="暂无数据"/>)}
  </OverlayScrollArea>;
}

function SelectableTreeRow({row, selected, onSelect, level, group, expanded, onToggle, table, cells, onEdit}: RowSelectionProps & {
  level: number; group: boolean; expanded: boolean; onToggle: () => void; table: boolean;
  cells?: ReactNode; onEdit?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const {play, layer} = useRowRipple();
  return <div ref={host} className="bgi-tree-row bgi-row-ripple-host" data-selected={selected} data-node-id={row.id}
    style={{paddingInlineStart: 6 + level * 19}}>
    {layer}
    {group ? <IconButton appearance="transparent" label={(expanded ? '折叠' : '展开') + row.label}
      icon="right" className="bgi-tree-expander" aria-expanded={expanded} onClick={onToggle}/> :
      <span className="bgi-tree-spacer"/>}
    <button type="button" className="bgi-tree-main" aria-pressed={selected}
      onDoubleClick={onEdit && (() => onEdit(row.id))}
      onClick={event => {play(event, host.current); onSelect(row.id);}}>
      <Icon name={row.icon ?? (group ? 'folder' : 'file')}/>
      <span className="bgi-truncate">{row.label}</span>
    </button>
    {cells ?? (table && <span className="bgi-muted bgi-truncate">{row.detail}</span>)}
  </div>;
}

export function Tree({rows, selected, onSelect, onEdit, table = false, columns, label = '任务树', empty = '暂无任务', reveal}: {
  rows: readonly TreeNode[]; selected: string; onSelect: (id: string) => void; table?: boolean;
  columns?: {name: string; fields: readonly string[]; render: (row: TreeNode) => ReactNode};
  label?: string; empty?: string; onEdit?: (id: string) => void; reveal?: string;
}) {
  const [expanded, setExpanded] = useState(new Set(rows.filter(row => row.children?.length).map(row => row.id)));
  const toggle = (id: string) => setExpanded(old => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  useLayoutEffect(() => {
    if (!reveal) return;
    function ancestors(nodes: readonly TreeNode[]): string[] | undefined {
      for (const node of nodes) {
        if (node.id === reveal) return [];
        const path = node.children && ancestors(node.children);
        if (path) return [node.id, ...path];
      }
    }
    const path = ancestors(rows);
    if (path?.length) setExpanded(old => new Set([...old, ...path]));
  }, [reveal]);
  function branch(nodes: readonly TreeNode[], level: number) {
    return <ul className="bgi-tree-branch">
      {nodes.map(row => {
        const group = Boolean(row.children?.length);
        const open = expanded.has(row.id);
        const fields = columns?.render(row);
        return <li key={row.id}>
          <SelectableTreeRow row={row} selected={row.id === selected} onSelect={onSelect}
            level={level} group={group} expanded={open} onToggle={() => toggle(row.id)} table={table} onEdit={onEdit}
            cells={fields != null ? <div className="bgi-tree-fields">{fields}</div> : undefined}/>
          {group && <div className="bgi-expansion" data-open={open} inert={!open}>
            <div>{branch(row.children ?? [], level + 1)}</div>
          </div>}
        </li>;
      })}
    </ul>;
  }
  const variant = columns ? columns.fields.length === 1 ? ' bgi-tree--single' : ' bgi-tree--multiple' : '';
  return <OverlayScrollArea areaClassName={'bgi-tree' + variant} viewportProps={{role: 'region', 'aria-label': label}}>
    {columns ? <div className="bgi-tree-head"><span>{columns.name}</span>
      <div className="bgi-tree-fields">{columns.fields.map(field => <span key={field}>{field}</span>)}</div>
    </div> : table && <div className="bgi-tree-head"><span>任务</span><span>类型</span></div>}
    {rows.length ? branch(rows, 0) : <Empty title={empty}/>}
  </OverlayScrollArea>;
}
