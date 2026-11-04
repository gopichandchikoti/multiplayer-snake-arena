import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '../src/state/app';
import { defaultSettings } from '../src/state/settings';
import type { HudState } from '../src/game/source';
import { Hud } from '../src/ui/Hud';
import { HelpDialog } from '../src/ui/HelpDialog';
import { MenuScreen } from '../src/ui/MenuScreen';
import { PracticeSetup } from '../src/ui/PracticeSetup';
import { SettingsDialog } from '../src/ui/SettingsDialog';
import { SummaryScreen } from '../src/ui/SummaryScreen';
import { Modal, Segmented, Stepper, Switch } from '../src/ui/primitives';
import { result, roster } from './fakeGame';

vi.mock('../src/ui/ArenaCanvas', () => ({ ArenaCanvas: () => <div data-testid="arena-canvas" /> }));

beforeEach(() => {
  settingsStore.set(defaultSettings());
});

describe('primitives', () => {
  it('Segmented is a labelled radio group that changes with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented
        legend="Difficulty"
        name="d"
        value="normal"
        options={[
          { value: 'easy', label: 'Easy' },
          { value: 'normal', label: 'Normal' },
          { value: 'hard', label: 'Hard' },
        ]}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Difficulty' });
    expect(within(group).getByRole('radio', { name: 'Normal' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('hard');
  });

  it('Stepper respects its bounds', async () => {
    const user = userEvent.setup();
    function Host() {
      const [n, setN] = useState(2);
      return <Stepper label="Bots" value={n} min={1} max={3} onChange={setN} />;
    }
    render(<Host />);
    const up = screen.getByRole('button', { name: 'Increase bots' });
    const down = screen.getByRole('button', { name: 'Decrease bots' });
    await user.click(up);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(up).toBeDisabled();
    await user.click(down);
    await user.click(down);
    expect(screen.getByRole('status')).toHaveTextContent('1');
    expect(down).toBeDisabled();
  });

  it('Switch toggles and shows its hint', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch label="Sound" hint="(on)" checked={false} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox', { name: /Sound/ }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByText(/\(on\)/)).toBeInTheDocument();
  });

  it('Modal moves focus in, traps Tab, closes on Escape and gives focus back', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open
          </button>
          {open ? (
            <Modal
              title="Demo"
              onClose={() => {
                setOpen(false);
                onClose();
              }}
            >
              <button type="button">Inner</button>
            </Modal>
          ) : null}
        </>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Demo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const inner = within(dialog).getByRole('button', { name: 'Inner' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(inner).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(inner).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});

describe('menu, setup, settings, help', () => {
  it('MenuScreen offers the three actions and saves the typed name', async () => {
    const user = userEvent.setup();
    const handlers = {
      onOnline: vi.fn(),
      onPractice: vi.fn(),
      onHelp: vi.fn(),
      onSettings: vi.fn(),
      onJoinInvite: vi.fn(),
    };
    render(<MenuScreen invite={null} {...handlers} />);
    await user.type(screen.getByLabelText('Your name'), 'Ada');
    expect(settingsStore.get().nickname).toBe('Ada');
    await user.click(screen.getByRole('button', { name: 'Practice against bots' }));
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(handlers.onPractice).toHaveBeenCalledOnce();
    expect(handlers.onHelp).toHaveBeenCalledOnce();
    expect(handlers.onSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Eight snakes');
  });

  it('PracticeSetup starts with the chosen options', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<PracticeSetup playerName="Ada" initialTheme="kiln" onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Increase bots' }));
    await user.click(screen.getByRole('radio', { name: 'Hard' }));
    await user.click(screen.getByRole('radio', { name: /Tidepool/ }));
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(onStart).toHaveBeenCalledWith({ bots: 4, level: 'hard', theme: 'tidepool', playerName: 'Ada' });
  });

  it('PracticeSetup can go back', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<PracticeSetup playerName="Ada" initialTheme="kiln" onStart={vi.fn()} onBack={onBack} />);
    expect(screen.getByRole('radio', { name: /Kiln/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('SettingsDialog edits every saved setting', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Your name'), 'Zed');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'Reduced' }));
    await user.click(screen.getByRole('checkbox', { name: /Pattern markings/ }));
    await user.click(screen.getByRole('checkbox', { name: /Sound effects/ }));
    await user.click(screen.getByRole('radio', { name: 'On' }));
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('radio', { name: /Kiln/ }));
    expect(settingsStore.get()).toMatchObject({
      nickname: 'Zed',
      colorScheme: 'dark',
      motion: 'reduced',
      patterns: false,
      sound: false,
      dpad: 'on',
      dpadSide: 'left',
      theme: 'kiln',
    });
    expect(screen.getByLabelText('Volume')).toBeDisabled();
  });

  it('SettingsDialog changes volume and only resets after confirmation', async () => {
    const user = userEvent.setup();
    render(<SettingsDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '0.25' } });
    expect(settingsStore.get().volume).toBe(0.25);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const before = settingsStore.get().guestId;
    await user.click(screen.getByRole('button', { name: 'Reset saved data' }));
    expect(settingsStore.get().guestId).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Reset saved data' }));
    expect(settingsStore.get().guestId).not.toBe(before);
    expect(settingsStore.get().volume).toBe(0.6);
    confirm.mockRestore();
  });

  it('HelpDialog states the scoring and the three power-ups', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    expect(screen.getByText(/Apple: 10 points/)).toBeInTheDocument();
    expect(screen.getByText(/Last snake standing: 60 point bonus/)).toBeInTheDocument();
    for (const name of ['Surge', 'Aegis', 'Trim']) expect(screen.getByText(name)).toBeInTheDocument();
  });
});

describe('Hud and summary', () => {
  const hud: HudState = {
    phase: 'playing',
    countdown: 0,
    remainingMs: 75_000,
    paused: false,
    result: null,
    lag: null,
    snakes: [
      { slot: 1, name: 'Pip', score: 50, kills: 0, length: 5, alive: true, surge: true, aegis: false, isLocal: false },
      { slot: 0, name: 'Ada', score: 10, kills: 0, length: 4, alive: true, surge: false, aegis: true, isLocal: true },
      {
        slot: 2,
        name: 'Wick',
        score: 70,
        kills: 0,
        length: 4,
        alive: false,
        surge: false,
        aegis: false,
        isLocal: false,
      },
    ],
  };

  it('shows the clock, keeps your own chip first and marks eliminated snakes in words', () => {
    render(<Hud hud={hud} offline onPause={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:15');
    const chips = within(screen.getByRole('list', { name: 'Scoreboard' })).getAllByRole('listitem');
    expect(chips[0]).toHaveTextContent('Ada (you)');
    expect(chips[0]).toHaveTextContent('aegis');
    expect(chips[1]).toHaveTextContent('Wick');
    expect(chips[1]).toHaveTextContent('out');
    expect(chips[2]).toHaveTextContent('surge');
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  it('offers Pause only when the source can pause, and Leave always', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onLeave = vi.fn();
    const { rerender } = render(<Hud hud={hud} offline={false} onLeave={onLeave} />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByText(/Offline/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalled();
    rerender(<Hud hud={{ ...hud, paused: true }} offline onPause={onPause} onLeave={onLeave} />);
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onPause).toHaveBeenCalled();
  });

  it('SummaryScreen names the winner, explains the result and lists standings', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onMenu = vi.fn();
    render(
      <SummaryScreen
        result={result}
        roster={roster}
        offline
        primaryLabel="Play again"
        onPrimary={onPrimary}
        onMenu={onMenu}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pip wins');
    expect(screen.getByText(/Last snake standing/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Final standings' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('1st');
    expect(rows[0]).toHaveTextContent('1 crash caused');
    expect(rows[1]).toHaveTextContent('Ada');
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    await user.click(screen.getByRole('button', { name: 'Main menu' }));
    expect(onPrimary).toHaveBeenCalled();
    expect(onMenu).toHaveBeenCalled();
  });

  it.each([
    [[0], 'You win!'],
    [[0, 1], 'It is a draw'],
    [[], 'No winner'],
  ])('SummaryScreen headline for winners %j is %s', (winnerSlots, text) => {
    render(
      <SummaryScreen
        result={{ ...result, winnerSlots }}
        roster={roster}
        offline={false}
        primaryLabel="Again"
        onPrimary={vi.fn()}
        onMenu={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
    expect(screen.queryByText(/not ranked/)).toBeNull();
  });
});
