'use strict';

const DEFAULT_SUGGESTIONS = [
  "Go for a 10-minute walk outside 🚶",
  "Drink a full glass of water 💧",
  "Do 20 push-ups or jumping jacks 💪",
  "Read 10 pages of a book 📖",
  "Call a friend you haven't spoken to lately 📞",
  "Meditate for 5 minutes 🧘",
  "Stretch or do yoga for 10 minutes 🙆",
  "Write down 3 things you're grateful for 📝",
  "Cook or prepare a healthy snack 🥗",
  "Learn something on YouTube 🎓",
  "Work on a hobby for 15 minutes 🎨",
  "Take a 20-minute power nap 😴",
  "Tidy up your desk or room 🧹",
  "Step outside and take 10 deep breaths 🌿",
  "Do a quick 7-minute workout 🏃",
  "Practice a language you're learning 🌍",
  "Play an instrument for 15 minutes 🎸",
  "Water your plants 🌱",
  "Write in a journal ✍️",
  "Do a random act of kindness 💛",
];

// ── Elements ──
const toggle      = document.getElementById('toggle');
const suggArea    = document.getElementById('suggestions');
const btnSave     = document.getElementById('btn-save');
const btnReset    = document.getElementById('btn-reset');
const btnPreview  = document.getElementById('btn-preview');
const countEl     = document.getElementById('count');
const toast       = document.getElementById('toast');

// ── Toast helper ──
function showToast(msg, isErr = false) {
  toast.textContent = msg;
  toast.className   = isErr ? 'err' : '';
  setTimeout(() => { toast.textContent = ''; toast.className = ''; }, 2500);
}

// ── Load state ──
chrome.storage.sync.get(['suggestions', 'enabled'], result => {
  toggle.checked = result.enabled !== false;
  const list = result.suggestions && result.suggestions.length
    ? result.suggestions
    : DEFAULT_SUGGESTIONS;
  suggArea.value = list.join('\n');
});

chrome.storage.local.get(['showCount'], r => {
  countEl.textContent = r.showCount || 0;
});

// ── Toggle ──
toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

// ── Save ──
btnSave.addEventListener('click', () => {
  const lines = suggArea.value
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    showToast('Add at least one suggestion!', true);
    return;
  }

  chrome.storage.sync.set({ suggestions: lines }, () => {
    showToast('✓ Saved!');
  });
});

// ── Reset ──
btnReset.addEventListener('click', () => {
  suggArea.value = DEFAULT_SUGGESTIONS.join('\n');
  chrome.storage.sync.set({ suggestions: DEFAULT_SUGGESTIONS }, () => {
    showToast('✓ Reset to defaults');
  });
});

// ── Preview ──
btnPreview.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) { showToast('No active tab found', true); return; }

    const url = tabs[0].url || '';
    const onTarget = url.includes('facebook.com') || url.includes('instagram.com');

    if (!onTarget) {
      showToast('Open Facebook or Instagram first!', true);
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'preview' }, response => {
      if (chrome.runtime.lastError) {
        showToast('Could not reach page — try refreshing it', true);
      } else {
        showToast('✓ Preview injected!');
        window.close();
      }
    });
  });
});
