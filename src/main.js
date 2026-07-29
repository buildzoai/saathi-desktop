// main.js — app lifecycle entry point. Wires window, tray, and auto-update
// together; everything else lives in its own small module.
const { app } = require("electron");
const { createMainWindow, showMainWindow } = require("./windowManager");
const { createTray } = require("./tray");
const { initUpdater, checkForUpdatesNow } = require("./updater");

app.isQuitting = false;

// Only one instance/tray icon at a time — a second launch (e.g. from the
// Start Menu while already running) just focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    const startHidden = process.argv.includes("--hidden");

    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ["--hidden"],
    });

    createMainWindow({ startHidden });
    createTray({ onCheckForUpdates: checkForUpdatesNow });
    initUpdater();
  });

  app.on("window-all-closed", () => {
    // Windows-only app for now — closing the window hides to tray (see
    // windowManager.js), so this only fires on a real quit; no-op needed.
  });
}
