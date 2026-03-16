'use strict';

// ============================================================
// SUGGESTIONS  —  built-in list + chrome.storage loader
// ============================================================
(function () {
  const DSS = window.DSS;

  const BUILT_IN_SUGGESTIONS = [
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

  async function loadJsonSuggestions() {
    try {
      const url  = chrome.runtime.getURL('suggestions.json');
      const res  = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    } catch { /* fall through */ }
    return BUILT_IN_SUGGESTIONS;
  }

  DSS.getSuggestions = async function () {
    try {
      const result = await new Promise(resolve =>
        chrome.storage.sync.get(['suggestions', 'enabled'], resolve)
      );
      return {
        suggestions: result.suggestions && result.suggestions.length
          ? result.suggestions
          : await loadJsonSuggestions(),
        enabled: result.enabled !== false,
      };
    } catch {
      return { suggestions: BUILT_IN_SUGGESTIONS, enabled: true };
    }
  };

  DSS.pickRandom = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };
})();
