/* Shared elapsed-rest clock for athlete and coach Practice Mode. */
(function (root) {
  'use strict';
  function mount(panel) {
    const clock = panel.querySelector('[data-rest-clock]');
    const status = panel.querySelector('[data-rest-status]');
    const toggle = panel.querySelector('[data-rest-toggle]');
    const resetButton = panel.querySelector('[data-rest-reset]');
    let elapsed = 0, startedAt = null, interval = null, disabled = false, disabledLabel = '';
    // Derive elapsed time from timestamps, so background throttling cannot lose rest time.
    const milliseconds = () => elapsed + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt));
    function render() {
      const seconds = Math.floor(milliseconds() / 1000);
      clock.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      const state = startedAt !== null ? 'running' : elapsed > 0 ? 'paused' : 'ready';
      panel.dataset.restState = state;
      const label = disabled ? disabledLabel : state === 'running' ? 'RECOVERING' : state === 'paused' ? 'REST PAUSED' : 'READY BETWEEN REPS';
      if (status.textContent !== label) status.textContent = label;
      toggle.textContent = state === 'running' ? 'PAUSE REST' : state === 'paused' ? 'RESUME REST' : 'START REST';
      toggle.disabled = disabled;
      resetButton.disabled = disabled || (startedAt === null && elapsed === 0);
    }
    function clearTick() { clearInterval(interval); interval = null; }
    function pause() {
      elapsed = milliseconds();
      startedAt = null;
      clearTick();
      render();
    }
    function start() {
      if (disabled || startedAt !== null) return;
      startedAt = Date.now();
      render();
      interval = setInterval(() => {
        if (!panel.isConnected) { destroy(); return; }
        render();
      }, 250);
    }
    function reset() {
      clearTick(); elapsed = 0; startedAt = null; render();
    }
    function restart() { reset(); start(); }
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
    return { start, pause, reset, restart, setDisabled, destroy };
  }
  root.MWPracticeRestTimer = { mount };
})(window);
