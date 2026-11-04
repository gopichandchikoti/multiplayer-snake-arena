export interface Timer {
  cancel: () => void;
}

/** Time and timers behind one interface, so rooms can be tested with a clock that is moved by hand. */
export interface Clock {
  now: () => number;
  after: (ms: number, run: () => void) => Timer;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const handle = setTimeout(run, ms);
    handle.unref();
    return {
      cancel: () => {
        clearTimeout(handle);
      },
    };
  },
};
