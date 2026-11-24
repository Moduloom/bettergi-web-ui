import {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {OverlayScrollArea, Popover} from 'loom-frame/ui';
import {Button, Icon, IconButton, SearchField, Select, Text} from '../../components/controls';
import {Empty, List, Toolbar, type Row} from '../../components/collections';
import {FileInput} from '../../components/media';
import {useAppValue} from '../../app/app-state';

type Category = 'auto' | 'combo' | 'text' | 'json' | 'recordings';
export type Strategy = {path: string; label: string; kind: 'text' | 'json' | 'recordings'; value?: string; modified?: number; created?: number};
export const NativeStrategySource = createContext<((signal: AbortSignal) => Promise<Strategy[]>) | undefined>(undefined);
const automatic = '根据队伍自动选择';
const combo = '自动连招';
const categories: Row[] = [
  {id: 'auto', label: '按队伍匹配', icon: 'activity', group: '自动'},
  {id: 'combo', label: '自动连招（实验）', icon: 'layers', group: '自动'},
  {id: 'text', label: '文本策略', icon: 'file', group: '手动选择'},
  {id: 'json', label: 'JSON 策略', icon: 'fileCode', group: '手动选择'},
  {id: 'recordings', label: '键鼠录制', icon: 'monitor', group: '手动选择'},
];
const sorting = [{value: 'name', label: '名称'}, {value: 'modified', label: '最近修改'}, {value: 'created', label: '创建时间'}];
const demoStrategies: Strategy[] = [
  {path: '常规探索队.txt', label: '常规探索队', kind: 'text'},
  {path: '速切队.json', label: '速切队', kind: 'json'},
];

function strategyValue(item: Strategy) {
  return item.value ?? ((item.kind === 'recordings' ? 'keymouse:' : '') + item.path);
}

function matchesStrategy(item: Strategy, normalized: string) {
  return strategyValue(item) === normalized || ((item.kind === 'recordings' ? 'keymouse:' : '') + item.path) === normalized;
}

export function StrategyPicker({value, onChange, demo = false, allowed = ['auto', 'combo', 'text', 'json', 'recordings'],
  onRepository, onRecordings}: {
  value: string; onChange: (value: string) => void; demo?: boolean; allowed?: readonly Category[];
  onRepository?: () => void; onRecordings?: () => void;
}) {
  const [imported, setImported] = useAppValue<Strategy[]>('tasks/strategy-library', []);
  const [recordings] = useAppValue<{filename: string; label: string}[]>('library/recordings', []);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>(allowed[0] ?? 'auto');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [directory, setDirectory] = useState('');
  const nativeSource = useContext(NativeStrategySource);
  const [nativeEntries, setNativeEntries] = useState<Strategy[]>();
  const [nativeError, setNativeError] = useState('');
  const [revision, setRevision] = useState(0);
  const locateNativeSelection = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const normalized = value.replaceAll('\\', '/');
  useEffect(() => {
    if (!nativeSource || !open || demo) return;
    const controller = new AbortController();
    void nativeSource(controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setNativeEntries(next);
      setNativeError('');
      if (locateNativeSelection.current) {
        locateNativeSelection.current = false;
        const saved = next.find(entry => allowed.includes(entry.kind) && matchesStrategy(entry, normalized));
        if (saved) {
          setCategory(saved.kind);
          setDirectory(saved.path.split('/').slice(0, -1).join('/'));
          setSort(saved.kind === 'recordings' ? 'created' : 'name');
        }
      }
    }).catch(() => {
      if (!controller.signal.aborted) setNativeError('无法读取本机策略列表。');
    });
    return () => controller.abort();
  }, [nativeSource, open, revision, demo, normalized]);
  const entries = useMemo(() => [
    ...(demo ? demoStrategies : imported),
    ...recordings.map((item): Strategy => ({path: item.filename, label: item.label, kind: 'recordings'})),
  ], [demo, imported, recordings]);
  const available = nativeSource && !demo ? nativeEntries ?? [] : entries;

  const isAutomatic = !value || value === 'default' || value === automatic || value.startsWith('auto:');
  const isCombo = value === combo;
  const folder = value.startsWith('auto:') ? value.slice(5) : '';
  const current = available.find(entry => matchesStrategy(entry, normalized));
  const warning = isCombo ? !allowed.includes('combo') : !isAutomatic && !current && (!nativeSource || nativeEntries !== undefined);
  const shownDirectory = current?.path.split('/').slice(0, -1).join(' / ');
  const label = isAutomatic ? '按队伍匹配' + (folder ? ' · ' + folder : '') :
    isCombo ? combo : current?.label ?? value + '（不存在）';
  const badge = warning ? '!' : isAutomatic || isCombo ? '自动' : current?.kind === 'text' ? 'txt' :
    current?.kind === 'recordings' ? '键鼠' : 'JSON';
  const textEntries = available.filter(entry => entry.kind === 'text');
  const scopes = new Set<string>();
  for (const entry of textEntries) {
    const pieces = entry.path.split('/').slice(0, -1);
    pieces.forEach((_, index) => scopes.add(pieces.slice(0, index + 1).join('/')));
  }

  function chooseCategory(next: Category, path = '') {
    locateNativeSelection.current = false;
    setCategory(next);
    setDirectory(path);
    setSort(next === 'recordings' ? 'created' : 'name');
  }

  function reveal(next: boolean) {
    if (next) {
      setQuery('');
      const active = isAutomatic ? 'auto' : isCombo ? 'combo' : current?.kind ?? allowed[0];
      const initial = active && allowed.includes(active) ? active : allowed[0] ?? 'auto';
      chooseCategory(initial, current?.path.split('/').slice(0, -1).join('/') ?? '');
      locateNativeSelection.current = Boolean(nativeSource && !nativeEntries && !isAutomatic && !isCombo);
    }
    setOpen(next);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus({preventScroll: true});
  }

  function load(files: File[]) {
    const selected = files.flatMap((entry): Strategy[] => {
      const source = entry.webkitRelativePath || entry.name;
      if (!/\.(txt|json)$/i.test(source)) return [];
      const path = source.includes('/') ? source.split('/').slice(1).join('/') : source;
      return [{path, label: (path.split('/').at(-1) ?? path).replace(/\.(txt|json)$/i, ''),
        kind: /\.txt$/i.test(path) ? 'text' : 'json', modified: entry.lastModified}];
    });
    if (!selected.length) return;
    setImported(previous => [...new Map([...previous, ...selected].map(entry => [entry.path, entry])).values()]);
  }

  const search = query.trim().toLowerCase();
  const belongs = (item: Strategy) => item.kind === category && (!directory || item.path.startsWith(directory + '/'));
  const listed = available.filter(item => search ? item.kind === category &&
    (item.label + item.path).toLowerCase().includes(search) : belongs(item));
  const folders = new Set<string>();
  const shown = listed.filter(item => {
    if (search) return true;
    const relative = directory ? item.path.slice(directory.length + 1) : item.path;
    const slash = relative.indexOf('/');
    if (slash === -1) return true;
    folders.add((directory ? directory + '/' : '') + relative.slice(0, slash));
    return false;
  });
  shown.sort((a, b) => (sort === 'modified' ? (b.modified ?? 0) - (a.modified ?? 0) :
    sort === 'created' ? (b.created ?? 0) - (a.created ?? 0) : 0) || a.label.localeCompare(b.label, 'zh-CN'));
  const leaf: Row[] = [
    ...Array.from(folders).sort((a, b) => a.localeCompare(b, 'zh-CN')).map((path): Row => ({
      id: 'folder:' + path, label: path.split('/').at(-1) ?? path, icon: 'folder',
      status: String(entries.filter(item => item.kind === category && item.path.startsWith(path + '/')).length),
    })),
    ...shown.map((item): Row => ({id: strategyValue(item), label: item.label, detail: item.path,
      status: item.kind === 'text' ? 'txt' : item.kind === 'recordings' ? '键鼠' : 'JSON'})),
  ];
  const alternatives = search ? categories.filter(item => item.id !== category && allowed.includes(item.id as Category))
    .map(item => ({...item, count: available.filter(entry => entry.kind === item.id &&
      (entry.label + entry.path).toLowerCase().includes(search)).length})).filter(item => item.count > 0) : [];

  return <Popover label="战斗策略" open={open} onOpenChange={reveal} offset={4} align="end"
    anchorClassName="bgi-strategy-anchor" className="bgi-flyout bgi-strategy-popup" animatePresence escapeRestoresFocus
    trigger={<Button ref={trigger} className="bgi-strategy-trigger" data-warning={warning || undefined}
      aria-label={'战斗策略：' + badge + ' ' + label}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') {event.preventDefault(); reveal(true);}
      }}>
      <span className="bgi-strategy-badge" data-automatic={isAutomatic || isCombo}>{badge}</span>
      <span className="bgi-truncate" title={current?.path ?? label}>
        {shownDirectory && <span className="bgi-muted">{shownDirectory} / </span>}{label}
      </span>
      <Icon name="expand" size={14}/>
    </Button>}>
    <div className="bgi-strategy-layout">
      <div className="bgi-strategy-sidebar">
        <OverlayScrollArea><List scroll={false} rows={categories.filter(item => allowed.includes(item.id as Category))
          .map(item => ({...item, status: ['text', 'json', 'recordings'].includes(item.id) ?
            String(available.filter(entry => entry.kind === item.id).length) : undefined}))}
          selected={category} onSelect={id => chooseCategory(id as Category)} grouped/></OverlayScrollArea>
      </div>
      <div className="bgi-strategy-content">
        <OverlayScrollArea className="bgi-strategy-content-inner">
          {warning && <Text variant="caption">{isCombo ? '当前入口不支持自动连招。' : '当前值不存在：' + value}</Text>}
          {nativeError && nativeSource && <Text variant="caption">{nativeError}</Text>}
          {category === 'auto' ? <div className="bgi-stack">
            <Text variant="section">按队伍匹配</Text>
            <Text variant="caption">开始战斗时识别当前队伍，从下方范围的文本策略中选择匹配角色最多的一个。JSON 与键鼠录制不参与。</Text>
            <hr className="bgi-divider"/>
            <Text variant="caption">匹配范围（点击即选用）</Text>
            <List scroll={false} rows={[
              {id: automatic, label: '全部文本策略', icon: 'folder', status: String(textEntries.length)},
              ...Array.from(scopes).sort().map((path): Row => ({id: 'auto:' + path, label: path,
                icon: 'folder', status: String(textEntries.filter(item => item.path.startsWith(path + '/')).length)})),
            ]} selected={folder ? 'auto:' + folder.replaceAll('\\', '/') : isAutomatic ? automatic : ''} onSelect={choose}/>
            <Text variant="caption">选中子目录后，只在该目录及其子目录中按队伍匹配。</Text>
          </div> : category === 'combo' ? <div className="bgi-stack">
            <Text variant="section">自动连招（实验）</Text>
            <Text variant="caption">根据已构建的连招树自动战斗。首次使用请先完成队伍配置并构建连招树。</Text>
            <div><Button appearance="primary" onClick={() => choose(combo)}>选用自动连招</Button></div>
          </div> : <div className="bgi-stack">
            <Toolbar actions={<Select label="策略排序" value={sort} options={sorting} onValueChange={setSort}/>}>
              <div className="bgi-grow"><SearchField label="搜索策略名称或路径…" value={query} onChange={setQuery}/></div>
            </Toolbar>
            {directory && !search && <div className="bgi-wrap">
              <IconButton icon="back" label="返回上一级" appearance="transparent"
                onClick={() => setDirectory(directory.split('/').slice(0, -1).join('/'))}/>
              <Text variant="caption">{directory.split('/').join(' / ')}</Text>
            </div>}
            {leaf.length ? <List scroll={false} rows={leaf} selected={current ? strategyValue(current) : normalized}
              onSelect={id => id.startsWith('folder:') ? setDirectory(id.slice(7)) : choose(id)}/> :
              <Empty title={search ? '没有找到匹配的策略' : '暂无策略'} description={search ?
                '可切换左侧其他类别查看。' : category === 'recordings' ? '还没有键鼠录制。' :
                  '把文件放进目录，或从脚本仓库订阅。'}/>}
            {alternatives.map(item => <Button key={item.id} appearance="transparent"
              onClick={() => chooseCategory(item.id as Category)}>
              在 {item.label} 中找到 {item.count} 项
            </Button>)}
          </div>}
        </OverlayScrollArea>
      </div>
      <footer className="bgi-strategy-footer">
        {(!nativeSource || demo) && <>
          <Button icon="folder" appearance="transparent" onClick={() => file.current?.click()}>打开目录</Button>
          <FileInput inputRef={file} onFiles={load} directory multiple/>
        </>}
        {category !== 'combo' && category !== 'recordings' && <Button icon="package" appearance="transparent"
          onClick={() => {setOpen(false); onRepository?.();}} disabled={!onRepository}>脚本仓库</Button>}
        {category === 'recordings' && <>
          <Button appearance="transparent" disabled>录制新的</Button>
          <Button appearance="transparent" onClick={() => {setOpen(false); onRecordings?.();}} disabled={!onRecordings}>录制管理</Button>
        </>}
        <IconButton className="bgi-strategy-refresh" icon="rotate" appearance="transparent"
          label="刷新策略列表" onClick={() => nativeSource && !demo ? setRevision(value => value + 1) : file.current?.click()}/>
      </footer>
    </div>
  </Popover>;
}
