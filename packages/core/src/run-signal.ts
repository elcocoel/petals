// The signal of the run a piece of work is for (T190, SYS-013). Stop has to reach a tool's fetch, which
// can sit many calls below tool.run, so a fetch asks here instead of every signature in between
// carrying a signal. The agent, which runs on Node, sets the source (run.ts). Core stays free of
// node: imports, and outside a run this adds nothing.
let source: () => AbortSignal | undefined = () => undefined;

export function setRunSignalSource(f: () => AbortSignal | undefined): void {
  source = f;
}

/** `own` (a timeout, say) and the current run's signal, as one signal; whichever exists. */
export function runSignal(own?: AbortSignal): AbortSignal | undefined {
  const run = source();
  return run && own ? AbortSignal.any([run, own]) : (run ?? own);
}
