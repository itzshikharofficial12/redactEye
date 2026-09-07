export default defineBackground(() => {
  // Configure the side panel to open automatically when the user clicks the extension icon in the toolbar
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[RedactEye] Failed to set side panel behavior:', err);
    });
  }
});
