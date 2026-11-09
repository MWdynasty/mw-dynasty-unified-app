/* Shared assigned-rest countdown for athlete Practice Mode. */
(function (root) {
  'use strict';
  function mount(panel) {
    const clock = panel.querySelector('[data-rest-clock]');
    const status = panel.querySelector('[data-rest-status]');
    const toggle = panel.querySelector('[data-rest-toggle]');
    const resetButton = panel.querySelector('[data-rest-reset]');
    let elapsed = 0, startedAt = null, interval = null, disabled = false, disabledLabel = '', durationSeconds = null;
    // Derive elapsed time from timestamps, so background throttling cannot lose rest time.
    const milliseconds = () => elapsed + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
    const complete = () => durationSeconds !== null && milliseconds() >= durationSeconds * 1000;
    function render() {
      const spent = milliseconds();
      const seconds = Math.ceil(durationSeconds === null ? spent / 1000 : Math.max(0, durationSeconds - spent / 1000));
      clock.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      const state = complete() ? 'complete' : startedAt !== null ? 'running' : spent > 0 ? 'paused' : 'ready';
      panel.dataset.restState = state;
      const label = disabled ? disabledLabel : state === 'complete' ? 'REST COMPLETE' : state === 'running' ? 'RECOVERING' : state === 'paused' ? 'REST PAUSED' : 'READY BETWEEN REPS';
      if (status.textContent !== label) status.textContent = label;
      toggle.textContent = state === 'running' ? 'PAUSE REST' : state === 'paused' ? 'RESUME REST' : state === 'complete' ? 'REST COMPLETE' : 'START REST';
      toggle.disabled = disabled || state === 'complete';
      resetButton.disabled = disabled || (startedAt === null && spent === 0);
    }
    function clearTick() { clearInterval(interval); interval = null; }
    function pause() {
      if (complete()) return;
      elapsed = milliseconds();
      startedAt = null;
      clearTick();
      render();
    }
    function start() {
      if (disabled || startedAt !== null || complete()) return;
      startedAt = Date.now();
      render();
      interval = setInterval(() => {
        if (!panel.isConnected) { destroy(); return; }
        if (complete()) {
          elapsed = durationSeconds * 1000;
          startedAt = null;
          clearTick();
        }
        render();
      }, 200);
    }
    function reset() {
      clearTick(); elapsed = 0; startedAt = null; render();
    }
    function restart() { reset(); start(); }
    function setDuration(seconds) {
      const value = Number(seconds);
      durationSeconds = Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
      reset();
    }
    function setDisabled(value, label = 'REP IN PROGRESS') {
      if (value) pause();
      disabled = Boolean(value); disabledLabel = label; render();
    }
    function onToggle() { if (startedAt === null) start(); else pause(); }
    function onReset() { if (!disabled) reset(); }
    function destroy() {
      clearTick();
      toggle.removeEventListener('click', onToggle);
      resetButton.removeEventListener('click', onReset);
    }
    toggle.addEventListener('click', onToggle);
    resetButton.addEventListener('click', onReset);
    render();
    return { start, pause, reset, restart, setDuration, setDisabled, destroy, milliseconds, seconds: () => milliseconds() / 1000 };
  }
  root.MWPracticeRestTimer = { mount };
})(window);
