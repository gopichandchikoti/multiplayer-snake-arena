import { useEffect, useState } from 'react';
import { sanitizeNickname } from '@snake/shared';
import { applyDocumentSettings, useSettings } from './state/app';
import { GameScreen } from './ui/GameScreen';
import { HelpDialog } from './ui/HelpDialog';
import { MenuScreen } from './ui/MenuScreen';
import { PracticeSetup } from './ui/PracticeSetup';
import { SettingsDialog } from './ui/SettingsDialog';
import { SummaryScreen } from './ui/SummaryScreen';
import { type Flow, useAppFlow } from './ui/useAppFlow';

type Dialog = 'settings' | 'help' | null;

interface ScreenProps {
  flow: Flow;
  onDialog: (dialog: Dialog) => void;
}

function CurrentScreen({ flow, onDialog }: ScreenProps) {
  const settings = useSettings();
  const { screen } = flow;
  switch (screen.name) {
    case 'menu':
      return (
        <MenuScreen
          onPractice={flow.openSetup}
          onHelp={() => {
            onDialog('help');
          }}
          onSettings={() => {
            onDialog('settings');
          }}
        />
      );
    case 'practice-setup':
      return (
        <main id="main" className="menu">
          <PracticeSetup
            playerName={sanitizeNickname(settings.nickname) ?? 'Guest'}
            initialTheme={settings.theme}
            onStart={flow.startPractice}
            onBack={flow.toMenu}
          />
        </main>
      );
    case 'game':
      return <GameScreen source={screen.source} onLeave={flow.toMenu} onFinished={flow.finish} />;
    case 'summary': {
      const result = screen.source.hud().result;
      if (!result) return null;
      return (
        <SummaryScreen
          result={result}
          roster={screen.source.roster}
          offline={screen.source.offline}
          primaryLabel="Play again"
          onPrimary={flow.playAgain}
          onMenu={flow.toMenu}
        />
      );
    }
  }
}

export function App() {
  const settings = useSettings();
  const flow = useAppFlow();
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    applyDocumentSettings(document.documentElement, settings);
  }, [settings]);

  const close = (): void => {
    setDialog(null);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <CurrentScreen flow={flow} onDialog={setDialog} />
      {dialog === 'settings' ? <SettingsDialog onClose={close} /> : null}
      {dialog === 'help' ? <HelpDialog onClose={close} /> : null}
    </>
  );
}
