'use client';

import { useLayoutEffect, useRef } from 'react';
import type { Flight } from '@/lib/useTablePresenter.js';
import { Card, CardBack } from './Card.js';

function FlightCard({ flight }: { flight: Flight }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const { from, to, delay, duration } = flight;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    const tilt = (Math.random() - 0.5) * 16;
    const timing: KeyframeAnimationOptions = {
      duration,
      delay,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'both',
    };
    outer.current?.animate(
      [
        { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + sx) / 2 + 0.12}, ${(1 + sy) / 2 + 0.12}) rotate(${tilt}deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(${tilt / 3}deg)` },
      ],
      timing,
    );
    if (flight.flip) {
      inner.current?.animate(
        [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
        timing,
      );
    }
  }, [flight]);

  return (
    <div
      ref={outer}
      className="flight"
      style={{ left: flight.from.x, top: flight.from.y, width: flight.from.w, height: flight.from.h }}
    >
      <div ref={inner} className="flight-inner">
        <Card wrestler={flight.wrestler} size="fill" className="flight-face" />
        {flight.flip && <CardBack size="fill" className="flight-back" />}
      </div>
    </div>
  );
}

/** Cards in the air between a hand and the pile. Purely decorative. */
export function FlyingCards({ flights }: { flights: Flight[] }) {
  if (flights.length === 0) return null;
  return (
    <div className="flights" aria-hidden>
      {flights.map((f) => (
        <FlightCard key={f.id} flight={f} />
      ))}
    </div>
  );
}
