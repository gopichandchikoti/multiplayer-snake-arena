import { snakeStyle, type PatternId } from '../game/palette';

function Marks({ pattern, mark }: { pattern: PatternId; mark: string }) {
  switch (pattern) {
    case 'stripes':
      return <path d="M6 18 18 6M6 12l6-6M12 18l6-6" stroke={mark} strokeWidth="2.2" />;
    case 'dots':
      return (
        <g fill={mark}>
          <circle cx="8" cy="9" r="2.2" />
          <circle cx="16" cy="9" r="2.2" />
          <circle cx="12" cy="16" r="2.2" />
        </g>
      );
    case 'chevrons':
      return <path d="m8 6 8 6-8 6" fill="none" stroke={mark} strokeWidth="2.4" />;
    case 'checks':
      return (
        <g fill={mark}>
          <rect x="5" y="5" width="7" height="7" />
          <rect x="12" y="12" width="7" height="7" />
        </g>
      );
    case 'rings':
      return <circle cx="12" cy="12" r="5" fill="none" stroke={mark} strokeWidth="2.2" />;
    case 'diamonds':
      return <path d="m12 5 7 7-7 7-7-7z" fill={mark} />;
    case 'hatch':
      return <path d="m6 6 12 12M18 6 6 18" stroke={mark} strokeWidth="2" />;
    case 'solid':
      return null;
  }
}

/** The same colour + pattern a snake wears on the board, so the scoreboard works without colour vision. */
export function SnakeSwatch({ slot, size = 24 }: { slot: number; size?: number }) {
  const style = snakeStyle(slot);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={style.fill} stroke="#1b1612" strokeWidth="1.5" />
      <Marks pattern={style.pattern} mark={style.mark} />
    </svg>
  );
}
