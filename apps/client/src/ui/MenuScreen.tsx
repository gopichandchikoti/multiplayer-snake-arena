import { Logo } from './Logo';
import { NameField } from './NameField';

interface Props {
  onPractice: () => void;
  onHelp: () => void;
  onSettings: () => void;
}

export function MenuScreen({ onPractice, onHelp, onSettings }: Props) {
  return (
    <main id="main" className="menu">
      <div className="menu__intro">
        <div className="brand">
          <Logo />
          <span className="brand__name">Coilyard</span>
        </div>
        <h1 className="menu__title">Eight snakes. One board.</h1>
        <p className="menu__lede">Quick snake duels where the server counts every point, so every score is fair.</p>
      </div>
      <section className="panel" aria-labelledby="menu-title">
        <h2 id="menu-title" className="panel__title">
          Choose how to play
        </h2>
        <NameField />
        <div className="stack">
          <button type="button" className="btn btn--primary" onClick={onPractice}>
            Practice against bots
          </button>
          <button type="button" className="btn" onClick={onHelp}>
            How to play
          </button>
          <button type="button" className="btn" onClick={onSettings}>
            Settings
          </button>
        </div>
        <p className="field__hint">
          Practice runs offline in your browser and is never ranked. No account is needed for anything.
        </p>
      </section>
    </main>
  );
}
