import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '../src/state/app';
import { defaultSettings } from '../src/state/settings';
import { FakeGame, result } from './fakeGame';

vi.mock('../src/ui/ArenaCanvas', () => ({ ArenaCanvas: () => <div data-testid="arena-canvas" /> }));

vi.mock('../src/game/practice', async () => {
  const { FakeGame: Fake } = await import('./fakeGame');
  return { PracticeGame: Fake };
});

beforeEach(() => {
  settingsStore.set(defaultSettings());
  FakeGame.last = null;
});

describe('App flow', () => {
  async function openGame() {
    const { App } = await import('../src/App');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Practice against bots' }));
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    return user;
  }

  it('walks menu, practice setup, game, summary and back', async () => {
    const user = await openGame();
    expect(screen.getByTestId('arena-canvas')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    const first = FakeGame.last;
    act(() => {
      first?.push({ ...first.hud(), phase: 'ended', result });
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pip wins');
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(first?.disposed).toBe(true);
    expect(FakeGame.last).not.toBe(first);
    expect(screen.getByTestId('arena-canvas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(FakeGame.last?.disposed).toBe(true);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Eight snakes');
  });

  it('forwards keyboard steering, pausing and muting to the game', async () => {
    const user = await openGame();
    const game = FakeGame.last;
    await user.keyboard('{ArrowUp}d');
    expect(game?.turns).toEqual([0, 1]);
    await user.keyboard('p');
    expect(game?.paused).toEqual([true]);
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Resume' })[1] ?? document.body);
    expect(game?.paused).toEqual([true, false]);
    expect(settingsStore.get().sound).toBe(true);
    await user.keyboard('m');
    expect(settingsStore.get().sound).toBe(false);
  });

  it('does not steer while paused or while typing in a field', async () => {
    const user = await openGame();
    const game = FakeGame.last;
    await user.keyboard('p');
    await user.keyboard('{ArrowLeft}');
    expect(game?.turns).toEqual([]);
    await user.keyboard('p');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    await user.keyboard('w');
    expect(game?.turns).toEqual([]);
    field.remove();
  });

  it('announces what happens to the player for screen readers', async () => {
    await openGame();
    act(() => {
      FakeGame.last?.emit({ type: 'eat', slot: 0, kind: 'apple', x: 3, y: 3, points: 10 });
    });
    expect(screen.getByRole('status', { name: '' })).toBeDefined();
    expect(screen.getAllByRole('status').some((el) => /You ate food, plus 10/.test(el.textContent))).toBe(true);
  });

  it('swipes on the arena steer, but a press on an overlay button never starts one', async () => {
    await openGame();
    const arena = screen.getByLabelText(/Arena. Steer/);
    // jsdom has no PointerEvent, so send mouse events carrying the pointer event names.
    const pointer = (type: string, el: Element, x: number, y: number) =>
      fireEvent(el, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    pointer('pointerdown', arena, 100, 100);
    pointer('pointermove', arena, 160, 100);
    pointer('pointerup', arena, 160, 100);
    expect(FakeGame.last?.turns).toEqual([1]);
    act(() => {
      FakeGame.last?.setPaused(true);
    });
    const resume = within(arena).getByRole('button', { name: 'Resume' });
    pointer('pointerdown', resume, 100, 100);
    pointer('pointermove', arena, 100, 200);
    expect(FakeGame.last?.turns).toEqual([1]);
  });

  it('shows the steering pad when asked and turns on press', async () => {
    settingsStore.update((s) => ({ ...s, dpad: 'on' }));
    const user = await openGame();
    const pad = screen.getByRole('group', { name: 'Steering pad' });
    await user.pointer({ keys: '[MouseLeft>]', target: within(pad).getByRole('button', { name: 'Turn down' }) });
    expect(FakeGame.last?.turns).toEqual([2]);
  });

  it('applies colour scheme and motion settings to the page, and opens the dialogs from the menu', async () => {
    const { App } = await import('../src/App');
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.click(screen.getByRole('radio', { name: 'Reduced' }));
    expect(document.documentElement.dataset.scheme).toBe('light');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
  });

  it('can step back from practice setup', async () => {
    const { App } = await import('../src/App');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Practice against bots' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Eight snakes');
  });
});
