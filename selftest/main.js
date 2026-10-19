// selftest/main.js — `npm run selftest`. Proves the picker-free call-audio
// path end to end on this machine: serves a tiny page from 127.0.0.1, wires
// the SAME handlers the app uses (src/capture.js) for that origin, has the
// page call getDisplayMedia({ video: true, audio: true }) exactly like the
// Notes recorder, plays a short quiet tone, and measures whether the
// loopback audio track carries signal. Prints one JSON line and exits
// 0 = audio track with signal, 1 = no audio track / error, 2 = audio track
// but silent (on macOS usually: system-audio permission not granted, or the
// responsible process — e.g. your terminal — lacks NSAudioCaptureUsageDescription).
const { app, BrowserWindow, session, ipcMain } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { installCaptureHandlers, supportsSystemAudio, getPermissionStatuses } = require("../src/capture");

const PAGE = fs.readFileSync(path.join(__dirname, "page.html"));
const TIMEOUT_MS = 20000;

function finish(code, result) {
  console.log("SELFTEST " + JSON.stringify(result));
  app.exit(code);
}

app.whenReady().then(() => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  server.listen(0, "127.0.0.1", () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const ses = session.fromPartition("selftest");
    installCaptureHandlers(ses, (url) => {
      try {
        return new URL(url).origin === origin;
      } catch {
        return false;
      }
    });

    const base = {
      electron: process.versions.electron,
      platform: process.platform,
      osVersion: process.getSystemVersion(),
      systemAudioSupported: supportsSystemAudio(),
      osPermissions: getPermissionStatuses(),
    };
    const timer = setTimeout(() => finish(1, { ...base, error: "timeout" }), TIMEOUT_MS);

    ipcMain.once("selftest-result", (_e, r) => {
      clearTimeout(timer);
      const code = !r.audioTracks ? 1 : r.peak > 0.001 ? 0 : 2;
      finish(code, { ...base, ...r, verdict: ["PASS", "FAIL", "SILENT"][code] });
    });

    const win = new BrowserWindow({
      width: 400,
      height: 200,
      show: false,
      webPreferences: {
        session: ses,
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.loadURL(origin);
  });
});
