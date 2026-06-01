// background.js - service worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ soundsEnabled: true, inRoom: false });
});

// Relay messages between popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // If message is from content script, relay to popup
  if (sender.tab) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});
