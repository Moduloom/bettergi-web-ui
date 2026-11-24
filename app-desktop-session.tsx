import {useEffect, useRef, useState} from 'react';
import type {DropdownMenuItem} from 'loom-frame/ui';
import {Badge, Button, Icon, IconButton, Link, Progress, Text} from './controls';
import {Empty, Expander, Toolbar} from './collections';
import {DropMenu, InfoBar, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {BetterGIRequestError, type useBetterGIConnection} from './app-runtime';

type DesktopStatus = {
  connection: number; sessionId: number | null; visible: boolean; status: string;
  gameMouse: boolean; watch: boolean; smartSizing: boolean; keepAspect: boolean;
  muted: boolean; topmost: boolean; systemShortcuts: boolean; smallWindow: boolean;
};
type Diagnostic = {id: string; title: string; summary: string; detail: string; severity: 'warning' | 'notice' | 'normal'; canAutoFix: boolean};
type Runtime = ReturnType<typeof useBetterGIConnection>;
type SessionAction =
  'start' | 'show' | 'hide' | 'switch-window' | 'show-desktop' | 'launch-bettergi' |
  'game-mouse' | 'watch' | 'smart-sizing' | 'keep-aspect' | 'audio' | 'topmost' |
  'system-shortcuts' | 'small-window' | 'native-diagnostics' | 'logoff';
type SessionRequest = {value?: boolean; sessionId?: number};

const rdpLabels = ['RDP 未连接', 'RDP 已连接', 'RDP 正在连接'];

function errorText(reason: unknown) {
  if (reason instanceof BetterGIRequestError && reason.status === 404) return '当前运行的 BetterGI 版本没有桌面分身管理接口。';
  if (reason instanceof Error && reason.name === 'TimeoutError') return '本机请求超时，请查看当前连接状态。';
  return reason instanceof Error ? reason.message : '无法读取本机桌面分身。';
}

function desktopHeadline(state: DesktopStatus, pending?: SessionAction) {
  if (pending === 'logoff') return ['正在关闭桌面分身', '正在断开 RDP 并注销桌面分身会话，请稍候。'];
  if (state.connection === 1) return ['桌面分身已连接', 'RDP 连接正常，可以在原生桌面分身窗口操作。'];
  if (state.connection === 2 || pending === 'start') return ['正在连接桌面分身', '正在创建或恢复 RDP 连接，请稍候。'];
  if (state.sessionId !== null) return ['桌面分身已启动，等待连接', '会话仍在运行，点击「启动并连接」可以恢复 RDP 连接。'];
  return ['桌面分身尚未启动', '点击「启动并连接」，BetterGI 将创建独立桌面并建立 RDP 连接。'];
}

function DiagnosticRow({issue, onFix, disabled}: {issue: Diagnostic; onFix: () => void; disabled: boolean}) {
  const [open, setOpen] = useState(false);
  return <Expander title={issue.title} description={issue.summary}
    icon={issue.severity === 'warning' ? 'alert' : issue.severity === 'normal' ? 'check' : 'info'}
    open={open} onChange={setOpen}
    action={issue.canAutoFix ? <Button disabled={disabled} onClick={onFix}>在本机修复</Button> : undefined}>
    <Text>{issue.detail}</Text>
  </Expander>;
}

function DesktopDiagnostics({open, onChange, runtime, onFix, nativeBusy}: {
  open: boolean; onChange: (open: boolean) => void; runtime: Runtime; onFix: () => void; nativeBusy: boolean;
}) {
  const {call} = runtime;
  const fetchRef = useRef<AbortController | null>(null);
  const [issues, setIssues] = useState<Diagnostic[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNormal, setShowNormal] = useState(false);
  const {notify, snackbar} = useSnackbar();

  async function diagnose(recheck: boolean) {
    fetchRef.current?.abort();
    const request = new AbortController();
    fetchRef.current = request;
    setBusy(true);
    setError('');
    try {
      const result = await call<Diagnostic[]>('desktop-session/diagnostics', {
        body: {recheck}, signal: request.signal, timeout: 40000,
      });
      if (!request.signal.aborted) setIssues(result);
    } catch (reason) {
      if (!request.signal.aborted) setError(errorText(reason));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setIssues(undefined);
    void diagnose(false);
    return () => fetchRef.current?.abort();
  }, [open, call]);

  const warnings = issues?.filter(row => row.severity === 'warning') ?? [];
  const notices = issues?.filter(row => row.severity === 'notice') ?? [];
  const normal = issues?.filter(row => row.severity === 'normal') ?? [];
  const rows = (values: Diagnostic[]) => values.map(issue =>
    <DiagnosticRow key={issue.id} issue={issue} onFix={onFix} disabled={nativeBusy}/>);

  async function copy() {
    if (!issues) return;
    try {
      await navigator.clipboard.writeText(issues.map(issue => [issue.title, issue.summary, issue.detail].join('\n')).join('\n\n'));
      notify('已复制环境信息', 'success');
    } catch {
      notify('无法复制环境信息', 'danger');
    }
  }

  return <>
    <Modal title="诊断与修复" iconContent={<Icon name="settings" size={16}/>} open={open} onChange={onChange}
      wide width={700} maxHeight={650}
      actions={<>
        <Button icon="copy" disabled={!issues?.length || busy} onClick={copy}>复制环境信息</Button>
        <Button icon="rotate" disabled={busy} onClick={() => diagnose(true)}>重新检测</Button>
        <Button onClick={() => onChange(false)}>关闭</Button>
      </>}>
      <div className="bgi-stack">
        <Text variant="caption">桌面分身依赖 Windows 的远程桌面与子会话能力。检查结果会指出影响连接的项目。</Text>
        {busy ? <div className="bgi-desktop-checking" role="status"><Progress ring value={null} label="检测中"/>
          <Text>正在检测系统环境…</Text></div> : error ? <InfoBar tone="danger" title={error}/> : issues && <>
          {warnings.length ? <><Text variant="section">需要处理</Text>{rows(warnings)}</> : null}
          {notices.length ? <><Text variant="section">建议处理</Text>{rows(notices)}</> : null}
          {!warnings.length && !notices.length && <InfoBar tone="success" title="检查完成：没有发现问题。"/>}
          {normal.length > 0 && <Expander icon="list" title="未触发（全部检查项）" open={showNormal} onChange={setShowNormal}>
            <div className="bgi-stack">{rows(normal)}</div>
          </Expander>}
        </>}
      </div>
    </Modal>
    <Snackbar {...snackbar}/>
  </>;
}

export function DesktopSessionDialog({open, onChange, runtime, onConnection}: {
  open: boolean; onChange: (open: boolean) => void; runtime: Runtime; onConnection: () => void;
}) {
  const {call, connection} = runtime;
  const online = connection.state === 'online';
  const [state, setState] = useState<DesktopStatus>();
  const [pending, setPending] = useState<SessionAction>();
  const [fetchError, setFetchError] = useState('');
  const [diagnostic, setDiagnostic] = useState(false);
  const [confirmSession, setConfirmSession] = useState<number>();
  const active = useRef(false);
  const {notify, snackbar} = useSnackbar();

  useEffect(() => {
    if (!open || !online || (pending && pending !== 'start' && pending !== 'logoff')) return;
    const controller = new AbortController();
    let timer: number;
    async function poll() {
      try {
        const next = await call<DesktopStatus>('desktop-session/status', {signal: controller.signal});
        if (!controller.signal.aborted) {setState(next); setFetchError('');}
      } catch (reason) {
        if (!controller.signal.aborted) setFetchError(errorText(reason));
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [open, online, pending, call]);

  async function run(action: SessionAction, body: SessionRequest = {}) {
    if (active.current || !online) return;
    active.current = true;
    setPending(action);
    try {
      const next = await call<DesktopStatus>('desktop-session/actions/' + action, {
        body, timeout: action === 'start' || action === 'logoff' ? 70000 : undefined,
      });
      setState(next);
      if (action === 'start' && next.connection === 0)
        notify(next.status.split(' | ')[0], 'danger');
    } catch (reason) {
      notify(errorText(reason), 'danger');
    } finally {
      active.current = false;
      setPending(undefined);
    }
  }

  function close() {
    setDiagnostic(false);
    setConfirmSession(undefined);
    onChange(false);
  }

  const connected = state?.connection === 1;
  const disabled = !online || !state || Boolean(pending);
  const mouseLabel = state?.gameMouse ? '切换到普通鼠标' : '切换到游戏鼠标';
  const [title, description] = state ? desktopHeadline(state, pending) : ['', ''];
  const menu: DropdownMenuItem[] = [
    {id: 'launch-bettergi', label: '运行 BetterGI', disabled: state?.sessionId == null},
    {id: 'small-window', label: state?.smallWindow ? '恢复正常窗口' : '小窗模式', checked: state?.smallWindow},
    {id: 'watch', label: state?.watch ? '退出观看模式' : '进入观看模式', checked: state?.watch},
    {id: 'resolution', label: '桌面分辨率', children: [{id: '1920x1080', label: '1920 × 1080', checked: true, disabled: true}]},
    {id: 'window', label: '窗口', children: [
      {id: 'adaptive', label: '自适应', checked: state?.smartSizing},
      {id: 'one-to-one', label: '1 : 1', checked: state?.smartSizing === false},
      {id: 'keep-aspect', label: '保持宽高比', checked: state?.keepAspect},
    ]},
    {id: 'shortcuts', label: '快捷键', children: [
      {id: 'system-shortcuts', label: '系统组合键发送到桌面分身', checked: state?.systemShortcuts},
      {id: 'show-desktop', label: '发送 Win+D 显示桌面', disabled: !connected},
      {id: 'switch-window', label: '发送 Win+Tab 切换窗口', disabled: !connected},
    ]},
    {id: 'more', label: '更多', children: [
      {id: 'diagnostics', label: '诊断与修复…'},
      {id: 'logoff', label: '注销桌面分身…', danger: true, disabled: state?.sessionId == null},
    ]},
  ];

  function selectAction(action: string) {
    if (!state || disabled) return;
    switch (action) {
      case 'diagnostics': setDiagnostic(true); break;
      case 'logoff': if (state.sessionId !== null) setConfirmSession(state.sessionId); break;
      case 'adaptive': void run('smart-sizing', {value: true}); break;
      case 'one-to-one': void run('smart-sizing', {value: false}); break;
      case 'watch': void run('watch', {value: !state.watch}); break;
      case 'keep-aspect': void run('keep-aspect', {value: !state.keepAspect}); break;
      case 'system-shortcuts': void run('system-shortcuts', {value: !state.systemShortcuts}); break;
      case 'small-window': case 'launch-bettergi': case 'show-desktop': case 'switch-window': void run(action); break;
    }
  }

  return <>
    <Modal title="BetterGI 桌面分身" iconContent={<Icon name="monitor" size={16}/>} open={open}
      onChange={next => {if (!next) close();}} wide maxHeight={690}>
      {!online ? <Empty icon="monitor" title="尚未连接本机 BetterGI"
        action={<Button onClick={() => {close(); onConnection();}}>连接本机</Button>}/> :
        fetchError && !state ? <InfoBar tone="danger" title={fetchError}/> : !state ?
          <div className="bgi-desktop-checking" role="status"><Progress ring value={null} label="读取状态"/>
            <Text>正在读取桌面分身状态…</Text></div> :
          <div className="bgi-stack">
            <Toolbar actions={<>
              <Button icon="play" appearance="primary" disabled={disabled || connected || state.connection === 2}
                onClick={() => run('start')}>启动</Button>
              <Button icon="minus" disabled={disabled || !state.visible} onClick={() => run('hide')}>隐藏</Button>
              <Button icon="layers" disabled={disabled || !connected} onClick={() => run('switch-window')}>切换窗口</Button>
              <Button icon="hand" disabled={disabled} onClick={() => run('game-mouse', {value: !state.gameMouse})}>{mouseLabel}</Button>
              <DropMenu label="控制中心" trigger={<Button trailingIcon="expand" disabled={disabled}>控制中心</Button>}
                items={menu} onSelect={selectAction}/>
              <IconButton icon={state.muted ? 'x' : 'volume'} label={state.muted ? '开启声音' : '关闭声音'}
                disabled={disabled} aria-pressed={state.muted} onClick={() => run('audio', {value: !state.muted})}/>
              <IconButton icon="monitor" label={state.topmost ? '取消置顶' : '窗口置顶'}
                disabled={disabled} aria-pressed={state.topmost} onClick={() => run('topmost', {value: !state.topmost})}/>
            </>}>
              <Text variant="strong">BetterGI 桌面分身</Text>
            </Toolbar>
            {fetchError && <InfoBar tone="danger" title={fetchError}/>}
            <section className="bgi-card bgi-desktop-connection" aria-live="polite">
              <Icon name="monitor" size={32}/>
              <div className="bgi-stack">
                <Text variant="section">{title}</Text>
                <Text>{description}</Text>
                <div className="bgi-wrap" title={state.status}>
                  <Badge tone={connected ? 'success' : undefined}>{rdpLabels[state.connection] ?? 'RDP 状态未知'}</Badge>
                  <Badge>{state.sessionId === null ? '桌面分身会话未创建' : '桌面分身会话 ' + state.sessionId}</Badge>
                </div>
                <div className="bgi-wrap">
                  {connected ? <Button icon="monitor" appearance="primary" disabled={disabled} onClick={() => run('show')}>查看桌面分身窗口</Button> :
                    <Button icon="play" appearance="primary" disabled={disabled || state.connection === 2}
                      onClick={() => run('start')}>启动并连接</Button>}
                  <Button icon="settings" disabled={Boolean(pending)} onClick={() => setDiagnostic(true)}>诊断与修复…</Button>
                  <Link href="https://www.bettergi.com/feats/command/session.html">查看帮助文档</Link>
                </div>
              </div>
            </section>
            {state.gameMouse && <Text variant="caption">游戏鼠标模式下，按住 Alt 可临时释放并显示本地鼠标。</Text>}
          </div>}
    </Modal>
    <DesktopDiagnostics open={diagnostic} onChange={setDiagnostic} runtime={runtime} nativeBusy={Boolean(pending)}
      onFix={() => run('native-diagnostics')}/>
    <MessageDialog title="注销桌面分身"
      message="注销会断开 RDP 并关闭桌面分身中正在运行的软件。未保存的数据会丢失。"
      tone="warning" open={confirmSession !== undefined} onChange={next => {if (!next) setConfirmSession(undefined);}}
      confirm={() => {if (confirmSession !== undefined) void run('logoff', {sessionId: confirmSession});}}/>
    <Snackbar {...snackbar}/>
  </>;
}
