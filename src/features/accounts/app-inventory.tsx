import {useRef, useState} from 'react';
import {Button, Choice, Field, Input, IconButton, MultiSelect, NumberField, SearchField, Select, Switch, Text} from '../../components/controls';
import {DataGrid, Empty, List, SettingsActionRow, Tabs, Toolbar, type GridColumn, type Row} from '../../components/collections';
import {DropMenu, MessageDialog, Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {FileInput, saveText} from '../../components/media';
import {accountServer, useAccounts, type Account} from './account-state';
import {inventoryWatermark} from '../../components/app-images';
import {useAppValue} from '../../app/app-state';
import {saveInventory, useInventory} from './inventory-storage';
import {
  currentRecords, exportInventory, isUid, mergeInventory, readInventoryExchange, saveStock, stockRow, stockTime, validBatches,
  type Batch, type IncomingInventory, type Inventory, type InventoryItem, type StockRecord,
} from './inventory-exchange';

const views = [
  {value: 'items', label: '库存记录'}, {value: 'materials', label: '材料需求'}, {value: 'calendar', label: '活动日历'},
];
const columns: GridColumn[] = [
  {key: 'label', label: '名称', width: 156}, {key: 'detail', label: '类型', width: 112},
  {key: 'number', label: '库存', width: 94}, {key: 'recordedAt', label: '记录时间'},
  {key: 'expiresAt', label: '过期时间'}, {key: 'source', label: '来源'}, {key: 'status', label: '状态'},
];
const eventColumns: GridColumn[] = [
  {key: 'label', label: '事件', width: 156}, {key: 'recordedAt', label: '时间'},
  {key: 'detail', label: '说明'}, {key: 'status', label: '状态'},
];
type Panel = 'events' | 'dictionary' | 'details' | 'edit';

function InventoryEmpty({message}: {message: string}) {
  return <Empty title={message} artwork={<span className="bgi-inventory-watermark" aria-hidden="true"
    style={{maskImage: 'url("' + inventoryWatermark + '")'}}/>}/>;
}

export function InventoryPage({onManageAccounts}: {onManageAccounts: () => void}) {
  const [accounts, setAccounts] = useAccounts();
  const [, setDefinitions] = useAppValue<Record<string, string>>('inventory/item-definitions', {});
  const [active] = useAppValue('current-account', '');
  const [selected, setSelected] = useAppValue('inventory/selected-account', active);
  const [view, setView] = useState('items');
  const [importWindow, setImportWindow] = useState<{key: string; open: boolean}>();
  const [importTarget, setImportTarget] = useState('');
  const withUid = accounts.filter(account => isUid(account.uid));
  const account = withUid.find(item => item.id === selected) ?? withUid[0];

  function openImport() {
    setImportTarget('');
    setImportWindow({key: crypto.randomUUID(), open: true});
  }

  async function onImport(input: IncomingInventory, uid: string, dictionary: boolean) {
    const known = accounts.find(item => item.uid === uid);
    const target: Account = known ?? {id: crypto.randomUUID(), name: uid, uid, server: accountServer(account?.server ?? '')};
    let counts = {accepted: 0, duplicate: 0, rejected: 0};
    await saveInventory(target.id, previous => {
      const merged = mergeInventory(previous, input);
      counts = merged;
      return merged.data;
    });
    if (!known) setAccounts(previous => [...previous, target]);
    if (dictionary) setDefinitions(previous => ({
      ...Object.fromEntries(input.entries.filter(item => item.category).map(item => [item.label, item.category])),
      ...previous,
    }));
    setImportTarget(target.id);
    return '导入完成：接受 ' + counts.accepted + ' 项，忽略重复 ' + counts.duplicate + ' 项，新增异常 ' + counts.rejected + ' 项。';
  }

  return <>
    <Toolbar actions={<>
      {account && <Select label="选择库存账户" value={account.id}
        options={withUid.map(item => ({value: item.id, label: item.name + ' ' + item.uid}))}
        onValueChange={setSelected}/>}
      {!account && <Button icon="download" onClick={openImport}>导入库存…</Button>}
      <Button icon="user" onClick={onManageAccounts}>管理账户</Button>
    </>}>
      <Text variant="title">狛荷屋</Text>
    </Toolbar>
    <Tabs label="狛荷屋" options={views} value={view} onChange={setView}/>
    {view === 'items' ? account ?
      <AccountInventory key={account.id} account={account} openImport={openImport}/> :
      <InventoryEmpty message="账户目录中还没有填写 UID 的账户，请先在账户页填写 UID。"/> :
      <InventoryEmpty message={view === 'materials' ? '暂无材料需求' : '暂无活动'}/>}
    {importWindow && <ImportDialog key={importWindow.key} open={importWindow.open} account={account} onImport={onImport}
      onClose={() => {
        setImportWindow({...importWindow, open: false});
        if (importTarget) setSelected(importTarget);
      }}/>}
  </>;
}

function InventoryEdit({item, open, onClose, onSave}: {
  item: InventoryItem; open: boolean; onClose: () => void;
  onSave: (item: InventoryItem, batches: Batch[], dictionary: boolean, erroneous: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);
  const [batches, setBatches] = useState<Batch[]>(() => currentRecords(item)[0]?.batches ?? []);
  const [dictionary, setDictionary] = useState(false);
  const [erroneous, setErroneous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = Boolean(draft.label.trim() && draft.label.trim().length <= 128)
    && Number.isSafeInteger(draft.number) && draft.number >= 0 && validBatches(batches, draft.number);

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave({...draft, label: draft.label.trim(), detail: draft.detail.trim()}, batches, dictionary, erroneous);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法保存库存记录。');
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="编辑库存记录" open={open} onChange={value => {if (!value) onClose();}} wide
    actions={<><Button onClick={onClose} disabled={busy}>取消</Button>
      <Button appearance="primary" disabled={!valid || busy} onClick={() => void save()}>确认当前库存</Button></>}>
    <div className="bgi-stack">
      <Field label="物品名称"><Input aria-label="物品名称" maxLength={128} value={draft.label}
        onChange={event => setDraft({...draft, label: event.currentTarget.value})}/></Field>
      <Field label="物品类型（缺失时可补充）"><Input aria-label="物品类型" maxLength={128} value={draft.detail}
        onChange={event => setDraft({...draft, detail: event.currentTarget.value})}/></Field>
      <Choice label="确认将此名称添加到补充字典" checked={dictionary} onChange={setDictionary} disabled={!draft.detail.trim()}/>
      <Field label="游戏中当前实际库存数量"><NumberField label="库存数量" value={draft.number}
        max={Number.MAX_SAFE_INTEGER} onChange={number => setDraft({...draft, number})}/></Field>
      <Text variant="section">到期批次</Text>
      <Text variant="caption">数量合计不得超过总库存。到期时间须带时区，如 2026-11-02T04:00:00+08:00。</Text>
      {batches.map((batch, index) => <div className="bgi-inventory-batch" key={batch.id}>
        <Field label="批次数量"><NumberField label={'批次数量 ' + (index + 1)}
          min={1} max={Number.MAX_SAFE_INTEGER} value={batch.quantity} onChange={quantity =>
            setBatches(previous => previous.map(value => value.id === batch.id ? {...value, quantity} : value))}/></Field>
        <Field label="到期时间"><Input aria-label={'到期时间 ' + (index + 1)} value={batch.expiresAt}
          aria-invalid={Boolean(batch.expiresAt) && !stockTime(batch.expiresAt)}
          onChange={event => {
            const expiresAt = event.currentTarget.value;
            setBatches(previous => previous.map(value => value.id === batch.id ? {...value, expiresAt} : value));
          }}/></Field>
        <IconButton label={'删除批次 ' + (index + 1)} icon="trash"
          onClick={() => setBatches(previous => previous.filter(value => value.id !== batch.id))}/>
      </div>)}
      <div><Button icon="plus" disabled={batches.length >= 100} onClick={() =>
        setBatches(previous => [...previous, {id: crypto.randomUUID(), quantity: 1, expiresAt: ''}])}>添加批次</Button></div>
      <Choice label="修改后，标记上次上报有错误" checked={erroneous} onChange={setErroneous} disabled={!item.recordedAt}/>
      {batches.length > 0 && !validBatches(batches, draft.number) &&
        <p className="bgi-error-text">请核对各批次数量和到期时间。</p>}
      {error && <p className="bgi-error-text" role="alert">{error}</p>}
    </div>
  </Modal>;
}

function ImportDialog({open, account, onClose, onImport}: {
  open: boolean; account?: Account; onClose: () => void;
  onImport: (input: IncomingInventory, uid: string, dictionary: boolean) => Promise<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);
  const [file, setFile] = useState('');
  const [payload, setPayload] = useState<IncomingInventory>();
  const [uid, setUid] = useState(account?.uid ?? '');
  const [dictionary, setDictionary] = useState(true);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function read([source]: File[]) {
    if (!source) return;
    const request = ++attempt.current;
    setReport(''); setError(''); setPayload(undefined); setFile(source.name);
    try {
      if (source.size > 8 * 1024 * 1024) throw new Error('文件超过 8 MB。');
      const data = readInventoryExchange(JSON.parse((await source.text()).replace(/^\uFEFF/, '')));
      if (request !== attempt.current) return;
      setPayload(data);
      setUid(data.uid);
    } catch (reason) {
      if (request === attempt.current) setError(reason instanceof Error ? reason.message : '无法读取库存 JSON。');
    }
  }

  async function apply() {
    if (!payload || !isUid(uid) || busy) return;
    setBusy(true);
    setError('');
    try {setReport(await onImport(payload, uid, dictionary));}
    catch (reason) {setError(reason instanceof Error ? reason.message : '无法导入数据。');}
    finally {setBusy(false);}
  }

  return <Modal title="导入数据" open={open} wide onChange={value => {if (!value && !busy) onClose();}}
    actions={<><Button onClick={onClose} disabled={busy}>关闭</Button>
      <Button appearance="primary" disabled={busy || !payload || !isUid(uid) || Boolean(report)}
        onClick={() => void apply()}>导入当前库存</Button></>}>
    <div className="bgi-stack">
      <SettingsActionRow inline label="库存 JSON" description={file || '请先选择文件。'}
        action={<Button icon="folder" disabled={busy} onClick={() => input.current?.click()}>选择 JSON 文件…</Button>}/>
      <FileInput inputRef={input} accept=".json,application/json" onFiles={read}/>
      <Field label="导入到 UID" description="若不在账户目录中，确认后创建账户再导入。">
        <Input aria-label="导入到 UID" maxLength={10} inputMode="numeric" value={uid}
          onChange={event => setUid(event.currentTarget.value)} disabled={busy}/>
      </Field>
      <Text variant="caption">记录时间使用文件中的实际采集或确认时间。仅合并文件中提供的物品。</Text>
      <Choice label="使用下列分类补充本地字典空缺（不覆盖已有分类）"
        checked={dictionary} onChange={setDictionary} disabled={busy}/>
      {payload && <p className="bgi-muted">文件包含 {payload.entries.length} 项库存。</p>}
      {report && <p role="status">{report}</p>}
      {error && <p role="alert" className="bgi-error-text">{error}</p>}
    </div>
  </Modal>;
}

function DictionaryDialog({open, data, onChange, onClose}: {
  open: boolean; data: Record<string, string>; onChange: (data: Record<string, string>) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState('');
  const options = Object.entries(data).filter(([label, value]) => (label + value).includes(query.trim()));
  return <Modal title="补充字典" open={open} wide onChange={next => {if (!next) onClose();}}
    actions={<Button onClick={onClose}>关闭</Button>}>
    <div className="bgi-stack">
      <Text variant="caption">字典由所有 UID 共用。编辑不会迁移物品名称对应的库存记录。</Text>
      <Toolbar actions={<Switch label="启用编辑" checked={editing} onChange={setEditing}/>}>
        <SearchField label="搜索物品字典" value={query} onChange={setQuery}/>
      </Toolbar>
      {options.length ? <List rows={options.map(([label, detail]) => ({id: label, label, detail}))}
        selected={selected} onSelect={label => {setSelected(label); setName(label); setCategory(data[label]);}}/> :
        <Empty title={query ? '没有匹配的字典项' : '暂无补充字典'}/>}
      {editing && <form className="bgi-stack" onSubmit={event => {
        event.preventDefault();
        if (name.trim() && category.trim()) onChange({...data, [name.trim()]: category.trim()});
      }}>
        <div className="bgi-cascade">
          <Field label="物品名称"><Input aria-label="字典物品名称" maxLength={128} value={name}
            onChange={event => setName(event.currentTarget.value)}/></Field>
          <Field label="物品分类"><Input aria-label="字典物品分类" maxLength={128} value={category}
            onChange={event => setCategory(event.currentTarget.value)}/></Field>
        </div>
        <div className="bgi-actions"><Button appearance="primary" type="submit" disabled={!name.trim() || !category.trim()}>保存条目</Button></div>
      </form>}
    </div>
  </Modal>;
}

function AccountInventory({account, openImport}: {account: Account; openImport: () => void}) {
  const {data, status} = useInventory(account.id);
  const [definitions, setDefinitions] = useAppValue<Record<string, string>>('inventory/item-definitions', {});
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel>();
  const [draft, setDraft] = useState<{item: InventoryItem; key: string}>();
  const [remove, setRemove] = useState<'item' | 'all'>();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [eventId, setEventId] = useState('');
  const [showSource, setShowSource] = useAppValue('inventory/show-source-name', true);
  const {notify, snackbar} = useSnackbar();
  const search = query.trim().toLowerCase();
  const named = data.items.map(item => Object.hasOwn(definitions, item.label) ?
    {...item, detail: definitions[item.label]} : item);
  const categories = [...new Set(named.map(item => item.detail).filter(Boolean))].sort();
  const active = named.find(item => item.id === selected);
  const events = data.events.filter(event => !event.archived && (!onlyErrors || event.error));
  const detail = currentRecords(active ?? {id: '', label: '', detail: '', number: 0});

  function edit(item?: InventoryItem) {
    setDraft({key: crypto.randomUUID(), item: item ?? {id: crypto.randomUUID(), label: '', detail: '', number: 0}});
    setPanel('edit');
  }

  function close() {setPanel(undefined);}

  async function commit(item: InventoryItem, batches: Batch[], dictionary: boolean, erroneous: boolean) {
    await saveInventory(account.id, previous => {
      if (previous.items.some(value => value.id !== item.id && value.label === item.label)) {
        throw new Error('已有同名库存记录。');
      }
      const record: StockRecord = {quantity: item.number, recordedAt: new Date().toISOString(),
        source: 'manual', sourceName: '手动记录', batches};
      const next = saveStock(item, record);
      const exists = previous.items.some(value => value.id === item.id);
      const event = {id: crypto.randomUUID(), label: (exists ? '更新 ' : '新增 ') + next.label,
        date: record.recordedAt, detail: erroneous ? '上次上报已标记为错误。' : undefined};
      return {items: exists ? previous.items.map(value => value.id === item.id ? next : value) : [...previous.items, next],
        events: [event, ...previous.events]};
    });
    if (dictionary && item.detail) setDefinitions(old => ({...old, [item.label]: item.detail}));
    setSelected(item.id);
    notify('已保存库存记录', 'success');
  }

  async function erase() {
    const id = active?.id;
    try {
      await saveInventory(account.id, previous => ({...previous,
        items: remove === 'all' ? [] : previous.items.filter(item => item.id !== id)}));
      setSelected('');
      notify('已删除库存记录', 'success');
    } catch {
      notify('无法删除库存记录。', 'danger');
    }
  }

  function saveExport() {
    try {
      const pack = exportInventory(account.uid, data, definitions);
      saveText('account-records-' + account.uid + '.json', JSON.stringify(pack, null, 2));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '无法导出库存。', 'danger');
    }
  }

  const rows = named.filter(item => (!types.length || types.includes(item.detail)) &&
    (item.label + item.detail + (item.source ?? '')).toLowerCase().includes(search))
    .map(item => stockRow({...item, source: showSource ? item.source : currentRecords(item)[0]?.source}));
  const menu = [
    {id: 'events', label: '事件记录…'}, {id: 'add', label: '新增库存记录…'},
    {id: 'import', label: '导入库存…', separatorBefore: true}, {id: 'export', label: '导出库存…', disabled: !data.items.length},
    {id: 'source', label: '优先显示来源名称', checked: showSource},
    {id: 'dict', label: '查看补充字典…'}, {id: 'clear', label: '清空库存记录…', danger: true, disabled: !data.items.length},
  ];
  const rowMenu = [{id: 'details', label: '查看物品详情…', disabled: !active},
    {id: 'edit', label: '修改数量 / 修订字典', disabled: !active}, {id: 'delete', label: '删除此物品记录', danger: true, disabled: !active}];

  return <>
    <Toolbar actions={<>
      {categories.length > 0 && <MultiSelect label="全部类型" values={types} onValuesChange={setTypes}
        options={categories.map(value => ({value, label: value}))}/>}
      <DropMenu label="库存操作" items={menu} onSelect={action => {
        if (action === 'add') edit();
        if (action === 'events') setPanel('events');
        if (action === 'import') openImport();
        if (action === 'export') saveExport();
        if (action === 'source') setShowSource(!showSource);
        if (action === 'dict') setPanel('dictionary');
        if (action === 'clear') setRemove('all');
      }}/>
    </>}>
      <SearchField label="搜索记录" value={query} onChange={setQuery}/>
    </Toolbar>
    {status && <p className="bgi-error-text" role="alert">{status}</p>}
    <DropMenu label="物品操作" context items={rowMenu} onSelect={action => {
      if (action === 'details') setPanel('details');
      if (action === 'edit' && active) edit(active);
      if (action === 'delete') setRemove('item');
    }} trigger={<div onContextMenuCapture={event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-bgi-row]');
      if (row?.dataset.bgiRow) setSelected(row.dataset.bgiRow);
    }}>
      <DataGrid rows={rows} selected={selected} onSelect={setSelected} onOpen={id => {setSelected(id); setPanel('details');}}
        columns={columns} empty={<InventoryEmpty message={search ? '没有匹配的库存' : '暂无库存记录'}/>}/>
    </div>}/>
    {draft && <InventoryEdit key={draft.key} item={draft.item} open={panel === 'edit'}
      onClose={close} onSave={commit}/>}
    <DictionaryDialog open={panel === 'dictionary'} data={definitions} onChange={setDefinitions} onClose={close}/>
    <Modal title="物品详情" wide open={panel === 'details'} onChange={open => {if (!open) close();}}
      actions={<>{active && <Button onClick={() => edit(active)}>修改数量 / 修订字典</Button>}
        <Button onClick={close}>关闭</Button></>}>
      <div className="bgi-stack">
        <Text variant="section">{active?.label}</Text>
        <Text variant="caption">各来源最近一次确认记录，首条为当前库存。</Text>
        {detail.length ? <List rows={detail.map(item => ({id: item.source, label: item.sourceName,
          detail: new Date(item.recordedAt).toLocaleString('zh-CN'), status: '库存：' + item.quantity}))}/> :
          <Empty title="尚无有效库存记录"/>}
      </div>
    </Modal>
    <Modal title="事件记录" wide open={panel === 'events'} onChange={open => {if (!open) close();}}
      actions={<Button onClick={close}>关闭</Button>}>
      <div className="bgi-stack">
        <Toolbar actions={<Button disabled={!events.some(item => !item.error)} onClick={() => {
          const visible = new Set(events.filter(item => !item.error).map(item => item.id));
          void saveInventory(account.id, previous => ({...previous,
            events: previous.events.map(item => visible.has(item.id) ? {...item, archived: true} : item)}))
            .catch(() => notify('无法归档事件记录。', 'danger'));
        }}>归档列表内同类未受阻的完成事件</Button>}>
          <Choice label="仅看错误" checked={onlyErrors} onChange={setOnlyErrors}/>
        </Toolbar>
        <DataGrid rows={events.map(event => ({id: event.id, label: event.label, detail: event.detail,
          recordedAt: Number.isFinite(Date.parse(event.date)) ? new Date(event.date).toLocaleString('zh-CN') : event.date,
          status: event.error ? '异常' : '已完成'}))}
          columns={eventColumns} selected={eventId} onSelect={setEventId} empty={<Empty title="暂无事件记录"/>}/>
      </div>
    </Modal>
    <MessageDialog title={remove === 'all' ? '清空库存记录' : '删除此物品记录'}
      message={remove === 'all' ? '确定清空此账户的全部库存记录？' : '确定删除「' + (active?.label ?? '') + '」？'}
      tone="warning" open={Boolean(remove)} onChange={value => {if (!value) setRemove(undefined);}} confirm={() => void erase()}/>
    <Snackbar {...snackbar}/>
  </>;
}
