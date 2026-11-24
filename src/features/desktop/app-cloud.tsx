import {useCallback, useEffect, useState} from 'react';
import {Badge, Button, Field, Icon, IconButton, Input, Link, Select, Text} from '../../components/controls';
import {Card, Empty, Toolbar} from '../../components/collections';
import {DropMenu, InfoBar, MessageDialog, Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {BetterGIRequestError, type useBetterGIConnection} from '../../services/app-runtime';

type CloudInstance = {name: string; state: 'connected' | 'starting' | 'stopped'; detail: string};
type CloudAccount = {id: string; label: string};
type Operation = 'create' | 'open' | 'close' | 'clear-cache' | 'delete';
type ConfirmOperation = Extract<Operation, 'close' | 'clear-cache' | 'delete'>;
const stateText = {connected: '已连接', starting: '等待连接', stopped: '未启动'};
const actionText = {connected: '查看窗口', starting: '等待连接', stopped: '打开游戏'};
const confirmations: Record<ConfirmOperation, {title: string; details: (name: string) => string}> = {
  close: {title: '关闭云原神实例', details: name => '关闭实例「' + name + '」？该实例正在执行的任务也会停止，登录状态会保留。'},
  'clear-cache': {title: '清理缓存', details: name => '清理「' + name + '」的网页缓存？登录状态会保留。'},
  delete: {title: '删除云原神网页版实例', details: name => '确定删除实例「' + name + '」吗？该实例的登录态和网页数据会一并删除，且无法恢复。'},
};

function errorText(reason: unknown) {
  if (reason instanceof BetterGIRequestError && reason.status === 404) return '当前运行的 BetterGI 版本没有云原神管理接口。';
  return reason instanceof Error ? reason.message : '无法读取本机云原神实例。';
}

export function CloudInstancesDialog({open, onChange, runtime, onTasks, onConnection}: {
  open: boolean; onChange: (open: boolean) => void; runtime: ReturnType<typeof useBetterGIConnection>;
  onTasks: () => void; onConnection: () => void;
}) {
  const {call, connection} = runtime;
  const online = connection.state === 'online';
  const [instances, setInstances] = useState<CloudInstance[]>();
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inProgress, setInProgress] = useState('');
  const [listError, setListError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState<{operation: ConfirmOperation; name: string}>();
  const {notify, snackbar} = useSnackbar();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await call<CloudInstance[]>('cloud-web/instances', {signal});
      if (!signal?.aborted) {setInstances(rows); setListError('');}
    } catch (reason) {
      if (!signal?.aborted) setListError(errorText(reason));
    }
  }, [call]);

  useEffect(() => {
    if (!open || !online || inProgress) return;
    const controller = new AbortController();
    let timer: number;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 1500);
    }
    void poll();
    return () => {controller.abort(); window.clearTimeout(timer);};
  }, [open, online, refresh, inProgress]);

  async function beginCreate() {
    if (creating || inProgress || !online || !instances) return;
    setFormError('');
    setCreating(true);
    setAccountLoading(true);
    try {
      const options = await call<CloudAccount[]>('cloud-web/accounts');
      setAccounts(options);
      setAccount(options[0]?.id ?? '');
    } catch (reason) {
      setAccounts([]);
      setAccount('');
      setFormError('账户目录读取失败：' + errorText(reason));
    } finally {
      setAccountLoading(false);
    }
  }

  function close() {
    onChange(false);
    setCreating(false);
    setName('');
    setFormError('');
    setOperationError('');
  }

  async function change(operation: Operation, target: string) {
    if (inProgress || !online || !target.trim() || (operation === 'create' && accountLoading)) return;
    const verb = {create: '新建', open: '打开', close: '关闭', 'clear-cache': '清理缓存', delete: '删除'}[operation];
    setInProgress(verb + '「' + target + '」…');
    setOperationError('');
    setFormError('');
    try {
      const result = await call<{message?: string}>('cloud-web/instances/' + operation, {
        body: {name: target, ...(operation === 'create' && account ? {accountId: account} : {})},
      });
      if (operation === 'create') {
        setCreating(false);
        setName('');
      }
      if (result.message) notify(result.message, operation === 'create' ? 'warning' : 'success');
    } catch (reason) {
      if (operation === 'create') setFormError(errorText(reason));
      else setOperationError(errorText(reason));
    } finally {
      setInProgress('');
    }
  }

  const confirm = confirmation && confirmations[confirmation.operation];
  const running = instances?.filter(instance => instance.state !== 'stopped').length ?? 0;

  return <>
    <Modal title="云原神网页版" iconContent={<Icon name="cloud" size={16}/>} open={open}
      onChange={next => {if (!next) close();}} wide width={600} maxHeight={600}
      actions={<div className="bgi-cloud-footer">
        <div className="bgi-stack">
          <Text variant="caption">登录、排队请在游戏窗口完成。</Text>
          <Link onActivate={() => {close(); onTasks();}}>前往独立任务，选择实例运行</Link>
        </div>
        <Button onClick={close}>关闭</Button>
      </div>}>
      <div className="bgi-stack" onKeyDown={event => {
        if (event.ctrlKey && event.key.toLowerCase() === 'n') {event.preventDefault(); void beginCreate();}
      }}>
        {!online ? <Empty icon="cloud" title="尚未连接本机 BetterGI"
          action={<Button onClick={() => {close(); onConnection();}}>连接本机</Button>}/> : <>
          <Toolbar actions={<Button appearance="primary" icon="plus" disabled={!instances || Boolean(inProgress)}
            onClick={beginCreate}>新建实例</Button>}>
            <div className="bgi-cloud-summary">
              <Text variant="strong">{instances ? instances.length + ' 个实例 · ' + running + ' 个运行中' :
                listError ? '云原神实例' : '正在读取实例'}</Text>
              <Text variant="caption">状态自动更新 · 每个实例独立保存登录状态</Text>
            </div>
          </Toolbar>
          <div className="bgi-expansion" data-open={creating} inert={!creating}>
            <div>
              <form className="bgi-card bgi-cloud-create bgi-stack" onSubmit={event => {event.preventDefault(); void change('create', name.trim());}}>
                <Field label="实例名称">
                  <div className="bgi-cloud-name">
                    <Input aria-label="实例名称" value={name} onChange={event => {
                      setName(event.currentTarget.value); setFormError('');
                    }}
                      placeholder="例如：小号A、日常号" maxLength={32} disabled={Boolean(inProgress)}/>
                    <Button type="submit" appearance="primary" disabled={Boolean(inProgress) || accountLoading || !name.trim()}>新建并打开</Button>
                    <IconButton icon="x" label="取消新建" disabled={Boolean(inProgress)} onClick={() => {
                      setCreating(false); setName(''); setFormError('');
                    }}/>
                  </div>
                </Field>
                {accounts.length > 1 && <Field label="当前账户"><Select label="当前账户" value={account}
                  disabled={Boolean(inProgress)} options={accounts.map(row => ({value: row.id, label: row.label}))}
                  onValueChange={setAccount}/></Field>}
                {formError && <p className="bgi-error-text" role="alert">{formError}</p>}
              </form>
            </div>
          </div>
          {inProgress && <span role="status" className="bgi-muted">{inProgress}</span>}
          {(operationError || listError) && <InfoBar tone="danger" title={operationError || listError}/>}
          {instances?.length === 0 && <Empty icon="cloud" title="添加第一个云原神实例"
            description="点击「新建实例」，取个名字即可打开游戏。"/>}
          {instances?.map(instance => <Card key={instance.name} title={instance.name} description={instance.detail} icon="cloud"
            action={<div className="bgi-wrap">
              <Badge tone={instance.state === 'connected' ? 'success' : 'default'}>{stateText[instance.state]}</Badge>
              <Button disabled={Boolean(inProgress) || instance.state === 'starting'}
                onClick={() => change('open', instance.name)}>{actionText[instance.state]}</Button>
              <DropMenu label={instance.name + '的实例操作'} trigger={<IconButton label={instance.name + '的实例操作'}
                icon="ellipsis" disabled={Boolean(inProgress)}/>}
                items={[
                  {id: 'close', label: '关闭游戏', disabled: instance.state !== 'connected'},
                  {id: 'clear-cache', label: '清理缓存（保留登录）', disabled: instance.state !== 'stopped'},
                  {id: 'delete', label: '删除实例…', disabled: instance.state !== 'stopped', danger: true},
                ]} onSelect={id => setConfirmation({operation: id as ConfirmOperation, name: instance.name})}/>
            </div>}/>)}
        </>}
      </div>
    </Modal>
    <MessageDialog title={confirm?.title ?? ''} message={confirmation && confirm ? confirm.details(confirmation.name) : ''}
      tone="warning" open={confirmation !== undefined} onChange={next => {if (!next) setConfirmation(undefined);}}
      confirm={() => {if (confirmation) void change(confirmation.operation, confirmation.name);}}/>
    <Snackbar {...snackbar}/>
  </>;
}
