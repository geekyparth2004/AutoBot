# Amdocs Training Bot Chrome Extension

This extension automates the Amdocs training course UI by identifying the next unwatched video, clicking it, playing the video, and repeating until course progress reaches 100%.

## Files
- `manifest.json` - Chrome extension manifest.
- `content.js` - Core automation logic injected into the page.
- `popup.html` - Simple UI to start/stop automation.
- `popup.js` - Popup messaging and control logic.

## Installation
1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder: `Amdocs Training Bot Extension`.
5. Open the Amdocs course page.
6. Click the extension toolbar button and press **Start Automation**.

## Notes
- If the page structure differs, update selectors in `content.js` inside the `config` object.
- The extension assumes the course page uses clickable lesson items and a video element.
- Use the popup button to stop automation anytime.
