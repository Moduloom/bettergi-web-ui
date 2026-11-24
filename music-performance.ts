import {standardPitches, type Note, type Score} from './music-score';

export const instruments = [
  '风物之诗琴', '老旧的诗琴', '镜花之琴', '谐律键琴', '跃律琴',
  '悠可琴', '晚风圆号', '余音', '绮筵之鼓', '聚聚鼓',
];
type MappingMode = 'MelodicOctaveFold' | 'Exact';
export type Profile = {mode: MappingMode; pitches: Record<string, number>};
export type Profiles = Record<string, Profile>;
export type ScoreOptions = {instrument: string; transpose: number; muted: number[]};

export function defaultInstrument(score: Score | undefined) {
  return score?.instrument.split(',').map(name => name.trim()).find(name => instruments.includes(name)) ?? instruments[0];
}

export function getProfile(name: string, profiles: Profiles): Profile {
  return profiles[name] ?? {
    mode: ['绮筵之鼓', '聚聚鼓'].includes(name) ? 'Exact' : 'MelodicOctaveFold', pitches: standardPitches,
  };
}

export function mapScore(score: Score, options: ScoreOptions, profiles: Profiles) {
  const sourceName = defaultInstrument(score);
  const source = getProfile(sourceName, profiles);
  const output = getProfile(options.instrument, profiles);
  const choices = Object.entries(output.pitches);
  const min = Math.min(...Object.values(output.pitches));
  const max = Math.max(...Object.values(output.pitches));
  const mapped: Note[] = [];
  const tracks = new Map<number, {min: number; max: number; total: number; mapped: number}>();
  let count = 0;
  let duration = 0;
  for (const note of score.notes) {
    const track = tracks.get(note.track) ?? {min: note.pitch, max: note.pitch, total: 0, mapped: 0};
    tracks.set(note.track, track);
    track.min = Math.min(note.pitch, track.min);
    track.max = Math.max(note.pitch, track.max);
    track.total++;
    if (options.muted.includes(note.track)) continue;
    count++;
    duration = Math.max(duration, note.end);
    let target = (note.key ? source.pitches[note.key] : note.pitch) + options.transpose;
    if (!Number.isFinite(target)) continue;
    if (output.mode === 'MelodicOctaveFold') {
      if (target < min) target += 12 * Math.ceil((min - target) / 12);
      if (target > max) target -= 12 * Math.ceil((target - max) / 12);
    }
    const key = note.key && sourceName === options.instrument && options.transpose === 0 ? note.key :
      choices.find(([, pitch]) => pitch === target)?.[0];
    if (!key) continue;
    track.mapped++;
    mapped.push({...note, key, pitch: output.pitches[key]});
  }
  return {score: {...score, notes: mapped, duration: score.format === 'MIDI' ? duration : score.duration},
    tracks, ratio: count ? mapped.length / count : 0};
}

export function guidedChords(notes: readonly Note[]) {
  const chords: {time: number; keys: string[]}[] = [];
  for (const note of notes) {
    if (!note.key) continue;
    const previous = chords.at(-1);
    if (!previous || note.start - previous.time > .025) chords.push({time: note.start, keys: [note.key]});
    else if (!previous.keys.includes(note.key)) previous.keys.push(note.key);
  }
  return chords;
}
