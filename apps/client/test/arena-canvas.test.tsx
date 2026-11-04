import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneDeps } from '../src/render/ArenaScene';
import { ArenaCanvas } from '../src/ui/ArenaCanvas';
import { SnakeSwatch } from '../src/ui/SnakeSwatch';
import { SNAKE_STYLES } from '../src/game/palette';
import { FakeGame } from './fakeGame';

const resizeSpy = vi.fn();
const destroySpy = vi.fn();
const handle = { resize: resizeSpy, destroy: destroySpy };
const created: Array<{ parent: HTMLElement; deps: SceneDeps }> = [];

vi.mock('../src/render/createGame', () => ({
  createArenaGame: (parent: HTMLElement, deps: SceneDeps) => {
    created.push({ parent, deps });
    return handle;
  },
}));

let resizeCallback: ResizeObserverCallback | null = null;

const entry = (width: number, height: number): ResizeObserverEntry => ({
  target: document.body,
  contentRect: { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) },
  borderBoxSize: [],
  contentBoxSize: [],
  devicePixelContentBoxSize: [],
});
const observeSpy = vi.fn();
const disconnectSpy = vi.fn();
const unobserveSpy = vi.fn();
const observer: ResizeObserver = { observe: observeSpy, disconnect: disconnectSpy, unobserve: unobserveSpy };

beforeEach(() => {
  created.length = 0;
  resizeSpy.mockClear();
  destroySpy.mockClear();
  observeSpy.mockClear();
  disconnectSpy.mockClear();
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }
    observe = observeSpy;
    disconnect = disconnectSpy;
    unobserve = unobserveSpy;
  };
});

describe('ArenaCanvas', () => {
  it('starts the arena in its own box, wired to the match, and tears it down with it', () => {
    const source = new FakeGame();
    const onLayout = vi.fn();
    const { unmount } = render(<ArenaCanvas source={source} onLayout={onLayout} />);
    const [first] = created;
    expect(first?.parent).toBeInstanceOf(HTMLDivElement);
    expect(first?.deps.source).toBe(source);
    expect(observeSpy).toHaveBeenCalledWith(first?.parent);
    first?.deps.onLayout({ cell: 10, originX: 0, originY: 0, rotated: false, cols: 40, rows: 28 });
    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({ cell: 10 }));
    expect(first?.deps.getSettings().theme).toBe('parchment');
    expect(typeof first?.deps.reducedMotion()).toBe('boolean');
    unmount();
    expect(destroySpy).toHaveBeenCalledOnce();
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('passes size changes on to the game and ignores empty notifications', () => {
    render(<ArenaCanvas source={new FakeGame()} onLayout={vi.fn()} />);
    resizeCallback?.([entry(640, 360)], observer);
    expect(resizeSpy).toHaveBeenCalledWith(640, 360);
    resizeSpy.mockClear();
    resizeCallback?.([], observer);
    expect(resizeSpy).not.toHaveBeenCalled();
  });
});

describe('SnakeSwatch', () => {
  it('draws a different marking for every seat, hidden from assistive tech', () => {
    const shapes = new Set<string>();
    for (const style of SNAKE_STYLES) {
      const { container, unmount } = render(<SnakeSwatch slot={style.slot} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelector('rect')).toHaveAttribute('fill', style.fill);
      shapes.add(svg?.innerHTML.replace(style.fill, '').replace(style.mark, '') ?? '');
      unmount();
    }
    expect(shapes.size).toBe(8);
  });
});
