'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function on(channel) {
  return (cb) => {
    const fn = (e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

contextBridge.exposeInMainWorld('pixelpaw', {
  // shared
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  onSettings: on('settings'),
  appInfo: () => ipcRenderer.invoke('app:info'),

  // cat renderer
  onTick: on('tick'),
  onKey: on('input:key'),
  onScroll: on('input:scroll'),
  onAgents: on('agents'),
  onAgentDone: on('agent-done'),
  onAgentAlert: on('agent-alert'),
  onAsk: on('ask'),
  onAskClear: on('ask-clear'),
  onAskResult: on('ask-result'),
  askAnswer: (qid, index) => ipcRenderer.send('ask:answer', { qid, index }),
  askOpen: (qid) => ipcRenderer.send('ask:open', { qid }),
  askDismiss: (qid) => ipcRenderer.send('ask:dismiss', { qid }),
  askTest: () => ipcRenderer.send('ask:test'),
  ledClick: () => ipcRenderer.send('led:click'),
  onMenuToggle: on('menu:toggle'),
  onInbox: on('inbox'),
  getInbox: () => ipcRenderer.invoke('inbox:get'),
  inboxClear: () => ipcRenderer.send('inbox:clear'),
  onBond: on('bond'),
  onRitual: on('ritual'),
  onGift: on('gift'),
  getBond: () => ipcRenderer.invoke('bond:get'),
  bondEvent: (type) => ipcRenderer.send('bond:event', { type }),
  menuAction: (act) => ipcRenderer.send('menu:action', act),
  tasksToggle: (id) => ipcRenderer.send('tasks:toggle', { id }),
  tasksClearDone: () => ipcRenderer.send('tasks:clear-done'),
  tasksAdd: (text) => ipcRenderer.send('tasks:add', { text }),
  tasksSnooze: (id) => ipcRenderer.send('tasks:snooze', { id }),
  setFocusable: (v) => ipcRenderer.send('win:focusable', v),
  onPom: on('pom'),
  onPomPhase: on('pom:phase'),
  onRemind: on('remind'),
  onStretchNow: on('stretch-now'),
  onHunt: on('hunt'),
  onDrag: on('drag'),
  setInteractive: (v) => ipcRenderer.send('cat:set-interactive', v),
  dragStart: (ox, oy) => ipcRenderer.send('cat:drag-start', { ox, oy }),
  dragEnd: () => ipcRenderer.send('cat:drag-end'),
  contextMenu: () => ipcRenderer.send('cat:context-menu'),
  pomControl: (action) => ipcRenderer.send('pom:control', action),
  openSettings: () => ipcRenderer.send('open-settings'),

  // settings window
  onAgentPort: on('agent:port'),
  requestAccessibility: () => ipcRenderer.invoke('perm:request-accessibility'),
  hooksStatus: () => ipcRenderer.invoke('hooks:status'),
  hooksInstall: () => ipcRenderer.invoke('hooks:install'),
  hooksUninstall: () => ipcRenderer.invoke('hooks:uninstall'),
  hooksSnippet: () => ipcRenderer.invoke('hooks:snippet'),
  codexStatus: () => ipcRenderer.invoke('codex:status'),
  codexInstall: () => ipcRenderer.invoke('codex:install'),
  codexUninstall: () => ipcRenderer.invoke('codex:uninstall'),
});
