import {useMemo, useRef, useState} from 'react';
import {Button, Choice, Field, IconButton, Input, KeyField, NumberField, RadioGroup, Select, Switch, Text} from '../../components/controls';
import {Card, Empty, ReorderList, SettingsActionRow, Tabs, Toolbar} from '../../components/collections';
import {DropMenu, MessageDialog, Snackbar, useSnackbar} from '../../components/overlays';
import {CodeEditor, FileInput, saveText} from '../../components/media';
import {SplitView} from '../../components/panels';
import {OverlayScrollArea} from 'loom-frame/ui';
import {useAppValue} from '../../app/app-state';
import {exportMacro, macroCommands, mouseKeys, normalizeMacro, parseMacro, readMacroFile, templates, writeSteps,
  type Command, type Macro, type MacroMode, type Step} from './key-macro-model';

const empty: Macro[] = [];
const modes = [{value: 'once', label: '单次'}, {value: 'hold', label: '按住循环'}, {value: 'toggle', label: '切换循环'}];
const modeText = {once: '按一次快捷键执行一轮。', hold: '按住快捷键时循环，松开即停止。', toggle: '按一次启动循环，再按一次停止。'};
const tabs = [{value: 'steps', label: '步骤'}, {value: 'script', label: '脚本'}];
const mouseMenu = (['click', 'mousedown', 'mouseup', 'moveby', 'moveto', 'scroll'] as const)
  .map(id => ({id, label: macroCommands[id][0]}));
const counters: Partial<Record<Command, Array<{label: string; min: number; max: number; step?: number}>>> = {
  wait: [{label: '等待秒数', min: 0, max: 3600, step: .001}],
  scroll: [{label: '滚轮格数', min: -2147483648, max: 2147483647}],
  moveto: [{label: 'X 坐标', min: 0, max: 1920}, {label: 'Y 坐标', min: 0, max: 1080}],
  moveby: [{label: 'X 位移', min: -2147483648, max: 2147483647}, {label: 'Y 位移', min: -2147483648, max: 2147483647}],
};

type Editable = Step & {id: string};
type Document = {content: string; rows: Editable[]};

function StepControls({step, onUpdate}: {step: Editable; onUpdate: (step: Editable) => void}) {
  function arg(index: number, value: string) {
    const args = step.args.slice();
    args[index] = value;
    onUpdate({...step, args});
  }
  if (step.name === 'comment') return <Input aria-label="注释内容" value={step.comment}
    onChange={event => onUpdate({...step, comment: event.currentTarget.value})}/>;
  const mouse = ['click', 'mousedown', 'mouseup'].includes(step.name);
  const fields = counters[step.name] ?? [];
  return <>
    {['keypress', 'keydown', 'keyup'].includes(step.name) && <KeyField label="捕获按键" single value={step.args[0] ?? ''}
      onChange={key => {if (key) arg(0, key.toLowerCase());}}/>}
    {mouse && <Select label="鼠标键" value={step.args[0] ?? 'left'}
      options={mouseKeys.map(value => ({value, label: value}))} onValueChange={value => arg(0, value)}/>}
    {step.name === 'click' && <Choice label="指定坐标" checked={step.args.length === 3}
      onChange={value => onUpdate({...step, args: value ? [step.args[0] ?? 'left', '960', '540'] : [step.args[0] ?? 'left']})}/>}
    {step.name === 'click' && step.args.length === 3 && <>
      <NumberField label="X 坐标" value={Number(step.args[1])} min={0} max={1920} onChange={value => arg(1, String(Math.trunc(value)))}/>
      <NumberField label="Y 坐标" value={Number(step.args[2])} min={0} max={1080} onChange={value => arg(2, String(Math.trunc(value)))}/>
    </>}
    {fields.map(({label, min, max, step: increment}, index) => <NumberField key={label} label={label}
      value={Number(step.args[index] ?? 0)} min={min} max={max} step={increment}
      onChange={value => arg(index, String(increment ? Math.min(max, Math.max(min, value)) : Math.trunc(Math.min(max, Math.max(min, value)))))}/>)}
    {step.comment && <Input aria-label="步骤备注" value={step.comment}
      onChange={event => onUpdate({...step, comment: event.currentTarget.value})}/>}
  </>;
}

function MacroSteps({content, onChange, onRepair}: {
  content: string; onChange: (script: string) => void; onRepair: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Document>();
  const document = useMemo(() => parseMacro(content), [content]);
  const generated = useMemo(() => document.steps.map(step => ({...step, id: crypto.randomUUID()})), [document]);
  const steps = snapshot?.content === content ? snapshot.rows : generated;
  const hasErrors = document.diagnostics.length > 0;
  function apply(next: Editable[]) {
    const script = writeSteps(next);
    setSnapshot({content: script, rows: next});
    onChange(script);
  }
  function add(name: Command | 'comment') {
    const example = name === 'comment' ? {name, args: [], comment: '', line: 0} :
      parseMacro(macroCommands[name][1]).steps[0];
    if (example) apply([...steps, {...example, id: crypto.randomUUID()}]);
  }
  if (hasErrors) return <Empty title="步骤视图暂不可编辑" description="脚本中有无法解析的指令。"
    action={<Button onClick={onRepair}>去修正</Button>}/>;
  return <div className="bgi-stack">
    <div className="bgi-wrap">
      {(['keypress', 'keydown', 'keyup', 'wait'] as const).map(command =>
        <Button key={command} icon="plus" onClick={() => add(command)}>{macroCommands[command][0]}</Button>)}
      <DropMenu label="鼠标" items={mouseMenu} onSelect={name => add(name as Command)}/>
      <Button icon="plus" onClick={() => add('comment')}>注释</Button>
    </div>
    <Text variant="caption">{steps.filter(step => step.name !== 'comment').length} 条指令</Text>
    <div className="bgi-macro-steps">
      <ReorderList label="宏步骤" rows={steps.map(step => ({
        id: step.id, label: step.name === 'comment' ? '注释' : macroCommands[step.name][0],
      }))} allowRemove
        onChange={rows => apply(rows.flatMap(row => steps.find(step => step.id === row.id) ?? []))}
        renderDetails={row => {
          const step = steps.find(item => item.id === row.id);
          return step && <div className="bgi-macro-step-fields"><StepControls step={step}
            onUpdate={next => apply(steps.map(item => item.id === next.id ? next : item))}/></div>;
        }}/>
    </div>
  </div>;
}

function MacroEditor({macro, onChange, onCopy, onDelete, macros}: {
  macro: Macro; macros: readonly Macro[]; onChange: (value: Macro) => void; onCopy: () => void; onDelete: () => void;
}) {
  const [tab, setTab] = useState('steps');
  const [name, setName] = useState(macro.label);
  const [history, setHistory] = useState<{past: string[]; future: string[]}>({past: [], future: []});
  const {notify, snackbar} = useSnackbar();
  const editor = useRef<HTMLTextAreaElement>(null);
  const edits = (changes: Partial<Macro>) => onChange({...macro, ...changes});

  function rename() {
    const label = name.trim();
    if (!label || /[\\/:*?"<>|]/.test(label) || macros.some(item => item.id !== macro.id && item.label.toLowerCase() === label.toLowerCase())) {
      setName(macro.label);
      notify('请输入未使用的有效宏名称。', 'warning');
    } else if (label !== macro.label) edits({label, filename: label + '.txt'});
  }
  function write(content: string) {
    if (content === macro.content) return;
    setHistory(previous => ({past: [...previous.past.slice(-49), macro.content], future: []}));
    edits({content});
  }
  function undo() {
    const content = history.past.at(-1);
    if (content === undefined) return;
    setHistory({past: history.past.slice(0, -1), future: [macro.content, ...history.future]});
    edits({content});
  }
  function redo() {
    const content = history.future[0];
    if (content === undefined) return;
    setHistory({past: [...history.past, macro.content], future: history.future.slice(1)});
    edits({content});
  }
  function bind(hotkey: string) {
    const global = macro.hotkeyType === 'GlobalRegister';
    const supported = global ? hotkey.includes(' + ') || /^F(?:[1-9]|1\d|2[0-4])$/.test(hotkey) : !hotkey.includes(' + ');
    if (hotkey && !supported) {
      notify(global ? '全局热键使用组合键或功能键。' : '键鼠监听使用单键。', 'warning');
      return;
    }
    if (hotkey && macros.some(item => item.id !== macro.id && item.hotkey.toUpperCase() === hotkey.toUpperCase())) {
      notify('这个快捷键已用于另一个按键宏。', 'warning');
      return;
    }
    edits({hotkey});
  }
  function insert(example: string) {
    const input = editor.current;
    const start = input?.selectionStart ?? macro.content.length;
    const end = input?.selectionEnd ?? start;
    const position = start + example.length;
    write(macro.content.slice(0, start) + example + macro.content.slice(end));
    requestAnimationFrame(() => {
      input?.focus({preventScroll: true});
      input?.setSelectionRange(position, position);
    });
  }

  return <div className="bgi-stack" onKeyDown={event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (key === 'y' || event.shiftKey) redo(); else undo();
  }}>
    <Toolbar actions={<>
      <Switch label="启用" checked={macro.enabled} onChange={enabled => edits({enabled})}/>
      <Button icon="copy" onClick={onCopy}>复制</Button>
      <Button icon="download" onClick={() => saveText(macro.label + '.txt', exportMacro(macro))}>导出</Button>
      <Button icon="trash" appearance="danger" onClick={onDelete}>删除</Button>
    </>}><div className="bgi-grow"><Input aria-label="宏名称" value={name}
      onChange={event => setName(event.currentTarget.value)} onBlur={rename}
      onKeyDown={event => {if (event.key === 'Enter') event.currentTarget.blur();}}/></div></Toolbar>
    <SettingsActionRow inline label="快捷键" description="全局热键可用组合键，键鼠监听使用单键或鼠标侧键。"
      action={<>
        <Button disabled={macro.mode === 'hold'} onClick={() => edits({
          hotkey: '', hotkeyType: macro.hotkeyType === 'GlobalRegister' ? 'KeyboardMonitor' : 'GlobalRegister',
        })}>{macro.hotkeyType === 'GlobalRegister' ? '全局热键' : '键鼠监听'}</Button>
        <KeyField label="配置宏快捷键" value={macro.hotkey} single={macro.hotkeyType === 'KeyboardMonitor'} onChange={bind}/>
      </>}/>
    <SettingsActionRow inline label="触发方式" description={modeText[macro.mode]}
      action={<RadioGroup label="触发方式" inline options={modes} value={macro.mode} onChange={value => {
        const mode = value as MacroMode;
        edits(mode === 'hold' ? {mode, hotkeyType: 'KeyboardMonitor',
          hotkey: macro.hotkeyType === 'GlobalRegister' ? '' : macro.hotkey} : {mode});
      }}/>}/>
    <Tabs label="宏编辑" options={tabs} value={tab} onChange={setTab}/>
    <div className="bgi-wrap"><IconButton icon="rotate" label="撤销" disabled={!history.past.length} onClick={undo}/>
      <IconButton icon="rotate" label="重做" className="bgi-macro-redo" disabled={!history.future.length} onClick={redo}/>
    </div>
    {tab === 'steps' ? <MacroSteps content={macro.content} onChange={write} onRepair={() => setTab('script')}/> :
      <div className="bgi-stack">
        <CodeEditor label="宏脚本" value={macro.content} onChange={write} language="keymacro" editorRef={editor}/>
        <Text variant="caption">语法速查（点击插入）</Text>
        <div className="bgi-wrap">{Object.values(macroCommands).map(([, example, description]) =>
          <Button key={example} title={description} onClick={() => insert(example)}>{example}</Button>)}</div>
      </div>}
    <Snackbar {...snackbar}/>
  </div>;
}

export function KeyMacroPage() {
  const [enabled, setEnabled] = useAppValue('key-macro/enabled', true);
  const [stored, setStored] = useAppValue('library/key-macros', empty);
  const [selected, setSelected] = useState('');
  const [pane, setPane] = useState(220);
  const [remove, setRemove] = useState<Macro>();
  const picker = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const macros = stored.map(normalizeMacro);
  const chosen = macros.find(item => item.id === selected) ?? macros[0];

  function append(items: Macro[]) {
    const names = new Set(macros.map(item => item.label.toLowerCase()));
    const copies = items.map(item => {
      const base = item.label || '新建宏';
      let label = base;
      for (let index = 2; names.has(label.toLowerCase()); index++) label = base + ' ' + index;
      names.add(label.toLowerCase());
      return {...item, label, filename: label + '.txt'};
    });
    setStored(previous => [...previous, ...copies]);
    setSelected(copies[0].id);
  }
  function create(id: string) {
    const example = templates.find(item => item.id === id);
    if (example) append([normalizeMacro({id: crypto.randomUUID(), label: example.name, content: example.script, mode: example.mode})]);
  }
  function update(next: Macro) {
    setStored(previous => previous.map(item => item.id === next.id ? next : item));
  }
  async function importFiles(files: File[]) {
    try {
      const items = await Promise.all(files.map(async file => readMacroFile(file.name, await file.text())));
      if (items.length) {append(items); notify('已导入按键宏，请重新设置快捷键。', 'success');}
    } catch {notify('无法读取宏文件。', 'danger');}
  }
  return <div className="bgi-stack bgi-trigger-page">
    <Toolbar actions={<Switch label="按键宏总开关" checked={enabled} onChange={setEnabled} showLabel={false}/>}>
      <h1>按键宏</h1>
    </Toolbar>
    <Text variant="caption">按快捷键直接执行键鼠序列。桌面版将每个宏保存为 User\BgiMacro 下的 txt 文件。</Text>
    <SplitView size={pane} onResize={setPane} start={<>
      <div className="bgi-wrap">
        <DropMenu label="新建" items={templates} onSelect={create}/>
        <Button icon="download" onClick={() => picker.current?.click()}>导入</Button>
        <FileInput inputRef={picker} accept=".txt,text/plain" multiple onFiles={importFiles}/>
      </div>
      {macros.length ? <OverlayScrollArea areaClassName="bgi-macro-list" className="bgi-stack">
        {macros.map(item => <Card key={item.id} title={item.label} description={(item.hotkey || '未设置快捷键') + ' · ' +
          (modes.find(mode => mode.value === item.mode)?.label ?? '单次')} selected={chosen?.id === item.id}
          onSelect={() => setSelected(item.id)} action={<Switch label={'启用 ' + item.label} showLabel={false}
            checked={item.enabled} onChange={value => update({...item, enabled: value})}/>}/>)}
      </OverlayScrollArea> : <Empty title="还没有按键宏" description="点击「新建」从模板开始，或导入 txt 文件。"/>}
      <Text variant="caption">停止当前脚本的快捷键也会停止正在运行的按键宏。</Text>
    </>} end={chosen ? <MacroEditor key={chosen.id} macro={chosen} macros={macros} onChange={update}
      onCopy={() => append([{...chosen, id: crypto.randomUUID(), label: chosen.label + ' 副本', hotkey: ''}])}
      onDelete={() => setRemove(chosen)}/> : <Empty title="选择左侧的宏进行编辑，或点击「新建」。"/>}/>
    <MessageDialog title="删除按键宏" message={'确定删除「' + (remove?.label ?? '') + '」？'} tone="warning"
      open={Boolean(remove)} onChange={value => {if (!value) setRemove(undefined);}}
      confirm={() => {setStored(previous => previous.filter(item => item.id !== remove?.id)); setSelected('');}}/>
    <Snackbar {...snackbar}/>
  </div>;
}
