import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Dir } from '@snake/shared';
import { type Layout, computeLayout, screenDirToWorld, shouldShowDpad } from '../game/layout';
import type { GameSource, HudState } from '../game/source';
import { isCoarsePointer, settingsStore, useSettings } from '../state/app';
import { sfx } from '../state/audio';
import { ArenaCanvas } from './ArenaCanvas';
import { Hud } from './Hud';
import { useAnnouncer, useGameInput, useHud } from './hooks';
import { CountdownOverlay, PauseOverlay, SteeringPad } from './overlays';

interface Props {
  source: GameSource;
  onLeave: () => void;
  onFinished: () => void;
}

const toggleSound = (): void => {
  settingsStore.update((s) => ({ ...s, sound: !s.sound }));
};

/** Keyboard, swipe and pad steering for one match, translated from screen directions to arena directions. */
function useSteering(source: GameSource, hud: HudState, layout: RefObject<Layout>) {
  const turn = useCallback(
    (dir: Dir) => {
      sfx.unlock();
      source.turn(screenDirToWorld(layout.current, dir));
    },
    [source, layout],
  );
  const togglePause = useCallback(() => {
    if (source.setPaused && hud.phase === 'playing') source.setPaused(!hud.paused);
  }, [source, hud.paused, hud.phase]);
  const swipe = useGameInput({
    enabled: hud.phase !== 'ended' && !hud.paused,
    onTurn: turn,
    onPause: source.setPaused ? togglePause : undefined,
    onMute: toggleSound,
  });
  return { turn, togglePause, swipe };
}

export function GameScreen({ source, onLeave, onFinished }: Props) {
  const hud = useHud(source);
  const settings = useSettings();
  const announcement = useAnnouncer(source);
  const layout = useRef<Layout>(computeLayout(960, 672));
  const { turn, togglePause, swipe } = useSteering(source, hud, layout);

  useEffect(() => {
    if (hud.phase === 'ended') onFinished();
  }, [hud.phase, onFinished]);

  const showPad = shouldShowDpad(settings.dpad, isCoarsePointer());
  return (
    <main className={`game${showPad ? ' game--pad' : ''}`}>
      <Hud
        hud={hud}
        offline={source.offline}
        watching={!source.roster.some((r) => r.isLocal)}
        onPause={source.setPaused ? togglePause : undefined}
        onLeave={onLeave}
      />
      <div className="arena" {...swipe} aria-label="Arena. Steer with the arrow keys, W A S D, or by swiping.">
        <ArenaCanvas
          source={source}
          onLayout={(next) => {
            layout.current = next;
          }}
        />
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
        {hud.phase === 'countdown' ? <CountdownOverlay count={hud.countdown} /> : null}
        {hud.paused && hud.phase === 'playing' ? <PauseOverlay onResume={togglePause} onQuit={onLeave} /> : null}
      </div>
      {showPad ? <SteeringPad side={settings.dpadSide} onTurn={turn} /> : null}
    </main>
  );
}
