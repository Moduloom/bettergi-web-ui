import {useEffect, useRef, useState} from 'react';
import {Badge, Button, Icon, SoloTaskButton, Text, TextArea} from './controls';
import {Card, Empty} from './collections';
import {InfoBar, Modal, Snackbar, useSnackbar} from './overlays';
import {BetterGIRequestError, type useBetterGIConnection} from './app-runtime';
import type {RewardInput} from './task-reward-state';

type TaskRunState = 'idle' | 'starting' | 'running' | 'stopping';
type Target = {
  id: string; label: string; webView: boolean; state: TaskRunState;
  taskId: string | null; taskName: string | null; runId: string | null; error: string | null;
};
type Snapshot = {taskIds: string[]; targets: Target[]};
export type TaskBinding = {
  id: string; title: string;
  input?: {
    strategyName?: string; rounds?: number; dailyMax?: number;
    fishing?: {wholeProcessSeconds?: number; throwRodSeconds?: number; policy?: string; saveScreenshot?: boolean};
    artifact?: {star?: number; javaScript?: string; setFilter?: string; maxToCheck?: number; failurePolicy?: string};
    grid?: {screen?: string; limit?: number; starSuffix?: boolean; target?: string};
    reward?: RewardInput;
  };
  usesLocalDraft?: boolean;
  localDraftKeys?: readonly string[];
  startProblem?: string;
};
const stateLabel: Record<TaskRunState, string> = {idle: '可启动', starting: '启动中', running: '运行中', stopping: '停止中'};
const missingService = '需要本机 BetterGI 的独立任务接口';

function errorText(reason: unknown) {
  if (reason instanceof BetterGIRequestError && reason.status === 404) return '当前运行的 BetterGI 版本没有独立任务接口。';
  if (reason instanceof Error && reason.name === 'TimeoutError') return '等待目标实例确认超时，正在刷新任务状态。';
  return reason instanceof Error ? reason.message : '本机独立任务操作失败。';
}

export function useStandaloneTaskRuntime(runtime: ReturnType<typeof useBetterGIConnection>) {
  const {call, connection} = runtime;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [managed, setManaged] = useState<TaskBinding>();
  const [prepare, setPrepare] = useState<{binding: TaskBinding; target: Target}>();
  const [codeText, setCodeText] = useState('');
  const executing = useRef(false);
  const {notify, snackbar} = useSnackbar();

  useEffect(() => {
    if (connection.state !== 'online') {
      setSnapshot(undefined);
      setProblem('');
      return;
    }
    if (busy) return;
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const incoming = await call<Snapshot>('solo-tasks/targets', {signal: controller.signal});
        if (!controller.signal.aborted) {
          setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming);
          setProblem('');
        }
      } catch (reason) {
        if (!controller.signal.aborted) setProblem(errorText(reason));
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 1200);
      }
    }
    void refresh();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [call, connection.state, busy]);

  const targets = snapshot?.targets ?? [];
  const codes = codeText.split(/[\r\n]+/).map(value => value.trim()).filter(Boolean);
  const needsCodes = prepare?.binding.id === 'redeem_code';

  async function run(binding: TaskBinding, target: Target, enteredCodes?: string[]) {
    if (executing.current || connection.state !== 'online') return;
    executing.current = true;
    setBusy(true);
    const stopping = target.state === 'running' && target.taskId === binding.id;
    const body = stopping ? {taskId: binding.id, runId: target.runId} : {
      taskId: binding.id, runId: crypto.randomUUID(), ...binding.input, codes: enteredCodes,
    };
    try {
      const updated = await call<Target>('solo-tasks/targets/' + encodeURIComponent(target.id) + '/' + (stopping ? 'stop' : 'start'), {body});
      setSnapshot(previous => previous && {...previous, targets: previous.targets.map(item => item.id === updated.id ? updated : item)});
    } catch (reason) {
      notify(errorText(reason), 'danger');
    } finally {
      executing.current = false;
      setBusy(false);
    }
  }

  function select(binding: TaskBinding, target: Target) {
    if (busy) return;
    if (target.state === 'running' && target.taskId === binding.id) {
      void run(binding, target);
      return;
    }
    if (target.state !== 'idle') return;
    if (binding.startProblem) {
      notify(binding.startProblem, 'danger');
      return;
    }
    const usesLocalDraft = binding.usesLocalDraft || Boolean(binding.localDraftKeys?.some(key => {
      try {return localStorage.getItem('bettergi-ui:app:' + key) !== null;} catch {return false;}
    }));
    if (binding.id === 'redeem_code' || usesLocalDraft) {
      setCodeText('');
      setPrepare({binding: {...binding, usesLocalDraft}, target});
    } else void run(binding, target);
  }

  function button(binding: TaskBinding) {
    const current = targets[0];
    const multi = targets.length > 1;
    const count = targets.filter(item => item.taskId === binding.id && item.state !== 'idle').length;
    const currentState = !multi && current?.taskId === binding.id ? current.state : 'idle';
    const occupied = !multi && current?.state !== 'idle' && current?.taskId !== binding.id;
    const enabled = snapshot?.taskIds.includes(binding.id) && current && !problem && connection.state === 'online';
    return <SoloTaskButton state={busy ? 'pending' : multi && count ? 'manage' : currentState}
      active={count} disabled={!enabled || occupied}
      title={!enabled ? problem || missingService : occupied ? '当前实例正在运行「' + (current?.taskName ?? '') + '」' : undefined}
      onClick={() => {if (multi) setManaged(binding); else if (current) select(binding, current);}}/>;
  }

  const windows = <>
    <Modal title={managed ? managed.title + ' · 实例管理' : '实例管理'} open={managed !== undefined} wide width={640} maxHeight={580}
      iconContent={<Icon name="monitor" size={16}/>} onChange={open => {if (!open) setManaged(undefined);}}
      actions={<Button onClick={() => setManaged(undefined)}>关闭</Button>}>
      <div className="bgi-stack">
        <Text variant="caption">每个实例只能运行一个独立任务，可逐个启动或停止。</Text>
        {problem && <InfoBar tone="danger" title={problem}/>}
        {!targets.length && <Empty icon="monitor" title="暂无在线实例"/>}
        {managed && targets.map(target => {
          const occupied = target.state !== 'idle' && target.taskId !== managed.id;
          const waiting = target.state === 'starting' || target.state === 'stopping';
          return <Card key={target.id} title={target.label} description={target.error ?? undefined}
            icon={target.webView ? 'cloud' : 'monitor'} action={<div className="bgi-wrap">
              <Badge tone={target.state === 'running' && !occupied ? 'success' : undefined}>
                {occupied ? '正被「' + (target.taskName ?? target.taskId ?? '') + '」占用' : stateLabel[target.state]}
              </Badge>
              <Button disabled={busy || occupied || waiting || Boolean(problem)}
                appearance={target.state === 'running' && !occupied ? 'danger' : 'primary'}
                onClick={() => select(managed, target)}>{occupied ? '已占用' : waiting ? '请稍候' : target.state === 'running' ? '停止' : '启动'}</Button>
            </div>}/>;
        })}
      </div>
    </Modal>
    <Modal title={needsCodes ? '输入兑换码' : '启动独立任务'} open={prepare !== undefined}
      onChange={open => {if (!open) setPrepare(undefined);}}
      actions={<>
        <Button onClick={() => setPrepare(undefined)}>取消</Button>
        <Button appearance="primary" disabled={busy || (needsCodes && !codes.length)} onClick={() => {
          if (!prepare) return;
          const {binding, target} = prepare;
          setPrepare(undefined);
          void run(binding, target, needsCodes ? codes : undefined);
        }}>{prepare?.binding.usesLocalDraft ? '按本机配置启动' : '启动'}</Button>
      </>}>
      {prepare && <div className="bgi-stack">
        <Text>{prepare.binding.title} · {prepare.target.label}</Text>
        {prepare.binding.usesLocalDraft && <InfoBar tone="info" title="还有网页配置未同步到本机" description="启动时会使用 BetterGI 本机已保存的值。"/>}
        {needsCodes && <TextArea label="兑换码（每行一条）" value={codeText} onChange={setCodeText}/>}
      </div>}
    </Modal>
    <Snackbar {...snackbar}/>
  </>;

  return {button, windows, online: connection.state === 'online'};
}
