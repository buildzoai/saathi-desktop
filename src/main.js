// main.js — app lifecycle entry point. Wires window, tray, and auto-update
// together; everything else lives in its own small module.
const { app, ipcMain } = require("electron");
const { getPermissionStatuses, requestMicrophoneAccess, openPrivacySettings, isOwnOrigin } = require("./capture");
const { createMainWindow, showMainWindow } = require("./windowManager");
const { createTray } = require("./tray");
const { initUpdater, checkForUpdatesNow } = require("./updater");
const { showWidget, hideWidget, updateWidgetStatus } = require("./widgetWindow");

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
    const startHidden =
      process.argv.includes("--hidden") ||
      (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin);

    // Packaged builds only — in `npm start` this would register the bare
    // Electron binary as a login item.
    if (app.isPackaged) app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ["--hidden"],
      openAsHidden: true, // macOS equivalent of --hidden
    });

    createMainWindow({ startHidden });
    createTray({ onCheckForUpdates: checkForUpdatesNow });
    initUpdater();

    // Reported by the loaded portal-ui page (SaathiRecordingContext.tsx, via
    // preload.js's saathiDesktop.reportRecordingStatus) on every status/timer
    // tick — drives the floating "recording in progress" widget so it stays
    // accurate even while the main window is minimized/hidden to tray.
    // macOS onboarding helpers (preload.js: saathiDesktop.permissions /
    // requestMicrophoneAccess / openPrivacySettings). Only our own portal
    // origin may call them.
    const fromOwnPage = (event) => isOwnOrigin(event.senderFrame && event.senderFrame.url);
    ipcMain.handle("notes:permissions", (event) => (fromOwnPage(event) ? getPermissionStatuses() : null));
    ipcMain.handle("notes:request-microphone", (event) => (fromOwnPage(event) ? requestMicrophoneAccess() : false));
    ipcMain.handle("notes:open-privacy-settings", (event, kind) =>
      fromOwnPage(event) ? openPrivacySettings(kind) : false
    );

    ipcMain.on("recording-status", (_event, { status, elapsedMs }) => {
      if (status === "recording" || status === "paused") {
        showWidget(() => showMainWindow());
        updateWidgetStatus(status, elapsedMs);
      } else {
        hideWidget();
      }
    });
  });

  app.on("window-all-closed", () => {
    // Closing the window hides to tray / menu bar on every platform (see
    // windowManager.js), so this only fires on a real quit; no-op needed.
    // Deliberately NOT quitting here on macOS either — the app lives in the
    // menu bar like it lives in the Windows tray.
  });

  // macOS: clicking the Dock icon brings the hidden window back.
  app.on("activate", () => showMainWindow());

  // macOS: Cmd+Q / Dock "Quit" must really quit, not hide to the menu bar.
  app.on("before-quit", () => {
    app.isQuitting = true;
  });
}
