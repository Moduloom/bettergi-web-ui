import {useEffect, useRef, useState} from 'react';
import {Button, Field, Input, InputActionRow, Select, Text} from './controls';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {DataGrid, Empty, List, ReorderList, SettingsActionRow, SettingsRow, Tabs, Toolbar, type Row} from './collections';
import {FileInput, Image} from './media';
import {SplitView} from './panels';
import {accountServer, servers, useAccounts, type Account} from './account-state';
import {clearAppValue, useAppValue} from './app-state';
import {useStoredPicture, writePicture} from './app-images';
import type {TaskPlan} from './plan-model';
import {isUid} from './inventory-exchange';
import {removeInventory} from './inventory-storage';

const choices = [
  {value: 'overview', label: '概况'}, {value: 'login', label: '登录资料'},
  {value: 'cooldown', label: '路线 CD'}, {value: 'boss', label: '首领领奖'},
  {value: 'inventory', label: '狛荷屋'},
];
const loginModes = [
  {value: 'automatic', label: '自动：图片 → 列表文字 → 可选密码'}, {value: 'image', label: '账户图片'},
  {value: 'list', label: '列表文字'}, {value: 'password', label: '账号密码'},
];
type PlanUsage = Pick<TaskPlan, 'id' | 'name' | 'account'>;
type Cooldown = {id: string; title: string; status: string; availableAt?: string};
type BossCount = {id: string; plan: string; task: string; count: number};

function AccountDetails({account, accounts, active, onSave, navigate}: {
  account: Account; accounts: readonly Account[]; active: boolean;
  onSave: (next: Account) => void; navigate: (route: string) => void;
}) {
  const [tab, setTab] = useState('overview');
  const [draft, setDraft] = useState(account);
  const [file, setFile] = useState<File>();
  const [imagePreview, setImagePreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [plans] = useAppValue<PlanUsage[]>('plans/plan', []);
  const [dragons] = useAppValue<PlanUsage[]>('plans/new-dragon', []);
  const [cooldowns, setCooldowns] = useAppValue<Cooldown[]>('pulonia/cooldown/' + account.id, []);
  const [bosses] = useAppValue<BossCount[]>('pulonia/boss-counts/' + account.id, []);
  const [removeCd, setRemoveCd] = useState(false);
  const [,setInventorySelection] = useAppValue('inventory/selected-account', '');
  const picture = useStoredPicture('account/' + account.id);
  const input = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const currentMode = draft.loginMode ?? 'automatic';
  const dirty = Boolean(file) || JSON.stringify(draft) !== JSON.stringify(account);
  const usages: Row[] = [...plans, ...dragons].filter(plan => plan.account === account.id)
    .map(plan => ({id: plan.id, label: plan.name, icon: 'layers'}));

  useEffect(() => {
    if (!file) {setImagePreview(''); return;}
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function change(fields: Partial<Account>) {
    setError('');
    setDraft(old => ({...old, ...fields}));
  }

  async function save() {
    const name = draft.name.trim();
    const uid = draft.uid.trim();
    if (!name) {setError('请输入账户名称。'); return;}
    if (uid && !isUid(uid)) {setError('请输入完整的 9 或 10 位 UID。'); return;}
    if (accounts.some(item => item.id !== account.id && item.uid === uid)) {
      setError(uid ? '这个 UID 已经存在。' : '目录中最多保留一个未填写 UID 的账户。');
      return;
    }
    setBusy(true);
    try {
      if (file) await picture.update(file);
      const saved = {...draft, name, uid, server: accountServer(draft.server)};
      onSave(saved);
      setDraft(saved);
      setFile(undefined);
      notify('已保存账户', 'success');
    } catch {
      setError('无法保存账户图片。');
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setDraft(account);
    setFile(undefined);
    setError('');
  }

  return <div className="bgi-stack">
    <Toolbar actions={dirty && <span className="bgi-muted" role="status">未保存</span>}>
      <Text variant="section">{account.name}</Text>
    </Toolbar>
    <Tabs label="账户详情" options={choices} value={tab} onChange={setTab}/>
    {tab === 'overview' && <>
      <Field label="账户名称"><Input aria-label="账户名称" value={draft.name}
        onChange={event => change({name: event.currentTarget.value})}/></Field>
      <Field label="UID" description="完整的 9 或 10 位数字，不能与其他账户重复。目录中最多一个账户可以不填 UID。">
        <InputActionRow>
          <Input aria-label="UID" inputMode="numeric" maxLength={10} value={draft.uid}
            onChange={event => change({uid: event.currentTarget.value})}/>
          <Button disabled title="需要本机 BetterGI 的账户接口">从当前游戏读取</Button>
        </InputActionRow>
      </Field>
      <Field label="服务器" description="决定这个账户的路线 CD 按哪个时区日切。">
        <Select label="服务器" value={accountServer(draft.server)} options={servers}
          onValueChange={server => change({server})}/>
      </Field>
      <SettingsRow inline label="作为哪些实例的当前账户" description={active ? '本实例' : '暂无'}/>
      <SettingsRow inline label="最近一次运行" description="暂无运行记录"/>
      <Text variant="section">指定了该账户的计划</Text>
      {usages.length ? <List rows={usages}/> :
        <p className="bgi-muted">没有计划指定这个账户。跟随当前账户的计划为各实例的当前账户运行。</p>}
    </>}
    {tab === 'login' && <>
      <Text variant="body">只有需要 BetterGI 自动切换到这个账户时才需要填写。自动切换只支持本机 PC 官服窗口。</Text>
      <Field label="登录方式"><Select label="登录方式" value={currentMode}
        onValueChange={loginMode => change({loginMode})} options={loginModes}/></Field>
      <Field label="登录列表中的账号文字" description="按登录列表填写脱敏手机号或邮箱。">
        <Input aria-label="登录列表中的账号文字" value={draft.loginText ?? ''}
          onChange={event => change({loginText: event.currentTarget.value})}/>
      </Field>
      <SettingsActionRow inline label="账户图片" description={file?.name ?? (picture.name || '尚未导入')}
        action={<>
          <Button icon="image" onClick={() => input.current?.click()}>导入图片</Button>
          <Button disabled title="需要本机 BetterGI 截图接口">采集当前账户图片</Button>
          <FileInput inputRef={input} accept="image/png,image/jpeg,image/bmp,image/webp" onFiles={([next]) => {
            if (!next || !next.type.startsWith('image/')) {setError('请选择支持的图片格式。'); return;}
            const url = URL.createObjectURL(next);
            const image = new window.Image();
            image.src = url;
            void image.decode().then(() => {setFile(next); setError('');})
              .catch(() => setError('无法打开这张图片。')).finally(() => URL.revokeObjectURL(url));
          }}/>
        </>}/>
      {(imagePreview || picture.url) && <Image src={imagePreview || picture.url}
        alt="账户图片" className="bgi-account-image" fit="contain"/>}
      <Field label="账号和密码（可选，作为备用登录方式）" description="密码由 Windows 凭据管理器保存。">
        <div className="bgi-stack">
          <Input aria-label="账号" placeholder="账号" disabled/>
          <Input aria-label="密码" placeholder="密码" type="password" disabled/>
        </div>
      </Field>
      <div className="bgi-actions"><Button disabled title="需要本机 BetterGI 的登录切换接口">测试切换</Button></div>
    </>}
    {tab === 'cooldown' && <>
      <Toolbar actions={<Button disabled={!cooldowns.length} onClick={() => setRemoveCd(true)}>清除记录</Button>}>
        <Text variant="section">路线 CD</Text>
      </Toolbar>
      {cooldowns.length ? <List rows={cooldowns.map(item => ({
        id: item.id, label: item.title, detail: item.availableAt, status: item.status, icon: 'clock',
      }))}/> : <Empty title="暂无路线 CD 记录"/>}
    </>}
    {tab === 'boss' && <>
      <Toolbar actions={<Button icon="rotate" disabled title="累计领奖数据由本机 BetterGI 更新">刷新</Button>}>
        <Text variant="section">首领领奖</Text>
      </Toolbar>
      <DataGrid rows={bosses.map(item => ({id: item.id, label: item.plan, detail: item.task, number: item.count}))}
        columns={[{key: 'label', label: '计划'}, {key: 'detail', label: '任务'}, {key: 'number', label: '累计成功领奖'}]}
        empty={<Empty title="暂无首领领奖记录"/>}/>
    </>}
    {tab === 'inventory' && <>
      <Text variant="section">狛荷屋</Text>
      <Text variant="body">狛荷屋按 UID 记录这个账户的库存、异常和事件。</Text>
      <div><Button disabled={!account.uid} onClick={() => {setInventorySelection(account.id); navigate('inventory');}}>打开狛荷屋</Button></div>
    </>}
    {error && <p className="bgi-error-text" role="alert">{error}</p>}
    {dirty && <div className="bgi-actions">
      <Button disabled={busy} onClick={discard}>放弃修改</Button>
      <Button appearance="primary" disabled={busy} onClick={() => void save()}>保存</Button>
    </div>}
    <MessageDialog title="清除路线 CD 记录" message="确定清除这个账户的路线 CD 记录？"
      tone="warning" open={removeCd} onChange={setRemoveCd} confirm={() => setCooldowns([])}/>
    <Snackbar {...snackbar}/>
  </div>;
}

export function AccountPage({navigate}: {navigate: (route: string) => void}) {
  const [accounts, setAccounts] = useAccounts();
  const [active, setActive] = useAppValue('current-account', '');
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [form, setForm] = useState<'create' | 'rename' | null>(null);
  const [remove, setRemove] = useState<Account>();
  const [width, setWidth] = useState(190);
  const [notice, setNotice] = useState('');
  const account = accounts.find(item => item.id === selected) ?? accounts[0];

  function open(operation: 'create' | 'rename', id?: string) {
    const target = id ? accounts.find(item => item.id === id) : account;
    if (target && id) setSelected(target.id);
    setName(operation === 'rename' ? target?.name ?? '' : '');
    setForm(operation);
    setNotice('');
  }

  function persist(next: Account) {
    setAccounts(previous => previous.map(item => item.id === next.id ? next : item));
  }

  function saveName() {
    if (!name.trim()) return;
    if (form === 'rename' && account) persist({...account, name: name.trim()});
    else {
      if (accounts.some(item => !item.uid)) {setNotice('现有账户还未填写 UID。请先填写再新增。'); return;}
      const next = {id: crypto.randomUUID(), name: name.trim(), uid: '', server: 'cn'};
      setAccounts(previous => [...previous, next]);
      setSelected(next.id);
    }
    setForm(null);
  }

  async function erase() {
    if (!remove) return;
    try {
      await writePicture('account/' + remove.id);
      await removeInventory(remove.id);
      clearAppValue('pulonia/cooldown/' + remove.id);
      clearAppValue('pulonia/boss-counts/' + remove.id);
      setAccounts(previous => previous.filter(item => item.id !== remove.id));
      if (active === remove.id) setActive('');
      if (selected === remove.id) setSelected('');
    } catch {
      setNotice('无法清除这个账户的本地资料，账户仍保留。');
    }
  }

  return <>
    <Toolbar actions={<Button appearance="primary" icon="plus" onClick={() => open('create')}>新增账户</Button>}>
      <Text variant="title">账户</Text>
    </Toolbar>
    <SettingsRow inline label="本实例当前账户" control={<Select label="本实例当前账户"
      value={accounts.some(value => value.id === active) ? active : ''}
      options={[{value: '', label: '未选择'}, ...accounts.map(item => ({value: item.id, label: item.name}))]}
      onValueChange={setActive}/>}/>
    {accounts.length ? <SplitView size={width} onResize={setWidth}
      start={<>
        <ReorderList label="账户列表" rows={accounts.map(item => ({
          id: item.id, label: item.name, detail: item.uid, icon: 'user',
        }))} onSelect={setSelected} onEdit={id => open('rename', id)} selected={account?.id}
          onChange={rows => setAccounts(rows.flatMap(row => accounts.find(item => item.id === row.id) ?? []))}/>
        {account && <DropMenu label="账户操作" items={[
          {id: 'rename', label: '改名…'}, {id: 'delete', label: '删除账户…', danger: true},
        ]} onSelect={id => {if (id === 'rename') open('rename'); else setRemove(account);}}/>}
      </>}
      end={account && <AccountDetails key={account.id + '/' + account.name} account={account} accounts={accounts}
        active={active === account.id} onSave={persist} navigate={navigate}/>}/> :
      <Empty title="还没有账户"/>}
    {!form && notice && <p className="bgi-error-text" role="alert">{notice}</p>}
    <Modal title={form === 'rename' ? '改名' : '新增账户'} open={form !== null}
      onChange={value => {if (!value) setForm(null);}}
      actions={<><Button onClick={() => setForm(null)}>取消</Button>
        <Button appearance="primary" type="submit" form="bgi-accounts-name" disabled={!name.trim()}>
          {form === 'rename' ? '保存' : '新增'}
        </Button></>}>
      <form id="bgi-accounts-name" className="bgi-stack" onSubmit={event => {event.preventDefault(); saveName();}}>
        <Field label="账户名称"><Input aria-label="账户名称" value={name}
          onChange={event => {setName(event.currentTarget.value); setNotice('');}}/></Field>
        {notice && <p className="bgi-error-text" role="alert">{notice}</p>}
      </form>
    </Modal>
    <MessageDialog title="删除账户" message={'确定删除「' + (remove?.name ?? '') + '」及其库存与路线 CD 记录？'}
      tone="warning" open={Boolean(remove)} onChange={value => {if (!value) setRemove(undefined);}}
      confirm={() => void erase()}/>
  </>;
}
