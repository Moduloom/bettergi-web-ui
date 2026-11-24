import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {OverlayScrollArea} from 'loom-frame/ui';
import {Button, Icon, IconButton, Progress, SearchField, Select, Slider, Switch, Text} from './controls';
import {Empty, List} from './collections';
import {FileInput} from './media';
import {MessageDialog, Modal, Snackbar, useSnackbar} from './overlays';
import {useAppValue} from './app-state';
import {MusicSettings, defaultMusicOptions} from './app-music-settings';
import {readDirectories, saveDirectory, scanScores, watchDirectories, type ScoreDirectory} from './music-library';
import {defaultInstrument, guidedChords, mapScore, type Profiles, type ScoreOptions} from './music-performance';
import {useMusicPreview} from './music-preview';
import type {Score} from './music-score';

const playModes = [{value: 'auto', label: '自动演奏'}, {value: 'guided', label: '引导式跟弹'}];
const playbackModes = ['顺序播放', '单曲循环', '随机播放'];
const noScores: Score[] = [];
const noMuted: number[] = [];

function time(seconds: number) {
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + Math.floor(seconds % 60).toString().padStart(2, '0');
}

function optionsFor(score: Score | undefined, preferences: Record<string, Partial<ScoreOptions>>): ScoreOptions {
  return {instrument: defaultInstrument(score), transpose: 0, muted: noMuted, ...preferences[score?.id ?? 'default']};
}

async function migrateMusic() {
  if (localStorage.getItem('bettergi-ui:music-library-migrated')) return;
  const raw = localStorage.getItem('bettergi-ui:app:library/music');
  if (!raw) return;
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries) || !entries.length) return;
  const files = entries.flatMap(item => typeof item?.filename === 'string' && typeof item.content === 'string'
    ? [new File([item.content], item.filename)] : []);
  const scores = await scanScores(files, undefined, true);
  if (scores.length) await saveDirectory({id: 'imported', name: '已导入曲谱', scores});
  localStorage.setItem('bettergi-ui:music-library-migrated', '1');
}

function GuidedMusic({score, onClose}: {score: Score; onClose: () => void}) {
  const chords = useMemo(() => guidedChords(score.notes), [score]);
  const [{step, pressed, wrong}, setPosition] = useState({step: 0, pressed: [] as string[], wrong: false});
  const chord = chords[step];
  const segment = Math.floor(step / 5);
  const complete = !chord;
  const hit = useCallback((key: string) => setPosition(current => {
    const expected = chords[current.step]?.keys;
    if (!expected || current.pressed.includes(key)) return current;
    if (!expected.includes(key)) return {...current, wrong: true};
    if (current.pressed.length + 1 === expected.length) return {step: current.step + 1, pressed: [], wrong: false};
    return {...current, pressed: [...current.pressed, key], wrong: false};
  }), [chords]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !/^[a-z]$/i.test(event.key)) return;
      event.preventDefault();
      hit(event.key.toUpperCase());
    }
    document.addEventListener('keydown', keyDown);
    return () => document.removeEventListener('keydown', keyDown);
  }, [hit]);

  return <Modal title="引导式跟弹" open onChange={open => {if (!open) onClose();}}
    actions={<Button onClick={onClose}>{complete ? '完成' : '停止'}</Button>}>
    <div className="bgi-stack">
      <Text variant="section">{score.label}</Text>
      <Progress label="跟弹进度" value={100 * step / chords.length}/>
      {complete ? <Text>已完成跟弹</Text> : <>
        <Text variant="caption">第 {segment + 1} / {Math.ceil(chords.length / 5)} 段</Text>
        <div className="bgi-music-guide-segment" aria-label="本段按键">
          {chords.slice(segment * 5, segment * 5 + 5).map((entry, index) => {
            const absolute = segment * 5 + index;
            return <span key={absolute} data-current={absolute === step || undefined}
              data-done={absolute < step || undefined}>{entry.keys.join(' + ')}</span>;
          })}
        </div>
        <div className="bgi-wrap" aria-label="当前按键">
          {chord.keys.map(key => <Button key={key} appearance="primary" disabled={pressed.includes(key)}
            onClick={() => hit(key)}>{key}</Button>)}
        </div>
        {wrong && <p className="bgi-error-text" role="status">按 {chord.keys.filter(key => !pressed.includes(key)).join(' + ')}</p>}
      </>}
    </div>
  </Modal>;
}

export function MusicPage() {
  const [directories, setDirectories] = useState<ScoreDirectory[]>([]);
  const [folderId, setFolderId] = useAppValue('music/directory', '');
  const [selectedId, setSelectedId] = useAppValue('music/selected-score', '');
  const [playMode, setPlayMode] = useAppValue('music/mode', 'auto');
  const [playback, setPlayback] = useAppValue('music/playback-mode', 0);
  const [background, setBackground] = useAppValue('music/background-input', true);
  const [settings, setSettings] = useAppValue('music/performance-options', defaultMusicOptions);
  const [preferences, setPreferences] = useAppValue<Record<string, Partial<ScoreOptions>>>('music/score-options', {});
  const [profiles, setProfiles] = useAppValue<Profiles>('music/instrument-profiles', {});
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [instrument, setInstrument] = useState('');
  const [busy, setBusy] = useState(true);
  const [dialog, setDialog] = useState<'settings' | 'folder' | 'remove' | undefined>();
  const [guided, setGuided] = useState<Score>();
  const scanning = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const onPlaybackEnded = useRef<(id: string) => void>(() => {});
  const preview = useMusicPreview();
  const {notify, snackbar} = useSnackbar();
  const folder = directories.find(item => item.id === folderId) ?? directories[0];
  const scores = folder?.scores ?? noScores;
  const search = query.trim().toLowerCase();
  const visible = scores.filter(score => (!format || score.format === format) && (!instrument || score.instrument === instrument)
    && (!search || [score.label, score.author, score.filename].some(value => value.toLowerCase().includes(search))));
  const selected = scores.find(score => score.id === selectedId) ?? visible[0];
  const selectedOptions = optionsFor(selected, preferences);
  const performance = useMemo(() => new Map(scores.map(score => [
    score.id, mapScore(score, optionsFor(score, preferences), profiles),
  ])), [preferences, profiles, scores]);
  const selectedPerformance = selected && performance.get(selected.id);
  const playable = visible.filter(score => !score.error && performance.get(score.id)?.score.notes.length);
  const duration = selectedPerformance?.score.duration ?? 0;
  const position = Math.min(duration, preview.position);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    function refresh() {
      const version = ++generation;
      void readDirectories().then(next => {
        if (alive && version === generation) setDirectories(next);
      }).catch(() => {
        if (alive) notify('无法读取曲库记录', 'danger');
      }).finally(() => {
        if (alive && version === generation && !scanning.current) setBusy(false);
      });
    }
    const stopWatching = watchDirectories(refresh);
    void migrateMusic().then(refresh, refresh);
    return () => {alive = false; stopWatching();};
  }, [notify]);

  function chooseFolder(id: string) {
    preview.stop();
    setFolderId(id);
    setSelectedId('');
    setQuery('');
    setFormat('');
    setInstrument('');
  }

  async function loadFiles(files: File[]) {
    if (scanning.current) return;
    const name = files[0]?.webkitRelativePath.split('/')[0];
    if (!name) return;
    scanning.current = true;
    setBusy(true);
    try {
      const previous = directories.find(directory => directory.name === name);
      const next = {id: previous?.id ?? crypto.randomUUID(), name, scores: await scanScores(files, previous)};
      await saveDirectory(next);
      if (next.id !== folder?.id || !next.scores.some(score => score.id === selectedId)) chooseFolder(next.id);
      else preview.stop();
      if (!next.scores.length) notify('所选目录没有 JSON 或 MIDI 曲谱');
    } catch {
      notify('无法扫描或保存曲谱目录', 'danger');
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }

  async function removeFolder() {
    if (!folder) return;
    try {
      await saveDirectory(folder.id);
      chooseFolder(directories.find(item => item.id !== folder.id)?.id ?? '');
    } catch {
      notify('无法删除目录记录', 'danger');
    }
  }

  function chooseScore(id: string) {
    if (id !== selected?.id) preview.stop();
    setSelectedId(id);
  }

  function play(score: Score | undefined, offset = 0) {
    if (!score) return;
    const mapped = performance.get(score.id)?.score;
    if (!mapped?.notes.length) {
      notify(score.error ?? '当前轨道和音高映射没有可演奏的音符', 'danger');
      return;
    }
    setSelectedId(score.id);
    if (playMode === 'guided') {
      preview.stop();
      setGuided(mapped);
      return;
    }
    void preview.play(mapped, offset < mapped.duration ? offset : 0, {
      bpm: settings.useCustomBpm ? settings.bpm : null,
      onEnded: () => onPlaybackEnded.current(score.id),
      onError: () => notify('浏览器无法播放此曲谱', 'danger'),
    });
  }

  function neighbour(id: string, direction: number, natural = false) {
    if (natural && playback === 1) return playable.find(choice => choice.id === id);
    if (playback === 2 && playable.length > 1) {
      const choices = playable.filter(score => score.id !== id);
      return choices[Math.floor(Math.random() * choices.length)];
    }
    const index = playable.findIndex(choice => choice.id === id);
    const next = index === -1 ? (direction > 0 ? 0 : playable.length - 1) : index + direction;
    return natural ? playable[next] :
      playable[(next + playable.length) % playable.length];
  }
  onPlaybackEnded.current = id => {
    const next = neighbour(id, 1, true);
    if (next) play(next);
  };

  function step(direction: number) {
    const next = neighbour(selected?.id ?? '', direction);
    if (!next) return;
    if (preview.playing) play(next);
    else chooseScore(next.id);
  }

  const formatChoices = [...new Set(scores.map(score => score.format))].map(value => ({value, label: value}));
  const instrumentChoices = [...new Set(scores.map(score => score.instrument))].map(value => ({value, label: value}));

  return <div className="bgi-music-page">
    <section className="bgi-card bgi-music-library" aria-label="我的曲库" aria-busy={busy}>
      <div className="bgi-music-header">
        <div className="bgi-wrap bgi-grow">
          <Text variant="section">我的曲库</Text>
          <span className="bgi-muted bgi-truncate" title={folder?.name}>曲谱目录：{folder?.name ?? '未选择'}</span>
        </div>
        <div className="bgi-wrap">
          <IconButton label="查看当前目录" icon="folder" disabled={!folder} onClick={() => setDialog('folder')}/>
          <Button icon="folder" appearance="primary" disabled={busy} onClick={() => picker.current?.click()}>选择目录</Button>
          <Button icon="trash" disabled={!folder || busy} onClick={() => setDialog('remove')}>删除记录</Button>
          <Button icon="settings" onClick={() => setDialog('settings')}>设置</Button>
        </div>
        <div className="bgi-music-mode">
          <Text variant="caption">演奏方式</Text>
          <Select label="演奏方式" value={playMode} options={playModes}
            onValueChange={next => {preview.stop(); setPlayMode(next);}}/>
        </div>
      </div>
      <div className="bgi-music-filters">
        <Select label="历史目录" value={folder?.id ?? ''} placeholder="历史目录"
          options={directories.map(item => ({value: item.id, label: item.name}))} onValueChange={chooseFolder} disabled={!directories.length}/>
        <SearchField label="搜索曲名、作者或路径" value={query} onChange={setQuery}/>
        <Select label="按格式筛选" value={format} onValueChange={setFormat}
          options={[{value: '', label: '全部格式'}, ...formatChoices]}/>
        <Select label="按乐器筛选" value={instrument} onValueChange={setInstrument}
          options={[{value: '', label: '全部乐器'}, ...instrumentChoices]}/>
        <IconButton label="重新扫描曲谱目录" icon="rotate" disabled={!folder || busy} onClick={() => picker.current?.click()}/>
        <FileInput inputRef={picker} multiple directory onFiles={loadFiles}/>
      </div>
      {visible.length ? <OverlayScrollArea areaClassName="bgi-music-list" className="bgi-music-list-content">
        <List scroll={false} rows={visible.map(score => ({
          id: score.id, label: score.label, icon: 'music', title: score.error ?? score.filename,
          detail: [score.author, score.format, score.instrument].join(' · '),
          status: score.error ? '解析失败' :
            time(score.duration) + ' · 可演奏 ' + (100 * (performance.get(score.id)?.ratio ?? 0)).toFixed(1) + '%',
        }))} selected={selected?.id} onSelect={chooseScore}
          onActivate={id => play(scores.find(score => score.id === id))}/>
      </OverlayScrollArea> : <Empty icon="music" title={busy ? '正在读取曲库' : scores.length ? '没有匹配的曲谱' : '曲库还是空的'}/>}
    </section>
    <section className="bgi-card bgi-music-transport" aria-label="播放控制">
      <div className="bgi-music-seek">
        <span>{time(position)}</span>
        <Slider label="播放进度" value={position} max={duration || 1} step={.1} disabled={!duration} showValue={false}
          valueText={time(position)} onChange={offset => {
            if (preview.playing && offset < duration) play(selected, offset);
            else preview.stop(offset);
          }}/>
        <span>{time(duration)}</span>
      </div>
      <div className="bgi-music-transport-row">
        <div className="bgi-music-current">
          <Icon name="music" size={22}/>
          <div className="bgi-grow">
            <Text variant="strong">{selected?.label ?? '等待播放'}</Text>
            <Text variant="caption">{selected ? selected.format + ' · ' + selected.instrument + ' · 浏览器试听' : '浏览器试听'}</Text>
          </div>
        </div>
        <div className="bgi-wrap bgi-music-transport-buttons">
          <IconButton label="上一首" icon="previous" disabled={playable.length < 2} onClick={() => step(-1)}/>
          <IconButton label={preview.playing ? '暂停' : playMode === 'guided' ? '开始跟弹' : '播放'}
            icon={preview.playing ? 'pause' : 'play'} appearance="primary" disabled={!selectedPerformance?.score.notes.length}
            onClick={() => {if (preview.playing) preview.pause(); else play(selected, position);}}/>
          <IconButton label="下一首" icon="next" disabled={playable.length < 2} onClick={() => step(1)}/>
          <IconButton label="停止" icon="stop" disabled={!preview.playing && !position} onClick={() => preview.stop()}/>
          <Button icon="rotate" onClick={() => setPlayback((playback + 1) % playbackModes.length)}>
            {playbackModes[playback]}
          </Button>
        </div>
        <div className="bgi-music-mode" title="本机演奏输入方式">
          <Text variant="caption">输入方式</Text>
          <Switch label={background ? '后台' : '前台'} checked={background} onChange={setBackground}/>
        </div>
      </div>
    </section>
    <MusicSettings open={dialog === 'settings'} onChange={open => setDialog(open ? 'settings' : undefined)}
      score={selected} scoreOptions={selectedOptions} options={settings} profiles={profiles}
      onOptions={patch => setSettings(previous => ({...previous, ...patch}))}
      onScoreOptions={patch => {
        const id = selected?.id ?? 'default';
        setPreferences(previous => ({...previous, [id]: {...previous[id], ...patch}}));
      }}
      onProfile={(name, profile) => setProfiles(previous => ({...previous, [name]: profile}))}/>
    <Modal title={folder?.name ?? '当前曲谱目录'} open={dialog === 'folder'}
      onChange={open => setDialog(open ? 'folder' : undefined)}>
      {scores.length ? <List rows={scores.map(score => ({id: score.id, label: score.filename, icon: 'file'}))}
        selected={selected?.id} onSelect={id => {chooseScore(id); setDialog(undefined);}}/> : <Empty title="目录中没有曲谱"/>}
    </Modal>
    <MessageDialog title="删除目录记录" message={'从历史目录中移除「' + (folder?.name ?? '') + '」？'}
      tone="warning" open={dialog === 'remove'} onChange={open => setDialog(open ? 'remove' : undefined)} confirm={removeFolder}/>
    {guided && <GuidedMusic score={guided} onClose={() => setGuided(undefined)}/>}
    <Snackbar {...snackbar}/>
  </div>;
}
