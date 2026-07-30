// widgetPreload.js — separate, minimal preload for the floating widget
// window's static local page (widget/widget.html). Distinct from the main
// window's preload.js since this window shows different content and needs
// a different, smaller API surface.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widgetBridge", {
  onStatusUpdate: (callback) => {
    ipcRenderer.on("status-update", (_event, payload) => callback(payload));
  },
  notifyClicked: () => ipcRenderer.send("widget-clicked"),
  // Manual drag protocol (see widget.html) — the renderer tracks the mouse
  // gesture and sends deltas; main.js's widgetWindow module owns the actual
  // window repositioning and position persistence.
  dragStart: () => ipcRenderer.send("widget-drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("widget-drag-move", { dx, dy }),
  dragEnd: () => ipcRenderer.send("widget-drag-end"),
});
