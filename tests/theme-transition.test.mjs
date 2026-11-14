import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createThemeTransition } from '../src/lib/theme-transition.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function page(nativeMode) {
  const children = [];
  const animations = [];
  const timers = new Map();
  const natives = [];
  let timerId = 0;
  let calm = false;
  const document = {
    defaultView: {
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
    body: { append(node) { if (!children.includes(node)) children.push(node); } },
    createElement() {
      const node = {
        dataset: {}, style: {}, className: '', inert: false, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        remove() { const index = children.indexOf(this); if (index !== -1) children.splice(index, 1); },
        animate(keyframes, options) {
          const done = deferred();
          const animation = {
            keyframes, options, node, finished: done.promise,
            complete: done.resolve, reject: done.reject,
            cancel() { done.reject(new Error('Cancelled')); },
          };
          animations.push(animation);
          return animation;
        },
      };
      return node;
    },
  };
  if (nativeMode) {
    document.startViewTransition = (update) => {
      if (nativeMode === 'throws') throw new Error('Native start failed');
      const ready = deferred();
      const finished = deferred();
      const transition = {
        update, ready: ready.promise, finished: finished.promise,
        start() { update(); ready.resolve(); },
        complete: finished.resolve, failReady: ready.reject, fail: finished.reject,
        skipTransition() { ready.reject(new Error('Skipped')); finished.reject(new Error('Skipped')); },
      };
      natives.push(transition);
      return transition;
    };
  }
  const root = { ownerDocument: document, dataset: {} };
  const applied = [];
  const controller = createThemeTransition({
    root,
    applyTheme(theme) { root.dataset.theme = theme; applied.push(theme); },
    still: () => calm,
  });
  return { controller, root, children, animations, natives, timers, applied, calm() { calm = true; } };
}

async function finishCurtain(context, startIndex = 0) {
  context.animations[startIndex].complete();
  await flush();
  context.animations[startIndex + 1].complete();
  await flush();
}

test('unsupported browsers change theme only after the curtain covers the viewport', async () => {
  const p = page();
  p.controller.toggle();
  assert.deepEqual(p.applied, []);
  assert.equal(p.children.length, 1);
  assert.equal(p.children[0].className, 'theme-curtain');
  assert.equal(p.children[0].inert, true);
  assert.equal(p.children[0].attributes['aria-hidden'], 'true');
  assert.deepEqual(p.animations[0].keyframes, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }]);
  p.animations[0].complete();
  await flush();
  assert.deepEqual(p.applied, ['dark']);
  assert.deepEqual(p.animations[1].keyframes, [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }]);
  assert.equal(p.children.length, 1);
  p.animations[1].complete();
  await flush();
  assert.equal(p.children.length, 0);
  assert.equal(p.root.dataset.themeTransition, undefined);
  assert.equal(p.timers.size, 0);
  p.controller.toggle();
  assert.deepEqual(p.animations[2].keyframes, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }]);
  await finishCurtain(p, 2);
  assert.equal(p.root.dataset.theme, 'light');
});

test('supporting browsers retain the native directional wipe', async () => {
  const p = page('supported');
  p.controller.toggle();
  assert.equal(p.root.dataset.vt, 'theme');
  assert.equal(p.root.dataset.vtDir, 'forward');
  assert.equal(p.animations.length, 0);
  p.natives[0].start();
  assert.deepEqual(p.applied, ['dark']);
  assert.equal(p.children[0].className, 'theme-edge');
  p.natives[0].complete();
  await flush();
  assert.equal(p.children.length, 0);
  assert.equal(p.root.dataset.vt, undefined);
  assert.equal(p.root.dataset.vtDir, undefined);
  assert.equal(p.timers.size, 0);
});

test('rapid native clicks preserve the latest requested theme before the capture callback', async () => {
  const p = page('supported');
  p.controller.toggle();
  p.controller.toggle();
  p.controller.toggle();
  p.natives[0].start();
  p.natives[0].complete();
  await flush();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.natives.length, 1);
  assert.equal(p.children.length, 0);
});

test('a queued second click returns to the original theme after the active curtain', async () => {
  const p = page();
  p.controller.toggle();
  p.controller.toggle();
  await finishCurtain(p);
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.animations.length, 3);
  await finishCurtain(p, 2);
  assert.deepEqual(p.applied, ['dark', 'light']);
  assert.equal(p.children.length, 0);
});

test('a synchronous native failure falls back and removes native transition state', async () => {
  const p = page('throws');
  p.controller.toggle();
  assert.equal(p.root.dataset.vt, undefined);
  assert.equal(p.root.dataset.vtDir, undefined);
  assert.equal(p.root.dataset.themeTransition, 'fallback');
  await finishCurtain(p);
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.children.length, 0);
});

test('a rejected native capture cannot apply a stale theme during its fallback', async () => {
  const p = page('supported');
  p.controller.toggle();
  p.natives[0].failReady(new Error('Capture failed'));
  await flush();
  assert.equal(p.children[0].className, 'theme-curtain');
  p.natives[0].start();
  assert.deepEqual(p.applied, []);
  await finishCurtain(p);
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.children.length, 0);
});

test('interrupted animations finish the latest intent and clear their overlay', async () => {
  const p = page();
  p.controller.toggle();
  p.controller.toggle();
  p.controller.toggle();
  p.animations[0].reject(new Error('Animation interrupted'));
  await flush();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.children.length, 0);
  assert.equal(p.root.dataset.themeTransition, undefined);
  assert.equal(p.timers.size, 0);
});

test('an interrupted outgoing curtain clears the overlay and honours a queued reversal', async () => {
  const p = page();
  p.controller.toggle();
  p.animations[0].complete();
  await flush();
  assert.equal(p.root.dataset.theme, 'dark');
  p.controller.toggle();
  p.animations[1].reject(new Error('Outgoing animation interrupted'));
  await flush();
  assert.equal(p.root.dataset.theme, 'light');
  assert.equal(p.children.length, 0);
  assert.equal(p.root.dataset.themeTransition, undefined);
  assert.equal(p.timers.size, 0);
});

test('a rejected native animation cleans up after its theme update', async () => {
  const p = page('supported');
  p.controller.toggle();
  p.natives[0].start();
  p.natives[0].fail(new Error('Native animation skipped'));
  await flush();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.children.length, 0);
  assert.equal(p.root.dataset.vt, undefined);
  assert.equal(p.timers.size, 0);
});

test('finish invalidates pending native callbacks and applies the latest intent', async () => {
  const p = page('supported');
  p.controller.toggle();
  p.controller.finish();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.root.dataset.vt, undefined);
  p.natives[0].start();
  await flush();
  assert.deepEqual(p.applied, ['dark']);
  assert.equal(p.children.length, 0);
  p.controller.finish();
  assert.deepEqual(p.applied, ['dark']);
});

test('finishing before the curtain covers preserves the latest queued reversal', async () => {
  const p = page();
  p.controller.toggle();
  p.controller.toggle();
  p.controller.finish();
  p.animations[0].complete();
  await flush();
  assert.deepEqual(p.applied, []);
  assert.equal(p.root.dataset.theme, undefined);
  assert.equal(p.children.length, 0);
  assert.equal(p.animations.length, 1);
});

test('paused or reduced motion changes theme without creating an overlay', () => {
  const p = page('supported');
  p.calm();
  p.controller.toggle();
  assert.deepEqual(p.applied, ['dark']);
  assert.equal(p.children.length, 0);
  assert.equal(p.natives.length, 0);
  assert.equal(p.timers.size, 0);
});

test('theme switching does not remove an unrelated navigation transition', () => {
  const p = page('supported');
  p.root.dataset.vt = 'left';
  p.controller.toggle();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.root.dataset.vt, 'left');
  assert.equal(p.natives.length, 0);
  assert.equal(p.children.length, 0);
});

test('the watchdog clears a hung transition', async () => {
  const p = page();
  p.controller.toggle();
  [...p.timers.values()][0]();
  await flush();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.children.length, 0);
  assert.equal(p.timers.size, 0);
});
