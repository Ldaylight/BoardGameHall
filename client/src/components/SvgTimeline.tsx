import { createElement, useLayoutEffect, useRef, type SVGProps } from 'react';

type Values = Record<string, number | number[]>;
type Timing = {
  delay?: number;
  duration?: number;
  times?: number[];
  ease?: string | number[];
};
type Props = SVGProps<SVGElement> & {
  initial: Record<string, number>;
  animate: Values;
  transition: Timing & Record<string, Timing | string | number | number[] | undefined>;
};
const ease = (value: Timing['ease']) => {
  if (Array.isArray(value)) return `cubic-bezier(${value.join(',')})`;
  return (
    ({ easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out' } as Record<string, string>)[
      value ?? ''
    ] ?? 'linear'
  );
};
const offsets = (count: number, times?: number[]) =>
  times?.length === count ? times : Array.from({ length: count }, (_, i) => i / (count - 1));
const transform = (v: Record<string, number>) =>
  `translate(${v.x ?? 0}px, ${v.y ?? 0}px) rotate(${v.rotate ?? 0}deg) scale(${v.scale ?? 1})`;

/** Native SVG effects start in the layout pass; no asynchronous bounding-box measurement delays the hit. */
function component(tag: 'g' | 'path' | 'circle') {
  return function SvgTimeline({ initial, animate, transition, style, children, ...attributes }: Props) {
    const ref = useRef<SVGElement>(null);
    // Each effect is keyed by its public move. Its coordinates remain fixed for that short playback.
    const snapshot = useRef({ initial, animate, transition });
    useLayoutEffect(() => {
      const node = ref.current;
      if (!node) return;
      const { initial, animate, transition: t } = snapshot.current;
      const animations: Animation[] = [];
      function run(frames: Keyframe[], timing: Timing) {
        const duration = Math.max(1, (timing.duration ?? 0.3) * 1000);
        const animation = node!.animate(frames, {
          duration,
          delay: (timing.delay ?? 0) * 1000,
          fill: 'both',
          easing: ease(timing.ease),
        });
        // Anchor to the monotonic clock immediately. A busy first paint must not delay the impact.
        animation.startTime = performance.now();
        animations.push(animation);
      }
      const keys = ['x', 'y', 'rotate', 'scale'].filter((key) => key in initial || key in animate);
      if (keys.length) {
        const tracks = keys.map((key) => {
          const value = animate[key];
          const values = Array.isArray(value)
            ? value
            : [initial[key] ?? (key === 'scale' ? 1 : 0), value ?? initial[key]];
          return { key, values, offsets: offsets(values.length, t.times) };
        });
        const positions = [...new Set(tracks.flatMap((track) => track.offsets))].sort((a, b) => a - b);
        run(
          positions.map((offset) => {
            const value: Record<string, number> = {};
            for (const track of tracks) {
              const index = Math.max(0, track.offsets.findIndex((stop, i) => stop >= offset && i > 0) - 1);
              const start = track.offsets[index],
                end = track.offsets[index + 1];
              const fraction = end === start ? 1 : (offset - start) / (end - start);
              value[track.key] =
                track.values[index] + (track.values[index + 1] - track.values[index]) * fraction;
            }
            return { offset, transform: transform(value) };
          }),
          t,
        );
      }
      for (const [key, target] of Object.entries(animate)) {
        if (keys.includes(key)) continue;
        const override = t[key];
        const timing = typeof override === 'object' && !Array.isArray(override) ? { ...t, ...override } : t;
        const values = Array.isArray(target) ? target : [initial[key] ?? 0, target];
        const positions = offsets(values.length, timing.times);
        if (key === 'pathLength') {
          node.setAttribute('pathLength', '1');
          node.style.strokeDasharray = '1 1';
          run(
            values.map((value, i) => ({ offset: positions[i], strokeDashoffset: String(1 - value) })),
            timing,
          );
        } else {
          run(
            values.map((value, i) => ({ offset: positions[i], [key]: value })),
            timing,
          );
        }
      }
      return () => animations.forEach((animation) => animation.cancel());
    }, []);
    const transforms = ['x', 'y', 'rotate', 'scale'].some((key) => key in initial);
    return createElement(
      tag,
      {
        ...attributes,
        ref,
        style: {
          ...style,
          ...(transforms
            ? { transform: transform(initial), transformOrigin: style?.transformOrigin ?? '0px 0px' }
            : {}),
          ...(initial.opacity !== undefined ? { opacity: initial.opacity } : {}),
          ...(initial.pathLength !== undefined
            ? { strokeDasharray: '1 1', strokeDashoffset: 1 - initial.pathLength }
            : {}),
        },
        ...(initial.pathLength !== undefined ? { pathLength: 1 } : {}),
      },
      children,
    );
  };
}
export const svgMotion = { g: component('g'), path: component('path'), circle: component('circle') };
