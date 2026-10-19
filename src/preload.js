// preload.js — a minimal, explicit bridge from the loaded portal-ui page to
// the Electron shell. contextIsolation stays on; nodeIntegration stays off —
// the page can only call the exact members below, never reach into
// Node/Electron internals directly.
//
// This preload runs sandboxed, so it cannot require our own modules; the
// main process passes the system-audio capability in via additionalArguments.
const { contextBridge, ipcRenderer } = require("electron");

const systemAudio = process.argv.includes("--saathi-system-audio=1");

contextBridge.exposeInMainWorld("saathiDesktop", {
  // True when getDisplayMedia() in this app is answered without a picker
  // with system-audio loopback (the call audio). The Notes page reads this
  // to skip its "share a tab with audio" instructions.
  systemAudio,
  platform: process.platform,

  // Called by the recorders whenever status ("recording" | "paused" |
  // "stopped") or elapsed time changes, so the floating "recording in
  // progress" widget (widgetWindow.js) stays in sync even while the main
  // window is minimized or hidden to tray.
  reportRecordingStatus: (status, elapsedMs) => {
    ipcRenderer.send("recording-status", { status, elapsedMs });
  },

  // macOS onboarding: OS-level permission statuses
  // ({ platform, microphone, camera, screen, systemAudio }; values are
  // "granted" | "denied" | "restricted" | "not-determined" | "unknown").
  permissions: () => ipcRenderer.invoke("notes:permissions"),
  // Shows the macOS microphone prompt if not yet decided; resolves to a boolean.
  requestMicrophoneAccess: () => ipcRenderer.invoke("notes:request-microphone"),
  // kind: "microphone" | "camera" | "screen" | "systemAudio". Opens the
  // matching System Settings privacy pane (macOS only); resolves to a boolean.
  openPrivacySettings: (kind) => ipcRenderer.invoke("notes:open-privacy-settings", String(kind)),
});
