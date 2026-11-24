import type {Row} from '../../components/collections';

export type Batch = {id: string; quantity: number; expiresAt: string};
export type StockRecord = {quantity: number; recordedAt: string; source: string; sourceName: string; batches: Batch[]};
export type InventoryItem = {
  id: string; label: string; detail: string; number: number;
  recordedAt?: string; expiresAt?: string; source?: string;
  status?: string; records?: StockRecord[];
};
export type InventoryEvent = {id: string; label: string; date: string; detail?: string; error?: boolean; archived?: boolean};
export type Inventory = {items: InventoryItem[]; events: InventoryEvent[]};
export const emptyInventory: Inventory = {items: [], events: []};

type ExchangeItem = {label: string; category: string; record: StockRecord};
export type IncomingInventory = {uid: string; entries: ExchangeItem[]};
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
export const isUid = (value: string) => /^[1-9]\d{8,9}$/.test(value);

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function stockTime(value: unknown) {
  if (typeof value !== 'string' || !timestampPattern.test(value) || !Number.isFinite(Date.parse(value))) return '';
  const day = value.slice(0, 10);
  const midnight = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day ||
    Number(value.slice(11, 13)) > 23 || day.startsWith('0000')) return '';
  return new Date(value).toISOString();
}

export function validBatches(batches: readonly Batch[], quantity: number) {
  return batches.length <= 100 && batches.every(batch =>
    Number.isSafeInteger(batch.quantity) && batch.quantity > 0 && stockTime(batch.expiresAt)) &&
    batches.reduce((total, batch) => total + batch.quantity, 0) <= quantity;
}

function readBatch(value: unknown): Batch {
  const item = object(value);
  if (!item || typeof item.quantity !== 'number' || typeof item.expiresAt !== 'string') {
    throw new Error('到期批次需要包含数量和带时区的到期时间。');
  }
  return {id: crypto.randomUUID(), quantity: item.quantity, expiresAt: item.expiresAt};
}

export function readInventoryExchange(value: unknown): IncomingInventory {
  const packageData = object(value);
  const accounts = object(packageData?.accounts);
  const sources = object(packageData?.sources);
  const definitions = object(packageData?.itemDefinitions);
  if (packageData?.format !== 'BetterGI.AccountRecords' || packageData.version !== 1 ||
    !accounts || Object.keys(accounts).length !== 1 || !sources || !definitions) {
    throw new Error('仅支持单个账户的狛荷屋库存 JSON（BetterGI.AccountRecords v1）。');
  }
  const uid = Object.keys(accounts)[0];
  const body = object(accounts[uid]);
  const inventory = object(body?.inventory);
  if (!isUid(uid) || !inventory || Object.keys(inventory).length > 5000) {
    throw new Error('文件内的 UID 或库存列表无效。');
  }
  if (Array.isArray(body?.deltas) && body.deltas.length) {
    throw new Error('文件包含开发测试增量，请在桌面版的开发者导入窗口处理。');
  }

  for (const [key, origin] of Object.entries(sources)) {
    const descriptor = object(origin);
    if (!key.trim() || key.trim() !== key || key.length > 1024 ||
      descriptor?.reference !== key || typeof descriptor.displayName !== 'string') {
      throw new Error('来源字典包含无效条目。');
    }
  }
  for (const [name, item] of Object.entries(definitions)) {
    const category = object(item)?.category;
    if (!Object.hasOwn(inventory, name) || typeof category !== 'string' || !category.trim() || category.length > 128) {
      throw new Error('补充字典包含无效条目。');
    }
  }
  const entries = Object.entries(inventory).map(([label, rows]): ExchangeItem => {
    const record = Array.isArray(rows) && rows.length === 1 ? object(rows[0]) : undefined;
    const source = typeof record?.source === 'string' ? record.source : '';
    const description = Object.hasOwn(sources, source) ? object(sources[source]) : undefined;
    if (!label.trim() || label !== label.trim() || label.length > 128 || !record ||
      typeof record.quantity !== 'number' || !Number.isSafeInteger(record.quantity) ||
      typeof record.recordedAt !== 'string' || !record.recordedAt.trim() ||
      Object.hasOwn(record, 'verifiedAt') || typeof description?.displayName !== 'string') {
      throw new Error('物品「' + label + '」的记录不完整。');
    }
    if (record.expirations != null && !Array.isArray(record.expirations)) {
      throw new Error('物品「' + label + '」的到期批次不是数组。');
    }
    const category = object(definitions[label])?.category;
    return {
      label,
      category: typeof category === 'string' ? category : '',
      record: {
        quantity: record.quantity, recordedAt: record.recordedAt, source,
        sourceName: description.displayName, batches: (record.expirations ?? [] as unknown[]).map(readBatch),
      },
    };
  });
  return {uid, entries};
}

export function currentRecords(item: InventoryItem): StockRecord[] {
  if (item.records?.length) return item.records;
  if (!item.recordedAt) return [];
  return [{
    quantity: item.number, recordedAt: item.recordedAt, source: item.source ?? 'manual',
    sourceName: item.source ?? '手动记录', batches: [],
  }];
}

export function stockRow(item: InventoryItem): Row {
  const displayTime = (value?: string) => value ?
    (Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : value) : undefined;
  return {...item, recordedAt: displayTime(item.recordedAt), expiresAt: displayTime(item.expiresAt)};
}

export function saveStock(item: InventoryItem, input: StockRecord): InventoryItem {
  const record = {...input, recordedAt: stockTime(input.recordedAt) || input.recordedAt,
    batches: input.batches.map(batch => ({...batch, expiresAt: stockTime(batch.expiresAt)}))};
  const records = [record, ...currentRecords(item).filter(previous => previous.source !== record.source)]
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const newest = records[0];
  const expiresAt = newest.batches.map(batch => batch.expiresAt).sort()[0];
  return {...item, number: newest.quantity, recordedAt: newest.recordedAt, source: newest.sourceName,
    status: undefined, expiresAt, records};
}

function inventoryEvent(label: string, details?: string, error?: boolean): InventoryEvent {
  return {id: crypto.randomUUID(), label, date: new Date().toISOString(), detail: details, error};
}

export function mergeInventory(previous: Inventory, incoming: IncomingInventory) {
  const lookup = new Map(previous.items.map(item => [item.label, item]));
  const events: InventoryEvent[] = [];
  let accepted = 0;
  let duplicate = 0;
  let rejected = 0;

  for (const {label, category, record} of incoming.entries) {
    const current = lookup.get(label);
    const old = current && currentRecords(current).find(item => item.source === record.source);
    const started = stockTime(record.recordedAt);
    const invalid = !started || record.quantity < 0 || !validBatches(record.batches, record.quantity);
    const older = old && Date.parse(old.recordedAt) > Date.parse(started);
    if (invalid || older) {
      rejected++;
      const detail = invalid ? '记录时间、库存数量或到期批次无效。' : '同一来源已有时间更新的记录。';
      events.push(inventoryEvent(label, detail, true));
      if (current) lookup.set(label, {...current, status: '异常'});
      continue;
    }
    if (old && old.recordedAt === started && old.quantity === record.quantity &&
      old.batches.length === record.batches.length &&
      old.batches.every((batch, index) => batch.quantity === record.batches[index].quantity &&
        batch.expiresAt === stockTime(record.batches[index].expiresAt))) {
      duplicate++;
      continue;
    }
    accepted++;
    lookup.set(label, saveStock({...current, id: current?.id ?? crypto.randomUUID(), label,
      detail: current?.detail || category, number: current?.number ?? 0}, record));
  }
  events.unshift(inventoryEvent('导入库存', '接受 ' + accepted + ' 项，忽略重复 ' + duplicate + ' 项，新增异常 ' + rejected + ' 项。'));
  return {data: {items: [...lookup.values()], events: [...events, ...previous.events]}, accepted, duplicate, rejected};
}

export function exportInventory(uid: string, data: Inventory, definitions: Record<string, string>) {
  const sources: Record<string, {reference: string; displayName: string}> = Object.create(null);
  const itemDefinitions: Record<string, {category: string}> = Object.create(null);
  const inventory: Record<string, unknown[]> = Object.create(null);
  for (const item of data.items) {
    const latest = currentRecords(item)[0];
    if (!latest || !Number.isFinite(Date.parse(latest.recordedAt))) {
      throw new Error('物品「' + item.label + '」缺少有效记录时间，请先确认当前库存。');
    }
    sources[latest.source] = {reference: latest.source, displayName: latest.sourceName};
    const category = (Object.hasOwn(definitions, item.label) ? definitions[item.label] : '') || item.detail;
    if (category) itemDefinitions[item.label] = {category};
    inventory[item.label] = [{quantity: latest.quantity, recordedAt: new Date(latest.recordedAt).toISOString(),
      source: latest.source, ...(latest.batches.length ? {expirations: latest.batches.map(({quantity, expiresAt}) =>
      ({quantity, expiresAt}))} : {})}];
  }
  return {format: 'BetterGI.AccountRecords', version: 1, exportedAt: new Date().toISOString(),
    sources, itemDefinitions, accounts: {[uid]: {inventory}}};
}
