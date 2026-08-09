"use strict";

/**
 * Deskly for macOS — the window shell.
 *
 * Everything with real logic lives in `server.js` next door so it can be tested
 * under plain Node. This file does three things: start the backend, show a
 * window pointed at it, and make sure both children die when the app quits.
 */

const { app, BrowserWindow, Menu, dialog, shell, nativeTheme } = require("electron");
const path = require("node:path");
const { startBackend } = require("./server");

/** Set once the backend is up; used by the reload handler and the menu. */
let backend = null;
let mainWindow = null;

// A single instance owns the database and the port. A second launch should
// surface the window that already exists rather than fight it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Deskly",
    // Traffic lights over the app's own header, which is what the inbox
    // layout is built for.
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#12151c" : "#fbfbfd",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.loadURL(`${url}/inbox`);

  // Anything not on our own origin belongs in the user's browser — a support
  // agent clicking a customer's link must not navigate the app away.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      void shell.openExternal(target);
    }
  });

  return window;
}

function buildMenu(url) {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Ticket",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.loadURL(`${url}/inbox?new=1`),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Inbox",
          accelerator: "CmdOrCtrl+1",
          click: () => mainWindow?.loadURL(`${url}/inbox`),
        },
        {
          label: "Reports",
          accelerator: "CmdOrCtrl+2",
          click: () => mainWindow?.loadURL(`${url}/reports`),
        },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow?.loadURL(`${url}/settings`),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Open in Browser",
          click: () => void shell.openExternal(url),
        },
        {
          label: "Show Sent Mail Folder",
          click: () => void shell.openPath(path.join(process.cwd(), "storage", "outbox")),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    backend = await startBackend({
      appRoot: app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."),
    });
  } catch (err) {
    dialog.showErrorBox(
      "Deskly could not start",
      `${err instanceof Error ? err.message : String(err)}\n\n` +
        "Check that PostgreSQL is running (`brew services start postgresql@16`) " +
        "and that DATABASE_URL in .env is correct.",
    );
    app.quit();
    return;
  }

  buildMenu(backend.url);
  mainWindow = createWindow(backend.url);

  app.on("activate", () => {
    // macOS: clicking the dock icon with no windows open reopens one.
    if (BrowserWindow.getAllWindows().length === 0 && backend) {
      mainWindow = createWindow(backend.url);
    }
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// On macOS apps usually stay alive with no windows, but this one owns two
// child processes — staying resident just to hold them open helps nobody.
app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => backend?.stop());
process.on("exit", () => backend?.stop());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    backend?.stop();
    app.quit();
  });
}
