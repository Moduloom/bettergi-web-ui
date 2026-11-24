import {useEffect, useRef, useState} from 'react';
import type {Score} from './music-score';

type PreviewOptions = {
  bpm: number | null; onEnded: () => void; onError: () => void;
};
type Session = {
  timer: number; nodes: Set<OscillatorNode>; origin: number; offset: number;
  rate: number; duration: number; context: AudioContext;
};

export function useMusicPreview() {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const context = useRef<AudioContext | undefined>(undefined);
  const active = useRef<Session | undefined>(undefined);
  const request = useRef(0);

  function cancel() {
    ++request.current;
    const session = active.current;
    if (!session) return;
    active.current = undefined;
    window.clearInterval(session.timer);
    for (const node of session.nodes) {
      try {node.stop();} catch {}
      node.disconnect();
    }
  }
  function stop(offset = 0) {
    cancel();
    setPlaying(false);
    setPosition(offset);
  }
  function pause() {
    const session = active.current;
    const cursor = session ? Math.min(session.duration, session.offset +
      (session.context.currentTime - session.origin) * session.rate) : position;
    stop(cursor);
  }
  async function play(score: Score, offset: number, options: PreviewOptions) {
    cancel();
    if (!score.duration || !score.notes.length) {setPlaying(false); return;}
    const token = request.current;
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      await audio.resume();
      if (token !== request.current) return;
      const rate = options.bpm ? options.bpm / score.bpm : 1;
      const start = Math.min(score.duration, Math.max(0, offset));
      const origin = audio.currentTime + .025;
      const notes = score.notes.filter(note => note.end > start);
      let index = 0;
      const session: Session = {timer: 0, nodes: new Set(), offset: start, origin, duration: score.duration, rate, context: audio};
      const pump = () => {
        if (active.current !== session) return;
        const now = audio.currentTime;
        const cursor = Math.max(start, start + (now - origin) * rate);
        if (cursor >= score.duration) {
          stop(score.duration);
          options.onEnded();
          return;
        }
        setPosition(cursor);
        const horizon = cursor + .3 * rate;
        while (index < notes.length && notes[index].start <= horizon) {
          const note = notes[index++];
          const from = Math.max(now, origin + (Math.max(start, note.start) - start) / rate);
          const until = origin + (note.end - start) / rate;
          if (until <= from || session.nodes.size > 100) continue;
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          const volume = .065 * Math.max(.08, Math.min(1, note.velocity));
          oscillator.type = 'triangle';
          oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
          gain.gain.setValueAtTime(0, from);
          gain.gain.linearRampToValueAtTime(volume, Math.min(until, from + .008));
          gain.gain.exponentialRampToValueAtTime(.0005, until + .07);
          oscillator.connect(gain).connect(audio.destination);
          session.nodes.add(oscillator);
          oscillator.onended = () => {
            session.nodes.delete(oscillator);
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(from);
          oscillator.stop(until + .08);
        }
      };
      active.current = session;
      session.timer = window.setInterval(pump, 70);
      setPlaying(true);
      setPosition(start);
      pump();
    } catch {
      if (token === request.current) {
        stop();
        options.onError();
      }
    }
  }
  useEffect(() => () => {
    cancel();
    void context.current?.close().catch(() => {});
    context.current = undefined;
  }, []);
  return {playing, position, play, pause, stop};
}
