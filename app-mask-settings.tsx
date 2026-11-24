import {useRef, useState} from 'react';
import {useAppValue} from './app-state';
import {useStoredPicture} from './app-images';
import {Button, Choice, Input, NumberField, Select, Slider, Switch, Text} from './controls';
import {Expander, SettingsActionRow, SettingsList, SettingsRow} from './collections';
import {FileInput} from './media';
import {maskStyleGroups, type MaskField, type MaskStyleGroup} from './mask-style-fields';

const scope = 'settings/遮罩窗口/';
const nativeOnly = '需要连接本机 BetterGI';
const crosshairOptions = ['十字准星', '倒 V 字准星', '圆点准星', '中心点十字', '自定义准星']
  .map(value => ({value, label: value === '倒 V 字准星' ? '倒V字准星' : value}));
const crosshairScales = [{value: 'original', label: '原图'}, {value: 'fit', label: '自适应'}];
const crosshairTerms = ['启用准星', '准星类型', '准星颜色', '线宽', '大小', '中心点间隔', '选择图片', '缩放方式'];
const colors = [
  ['#00000000', '透明'], ['#01000000', '几乎透明黑色'], ['#33000000', '半透明黑色'],
  ['LightGray', '浅灰色'], ['White', '白色'], ['Black', '黑色'], ['#FF000000', '纯黑色'],
  ['LightGreen', '浅绿色'], ['Green', '绿色'], ['Red', '红色'], ['Orange', '橙色'],
  ['Yellow', '黄色'], ['DeepSkyBlue', '天蓝色'], ['DodgerBlue', '蓝色'], ['Purple', '紫色'], ['HotPink', '粉色'],
].map(([value, label]) => ({value, label}));
const colorOptions = [...colors, {value: 'custom', label: '自定义'}];
const metrics = [
  ['游戏帧率', true], ['处理耗时', true], ['峰值耗时', true], ['截图耗时', true],
  ['触发器耗时', false], ['跳过次数', true], ['显卡占用', false], ['CPU占用', false],
  ['内存占用', true], ['BGI内存', true], ['BGI CPU', false],
] as const;

export function matchesMaskSettings(query: string) {
  return ['启用遮罩窗口', '启用拖拽调整位置大小', '遮罩显示与样式', '显示的指标',
    '启用UID遮盖', '编辑 html 遮罩', ...crosshairTerms, ...metrics.map(([label]) => label),
    ...maskStyleGroups.flatMap(group => [group.label, ...group.fields.map(field => field.label)]),
  ].some(label => label.toLowerCase().includes(query));
}

function ColorSetting({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
  const [editing, setEditing] = useState(false);
  const custom = editing || !colors.some(color => color.value === value);
  return <div className="bgi-stack">
    <Select label={label} value={custom ? 'custom' : value} options={colorOptions} onValueChange={next => {
      setEditing(next === 'custom');
      if (next !== 'custom') onChange(next);
    }}/>
    {custom && <Input aria-label={label + '自定义颜色'} value={value}
      onChange={event => onChange(event.currentTarget.value)}/>}
  </div>;
}

function StyleField({field}: {field: MaskField}) {
  const [value, setValue] = useAppValue(scope + 'styles/' + field.key, field.initial);
  const {label, description} = field;
  const opacity = field.key.endsWith('Opacity');
  return <SettingsRow inline label={label} description={description} control={
    field.type === 'toggle' ? <Switch label={label} checked={Boolean(value)} showLabel={false} onChange={setValue}/> :
    field.type === 'color' ? <ColorSetting label={label} value={String(value)} onChange={setValue}/> :
    field.type === 'slider' ? <Slider label={label} value={Number(value)} onChange={setValue}
      min={field.min} max={field.max} step={field.step}/> :
    <NumberField label={label} value={Number(value)} max={opacity ? 1 : 1000} step={opacity ? .1 : 1} onChange={setValue}/>
  }/>;
}

function StyleToggle({label, setting}: {label: string; setting: NonNullable<MaskStyleGroup['toggle']>}) {
  const [enabled, setEnabled] = useAppValue(scope + 'styles/' + setting.key, setting.initial);
  return <Switch label={label} checked={enabled} showLabel={false} onChange={setEnabled}/>;
}

function MetricChoice({label, initial}: {label: string; initial: boolean}) {
  const [enabled, setEnabled] = useAppValue(scope + 'metrics/' + label, initial);
  return <Choice label={label} checked={enabled} onChange={setEnabled}/>;
}

function StyleGroup({group, query, onEditHtml}: {group: MaskStyleGroup; query: string; onEditHtml: () => void}) {
  const [open, setOpen] = useState(false);
  const match = !!query && (group.label.toLowerCase().includes(query) ||
    group.fields.some(field => field.label.toLowerCase().includes(query)) ||
    (group.key === 'CustomHtml' && '编辑 html 遮罩'.includes(query)) ||
    (group.key === 'Metrics' && ['显示的指标', ...metrics.map(([label]) => label)].some(label => label.toLowerCase().includes(query))));
  return <Expander title={group.label} description={group.description} icon={null}
    open={open || match} onChange={setOpen} action={group.toggle && <StyleToggle label={group.label} setting={group.toggle}/> }>
    <SettingsList separated>
      {group.fields.map(field => <StyleField key={field.key} field={field}/>)}
      {group.key === 'Log' && <SettingsActionRow inline label="日志文件"
        description="需要排查问题时，可以打开日志目录查看完整记录。"
        action={<Button disabled title={nativeOnly}>打开日志目录</Button>}/>}
      {group.key === 'Metrics' && <SettingsRow inline stacked label="显示的指标"
        description="勾选需要显示在指标栏里的项目。顺序和遮罩中的显示顺序一致。"
        control={<div className="bgi-metrics-grid">{metrics.map(([label, initial]) =>
          <MetricChoice key={label} label={label} initial={initial}/>)}</div>}/>}
      {group.key === 'CustomHtml' && <SettingsActionRow inline label="编辑 HTML 遮罩"
        description="打开 HTML 编辑器。需要查看文件时使用打开目录。" action={<>
          <Button onClick={onEditHtml}>打开编辑器</Button>
          <Button disabled title={nativeOnly}>打开目录</Button>
        </>}/>}
    </SettingsList>
  </Expander>;
}

function CrosshairSettings({query}: {query: string}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useAppValue(scope + '启用准星', false);
  const [type, setType] = useAppValue(scope + '准星类型', '十字准星');
  const [color, setColor] = useAppValue(scope + '准星颜色', '#FFFFFF');
  const [width, setWidth] = useAppValue(scope + '线宽', 4);
  const [size, setSize] = useAppValue(scope + '大小', 30);
  const [gap, setGap] = useAppValue(scope + '中心点间隔', 10);
  const [scale, setScale] = useAppValue(scope + '准星缩放方式', 'original');
  const image = useStoredPicture('crosshair');
  const picker = useRef<HTMLInputElement>(null);
  return <Expander title="启用准星" description="在遮罩窗口中心显示准星" icon={null}
    open={open || !!query && crosshairTerms.some(term => term.includes(query))} onChange={setOpen}
    action={<Switch label="启用准星" showLabel={false} checked={enabled} onChange={setEnabled}/> }>
    <SettingsList separated>
      <SettingsRow inline label="准星类型" controlWidth={140}
        control={<Select label="准星类型" options={crosshairOptions} value={type} onValueChange={setType}/>}/>
      {type === '自定义准星' ? <>
        <SettingsActionRow inline label="选择图片" description={image.name || '尚未选择图片'} action={<>
          <FileInput inputRef={picker} accept="image/*" onFiles={files => {
            if (files[0]) void image.update(files[0], files[0].name);
          }}/>
          <Button icon="folder" onClick={() => picker.current?.click()}>选择图片</Button>
        </>}/>
        <SettingsRow inline label="缩放方式" controlWidth={140}
          control={<Select label="缩放方式" options={crosshairScales} value={scale} onValueChange={setScale}/>}/>
      </> : <>
        <SettingsRow inline label="准星颜色" control={<Input aria-label="准星颜色" value={color}
          onChange={event => setColor(event.currentTarget.value)}/>}/>
        <SettingsRow inline label="线宽" control={<NumberField label="线宽" value={width} min={1} max={30} onChange={setWidth}/>}/>
        <SettingsRow inline label="大小" control={<NumberField label="大小" value={size} min={1} max={100} onChange={setSize}/>}/>
        {type === '中心点十字' && <SettingsRow inline label="中心点间隔"
          control={<NumberField label="中心点间隔" value={gap} max={100} onChange={setGap}/>}/>}
      </>}
    </SettingsList>
  </Expander>;
}

export function MaskSettings({query, onEditHtml}: {query: string; onEditHtml: () => void}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useAppValue(scope + '启用遮罩窗口', true);
  const [layout, setLayout] = useAppValue(scope + '启用拖拽调整位置大小', false);
  const [uid, setUid] = useAppValue(scope + '启用 UID 遮盖', false);
  return <Expander title="启用遮罩窗口" description="在游戏窗口上方显示日志、状态、识别结果等信息。需要重启生效。"
    icon="monitor" open={open || !!query} onChange={setOpen}
    action={<Switch label="启用遮罩窗口" showLabel={false} checked={enabled} onChange={setEnabled}/> }>
    <div className="bgi-stack">
      <SettingsActionRow inline label="启用拖拽调整位置大小"
        description="开启后可以拖拽调整日志、状态栏与指标栏位置，并调整大小" action={<>
          <Switch label="启用拖拽调整位置大小" showLabel={false} checked={layout} onChange={setLayout}/>
          <Button disabled title={nativeOnly}>重置位置</Button>
        </>}/>
      <div><Text variant="strong">遮罩显示与样式</Text><Text variant="caption">调整遮罩文字、颜色和背景。</Text></div>
      {maskStyleGroups.map(group => <StyleGroup key={group.key} group={group} query={query} onEditHtml={onEditHtml}/>)}
      <CrosshairSettings query={query}/>
      <SettingsRow inline label="启用UID遮盖" description="遮盖右下角的UID区域"
        control={<Switch label="启用UID遮盖" showLabel={false} checked={uid} onChange={setUid}/>}/>
    </div>
  </Expander>;
}
