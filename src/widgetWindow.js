// widgetWindow.js — a small always-on-top "recording in progress" widget,
// independent of the main window. Visible whenever a recording is active
// (recording or paused) even if the main window is minimized or hidden to
// tray — that's the whole point: a persistent reminder a call is still being
// captured. Position is user-draggable and persisted across launches.
const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");
const { getWidgetPosition, setWidgetPosition } = require("./config");

const WIDTH = 150;
const HEIGHT = 56;

let widgetWindow = null;
let moveSaveTimer = null;
let dragOrigin = null; // widget window's position captured at drag-start

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIDTH - 24,
    y: workArea.y + workArea.height - HEIGHT - 24,
  };
}

function createWidgetWindow(onClicked) {
  const pos = getWidgetPosition() || defaultPosition();

  widgetWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    transparent: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "widgetPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // "screen-saver" level keeps it above other always-on-top windows too
  // (e.g. video call apps), matching the "everytime visible" requirement.
  widgetWindow.setAlwaysOnTop(true, "screen-saver");
  widgetWindow.loadFile(path.join(__dirname, "widget", "widget.html"));

  widgetWindow.on("moved", () => {
    if (!widgetWindow) return;
    const [x, y] = widgetWindow.getPosition();
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => setWidgetPosition({ x, y }), 400);
  });

  widgetWindow.on("closed", () => {
    widgetWindow = null;
  });

  // Re-registered on every create so the callback always closes over the
  // latest onClicked (e.g. after a main-window recreate) rather than a stale
  // one from a previous widget instance.
  ipcMain.removeAllListeners("widget-clicked");
  ipcMain.on("widget-clicked", () => onClicked());

  // Manual drag protocol (see widget/widget.html for why) — the renderer
  // tracks the mouse gesture and reports deltas; we own the actual
  // repositioning here. The existing "moved" listener above still fires on
  // every setPosition() call below, so it keeps handling the debounced
  // position save with no separate logic needed for drag-end.
  ipcMain.removeAllListeners("widget-drag-start");
  ipcMain.removeAllListeners("widget-drag-move");
  ipcMain.removeAllListeners("widget-drag-end");
  ipcMain.on("widget-drag-start", () => {
    if (!widgetWindow) return;
    const [x, y] = widgetWindow.getPosition();
    dragOrigin = { x, y };
  });
  ipcMain.on("widget-drag-move", (_event, { dx, dy }) => {
    if (!widgetWindow || !dragOrigin) return;
    widgetWindow.setPosition(dragOrigin.x + dx, dragOrigin.y + dy);
  });
  ipcMain.on("widget-drag-end", () => {
    dragOrigin = null;
  });

  return widgetWindow;
}

function showWidget(onClicked) {
  if (!widgetWindow) createWidgetWindow(onClicked);
  widgetWindow.showInactive(); // stays on top without stealing focus from the main window
}

function hideWidget() {
  if (widgetWindow) widgetWindow.hide();
}

function updateWidgetStatus(status, elapsedMs) {
  if (widgetWindow) widgetWindow.webContents.send("status-update", { status, elapsedMs });
}

module.exports = { showWidget, hideWidget, updateWidgetStatus };
