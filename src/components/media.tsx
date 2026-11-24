import {useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type Ref, type RefObject} from 'react';
import {OverlayScrollArea, ResilientImage, type ResilientImageProps} from 'loom-frame/ui';
import {Button, Icon, IconButton, Slider} from './controls';
import {Empty, List, type Row} from './collections';
import {InfoBar, WindowFrame} from './overlays';
import {macroCommands as nativeMacroCommands, parseMacro} from '../features/automation/key-macro-model';
import {CapturePicker} from './capture-picker';

export function Image({fit = 'contain', style, ...props}: ResilientImageProps & {
  fit?: CSSProperties['objectFit'];
}) {
  return <ResilientImage {...props} decoding={props.decoding ?? 'async'}
    style={{...style, objectFit: fit}}/>;
}

export function LogView({children, code = false, label}: {
  children: ReactNode; code?: boolean; label?: string;
}) {
  return <OverlayScrollArea areaClassName="bgi-log" className="bgi-log-content"
    viewportProps={{role: code ? 'region' : 'log', 'aria-label': label, tabIndex: 0}}>
    {code ? <pre className="bgi-mono bgi-log-code">{children}</pre> : children}
  </OverlayScrollArea>;
}

const macroCommands = ['press("F")', 'release("F")', 'wait(200)', 'click("left")'];

export function CodeEditor({label, value, onChange, language, editorRef}: {
  label: string; value: string; onChange: (value: string) => void;
  language: 'json' | 'macro' | 'keymacro' | 'html' | 'javascript'; editorRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const localSource = useRef<HTMLTextAreaElement>(null);
  const source = editorRef ?? localSource;
  const gutter = useRef<HTMLDivElement>(null);
  const [completion, setCompletion] = useState(false);
  const macroSyntax = language === 'macro' || language === 'keymacro';
  const commands = language === 'keymacro' ? Object.values(nativeMacroCommands).map(command => command[1]) : macroCommands;
  const issues = language === 'keymacro' ? parseMacro(value).diagnostics : [];
  let invalid = issues.length > 0;
  if (language === 'json' && value.trim()) {
    try {JSON.parse(value);} catch {invalid = true;}
  }
  return <div className="bgi-stack">
    <div className="bgi-editor">
      <div ref={gutter} className="bgi-editor-gutter" aria-hidden="true">
        {value.split('\n').map((_, index) => <div key={index}>{index + 1}</div>)}
      </div>
      <OverlayScrollArea areaClassName="bgi-editor-scroll" horizontal
        textarea={<textarea ref={source} value={value} className="bgi-mono" aria-label={label}
        spellCheck={false} aria-invalid={invalid || undefined}
        onScroll={event => {if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;}}
        onChange={event => onChange(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Escape' && completion) {
            event.preventDefault();
            setCompletion(false);
          }
          if (macroSyntax && event.ctrlKey && event.code === 'Space') {
            event.preventDefault();
            setCompletion(value => !value);
          }
        }}/>}/>
    </div>
    {macroSyntax && <div className="bgi-stack">
      <div className="bgi-toolbar">
        <span className="bgi-muted">Ctrl + 空格打开补全</span>
        <Button appearance="transparent" aria-expanded={completion}
          onClick={() => setCompletion(!completion)}>命令补全</Button>
      </div>
      {completion && <div className="bgi-wrap">
        {commands.map(command => <Button key={command} onClick={() => {
          const node = source.current;
          if (!node) return;
          const start = node.selectionStart;
          onChange(value.slice(0, start) + command + value.slice(node.selectionEnd));
          setCompletion(false);
          requestAnimationFrame(() => {
            node.focus();
            node.setSelectionRange(start + command.length, start + command.length);
          });
        }}>{command}</Button>)}
      </div>}
      {language === 'macro' && value.split('\n').some(line => line.trim() && !/^((press|release|click|wait)\(.*\)|\/\/.*)$/.test(line.trim())) &&
        <InfoBar tone="warning" title="有无法识别的宏命令"/>}
    </div>}
    {language === 'json' && invalid && <p className="bgi-error-text" role="alert">JSON 格式无效，请检查括号、引号与逗号。</p>}
    {issues.length > 0 && <ul className="bgi-macro-diagnostics" aria-label="脚本诊断">
      {issues.map((issue, index) => <li key={index}>第 {issue.line} 行：{issue.message}</li>)}
    </ul>}
  </div>;
}

export function FileInput({inputRef, onFiles, accept, multiple = false, directory = false}: {
  inputRef: Ref<HTMLInputElement>; onFiles: (files: File[]) => void;
  accept?: string; multiple?: boolean; directory?: boolean;
}) {
  return <input ref={inputRef} type="file" hidden accept={accept} multiple={multiple}
    {...(directory ? {webkitdirectory: ''} : {})}
    onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      if (files.length) onFiles(files);
    }}/>;
}

export function FilePicker({label, names, onChange, directory = false, accept}: {
  label: string; names: readonly string[]; onChange: (value: string[]) => void;
  directory?: boolean; accept?: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const commit = (files: FileList | File[]) => {
    if (files?.length) onChange(Array.from(files, file => file.webkitRelativePath || file.name));
  };
  return <div className="bgi-stack">
    <div className="bgi-file-drop" data-over={over} onDragOver={event => {
      event.preventDefault();
      setOver(true);
    }} onDragLeave={event => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setOver(false);
    }} onDrop={event => {
      event.preventDefault();
      setOver(false);
      commit(event.dataTransfer.files);
    }}>
      <Icon name="folder" size={28}/>
      <Button icon="folder" onClick={() => file.current?.click()}>{label}</Button>
      <span className="bgi-muted">也可以拖到这里</span>
      <FileInput inputRef={file} onFiles={commit} accept={accept} directory={directory} multiple/>
    </div>
    {names.length > 0 && <div className="bgi-toolbar">
      <span role="status">{names.length === 1 ? names[0] : '已选择 ' + names.length + ' 个文件'}</span>
      <IconButton label="清除选择" icon="x" appearance="transparent" onClick={() => onChange([])}/>
    </div>}
  </div>;
}

export function saveText(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], {type: 'application/json;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[<>:"/\\|?*]/g, '_');
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

type Point = {x: number; y: number};
const route: Point[] = [{x: 14,y: 76},{x: 24,y: 58},{x: 41,y: 62},{x: 57,y: 41},{x: 64,y: 29},{x: 84,y: 19}];

export function CanvasViewer({mode}: {mode: 'map' | 'image' | 'overlay'}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(100);
  const [angle, setAngle] = useState(0);
  const [point, setPoint] = useState<Point | null>(null);
  const [second, setSecond] = useState<Point | null>(null);
  const drag = useRef<Point | null>(null);
  const [dimensions, setDimensions] = useState({width: 500, height: 260});
  const [candidate, setCandidate] = useState<string>();
  const [image, setImage] = useState<HTMLImageElement>();
  const file = useRef<HTMLInputElement>(null);
  const output = useId();

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setDimensions({width: entry.contentRect.width, height: entry.contentRect.height}));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!candidate) return;
    const image = new window.Image();
    image.onload = () => setImage(image);
    image.onerror = () => setImage(undefined);
    image.src = candidate;
    return () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(candidate);
    };
  }, [candidate]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!context || !element) return;
    const ratio = devicePixelRatio || 1;
    const {width, height} = dimensions;
    element.width = Math.max(1, width * ratio);
    element.height = Math.max(1, height * ratio);
    context.scale(ratio, ratio);
    const colors = getComputedStyle(element);
    const accent = colors.getPropertyValue('--bgi-accent').trim();
    context.fillStyle = colors.getPropertyValue('--bgi-panel').trim();
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(angle * Math.PI / 180);
    context.scale(zoom / 100, zoom / 100);
    context.translate(-width / 2, -height / 2);
    if (mode === 'image' && image) {
      const scale = Math.min(width / image.width, height / image.height);
      const w = image.width * scale, h = image.height * scale;
      context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    } else if (mode === 'map') {
      context.fillStyle = '#dce7d5';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#80b3bd';
      context.lineWidth = 28;
      context.beginPath();
      context.moveTo(0, height * .33);
      context.bezierCurveTo(width * .3, height * .32, width * .58, height * .90, width, height * .60);
      context.stroke();
      context.strokeStyle = '#326277';
      context.lineWidth = 2;
      context.setLineDash([5, 5]);
      context.beginPath();
      route.forEach(({x, y}, i) => i ? context.lineTo(x * width / 100, y * height / 100) :
        context.moveTo(x * width / 100, y * height / 100));
      context.stroke();
      context.setLineDash([]);
      for (const {x,y} of route) {
        context.beginPath();
        context.fillStyle = '#0067c0';
        context.arc(x * width / 100, y * height / 100, 5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#fff';
        context.stroke();
      }
    } else {
      context.strokeStyle = colors.getPropertyValue('--bgi-border').trim();
      for (let x = 12; x < width; x += 24) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      for (let y = 12; y < height; y += 24) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      if (!point && mode === 'overlay') {
        context.strokeStyle = accent;
        context.strokeRect(width * .2, height * .28, width * .6, height * .45);
      }
    }
    context.restore();
    if (point) {
      const x = point.x * width / 100, y = point.y * height / 100;
      context.strokeStyle = accent;
      context.lineWidth = 2;
      if (second) context.strokeRect(x, y, second.x * width / 100 - x, second.y * height / 100 - y);
      else {
        context.beginPath();
        context.moveTo(x - 9, y); context.lineTo(x + 9, y);
        context.moveTo(x, y - 9); context.lineTo(x, y + 9); context.stroke();
      }
    }
  }, [angle, dimensions, image, mode, point, second, zoom]);

  function position(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100))};
  }
  return <div className="bgi-stack">
    <div className="bgi-toolbar">
      {mode === 'image' && <><Button icon="folder" onClick={() => file.current?.click()}>打开图片</Button>
        <input ref={file} aria-label="打开图片" hidden type="file" accept="image/*" onChange={event => {
          const image = event.currentTarget.files?.[0];
          if (image) setCandidate(URL.createObjectURL(image));
        }}/></>}
      <Slider label="缩放" value={zoom} onChange={setZoom} min={50} max={200} unit="%"/>
      {mode !== 'map' && <Button onClick={() => setAngle(value => (value + 90) % 360)}>旋转</Button>}
      <Button onClick={() => {setPoint(null); setSecond(null); setZoom(100); setAngle(0);}}>复位</Button>
    </div>
    <canvas ref={canvas} className="bgi-canvas" aria-label={mode === 'map' ? '示例路线图' : '选区画布'}
      aria-describedby={output} tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' && !point) {setPoint({x: 50,y: 50}); return;}
        if (!point || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        setPoint({...point, x: Math.max(0, Math.min(100, point.x + (event.key === 'ArrowLeft' ? -1 :
          event.key === 'ArrowRight' ? 1 : 0))), y: Math.max(0, Math.min(100,
          point.y + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)))});
      }}
      onPointerDown={event => {
        const from = position(event);
        drag.current = from;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPoint(from);
        setSecond(null);
      }}
      onPointerMove={event => {if (drag.current && mode !== 'map') setSecond(position(event));}}
      onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}}/>
    <output id={output} className="bgi-muted">{point ? Math.round(point.x) + '%, ' + Math.round(point.y) + '%'
      : mode === 'image' && !image ? '打开图片后可拖出选区。' : '点击画布选择位置。'}</output>
  </div>;
}

const tracks: Row[] = [
  {id: 'echo', label: '风之回响', detail: '12 秒试听', icon: 'music'},
  {id: 'wave', label: '静海的波纹', detail: '12 秒试听', icon: 'music'},
  {id: 'walk', label: '漫步小调', detail: '12 秒试听', icon: 'music'},
];

function previewAudio(key: string) {
  const rate = 16000, seconds = 12, length = rate * seconds;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  for (const [i, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
    for (let j = 0; j < text.length; j++) view.setUint8(i + j, text.charCodeAt(j));
  }
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, length * 2, true);
  const notes = key === 'wave' ? [262, 330, 392, 523, 392, 330] :
    key === 'walk' ? [294, 349, 440, 392, 349, 294] : [330, 392, 494, 440, 392, 330];
  for (let i = 0; i < length; i++) {
    const t = i / rate, note = notes[Math.floor(t * 3) % notes.length], local = t % (1 / 3);
    const envelope = Math.min(1, local * 100) * Math.exp(-9 * local);
    view.setInt16(44 + i * 2, Math.sin(t * 2 * Math.PI * note) * envelope * 2400, true);
  }
  return new Blob([buffer], {type: 'audio/wav'});
}

export function AudioPlayer({voice = false}: {voice?: boolean}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [choice, setChoice] = useState(tracks[0].id);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(60);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    const node = audio.current;
    if (!node) return;
    const url = URL.createObjectURL(previewAudio(choice));
    node.src = url;
    setPosition(0);
    setPlaying(false);
    setFailure(false);
    return () => {node.pause(); node.removeAttribute('src'); URL.revokeObjectURL(url);};
  }, [choice]);
  useEffect(() => {if (audio.current) audio.current.volume = volume / 100;}, [volume]);
  function skip(delta: number) {
    setChoice(tracks[(tracks.findIndex(track => track.id === choice) + tracks.length + delta) % tracks.length].id);
  }
  return <div className="bgi-stack">
    <audio ref={audio} preload="metadata" onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => setPosition(Math.floor(event.currentTarget.currentTime))}/>
    {!voice && <List rows={tracks} selected={choice} onSelect={setChoice}/>}
    <div className="bgi-player">
      {!voice && <IconButton label="上一首" icon="previous" onClick={() => skip(-1)}/>}
      <IconButton label={playing ? '暂停' : '试听'} icon={playing ? 'pause' : 'play'}
        appearance="primary" onClick={() => {
          const node = audio.current;
          if (!node) return;
          if (playing) node.pause(); else void node.play().catch(() => setFailure(true));
        }}/>
      {!voice && <IconButton label="下一首" icon="next" onClick={() => skip(1)}/>}
      <Slider label="播放进度" value={position} max={12} unit=" 秒" onChange={value => {
        if (audio.current && Number.isFinite(audio.current.duration)) audio.current.currentTime = value;
        setPosition(value);
      }}/>
    </div>
    <Slider label="音量" value={volume} onChange={setVolume} unit="%"/>
    {failure && <InfoBar tone="danger" title="无法播放音频"/>}
  </div>;
}

export function SubtitleWindow({text}: {text: string}) {
  return <div className="bgi-subtitles" role="region" aria-label="导览字幕"><p>{text}</p></div>;
}

export function HostedSurface({kind}: {kind: 'cloud' | 'remote' | 'capture' | 'pip'}) {
  const [active, setActive] = useState(false);
  if (kind === 'capture') return <WindowFrame title={active ? 'CaptureTestWindow' : '选择捕获窗口'}
    icon="monitor" onClose={active ? () => setActive(false) : undefined}>
    {active ? <CanvasViewer mode="image"/> : <CapturePicker onChoose={() => setActive(true)}/>}
  </WindowFrame>;
  return <WindowFrame title={kind === 'cloud' ? '云·原神' : kind === 'remote' ? '桌面分身' :
    '画中画'} icon={kind === 'cloud' ? 'cloud' : 'monitor'}>
    {active ? <div className="bgi-stack">
      <CanvasViewer mode="overlay"/>
      <div className="bgi-actions"><Button onClick={() => setActive(false)}>关闭预览</Button></div>
    </div> : <Empty title="等待窗口画面" icon="monitor"
      action={<Button icon="monitor" onClick={() => setActive(true)}>打开示例画面</Button>}/>}
  </WindowFrame>;
}
