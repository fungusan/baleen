import { createHost } from './host';
import { isExtension, readSettings, watchSettings } from '../shared/settings';
import type { Settings, SettingsPatch } from '../shared/types';

export async function startCompanion() {
  let mounted: ReturnType<typeof createHost> | undefined;
  let disposed = false;
  const save = (patch: SettingsPatch) => {
    if (!isExtension()) return;
    try {
      void chrome.runtime.sendMessage({ type: 'fg:update', patch }).catch(() => undefined);
    } catch {
      /* The extension was reloaded mid-flight; the message has nowhere to go. */
    }
  };
  function unmount() {
    mounted?.destroy();
    mounted = undefined;
  }
  function reconcile(value: Settings) {
    if (disposed) return;
    // A stale or externally removed card must be rebuilt rather than reapplied.
    if (mounted && !mounted.element.isConnected) unmount();
    // The card stays mounted while she is hidden: inline section chat is a service of its own and
    // must keep working on pages where the character is turned off.
    if (!mounted) {
      mounted = createHost(value, {
        hide: () => save({ hidden: true }),
        position: (position) => save({ position }),
        model: (model) => save({ model }),
        character: (character) => save({ character }),
        animate: (animate) => save({ animate }),
        scale: (scale) => save({ scale }),
      });
    } else mounted.apply(value);
  }
  const unwatch = watchSettings(reconcile);
  // Re-read after subscribing so a concurrent change cannot be missed.
  reconcile(await readSettings());
  return {
    /** Replay the saved state; a mounted card reapplies without flicker, a missing one mounts. */
    async refresh() {
      if (!disposed) reconcile(await readSettings());
    },
    dispose() {
      disposed = true;
      unwatch();
      unmount();
    },
  };
}
