// windowManager.js — creates the single BrowserWindow that hosts the real
// portal-ui pages (MyGenie Notes by default, Record Meeting from the tray). This is a thin native shell: no renderer
// code of ours runs inside the window, only Electron-side wiring around it
// (permissions, navigation lock-down, close-to-tray).
const { BrowserWindow, session, shell, app } = require("electron");
const path = require("path");
const { getRecordMeetingUrl, getNotesUrl, RECORD_MEETING_PATH } = require("./config");
const { installCaptureHandlers, supportsSystemAudio, isOwnOrigin } = require("./capture");

const SESSION_PARTITION = "persist:saathi-desktop";

let mainWindow = null;

// Same-environment check shared with capture.js (includes old hostnames
// that redirect to the canonical one, e.g. data.mygenieprojects.com).
const isAllowedOrigin = isOwnOrigin;

function createMainWindow({ startHidden } = {}) {
  const ses = session.fromPartition(SESSION_PARTITION);

  // getUserMedia, getDisplayMedia and Notification are all denied by
  // default in Electron (unlike a real browser, which prompts) — capture.js
  // grants them for our own portal origin only, and answers getDisplayMedia
  // with system-audio loopback instead of a picker.
  installCaptureHandlers(ses);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    // Windows uses the exe's embedded icon; macOS uses the bundle icon.
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep the hardened background upload-retry queue running at full
      // speed even while the window is hidden in the tray.
      backgroundThrottling: false,
      additionalArguments: supportsSystemAudio() ? ["--saathi-system-audio=1"] : [],
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

  mainWindow.loadURL(getNotesUrl());

  return mainWindow;
}

function openPage(url) {
  if (!mainWindow) return;
  mainWindow.loadURL(url);
  showMainWindow();
}

function openNotes() {
  openPage(getNotesUrl());
}

function openRecordMeeting() {
  openPage(getRecordMeetingUrl());
}

function getMainWindow() {
  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

module.exports = { createMainWindow, getMainWindow, showMainWindow, openNotes, openRecordMeeting };
