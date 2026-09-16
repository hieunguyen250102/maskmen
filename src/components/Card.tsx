'use client';

import type { CSSProperties } from 'react';
import { WRESTLERS, type WrestlerType } from '@/engine/types.js';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'fill';

/**
 * A face-up wrestler card: the mask art on the wrestler's colour, with the name
 * and glyph in two corners. The glyph is not decoration -- the six masks are
 * the game state, so colour alone must never be the only way to tell them apart.
 */
export function Card({
  wrestler,
  size = 'md',
  className = '',
  style,
}: {
  wrestler: WrestlerType;
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}) {
  const w = WRESTLERS[wrestler];
  if (!w) return null;
  return (
    <div
      className={`card card--${size} ${className}`}
      style={{ ['--mask-color' as string]: w.color, ...style }}
      role="img"
      aria-label={`Lá ${w.name}`}
    >
      <span className="card-corner card-corner--top" aria-hidden>
        <span className="card-glyph">{w.glyph}</span>
        <span className="card-name">{w.name}</span>
      </span>
      <img className="card-art" src={`/masks/${w.image}.webp`} alt="" draggable={false} />
      <span className="card-corner card-corner--bottom" aria-hidden>
        <span className="card-glyph">{w.glyph}</span>
        <span className="card-name">{w.name}</span>
      </span>
    </div>
  );
}

/** The back of a card: what everyone else's hand looks like. */
export function CardBack({
  size = 'md',
  className = '',
  style,
}: {
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`card card-back card--${size} ${className}`} style={style} aria-hidden>
      <span className="card-back-mark">M</span>
    </div>
  );
}

/** A small round mask, for the strength rows, the log and the buttons. */
export function MaskIcon({
  wrestler,
  size = 32,
  dim = false,
  title,
}: {
  wrestler: WrestlerType;
  size?: number;
  dim?: boolean;
  title?: string;
}) {
  const w = WRESTLERS[wrestler];
  if (!w) return null;
  return (
    <span
      className={`mask-icon${dim ? ' mask-icon--dim' : ''}`}
      style={{ ['--mask-color' as string]: w.color, width: size, height: size }}
      title={title ?? w.name}
    >
      <img src={`/masks/${w.image}.webp`} alt={w.name} draggable={false} />
      <span className="mask-icon-glyph" aria-hidden>
        {w.glyph}
      </span>
    </span>
  );
}

const BELTS: Record<number, string> = { 2: 'plus2', 1: 'plus1', [-1]: 'minus1' };

/** The championship belt for a season result, or a plain zero. */
export function Belt({ delta, height = 36 }: { delta: number; height?: number }) {
  const image = BELTS[delta];
  if (!image) {
    return (
      <span className="belt-zero" style={{ height, minWidth: height * 1.6 }}>
        0
      </span>
    );
  }
  return (
    <img
      className="belt"
      src={`/belts/${image}.webp`}
      alt={delta > 0 ? `+${delta}` : `${delta}`}
      style={{ height }}
      draggable={false}
    />
  );
}
