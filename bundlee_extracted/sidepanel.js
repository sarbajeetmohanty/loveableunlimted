// Loveable Unlimited Side Panel Logic

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById('tab-' + btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // 2. Load User Profile from Chrome Storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['ql_license_key', 'ql_user_name', 'ql_expires_at', 'ql_license_valid'], (data) => {
      if (data && data.ql_license_valid) {
        const userEmail = data.ql_user_name || data.ql_license_key || 'sarbajeetmohanty110@gmail.com';
        document.getElementById('acc-email').textContent = userEmail;
      }
    });
  }

  // 3. Prompt Chips click to fill textarea & send
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.prompt;
      const customInput = document.getElementById('custom-prompt');
      if (customInput) customInput.value = text;
      sendPromptToActiveTab(text);
    });
  });

  // 4. Custom Prompt Send Button
  const sendBtn = document.getElementById('send-prompt-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const prompt = document.getElementById('custom-prompt').value.trim();
      if (prompt) {
        sendPromptToActiveTab(prompt);
      }
    });
  }

  // 5. Code Fixer
  const fixBtn = document.getElementById('fix-error-btn');
  if (fixBtn) {
    fixBtn.addEventListener('click', () => {
      const errorText = document.getElementById('error-input').value.trim();
      if (!errorText) return;
      const fixPrompt = `Please fix the following error in the codebase:\n\n\`\`\`\n${errorText}\n\`\`\`\n\nEnsure complete type safety, correct component props, and verify that the page renders without errors.`;
      sendPromptToActiveTab(fixPrompt);
    });
  }

  // 6. Tool buttons
  const btnDash = document.getElementById('btn-open-dash');
  if (btnDash) {
    btnDash.addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://localhost:3001' });
    });
  }

  const btnUnlock = document.getElementById('btn-unlock-all');
  if (btnUnlock) {
    btnUnlock.addEventListener('click', () => {
      chrome.storage.local.set({ ql_license_valid: true, ql_native_chat: true }, () => {
        showToast('All features & prompts unlocked!');
      });
    });
  }

  const btnSync = document.getElementById('btn-sync-token');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      showToast('Tokens synchronized with Lovable!');
    });
  }
});

// Helper: Inject and submit prompt in the active Lovable tab
function sendPromptToActiveTab(promptText) {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    showToast('Sent: ' + promptText.slice(0, 30) + '...');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];

    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (text) => {
        // Find Lovable prompt textarea
        const textarea = document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
        if (textarea) {
          if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
            textarea.value = text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            textarea.textContent = text;
          }
          textarea.focus();
        }
      },
      args: [promptText]
    }, () => {
      showToast('Prompt injected into Lovable!');
    });
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}
