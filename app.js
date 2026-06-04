const STORAGE_KEY = "march.tasks.v1";
const NOTE_KEY = "march.note.v1";
const MODE_KEY = "march.mode.v1";
const COLUMNS_KEY = "march.columns.v1";
const THEME_KEY = "march.theme.v1";

const columnDefinitions = [
  { id: "new", label: "New" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" }
];

const themes = ["warm", "calm", "dusk"];

const elements = {
  tabs: document.querySelectorAll("[data-view]"),
  views: {
    tasks: document.querySelector("#tasksView"),
    note: document.querySelector("#noteView"),
    settings: document.querySelector("#settingsView")
  },
  modeButtons: document.querySelectorAll("[data-mode]"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  kanbanBoard: document.querySelector("#kanbanBoard"),
  clearDoneButton: document.querySelector("#clearDoneButton"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  deleteAllButton: document.querySelector("#deleteAllButton"),
  importFile: document.querySelector("#importFile"),
  themeButtons: document.querySelectorAll("[data-theme]"),
  columnSettings: document.querySelector("#columnSettings"),
  columnInputs: document.querySelector("#columnInputs"),
  noteInput: document.querySelector("#noteInput")
};

let states = loadStates();
let theme = themes.includes(localStorage.getItem(THEME_KEY))
  ? localStorage.getItem(THEME_KEY)
  : "warm";
let tasks = loadTasks();
let mode = ["list", "kanban"].includes(localStorage.getItem(MODE_KEY))
  ? localStorage.getItem(MODE_KEY)
  : "list";
let draggedTaskId = null;
let pendingHandleFocusId = null;

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((task) => ({ ...task, state: coerceStateId(task.state) }))
      : [];
  } catch {
    return [];
  }
}

function loadColumnLabels() {
  try {
    const labels = JSON.parse(localStorage.getItem(COLUMNS_KEY) || "{}");
    return labels && typeof labels === "object" ? labels : {};
  } catch {
    return {};
  }
}

function statesFromLabels(labels) {
  return columnDefinitions.map((state) => ({
      ...state,
      label: typeof labels[state.id] === "string" && labels[state.id].trim()
        ? labels[state.id].trim().slice(0, 24)
        : state.label
    }));
}

function loadStates() {
  return statesFromLabels(loadColumnLabels());
}

function saveStates() {
  const labels = {
    ...loadColumnLabels(),
    ...Object.fromEntries(states.map((state) => [state.id, state.label]))
  };
  localStorage.setItem(COLUMNS_KEY, JSON.stringify(labels));
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dusk" ? "#262721" : theme === "calm" ? "#dde6d5" : "#efe2c3"
  );
}

function saveTheme(nextTheme) {
  if (!themes.includes(nextTheme)) return;

  theme = nextTheme;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
  renderThemeSettings();
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function saveNote(value) {
  localStorage.setItem(NOTE_KEY, value);
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveMode(nextMode) {
  mode = nextMode;
  localStorage.setItem(MODE_KEY, mode);
  render();
}

function currentState(task) {
  return states.find((state) => state.id === coerceStateId(task.state)) || states[0];
}

function stateIndex(task) {
  return Math.max(0, states.findIndex((state) => state.id === coerceStateId(task.state)));
}

function coerceStateId(stateId, activeStates = states) {
  if (activeStates.some((state) => state.id === stateId)) {
    return stateId;
  }

  const fullIndex = columnDefinitions.findIndex((state) => state.id === stateId);
  if (fullIndex < 0) return activeStates[0].id;

  const nearestIndex = Math.min(fullIndex, activeStates.length - 1);
  return activeStates[nearestIndex].id;
}

function moveTask(id, direction) {
  tasks = tasks.map((task) => {
    if (task.id !== id) return task;
    const nextIndex = Math.min(states.length - 1, Math.max(0, stateIndex(task) + direction));
    return { ...task, state: states[nextIndex].id, updatedAt: Date.now() };
  });
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function updateTaskTitle(id, title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    return tasks.find((task) => task.id === id)?.title || "";
  }

  tasks = tasks.map((task) => (
    task.id === id ? { ...task, title: cleanTitle, updatedAt: Date.now() } : task
  ));
  saveTasks();
  return cleanTitle;
}

function setTaskState(id, stateId) {
  if (!states.some((state) => state.id === stateId)) return;

  tasks = tasks.map((task) => (
    task.id === id ? { ...task, state: stateId, updatedAt: Date.now() } : task
  ));
  saveTasks();
  render();
}

function moveTaskToIndex(id, nextIndex) {
  const boundedIndex = Math.min(states.length - 1, Math.max(0, nextIndex));
  const nextState = states[boundedIndex];
  if (!nextState) return;
  pendingHandleFocusId = id;
  setTaskState(id, nextState.id);
}

function clearDoneTasks() {
  const doneCount = tasks.filter((task) => coerceStateId(task.state) === "done").length;
  if (!doneCount) return;

  tasks = tasks.filter((task) => coerceStateId(task.state) !== "done");
  saveTasks();
  render();
}

function backupFileName() {
  return `march-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

function exportBackup() {
  const backup = {
    app: "March",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    note: localStorage.getItem(NOTE_KEY) || "",
    mode,
    columns: {
      ...loadColumnLabels(),
      ...Object.fromEntries(states.map((state) => [state.id, state.label]))
    },
    theme
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName();
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function normalizeTasks(value, activeStates = states) {
  if (!Array.isArray(value)) {
    throw new Error("Backup does not contain a tasks array.");
  }

  return value
    .map((task) => {
      const title = typeof task.title === "string" ? task.title.trim() : "";
      if (!title) return null;

      const state = coerceStateId(task.state, activeStates);
      const createdAt = Number.isFinite(task.createdAt) ? task.createdAt : Date.now();
      const updatedAt = Number.isFinite(task.updatedAt) ? task.updatedAt : createdAt;

      return {
        id: typeof task.id === "string" && task.id ? task.id : createId(),
        title: title.slice(0, 120),
        state,
        createdAt,
        updatedAt
      };
    })
    .filter(Boolean);
}

function importBackup(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const backup = JSON.parse(String(reader.result || "{}"));
      const nextNote = typeof backup.note === "string" ? backup.note : "";
      const nextMode = ["list", "kanban"].includes(backup.mode) ? backup.mode : "list";
      const nextTheme = themes.includes(backup.theme) ? backup.theme : "warm";
      const nextStates = statesFromLabels(backup.columns || {});
      const nextTasks = normalizeTasks(backup.tasks, nextStates);

      if (!window.confirm("Import this backup and replace the current local data?")) {
        return;
      }

      tasks = nextTasks;
      mode = nextMode;
      theme = nextTheme;
      states = nextStates;
      elements.noteInput.value = nextNote;

      saveTasks();
      saveNote(nextNote);
      saveStates();
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(THEME_KEY, theme);
      applyTheme();
      renderColumnSettings();
      renderThemeSettings();
      render();
    } catch (error) {
      window.alert(error.message || "This backup could not be imported.");
    } finally {
      elements.importFile.value = "";
    }
  });

  reader.readAsText(file);
}

function deleteAllData() {
  if (!window.confirm("Delete all local tasks, note, and settings?")) {
    return;
  }

  tasks = [];
  mode = "list";
  draggedTaskId = null;
  elements.taskInput.value = "";
  elements.noteInput.value = "";

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(NOTE_KEY);
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(COLUMNS_KEY);
  localStorage.removeItem(THEME_KEY);
  states = loadStates();
  theme = "warm";
  applyTheme();
  renderColumnSettings();
  renderThemeSettings();
  render();
}

function startDragging(card, task, event) {
    draggedTaskId = task.id;
    card.classList.add("is-dragging");
    elements.kanbanBoard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }

function stopDragging() {
    draggedTaskId = null;
    elements.kanbanBoard.classList.remove("is-dragging");
    document.querySelectorAll(".is-drop-target, .is-dragging").forEach((element) => {
      element.classList.remove("is-drop-target", "is-dragging");
    });
}

function addDragHandleHandlers(handle, card, task) {
  handle.addEventListener("dragstart", (event) => startDragging(card, task, event));
  handle.addEventListener("dragend", stopDragging);

  handle.addEventListener("keydown", (event) => {
    const index = stateIndex(task);

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTaskToIndex(task.id, index - 1);
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTaskToIndex(task.id, index + 1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveTaskToIndex(task.id, 0);
    }

    if (event.key === "End") {
      event.preventDefault();
      moveTaskToIndex(task.id, states.length - 1);
    }
  });
}

function addDropHandlers(column, stateId) {
  column.addEventListener("dragover", (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    column.classList.add("is-drop-target");
  });

  column.addEventListener("dragleave", (event) => {
    if (!column.contains(event.relatedTarget)) {
      column.classList.remove("is-drop-target");
    }
  });

  column.addEventListener("drop", (event) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    column.classList.remove("is-drop-target");
    stopDragging();
    setTaskState(taskId, stateId);
  });
}

function createIconButton(label, text, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${className}`.trim();
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function createTitleInput(task) {
  const input = document.createElement("input");
  input.className = "task-title-field";
  input.type = "text";
  input.draggable = false;
  input.value = task.title;
  input.dataset.state = currentState(task).id;
  input.maxLength = 120;
  input.setAttribute("aria-label", "Task title");
  input.addEventListener("dragstart", (event) => event.preventDefault());
  input.addEventListener("change", () => {
    input.value = updateTaskTitle(task.id, input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  return input;
}

function createTaskMain(task) {
  const main = document.createElement("div");
  main.className = "task-main";

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.dataset.status = currentState(task).id;

  const stateLabel = document.createElement("span");
  stateLabel.textContent = currentState(task).label;

  meta.append(dot, stateLabel);
  main.append(createTitleInput(task), meta);

  return main;
}

function createTaskActions(task) {
  const actions = document.createElement("div");
  actions.className = "task-actions";

  const back = createIconButton("Move back", "←", () => moveTask(task.id, -1));
  back.disabled = stateIndex(task) === 0;

  const forward = createIconButton("Move forward", "→", () => moveTask(task.id, 1));
  forward.disabled = stateIndex(task) === states.length - 1;

  const remove = createIconButton("Delete task", "×", () => deleteTask(task.id), "delete");

  actions.append(back, forward, remove);
  return actions;
}

function createDragHandle(card, task) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.draggable = true;
  handle.textContent = "⋮⋮";
  handle.title = "Drag task or use arrow keys";
  handle.setAttribute("aria-label", "Move task between columns");
  addDragHandleHandlers(handle, card, task);

  if (pendingHandleFocusId === task.id) {
    window.setTimeout(() => handle.focus(), 0);
    pendingHandleFocusId = null;
  }

  return handle;
}

function createTaskItem(task) {
  const item = document.createElement("article");
  item.className = "task-item";
  item.dataset.taskId = task.id;
  item.dataset.state = currentState(task).id;
  item.append(createTaskMain(task), createTaskActions(task));

  return item;
}

function createKanbanCard(task) {
  const card = document.createElement("article");
  card.className = "kanban-card";
  card.dataset.taskId = task.id;
  card.dataset.state = currentState(task).id;

  const header = document.createElement("div");
  header.className = "kanban-card-head";
  header.append(createDragHandle(card, task), createTaskActions(task));

  card.append(header, createTitleInput(task));
  return card;
}

function renderList() {
  elements.taskList.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    elements.taskList.append(empty);
    return;
  }

  tasks
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((task) => elements.taskList.append(createTaskItem(task)));
}

function renderKanban() {
  elements.kanbanBoard.replaceChildren();

  states.forEach((state) => {
    const column = document.createElement("section");
    column.className = "kanban-column";
    column.setAttribute("aria-label", `${state.label} tasks`);
    column.dataset.state = state.id;
    addDropHandlers(column, state.id);

    const columnTasks = tasks.filter((task) => currentState(task).id === state.id);
    const title = document.createElement("div");
    title.className = "kanban-title";

    const titleText = document.createElement("span");
    titleText.textContent = state.label;

    const count = document.createElement("span");
    count.textContent = String(columnTasks.length);

    title.append(titleText, count);

    const stack = document.createElement("div");
    stack.className = "kanban-stack";

    if (!columnTasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      stack.append(empty);
    } else {
      columnTasks
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((task) => stack.append(createKanbanCard(task)));
    }

    column.append(title, stack);
    elements.kanbanBoard.append(column);
  });
}

function render() {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });

  elements.taskList.classList.toggle("is-hidden", mode !== "list");
  elements.kanbanBoard.classList.toggle("is-hidden", mode !== "kanban");
  elements.clearDoneButton.disabled = !tasks.some((task) => coerceStateId(task.state) === "done");

  if (mode === "list") {
    renderList();
    elements.kanbanBoard.replaceChildren();
  } else {
    elements.taskList.replaceChildren();
    renderKanban();
  }
}

function renderColumnSettings() {
  elements.columnInputs.replaceChildren();

  states.forEach((state) => {
    const label = document.createElement("label");

    const hidden = document.createElement("span");
    hidden.className = "visually-hidden";
    hidden.textContent = `${state.label} column`;

    const input = document.createElement("input");
    input.className = "setting-input";
    input.name = state.id;
    input.maxLength = 24;
    input.value = state.label;

    label.append(hidden, input);
    elements.columnInputs.append(label);
  });
}

function renderThemeSettings() {
  elements.themeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === theme);
    button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
  });
}

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    const nextView = button.dataset.view;
    elements.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab === button);
      tab.setAttribute("aria-pressed", String(tab === button));
    });
    Object.entries(elements.views).forEach(([name, view]) => {
      view.classList.toggle("is-active", name === nextView);
    });
  });
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => saveMode(button.dataset.mode));
});

elements.themeButtons.forEach((button) => {
  button.addEventListener("click", () => saveTheme(button.dataset.theme));
});

elements.columnSettings.addEventListener("input", (event) => {
  const input = event.target;

  const state = states.find((item) => item.id === input.name);
  if (!state) return;

  state.label = input.value.trim() || columnDefinitions.find((item) => item.id === state.id).label;
  saveStates();
  render();
});

elements.clearDoneButton.addEventListener("click", clearDoneTasks);
elements.exportButton.addEventListener("click", exportBackup);
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.deleteAllButton.addEventListener("click", deleteAllData);
elements.importFile.addEventListener("change", () => {
  importBackup(elements.importFile.files[0]);
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskInput.value.trim();

  if (!title) return;

  tasks.push({
    id: createId(),
    title,
    state: states[0].id,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  elements.taskInput.value = "";
  saveTasks();
  render();
});

elements.noteInput.value = localStorage.getItem(NOTE_KEY) || "";
elements.noteInput.addEventListener("input", () => {
  saveNote(elements.noteInput.value);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

applyTheme();
renderColumnSettings();
renderThemeSettings();
render();
