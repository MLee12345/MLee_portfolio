function getSampleSuggestions() {
  return [
    {
      id: 'evt-1',
      title: 'Meet with boss',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      displayMonth: 'Sep',
      displayDay: '15',
      startTime: '08:15',
      endTime: '08:45',
      source: 'Gmail',
      sourceUrl: 'https://mail.google.com',
      location: 'Conference Room B',
      targetCalendar: '',
      isUpdate: false,
      isAdded: false
    },
    {
      id: 'evt-2',
      title: 'Annual Team Retreat',
      startDate: '2026-10-12',
      endDate: '2026-10-15',
      displayMonth: 'Oct',
      displayDay: '12-15',
      startTime: '09:00',
      endTime: '17:00',
      source: 'Gmail',
      sourceUrl: 'https://mail.google.com',
      location: 'Lake Tahoe Resort',
      targetCalendar: '',
      isUpdate: false,
      isAdded: false
    },
    {
      id: 'evt-3',
      title: 'Dinner with Mia',
      startDate: '2026-10-25',
      endDate: '2026-10-25',
      displayMonth: 'Oct',
      displayDay: '25',
      startTime: '17:00',
      endTime: '21:00',
      source: 'Gchat',
      sourceUrl: 'https://chat.google.com',
      location: 'Downtown Bistro',
      targetCalendar: '',
      isUpdate: false,
      isAdded: false
    }
  ];
}

let suggestions = [];
let activeRules = ['Ignore newsletter invites'];
let accounts = [];
let myCalendars = [];
let activeScanIntervals = {};
let is24HourClock = false;
let apiKeyErrorTimeout = null;

let currentTourStep = 0;
const tourSteps = [
  {
    step: 0,
    tab: 'suggestions',
    title: 'Take a tour of gSifter? 👋',
    description: 'Would you like a quick walkthrough to see how gSifter turns your Gmail & Chat invites into calendar events?'
  },
  {
    step: 1,
    tab: 'suggestions',
    title: '1. Detected Suggestions 📅',
    description: 'gSifter extracts invites from Gmail & Chat. On each card: click <b>Open in Email/Chat</b> to view source, <b>Dismiss</b> to remove, <b>Edit</b> to change event details, or <b>Add / Update</b> to sync to Google Calendar. Use <b>🔄 Refresh</b> at top to re-scan.'
  },
  {
    step: 2,
    tab: 'chat',
    title: '2. AI Companion & Rules 💬',
    description: 'Chat with gSifter to set custom filtering rules (e.g. "Ignore newsletter invites"). <b>Note:</b> You must input and click <b>Save</b> on a valid Gemini API Key in Settings to enable Chat.'
  },
  {
    step: 3,
    tab: 'settings',
    title: '3. Settings & Accounts ⚙️',
    description: 'Manage everything here: click <b>+ Add</b> for new accounts, edit labels/emails inline, toggle switches or click trash icon to remove accounts, enter & click <b>Save</b> for Gemini API Key, and toggle switches for 24-Hour Clock, Notifications, or Local Privacy.'
  }
];

let userProfile = {
  userName: '',
  apiKey: '',
  defaultCalendar: ''
};

function loadUserProfile() {
  try {
    userProfile.userName = localStorage.getItem('gsifter_user_name') || '';
    userProfile.apiKey = localStorage.getItem('gsifter_api_key') || '';
    userProfile.defaultCalendar = localStorage.getItem('gsifter_default_calendar') || '';
  } catch (e) {}
}

function saveUserProfile() {
  try {
    localStorage.setItem('gsifter_user_name', userProfile.userName || '');
    localStorage.setItem('gsifter_api_key', userProfile.apiKey || '');
    localStorage.setItem('gsifter_default_calendar', userProfile.defaultCalendar || '');
  } catch (e) {}
}

function loadSuggestions() {
  try {
    const saved = localStorage.getItem('gsifter_suggestions');
    if (saved) {
      suggestions = JSON.parse(saved);
    } else {
      suggestions = getSampleSuggestions();
      saveSuggestions();
    }
  } catch (e) {
    suggestions = getSampleSuggestions();
  }
}

function saveSuggestions() {
  try {
    localStorage.setItem('gsifter_suggestions', JSON.stringify(suggestions));
  } catch (e) {}
}

function loadAccounts() {
  try {
    const saved = localStorage.getItem('gsifter_accounts');
    if (saved) {
      accounts = JSON.parse(saved);
    }
  } catch (e) {
    accounts = [];
  }
}

function saveAccounts() {
  try {
    localStorage.setItem('gsifter_accounts', JSON.stringify(accounts));
  } catch (e) {}
}

// Account scanning disabled for testing
function triggerAllAccountScans() {
  return;
}

async function verifyApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length < 10) return false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
    });
    const data = await res.json();
    return res.ok && !!data.candidates;
  } catch (e) {
    console.error('API Key Validation Error:', e);
  }
  return false;
}

async function callGeminiAI(prompt, jsonMode = false) {
  const apiKey = userProfile.apiKey || localStorage.getItem('gsifter_api_key');
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  if (jsonMode) {
    payload.generationConfig = { responseMimeType: "application/json" };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.error('Gemini API Call Failed:', err);
  }
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  is24HourClock = localStorage.getItem('gsifter_24h_clock') === 'true';

  loadUserProfile();
  loadSuggestions();
  loadAccounts();
  setupTabs();
  renderSuggestions();
  renderRules();
  renderAccounts();
  setupSettingsHandlers();
  setupChat();
  setupModal();
  setupDigitLockedTimePickers();
  setupAddAccountModal();
  setupCloseButton();
  setupTour();

  initNavigationState();
  requestMyCalendars();

  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.action === 'SIDEBAR_OPENED') {
      window.parent.postMessage({ action: 'HIDE_UNREAD_DOT' }, '*');
      requestMyCalendars();
    } else if (event.data.action === 'MY_CALENDARS_RESPONSE') {
      if (event.data.calendars) {
        updateCalendarsList(event.data.calendars);
      }
    } else if (event.data.action === 'EVENT_ADDED_SUCCESS') {
      markEventAsAdded(event.data.eventId);
    } else if (event.data.action === 'EVENT_ADDED_FAILED') {
      showToast('Could not add event. Please try again.');
    }
  });

  const simBtn = document.getElementById('trigger-sim-btn');
  if (simBtn) {
    simBtn.addEventListener('click', () => {
      requestMyCalendars();
      renderSuggestions();
      showToast('Refreshed suggestions.');
    });
  }
});

/* --- TOUR LOGIC --- */

function showTourStep(stepNum) {
  if (localStorage.getItem('gsifter_tour_completed') === 'true') {
    const wrapper = document.getElementById('tour-overlay-wrapper');
    if (wrapper) wrapper.classList.add('hidden');
    return;
  }

  const tourOverlayWrapper = document.getElementById('tour-overlay-wrapper');
  if (!tourOverlayWrapper) return;

  currentTourStep = stepNum;
  const stepData = tourSteps.find(s => s.step === stepNum);
  if (!stepData) return;

  switchTab(stepData.tab, true);

  const titleEl = document.getElementById('tour-step-title');
  const descEl = document.getElementById('tour-step-desc');
  const nextBtn = document.getElementById('next-tour-btn');
  const skipBtn = document.getElementById('skip-tour-btn');
  const dotsRow = document.getElementById('tour-dots-row');

  if (titleEl) titleEl.innerHTML = stepData.title;
  if (descEl) descEl.innerHTML = stepData.description;

  if (stepNum === 0) {
    if (dotsRow) dotsRow.style.display = 'none';
    if (skipBtn) skipBtn.textContent = 'Dismiss';
    if (nextBtn) nextBtn.textContent = 'Next →';
  } else {
    if (dotsRow) dotsRow.style.display = 'flex';
    if (skipBtn) skipBtn.textContent = 'Skip Tour';
    
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById(`tour-dot-${i}`);
      if (dot) {
        dot.style.background = (i === stepNum) ? '#1a73e8' : '#dadce0';
      }
    }

    if (nextBtn) {
      nextBtn.textContent = (stepNum === 3) ? 'Finish' : 'Next →';
    }
  }

  tourOverlayWrapper.classList.remove('hidden', 'dissolve');
}

function dismissTourForever() {
  localStorage.setItem('gsifter_tour_completed', 'true');
  localStorage.setItem('gsifter_has_onboarded', 'true');
  
  const tourOverlayWrapper = document.getElementById('tour-overlay-wrapper');
  if (tourOverlayWrapper) {
    tourOverlayWrapper.classList.add('dissolve');
    setTimeout(() => {
      tourOverlayWrapper.classList.add('hidden');
      tourOverlayWrapper.classList.remove('dissolve');
    }, 300);
  }

  switchTab('suggestions');
}

function setupTour() {
  const nextBtn = document.getElementById('next-tour-btn');
  const skipBtn = document.getElementById('skip-tour-btn');
  const closeXBtn = document.getElementById('close-tour-x-btn');

  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentTourStep < 3) {
        showTourStep(currentTourStep + 1);
      } else {
        dismissTourForever();
      }
    };
  }

  if (skipBtn) {
    skipBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissTourForever();
    };
  }

  if (closeXBtn) {
    closeXBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissTourForever();
    };
  }
}

function markEventAsAdded(id) {
  const item = suggestions.find(s => s.id === id);
  if (!item) return;

  item.isAdded = true;
  saveSuggestions();
  renderSuggestions();
  showToast(`Event added: "${item.title}"`);

  setTimeout(() => {
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.92)';
      card.style.maxHeight = '0px';
      card.style.marginBottom = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';
      card.style.overflow = 'hidden';

      setTimeout(() => {
        suggestions = suggestions.filter(s => s.id !== id);
        saveSuggestions();
        renderSuggestions();
      }, 400);
    } else {
      suggestions = suggestions.filter(s => s.id !== id);
      saveSuggestions();
      renderSuggestions();
    }
  }, 1500);
}

function initNavigationState() {
  const tourOverlayWrapper = document.getElementById('tour-overlay-wrapper');
  if (tourOverlayWrapper) {
    tourOverlayWrapper.classList.add('hidden');
  }

  const isFirstTimeUser = localStorage.getItem('gsifter_has_onboarded') !== 'true';

  if (isFirstTimeUser && accounts.length === 0) {
    switchTab('suggestions');
    const addAccModal = document.getElementById('add-account-modal');
    if (addAccModal) {
      addAccModal.classList.remove('hidden');
    }
  } else {
    switchTab('suggestions');
  }
}

function switchTab(tabName, isTouring = false) {
  if (tabName === 'chat' && !isTouring) {
    const apiKey = userProfile.apiKey || localStorage.getItem('gsifter_api_key');
    if (!apiKey) {
      showToast('🔒 Add a valid Gemini API key in Settings');
      return;
    }
  }

  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  const targetTab = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const targetPanel = document.getElementById(`tab-${tabName}`);

  if (targetTab) targetTab.classList.add('active');
  if (targetPanel) targetPanel.classList.add('active');
}

function updateChatVisibility() {
  const chatTab = document.getElementById('chat-tab-btn');
  const chatNotice = document.getElementById('chat-key-notice');
  const apiKey = userProfile.apiKey || localStorage.getItem('gsifter_api_key');

  if (chatTab) {
    if (!apiKey) {
      chatTab.classList.add('tab-locked');
      chatTab.title = "🔒 Add a valid Gemini API Key in Settings";
      chatTab.style.opacity = "0.45";
      chatTab.style.cursor = "not-allowed";
      if (chatNotice) chatNotice.classList.remove('hidden');
    } else {
      chatTab.classList.remove('tab-locked');
      chatTab.removeAttribute('title');
      chatTab.style.opacity = "1";
      chatTab.style.cursor = "pointer";
      if (chatNotice) chatNotice.classList.add('hidden');
    }
  }

  renderSuggestions();
}

function requestMyCalendars() {
  window.parent.postMessage({ action: 'GET_MY_CALENDARS' }, '*');
}

function updateCalendarsList(newCalendars) {
  myCalendars = newCalendars || [];
  populateCalendarSelectOptions();
}

function populateCalendarSelectOptions() {
  const defaultSelect = document.getElementById('default-calendar-select');
  const editSelect = document.getElementById('edit-event-calendar');

  const defaultSettingGroup = defaultSelect ? defaultSelect.closest('.setting-item') : null;
  const editFormGroup = editSelect ? editSelect.closest('.form-group') : null;

  if (!myCalendars || myCalendars.length === 0) {
    if (defaultSettingGroup) defaultSettingGroup.style.display = 'none';
    if (editFormGroup) editFormGroup.style.display = 'none';
    return;
  }

  if (defaultSettingGroup) defaultSettingGroup.style.display = 'flex';
  if (editFormGroup) editFormGroup.style.display = 'flex';

  [defaultSelect, editSelect].forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';

    myCalendars.forEach(cal => {
      const opt = document.createElement('option');
      opt.value = cal.id || cal.name;
      opt.textContent = cal.name;
      select.appendChild(opt);
    });

    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
      select.value = currentVal;
    } else if (select.options.length > 0) {
      select.selectedIndex = 0;
    }
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (tab.dataset.tab === 'chat') {
        const apiKey = userProfile.apiKey || localStorage.getItem('gsifter_api_key');
        if (!apiKey) {
          e.preventDefault();
          e.stopPropagation();
          showToast('🔒 Add a valid Gemini API Key in Settings');
          return;
        }
      }
      switchTab(tab.dataset.tab);
    });
  });

  updateChatVisibility();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setupDigitLockedTimePickers() {
  ['start', 'end'].forEach(p => {
    const hh = document.getElementById(`edit-${p}-hh`);
    const mm = document.getElementById(`edit-${p}-mm`);
    const ampmBtn = document.getElementById(`edit-${p}-ampm`);

    if (ampmBtn) {
      ampmBtn.addEventListener('click', () => {
        ampmBtn.textContent = ampmBtn.textContent.trim() === 'AM' ? 'PM' : 'AM';
      });
    }

    [hh, mm].forEach((inputEl, idx) => {
      if (!inputEl) return;

      inputEl.addEventListener('keydown', (e) => {
        const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;

        if (!/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          return;
        }

        if (inputEl.value.length >= 2 && inputEl.selectionStart === inputEl.selectionEnd) {
          e.preventDefault();
        }
      });

      inputEl.addEventListener('input', () => {
        inputEl.value = inputEl.value.replace(/[^0-9]/g, '').slice(0, 2);

        if (idx === 0 && inputEl.value.length === 2 && mm) {
          mm.focus();
          mm.select();
        }
      });

      inputEl.addEventListener('blur', () => {
        let val = parseInt(inputEl.value, 10);
        if (isNaN(val)) val = 0;

        if (idx === 0) {
          const maxH = is24HourClock ? 23 : 12;
          const minH = is24HourClock ? 0 : 1;
          if (val > maxH) val = maxH;
          if (val < minH) val = minH;
        } else {
          if (val > 59) val = 59;
          if (val < 0) val = 0;
        }

        inputEl.value = val < 10 ? `0${val}` : `${val}`;
      });
    });
  });
}

function parseTimeToDigitValues(timeStr) {
  if (!timeStr) return { hour: '09', minute: '00', ampm: 'AM' };
  const clean = timeStr.trim();
  let h = 9, m = 0, ampm = 'AM';

  if (clean.toLowerCase().includes('am') || clean.toLowerCase().includes('pm')) {
    const isPm = clean.toLowerCase().includes('pm');
    ampm = isPm ? 'PM' : 'AM';
    const parts = clean.replace(/(am|pm)/i, '').trim().split(':');
    h = parseInt(parts[0], 10) || 9;
    m = parseInt(parts[1], 10) || 0;
  } else {
    const parts = clean.split(':');
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    if (!is24HourClock) {
      ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
    }
  }

  const hourStr = h < 10 ? `0${h}` : `${h}`;
  const minStr = m < 10 ? `0${m}` : `${m}`;

  return { hour: hourStr, minute: minStr, ampm: ampm };
}

function setDigitTimeInputs(prefix, timeStr) {
  const vals = parseTimeToDigitValues(timeStr);
  const hh = document.getElementById(`edit-${prefix}-hh`);
  const mm = document.getElementById(`edit-${prefix}-mm`);
  const ampmBtn = document.getElementById(`edit-${prefix}-ampm`);

  if (hh) hh.value = vals.hour;
  if (mm) mm.value = vals.minute;

  if (ampmBtn) {
    if (is24HourClock) {
      ampmBtn.style.display = 'none';
    } else {
      ampmBtn.style.display = 'inline-block';
      ampmBtn.textContent = vals.ampm;
    }
  }
}

function getDigitTimeInputValue(prefix) {
  const hh = document.getElementById(`edit-${prefix}-hh`)?.value || '09';
  const mm = document.getElementById(`edit-${prefix}-mm`)?.value || '00';
  const ampm = document.getElementById(`edit-${prefix}-ampm`)?.textContent.trim() || 'AM';

  if (is24HourClock) {
    return `${hh}:${mm}`;
  } else {
    return `${hh}:${mm} ${ampm}`;
  }
}

function formatTimeString(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return '';
  
  function formatSingle(tStr) {
    const v = parseTimeToDigitValues(tStr);
    if (is24HourClock) {
      let h = parseInt(v.hour, 10);
      if (v.ampm === 'PM' && h < 12) h += 12;
      if (v.ampm === 'AM' && h === 12) h = 0;
      const hStr = h < 10 ? `0${h}` : `${h}`;
      return `${hStr}:${v.minute}`;
    } else {
      return `${v.hour}:${v.minute}${v.ampm.toLowerCase()}`;
    }
  }

  return `${formatSingle(startTimeStr)} - ${formatSingle(endTimeStr)}`;
}

function makeInlineEditable(element, onSave, isEmail = false) {
  element.addEventListener('click', (e) => {
    e.stopPropagation();
    if (element.querySelector('input')) return;

    const currentText = element.textContent.trim();
    const input = document.createElement('input');
    input.type = isEmail ? 'email' : 'text';
    input.value = currentText;
    input.className = 'inline-edit-input';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();

    let isCommitting = false;

    function save() {
      if (isCommitting) return;
      const val = input.value.trim();

      if (isEmail && !isValidEmail(val)) {
        input.classList.add('input-error');
        showToast('Please enter a valid email address.');
        setTimeout(() => input.focus(), 10);
        return;
      }

      isCommitting = true;
      element.textContent = val || currentText;
      onSave(val || currentText);
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        save();
      } else if (ev.key === 'Escape') {
        isCommitting = true;
        element.textContent = currentText;
      }
    });
  });
}

function renderAccounts() {
  const container = document.getElementById('accounts-container');
  if (!container) return;
  container.innerHTML = '';

  if (accounts.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 12px; color: var(--text-muted); font-size:12px;">No accounts connected. Click <strong>+ Add</strong> above to connect an account.</div>`;
    return;
  }

  accounts.forEach((acc) => {
    const card = document.createElement('div');
    const classes = ['sketch-account-item'];
    if (acc.isDeleting) classes.push('account-removed-danger');
    if (acc.justAdded) classes.push('account-added-success');

    card.className = classes.join(' ');
    card.setAttribute('data-acc-id', acc.id);
    card.innerHTML = `
      <div class="account-header-row">
        <div class="account-title-group">
          <span class="account-name-text editable-field" title="Click to edit name">${acc.name}</span>
          <span class="account-email-text editable-field" title="Click to edit email">${acc.email}</span>
        </div>
        <div class="account-controls">
          <label class="toggle-switch acc-toggle">
            <input type="checkbox" ${acc.enabled ? 'checked' : ''} data-acc-id="${acc.id}">
            <span class="slider"></span>
          </label>
          <button class="delete-acc-btn" title="Remove Account" data-acc-id="${acc.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    const nameEl = card.querySelector('.account-name-text');
    const emailEl = card.querySelector('.account-email-text');

    makeInlineEditable(nameEl, (newVal) => { acc.name = newVal; saveAccounts(); }, false);
    makeInlineEditable(emailEl, (newVal) => { acc.email = newVal; saveAccounts(); }, true);

    const toggleInput = card.querySelector('.acc-toggle input');
    if (toggleInput) {
      toggleInput.addEventListener('change', (e) => {
        acc.enabled = e.target.checked;
        saveAccounts();
      });
    }

    const deleteBtn = card.querySelector('.delete-acc-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (acc.isDeleting) return;
        acc.isDeleting = true;
        renderAccounts();

        setTimeout(() => {
          accounts = accounts.filter(a => a.id !== acc.id);
          saveAccounts();
          renderAccounts();
          showToast(`Removed ${acc.name}`);
        }, 1000);
      });
    }

    container.appendChild(card);
  });
}

// Real-time background scanning disabled for testing
async function scanAccountInRealTime(account) {
  return;
}

function renderSuggestions() {
  const container = document.getElementById('suggestions-list');
  if (!container) return;
  container.innerHTML = '';

  const sorted = [...suggestions].sort((a, b) => new Date(a.startDate || a.date) - new Date(b.startDate || b.date));

  if (sorted.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; background: #ffffff; border: 1px dashed var(--border-color); border-radius: 12px; margin-top: 8px;">
        <div style="font-size: 24px; margin-bottom: 8px;">🎉</div>
        <strong>No pending suggestions</strong>
        <p style="font-size: 11px; margin-top: 4px; color: #80868b;">Click <strong>Refresh</strong> above to scan or reset suggestions.</p>
      </div>`;
    return;
  }

  sorted.forEach(item => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.id = `card-${item.id}`;

    const sourceLabel = item.source === 'Gchat' ? 'Open in Chat' : 'Open in Email';
    const formattedTime = formatTimeString(item.startTime, item.endTime);

    if (item.isAdded) {
      card.classList.add('added-success');
      card.innerHTML = `
        <div class="card-top">
          <div class="date-badge">
            <div class="month">${item.displayMonth}</div>
            <div class="day">${item.displayDay}</div>
          </div>
          <div class="card-info">
            <div class="title-row">
              <span class="event-title">${item.title}</span>
            </div>
            <div class="event-time">${formattedTime}</div>
            ${item.location ? `<div class="event-location">📍 ${item.location}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <div class="card-added-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#137333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Event added</span>
          </div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-top">
          <div class="date-badge">
            <div class="month">${item.displayMonth}</div>
            <div class="day">${item.displayDay}</div>
          </div>
          <div class="card-info">
            <div class="title-row">
              <span class="event-title">${item.title}</span>
            </div>
            <div class="event-time">${formattedTime}</div>
            ${item.location ? `<div class="event-location">📍 ${item.location}</div>` : ''}
            ${item.isUpdate ? `<div class="update-notice">${item.updateReason}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <a href="${item.sourceUrl}" target="_blank" class="open-source-btn">
            ${sourceLabel} &rarr;
          </a>
          <div class="card-actions-right">
            <button class="btn-sm dismiss" data-id="${item.id}">Dismiss</button>
            <button class="btn-sm edit" data-id="${item.id}">Edit</button>
            <button class="btn-sm ${item.isUpdate ? 'update' : 'add'}" data-id="${item.id}">
              ${item.isUpdate ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      `;

      const dismissBtn = card.querySelector('.dismiss');
      if (dismissBtn) dismissBtn.addEventListener('click', (e) => dismissSuggestion(item.id, e.currentTarget));

      const editBtn = card.querySelector('.edit');
      if (editBtn) editBtn.addEventListener('click', () => openEditModal(item.id));

      const actionBtn = card.querySelector('.add, .update');
      if (actionBtn) actionBtn.addEventListener('click', (e) => addToCalendarDirect(item.id, e.currentTarget));
    }

    container.appendChild(card);
  });
}

function dismissSuggestion(id, btnElement) {
  const item = suggestions.find(s => s.id === id);
  if (!item) return;

  const card = btnElement ? btnElement.closest('.suggestion-card') : document.getElementById(`card-${id}`);

  if (card) {
    card.classList.add('dismissed-state');
    const cardActions = card.querySelector('.card-actions');
    if (cardActions) {
      cardActions.innerHTML = `
        <div class="card-dismissed-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea4335" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          <span>Event dismissed</span>
        </div>
      `;
    }

    showToast(`Dismissed "${item.title}"`);

    setTimeout(() => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.92)';
      setTimeout(() => {
        suggestions = suggestions.filter(s => s.id !== id);
        saveSuggestions();
        renderSuggestions();
      }, 300);
    }, 1000);
  }
}

function addToCalendarDirect(id, btnElement) {
  const item = suggestions.find(s => s.id === id);
  if (!item) return;

  const defaultCal = document.getElementById('default-calendar-select')?.value || userProfile.defaultCalendar;

  const payload = {
    id: item.id,
    title: item.title,
    startDate: item.startDate || item.date || '',
    startTime: item.startTime || '',
    endDate: item.endDate || item.startDate || item.date || '',
    endTime: item.endTime || '',
    location: item.location || '',
    targetCalendar: item.targetCalendar || defaultCal,
    notes: item.updateReason || item.notes || '',
    sourceUrl: item.sourceUrl || ''
  };

  showToast(`Creating event "${item.title}"...`);

  window.parent.postMessage({
    action: 'DIRECT_ADD_EVENT',
    eventData: payload
  }, '*');
}

function updateGreeting() {
  const greetingEl = document.getElementById('greeting-title');
  if (greetingEl) {
    greetingEl.textContent = userProfile.userName ? `Hello ${userProfile.userName}!` : 'Hello!';
  }
}

async function handleSaveApiKey() {
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeyError = document.getElementById('api-key-error');
  const saveBtn = document.getElementById('save-api-key-btn');

  if (!apiKeyInput) return;

  const rawKey = apiKeyInput.value.trim();

  if (!rawKey) {
    return;
  }

  if (apiKeyErrorTimeout) {
    clearTimeout(apiKeyErrorTimeout);
    apiKeyErrorTimeout = null;
  }

  if (saveBtn) {
    saveBtn.textContent = 'Verifying...';
    saveBtn.disabled = true;
  }

  if (apiKeyError) apiKeyError.classList.add('hidden');
  apiKeyInput.classList.remove('input-error');

  const isValid = await verifyApiKey(rawKey);

  if (saveBtn) {
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }

  if (isValid) {
    userProfile.apiKey = rawKey;
    saveUserProfile();
    updateChatVisibility();
    if (apiKeyError) apiKeyError.classList.add('hidden');
    showToast('API Key verified & saved!');
  } else {
    if (apiKeyError) {
      apiKeyError.textContent = 'Invalid API key. Please check your key in Google AI Studio.';
      apiKeyError.classList.remove('hidden');
    }
    apiKeyInput.classList.add('input-error');

    apiKeyErrorTimeout = setTimeout(() => {
      if (apiKeyError) apiKeyError.classList.add('hidden');
      apiKeyInput.classList.remove('input-error');
    }, 3500);
  }
}

function setupSettingsHandlers() {
  populateCalendarSelectOptions();

  const toggle24h = document.getElementById('toggle-24h-clock');
  if (toggle24h) {
    toggle24h.checked = is24HourClock;
    toggle24h.addEventListener('change', (e) => {
      is24HourClock = e.target.checked;
      localStorage.setItem('gsifter_24h_clock', is24HourClock ? 'true' : 'false');
      
      const startVal = getDigitTimeInputValue('start');
      const endVal = getDigitTimeInputValue('end');

      setDigitTimeInputs('start', startVal);
      setDigitTimeInputs('end', endVal);

      renderSuggestions();
    });
  }

  const nameInput = document.getElementById('user-name-input');
  if (nameInput) {
    nameInput.value = userProfile.userName || '';
    nameInput.addEventListener('input', (e) => {
      userProfile.userName = e.target.value.trim();
      saveUserProfile();
      updateGreeting();
    });
  }

  const apiKeyInput = document.getElementById('api-key-input');
  const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
  const eyeShow = document.getElementById('eye-icon-show');
  const eyeHide = document.getElementById('eye-icon-hide');
  const saveApiKeyBtn = document.getElementById('save-api-key-btn');

  if (apiKeyInput) {
    apiKeyInput.value = userProfile.apiKey || '';

    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveApiKey();
      }
    });
  }

  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
  }

  if (toggleApiKeyBtn && apiKeyInput) {
    toggleApiKeyBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        if (eyeShow) eyeShow.style.display = 'none';
        if (eyeHide) eyeHide.style.display = 'block';
      } else {
        apiKeyInput.type = 'password';
        if (eyeShow) eyeShow.style.display = 'block';
        if (eyeHide) eyeHide.style.display = 'none';
      }
    });
  }
}

function setupAddAccountModal() {
  const modal = document.getElementById('add-account-modal');
  const addBtn = document.getElementById('add-account-btn');
  const closeBtn = document.getElementById('close-add-acc-modal');
  const nextBtn = document.getElementById('acc-step1-next');

  if (!modal || !addBtn) return;

  function resetModal() {
    const accNameEl = document.getElementById('new-acc-name');
    if (accNameEl) accNameEl.value = '';
    const accEmailEl = document.getElementById('new-acc-email');
    if (accEmailEl) accEmailEl.value = '';

    const labelErr = document.getElementById('label-error');
    if (labelErr) labelErr.classList.add('hidden');
    const emailErr = document.getElementById('step1-error');
    if (emailErr) emailErr.classList.add('hidden');

    if (accNameEl) accNameEl.classList.remove('input-error');
    if (accEmailEl) accEmailEl.classList.remove('input-error');

    modal.classList.add('hidden');
  }

  addBtn.addEventListener('click', () => {
    resetModal();

    const isFirstTimeUser = localStorage.getItem('gsifter_has_onboarded') !== 'true';
    const modalGreetingGroup = document.getElementById('modal-greeting-name-group');

    if (modalGreetingGroup) {
      modalGreetingGroup.style.display = isFirstTimeUser ? 'block' : 'none';
    }

    const newUserNameInput = document.getElementById('new-user-name');
    if (newUserNameInput) newUserNameInput.value = userProfile.userName || '';
    
    modal.classList.remove('hidden');
  });

  if (closeBtn) closeBtn.addEventListener('click', resetModal);

  ['new-user-name', 'new-acc-name', 'new-acc-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (nextBtn) nextBtn.click();
        }
      });
    }
  });

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('new-user-name');
      const labelInput = document.getElementById('new-acc-name');
      const emailInput = document.getElementById('new-acc-email');
      
      const labelErr = document.getElementById('label-error');
      const emailErr = document.getElementById('step1-error');

      const userName = nameInput ? nameInput.value.trim() : '';
      const accName = labelInput ? labelInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';

      const isFirstTimeUser = localStorage.getItem('gsifter_has_onboarded') !== 'true';
      let isValid = true;

      if (!accName) {
        if (labelErr) labelErr.classList.add('hidden');
        if (labelInput) labelInput.classList.add('input-error');
        isValid = false;
      } else {
        if (labelErr) labelErr.classList.add('hidden');
        if (labelInput) labelInput.classList.remove('input-error');
      }

      if (!isValidEmail(email)) {
        if (emailErr) {
          emailErr.textContent = 'Please enter a valid email address.';
          emailErr.classList.remove('hidden');
        }
        if (emailInput) emailInput.classList.add('input-error');
        showToast('Please enter a valid email address.');
        isValid = false;
      } else {
        if (emailErr) emailErr.classList.add('hidden');
        if (emailInput) emailInput.classList.remove('input-error');
      }

      if (!isValid) return;

      if (userName && !userProfile.userName) {
        userProfile.userName = userName;
        saveUserProfile();
        const settingsNameInput = document.getElementById('user-name-input');
        if (settingsNameInput) settingsNameInput.value = userName;
        updateGreeting();
      }

      const newAccount = {
        id: `acc-${Date.now()}`,
        name: accName,
        email: email,
        enabled: true,
        justAdded: true
      };

      accounts.push(newAccount);
      saveAccounts();
      
      renderAccounts();
      resetModal();
      showToast(`Connected ${accName} account`);

      setTimeout(() => {
        newAccount.justAdded = false;
        saveAccounts();
        renderAccounts();
      }, 1500);

      if (isFirstTimeUser) {
        localStorage.setItem('gsifter_has_onboarded', 'true');
        
        if (localStorage.getItem('gsifter_tour_completed') !== 'true') {
          setTimeout(() => {
            showTourStep(0);
          }, 350);
        }
      }
    });
  }
}

function renderRules() {
  const container = document.getElementById('rules-container');
  if (!container) return;
  container.innerHTML = '';

  if (activeRules.length === 0) {
    container.innerHTML = `<span style="font-size:12px; color: var(--text-muted);">No active rules. Type instructions in chat below to add rules!</span>`;
    return;
  }

  activeRules.forEach((rule, index) => {
    const chip = document.createElement('div');
    chip.className = 'rule-chip';
    chip.innerHTML = `
      <span>${rule}</span>
      <button class="remove-rule-btn" data-index="${index}" title="Remove Rule">&times;</button>
    `;

    chip.querySelector('.remove-rule-btn').addEventListener('click', () => {
      activeRules.splice(index, 1);
      renderRules();
      showToast('Rule removed');
    });

    container.appendChild(chip);
  });
}

function setupChat() {
  updateGreeting();
  updateChatVisibility();

  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const historyContainer = document.getElementById('chat-history');

  async function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    const apiKey = userProfile.apiKey || localStorage.getItem('gsifter_api_key');
    if (!apiKey) {
      showToast('🔒 Add a valid Gemini API Key in Settings');
      updateChatVisibility();
      return;
    }

    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = text;
    historyContainer.appendChild(userBubble);

    chatInput.value = '';
    historyContainer.scrollTop = historyContainer.scrollHeight;

    const botBubble = document.createElement('div');
    botBubble.className = 'chat-bubble bot';
    botBubble.textContent = 'Thinking...';
    historyContainer.appendChild(botBubble);
    historyContainer.scrollTop = historyContainer.scrollHeight;

    const aiPrompt = `
You are gSifter, an empathetic, smart, and adaptive AI calendar collaborator.
User Name: "${userProfile.userName || 'User'}"
Current Year: 2026.
Current Active Filtering Rules: ${JSON.stringify(activeRules)}
Current Event Suggestions: ${JSON.stringify(suggestions.map(s => ({ id: s.id, title: s.title, startDate: s.startDate })))}

User Message: "${text}"

Instruction:
1. Respond naturally as a warm, supportive, and direct human collaborator.
2. Update the user's active filtering rules and dismiss any events if the user requests it.
3. Return a JSON object formatted as:
{
  "reply": "<your conversational human response>",
  "updatedRules": ["<array of current rules after applying user intent>"],
  "dismissedEventIds": ["<array of event IDs to dismiss if requested>"]
}
`;

    const aiResponseRaw = await callGeminiAI(aiPrompt, true);
    if (aiResponseRaw) {
      try {
        const parsed = JSON.parse(aiResponseRaw);
        botBubble.textContent = parsed.reply || `Got it! Updated your filtering preferences.`;
        if (Array.isArray(parsed.updatedRules)) {
          activeRules = parsed.updatedRules;
          renderRules();
        }
        if (Array.isArray(parsed.dismissedEventIds)) {
          parsed.dismissedEventIds.forEach(id => {
            suggestions = suggestions.filter(s => s.id !== id);
          });
          saveSuggestions();
          renderSuggestions();
        }
      } catch (e) {
        botBubble.textContent = aiResponseRaw.replace(/```json|```/g, '').trim();
      }
    } else {
      botBubble.textContent = `I've noted that instruction: "${text}".`;
      if (!activeRules.includes(text)) {
        activeRules.push(text);
        renderRules();
      }
    }
    historyContainer.scrollTop = historyContainer.scrollHeight;
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
}

function parseDateTimeValue(dateStr, timeStr) {
  if (!dateStr) return null;
  const timeVals = parseTimeToDigitValues(timeStr);
  let h = parseInt(timeVals.hour, 10);
  let m = parseInt(timeVals.minute, 10);
  if (timeVals.ampm === 'PM' && h < 12) h += 12;
  if (timeVals.ampm === 'AM' && h === 12) h = 0;
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

function setupModal() {
  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const saveBtn = document.getElementById('save-edit-btn');
  const modalError = document.getElementById('edit-modal-error');

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (modalError) modalError.classList.add('hidden');

      const id = document.getElementById('edit-event-id').value;
      const startDate = document.getElementById('edit-event-start-date').value;
      const endDate = document.getElementById('edit-event-end-date').value || startDate;
      
      const startTime = getDigitTimeInputValue('start');
      const endTime = getDigitTimeInputValue('end');

      const dStart = new Date(startDate + 'T00:00:00');
      const dEnd = new Date(endDate + 'T00:00:00');

      if (dEnd < dStart) {
        if (modalError) {
          modalError.textContent = 'End date cannot be before start date.';
          modalError.classList.remove('hidden');
        }
        showToast('Invalid date selection');
        return;
      }

      const startDt = parseDateTimeValue(startDate, startTime);
      const endDt = parseDateTimeValue(endDate, endTime);

      if (startDt && endDt && endDt <= startDt) {
        if (modalError) {
          modalError.textContent = 'End time must be after start time.';
          modalError.classList.remove('hidden');
        }
        showToast('Invalid time selection');
        return;
      }

      const item = suggestions.find(s => s.id === id);
      if (item) {
        item.title = document.getElementById('edit-event-title').value;
        item.startDate = startDate;
        item.endDate = endDate;
        item.targetCalendar = document.getElementById('edit-event-calendar')?.value || '';
        item.startTime = startTime;
        item.endTime = endTime;
        
        const locVal = document.getElementById('edit-event-location').value;
        item.location = locVal ? locVal.trim() : '';

        item.displayMonth = dStart.toLocaleString('default', { month: 'short' });

        if (item.startDate === item.endDate) {
          item.displayDay = dStart.getDate().toString();
        } else {
          item.displayDay = `${dStart.getDate()}-${dEnd.getDate()}`;
        }

        saveSuggestions();
        renderSuggestions();
        showToast('Event details saved');
      }
      modal.classList.add('hidden');
    });
  }
}

function openEditModal(id) {
  const item = suggestions.find(s => s.id === id);
  if (!item) return;

  const modalError = document.getElementById('edit-modal-error');
  if (modalError) modalError.classList.add('hidden');

  populateCalendarSelectOptions();

  document.getElementById('edit-event-id').value = item.id;
  document.getElementById('edit-event-title').value = item.title;
  document.getElementById('edit-event-start-date').value = item.startDate || item.date;
  document.getElementById('edit-event-end-date').value = item.endDate || item.startDate || item.date;
  if (document.getElementById('edit-event-calendar')) {
    document.getElementById('edit-event-calendar').value = item.targetCalendar || userProfile.defaultCalendar;
  }
  
  setDigitTimeInputs('start', item.startTime);
  setDigitTimeInputs('end', item.endTime);
  
  document.getElementById('edit-event-location').value = item.location || '';
  
  const notesField = document.getElementById('edit-event-notes');
  if (notesField) notesField.value = item.notes || item.updateReason || '';

  document.getElementById('edit-modal').classList.remove('hidden');
}

function showToast(msg) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function setupCloseButton() {
  const closeBtn = document.getElementById('close-sidebar-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.parent.postMessage({ action: 'CLOSE_GSIFTER_SIDEBAR' }, '*');
    });
  }
}