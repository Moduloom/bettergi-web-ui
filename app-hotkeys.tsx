import {useState} from 'react';
import {Button, KeyField, SearchField, Text} from './controls';
import {Tree, type TreeNode} from './collections';
import {Snackbar, useSnackbar} from './overlays';
import {useAppValue} from './app-state';
import shortcutData from './hotkey-options.json';

type Hotkey = {key: string; label: string; initial: string; global?: boolean; monitorOnly?: boolean};
type Binding = {value: string; global: boolean};
const groups = shortcutData.groups.filter(group => group.id !== 'debug');
const shortcuts: Hotkey[] = [shortcutData.lead, ...groups.flatMap(group => group.entries)];
const byKey = new Map(shortcuts.map(shortcut => [shortcut.key, shortcut]));
const monitored = new Set(['GuideBoostHotkey', 'OneKeyClaimRewardHotkey', 'OneKeyFightHotkey']);
const initial = (shortcut: Hotkey): Binding => ({value: shortcut.initial, global: Boolean(shortcut.global)});
const nodes: TreeNode[] = [
  {id: shortcutData.lead.key, label: shortcutData.lead.label},
  ...groups.map(group => ({id: group.id, label: group.label, children: group.entries.map(shortcut => ({
    id: shortcut.key, label: shortcut.label,
  }))})),
];

export function HotkeysPage() {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [stored, setStored] = useAppValue<Record<string, Binding>>('desktop-hotkeys', {});
  const {notify, snackbar} = useSnackbar();
  const query = filter.trim().toLowerCase();
  const visible = nodes.flatMap(node => {
    if (!query || node.label.toLowerCase().includes(query)) return [node];
    const children = node.children?.filter(child => child.label.toLowerCase().includes(query));
    return children?.length ? [{...node, children}] : [];
  });

  function change(shortcut: Hotkey, next: Binding) {
    if (next.global && next.value && !next.value.includes(' + ') &&
      !/^F(?:[1-9]|1\d|2[0-4])$/.test(next.value)) {
      notify('全局热键需使用组合键或功能键。', 'warning');
      return;
    }
    const conflict = next.value && shortcuts.find(other => other.key !== shortcut.key &&
      (stored[other.key] ?? initial(other)).value.toLowerCase() === next.value.toLowerCase());
    if (conflict) {
      notify('该按键已用于「' + conflict.label + '」。', 'warning');
      return;
    }
    setStored(previous => ({...previous, [shortcut.key]: next}));
  }

  return <div className="bgi-stack bgi-trigger-page">
    <h1>快捷键设置</h1>
    <Text variant="body">全局热键使用组合键或功能键。键鼠监听可使用单键，长按功能使用键鼠监听。</Text>
    <SearchField label="按功能名称筛选" value={filter} onChange={setFilter}/>
    <Tree key={query} rows={visible} selected={selected} onSelect={setSelected} label="快捷键"
      empty="没有匹配的功能" columns={{name: '功能', fields: ['快捷键类型', '配置快捷键'], render: row => {
        const shortcut = byKey.get(row.id);
        if (!shortcut) return null;
        const binding = stored[shortcut.key] ?? initial(shortcut);
        return <>
          <Button aria-label={shortcut.label + '快捷键类型'} disabled={shortcut.monitorOnly || monitored.has(row.id)}
            onClick={() => change(shortcut, {...binding, global: !binding.global})}>
            {binding.global ? '全局热键' : '键鼠监听'}
          </Button>
          <KeyField label={'配置 ' + shortcut.label} value={binding.value}
            onChange={value => change(shortcut, {...binding, value})}/>
        </>;
      }}}/>
    <Snackbar {...snackbar}/>
  </div>;
}
