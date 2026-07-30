// preload.js — a minimal, explicit bridge from the loaded portal-ui page to
// the Electron shell. contextIsolation stays on; nodeIntegration stays off —
// the page can only call the exact function below, never reach into
// Node/Electron internals directly.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("saathiDesktop", {
  // Called by SaathiRecordingContext.tsx whenever recording status/elapsed
  // time changes, so the floating "recording in progress" widget window
  // (widgetWindow.js) can stay in sync even while the main window is
  // minimized or hidden to tray.
  reportRecordingStatus: (status, elapsedMs) => {
    ipcRenderer.send("recording-status", { status, elapsedMs });
  },
});
