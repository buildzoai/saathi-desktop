// windowManager.js — creates the single BrowserWindow that hosts the real
// portal-ui Record Meeting page. This is a thin native shell: no renderer
// code of ours runs inside the window, only Electron-side wiring around it
// (permissions, navigation lock-down, close-to-tray).
const { BrowserWindow, session, shell, app } = require("electron");
const path = require("path");
const { getBaseUrl, getRecordMeetingUrl, RECORD_MEETING_PATH } = require("./config");

const SESSION_PARTITION = "persist:saathi-desktop";

let mainWindow = null;

function isAllowedOrigin(url) {
  try {
    return new URL(url).origin === new URL(getBaseUrl()).origin;
  } catch {
    return false;
  }
}

function createMainWindow({ startHidden } = {}) {
  const ses = session.fromPartition(SESSION_PARTITION);

  // getUserMedia is denied by default in Electron (unlike a real browser,
  // which prompts) — without these handlers, recording fails silently.
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "media");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep the hardened background upload-retry queue running at full
      // speed even while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });

  // Navigation lock-down: same-origin navigation must be allowed through —
  // portal-ui's 401 handler does a hard `window.location.href = "/login"`,
  // a real top-level navigation, not client-side routing. Anything
  // off-origin (external links) opens in the system browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedOrigin(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // portal-ui's post-login redirect only preserves the pathname, dropping
  // ?kiosk=1 — re-append it the moment the SPA (React Router pushState)
  // lands back on the record-meeting route without it.
  mainWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    try {
      const u = new URL(url);
      if (u.pathname === RECORD_MEETING_PATH && u.searchParams.get("kiosk") !== "1") {
        u.searchParams.set("kiosk", "1");
        mainWindow.loadURL(u.toString());
      }
    } catch {
      /* ignore malformed in-page URLs */
    }
  });

  // Close hides to tray instead of quitting, so an in-progress recording or
  // background upload survives an accidental close click. Only the tray's
  // Quit item (which sets app.isQuitting) actually exits.
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(getRecordMeetingUrl());

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

module.exports = { createMainWindow, getMainWindow, showMainWindow };
