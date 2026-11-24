import {useEffect, useRef, useState, type PointerEvent} from 'react';
import {OverlayScrollArea} from 'loom-frame/ui';
import {Button, Choice, Field, Input, NumberField, RadioGroup, Select, Slider, Text} from './controls';
import {SettingsActionRow, SettingsList, SettingsRow, Toolbar} from './collections';
import {Modal} from './overlays';
import {FileInput, Image} from './media';
import {logoSource} from './app-images';

const title = 'Recognition 模板素材制作';
const options = (labels: readonly string[]) => labels.map(value => ({value, label: value}));
const algorithms = options(['SqDiff', 'SqDiffNormed', 'CCorr', 'CCorrNormed', 'CCoeff', 'CCoeffNormed']);
const anchors = options(['Auto', 'TopLeft', 'TopRight', 'BottomLeft', 'BottomRight', 'Center']);
const boxes = [{value: 'template', label: '模板框'}, {value: 'search', label: '搜索框'}];
const expansionOptions = [{value: 'pixels', label: '像素'}, {value: 'ratio', label: '百分比'}];
const dimensions = [{key: 'x', label: 'X'}, {key: 'y', label: 'Y'}, {key: 'width', label: '宽'}, {key: 'height', label: '高'}] as const;
type Box = {x: number; y: number; width: number; height: number};
type Point = Pick<Box, 'x' | 'y'>;
const emptyBox: Box = {x: 0, y: 0, width: 0, height: 0};
const defaultSettings = {threshold: .8, algorithm: 'CCoeffNormed', maxCount: -1, threeChannels: false,
  debug: false, mask: false, color: '#00FF00', binary: false, binaryThreshold: 128, anchor: 'Auto',
  customSearch: false, expansion: 'pixels', horizontal: 10, vertical: 10, left: 0, top: 0, right: 0, bottom: 0};
type TemplateSettings = typeof defaultSettings;

function templateFileName(value: string) {
  return value.trim().replace(/\.png$/i, '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^\p{L}\p{Nd}]+/gu, '_')
    .replace(/^_+|_+$/g, '').toLowerCase();
}

function objectKey(value: string) {
  return templateFileName(value).split('_').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join('');
}

function expandedBox(box: Box, settings: TemplateSettings, size: {width: number; height: number}) {
  if (!box.width || !box.height) return emptyBox;
  const ratio = settings.expansion === 'ratio';
  const left = ratio ? settings.left * size.width : settings.horizontal;
  const right = ratio ? settings.right * size.width : settings.horizontal;
  const top = ratio ? settings.top * size.height : settings.vertical;
  const bottom = ratio ? settings.bottom * size.height : settings.vertical;
  const x = Math.max(0, box.x - left);
  const y = Math.max(0, box.y - top);
  return {x, y, width: Math.max(0, Math.min(size.width, box.x + box.width + right) - x),
    height: Math.max(0, Math.min(size.height, box.y + box.height + bottom) - y)};
}

function BoxFields({label, box, onChange}: {label: string; box: Box; onChange: (box: Box) => void}) {
  return <div role="group" aria-label={label} className="bgi-template-coordinates">
    {dimensions.map(({key, label: name}) => <Field label={name} key={key}><NumberField label={label + ' ' + name}
      value={box[key]} max={65535} spinner={false} onChange={value => onChange({...box, [key]: value})}/></Field>)}
  </div>;
}

function RecognitionEditor({file, open, onChange}: {file: File; open: boolean; onChange: (open: boolean) => void}) {
  const [src, setSrc] = useState('');
  const [size, setSize] = useState({width: 0, height: 0});
  const [zoom, setZoom] = useState(50);
  const [target, setTarget] = useState('template');
  const [template, setTemplate] = useState<Box>(emptyBox);
  const [search, setSearch] = useState<Box>(emptyBox);
  const [settings, setSettings] = useState(defaultSettings);
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [customObjectName, setObjectName] = useState('');
  const [json, setJson] = useState('');
  const [directory, setDirectory] = useState('');
  const viewport = useRef<HTMLElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const start = useRef<Point | undefined>(undefined);
  const pan = useRef<Point | undefined>(undefined);
  const effectiveSearch = expandedBox(settings.customSearch ? search : template, settings, size);

  function patch<K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) {
    setSettings(previous => ({...previous, [key]: value}));
  }

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(value => Math.max(10, Math.min(400, value + (event.deltaY > 0 ? -10 : 10))));
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function point(event: PointerEvent<HTMLDivElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.width, Math.round((event.clientX - bounds.left) / bounds.width * size.width))),
      y: Math.max(0, Math.min(size.height, Math.round((event.clientY - bounds.top) / bounds.height * size.height))),
    };
  }

  function updateSelection(event: PointerEvent<HTMLDivElement>) {
    if (pan.current && viewport.current) {
      viewport.current.scrollBy(pan.current.x - event.clientX, pan.current.y - event.clientY);
      pan.current = {x: event.clientX, y: event.clientY};
    }
    if (!start.current) return;
    const next = point(event);
    const origin = start.current;
    const box = {x: Math.min(origin.x, next.x), y: Math.min(origin.y, next.y),
      width: Math.abs(origin.x - next.x), height: Math.abs(origin.y - next.y)};
    if (target === 'search') setSearch(box);
    else setTemplate(box);
  }

  function selectionStyle(box: Box) {
    return {left: box.x * zoom / 100, top: box.y * zoom / 100, width: box.width * zoom / 100, height: box.height * zoom / 100};
  }

  function fit() {
    const element = viewport.current;
    if (!element || !size.width || !size.height) return;
    setZoom(Math.max(10, Math.min(400, Math.floor(100 * Math.min(element.clientWidth / size.width, element.clientHeight / size.height)))));
  }

  return <Modal title={title} iconContent={<Image src={logoSource} width={16} height={16} alt=""/>}
    open={open} onChange={onChange} width={1440} height={900}
    actions={<><Button onClick={() => onChange(false)}>取消</Button>
      <Button disabled title="需要连接本机 BetterGI">保存模板素材</Button></>}>
    <div className="bgi-template-layout">
      <div className="bgi-stack bgi-template-preview">
        <Toolbar actions={<><RadioGroup label="框选对象" options={boxes} value={target} inline
          onChange={value => {setTarget(value); if (value === 'search') patch('customSearch', true);}}/>
          <Button onClick={fit}>适应窗口</Button></>}>
          <Slider label="缩放" min={10} max={400} step={1} unit="%" value={zoom} onChange={setZoom}/>
        </Toolbar>
        <Text variant="caption">左键框选，滚轮缩放，右键拖动画布</Text>
        <OverlayScrollArea horizontal areaClassName="bgi-template-scroll" viewportRef={viewport}>
          {src && <div className="bgi-template-surface" aria-label="截图框选区域"
            style={size.width ? {width: size.width * zoom / 100, height: size.height * zoom / 100} : undefined}
            onContextMenu={event => event.preventDefault()} onPointerDown={event => {
              if (event.button !== 0 && event.button !== 2) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              if (event.button === 2) pan.current = {x: event.clientX, y: event.clientY};
              else start.current = point(event);
            }} onPointerMove={updateSelection} onLostPointerCapture={() => {start.current = undefined; pan.current = undefined;}}>
            <Image src={src} alt="原始截图" draggable={false} onLoad={event => setSize({
              width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight,
            })}/>
            {effectiveSearch.width > 0 && effectiveSearch.height > 0 &&
              <span className="bgi-template-box" data-effective="" style={selectionStyle(effectiveSearch)}/>}
            {template.width > 0 && template.height > 0 && <span className="bgi-template-box" style={selectionStyle(template)}/>}
            {settings.customSearch && search.width > 0 && search.height > 0 &&
              <span className="bgi-template-box" data-search="" style={selectionStyle(search)}/>}
          </div>}
        </OverlayScrollArea>
      </div>
      <div className="bgi-stack">
        <Text variant="subtitle">输出位置</Text>
        <SettingsActionRow inline label="Recognition.json 文件" description={json} action={<>
          <Button onClick={() => jsonInput.current?.click()}>浏览…</Button>
          <FileInput inputRef={jsonInput} accept=".json" onFiles={files => setJson(files[0]?.name ?? '')}/>
        </>}/>
        <SettingsActionRow inline label="输出文件夹（同时设置 JSON 与图片）" description={directory} action={<>
          <Button onClick={() => directoryInput.current?.click()}>选择…</Button>
          <FileInput inputRef={directoryInput} directory multiple onFiles={files => setDirectory(files[0]?.webkitRelativePath.split('/')[0] ?? '')}/>
        </>}/>
        <Text variant="caption">Recognition.json 写入输出文件夹，图片写入 1920x1080 子目录。</Text>
        <hr className="bgi-divider"/>
        <Text variant="subtitle">模板信息</Text>
        <Field label="PNG 文件名"><Input aria-label="PNG 文件名" value={name}
          onBlur={() => setName(templateFileName(name))} onChange={event => setName(event.currentTarget.value)}/></Field>
        <Field label="对象 Key"><Input aria-label="对象 Key" value={customObjectName || objectKey(name)}
          onChange={event => setObjectName(event.currentTarget.value)}/></Field>
        <Text variant="caption">参考画布 {size.width} × {size.height}</Text>
        <BoxFields label="模板框" box={template} onChange={setTemplate}/>
        <hr className="bgi-divider"/>
        <Text variant="subtitle">匹配参数</Text>
        <SettingsList>
          <SettingsRow inline label="匹配阈值" control={<NumberField label="匹配阈值" value={settings.threshold}
            max={1} step={.01} onChange={value => patch('threshold', value)}/>}/>
          <SettingsRow inline label="匹配算法" control={<Select label="匹配算法" options={algorithms}
            value={settings.algorithm} onValueChange={value => patch('algorithm', value)}/>}/>
          <SettingsRow inline label="最大匹配数" control={<NumberField label="最大匹配数" value={settings.maxCount}
            min={-1} max={65535} onChange={value => patch('maxCount', value)}/>}/>
        </SettingsList>
        <div className="bgi-wrap">
          {(['threeChannels', 'debug', 'mask', 'binary'] as const).map((key, index) => <Choice key={key}
            label={['三通道匹配', '绘制调试框', '启用遮罩', '二值化匹配'][index]}
            checked={settings[key]} onChange={value => patch(key, value)}/>)}
        </div>
        <SettingsRow inline label="遮罩颜色" control={<Input aria-label="遮罩颜色" value={settings.color}
          disabled={!settings.mask} onChange={event => patch('color', event.currentTarget.value)}/>}/>
        <SettingsRow inline label="二值化阈值" control={<NumberField label="二值化阈值" value={settings.binaryThreshold}
          max={255} disabled={!settings.binary} onChange={value => patch('binaryThreshold', value)}/>}/>
        <hr className="bgi-divider"/>
        <Text variant="subtitle">搜索参数</Text>
        <SettingsRow inline label="锚点" control={<Select label="锚点" options={anchors}
          value={settings.anchor} onValueChange={value => patch('anchor', value)}/>}/>
        <Choice label="启用自定义搜索框" checked={settings.customSearch} onChange={value => patch('customSearch', value)}/>
        {settings.customSearch && <BoxFields label="搜索框" box={search} onChange={setSearch}/>}
        <RadioGroup label="扩展方式" value={settings.expansion} options={expansionOptions} inline
          onChange={value => patch('expansion', value)}/>
        {(settings.expansion === 'pixels' ? [ ['horizontal', '横向扩展'], ['vertical', '纵向扩展'] ] as const :
          [ ['left', '左'], ['top', '上'], ['right', '右'], ['bottom', '下'] ] as const).map(([key, label]) =>
          <SettingsRow inline key={key} label={label} control={<NumberField label={label} value={settings[key]}
            max={settings.expansion === 'pixels' ? 65535 : 1} step={settings.expansion === 'pixels' ? 1 : .01}
            onChange={value => patch(key, value)}/>}/>)}
      </div>
    </div>
  </Modal>;
}

export function TemplateEditorEntry() {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return <>
    <SettingsActionRow inline label={title} description="选择本地图片后独立打开模板框选与配置工具" action={<>
      <Button onClick={() => picker.current?.click()}>选择图片</Button>
      <FileInput inputRef={picker} accept="image/*" onFiles={files => {
        if (!files[0]) return;
        setRevision(previous => previous + 1);
        setFile(files[0]);
        setOpen(true);
      }}/>
    </>}/>
    {file && <RecognitionEditor key={revision} file={file} open={open} onChange={setOpen}/>}
  </>;
}
