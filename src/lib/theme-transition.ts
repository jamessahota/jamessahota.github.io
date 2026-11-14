export type Theme = 'light' | 'dark';

type NativeTransition = {
  ready?: Promise<unknown>;
  finished: Promise<unknown>;
  skipTransition?: () => void;
};

interface Options {
  root: HTMLElement;
  applyTheme: (theme: Theme) => void;
  still: () => boolean;
}

interface Run {
  theme: Theme;
  direction: 'forward' | 'back';
  phase: 'native' | 'fallback' | 'done';
  applied: boolean;
  nodes: HTMLElement[];
  animations: Animation[];
  native?: NativeTransition;
  ownsNativeState?: boolean;
  timeout?: number;
}

/** Preserve the native wipe, with a two-stage curtain on older browsers. */
export function createThemeTransition({ root, applyTheme, still }: Options) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const current = (): Theme => root.dataset.theme === 'dark' ? 'dark' : 'light';
  let requested = current();
  let active: Run | undefined;

  const clearNativeState = (run: Run) => {
    if (run.ownsNativeState && root.dataset.vt === 'theme' && root.dataset.vtDir === run.direction) {
      delete root.dataset.vt;
      delete root.dataset.vtDir;
    }
    run.ownsNativeState = false;
  };

  const clean = (run: Run) => {
    run.phase = 'done';
    view?.clearTimeout(run.timeout);
    clearNativeState(run);
    delete root.dataset.themeTransition;
    run.nodes.forEach((node) => node.remove());
    run.animations.forEach((animation) => animation.cancel());
    try { run.native?.skipTransition?.(); } catch {}
  };

  // Called when motion is paused, the page is hidden, or a transition fails.
  // Invalidating the run first prevents late browser callbacks applying stale themes.
  const finish = () => {
    if (!active) return;
    const run = active;
    active = undefined;
    clean(run);
    if (current() !== requested) applyTheme(requested);
  };

  const complete = (run: Run) => {
    if (active !== run) return;
    active = undefined;
    clean(run);
    if (!run.applied) applyTheme(run.theme);
    start();
  };

  const fallback = (run: Run) => {
    if (active !== run) return;
    run.phase = 'fallback';
    clearNativeState(run);
    run.nodes.forEach((node) => node.remove());
    try { run.native?.skipTransition?.(); } catch {}

    const curtain = document.createElement('div');
    curtain.className = 'theme-curtain';
    curtain.dataset.theme = run.theme;
    curtain.dataset.direction = run.direction;
    curtain.setAttribute('aria-hidden', 'true');
    curtain.inert = true;
    const entrance = run.direction === 'forward' ? '100%' : '-100%';
    const exit = run.direction === 'forward' ? '-100%' : '100%';
    curtain.style.transform = `translateX(${entrance})`;
    run.nodes.push(curtain);
    root.dataset.themeTransition = 'fallback';
    document.body.append(curtain);
    try {
      const incoming = curtain.animate(
        [{ transform: `translateX(${entrance})` }, { transform: 'translateX(0)' }],
        { duration: 280, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
      );
      run.animations.push(incoming);
      incoming.finished.then(() => {
        if (active !== run || run.phase !== 'fallback') return;
        if (still()) { finish(); return; }
        applyTheme(run.theme);
        run.applied = true;
        // Keep the covered frame after cancelling the first animation.
        curtain.style.transform = 'translateX(0)';
        incoming.cancel();
        try {
          const outgoing = curtain.animate(
            [{ transform: 'translateX(0)' }, { transform: `translateX(${exit})` }],
            { duration: 280, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
          );
          run.animations.push(outgoing);
          outgoing.finished.then(() => complete(run), () => { if (active === run) finish(); });
        } catch { finish(); }
      }, () => { if (active === run) finish(); });
    } catch { finish(); }
  };

  const nativeFailed = (run: Run) => {
    if (active !== run || run.phase !== 'native') return;
    if (run.applied) finish();
    else fallback(run);
  };

  function start() {
    if (active || current() === requested) return;
    // Do not compete with a navigation transition that already owns the page.
    if (still() || !view || root.dataset.vt) { applyTheme(requested); return; }
    const run: Run = {
      theme: requested,
      direction: requested === 'dark' ? 'forward' : 'back',
      phase: 'native', applied: false, nodes: [], animations: [],
    };
    active = run;
    run.timeout = view.setTimeout(() => { if (active === run) finish(); }, 2000);
    const nativeStart = (document as Document & {
      startViewTransition?: (update: () => void) => NativeTransition;
    }).startViewTransition;
    if (!nativeStart) { fallback(run); return; }

    const edge = document.createElement('div');
    edge.className = 'theme-edge';
    edge.setAttribute('aria-hidden', 'true');
    run.nodes.push(edge);
    root.dataset.vt = 'theme';
    root.dataset.vtDir = run.direction;
    run.ownsNativeState = true;
    try {
      run.native = nativeStart.call(document, () => {
        if (active !== run || run.phase !== 'native') return;
        applyTheme(run.theme);
        run.applied = true;
        document.body.append(edge);
      });
      run.native.ready?.then(undefined, () => nativeFailed(run));
      run.native.finished.then(
        () => { if (run.phase === 'native') complete(run); },
        () => nativeFailed(run),
      );
    } catch { nativeFailed(run); }
  }

  return {
    toggle() {
      const from = active ? requested : current();
      requested = from === 'dark' ? 'light' : 'dark';
      if (still() && active) finish();
      else start();
    },
    finish,
  };
}
