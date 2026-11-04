import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Dir } from '@snake/shared';
import { createSwipeTracker, dirForKey, isTypingTarget } from '../game/input';
import type { GameSource, HudState } from '../game/source';
import { describeEvent } from '../util/format';

export function useHud(source: GameSource): HudState {
  const subscribe = useCallback((onChange: () => void) => source.subscribeHud(onChange), [source]);
  return useSyncExternalStore(subscribe, () => source.hud());
}

/** The latest notable event as a sentence, to be placed in an aria-live region. */
export function useAnnouncer(source: GameSource): string {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const nameOf = (slot: number): string => source.roster.find((r) => r.slot === slot)?.name ?? `Player ${slot + 1}`;
    const localSlot = source.roster.find((r) => r.isLocal)?.slot ?? null;
    return source.subscribeEvents((event) => {
      const text = describeEvent(event, nameOf, localSlot);
      if (text) setMessage(text);
    });
  }, [source]);
  return message;
}

interface InputOptions {
  enabled: boolean;
  onTurn: (dir: Dir) => void;
  onPause?: () => void;
  onMute: () => void;
}

export interface SwipeHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

function isIgnored(event: KeyboardEvent): boolean {
  return isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey;
}

function handleKey(event: KeyboardEvent, options: InputOptions): void {
  if (isIgnored(event)) return;
  const dir = dirForKey(event.code);
  if (dir !== null) {
    event.preventDefault();
    if (options.enabled && !event.repeat) options.onTurn(dir);
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyP') options.onPause?.();
  else if (event.code === 'KeyM') options.onMute();
}

/** Keyboard and swipe input in screen terms; the caller translates to arena directions. */
export function useGameInput(options: InputOptions): SwipeHandlers {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const tracker = useRef(createSwipeTracker());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      handleKey(event, latest.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // A press on a control inside the arena (pause overlay, pad) is a click, not the start of a swipe.
    // Capturing the pointer here would also redirect that click away from the button.
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    tracker.current.start(event.clientX, event.clientY);
  }, []);
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dir = tracker.current.move(event.clientX, event.clientY);
    if (dir !== null && latest.current.enabled) latest.current.onTurn(dir);
  }, []);
  const end = useCallback(() => {
    tracker.current.end();
  }, []);
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
