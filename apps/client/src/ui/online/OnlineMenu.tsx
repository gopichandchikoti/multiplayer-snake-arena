import { useId, useState } from 'react';
import type { ThemeId } from '@snake/shared';
import type { Notice } from '../../net/onlineSession';
import { NameField } from '../NameField';
import { Segmented } from '../primitives';

interface Props {
  theme: ThemeId;
  notice: Notice | null;
  onQuickplay: () => void;
  onCreate: (visibility: 'private' | 'public') => void;
  onJoin: (code: string, spectate: boolean) => void;
  onLeaderboard: () => void;
  onDismissNotice: () => void;
  onBack: () => void;
}

const VISIBILITY = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
] as const;

function JoinByCode({ onJoin }: Pick<Props, 'onJoin'>) {
  const [code, setCode] = useState('');
  const id = useId();
  const valid = /^[A-Za-z0-9]{5}$/.test(code);
  return (
    <form
      className="field"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onJoin(code, false);
      }}
    >
      <label className="field__label" htmlFor={id}>
        Room code
      </label>
      <div className="row">
        <input
          id={id}
          className="input input--code"
          value={code}
          maxLength={5}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCDE"
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
          }}
        />
        <button type="submit" className="btn" disabled={!valid}>
          Join
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={!valid}
          onClick={() => {
            onJoin(code, true);
          }}
        >
          Watch
        </button>
      </div>
    </form>
  );
}

function CreateRoom({ onCreate }: Pick<Props, 'onCreate'>) {
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  return (
    <div className="stack">
      <Segmented legend="New room" name="visibility" value={visibility} options={VISIBILITY} onChange={setVisibility} />
      <button
        type="button"
        className="btn"
        onClick={() => {
          onCreate(visibility);
        }}
      >
        Create room
      </button>
    </div>
  );
}

export function OnlineMenu(props: Props) {
  const { notice } = props;
  return (
    <main id="main" className="menu">
      <section className="panel" aria-labelledby="online-title">
        <h1 id="online-title" className="panel__title">
          Play online
        </h1>
        {notice ? (
          <p role="alert" className="notice">
            {notice.message}{' '}
            <button type="button" className="btn btn--quiet" onClick={props.onDismissNotice}>
              Dismiss
            </button>
          </p>
        ) : null}
        <NameField />
        <button type="button" className="btn btn--primary" onClick={props.onQuickplay}>
          Quick play
        </button>
        <p className="field__hint">Joins the fullest open public lobby, or opens a new one. You start ready.</p>
        <CreateRoom onCreate={props.onCreate} />
        <JoinByCode onJoin={props.onJoin} />
        <div className="row">
          <button type="button" className="btn btn--quiet" onClick={props.onLeaderboard}>
            Leaderboard
          </button>
          <button type="button" className="btn btn--quiet" onClick={props.onBack}>
            Back to menu
          </button>
        </div>
      </section>
    </main>
  );
}
