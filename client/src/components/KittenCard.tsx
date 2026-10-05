import {
  Bomb,
  ShieldCheck,
  Swords,
  SkipForward,
  Shuffle,
  ScanEye,
  Gift,
  Ban,
  Sandwich,
  Leaf,
  Sprout,
  Waves,
  Sparkles,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  kittenInfo,
  type KittenCard as Card,
  type KittenKind,
} from '../../../shared/games/exploding-kittens/types';
import { audioEngine } from '@/lib/audio-engine';
const icons = {
  explode: Bomb,
  defuse: ShieldCheck,
  attack: Swords,
  skip: SkipForward,
  shuffle: Shuffle,
  future: ScanEye,
  favor: Gift,
  nope: Ban,
  taco: Sandwich,
  melon: Leaf,
  potato: Sprout,
  beard: Waves,
  rainbow: Sparkles,
};
export function KittenIllustration({ kind }: { kind: KittenKind }) {
  const Icon = icons[kind];
  return (
    <div className={`kitten-illustration kitten-art-${kind}`}>
      <svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
        <path
          d="M28 39 24 12 47 29Q60 24 72 29L95 12 91 39Q106 63 89 83Q59 101 30 83Q14 63 28 39Z"
          fill="#222035"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d={kind === 'explode' || kind === 'attack' ? 'm39 48 12 7m19 0 12-7' : 'm40 53 10 0m20 0 10 0'}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="m53 66 7 4 7-4m-7 4v7m-10 0q10 10 20 0M32 67l-13-3m14 10-14 2m67-9 13-3m-13 10 13 2"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <Icon className="kitten-prop" strokeWidth={2.3} />
      <span className="kitten-art-star">✦</span>
    </div>
  );
}
export function KittenCard({
  card,
  selected = false,
  disabled = false,
  onSelect,
  small = false,
}: {
  card?: Card;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  small?: boolean;
}) {
  const kind = card?.kind,
    info = kind ? kittenInfo[kind] : null,
    Icon = kind ? icons[kind] : Bomb;
  const className = `kitten-playing-card ${kind ? `kitten-face face-${kind}` : 'kitten-back'} ${selected ? 'selected' : ''} ${small ? 'kitten-small' : ''}`;
  const style = { '--kitten-color': info?.color ?? '#e2b7a9' } as CSSProperties;
  const content =
    kind && info ? (
      <>
        <div className="kitten-card-heading">
          <Icon size={15} />
          <b>{info.name}</b>
        </div>
        <KittenIllustration kind={kind} />
        <span className="kitten-card-caption">{info.caption}</span>
        <span className="kitten-card-kind">{kind.toUpperCase()}</span>
      </>
    ) : (
      <>
        <span className="kitten-back-symbol">✹</span>
        <span className="kitten-back-text">
          MEOW
          <br />
          OR BOOM
        </span>
      </>
    );
  return onSelect ? (
    <button
      type="button"
      className={className}
      style={style}
      data-card-id={card?.id}
      aria-label={info?.name}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') audioEngine.effect('hover');
      }}
    >
      {content}
    </button>
  ) : (
    <div className={className} style={style} aria-label={info?.name ?? '未公开的牌'}>
      {content}
    </div>
  );
}
