import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactElement, type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import {DropdownMenu, OverlayScrollArea, Popover, Tooltip, type DropdownMenuItem} from 'loom-frame/ui';
import {Button, Icon, IconButton, type IconName} from './controls';
import {usePresence} from './motion';

export function DropMenu({label, items, onSelect, context = false, trigger}: {
  label: string; items: readonly DropdownMenuItem[];
  onSelect: (value: string) => void; context?: boolean; trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return <DropdownMenu label={label} items={items} open={open} onOpenChange={setOpen}
    panelClassName="bgi-menu" contextMenu={context} animatePresence overlayScroll
    trigger={trigger ?? <Button aria-label={label} trailingIcon={context ? 'ellipsis' : 'expand'}
      onClick={context ? () => setOpen(true) : undefined}>{label}</Button>}
    onSelect={value => {onSelect(value); setOpen(false);}}/>;
}

export function Flyout({label, children, open, onChange, align}: {
  label: string; children: ReactNode; open: boolean; onChange: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
}) {
  return <Popover label={label} open={open} onOpenChange={onChange} align={align}
    className="bgi-flyout" animatePresence trigger={<Button trailingIcon="expand">{label}</Button>}>
    <OverlayScrollArea>{children}</OverlayScrollArea>
  </Popover>;
}

export function HelpTip({label, hint}: {label: string; hint: string}) {
  return <Tooltip label={hint}>
    <IconButton label={label} appearance="transparent" icon="help"/>
  </Tooltip>;
}

export function TitleBar({title, titleId, icon, iconContent, actions, onClose, onMinimize, onMaximize, maximized}: {
  title: string; titleId?: string; icon?: IconName; iconContent?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void; onMinimize?: () => void;
  onMaximize?: () => void; maximized?: boolean;
}) {
  return <header className="bgi-titlebar">
    {iconContent ?? (icon && <Icon name={icon} size={16}/>)}
    <span id={titleId} className="bgi-grow bgi-truncate">{title}</span>
    <div className="bgi-window-actions">
      {actions}
      {onMinimize && <IconButton label="最小化" icon="minus" appearance="transparent"
        onClick={onMinimize}/>}
      {onMaximize && <IconButton label={maximized ? '还原窗口' : '最大化'} icon="square"
        appearance="transparent" onClick={onMaximize}/>}
      {onClose && <IconButton label="关闭窗口" icon="x" appearance="transparent"
        className="bgi-window-close" onClick={onClose}/>}
    </div>
  </header>;
}

const drawerMotion = {durationScale: 1.5, curve: 'ease-in-out'};

export function Modal({title, open, onChange, onExited, children, actions, drawer = false, wide = false, width, height, maxHeight, iconContent}: {
  title: string; open: boolean; onChange: (open: boolean) => void;
  onExited?: () => void;
  children: ReactNode; actions?: ReactNode; drawer?: boolean; wide?: boolean;
  width?: number; height?: number; maxHeight?: number; iconContent?: ReactNode;
}) {
  const layer = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const label = useId();

  useLayoutEffect(() => {
    const node = layer.current;
    if (!open || !node || node.open) return;
    // Make the dialog measurable before sampling the percentage-based drawer position.
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.toggleAttribute('autofocus', drawer);
    node.showModal();
    if (drawer) panel.current?.focus({preventScroll: true});
  }, [open, drawer]);

  const panelPresent = usePresence(open, panel,
    drawer ? 'translate3d(100%, 0, 0)' : 'translateY(8px) scale(.985)',
    drawer ? {
      ...drawerMotion, fade: false, restingTransform: 'translate3d(0, 0, 0)',
    } : undefined,
  );
  const scrimPresent = usePresence(drawer && open, scrim, 'none', drawerMotion);
  const present = panelPresent || scrimPresent;
  useLayoutEffect(() => {
    const node = layer.current;
    if (present || !node?.open) return;
    node.close();
    trigger.current?.focus({preventScroll: true});
    trigger.current = null;
    onExited?.();
  }, [present, onExited]);
  useEffect(() => () => {
    trigger.current?.focus({preventScroll: true});
  }, []);

  return <dialog ref={layer} className="bgi-overlay" data-bgi-clickable="" data-drawer={drawer} data-entered={open}
    aria-labelledby={label} onCancel={event => {event.preventDefault(); onChange(false);}}
    onClick={event => {if (event.target === event.currentTarget) onChange(false);}}>
    {drawer && <div className="bgi-drawer-scrim" aria-hidden="true" ref={scrim}/>}
    <section className="bgi-modal" data-wide={wide || undefined}
      style={{
        width: width === undefined ? undefined : `min(100%, ${width}px)`,
        height: height === undefined ? undefined : `min(100%, ${height}px)`,
        maxHeight: maxHeight === undefined ? undefined : `min(100%, ${maxHeight}px)`,
      }}
      ref={panel} inert={!open} tabIndex={drawer ? -1 : undefined}>
      <TitleBar title={title} titleId={label} iconContent={iconContent} onClose={() => onChange(false)}/>
      <OverlayScrollArea areaClassName="bgi-modal-scroll" className="bgi-modal-content">{children}</OverlayScrollArea>
      {actions && <footer className="bgi-modal-actions">{actions}</footer>}
    </section>
  </dialog>;
}

const feedbackIcons = {info: 'info', success: 'check', warning: 'alert', danger: 'error'} as const;
export type FeedbackTone = keyof typeof feedbackIcons;

export function InfoBar({tone, title, description, onDismiss}: {
  tone: FeedbackTone; title: string; description?: string; onDismiss?: () => void;
}) {
  return <div className="bgi-info" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon name={feedbackIcons[tone]} size={20}/>
    <div className="bgi-grow"><strong>{title}</strong>{description && <p>{description}</p>}</div>
    {onDismiss && <IconButton appearance="transparent" icon="x" label="关闭提示" onClick={onDismiss}/>}
  </div>;
}

export function MessageDialog({title, message, tone, open, onChange, confirm}: {
  title: string; message: string; tone: FeedbackTone; open: boolean;
  onChange: (open: boolean) => void; confirm?: () => void;
}) {
  return <Modal title={title} open={open} onChange={onChange} actions={<>
    <Button appearance="primary" onClick={() => {confirm?.(); onChange(false);}}>确定</Button>
    <Button onClick={() => onChange(false)}>取消</Button>
  </>}>
    <div className="bgi-message" data-tone={tone}>
      <Icon name={feedbackIcons[tone]} size={48}/>
      <OverlayScrollArea areaClassName="bgi-message-copy"><p>{message}</p></OverlayScrollArea>
    </div>
  </Modal>;
}

export function Snackbar({open, onClose, title, tone = 'info'}: {
  open: boolean; onClose: () => void; title: string; tone?: FeedbackTone;
}) {
  const node = useRef<HTMLDivElement>(null);
  const present = usePresence(open, node, 'translateY(12px)');
  if (!present || typeof document === 'undefined') return null;

  return createPortal(<div className="bgi-snackbar" ref={node} inert={!open}>
    <InfoBar tone={tone} title={title} onDismiss={onClose}/>
  </div>, document.body);
}

export function useSnackbar() {
  const [notice, setNotice] = useState<{title: string; tone: FeedbackTone; open: boolean}>({
    title: '', tone: 'info', open: false,
  });
  const notify = useCallback((title: string, tone: FeedbackTone = 'info') => {
    setNotice({title, tone, open: true});
  }, []);
  const onClose = useCallback(() => {
    setNotice(current => current.open ? {...current, open: false} : current);
  }, []);

  useEffect(() => {
    if (!notice.open) return;
    const timer = window.setTimeout(() => {
      setNotice(current => current === notice ? {...current, open: false} : current);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return {notify, snackbar: {...notice, onClose}};
}

export function WindowFrame({title, icon = 'monitor', iconContent, titleActions, children, onClose, onMinimize, onMaximize,
  maximized, compact = false}: {
  title: string; icon?: IconName; iconContent?: ReactNode; titleActions?: ReactNode; children: ReactNode; onClose?: () => void;
  onMinimize?: () => void; onMaximize?: () => void; maximized?: boolean; compact?: boolean;
}) {
  return <section className="bgi-window" data-maximized={maximized} data-compact={compact}
    aria-label={title}>
    <TitleBar title={title} icon={icon} iconContent={iconContent} actions={titleActions} onClose={onClose} onMinimize={onMinimize}
      onMaximize={onMaximize} maximized={maximized}/>
    <div className="bgi-window-content">{children}</div>
  </section>;
}
