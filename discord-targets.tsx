import {useLayoutEffect, useState} from 'react';
import {Button, Field, Input, Text} from './controls';
import {Empty, List, Toolbar} from './collections';
import {Modal} from './overlays';
import {SplitView} from './panels';

export type DiscordTarget = {id: string; kind: 'channel' | 'user'};
const targetKey = ({id, kind}: DiscordTarget) => kind + ':' + id;
const maxId = '18446744073709551615';

export function DiscordTargets({open, onChange, targets, onSave}: {
  open: boolean; onChange: (open: boolean) => void; targets: DiscordTarget[]; onSave: (targets: DiscordTarget[]) => void;
}) {
  const [items, setItems] = useState(targets);
  const [selected, setSelected] = useState('');
  const [width, setWidth] = useState(300);
  const [manual, setManual] = useState<DiscordTarget['kind']>();
  const [manualOpen, setManualOpen] = useState(false);
  const [input, setInput] = useState('');
  const label = manual === 'channel' ? '频道 ID' : '用户 ID';
  const id = input.trim().replace(/^0+/, '');
  const valid = /^\d{1,20}$/.test(id) && (id.length < maxId.length || id <= maxId);
  const exists = items.some(item => item.kind === manual && item.id === id);

  useLayoutEffect(() => {
    if (!open) return;
    setItems(targets);
    setSelected('');
  }, [open, targets]);

  function edit(kind: DiscordTarget['kind']) {
    setManual(kind);
    setInput('');
    setManualOpen(true);
  }

  function add() {
    if (!manual || !valid || exists) return;
    const target = {id, kind: manual};
    setItems(previous => [...previous, target]);
    setSelected(targetKey(target));
    setManualOpen(false);
  }

  return <>
    <Modal title="Discord 推送目标" open={open} onChange={onChange} wide width={980} height={700}
      actions={<div className="bgi-hardware-footer">
        <div className="bgi-wrap">
          <Button onClick={() => edit('channel')}>手动输入频道 ID</Button>
          <Button onClick={() => edit('user')}>手动输入用户 ID</Button>
        </div>
        <div className="bgi-actions">
          <Button onClick={() => onChange(false)}>取消</Button>
          <Button appearance="primary" onClick={() => {onSave(items); onChange(false);}}>确定</Button>
        </div>
      </div>}>
      <div className="bgi-stack">
        <Toolbar actions={<Button disabled title="需要连接本机 BetterGI">刷新</Button>}>
          <Text variant="caption">展开服务器可加载频道与成员</Text>
        </Toolbar>
        <SplitView embedded size={width} onResize={setWidth} start={<>
          <Empty title="暂无服务器" icon="message"/>
          <Button disabled>加入 →</Button>
        </>} end={<>
          <Toolbar actions={<Button disabled={!selected} onClick={() => {
            setItems(previous => previous.filter(item => targetKey(item) !== selected));
            setSelected('');
          }}>← 移除</Button>}><Text variant="strong">推送目标</Text></Toolbar>
          {items.length ? <List rows={items.map(item => ({id: targetKey(item), label: item.id,
            detail: item.kind === 'channel' ? '频道' : '用户', icon: item.kind === 'channel' ? 'message' : 'user'}))}
            selected={selected} onSelect={setSelected}/> : <Empty title="暂无推送目标" icon="message"/>}
        </>}/>
      </div>
    </Modal>
    <Modal title={'手动输入' + label} open={manualOpen} onChange={setManualOpen} width={420} actions={<>
      <Button onClick={() => setManualOpen(false)}>取消</Button>
      <Button appearance="primary" disabled={!valid || exists} onClick={add}>确定</Button>
    </>}>
      <Field label={label} description={exists ? '该目标已添加。' : undefined}>
        <Input aria-label={label} value={input} inputMode="numeric" onChange={event => setInput(event.currentTarget.value)}/>
      </Field>
    </Modal>
  </>;
}
