import { GROWTH, ROUND_SECONDS, SCORE } from '@snake/shared';
import { POWERUP_STYLES } from '../game/palette';
import { Modal } from './primitives';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <section className="stack" aria-labelledby="help-steer">
        <h3 id="help-steer">Steering</h3>
        <ul className="help-grid">
          <li>
            <span>
              <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
            </span>
          </li>
          <li>Swipe anywhere on the arena, or use the steering pad. It appears by default on touch screens.</li>
          <li>
            <kbd>P</kbd> pauses practice. <kbd>M</kbd> mutes sound.
          </li>
        </ul>
      </section>
      <section className="stack" aria-labelledby="help-score">
        <h3 id="help-score">Scoring, {ROUND_SECONDS} seconds a round</h3>
        <ul className="help-grid">
          <li>
            Apple: {SCORE.apple} points, grows you by {GROWTH.apple}.
          </li>
          <li>
            Golden apple: {SCORE.golden} points, grows you by {GROWTH.golden}.
          </li>
          <li>Crashed snake pellets: {SCORE.pellet} points each.</li>
          <li>Someone crashes into your body: {SCORE.elimination} points.</li>
          <li>Last snake standing: {SCORE.lastStanding} point bonus and the round ends.</li>
          <li>Head-on crashes remove both snakes. Nobody scores.</li>
        </ul>
      </section>
      <section className="stack" aria-labelledby="help-power">
        <h3 id="help-power">Power-ups</h3>
        <ul className="help-grid">
          {Object.values(POWERUP_STYLES).map((power) => (
            <li key={power.kind}>
              <strong>{power.label}</strong> <span>{power.hint}.</span>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
}
