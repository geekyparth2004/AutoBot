const STORAGE_KEY = 'amdocsTrainingBotEnabled';
const toggleButton = document.getElementById('toggleButton');
const refreshButton = document.getElementById('refreshButton');
const statusEl = document.getElementById('status');

function updateUi(enabled) {
  if (enabled) {
    toggleButton.textContent = 'Stop Automation';
    toggleButton.classList.remove('start');
    toggleButton.classList.add('stop');
    statusEl.textContent = 'Status: running';
  } else {
    toggleButton.textContent = 'Start Automation';
    toggleButton.classList.remove('stop');
    toggleButton.classList.add('start');
    statusEl.textContent = 'Status: idle';
  }
}

function sendToggleMessage(enabled) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleAutomation', enabled }, () => {
      updateUi(enabled);
    });
  });
}

toggleButton.addEventListener('click', () => {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const enabled = !Boolean(result[STORAGE_KEY]);
    chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
      sendToggleMessage(enabled);
    });
  });
});

refreshButton.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      return;
    }
    chrome.tabs.reload(tabs[0].id);
  });
});

chrome.storage.local.get([STORAGE_KEY], (result) => {
  updateUi(Boolean(result[STORAGE_KEY]));
});
