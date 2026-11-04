import { useEffect, useRef } from 'react';
import type { Layout } from '../game/layout';
import type { GameSource } from '../game/source';
import { createArenaGame } from '../render/createGame';
import { reducedMotionNow, settingsStore } from '../state/app';
import { sfx } from '../state/audio';

interface Props {
  source: GameSource;
  onLayout: (layout: Layout) => void;
}

/** Hosts the Phaser canvas. It follows the size of its box and is torn down with the match. */
export function ArenaCanvas({ source, onLayout }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const layoutCallback = useRef(onLayout);
  useEffect(() => {
    layoutCallback.current = onLayout;
  });

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const handle = createArenaGame(element, {
      source,
      getSettings: settingsStore.get,
      reducedMotion: reducedMotionNow,
      sfx,
      onLayout: (layout) => {
        layoutCallback.current(layout);
      },
    });
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) handle.resize(box.width, box.height);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      handle.destroy();
    };
  }, [source]);

  return <div ref={host} className="arena__canvas" style={{ position: 'absolute', inset: 0 }} />;
}
