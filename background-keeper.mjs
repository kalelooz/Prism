// The desktop app schedules this; tests supply an in-memory renderer.
export function backgroundKeeper(store, operate, report = () => {}) {
  let cachedId, cached;
  return async function restore() {
    const state = store.snapshot();
    if (!state.activeId && !state.pendingRemoval) {
      report('No background is active.');
      return { idle: true };
    }
    try {
      if (state.pendingRemoval) {
        const result = await operate(null);
        if (!result?.removed) throw Object.assign(new Error(result?.message || 'Codex did not confirm removal.'), { result });
        await store.removed();
        cachedId = null; cached = null;
        report('Background removed. Automatic restoration is off.');
        return result;
      }
      if (cachedId !== state.activeId) {
        cached = await store.load(state.activeId);
        cachedId = state.activeId;
      }
      const result = await operate(cached, { ensure: true });
      if (!result?.installed) throw Object.assign(new Error(result?.message || 'Codex did not confirm the background.'), { result });
      report('Background saved. Prism will restore it after Codex reloads.');
      return result;
    } catch (error) {
      report(state.pendingRemoval ? `Restoration is off. Removal is waiting for Codex. ${error.message}` : `Your background is saved. ${error.message}`);
      return { ...error.result, waiting: true, message: error.message };
    }
  };
}
