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
import type { CSSProperties, ReactNode } from 'react';
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
function CatFace({
  x = 60,
  y = 40,
  scale = 1,
  color = '#f8e8cf',
  angry = false,
}: {
  x?: number;
  y?: number;
  scale?: number;
  color?: string;
  angry?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M-27 0-29-25-12-14Q0-19 12-14L29-25 27 0Q33 29 0 31Q-33 29-27 0Z"
        fill={color}
        stroke="#252238"
        strokeWidth="3"
      />
      <path d="m-22-16 6 4m38-4-6 4" stroke="#ea999c" strokeWidth="4" />
      <path
        d={angry ? 'm-17 2 10 5m14 0 10-5' : 'm-16 6 5-3 5 3m12 0 5-3 5 3'}
        stroke="#2b2438"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="m-4 12 4 4 4-4m-4 4v5m-6 0q6 5 12 0m-29-7-12-3m13 9-12 1m46-7 12-3m-13 9 12 1"
        stroke="#453049"
        strokeWidth="2"
        fill="none"
      />
    </g>
  );
}
/** Each illustration has its own silhouette and palette, beyond a shared icon. */
const drawings: Record<KittenKind, ReactNode> = {
  taco: (
    <>
      <CatFace y={35} scale={0.85} />
      <path
        d="M12 51Q60 30 108 51Q98 98 60 96Q22 97 12 51Z"
        fill="#edb25c"
        stroke="#9c6032"
        strokeWidth="3"
      />
      <path
        d="M16 54Q28 38 39 52Q52 35 66 52Q78 36 92 54l12-4"
        stroke="#80b86d"
        strokeWidth="9"
        fill="none"
      />
      <path d="m34 58 9 5m20-7 8 6m13-2 6 4" stroke="#ea6e60" strokeWidth="6" />
      {[30, 47, 65, 84].map((x, i) => (
        <circle key={x} cx={x} cy={74 + (i % 2) * 8} r="2" fill="#b77d3e" />
      ))}
    </>
  ),
  melon: (
    <>
      <path
        d="M11 37Q60 95 109 37Q107 100 60 103Q12 101 11 37Z"
        fill="#5dba79"
        stroke="#254c3e"
        strokeWidth="3"
      />
      <path d="M20 45Q60 75 100 45Q95 91 60 93Q26 91 20 45Z" fill="#ef8c98" />
      <CatFace y={30} scale={0.7} color="#daf3c7" />
      {[33, 48, 69, 86].map((x, i) => (
        <ellipse key={x} cx={x} cy={70 + (i % 2) * 9} rx="2" ry="4" fill="#483447" />
      ))}
    </>
  ),
  potato: (
    <>
      <path
        d="M37 17Q79-2 92 33Q111 68 84 92Q54 108 28 87Q8 53 37 17Z"
        fill="#d6af7e"
        stroke="#816345"
        strokeWidth="3"
      />
      <path d="m33 21 1-14 13 9m31 1 12-10-2 19" fill="#d6af7e" stroke="#816345" strokeWidth="3" />
      <path
        d="m37 47 10 0m22 0 10 0m-26 16 7 5 7-5m-14 13q7 6 14 0"
        stroke="#4f3540"
        strokeWidth="3"
        fill="none"
      />
      {[26, 83, 34, 89, 57].map((x, i) => (
        <circle key={i} cx={x} cy={34 + i * 12} r="2.5" fill="#b38659" />
      ))}
    </>
  ),
  beard: (
    <>
      <path d="M25 84Q60 60 95 84v20H25Z" fill="#48778f" />
      <CatFace y={40} color="#c9e5eb" />
      <path d="M19 25h82M34 25V3h52v22" fill="#394254" stroke="#172637" strokeWidth="5" />
      <path
        d="M33 62Q41 43 60 60Q80 42 87 62Q99 78 76 74L60 65 44 74Q22 79 33 62Z"
        fill="#f1eee4"
        stroke="#778b9f"
        strokeWidth="2"
      />
      <path d="m60 82-12 8 12 5 12-5Z" fill="#e2ad6f" />
    </>
  ),
  rainbow: (
    <>
      {['#f494a7', '#ffc780', '#aadba5', '#8fcced', '#b7a4ed'].map((c, i) => (
        <path
          key={c}
          d={`M${14 + i * 7} 96a${46 - i * 7} ${46 - i * 7} 0 0 1 ${92 - i * 14} 0`}
          stroke={c}
          strokeWidth="8"
          fill="none"
        />
      ))}
      <CatFace y={20} scale={0.75} color="#eee1ff" />
      <path
        d="M0 92q5-17 18-8q15-18 25 7M80 92q5-17 18-8q15-18 24 7"
        stroke="#d5e6f7"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path d="m101 10 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#ffdda8" />
    </>
  ),
  explode: (
    <>
      <path
        d="m60 1 10 25 25-14-7 28 30 6-25 17 17 22-29-2-7 24-17-23-25 16 3-29-27-5 24-17L13 27l28 8Z"
        fill="#ef9d54"
      />
      <circle cx="63" cy="60" r="33" fill="#34293c" stroke="#f37865" strokeWidth="3" />
      <path d="m70 29 4-13q12 14 18 3" stroke="#f6d28b" strokeWidth="4" />
      <CatFace x={61} y={48} scale={0.6} angry color="#ef8a7a" />
    </>
  ),
  defuse: (
    <>
      <path
        d="M60 7 102 25v35Q94 89 60 102Q26 89 18 60V25Z"
        fill="#326a5d"
        stroke="#9ee6bd"
        strokeWidth="4"
      />
      <path d="m29 74 19-40m43 40L72 34M49 36l10 10 12-11" stroke="#e7efcb" strokeWidth="7" fill="none" />
      <path d="M23 89q25-30 44-17t34-18" stroke="#e88695" strokeWidth="4" fill="none" />
      <circle cx="60" cy="25" r="8" fill="#a2e5be" />
    </>
  ),
  attack: (
    <>
      <path d="m62 4-28 48h22l-9 52 42-60H65Z" fill="#f4d57e" stroke="#bc7c44" strokeWidth="2" />
      <CatFace x={32} y={40} scale={0.53} angry color="#e68b77" />
      <CatFace x={94} y={66} scale={0.5} angry color="#dfa874" />
      <path d="m16 80 16-13m-9 20 15-12m43-47 16-13m-9 20 15-12" stroke="#efb48b" strokeWidth="4" />
    </>
  ),
  skip: (
    <>
      <path d="m4 23 26 0m-27 21h32M4 68h19" stroke="#acd2f9" strokeWidth="4" strokeLinecap="round" />
      <CatFace x={65} y={35} scale={0.7} color="#d9eaff" />
      <path d="m54 65-20 27m42-27 16 26m-2-54 18-12" stroke="#acd2f9" strokeWidth="9" strokeLinecap="round" />
      <path d="m94 82 19 9-19 8Z" fill="#ffcc87" />
    </>
  ),
  shuffle: (
    <>
      {[-20, 0, 20].map((r, i) => (
        <g key={r} transform={`rotate(${r} 60 55)`}>
          <rect
            x="32"
            y={12 + i * 3}
            width="55"
            height="77"
            rx="9"
            fill={['#607b97', '#8a70a3', '#b3819f'][i]}
            stroke="#ead8f3"
            strokeWidth="2"
          />
          <path d="m45 31 9 10 9-10 10 10" stroke="#e9d5ec" strokeWidth="3" fill="none" />
        </g>
      ))}
      <path
        d="M10 64q-2-44 25-51m-5 0 5-1-1 9M110 46q5 44-25 51m4 0-6 1 1-9"
        stroke="#cdb5f3"
        strokeWidth="5"
        fill="none"
      />
    </>
  ),
  future: (
    <>
      <circle cx="60" cy="44" r="35" fill="#6f5293" stroke="#d7bdfa" strokeWidth="3" />
      <path d="M24 93h72L80 77H40Z" fill="#bb91ba" stroke="#674b75" strokeWidth="3" />
      <path d="M34 44q26-26 52 0q-26 26-52 0Z" fill="#ede0fa" />
      <ellipse cx="60" cy="44" rx="9" ry="13" fill="#633767" />
      <path d="m19 9 3 9 9 3-9 3-3 9-3-9-9-3 9-3m79 52 2 7 7 2-7 2-2 7" fill="#ecd69c" />
      <path d="M36 35q-5-12 10-19" stroke="#ead9ff" strokeWidth="3" fill="none" />
    </>
  ),
  favor: (
    <>
      <rect x="23" y="47" width="74" height="48" rx="5" fill="#e4ab68" stroke="#956749" strokeWidth="3" />
      <path d="M18 46h84v14H18Z" fill="#f6cb89" />
      <path d="M54 46h12v50H54Z" fill="#c57794" />
      <CatFace y={18} scale={0.65} color="#fff0d2" />
      <path
        d="M60 50q-32-31-24-12q10 7 24 12q32-31 24-12q-10 7-24 12"
        stroke="#e2a0bd"
        strokeWidth="5"
        fill="none"
      />
    </>
  ),
  nope: (
    <>
      <circle cx="60" cy="54" r="43" fill="#7e344b" stroke="#f09aae" strokeWidth="7" />
      <path
        d="M40 72V39q0-10 9-7V24q0-10 9-3v-3q0-10 9-1v9q10-7 10 5v26l7-13q8-7 11 1L82 77Q58 101 40 72Z"
        fill="#f4c5b7"
        stroke="#512b43"
        strokeWidth="2"
      />
      <path d="m29 84 62-62" stroke="#f69bab" strokeWidth="7" />
    </>
  ),
};
export function KittenIllustration({ kind }: { kind: KittenKind }) {
  return (
    <div className={`kitten-illustration kitten-art-${kind}`} data-art-kind={kind}>
      <svg viewBox="0 0 120 110" fill="none" aria-hidden="true">
        {drawings[kind]}
      </svg>
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
      data-card-kind={kind}
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
