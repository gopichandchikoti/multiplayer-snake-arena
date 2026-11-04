import { Logo } from './Logo';
import { NameField } from './NameField';

interface Props {
  invite: string | null;
  onJoinInvite: () => void;
  onOnline: () => void;
  onPractice: () => void;
  onHelp: () => void;
  onSettings: () => void;
}

export function MenuScreen({ invite, onJoinInvite, onOnline, onPractice, onHelp, onSettings }: Props) {
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
        {invite ? (
          <div className="notice" role="region" aria-label="Invitation">
            <p>You were invited to room {invite}.</p>
            <button type="button" className="btn btn--primary" onClick={onJoinInvite}>
              Join room {invite}
            </button>
          </div>
        ) : null}
        <div className="stack">
          <button type="button" className="btn btn--primary" onClick={onOnline}>
            Play online
          </button>
          <button type="button" className="btn" onClick={onPractice}>
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
          Online play needs the game server. Practice runs offline in your browser and is never ranked. No account is
          needed for anything.
        </p>
      </section>
    </main>
  );
}
