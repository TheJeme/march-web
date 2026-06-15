const STORAGE_KEY = "march.tasks.v1";
const NOTE_KEY = "march.note.v1";
const MODE_KEY = "march.mode.v1";
const THEME_KEY = "march.theme.v1";

const columnDefinitions = [
  { id: "new", label: "New", icon: "status-new" },
  { id: "doing", label: "Doing", icon: "status-doing" },
  { id: "done", label: "Done", icon: "status-done" },
];

const iconMarkup = {
  note: '<path d="M3 4h10M3 8h10M3 12h8"/>',
  list: '<circle cx="4" cy="4" r="1"/><circle cx="4" cy="8" r="1"/><circle cx="4" cy="12" r="1"/><path d="M7 4h6M7 8h6M7 12h6"/>',
  kanban:
    '<rect x="2.5" y="3" width="3" height="10" rx="1"/><rect x="6.5" y="3" width="3" height="6.4" rx="1"/><rect x="10.5" y="3" width="3" height="8.2" rx="1"/>',
  calendar:
    '<rect x="3" y="4" width="10" height="9" rx="1.4"/><path d="M5.2 2.8v2.4M10.8 2.8v2.4M3 6.7h10"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  "status-new": '<circle cx="8" cy="8" r="4.5"/>',
  "status-doing":
    '<circle cx="8" cy="8" r="4.5"/><path d="M8 3.5a4.5 4.5 0 0 0 0 9Z" fill="currentColor" stroke="none"/>',
  "status-done":
    '<circle cx="8" cy="8" r="4.5" fill="currentColor" stroke="none"/>',
  "chevron-left": '<path d="M9.8 3.5 5.3 8l4.5 4.5"/>',
  "chevron-right": '<path d="M6.2 3.5 10.7 8l-4.5 4.5"/>',
  trash:
    '<path d="M3.8 4.5h8.4M6.2 4.5v-1h3.6v1M5.6 6.6v4.4M8 6.6v4.4M10.4 6.6v4.4M4.8 4.5l.5 7.2c.05.72.65 1.28 1.37 1.28h2.6c.72 0 1.32-.56 1.37-1.28l.5-7.2"/>',
  drag: '<path d="M5 4.5h2M9 4.5h2M5 8h2M9 8h2M5 11.5h2M9 11.5h2"/>',
};

const themes = ["warm", "calm", "dusk"];

const elements = {
  tabs: document.querySelectorAll("[data-target]"),
  views: {
    tasks: document.querySelector("#tasksView"),
    note: document.querySelector("#noteView"),
    settings: document.querySelector("#settingsView"),
  },
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskDueButton: document.querySelector("#taskDueButton"),
  taskDuePreview: document.querySelector("#taskDuePreview"),
  taskList: document.querySelector("#taskList"),
  kanbanBoard: document.querySelector("#kanbanBoard"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  deleteAllButton: document.querySelector("#deleteAllButton"),
  importFile: document.querySelector("#importFile"),
  themeButtons: document.querySelectorAll("[data-theme]"),
  noteInput: document.querySelector("#noteInput"),
};

let states = columnDefinitions;
let theme = themes.includes(localStorage.getItem(THEME_KEY))
  ? localStorage.getItem(THEME_KEY)
  : "warm";
let tasks = loadTasks();
let mode = ["list", "kanban"].includes(localStorage.getItem(MODE_KEY))
  ? localStorage.getItem(MODE_KEY)
  : "list";
let activeTarget = "note";
let draggedTaskId = null;
let pendingHandleFocusId = null;
let preserveNextListOrder = false;
let draftTaskDueAt = null;
let activeDuePopover = null;

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((task) => ({
          ...task,
          state: coerceStateId(task.state),
          dueAt: coerceDueAt(task.dueAt),
        }))
      : [];
  } catch {
    return [];
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      theme === "dusk" ? "#262721" : theme === "calm" ? "#dde6d5" : "#efe2c3",
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

function getNoteText() {
  return elements.noteInput.value;
}

function setNoteText(value) {
  elements.noteInput.value = value;
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceDueAt(value) {
  const dueAt = Number(value);
  return Number.isFinite(dueAt) && dueAt > 0 ? dueAt : null;
}

function dueDateValue(dueAt) {
  if (!dueAt) return "";

  const date = new Date(dueAt);
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000,
  );
  return offsetDate.toISOString().slice(0, 10);
}

function dueTimeValue(dueAt) {
  if (!dueAt) return "12:00";

  const date = new Date(dueAt);
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000,
  );
  return offsetDate.toISOString().slice(11, 16);
}

function dueAtFromParts(dateValue, timeValue) {
  if (!dateValue) return null;

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = (timeValue || "12:00").split(":").map(Number);
  const dueAt = new Date(
    year,
    month - 1,
    day,
    hour || 0,
    minute || 0,
  ).getTime();
  return Number.isFinite(dueAt) ? dueAt : null;
}

function formatDueDateTime(dueAt) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dueAt));
}

function formatTimeLeft(dueAt, now = Date.now()) {
  if (!dueAt) return "";

  const diff = dueAt - now;
  const absDiff = Math.abs(diff);
  const minute = 60000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let value;
  let unit;

  if (absDiff < minute) {
    value = 0;
    unit = "min";
  } else if (absDiff < hour) {
    value = Math.ceil(absDiff / minute);
    unit = "min";
  } else if (absDiff < day) {
    value = Math.ceil(absDiff / hour);
    unit = "h";
  } else {
    value = Math.ceil(absDiff / day);
    unit = "d";
  }

  const amount = `${value} ${unit}`;
  return diff >= 0 ? `${amount} left` : `${amount} late`;
}

function dueStatus(dueAt, stateId) {
  if (!dueAt || stateId === "done") return "";
  return dueAt < Date.now() ? "late" : "open";
}

function updateDueTimeLabels() {
  document.querySelectorAll("[data-due-at]").forEach((element) => {
    const dueAt = coerceDueAt(element.dataset.dueAt);
    const stateId = element.dataset.state || "";
    const text = dueAt
      ? stateId === "done"
        ? formatDueDateTime(dueAt)
        : `${formatDueDateTime(dueAt)} · ${formatTimeLeft(dueAt)}`
      : "";
    element.textContent = text;
    element.dataset.dueStatus = dueStatus(dueAt, stateId);
  });
}

function updateTaskDuePreview() {
  elements.taskDuePreview.textContent = draftTaskDueAt
    ? formatDueDateTime(draftTaskDueAt)
    : "";
}

function closeDuePopover() {
  activeDuePopover?.remove();
  activeDuePopover = null;
}

function positionDuePopover(anchor, popover) {
  const margin = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const maxLeft = window.innerWidth - popoverRect.width - margin;
  const left = Math.min(
    Math.max(anchorRect.left, margin),
    Math.max(margin, maxLeft),
  );
  const belowTop = anchorRect.bottom + 6;
  const aboveTop = anchorRect.top - popoverRect.height - 6;
  const maxTop = window.innerHeight - popoverRect.height - margin;
  const top = belowTop <= maxTop ? belowTop : Math.max(margin, aboveTop);

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openDuePopover(anchor, dueAt, onUpdate) {
  closeDuePopover();

  const popover = document.createElement("div");
  popover.className = "due-popover";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = dueDateValue(dueAt);
  dateInput.setAttribute("aria-label", "Due date");

  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.value = dueTimeValue(dueAt);
  timeInput.setAttribute("aria-label", "Due time");

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "due-clear-button";
  clearButton.textContent = "Clear";

  const sync = () => {
    onUpdate(dueAtFromParts(dateInput.value, timeInput.value));
  };

  dateInput.addEventListener("input", sync);
  dateInput.addEventListener("change", sync);
  timeInput.addEventListener("input", sync);
  timeInput.addEventListener("change", sync);
  clearButton.addEventListener("click", () => {
    dateInput.value = "";
    onUpdate(null);
    closeDuePopover();
  });

  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDuePopover();
      anchor.focus();
    }
  });

  popover.append(dateInput, timeInput, clearButton);
  document.body.append(popover);
  activeDuePopover = popover;
  positionDuePopover(anchor, popover);
  window.setTimeout(() => {
    positionDuePopover(anchor, popover);
    dateInput.focus();
  }, 0);
}

function closeDuePopoverOutside(event) {
  if (
    !activeDuePopover ||
    activeDuePopover.contains(event.target) ||
    event.target.closest(".due-picker-host")
  ) {
    return;
  }

  closeDuePopover();
}

function createIcon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `ui-icon ${className}`.trim());

  const markup = iconMarkup[name];
  if (!markup) return svg;

  svg.innerHTML = markup;
  return svg;
}

function applyStaticIcons() {
  const bindings = [
    [".tab[data-target='note']", "note"],
    [".tab[data-target='task-list']", "list"],
    [".tab[data-target='task-kanban']", "kanban"],
    [".add-button", "plus"],
  ];

  bindings.forEach(([selector, iconName]) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.replaceChildren(createIcon(iconName));
  });
}

function targetView(target) {
  return target === "note"
    ? "note"
    : target === "settings"
      ? "settings"
      : "tasks";
}

function activateTarget(target) {
  if (target === "task-list") {
    mode = "list";
    localStorage.setItem(MODE_KEY, mode);
  }

  if (target === "task-kanban") {
    mode = "kanban";
    localStorage.setItem(MODE_KEY, mode);
  }

  activeTarget = target;
  render();
}

function currentState(task) {
  return (
    states.find((state) => state.id === coerceStateId(task.state)) || states[0]
  );
}

function stateIndex(task) {
  return Math.max(
    0,
    states.findIndex((state) => state.id === coerceStateId(task.state)),
  );
}

function stateRank(stateId) {
  return Math.max(
    0,
    states.findIndex((state) => state.id === coerceStateId(stateId)),
  );
}

function orderValue(task) {
  return Number.isFinite(task.order) ? task.order : task.createdAt;
}

function compareTasks(a, b) {
  return (
    stateRank(a.state) - stateRank(b.state) ||
    orderValue(a) - orderValue(b) ||
    a.createdAt - b.createdAt
  );
}

function sortTasksForList(source = tasks) {
  return source.slice().sort(compareTasks);
}

function tasksInCurrentListOrder() {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const orderedTasks = [...elements.taskList.querySelectorAll("[data-task-id]")]
    .map((element) => taskById.get(element.dataset.taskId))
    .filter(Boolean);
  const orderedIds = new Set(orderedTasks.map((task) => task.id));
  const newTasks = tasks.filter((task) => !orderedIds.has(task.id));

  return [...orderedTasks, ...newTasks];
}

function compareTasksInState(a, b) {
  return orderValue(a) - orderValue(b) || a.createdAt - b.createdAt;
}

function tasksInState(stateId, source = tasks) {
  return source
    .filter((task) => coerceStateId(task.state) === stateId)
    .slice()
    .sort(compareTasksInState);
}

function nextOrderForState(stateId, excludeId = "") {
  const lastOrder = tasksInState(stateId)
    .filter((task) => task.id !== excludeId)
    .reduce((max, task) => Math.max(max, orderValue(task)), 0);

  return lastOrder + 1000;
}

function coerceStateId(stateId, activeStates = states) {
  if (activeStates.some((state) => state.id === stateId)) {
    return stateId;
  }

  const fullIndex = columnDefinitions.findIndex(
    (state) => state.id === stateId,
  );
  if (fullIndex < 0) return activeStates[0].id;

  const nearestIndex = Math.min(fullIndex, activeStates.length - 1);
  return activeStates[nearestIndex].id;
}

function moveTask(id, direction) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const nextIndex = Math.min(
    states.length - 1,
    Math.max(0, stateIndex(task) + direction),
  );
  moveTaskToPosition(id, states[nextIndex].id);
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

  tasks = tasks.map((task) =>
    task.id === id
      ? { ...task, title: cleanTitle, updatedAt: Date.now() }
      : task,
  );
  saveTasks();
  return cleanTitle;
}

function updateTaskDueAt(id, value, shouldRender = true) {
  const dueAt = coerceDueAt(value);

  tasks = tasks.map((task) =>
    task.id === id ? { ...task, dueAt, updatedAt: Date.now() } : task,
  );
  saveTasks();

  if (shouldRender) {
    render();
  }
}

function setTaskState(id, stateId) {
  moveTaskToPosition(id, stateId);
}

function moveTaskToPosition(id, stateId, beforeId = null) {
  if (!states.some((state) => state.id === stateId)) return;

  const movedTask = tasks.find((task) => task.id === id);
  if (!movedTask) return;

  const rest = tasks.filter((task) => task.id !== id);
  const targetTasks = tasksInState(stateId, rest);
  const beforeIndex = beforeId
    ? targetTasks.findIndex((task) => task.id === beforeId)
    : -1;
  const insertAt = beforeIndex >= 0 ? beforeIndex : targetTasks.length;

  const nextTask = {
    ...movedTask,
    state: stateId,
    updatedAt: Date.now(),
  };
  const nextColumn = targetTasks.slice();
  nextColumn.splice(insertAt < 0 ? targetTasks.length : insertAt, 0, nextTask);

  const nextOrders = new Map(
    nextColumn.map((task, index) => [task.id, (index + 1) * 1000]),
  );
  tasks = [
    ...rest.map((task) =>
      nextOrders.has(task.id)
        ? { ...task, order: nextOrders.get(task.id) }
        : task,
    ),
    {
      ...nextTask,
      order: nextOrders.get(id) || nextOrderForState(stateId, id),
    },
  ];

  preserveNextListOrder = mode === "list" && activeTarget === "task-list";

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

function moveTaskWithinState(id, direction) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const stateId = currentState(task).id;
  const columnTasks = tasksInState(stateId);
  const currentIndex = columnTasks.findIndex((item) => item.id === id);
  if (currentIndex < 0) return;

  const nextIndex = Math.min(
    columnTasks.length - 1,
    Math.max(0, currentIndex + direction),
  );
  if (nextIndex === currentIndex) return;

  const remainingTasks = columnTasks.filter((item) => item.id !== id);
  const beforeId = remainingTasks[nextIndex]?.id || null;
  pendingHandleFocusId = id;
  moveTaskToPosition(id, stateId, beforeId);
}

function clearDoneTasks() {
  const doneCount = tasks.filter(
    (task) => coerceStateId(task.state) === "done",
  ).length;
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
    theme,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
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
      const createdAt = Number.isFinite(task.createdAt)
        ? task.createdAt
        : Date.now();
      const updatedAt = Number.isFinite(task.updatedAt)
        ? task.updatedAt
        : createdAt;
      const order = Number.isFinite(task.order) ? task.order : createdAt;
      const dueAt = coerceDueAt(task.dueAt);

      return {
        id: typeof task.id === "string" && task.id ? task.id : createId(),
        title: title.slice(0, 120),
        state,
        dueAt,
        order,
        createdAt,
        updatedAt,
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
      const nextMode = ["list", "kanban"].includes(backup.mode)
        ? backup.mode
        : "list";
      const nextTheme = themes.includes(backup.theme) ? backup.theme : "warm";
      const nextTasks = normalizeTasks(backup.tasks, columnDefinitions);

      if (
        !window.confirm(
          "Import this backup and replace the current local data?",
        )
      ) {
        return;
      }

      tasks = nextTasks;
      mode = nextMode;
      theme = nextTheme;
      activeTarget = "note";
      states = columnDefinitions;
      setNoteText(nextNote);

      saveTasks();
      saveNote(nextNote);
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(THEME_KEY, theme);
      applyTheme();
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
  draftTaskDueAt = null;
  updateTaskDuePreview();
  setNoteText("");

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(NOTE_KEY);
  localStorage.removeItem(MODE_KEY);
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem("march.columns.v1");
  states = columnDefinitions;
  theme = "warm";
  activeTarget = "note";
  mode = "list";
  applyTheme();
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
  document
    .querySelectorAll(".is-drop-target, .is-dragging")
    .forEach((element) => {
      element.classList.remove("is-drop-target", "is-dragging");
    });
}

function addDragHandleHandlers(handle, card, task) {
  handle.addEventListener("dragstart", (event) =>
    startDragging(card, task, event),
  );
  handle.addEventListener("dragend", stopDragging);

  handle.addEventListener("keydown", (event) => {
    const index = stateIndex(task);

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTaskWithinState(task.id, -1);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTaskWithinState(task.id, 1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTaskToIndex(task.id, index - 1);
    }

    if (event.key === "ArrowRight") {
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

function getDropBeforeId(column, event) {
  const cards = [...column.querySelectorAll(".kanban-card:not(.is-dragging)")];
  const nextCard = cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });

  return nextCard?.dataset.taskId || null;
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
    const beforeId = getDropBeforeId(column, event);
    column.classList.remove("is-drop-target");
    stopDragging();
    moveTaskToPosition(taskId, stateId, beforeId);
  });
}

function createIconButton(label, iconName, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${className}`.trim();
  button.setAttribute("aria-label", label);
  button.append(createIcon(iconName));
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
  input.setAttribute("aria-label", "Tasks title");
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

function createDueControls(task) {
  const controls = document.createElement("div");
  controls.className = "task-schedule";

  const pickerHost = document.createElement("span");
  pickerHost.className = "due-picker-host";

  const picker = document.createElement("button");
  picker.type = "button";
  picker.className = "date-picker";
  picker.setAttribute("aria-label", "Due date and time");
  picker.append(createIcon("calendar"));
  picker.addEventListener("click", () => {
    const currentTask = tasks.find((item) => item.id === task.id) || task;
    openDuePopover(picker, currentTask.dueAt, (dueAt) => {
      updateTaskDueAt(task.id, dueAt, false);
      timeLeft.dataset.dueAt = dueAt || "";
      updateDueTimeLabels();
    });
  });

  const timeLeft = document.createElement("span");
  timeLeft.className = "time-left";
  timeLeft.dataset.dueAt = task.dueAt || "";
  timeLeft.dataset.state = currentState(task).id;

  pickerHost.append(picker);
  controls.append(pickerHost, timeLeft);
  return controls;
}

function createTaskMain(task) {
  const main = document.createElement("div");
  main.className = "task-main";

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const stateLabel = document.createElement("span");
  stateLabel.className = "state-icon";
  stateLabel.dataset.status = currentState(task).id;
  stateLabel.append(createIcon(currentState(task).icon, "state-icon-svg"));
  stateLabel.setAttribute("aria-label", currentState(task).label);

  meta.append(stateLabel);
  main.append(meta, createTitleInput(task), createDueControls(task));

  return main;
}

function createTaskActions(task) {
  const actions = document.createElement("div");
  actions.className = "task-actions";

  const back = createIconButton("Move back", "chevron-left", () =>
    moveTask(task.id, -1),
  );
  back.disabled = stateIndex(task) === 0;

  const forward = createIconButton("Move forward", "chevron-right", () =>
    moveTask(task.id, 1),
  );
  forward.disabled = stateIndex(task) === states.length - 1;

  const remove = createIconButton(
    "Delete task",
    "trash",
    () => deleteTask(task.id),
    "delete",
  );

  actions.append(back, forward, remove);
  return actions;
}

function createDragHandle(card, task) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.draggable = true;
  handle.append(createIcon("drag"));
  handle.setAttribute("aria-label", "Move or sort tasks");
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

  card.append(header, createTitleInput(task), createDueControls(task));
  return card;
}

function renderList() {
  const listTasks = preserveNextListOrder
    ? tasksInCurrentListOrder()
    : sortTasksForList();
  preserveNextListOrder = false;
  elements.taskList.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    elements.taskList.append(empty);
    return;
  }

  listTasks.forEach((task) => elements.taskList.append(createTaskItem(task)));

  updateDueTimeLabels();
}

function renderKanban() {
  elements.kanbanBoard.replaceChildren();

  states.forEach((state) => {
    const column = document.createElement("section");
    column.className = "kanban-column";
    column.setAttribute("aria-label", `${state.label} tasks`);
    column.dataset.state = state.id;
    addDropHandlers(column, state.id);

    const columnTasks = tasksInState(state.id);
    const title = document.createElement("div");
    title.className = "kanban-title";

    const titleText = document.createElement("span");
    titleText.className = "kanban-state-icon";
    titleText.dataset.status = state.id;
    titleText.append(createIcon(state.icon, "kanban-state-svg"));
    titleText.setAttribute("aria-label", state.label);

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
      columnTasks.forEach((task) => stack.append(createKanbanCard(task)));
    }

    column.append(title, stack);
    elements.kanbanBoard.append(column);
  });

  updateDueTimeLabels();
}

function render() {
  closeDuePopover();

  elements.tabs.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.target === activeTarget,
    );
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.target === activeTarget),
    );
  });

  Object.entries(elements.views).forEach(([name, view]) => {
    view.classList.toggle("is-active", name === targetView(activeTarget));
  });

  elements.taskList.classList.toggle("is-hidden", mode !== "list");
  elements.kanbanBoard.classList.toggle("is-hidden", mode !== "kanban");

  if (mode === "list") {
    renderList();
    elements.kanbanBoard.replaceChildren();
  } else {
    elements.taskList.replaceChildren();
    renderKanban();
  }
}

function renderThemeSettings() {
  elements.themeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === theme);
    button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
  });
}

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => activateTarget(button.dataset.target));
});

elements.themeButtons.forEach((button) => {
  button.addEventListener("click", () => saveTheme(button.dataset.theme));
});

elements.exportButton.addEventListener("click", exportBackup);
elements.importButton.addEventListener("click", () =>
  elements.importFile.click(),
);
elements.deleteAllButton.addEventListener("click", deleteAllData);
elements.importFile.addEventListener("change", () => {
  importBackup(elements.importFile.files[0]);
});
document.addEventListener("pointerdown", closeDuePopoverOutside);
elements.taskDueButton.addEventListener("click", () => {
  openDuePopover(elements.taskDueButton, draftTaskDueAt, (dueAt) => {
    draftTaskDueAt = dueAt;
    updateTaskDuePreview();
  });
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskInput.value.trim();

  if (!title) return;

  tasks.push({
    id: createId(),
    title,
    state: states[0].id,
    dueAt: draftTaskDueAt,
    order: nextOrderForState(states[0].id),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  elements.taskInput.value = "";
  draftTaskDueAt = null;
  updateTaskDuePreview();
  closeDuePopover();
  tasks = sortTasksForList();
  saveTasks();
  render();
});

setNoteText(localStorage.getItem(NOTE_KEY) || "");
elements.noteInput.addEventListener("input", () => {
  saveNote(getNoteText());
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

applyTheme();
applyStaticIcons();
elements.taskDueButton.prepend(createIcon("calendar"));
activateTarget("note");
renderThemeSettings();

window.setInterval(updateDueTimeLabels, 30000);
