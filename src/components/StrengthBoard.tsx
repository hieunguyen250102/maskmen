'use client';

import { WRESTLERS, type WrestlerType } from '@/engine/types.js';
import { MaskIcon } from './Card.js';

/**
 * The strength markers, laid out on the felt.
 *
 * Each row is one line: a chain where every mask really is known to beat the
 * one to its right. Two masks in *different* rows have no known relation --
 * that separation is the whole point, and it is what tells a player where an
 * Option 1 raise is still possible. A mask may sit in several rows.
 */
export function StrengthBoard({ lines, debuted }: { lines: WrestlerType[][]; debuted: boolean[] }) {
  const waiting = WRESTLERS.filter((w) => !debuted[w.id]);

  return (
    <div className="strength" aria-label="Xếp hạng sức mạnh">
      <div className="strength-head">
        <span>Xếp hạng sức mạnh</span>
        <span className="strength-axis">mạnh ▸ yếu</span>
      </div>

      {lines.length === 0 ? (
        <p className="strength-empty">Chưa đô vật nào ra sân.</p>
      ) : (
        <ol className="strength-lines">
          {lines.map((line, i) => (
            <li className="strength-line" key={i}>
              {line.map((wrestler, depth) => (
                <span className="strength-step" key={`${wrestler}-${depth}`}>
                  {depth > 0 && (
                    <span className="strength-arrow" aria-label="mạnh hơn">
                      ›
                    </span>
                  )}
                  <MaskIcon wrestler={wrestler} size={30} />
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}

      {waiting.length > 0 && (
        <div className="strength-waiting">
          <span>Chưa ra sân</span>
          {waiting.map((w) => (
            <MaskIcon key={w.id} wrestler={w.id} size={22} dim title={`${w.name} — chưa ra sân`} />
          ))}
        </div>
      )}
    </div>
  );
}
