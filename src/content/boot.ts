import { clearStaleHosts } from './host';
import { startCompanion } from './runtime';
import { isExtension } from '../shared/settings';

/** Shared entry for content scripts and extension pages (the PDF reader). */
export function bootCompanion() {
  const context = globalThis as typeof globalThis & { __fungusanCleanup?: () => void };
  context.__fungusanCleanup?.();
  // Covers cards left by a script orphaned in an earlier extension version, and by a hidden
  // companion where nothing will mount over them.
  clearStaleHosts();
  let controller: Awaited<ReturnType<typeof startCompanion>> | undefined;
  // The popup asks every tab to show her. A live script replays the saved state; if this listener
  // is gone (orphaned by an extension reload) the service worker injects a fresh copy instead.
  const ensure = (message: unknown, _sender: chrome.runtime.MessageSender, reply: (value?: unknown) => void) => {
    if ((message as { type?: unknown } | null)?.type !== 'fg:ensure') return;
    if (controller) void controller.refresh().catch(() => undefined);
    reply({ ok: true });
  };
  if (isExtension()) chrome.runtime.onMessage.addListener(ensure);
  let generation = 0;
  const start = async () => {
    const ticket = ++generation;
    try {
      const next = await startCompanion();
      if (ticket !== generation) next.dispose();
      else controller = next;
    } catch {
      /* Extension reload or denied storage: leave the host page untouched. */
    }
  };
  const stop = () => {
    generation++;
    controller?.dispose();
    controller = undefined;
  };
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) void start();
  };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', pageshow);
  context.__fungusanCleanup = () => {
    stop();
    if (isExtension()) chrome.runtime.onMessage.removeListener(ensure);
    window.removeEventListener('pagehide', stop);
    window.removeEventListener('pageshow', pageshow);
  };
  void start();
  // A reloaded extension orphans this script: chrome.runtime.id goes undefined and every
  // chrome.* call starts throwing, so the orphan can neither unmount its card nor load a fresh
  // drawing. Watch for the loss and unmount, leaving the page clean until its next reload.
  if (isExtension()) {
    const watchdog = setInterval(() => {
      if (!isExtension()) {
        clearInterval(watchdog);
        stop();
      }
    }, 1000);
  }
}
