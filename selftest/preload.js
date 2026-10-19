const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("selftest", {
  report: (r) => ipcRenderer.send("selftest-result", r),
});
