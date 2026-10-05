import {
  useEffect,
  useRef,
  type PointerEvent,
  type MouseEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** Paint a contiguous range using the exposed card strips, without changing stacking. */
export function useHandSweep(
  ids: string[],
  selection: string[],
  setSelection: Dispatch<SetStateAction<string[]>>,
  disabled: boolean,
) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; anchor: number; initial: string[]; add: boolean } | null>(null);
  const swallowClick = useRef(false);
  useEffect(() => {
    gesture.current = null;
  }, [ids.join('|'), disabled]);
  const paint = (index: number) => {
    const g = gesture.current;
    if (!g) return;
    const next = new Set(g.initial);
    for (let i = Math.min(index, g.anchor); i <= Math.max(index, g.anchor); i++) {
      if (g.add) next.add(ids[i]);
      else next.delete(ids[i]);
    }
    setSelection([...next]);
  };
  return {
    ref: root,
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (e.pointerType !== 'mouse') {
        swallowClick.current = false;
        return;
      }
      if (disabled || e.button !== 0) return;
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-card-id]');
      const index = ids.indexOf(card?.dataset.cardId ?? '');
      if (index < 0 || card?.disabled) return;
      gesture.current = {
        pointerId: e.pointerId,
        anchor: index,
        initial: [...selection],
        add: !selection.includes(ids[index]),
      };
      swallowClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      paint(index);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (!gesture.current || gesture.current.pointerId !== e.pointerId) return;
      const slots = [...e.currentTarget.querySelectorAll<HTMLElement>('.ddz-hand-slot')];
      let index = 0;
      for (let i = 0; i < slots.length; i++)
        if (e.clientX >= slots[i].getBoundingClientRect().left) index = i;
      index = Math.max(0, Math.min(ids.length - 1, index));
      paint(index);
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (gesture.current?.pointerId !== e.pointerId) return;
      gesture.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel() {
      if (gesture.current) setSelection(gesture.current.initial);
      gesture.current = null;
      swallowClick.current = false;
    },
    onLostPointerCapture() {
      gesture.current = null;
    },
    onClickCapture(e: MouseEvent<HTMLDivElement>) {
      if (swallowClick.current && e.detail !== 0) {
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
