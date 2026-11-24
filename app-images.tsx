import {useEffect, useRef, useState, type PointerEvent} from 'react';
import {DropdownMenu} from 'loom-frame/ui';
import {Button, Field, Icon, Input, Link, Text} from './controls';
import {SettingsActionRow} from './collections';
import {Modal, Snackbar, useSnackbar} from './overlays';
import {FileInput, Image} from './media';
import {useAppValue} from './app-state';

export const bannerSource = new URL('./images/banner.jpg', import.meta.url).href;
export const logoSource = new URL('./images/logo.png', import.meta.url).href;
export const inventoryWatermark = new URL('./images/account-records-watermark.png', import.meta.url).href;

type ImageSlot = 'banner' | 'background' | 'crosshair' | `account/${string}`;

function openPictureStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bettergi-ui-app-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pictures');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPicture(slot: ImageSlot): Promise<Blob | undefined> {
  const database = await openPictureStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('pictures', 'readonly').objectStore('pictures').get(slot);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writePicture(slot: ImageSlot, picture?: Blob) {
  const database = await openPictureStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('pictures', 'readwrite');
      const store = transaction.objectStore('pictures');
      if (picture) store.put(picture, slot);
      else store.delete(slot);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function useStoredPicture(slot: ImageSlot) {
  const [file, setFile] = useState<Blob>();
  const [url, setUrl] = useState<string>();
  const [name, setName] = useState('');
  const changes = useRef(0);
  useEffect(() => {
    let alive = true;
    const previous = changes.current;
    void readPicture(slot).then(saved => {
      if (!alive || changes.current !== previous) return;
      setFile(saved);
      setName(saved instanceof File ? saved.name : '');
    }).catch(() => {});
    return () => {alive = false;};
  }, [slot]);

  useEffect(() => {
    const source = file ? URL.createObjectURL(file) : undefined;
    setUrl(source);
    return () => {if (source) URL.revokeObjectURL(source);};
  }, [file]);

  async function update(next?: Blob, filename?: string) {
    ++changes.current;
    const stored = next && filename ? new File([next], filename, {type: next.type}) : next;
    await writePicture(slot, stored);
    setFile(stored);
    setName(filename ?? (stored instanceof File ? stored.name : ''));
  }

  return {url, name, update};
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法打开'));
    image.referrerPolicy = 'no-referrer';
    image.src = src;
  });
}

export function HomeBanner({picture}: {picture: ReturnType<typeof useStoredPicture>}) {
  const [network, setNetwork] = useAppValue('banner/network-image', '');
  const [reload, refresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [address, setAddress] = useState(network);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => {++request.current;}, []);
  const picker = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  const source = picture.url ?? (network || bannerSource);
  const networkSource = picture.url ? '' : network;

  async function chooseFile([file]: File[]) {
    if (!file) return;
    const chosen = URL.createObjectURL(file);
    try {
      await loadImage(chosen);
      await picture.update(file);
      setNetwork('');
      notify('背景图片更换成功！', 'success');
    } catch {
      notify('无法打开或保存所选图片。', 'danger');
    } finally {
      URL.revokeObjectURL(chosen);
    }
  }

  async function useAddress() {
    const attempt = ++request.current;
    let url: URL;
    try {
      url = new URL(address.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      setError('请输入有效的 HTTP 或 HTTPS 图片地址。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loadImage(url.href);
      if (attempt !== request.current) return;
      await picture.update();
      setNetwork(url.href);
      setPrompt(false);
    } catch {
      if (attempt === request.current) setError('图片加载失败，请检查地址。');
    } finally {
      if (attempt === request.current) setBusy(false);
    }
  }

  function select(action: string) {
    if (action === 'local') picker.current?.click();
    if (action === 'network') {
      setAddress(network);
      setError('');
      setPrompt(true);
    }
    if (action === 'refresh') refresh(value => value + 1);
    if (action === 'reset') {
      void picture.update().then(() => {
        setNetwork('');
        notify('已恢复为默认背景图片！', 'success');
      }).catch(() => notify('无法恢复默认背景图片。', 'danger'));
    }
  }

  function displaySource() {
    if (!networkSource || !reload) return source;
    const url = new URL(networkSource);
    url.searchParams.set('_bgi_image', String(reload));
    return url.href;
  }

  return <div className="bgi-home-banner">
    <DropdownMenu label="背景图片" open={open} onOpenChange={setOpen} onSelect={select}
      panelClassName="bgi-menu" anchorClassName="bgi-home-banner-anchor" contextMenu animatePresence overlayScroll
      trigger={<button type="button" className="bgi-home-banner-trigger" aria-label="背景图片"
        title="右键更换背景图片"/>}
      items={[
        {id: 'local', label: '更换背景图片', icon: <Icon name="image"/>},
        {id: 'network', label: '使用网络图片', icon: <Icon name="globe"/>},
        ...(networkSource ? [{id: 'refresh', label: '刷新网络图片', icon: <Icon name="rotate"/>}] : []),
        {id: 'reset', label: '恢复默认图片', icon: <Icon name="rotate"/>},
      ]}/>
    <Image className="bgi-home-banner-image" src={displaySource()} alt="" fit="cover"
      referrerPolicy="no-referrer" fallback={<Image className="bgi-home-banner-image" src={bannerSource} alt="" fit="cover"/>}/>
    <div className="bgi-home-banner-text">
      <Text variant="title">BetterGI</Text>
      <Text variant="subtitle">更好的原神，免费且开源</Text>
      <Link href="https://www.bettergi.com/">点击查看文档与教程 <Icon name="external" size={14}/></Link>
    </div>
    <FileInput inputRef={picker} accept="image/*" onFiles={chooseFile}/>
    <Modal title="请输入网络图片地址" open={prompt} onChange={next => {
      if (!next) {++request.current; setBusy(false);}
      setPrompt(next);
    }} actions={<>
      <Button onClick={() => {++request.current; setBusy(false); setPrompt(false);}}>取消</Button>
      <Button type="submit" form="bettergi-banner-form" appearance="primary" disabled={busy || !address.trim()}>
        {busy ? '正在加载' : '确定'}
      </Button>
    </>}>
      <form id="bettergi-banner-form" className="bgi-stack" onSubmit={event => {event.preventDefault(); void useAddress();}}>
        <Field label="网络图片地址"><Input aria-label="网络图片地址" type="url" value={address}
          onChange={event => setAddress(event.currentTarget.value)}/></Field>
        {error && <p className="bgi-error-text" role="alert">{error}</p>}
      </form>
    </Modal>
    <Snackbar {...snackbar}/>
  </div>;
}

type Crop = {x: number; y: number; width: number; height: number};
type Point = {x: number; y: number};
type CropDrag = {
  start: Point; crop?: Crop;
  horizontal?: 'left' | 'right'; vertical?: 'top' | 'bottom';
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function adjustCrop(drag: CropDrag, point: Point): Crop {
  const {start, crop, horizontal, vertical} = drag;
  if (!crop) return {
    x: Math.min(point.x, start.x), y: Math.min(point.y, start.y),
    width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y),
  };
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (!horizontal && !vertical) return {
    ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width), y: clamp(crop.y + dy, 0, 1 - crop.height),
  };

  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const x = horizontal === 'left' ? clamp(crop.x + dx, 0, right - .01) : crop.x;
  const y = vertical === 'top' ? clamp(crop.y + dy, 0, bottom - .01) : crop.y;
  return {
    x, y, width: (horizontal === 'right' ? clamp(right + dx, x + .01, 1) : right) - x,
    height: (vertical === 'bottom' ? clamp(bottom + dy, y + .01, 1) : bottom) - y,
  };
}

function ImageEdit({file, onSave, onClose}: {
  file: File; onSave: (file: Blob, filename: string) => Promise<void>; onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const drag = useRef<CropDrag | null>(null);
  const [turns, setTurns] = useState(0);
  const [crop, setCrop] = useState<Crop>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    void loadImage(url).then(image => {
      if (!active) return;
      original.current = image;
      setLoaded(true);
    }).catch(() => {if (active) setError('无法打开所选图片。');});
    return () => {active = false; URL.revokeObjectURL(url);};
  }, [file]);

  useEffect(() => {
    const surface = canvas.current;
    const image = original.current;
    const context = surface?.getContext('2d');
    if (!surface || !image || !context || !loaded) return;
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const imageWidth = Math.round(image.naturalWidth * scale);
    const imageHeight = Math.round(image.naturalHeight * scale);
    surface.width = turns % 2 ? imageHeight : imageWidth;
    surface.height = turns % 2 ? imageWidth : imageHeight;
    context.translate(surface.width / 2, surface.height / 2);
    context.rotate(turns * Math.PI / 2);
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  }, [loaded, turns]);

  function pointer(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (value: number, offset: number, size: number) =>
      Math.max(0, Math.min(1, (value - offset) / size));
    return {x: position(event.clientX, bounds.left, bounds.width), y: position(event.clientY, bounds.top, bounds.height)};
  }

  async function save(applyEdit: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const surface = canvas.current;
      if (!applyEdit || !surface || (!crop && turns === 0)) await onSave(file, file.name);
      else {
        const source = crop && crop.width > .01 && crop.height > .01 ? crop :
          {x: 0, y: 0, width: 1, height: 1};
        const output = document.createElement('canvas');
        output.width = Math.max(1, Math.round(source.width * surface.width));
        output.height = Math.max(1, Math.round(source.height * surface.height));
        output.getContext('2d')?.drawImage(surface, source.x * surface.width,
          source.y * surface.height, output.width, output.height, 0, 0, output.width, output.height);
        const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error();
        await onSave(blob, file.name.replace(/\.[^.]+$/, '') + '.png');
      }
      onClose();
    } catch {
      setError('无法保存背景图片。');
    } finally {
      setBusy(false);
    }
  }

  function rotate(by: number) {
    setCrop(undefined);
    setTurns(value => (value + by + 4) % 4);
  }

  return <Modal title="编辑背景图片" open onChange={open => {if (!open) onClose();}}
    actions={<>
      <Button disabled={busy} onClick={onClose}>取消</Button>
      <Button disabled={busy || !loaded} onClick={() => void save(false)}>使用原图</Button>
      <Button appearance="primary" disabled={busy || !loaded} onClick={() => void save(true)}>保存并使用</Button>
    </>}>
    <div className="bgi-stack">
      <div className="bgi-wrap">
        <Button icon="rotate" disabled={!loaded} onClick={() => rotate(-1)}>左转 90°</Button>
        <Button icon="rotate" disabled={!loaded} onClick={() => rotate(1)}>右转 90°</Button>
        <Button icon="square" disabled={!crop} onClick={() => setCrop(undefined)}>重置裁剪</Button>
      </div>
      <div className="bgi-image-edit" hidden={!loaded}>
        <canvas ref={canvas} aria-label="裁剪区域" onPointerDown={event => {
          if (event.button !== 0) return;
          const start = pointer(event);
          const bounds = event.currentTarget.getBoundingClientRect();
          const nearX = 8 / bounds.width;
          const nearY = 8 / bounds.height;
          const inside = crop && crop.width > .01 && crop.height > .01 &&
            start.x >= crop.x - nearX && start.x <= crop.x + crop.width + nearX &&
            start.y >= crop.y - nearY && start.y <= crop.y + crop.height + nearY;
          if (inside) {
            drag.current = {
              start, crop,
              horizontal: Math.abs(start.x - crop.x) <= nearX ? 'left' :
                Math.abs(start.x - crop.x - crop.width) <= nearX ? 'right' : undefined,
              vertical: Math.abs(start.y - crop.y) <= nearY ? 'top' :
                Math.abs(start.y - crop.y - crop.height) <= nearY ? 'bottom' : undefined,
            };
          } else {
            drag.current = {start};
            setCrop(undefined);
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={event => {
          if (drag.current) setCrop(adjustCrop(drag.current, pointer(event)));
        }} onLostPointerCapture={() => {drag.current = null;}}/>
        {crop && <span className="bgi-image-crop" style={{
          insetInlineStart: crop.x * 100 + '%', insetBlockStart: crop.y * 100 + '%',
          width: crop.width * 100 + '%', height: crop.height * 100 + '%',
        }}/>}
      </div>
      <p className="bgi-muted">在图片上拖拽可框选裁剪区域，拖动框内移动，拖动边缘调整大小。</p>
      {error && <p className="bgi-error-text" role="alert">{error}</p>}
    </div>
  </Modal>;
}

export function BackgroundPicture({picture}: {picture: ReturnType<typeof useStoredPicture>}) {
  const [editing, setEditing] = useState<File>();
  const fileInput = useRef<HTMLInputElement>(null);
  const {notify, snackbar} = useSnackbar();
  return <>
    <SettingsActionRow inline label="背景图片" description={picture.name || '尚未选择背景图片'}
      action={<>
        <Button onClick={() => fileInput.current?.click()}>选择图片</Button>
        <Button disabled={!picture.url} onClick={() => {
          void picture.update().catch(() => notify('无法清除背景图片。', 'danger'));
        }}>清除</Button>
        <FileInput inputRef={fileInput} accept="image/*" onFiles={([file]) => setEditing(file)}/>
      </>}/>
    {editing && <ImageEdit file={editing} onSave={picture.update} onClose={() => setEditing(undefined)}/>}
    <Snackbar {...snackbar}/>
  </>;
}
