// Minimal typed-ish bridge for the spike; the product uses a zod contract (Faz 1).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("proto", {
  info: () => ipcRenderer.invoke("proto:info"),
  report: (data) => ipcRenderer.invoke("proto:report", data),
});
