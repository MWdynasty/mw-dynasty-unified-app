(() => {
  let activeAudio = null;
  let activeButton = null;
  let activeURL = '';
  let voiceRun = 0;

  const resetVoice = () => {
    voiceRun += 1;
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch {}
    }
    if (activeURL) URL.revokeObjectURL(activeURL);
    if (activeButton) {
      activeButton.textContent = '▶ Start Voice';
      activeButton.disabled = false;
    }
    activeAudio = null;
    activeButton = null;
    activeURL = '';
  };

  const setVoiceButtons = () => {
    document.querySelectorAll('.mw-read-aloud').forEach((button) => {
      if (button !== activeButton) button.textContent = '▶ Start Voice';
    });
  };

  const startVoice = async (button) => {
    const text = button.closest('.mw-coach-message')?.querySelector('p')?.textContent?.trim();
    if (!text) return;

    if (button === activeButton && activeAudio) {
      resetVoice();
      return;
    }

    resetVoice();
    const token = window.mwSessionToken?.();
    if (!token) return window.toast?.('Coach session expired. Sign in again.');

    const run = ++voiceRun;
    activeButton = button;
    button.disabled = true;
    button.textContent = 'Loading voice…';

    try {
      const prefs = window.coachMWPrefs?.() || {};
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, coachType: prefs.coachType || 'male' })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || 'Coach MW voice unavailable');
      }
      if (run !== voiceRun) return;

      activeURL = URL.createObjectURL(await response.blob());
      activeAudio = new Audio(activeURL);
      activeAudio.playbackRate = Number(prefs.voiceSpeed || 1);
      button.disabled = false;
      button.textContent = '■ Stop Voice';

      activeAudio.onended = () => {
        if (run === voiceRun) resetVoice();
      };
      await activeAudio.play();
    } catch (error) {
      if (run === voiceRun) {
        resetVoice();
        window.toast?.(error.message || 'Coach MW voice unavailable');
      }
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.mw-read-aloud');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startVoice(button);
  }, true);

  new MutationObserver(setVoiceButtons).observe(document.body, { childList: true, subtree: true });
  setVoiceButtons();
})();