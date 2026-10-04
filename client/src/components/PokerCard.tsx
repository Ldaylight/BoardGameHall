import type { PokerCard as Card } from '../../../shared/games/doudizhu/types';
import { rankName } from '../../../shared/games/doudizhu/types';
import { audioEngine } from '@/lib/audio-engine';
const symbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦', joker: '★' };
export function PokerCard({
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
  const red = card && (card.suit === 'hearts' || card.suit === 'diamonds' || card.rank === 17);
  const face = card ? (
    <>
      <span className="ddz-poker-corner">
        {rankName(card.rank)}
        <i>{symbols[card.suit]}</i>
      </span>
      <span className="ddz-poker-suit">{symbols[card.suit]}</span>
      <span className="ddz-poker-corner ddz-poker-bottom">
        {rankName(card.rank)}
        <i>{symbols[card.suit]}</i>
      </span>
    </>
  ) : (
    <span className="ddz-poker-back-mark">
      P<span>PLAYROOM</span>
    </span>
  );
  const className = `ddz-poker-card ${card ? 'ddz-poker-face' : 'ddz-poker-back'} ${red ? 'ddz-poker-red' : ''} ${selected ? 'selected' : ''} ${small ? 'ddz-poker-small' : ''}`;
  return onSelect ? (
    <button
      type="button"
      className={className}
      data-card-id={card?.id}
      aria-label={`${rankName(card!.rank)}${symbols[card!.suit]}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onMouseEnter={() => audioEngine.effect('hover')}
    >
      {face}
    </button>
  ) : (
    <div
      className={className}
      aria-label={card ? `${rankName(card.rank)}${symbols[card.suit]}` : '未公开的牌'}
    >
      {face}
    </div>
  );
}
