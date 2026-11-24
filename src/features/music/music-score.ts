export type Note = {pitch: number; start: number; end: number; track: number; velocity: number; key?: string};
export type ScoreTrack = {id: number; name: string};
export type Score = {
  id: string; label: string; filename: string; author: string; instrument: string; format: string;
  bpm: number; duration: number; notes: Note[]; tracks: ScoreTrack[];
  error?: string;
};

const fallbackInstrument = '风物之诗琴';
const keyboard = ['ZXCVBNM', 'ASDFGHJ', 'QWERTYU'];
const degrees = [0, 2, 4, 5, 7, 9, 11];
export const standardPitches = Object.fromEntries(keyboard.flatMap((keys, octave) =>
  [...keys].map((key, index) => [key, 48 + 12 * octave + degrees[index]])));
const maxFileBytes = 16 * 1024 * 1024;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function string(value: unknown, fallback = '') {return typeof value === 'string' && value ? value : fallback;}
function positive(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function notesAt(notes: Note[], key: string, start: number, end: number) {
  for (const char of new Set(key.toUpperCase())) {
    const pitch = standardPitches[char];
    if (pitch !== undefined) notes.push({key: char, pitch, start, end: Math.max(start + .03, end), track: 0, velocity: .7});
  }
}
type KeyEvent = {keys: string; time: number; down: boolean};
function explicitNotes(events: readonly KeyEvent[], end: number) {
  const notes: Note[] = [];
  const current = new Map<string, number>();
  for (const event of events) {
    for (const key of new Set(event.keys.toUpperCase())) {
      const start = current.get(key);
      if (start !== undefined) notesAt(notes, key, start, event.time);
      if (event.down) current.set(key, event.time); else current.delete(key);
    }
  }
  for (const [key, start] of current) notesAt(notes, key, start, end);
  return notes;
}

function midiJson(raw: unknown, initial: number, ticks: number) {
  if (typeof raw !== 'string') throw new Error('MIDI JSON 的 notes 需要是文本。');
  let cursor = 0, bpm = initial;
  const events: KeyEvent[] = [];
  for (const piece of raw.split('|').map(part => part.trim()).filter(Boolean)) {
    if (piece.startsWith('*')) {
      bpm = positive(piece.slice(1), 0);
      if (!bpm) throw new Error('无效的 MIDI JSON 变速标记。');
      continue;
    }
    const match = /^([DU])([A-Z@]+)(\d+)$/.exec(piece);
    if (!match) throw new Error('无效的 MIDI JSON 事件：' + piece);
    cursor += Number(match[3]) * 60 / (bpm * ticks);
    if (match[2] !== '@') events.push({keys: match[2], time: cursor, down: match[1] === 'D'});
  }
  return {notes: explicitNotes(events, cursor), duration: cursor};
}

function moTick(raw: unknown, captureData: unknown) {
  const tick = object(raw);
  const unit = string(tick.unit, 'ms').toLowerCase();
  let scale = .001;
  if (unit === 'frame' || unit === 'frames') {
    const capture = object(captureData);
    const duration = positive(capture.duration_ms, 0);
    const frames = positive(capture.frames, 0);
    if (!duration || frames <= 1) throw new Error('缺少帧数或录制时长。');
    scale = duration / (frames - 1) / 1000;
  } else if (!['ms', 'millisecond', 'milliseconds'].includes(unit)) throw new Error('不支持的 mo-Tick 时间单位。');
  const text = string(typeof raw === 'string' ? raw : tick.text).toUpperCase();
  if (!text.trim()) throw new Error('mo-Tick 谱面的 tick.text 为空。');
  let cursor = 0, gap = 0;
  const notes: Note[] = [];
  for (const match of text.matchAll(/([A-Z]+)(?:\[([0-9]+(?:\.[0-9]+)?)\])?|([0-9]+(?:\.[0-9]+)?)/g)) {
    if (match[3]) {gap += Number(match[3]) * scale; continue;}
    cursor += gap;
    gap = 0;
    notesAt(notes, match[1], cursor, cursor + (Number(match[2]) || 0) * scale);
  }
  if (!notes.length) throw new Error('mo-Tick 谱面没有音符。');
  return {notes, duration: cursor};
}

type Token = {keys: string; denominator: number; special: string};
const tuplet = /^(\d+)\.[36$]$/;
function yuanqin(raw: unknown, initial: number, beatDenominator: number) {
  const tokens: Token[] = [];
  if (Array.isArray(raw)) {
    for (const value of raw) {
      const item = object(value);
      const keys = string(item.note);
      const special = string(item.spl, 'none');
      if (!keys) throw new Error('原琴曲谱的音符缺少 note。');
      tokens.push({keys, denominator: positive(item.type, 0), special});
    }
  } else if (typeof raw === 'string') {
    const sheet = raw.replace(/[\r\n|]/g, '');
    const pattern = /(?:\(([^)]+)\)|([^()[\]]))\[([^\]]+)\]/gy;
    let position = 0;
    while (position < sheet.length) {
      pattern.lastIndex = position;
      const match = pattern.exec(sheet);
      if (!match) throw new Error('原琴曲谱的音符缺少有效时值。');
      position = pattern.lastIndex;
      const [value, mark] = match[3].split('-');
      tokens.push({keys: match[1] ?? match[2], denominator: positive(value, 0),
        special: value === '^' || value === '&' ? value : mark ?? 'none'});
    }
  } else throw new Error('原琴曲谱缺少 notes。');

  const notes: Note[] = [];
  const events: KeyEvent[] = [];
  let bpm = initial, cursor = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.special === '%') {bpm = positive(token.denominator, bpm); continue;}
    if (token.special === '^' || token.special === '&') {
      events.push({keys: token.keys, time: cursor, down: token.special === '^'});
      if (token.special === '&') cursor += .03;
      continue;
    }
    if (!token.denominator && token.special !== '#') throw new Error('原琴曲谱出现无效时值。');
    const beat = 60 / bpm;
    if (tuplet.test(token.special)) {
      const group: Token[] = [token];
      while (!group.at(-1)!.special.endsWith('$') && index < tokens.length - 1) group.push(tokens[++index]);
      if (!group.at(-1)!.special.endsWith('$')) throw new Error('连音缺少 .$ 结束标记。');
      const weights = group.map(item => 1 / Number(tuplet.exec(item.special)?.[1]));
      const sum = weights.reduce((a, b) => a + b, 0);
      if (!Number.isFinite(sum) || sum <= 0) throw new Error('连音的时值无效。');
      group.forEach((item, i) => {
        const duration = beat * beatDenominator / token.denominator * weights[i] / sum;
        notesAt(notes, item.keys, cursor, cursor + duration);
        cursor += duration;
      });
      continue;
    }
    let duration = token.special === '#' ? beat / 16 :
      beat * beatDenominator / token.denominator * (token.special === '*' ? 1.5 : 1);
    if (token.special === 'none' || token.special === '*') {
      let ornaments = 0;
      while (tokens[index + ornaments + 1]?.special === '#') ornaments++;
      const totalOrnaments = beat * ornaments / 16;
      if (totalOrnaments < duration) duration -= totalOrnaments;
    }
    notesAt(notes, token.keys, cursor, cursor + duration);
    cursor += duration;
  }
  return {notes: [...notes, ...explicitNotes(events, cursor)], duration: cursor};
}

type KeyboardNode = {type: string; length: number; children: KeyboardNode[]};
function keyboardScore(raw: unknown, bpm: number) {
  if (typeof raw !== 'string') throw new Error('键谱的 notes 需要是文本。');
  const body = raw.replace(/\/\(([^)]+)\)/g, '{$1}').replace(/\/([A-Z])/g, '{$1}').replace(/ /g, '0')
    .replace(/\/\[([^\]]+)\]/g, '{[$1]}').replace(/[/>]/g, '');
  let pointer = 0;
  const matching: Record<string, string> = {'(': ')', '[': ']', '{': '}'};
  function read(end = '', depth = 0): KeyboardNode[] {
    if (depth > 64) throw new Error('键谱嵌套过深。');
    const nodes: KeyboardNode[] = [];
    while (pointer < body.length) {
      const char = body[pointer++];
      if (char === end) return nodes;
      if (')]}'.includes(char)) throw new Error('键谱括号不匹配。');
      if (char === '-') {
        if (!nodes.length) throw new Error('延音前没有音符。');
        nodes[nodes.length - 1].length++;
      } else nodes.push({type: char, length: 1, children: matching[char] ? read(matching[char], depth + 1) : []});
    }
    if (end) throw new Error('键谱缺少结束括号。');
    return nodes;
  }
  const notes: Note[] = [];
  function emit(node: KeyboardNode, time: number, duration: number) {
    if (!matching[node.type]) notesAt(notes, node.type, time, time + duration);
    else if (node.type === '[' && node.children.length) {
      const unit = duration / node.children.length;
      node.children.forEach((child, index) => emit(child, time + index * unit, unit));
    } else node.children.forEach(child => emit(child, time + (node.type === '{' ? .001 * 60 / bpm : 0), duration));
  }
  let cursor = 0;
  for (const node of read()) {
    const duration = node.length * 60 / bpm;
    emit(node, cursor, duration);
    cursor += duration;
  }
  return {notes, duration: cursor};
}

type RawNote = {pitch: number; start: number; end: number; track: number; velocity: number};
function parseMidi(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const text = (position: number, length: number) => new TextDecoder().decode(bytes.subarray(position, position + length));
  if (bytes.length < 14 || text(0, 4) !== 'MThd' || view.getUint32(4) < 6) throw new Error('MIDI 文件头无效。');
  const count = view.getUint16(10);
  const resolution = view.getUint16(12);
  if (!count || !resolution || resolution & 0x8000) throw new Error('无法读取此 MIDI 时间基准。');
  let offset = 8 + view.getUint32(4);
  const notes: RawNote[] = [];
  const tracks: ScoreTrack[] = [];
  const tempos = [{tick: 0, micros: 500000}];
  let endTick = 0;
  for (let track = 0; track < count; track++) {
    if (offset + 8 > bytes.length || text(offset, 4) !== 'MTrk') throw new Error('MIDI 轨道不完整。');
    const end = offset + 8 + view.getUint32(offset + 4);
    if (end > bytes.length) throw new Error('MIDI 轨道超出文件长度。');
    offset += 8;
    let time = 0, status = 0, name = '轨道 ' + (track + 1);
    const held = new Map<number, Array<{start: number; pitch: number; velocity: number}>>();
    const byte = () => {
      if (offset >= end) throw new Error('MIDI 事件被截断。');
      return bytes[offset++];
    };
    const variable = () => {
      let result = 0;
      for (let index = 0; index < 4; index++) {
        const next = byte();
        result = 128 * result + (next & 127);
        if (!(next & 128)) return result;
      }
      throw new Error('MIDI 事件长度无效。');
    };
    const skip = (length: number) => {
      if (offset + length > end) throw new Error('MIDI 事件超出轨道长度。');
      const start = offset;
      offset += length;
      return start;
    };
    while (offset < end) {
      time += variable();
      let event = byte();
      if (!(event & 128)) {
        if (!status) throw new Error('MIDI 运行状态无效。');
        event = status;
        offset--;
      } else if (event < 0xf0) status = event;
      if (event === 0xff) {
        const type = byte();
        const length = variable();
        const start = skip(length);
        if (type === 0x03 && length) name = text(start, length).trim() || name;
        if (type === 0x51 && length === 3) {
          const micros = bytes[start] * 65536 + bytes[start + 1] * 256 + bytes[start + 2];
          if (micros > 0) tempos.push({tick: time, micros});
        }
        if (type === 0x2f) break;
        continue;
      }
      if (event === 0xf0 || event === 0xf7) {skip(variable()); status = 0; continue;}
      if (event >= 0xf0) throw new Error('不支持的 MIDI 系统事件。');
      const kind = event & 0xf0;
      const first = byte();
      const second = kind === 0xc0 || kind === 0xd0 ? 0 : byte();
      if (kind !== 0x80 && kind !== 0x90) continue;
      const id = (event & 15) * 128 + first;
      const pending = held.get(id) ?? [];
      if (kind === 0x90 && second) {
        pending.push({start: time, pitch: first, velocity: second / 127});
        held.set(id, pending);
      } else if (pending.length) {
        notes.push({...pending.shift()!, end: time, track});
        if (!pending.length) held.delete(id);
      }
    }
    for (const ending of held.values()) for (const note of ending) notes.push({...note, end: time, track});
    endTick = Math.max(endTick, time);
    tracks.push({id: track, name});
    offset = end;
  }
  const ordered = tempos.sort((a, b) => a.tick - b.tick);
  const segments: Array<{tick: number; micros: number; seconds: number}> = [];
  let elapsed = 0;
  ordered.forEach((tempo, i) => {
    if (i) elapsed += (tempo.tick - ordered[i - 1].tick) * ordered[i - 1].micros / resolution / 1e6;
    segments.push({...tempo, seconds: elapsed});
  });
  function at(tick: number) {
    let first = 0, last = segments.length - 1;
    while (first < last) {
      const next = Math.ceil((first + last) / 2);
      if (segments[next].tick <= tick) first = next; else last = next - 1;
    }
    const segment = segments[first];
    return segment.seconds + (tick - segment.tick) * segment.micros / resolution / 1e6;
  }
  return {
    notes: notes.map(note => {
      const start = at(note.start);
      return {...note, start, end: Math.max(start + .03, at(note.end))};
    }),
    duration: at(endTick), bpm: 60e6 / (segments.findLast(item => item.tick === 0)?.micros ?? 500000), tracks,
  };
}

const jsonTypes: Record<string, string> = {
  yuanqin: '原琴', midi: 'MIDI JSON', keyboard: '键谱', motick: 'mo-Tick',
  mo_tick: 'mo-Tick', 'mo-tick': 'mo-Tick', yqrec: 'mo-Tick', tick: 'mo-Tick',
};

export async function readScore(file: File): Promise<Score> {
  const filename = file.webkitRelativePath || file.name;
  const midi = /\.midi?$/i.test(file.name);
  const base: Score = {id: crypto.randomUUID(), label: file.name.replace(/\.[^.]+$/, ''), filename,
    author: '未知作者', instrument: fallbackInstrument, format: midi ? 'MIDI' : 'JSON',
    bpm: 120, duration: 0, notes: [], tracks: []};
  try {
    if (file.size > maxFileBytes) throw new Error('曲谱超过 16 MB。');
    if (midi) Object.assign(base, parseMidi(await file.arrayBuffer()));
    else {
      const data = object(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      const type = string(data.type, data.tick !== undefined || data.format === 'yqrec.recording' ? 'motick' : 'yuanqin').toLowerCase();
      const format = jsonTypes[type];
      Object.assign(base, {label: string(data.name, base.label), author: string(data.author, base.author),
        instrument: string(data.instrument, base.instrument), bpm: positive(data.bpm, 120), format: format ?? 'JSON'});
      if (!format) throw new Error('无法识别此曲谱格式。');
      const timeline = type === 'yuanqin' ? yuanqin(data.notes, base.bpm, positive(string(data.time_signature, '4/4').split('/')[1], 4)) :
        type === 'midi' ? midiJson(data.notes, base.bpm, positive(data.ticks, 480)) :
          type === 'keyboard' ? keyboardScore(data.notes, base.bpm) : moTick(data.tick, data.capture);
      Object.assign(base, timeline, {tracks: [{id: 0, name: '主轨道'}]});
    }
    base.notes.sort((a, b) => a.start - b.start);
    base.duration = base.notes.reduce((total, note) => Math.max(total, note.end), base.duration);
    return base;
  } catch (reason) {
    return {...base, notes: [], duration: 0, error: reason instanceof Error ? reason.message : '读取曲谱失败。'};
  }
}
