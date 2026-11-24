import {useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {prefersReducedMotion} from 'loom-frame/ui';

const easing = 'cubic-bezier(.22,.08,.16,1)';

export function duration(node: Element, ratio = 1) {
  if (prefersReducedMotion()) return 0;
  const value = getComputedStyle(node).getPropertyValue('--bgi-motion').trim();
  return (value ? parseFloat(value) * (value.endsWith('ms') ? 1 : 1000) : 240) * ratio;
}

/** Read the screen position before cancelling so a new target can take over mid-flight. */
export function retarget(
  node: HTMLElement, previous: Animation | undefined, to: Keyframe,
  milliseconds: number, curve = easing,
) {
  const current = getComputedStyle(node);
  const from = {opacity: current.opacity, transform: current.transform};
  previous?.cancel();
  if (to.opacity !== undefined) node.style.opacity = String(to.opacity);
  if (typeof to.transform === 'string') node.style.transform = to.transform;
  return node.animate([from, to], {duration: milliseconds, easing: curve});
}

export function usePresence(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  shift = 'translateY(6px) scale(.985)',
  {durationScale = 1, fade = true, curve = easing, restingTransform = 'none'}: {
    durationScale?: number; fade?: boolean; curve?: string; restingTransform?: string;
  } = {},
) {
  const [retained, setRetained] = useState(open);
  const active = useRef<Animation | undefined>(undefined);
  const mounted = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (mounted.current !== node) {
      mounted.current = node;
      node.style.opacity = fade ? '0' : '1';
      node.style.transform = shift;
      if (!open) return;
    }
    if (open) setRetained(true);
    const animation = retarget(node, active.current, {
      opacity: open || !fade ? 1 : 0,
      transform: open ? restingTransform : shift,
    }, duration(node, durationScale * (open ? 1 : .7)), curve);
    active.current = animation;
    void animation.finished.then(() => {
      if (active.current !== animation) return;
      active.current = undefined;
      if (!open) setRetained(false);
    }, () => {});
  }, [open, ref, shift, durationScale, fade, curve, restingTransform]);

  useLayoutEffect(() => () => active.current?.cancel(), []);
  return open || retained;
}

export function renderedRowOffset(node: HTMLElement) {
  return new DOMMatrixReadOnly(getComputedStyle(node).transform).m42;
}

type RowSnapshot = {
  tops: Map<HTMLElement, number>;
  anchor?: {node: HTMLElement; top: number};
};

/** Owns both drag projection and the handoff to committed layout. */
export function useFlipRows(ref: RefObject<HTMLUListElement | null>, order: string,
  scrollport?: RefObject<HTMLElement | null>) {
  const animations = useRef(new Map<HTMLElement, Animation>());
  const offsets = useRef(new Map<HTMLElement, number>());
  const pending = useRef<RowSnapshot | null>(null);
  const rows = () => Array.from(ref.current?.querySelectorAll<HTMLLIElement>(':scope > [data-bgi-row]') ?? []);

  function animateOffset(node: HTMLElement, from: number, to: number, ratio: number) {
    animations.current.get(node)?.cancel();
    animations.current.delete(node);
    if (to) {
      offsets.current.set(node, to);
      node.style.transform = 'translate3d(0,' + to + 'px,0)';
    } else {
      offsets.current.delete(node);
      node.style.removeProperty('transform');
    }
    if (Math.abs(from - to) < .25) return;
    const time = duration(node, ratio);
    if (!time) return;

    const animation = node.animate([
      {transform: 'translate3d(0,' + from + 'px,0)'},
      {transform: 'translate3d(0,' + to + 'px,0)'},
    ], {duration: time, easing});
    animations.current.set(node, animation);
    void animation.finished.then(() => {
      if (animations.current.get(node) === animation) animations.current.delete(node);
    }, () => {});
  }

  function project(positions: {node: HTMLElement; offset: number}[]) {
    const frames = positions.filter(({node, offset}) => (offsets.current.get(node) ?? 0) !== offset)
      .map(({node, offset}) => ({node, from: renderedRowOffset(node), offset}));
    for (const {node, from, offset} of frames) animateOffset(node, from, offset, .75);
  }

  function beforeChange(keepAnchor = true) {
    const list = ref.current;
    if (!list) return;
    const tops = new Map(rows().map(node => [node, node.getBoundingClientRect().top]));
    const viewport = scrollport?.current ?? list;
    const viewportTop = viewport.getBoundingClientRect().top;
    const visible = keepAnchor && viewport.scrollTop > 0 ?
      [...tops].find(([, top]) => top >= viewportTop - 1) : undefined;
    pending.current = {tops, anchor: visible && {node: visible[0], top: visible[1]}};
  }

  function clearMotion() {
    for (const animation of animations.current.values()) animation.cancel();
    for (const node of offsets.current.keys()) node.style.removeProperty('transform');
    animations.current.clear();
    offsets.current.clear();
  }

  useLayoutEffect(() => {
    const list = ref.current;
    const snapshot = pending.current;
    pending.current = null;
    clearMotion();
    if (!list || !snapshot) return;

    if (snapshot.anchor?.node.isConnected) {
      const viewport = scrollport?.current ?? list;
      viewport.scrollTop += snapshot.anchor.node.getBoundingClientRect().top - snapshot.anchor.top;
    }
    // Read all committed geometry before starting the new transforms.
    const layout = rows().map(node => ({node, top: node.getBoundingClientRect().top}));
    for (const {node, top} of layout) {
      const before = snapshot.tops.get(node);
      if (before !== undefined) animateOffset(node, before - top, 0, .95);
    }
  }, [order, ref, scrollport]);

  useLayoutEffect(() => clearMotion, []);

  function releaseProjection() {
    pending.current = null;
    const projections = [...offsets.current.keys()].map(node => ({node, from: renderedRowOffset(node)}));
    for (const {node, from} of projections) animateOffset(node, from, 0, .95);
  }

  return {
    beforeChange,
    project,
    follow: (node: HTMLElement, offset: number) => animateOffset(node, offset, offset, 0),
    releaseProjection,
    hasPendingChange: () => pending.current !== null,
    animationFor: (node: HTMLElement) => animations.current.get(node),
  };
}
