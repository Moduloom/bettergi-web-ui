import {useState} from 'react';
import {Button, Choice, Field, Icon, NumberField, Select, Text} from '../../components/controls';
import {Card, Empty, Expander, SettingsList, SettingsRow} from '../../components/collections';
import {Modal} from '../../components/overlays';
import {getProfile, instruments, mapScore, type Profile, type Profiles, type ScoreOptions} from './music-performance';
import type {Score} from './music-score';

export type MusicOptions = {useCustomBpm: boolean; bpm: number; autoInstrument: boolean};
export const defaultMusicOptions: MusicOptions = {useCustomBpm: false, bpm: 120, autoInstrument: false};
const profileChoices = instruments.map(name => ({label: name, value: name}));
const mappingModes = [
  {value: 'MelodicOctaveFold', label: 'MelodicOctaveFold'},
  {value: 'Exact', label: 'Exact'},
];

export function MusicSettings({open, onChange, score, options, scoreOptions, profiles, onOptions, onScoreOptions, onProfile}: {
  open: boolean; onChange: (open: boolean) => void;
  score?: Score; options: MusicOptions; scoreOptions: ScoreOptions; profiles: Profiles;
  onOptions: (patch: Partial<MusicOptions>) => void;
  onScoreOptions: (patch: Partial<ScoreOptions>) => void;
  onProfile: (name: string, value: Profile) => void;
}) {
  const [showTracks, setShowTracks] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [draft, setDraft] = useState<Profile>();
  const profile = draft ?? getProfile(scoreOptions.instrument, profiles);
  const statistics = score && mapScore(score, scoreOptions, profiles).tracks;
  const midiTracks = score?.format === 'MIDI' ? score.tracks.filter(track => statistics?.has(track.id)) : [];

  function close(next: boolean) {
    if (!next) setDraft(undefined);
    onChange(next);
  }

  return <Modal title="演奏设置" open={open} onChange={close} width={720} wide
    iconContent={<Icon name="settings" size={16}/>}>
    <div className="bgi-stack">
      <Card title="输出设置" icon="music" description="设置当前曲目的乐器档案与移调">
        <div className="bgi-music-setting-fields">
          <Field label="乐器档案"><Select label="乐器档案" options={profileChoices} value={scoreOptions.instrument}
            onValueChange={instrument => {setDraft(undefined); onScoreOptions({instrument});}}/></Field>
          <Field label="半音移调"><NumberField label="半音移调" value={scoreOptions.transpose} min={-24} max={24}
            onChange={transpose => onScoreOptions({transpose})}/></Field>
        </div>
      </Card>
      <Card title="演奏控制" icon="sliders" description="覆盖曲谱速度，并在演奏时准备对应乐器">
        <SettingsList>
          <SettingsRow inline label="曲谱速度" description="按曲谱原 BPM 等比例调整整首曲目的播放速度"
            control={<div className="bgi-music-tempo">
              <Choice label="使用自定义 BPM" checked={options.useCustomBpm} onChange={useCustomBpm => onOptions({useCustomBpm})}/>
              <NumberField label="自定义 BPM" value={options.bpm} min={1} max={1000} step={.1}
                disabled={!options.useCustomBpm} onChange={bpm => onOptions({bpm})}/>
            </div>}/>
          <Choice label="演奏前自动更换乐器" checked={options.autoInstrument}
            onChange={autoInstrument => onOptions({autoInstrument})}/>
        </SettingsList>
      </Card>
      <Expander title="MIDI 轨道" icon="layers" description="启用轨道并查看音域与映射命中率"
        open={showTracks} onChange={setShowTracks}>
        {midiTracks.length ? <SettingsList separated>
          {midiTracks.map(track => {
            const stat = statistics?.get(track.id);
            const enabled = !scoreOptions.muted.includes(track.id);
            return <SettingsRow key={track.id} inline label={track.name}
              description={stat && [stat.min + '–' + stat.max, enabled ?
                (100 * stat.mapped / stat.total).toFixed(1) + '%' : '已禁用'].join(' · ')}
              control={<Choice label={'启用' + track.name} checked={enabled}
                onChange={checked => onScoreOptions({muted: checked ? scoreOptions.muted.filter(id => id !== track.id) :
                  [...scoreOptions.muted, track.id]})}/>}/>;
          })}
        </SettingsList> : <Empty icon="music" title="当前曲目没有 MIDI 轨道"/>}
      </Expander>
      <Expander title="音高映射" icon="settings" open={showMapping} onChange={setShowMapping}>
        <div className="bgi-stack">
          <SettingsRow label="映射模式" inline control={<Select label="映射模式" options={mappingModes} value={profile.mode}
            onValueChange={mode => setDraft({...profile, mode: mode as Profile['mode']})}/>}/>
          <div className="bgi-music-mapping">
            {Object.entries(profile.pitches).map(([key, value]) => <div className="bgi-music-mapping-entry" key={key}>
              <Text variant="strong">{key}</Text>
              <NumberField label={key + ' 键音高'} value={value} min={0} max={127}
                onChange={pitch => setDraft({...profile, pitches: {...profile.pitches, [key]: pitch}})}/>
            </div>)}
          </div>
          <div className="bgi-actions"><Button icon="check" appearance="primary" disabled={!draft} onClick={() => {
            if (!draft) return;
            onProfile(scoreOptions.instrument, draft);
            setDraft(undefined);
          }}>保存映射</Button></div>
        </div>
      </Expander>
    </div>
  </Modal>;
}
