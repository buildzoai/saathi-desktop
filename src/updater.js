// updater.js — electron-updater wiring against GitHub Releases (public
// repo: buildzoai/saathi-desktop). Client-side check/download needs no
// token since the release assets are public; publishing still needs a
// GH_TOKEN at build time (see package.json's "publish" script).
const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { setUpdateReady } = require("./tray");
const { getMainWindow } = require("./windowManager");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function initUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateReady(info.version);
    const win = getMainWindow();
    dialog
      .showMessageBox(win || undefined, {
        type: "info",
        buttons: ["Restart Now", "Later"],
        message: `Saathi Recorder ${info.version} is ready to install.`,
      })
      .then(({ response }) => {
        if (response === 0) {
          app.isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater]", err);
  });

  app.whenReady().then(() => {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
  });
}

function checkForUpdatesNow() {
  autoUpdater.checkForUpdates();
}

module.exports = { initUpdater, checkForUpdatesNow };
