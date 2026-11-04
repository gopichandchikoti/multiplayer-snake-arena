import { createSfx } from '../render/sfx';
import { settingsStore } from './app';

/** One shared synthesiser; it reads the current sound/volume settings each time it plays. */
export const sfx = createSfx(() => settingsStore.get());
