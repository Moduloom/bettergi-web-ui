import {useState} from 'react';
import {List, type Row} from './collections';
import {Text} from './controls';

const previewWindows: Row[] = [
  {id: 'bettergi', label: 'BetterGI', detail: 'BetterGI', icon: 'monitor'},
  {id: 'genshin', label: '原神', detail: 'YuanShen', icon: 'play'},
];

export function CapturePicker({onChoose}: {onChoose: (window: Row) => void}) {
  const [selected, setSelected] = useState('');
  return <div className="bgi-stack bgi-capture-picker">
    <Text variant="section">选择捕获窗口</Text>
    <Text variant="caption">双击选中要捕获的窗口</Text>
    <List rows={previewWindows} selected={selected} onSelect={setSelected} onActivate={id => {
      const window = previewWindows.find(item => item.id === id);
      if (window) onChoose(window);
    }}/>
  </div>;
}
