// tray.js — the app's entire "settings UI": a native tray icon + context
// menu. Deliberately no renderer settings screen for v1.
const { Tray, Menu, app, nativeImage } = require("electron");
const path = require("path");
const { getEnv, setEnv } = require("./config");
const { showMainWindow } = require("./windowManager");

let tray = null;
let updateReadyInfo = null; // { version } once electron-updater has a build ready
let checkForUpdatesNow = () => {};

function switchEnv(env) {
  if (getEnv() === env) return;
  setEnv(env);
  // Simplest correct way to reload the whole window against the new
  // origin — a fresh persistent session partition stays the same, only
  // the loaded URL's origin changes.
  app.relaunch();
  app.exit();
}

function buildMenuTemplate() {
  const env = getEnv();
  const template = [
    { label: "Show / Record a Meeting", click: () => showMainWindow() },
    { type: "separator" },
    { label: "Check for Updates Now", click: () => checkForUpdatesNow() },
    {
      label: "Environment",
      submenu: [
        { label: "Production", type: "radio", checked: env === "prod", click: () => switchEnv("prod") },
        { label: "Development", type: "radio", checked: env === "dev", click: () => switchEnv("dev") },
        { label: "Local (localhost:8080)", type: "radio", checked: env === "local", click: () => switchEnv("local") },
      ],
    },
  ];

  if (updateReadyInfo) {
    template.push({ type: "separator" });
    template.push({
      label: `Restart to Install Update (v${updateReadyInfo.version})`,
      click: () => {
        app.isQuitting = true;
        // Actual install is triggered from updater.js's own handler, which
        // owns the autoUpdater instance — quitting here is enough to let
        // autoInstallOnAppQuit take over if the user didn't use the dialog.
        app.quit();
      },
    });
  }

  template.push({ type: "separator" });
  template.push({
    label: "Quit",
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  return template;
}

function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function createTray({ onCheckForUpdates } = {}) {
  if (onCheckForUpdates) checkForUpdatesNow = onCheckForUpdates;
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.ico"));
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`Saathi Recorder v${app.getVersion()}`);
  tray.on("click", () => showMainWindow());
  rebuildTray();
  return tray;
}

function setUpdateReady(version) {
  updateReadyInfo = { version };
  rebuildTray();
}

module.exports = { createTray, setUpdateReady, rebuildTray };
