const STORAGE_KEY = "room-planner-state-v3";
const WALL_DEPTH_LIMIT = 120;
const EXPORT_CANVAS_WIDTH = 1800;
const EXPORT_PADDING = 72;
const EXPORT_HEADER_HEIGHT = 120;
const EXPORT_DETAIL_WIDTH = 320;

const defaultLibrary = [
  { id: crypto.randomUUID(), name: "机", width: 1200, depth: 600, height: 720, color: "#d6724f" },
  { id: crypto.randomUUID(), name: "ベッド", width: 1950, depth: 970, height: 450, color: "#cfa36a" },
  { id: crypto.randomUUID(), name: "カラーボックス", width: 420, depth: 290, height: 890, color: "#6ca9a0" },
];

const defaultState = {
  room: { width: 3600, depth: 2800 },
  fixtures: [
    { id: crypto.randomUUID(), kind: "door", wall: "bottom", offset: 2400, size: 800, sillHeight: 0 },
    { id: crypto.randomUUID(), kind: "outlet", wall: "left", offset: 900, size: 140, sillHeight: 0 },
    { id: crypto.randomUUID(), kind: "tv", wall: "top", offset: 1800, size: 180, sillHeight: 0 },
    { id: crypto.randomUUID(), kind: "window", wall: "right", offset: 900, size: 1000, sillHeight: 900 },
  ],
  library: defaultLibrary,
  items: [
    { id: crypto.randomUUID(), libraryId: defaultLibrary[0].id, name: "机", width: 1200, depth: 600, height: 720, x: 320, y: 420, color: "#d6724f" },
    { id: crypto.randomUUID(), libraryId: defaultLibrary[2].id, name: "カラーボックス", width: 420, depth: 290, height: 890, x: 2800, y: 520, color: "#6ca9a0" },
  ],
  selectedItemId: null,
  selectedFixtureId: null,
  ui: {
    zoomPercent: 100,
    fontPercent: 90,
    showGrid: true,
    fixtureFormOpen: false,
    itemFormOpen: false,
    roomModalOpen: false,
  },
};

const state = loadState();
let historyStack = [];
let dragState = null;
let noticeTimer = null;
let editingFixtureId = null;
const WALL_ATTACH_MARGIN = 0;

const roomForm = document.querySelector("#room-form");
const fixtureForm = document.querySelector("#fixture-form");
const itemForm = document.querySelector("#item-form");
const roomWidthInput = document.querySelector("#room-width");
const roomDepthInput = document.querySelector("#room-depth");
const fixtureKindInput = document.querySelector("#fixture-kind");
const fixtureWallInput = document.querySelector("#fixture-wall");
const fixtureOffsetInput = document.querySelector("#fixture-offset");
const fixtureSizeInput = document.querySelector("#fixture-size");
const fixtureSillInput = document.querySelector("#fixture-sill");
const fixtureSillGroup = document.querySelector("#fixture-sill-group");
const itemNameInput = document.querySelector("#item-name");
const itemWidthInput = document.querySelector("#item-width");
const itemDepthInput = document.querySelector("#item-depth");
const itemHeightInput = document.querySelector("#item-height");
const roomCanvas = document.querySelector("#room-canvas");
const plannerFrame = document.querySelector("#planner-frame");
const fixtureLayer = document.querySelector("#fixture-layer");
const itemLayer = document.querySelector("#item-layer");
const library = document.querySelector("#library");
const fixtureList = document.querySelector("#fixture-list");
const roomSizeLabel = document.querySelector("#room-size-label");
const itemDetail = document.querySelector("#item-detail");
const resetButton = document.querySelector("#reset-layout");
const undoButton = document.querySelector("#undo-button");
const notice = document.querySelector("#notice");
const fontScaleInput = document.querySelector("#font-scale");
const zoomScaleInput = document.querySelector("#zoom-scale");
const gridToggleInput = document.querySelector("#grid-toggle");
const fontScaleValue = document.querySelector("#font-scale-value");
const zoomScaleValue = document.querySelector("#zoom-scale-value");
const toggleFixtureFormButton = document.querySelector("#toggle-fixture-form");
const toggleItemFormButton = document.querySelector("#toggle-item-form");
const fixtureSubmitButton = document.querySelector("#fixture-submit-button");
const openRoomModalButton = document.querySelector("#open-room-modal");
const closeRoomModalButton = document.querySelector("#close-room-modal");
const roomModal = document.querySelector("#room-modal");
const floatingInfo = document.querySelector("#floating-info");
const exportPngButton = document.querySelector("#export-png");
const exportPdfButton = document.querySelector("#export-pdf");

seedInputs();
bindEvents();
renderAll();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  const parsed = JSON.parse(saved);
  return {
    room: {
      width: normalizeNumber(parsed.room?.width, defaultState.room.width),
      depth: normalizeNumber(parsed.room?.depth, defaultState.room.depth),
    },
    fixtures: (parsed.fixtures || defaultState.fixtures).map(normalizeFixture),
    library: (parsed.library || defaultState.library).map(normalizeLibraryEntry),
    items: (parsed.items || defaultState.items).map(normalizeItem),
    selectedItemId: parsed.selectedItemId || null,
    selectedFixtureId: parsed.selectedFixtureId || null,
    ui: {
      zoomPercent: normalizeNumber(parsed.ui?.zoomPercent, defaultState.ui.zoomPercent),
      fontPercent: normalizeNumber(parsed.ui?.fontPercent, defaultState.ui.fontPercent),
      showGrid: parsed.ui?.showGrid !== false,
      fixtureFormOpen: Boolean(parsed.ui?.fixtureFormOpen),
      itemFormOpen: Boolean(parsed.ui?.itemFormOpen),
      roomModalOpen: false,
    },
  };
}

function seedInputs() {
  roomWidthInput.value = state.room.width;
  roomDepthInput.value = state.room.depth;
  fontScaleInput.value = state.ui.fontPercent;
  zoomScaleInput.value = state.ui.zoomPercent;
  gridToggleInput.checked = state.ui.showGrid;
  syncFixtureFormVisibility();
  syncItemFormVisibility();
  syncFixtureKindFields();
  syncRoomModal();
  applyFontScale();
}

function bindEvents() {
  roomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    pushHistory();
    state.room.width = normalizeNumber(roomWidthInput.value, 1000);
    state.room.depth = normalizeNumber(roomDepthInput.value, 1000);
    clampObjectsToRoom();
    closeRoomModal();
    renderAll();
  });

  fixtureForm.addEventListener("submit", (event) => {
    event.preventDefault();
    pushHistory();
    const fixture = normalizeFixture({
      id: editingFixtureId || crypto.randomUUID(),
      kind: fixtureKindInput.value,
      wall: fixtureWallInput.value,
      offset: normalizeNumber(fixtureOffsetInput.value, 0),
      size: normalizeNumber(fixtureSizeInput.value, 100),
      sillHeight: fixtureKindInput.value === "window" ? normalizeNumber(fixtureSillInput.value, 900) : 0,
    });
    fixture.offset = clampFixtureOffset(fixture);
    if (editingFixtureId) {
      state.fixtures = state.fixtures.map((entry) => entry.id === editingFixtureId ? fixture : entry);
    } else {
      state.fixtures.push(fixture);
    }
    selectFixture(fixture.id);
    editingFixtureId = fixture.id;
    renderAll();
  });

  itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    pushHistory();
    state.library.push(normalizeLibraryEntry({
      id: crypto.randomUUID(),
      name: itemNameInput.value.trim() || "家具",
      width: normalizeNumber(itemWidthInput.value, 300),
      depth: normalizeNumber(itemDepthInput.value, 300),
      height: normalizeNumber(itemHeightInput.value, 300),
      color: randomColor(),
    }));
    itemForm.reset();
    itemNameInput.value = "机";
    itemWidthInput.value = "1200";
    itemDepthInput.value = "600";
    itemHeightInput.value = "720";
    renderAll();
  });

  library.addEventListener("click", (event) => {
    const card = event.target.closest("[data-library-id]");
    if (!card) return;
    const template = state.library.find((entry) => entry.id === card.dataset.libraryId);
    if (!template) return;
    const newItem = normalizeItem({
      id: crypto.randomUUID(),
      libraryId: template.id,
      name: template.name,
      width: template.width,
      depth: template.depth,
      height: template.height,
      color: template.color,
      x: 80,
      y: 80,
    });
    const placement = findFreePlacement(newItem);
    if (!placement) {
      showNotice("空いている配置場所が見つかりません。");
      return;
    }
    pushHistory();
    newItem.x = placement.x;
    newItem.y = placement.y;
    state.items.push(newItem);
    selectItem(newItem.id);
    renderAll();
  });

  itemLayer.addEventListener("pointerdown", startItemDrag);
  fixtureLayer.addEventListener("pointerdown", startFixtureDrag);
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag);

  itemLayer.addEventListener("click", (event) => {
    const itemEl = event.target.closest("[data-item-id]");
    if (itemEl) {
      selectItem(itemEl.dataset.itemId);
      renderAll();
    }
  });

  fixtureLayer.addEventListener("click", (event) => {
    const fixtureEl = event.target.closest("[data-fixture-id]");
    if (fixtureEl) {
      selectFixture(fixtureEl.dataset.fixtureId);
      renderAll();
    }
  });

  itemDetail.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-selected]");
    if (!deleteButton) return;
    deleteSelectedObject();
  });

  fixtureList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-fixture-id]");
    if (editButton) {
      const fixture = state.fixtures.find((entry) => entry.id === editButton.dataset.editFixtureId);
      if (!fixture) return;
      selectFixture(fixture.id);
      state.ui.fixtureFormOpen = true;
      editingFixtureId = fixture.id;
      fixtureKindInput.value = fixture.kind;
      fixtureWallInput.value = fixture.wall;
      fixtureOffsetInput.value = fixture.offset;
      fixtureSizeInput.value = fixture.size;
      fixtureSillInput.value = fixture.sillHeight;
      syncFixtureKindFields();
      syncFixtureFormVisibility();
      renderSelectionDetail();
      return;
    }

    const rotateButton = event.target.closest("[data-rotate-fixture-id]");
    if (rotateButton) {
      const fixture = state.fixtures.find((entry) => entry.id === rotateButton.dataset.rotateFixtureId);
      if (!fixture) return;
      pushHistory();
      fixture.wall = rotateWall(fixture.wall);
      fixture.offset = clampFixtureOffset(fixture);
      selectFixture(fixture.id);
      if (editingFixtureId === fixture.id) {
        fixtureWallInput.value = fixture.wall;
        fixtureOffsetInput.value = fixture.offset;
      }
      renderAll();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-fixture-id]");
    if (deleteButton) {
      pushHistory();
      state.fixtures = state.fixtures.filter((entry) => entry.id !== deleteButton.dataset.deleteFixtureId);
      if (state.selectedFixtureId === deleteButton.dataset.deleteFixtureId) {
        state.selectedFixtureId = null;
      }
      renderAll();
    }
  });

  toggleFixtureFormButton.addEventListener("click", () => {
    if (!state.ui.fixtureFormOpen) {
      editingFixtureId = null;
      fixtureForm.reset();
      fixtureKindInput.value = "door";
      fixtureWallInput.value = "top";
      fixtureOffsetInput.value = "400";
      fixtureSizeInput.value = "900";
      fixtureSillInput.value = "900";
    }
    state.ui.fixtureFormOpen = !state.ui.fixtureFormOpen;
    syncFixtureFormVisibility();
    syncFixtureKindFields();
    saveState();
  });

  toggleItemFormButton.addEventListener("click", () => {
    state.ui.itemFormOpen = !state.ui.itemFormOpen;
    syncItemFormVisibility();
    saveState();
  });

  fixtureKindInput.addEventListener("change", syncFixtureKindFields);

  fontScaleInput.addEventListener("input", () => {
    state.ui.fontPercent = normalizeNumber(fontScaleInput.value, 90);
    applyFontScale();
    renderMetrics();
    saveState();
  });

  zoomScaleInput.addEventListener("input", () => {
    state.ui.zoomPercent = normalizeNumber(zoomScaleInput.value, 100);
    renderRoom();
    renderFixtures();
    renderItems();
    renderMetrics();
    saveState();
  });

  gridToggleInput.addEventListener("change", () => {
    state.ui.showGrid = gridToggleInput.checked;
    renderRoom();
    saveState();
  });

  openRoomModalButton.addEventListener("click", openRoomModal);
  closeRoomModalButton.addEventListener("click", closeRoomModal);
  exportPngButton.addEventListener("click", () => {
    exportLayout("png");
  });
  exportPdfButton.addEventListener("click", () => {
    exportLayout("pdf");
  });
  roomModal.addEventListener("click", (event) => {
    if (event.target === roomModal) closeRoomModal();
  });

  undoButton.addEventListener("click", undoLastAction);

  resetButton.addEventListener("click", () => {
    pushHistory();
    Object.assign(state, structuredClone(defaultState));
    seedInputs();
    renderAll();
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastAction();
    }
    if (dragState?.type === "item" && event.key.toLowerCase() === "r") {
      event.preventDefault();
      rotateDraggedItem();
    }
    if (event.key === "Escape") {
      closeRoomModal();
      hideFloatingInfo();
    }
    if ((event.key === "Delete" || event.key === "Backspace") && canHandleDeleteShortcut(event.target)) {
      event.preventDefault();
      deleteSelectedObject();
    }
  });

  window.addEventListener("resize", () => {
    renderRoom();
    renderFixtures();
    renderItems();
  });
}

function renderAll() {
  clampObjectsToRoom();
  renderRoom();
  renderLibrary();
  renderFixtures();
  renderItems();
  renderFixtureList();
  renderSelectionDetail();
  renderMetrics();
  syncFixtureFormVisibility();
  syncItemFormVisibility();
  syncFixtureKindFields();
  syncRoomModal();
  saveState();
}

function renderRoom() {
  roomCanvas.style.aspectRatio = `${state.room.width} / ${state.room.depth}`;
  roomSizeLabel.textContent = `${state.room.width}mm × ${state.room.depth}mm`;
  const frameRect = plannerFrame.getBoundingClientRect();
  const availableWidth = Math.max(frameRect.width - 32, 280);
  const availableHeight = Math.max(frameRect.height - 32, 280);
  const computedStyle = getComputedStyle(roomCanvas);
  const borderWidth = parseFloat(computedStyle.borderLeftWidth) + parseFloat(computedStyle.borderRightWidth);
  const borderHeight = parseFloat(computedStyle.borderTopWidth) + parseFloat(computedStyle.borderBottomWidth);
  const fitScale = Math.min(
    (availableWidth - borderWidth) / state.room.width,
    (availableHeight - borderHeight) / state.room.depth,
  );
  const scale = Math.max(fitScale * (state.ui.zoomPercent / 100), 0.04);
  roomCanvas.style.width = `${Math.round(state.room.width * scale + borderWidth)}px`;
  roomCanvas.style.height = `${Math.round(state.room.depth * scale + borderHeight)}px`;
  plannerFrame.classList.toggle("grid-hidden", !state.ui.showGrid);
}

function renderLibrary() {
  library.innerHTML = "";
  for (const entry of state.library) {
    const node = document.querySelector("#library-item-template").content.firstElementChild.cloneNode(true);
    node.dataset.libraryId = entry.id;
    node.innerHTML = `<strong>${entry.name}</strong><span>${entry.width} × ${entry.depth}mm</span><small>高さ ${entry.height}mm</small>`;
    node.style.borderLeft = `6px solid ${entry.color}`;
    library.appendChild(node);
  }
}

function renderFixtures() {
  fixtureLayer.innerHTML = "";
  for (const fixture of state.fixtures) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `fixture ${fixture.kind}`;
    if (state.selectedFixtureId === fixture.id) el.classList.add("selected");
    el.dataset.fixtureId = fixture.id;
    el.setAttribute("aria-label", `${fixtureLabel(fixture.kind)} ${wallLabel(fixture.wall)} ${round(fixture.offset)}mm`);
    positionFixture(el, fixture);
    fixtureLayer.appendChild(el);
  }
}

function positionFixture(el, fixture) {
  const metrics = getCanvasMetrics();
  const size = Math.max(fixture.size * metrics.scale, 18);
  if (isHorizontalWall(fixture.wall)) {
    el.style.width = `${size}px`;
    el.style.height = fixture.kind === "window" ? "20px" : "24px";
    el.style.left = `${fixture.offset * metrics.scale}px`;
    el.style.top = fixture.wall === "top" ? `${WALL_ATTACH_MARGIN}px` : `${metrics.height - (fixture.kind === "window" ? 20 : 24) - WALL_ATTACH_MARGIN}px`;
  } else {
    el.style.width = fixture.kind === "window" ? "20px" : "24px";
    el.style.height = `${size}px`;
    el.style.top = `${fixture.offset * metrics.scale}px`;
    el.style.left = fixture.wall === "left" ? `${WALL_ATTACH_MARGIN}px` : `${metrics.width - (fixture.kind === "window" ? 20 : 24) - WALL_ATTACH_MARGIN}px`;
  }
}

function renderItems() {
  itemLayer.innerHTML = "";
  const metrics = getCanvasMetrics();
  for (const item of state.items) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "item";
    if (state.selectedItemId === item.id) el.classList.add("selected");
    el.dataset.itemId = item.id;
    el.style.left = `${item.x * metrics.scale}px`;
    el.style.top = `${item.y * metrics.scale}px`;
    el.style.width = `${Math.max(item.width * metrics.scale, 44)}px`;
    el.style.height = `${Math.max(item.depth * metrics.scale, 44)}px`;
    el.style.background = `${item.color}33`;
    el.style.borderColor = item.color;
    el.setAttribute("aria-label", `${item.name} ${item.width}×${item.depth}`);
    itemLayer.appendChild(el);
  }
}

function renderFixtureList() {
  fixtureList.innerHTML = "";
  for (const fixture of state.fixtures) {
    const li = document.createElement("li");
    li.className = "fixture-row";
    const color = fixtureColor(fixture.kind);
    li.innerHTML = `
      <button class="fixture-main" type="button" data-edit-fixture-id="${fixture.id}" style="background:${color}; border-color:${color};">
        ${fixtureLabel(fixture.kind)} / ${wallLabel(fixture.wall)} / ${round(fixture.offset)}mm${fixture.kind === "window" ? ` / 下枠${fixture.sillHeight}mm` : ""}
      </button>
      <button class="fixture-rotate ghost-button" type="button" data-rotate-fixture-id="${fixture.id}">回転</button>
      <button class="fixture-delete" type="button" data-delete-fixture-id="${fixture.id}">削除</button>
    `;
    fixtureList.appendChild(li);
  }
}

function renderSelectionDetail() {
  const item = state.items.find((entry) => entry.id === state.selectedItemId);
  if (item) {
    itemDetail.innerHTML = detailMarkup(item.name, [
      ["位置", `${round(item.x)}mm, ${round(item.y)}mm`],
      ["大きさ", `${item.width} × ${item.depth}mm`],
      ["高さ", `${item.height}mm`],
    ], "家具を削除");
    return;
  }
  const fixture = state.fixtures.find((entry) => entry.id === state.selectedFixtureId);
  if (fixture) {
    itemDetail.innerHTML = detailMarkup(fixtureLabel(fixture.kind), [
      ["壁", wallLabel(fixture.wall)],
      ["位置", `${round(fixture.offset)}mm`],
      ["幅", `${fixture.size}mm`],
      ...(fixture.kind === "window" ? [["下枠高さ", `${fixture.sillHeight}mm`]] : []),
    ], "設備を削除");
    return;
  }
  itemDetail.textContent = "家具や設備をクリックすると寸法と位置が表示されます。";
}

function renderMetrics() {
  fontScaleValue.textContent = `${state.ui.fontPercent}%`;
  zoomScaleValue.textContent = `${state.ui.zoomPercent}%`;
}

function syncFixtureFormVisibility() {
  fixtureForm.classList.toggle("is-hidden", !state.ui.fixtureFormOpen);
  toggleFixtureFormButton.textContent = state.ui.fixtureFormOpen ? "閉じる" : "追加";
  fixtureSubmitButton.textContent = editingFixtureId ? "更新する" : "追加する";
}

function syncItemFormVisibility() {
  itemForm.classList.toggle("is-hidden", !state.ui.itemFormOpen);
  toggleItemFormButton.textContent = state.ui.itemFormOpen ? "閉じる" : "追加";
}

function syncFixtureKindFields() {
  fixtureSillGroup.classList.toggle("is-hidden", fixtureKindInput.value !== "window");
}

function syncRoomModal() {
  roomModal.classList.toggle("is-hidden", !state.ui.roomModalOpen);
}

function openRoomModal() {
  state.ui.roomModalOpen = true;
  roomWidthInput.value = state.room.width;
  roomDepthInput.value = state.room.depth;
  syncRoomModal();
}

function closeRoomModal() {
  state.ui.roomModalOpen = false;
  syncRoomModal();
}

function applyFontScale() {
  document.documentElement.style.setProperty("--font-scale", `${state.ui.fontPercent / 100}`);
}

function selectItem(id) {
  state.selectedItemId = id;
  state.selectedFixtureId = null;
}

function selectFixture(id) {
  state.selectedFixtureId = id;
  state.selectedItemId = null;
}

function startItemDrag(event) {
  const itemEl = event.target.closest("[data-item-id]");
  if (!itemEl) return;
  const item = state.items.find((entry) => entry.id === itemEl.dataset.itemId);
  if (!item) return;
  selectItem(item.id);
  const metrics = getCanvasMetrics();
  dragState = {
    type: "item",
    id: item.id,
    startX: item.x,
    startY: item.y,
    startWidth: item.width,
    startDepth: item.depth,
    pointerOffsetX: event.clientX - metrics.left - item.x * metrics.scale,
    pointerOffsetY: event.clientY - metrics.top - item.y * metrics.scale,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
  };
  itemEl.classList.add("dragging");
  itemEl.setPointerCapture(event.pointerId);
  showFloatingInfoForItem(item);
}

function startFixtureDrag(event) {
  const fixtureEl = event.target.closest("[data-fixture-id]");
  if (!fixtureEl) return;
  const fixture = state.fixtures.find((entry) => entry.id === fixtureEl.dataset.fixtureId);
  if (!fixture) return;
  selectFixture(fixture.id);
  const metrics = getCanvasMetrics();
  dragState = {
    type: "fixture",
    id: fixture.id,
    startOffset: fixture.offset,
    pointerOffset: isHorizontalWall(fixture.wall)
      ? event.clientX - metrics.left - fixture.offset * metrics.scale
      : event.clientY - metrics.top - fixture.offset * metrics.scale,
    startWall: fixture.wall,
  };
  fixtureEl.classList.add("dragging");
  fixtureEl.setPointerCapture(event.pointerId);
  showFloatingInfoForFixture(fixture);
}

function onDrag(event) {
  if (!dragState) return;
  if (dragState.type === "item") {
    const item = state.items.find((entry) => entry.id === dragState.id);
    if (!item) return;
    const metrics = getCanvasMetrics();
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
    item.x = clamp((event.clientX - metrics.left - dragState.pointerOffsetX) / metrics.scale, 0, state.room.width - item.width);
    item.y = clamp((event.clientY - metrics.top - dragState.pointerOffsetY) / metrics.scale, 0, state.room.depth - item.depth);
    renderItems();
    renderSelectionDetail();
    showFloatingInfoForItem(item);
    return;
  }

  const fixture = state.fixtures.find((entry) => entry.id === dragState.id);
  if (!fixture) return;
  const metrics = getCanvasMetrics();
  const localX = clamp(event.clientX - metrics.left, 0, metrics.width);
  const localY = clamp(event.clientY - metrics.top, 0, metrics.height);
  const snappedWall = findNearestWall(localX, localY, metrics);
  fixture.wall = snappedWall;
  const pointer = isHorizontalWall(snappedWall) ? localX : localY;
  const roomOffset = (pointer - dragState.pointerOffset) / metrics.scale;
  fixture.offset = clampFixtureOffset({ ...fixture, wall: snappedWall, offset: roomOffset });
  if (editingFixtureId === fixture.id) {
    fixtureWallInput.value = fixture.wall;
    fixtureOffsetInput.value = round(fixture.offset);
  }
  renderFixtures();
  renderFixtureList();
  renderSelectionDetail();
  showFloatingInfoForFixture(fixture);
}

function endDrag() {
  if (!dragState) return;
  if (dragState.type === "item") {
    const item = state.items.find((entry) => entry.id === dragState.id);
    if (item) {
      const overlap = findOverlappingItem(item);
      const blockedWindow = findBlockingWindow(item);
      if (overlap) {
        item.x = dragState.startX;
        item.y = dragState.startY;
        item.width = dragState.startWidth;
        item.depth = dragState.startDepth;
        showNotice("家具が重なります。元の位置に戻しました。");
      } else if (blockedWindow) {
        item.x = dragState.startX;
        item.y = dragState.startY;
        item.width = dragState.startWidth;
        item.depth = dragState.startDepth;
        showNotice("窓に重なります。元の位置に戻しました。");
      } else if (
        item.x !== dragState.startX ||
        item.y !== dragState.startY ||
        item.width !== dragState.startWidth ||
        item.depth !== dragState.startDepth
      ) {
        pushHistory({
          x: dragState.startX,
          y: dragState.startY,
          width: dragState.startWidth,
          depth: dragState.startDepth,
          id: item.id,
          type: "itemMove",
        });
      }
    }
  } else {
    const fixture = state.fixtures.find((entry) => entry.id === dragState.id);
    if (fixture && fixture.offset !== dragState.startOffset) {
      pushHistory({ offset: dragState.startOffset, wall: dragState.startWall, id: fixture.id, type: "fixtureMove" });
    } else if (fixture && fixture.wall !== dragState.startWall) {
      pushHistory({ offset: dragState.startOffset, wall: dragState.startWall, id: fixture.id, type: "fixtureMove" });
    }
  }
  dragState = null;
  hideFloatingInfo();
  renderAll();
}

function pushHistory(customEntry) {
  const snapshot = customEntry || structuredClone({
    room: state.room,
    fixtures: state.fixtures,
    library: state.library,
    items: state.items,
    selectedItemId: state.selectedItemId,
    selectedFixtureId: state.selectedFixtureId,
    ui: { ...state.ui, roomModalOpen: false },
  });
  historyStack.push(snapshot);
  if (historyStack.length > 40) historyStack.shift();
}

function undoLastAction() {
  const previous = historyStack.pop();
  if (!previous) {
    showNotice("これ以上アンドゥできません。");
    return;
  }

  if (previous.type === "itemMove") {
    const item = state.items.find((entry) => entry.id === previous.id);
    if (item) {
      item.x = previous.x;
      item.y = previous.y;
      item.width = previous.width;
      item.depth = previous.depth;
    }
  } else if (previous.type === "fixtureMove") {
    const fixture = state.fixtures.find((entry) => entry.id === previous.id);
    if (fixture) {
      fixture.offset = previous.offset;
      fixture.wall = previous.wall;
    }
  } else {
    Object.assign(state, structuredClone(previous));
  }
  renderAll();
}

function deleteSelectedObject() {
  const item = state.items.find((entry) => entry.id === state.selectedItemId);
  if (item) {
    pushHistory();
    state.items = state.items.filter((entry) => entry.id !== item.id);
    state.selectedItemId = null;
    hideFloatingInfo();
    renderAll();
    showNotice("家具を削除しました。");
    return;
  }

  const fixture = state.fixtures.find((entry) => entry.id === state.selectedFixtureId);
  if (!fixture) return;
  pushHistory();
  state.fixtures = state.fixtures.filter((entry) => entry.id !== fixture.id);
  state.selectedFixtureId = null;
  if (editingFixtureId === fixture.id) editingFixtureId = null;
  hideFloatingInfo();
  renderAll();
  showNotice("設備を削除しました。");
}

function clampObjectsToRoom() {
  for (const fixture of state.fixtures) fixture.offset = clampFixtureOffset(fixture);
  for (const item of state.items) {
    item.x = clamp(item.x, 0, Math.max(state.room.width - item.width, 0));
    item.y = clamp(item.y, 0, Math.max(state.room.depth - item.depth, 0));
  }
}

function findFreePlacement(item) {
  const maxY = state.room.depth - item.depth;
  const maxX = state.room.width - item.width;
  for (let y = 0; y <= maxY; y += 80) {
    for (let x = 0; x <= maxX; x += 80) {
      const candidate = { ...item, x, y };
      if (!findOverlappingItem(candidate) && !findBlockingWindow(candidate)) return { x, y };
    }
  }
  return null;
}

function findOverlappingItem(item) {
  return state.items.find((other) => other.id !== item.id && rectanglesOverlap(item, other));
}

function findBlockingWindow(item) {
  return state.fixtures.find((fixture) => {
    if (fixture.kind !== "window" || item.height <= fixture.sillHeight) return false;
    const overlapsSpan = isHorizontalWall(fixture.wall)
      ? rangeOverlap(item.x, item.x + item.width, fixture.offset, fixture.offset + fixture.size)
      : rangeOverlap(item.y, item.y + item.depth, fixture.offset, fixture.offset + fixture.size);
    return overlapsSpan && wallDistance(item, fixture.wall) <= WALL_DEPTH_LIMIT;
  });
}

function showFloatingInfoForItem(item) {
  floatingInfo.innerHTML = `<strong>${item.name}</strong><br>位置: ${round(item.x)}mm, ${round(item.y)}mm<br>大きさ: ${item.width} × ${item.depth}mm<br>高さ: ${item.height}mm<br>Rキー: 90度回転`;
  floatingInfo.classList.remove("is-hidden");
}

function showFloatingInfoForFixture(fixture) {
  floatingInfo.innerHTML = `<strong>${fixtureLabel(fixture.kind)}</strong><br>壁: ${wallLabel(fixture.wall)}<br>位置: ${round(fixture.offset)}mm<br>幅: ${fixture.size}mm${fixture.kind === "window" ? `<br>下枠: ${fixture.sillHeight}mm` : ""}`;
  floatingInfo.classList.remove("is-hidden");
}

function hideFloatingInfo() {
  floatingInfo.classList.add("is-hidden");
}

function detailMarkup(title, rows, deleteLabel = "") {
  return `<strong>${title}</strong>${rows.map(([label, value]) => `<div class="metric"><span>${label}</span><span>${value}</span></div>`).join("")}${deleteLabel ? `<button class="detail-delete" type="button" data-delete-selected>${deleteLabel}</button>` : ""}`;
}

function canHandleDeleteShortcut(target) {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest("input, textarea, select, button, [contenteditable='true']");
}

function clampFixtureOffset(fixture) {
  const max = isHorizontalWall(fixture.wall) ? Math.max(state.room.width - fixture.size, 0) : Math.max(state.room.depth - fixture.size, 0);
  return clamp(normalizeNumber(fixture.offset, 0), 0, max);
}

function wallDistance(item, wall) {
  if (wall === "top") return item.y;
  if (wall === "bottom") return state.room.depth - (item.y + item.depth);
  if (wall === "left") return item.x;
  return state.room.width - (item.x + item.width);
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y;
}

function rangeOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function normalizeLibraryEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    name: entry.name || "家具",
    width: normalizeNumber(entry.width, 300),
    depth: normalizeNumber(entry.depth, 300),
    height: normalizeNumber(entry.height, 300),
    color: entry.color || randomColor(),
  };
}

function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    libraryId: item.libraryId || null,
    name: item.name || "家具",
    width: normalizeNumber(item.width, 300),
    depth: normalizeNumber(item.depth, 300),
    height: normalizeNumber(item.height, 300),
    x: normalizeNumber(item.x, 0),
    y: normalizeNumber(item.y, 0),
    color: item.color || randomColor(),
  };
}

function normalizeFixture(fixture) {
  return {
    id: fixture.id || crypto.randomUUID(),
    kind: fixture.kind || "door",
    wall: fixture.wall || "top",
    offset: normalizeNumber(fixture.offset, 0),
    size: normalizeNumber(fixture.size, 100),
    sillHeight: normalizeNumber(fixture.sillHeight, 0),
  };
}

function fixtureLabel(kind) {
  if (kind === "door") return "ドア";
  if (kind === "tv") return "TV線";
  if (kind === "window") return "窓";
  return "コンセント";
}

function fixtureColor(kind) {
  if (kind === "door") return "#cb8754";
  if (kind === "tv") return "#6e56a0";
  if (kind === "window") return "#53a9c4";
  return "#4a6fa5";
}

function rotateWall(wall) {
  if (wall === "top") return "right";
  if (wall === "right") return "bottom";
  if (wall === "bottom") return "left";
  return "top";
}

function rotateDraggedItem() {
  if (dragState?.type !== "item") return;
  const item = state.items.find((entry) => entry.id === dragState.id);
  if (!item) return;
  const nextWidth = item.depth;
  const nextDepth = item.width;
  item.width = nextWidth;
  item.depth = nextDepth;
  item.x = clamp(item.x, 0, Math.max(state.room.width - item.width, 0));
  item.y = clamp(item.y, 0, Math.max(state.room.depth - item.depth, 0));
  const metrics = getCanvasMetrics();
  dragState.pointerOffsetX = dragState.lastClientX - metrics.left - item.x * metrics.scale;
  dragState.pointerOffsetY = dragState.lastClientY - metrics.top - item.y * metrics.scale;
  renderItems();
  renderSelectionDetail();
  showFloatingInfoForItem(item);
}

function getCanvasMetrics() {
  const rect = roomCanvas.getBoundingClientRect();
  const width = roomCanvas.clientWidth;
  const height = roomCanvas.clientHeight;
  const scale = Math.min(width / state.room.width, height / state.room.depth);
  return {
    left: rect.left + roomCanvas.clientLeft,
    top: rect.top + roomCanvas.clientTop,
    width,
    height,
    scale,
  };
}

function findNearestWall(x, y, rect) {
  const distances = [
    { wall: "top", distance: y },
    { wall: "right", distance: rect.width - x },
    { wall: "bottom", distance: rect.height - y },
    { wall: "left", distance: x },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0].wall;
}

function wallLabel(wall) {
  if (wall === "top") return "上";
  if (wall === "bottom") return "下";
  if (wall === "left") return "左";
  return "右";
}

function isHorizontalWall(wall) {
  return wall === "top" || wall === "bottom";
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(value);
}

function showNotice(message) {
  notice.textContent = message;
  notice.classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.textContent = "";
    notice.classList.remove("visible");
  }, 2600);
}

function randomColor() {
  const palette = ["#d6724f", "#7c9c54", "#4f8f87", "#d19a3b", "#8a6fb7", "#4f6bd6"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    room: state.room,
    fixtures: state.fixtures,
    library: state.library,
    items: state.items,
    selectedItemId: state.selectedItemId,
    selectedFixtureId: state.selectedFixtureId,
    ui: { ...state.ui, roomModalOpen: false },
  }));
}

async function exportLayout(format) {
  const button = format === "png" ? exportPngButton : exportPdfButton;
  const defaultLabel = format === "png" ? "PNG出力" : "PDF出力";
  button.disabled = true;
  button.textContent = "出力中...";
  try {
    const canvas = renderExportCanvas();
    const blob = format === "png" ? await canvasToBlob(canvas, "image/png") : await buildPdfBlobFromCanvas(canvas);
    downloadBlob(blob, createExportFilename(format));
    showNotice(`${format.toUpperCase()}を書き出しました。`);
  } catch (error) {
    console.error(error);
    showNotice(`${format.toUpperCase()}の書き出しに失敗しました。`);
  } finally {
    button.disabled = false;
    button.textContent = defaultLabel;
  }
}

function renderExportCanvas() {
  const canvas = document.createElement("canvas");
  const roomWidth = state.room.width;
  const roomDepth = state.room.depth;
  const drawableWidth = EXPORT_CANVAS_WIDTH - EXPORT_PADDING * 2 - EXPORT_DETAIL_WIDTH;
  const roomScale = drawableWidth / roomWidth;
  const roomPixelHeight = Math.round(roomDepth * roomScale);
  canvas.width = EXPORT_CANVAS_WIDTH;
  canvas.height = EXPORT_HEADER_HEIGHT + EXPORT_PADDING * 2 + roomPixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context is not available.");

  drawExportBackground(ctx, canvas.width, canvas.height);
  drawExportHeader(ctx, canvas.width);

  const roomX = EXPORT_PADDING;
  const roomY = EXPORT_HEADER_HEIGHT;
  const roomRect = { x: roomX, y: roomY, width: drawableWidth, height: roomPixelHeight, scale: roomScale };
  drawExportRoom(ctx, roomRect);
  drawExportFixtures(ctx, roomRect);
  drawExportItems(ctx, roomRect);
  drawExportLegend(ctx, roomRect);

  return canvas;
}

function drawExportBackground(ctx, width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#f7f3ea");
  background.addColorStop(1, "#ece4d8");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(120, 80, 20, 120, 80, 240);
  glowA.addColorStop(0, "rgba(200, 92, 58, 0.18)");
  glowA.addColorStop(1, "rgba(200, 92, 58, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(width - 140, height - 120, 20, width - 140, height - 120, 260);
  glowB.addColorStop(0, "rgba(47, 122, 120, 0.14)");
  glowB.addColorStop(1, "rgba(47, 122, 120, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);
}

function drawExportHeader(ctx, width) {
  ctx.fillStyle = "#1e2430";
  ctx.font = "600 42px Georgia, 'Yu Mincho', serif";
  ctx.fillText("Room Planner", EXPORT_PADDING, 56);

  ctx.fillStyle = "#6f6a62";
  ctx.font = "500 24px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(`部屋サイズ ${state.room.width}mm × ${state.room.depth}mm`, EXPORT_PADDING, 92);

  ctx.textAlign = "right";
  ctx.fillStyle = "#2f7a78";
  ctx.font = "600 22px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(new Date().toLocaleDateString("ja-JP"), width - EXPORT_PADDING, 92);
  ctx.textAlign = "left";
}

function drawExportRoom(ctx, roomRect) {
  const { x, y, width, height } = roomRect;
  const wallThickness = 18;

  ctx.save();
  roundedRect(ctx, x, y, width, height, 32);
  ctx.clip();

  const roomGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  roomGradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  roomGradient.addColorStop(1, "rgba(250, 233, 214, 0.94)");
  ctx.fillStyle = roomGradient;
  ctx.fillRect(x, y, width, height);

  if (state.ui.showGrid) {
    ctx.strokeStyle = "rgba(30, 36, 48, 0.07)";
    ctx.lineWidth = 1;
    const gridStep = Math.max(Math.round(300 * roomRect.scale), 18);
    for (let gx = x; gx <= x + width; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + height);
      ctx.stroke();
    }
    for (let gy = y; gy <= y + height; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + width, gy);
      ctx.stroke();
    }
  }

  ctx.restore();

  ctx.fillStyle = "#7e6246";
  roundedRect(ctx, x, y, width, height, 32);
  ctx.lineWidth = wallThickness;
  ctx.strokeStyle = "#7e6246";
  ctx.stroke();
}

function drawExportFixtures(ctx, roomRect) {
  for (const fixture of state.fixtures) {
    const color = fixtureColor(fixture.kind);
    const rect = getExportFixtureRect(fixture, roomRect);
    ctx.fillStyle = color;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, fixture.kind === "window" ? 8 : 10);
    ctx.fill();
  }
}

function drawExportItems(ctx, roomRect) {
  for (const item of state.items) {
    const x = roomRect.x + item.x * roomRect.scale;
    const y = roomRect.y + item.y * roomRect.scale;
    const width = Math.max(item.width * roomRect.scale, 44);
    const height = Math.max(item.depth * roomRect.scale, 44);

    ctx.fillStyle = `${item.color}33`;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 4;
    roundedRect(ctx, x, y, width, height, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1e2430";
    ctx.font = "600 18px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillText(item.name, x + 12, y + 28, Math.max(width - 20, 20));
    ctx.fillStyle = "#6f6a62";
    ctx.font = "500 14px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillText(`${item.width} × ${item.depth}mm`, x + 12, y + 48, Math.max(width - 20, 20));
  }
}

function drawExportLegend(ctx, roomRect) {
  const panelX = roomRect.x + roomRect.width + 28;
  const panelY = roomRect.y;
  const panelWidth = EXPORT_DETAIL_WIDTH - 28;
  const lineHeight = 30;

  ctx.fillStyle = "rgba(255, 250, 241, 0.9)";
  ctx.strokeStyle = "rgba(30, 36, 48, 0.08)";
  ctx.lineWidth = 1;
  roundedRect(ctx, panelX, panelY, panelWidth, roomRect.height, 24);
  ctx.fill();
  ctx.stroke();

  let cursorY = panelY + 36;
  ctx.fillStyle = "#1e2430";
  ctx.font = "600 24px Georgia, 'Yu Mincho', serif";
  ctx.fillText("出力サマリー", panelX + 20, cursorY);

  cursorY += 34;
  ctx.fillStyle = "#6f6a62";
  ctx.font = "500 16px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(`家具 ${state.items.length} 点`, panelX + 20, cursorY);
  cursorY += 22;
  ctx.fillText(`設備 ${state.fixtures.length} 点`, panelX + 20, cursorY);

  cursorY += 34;
  ctx.fillStyle = "#1e2430";
  ctx.font = "600 18px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText("設備凡例", panelX + 20, cursorY);

  cursorY += 22;
  for (const kind of ["door", "window", "outlet", "tv"]) {
    ctx.fillStyle = fixtureColor(kind);
    roundedRect(ctx, panelX + 20, cursorY - 12, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = "#6f6a62";
    ctx.font = "500 15px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillText(fixtureLabel(kind), panelX + 48, cursorY + 2);
    cursorY += lineHeight;
  }

  cursorY += 16;
  ctx.fillStyle = "#1e2430";
  ctx.font = "600 18px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText("家具一覧", panelX + 20, cursorY);

  cursorY += 24;
  ctx.font = "500 14px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  for (const item of state.items) {
    if (cursorY > panelY + roomRect.height - 18) break;
    ctx.fillStyle = item.color;
    ctx.fillRect(panelX + 20, cursorY - 10, 10, 10);
    ctx.fillStyle = "#6f6a62";
    ctx.fillText(`${item.name} ${item.width}×${item.depth}`, panelX + 40, cursorY, panelWidth - 60);
    cursorY += 24;
  }
}

function getExportFixtureRect(fixture, roomRect) {
  const thickness = fixture.kind === "window" ? 20 : 24;
  const length = Math.max(fixture.size * roomRect.scale, 20);
  if (isHorizontalWall(fixture.wall)) {
    return {
      x: roomRect.x + fixture.offset * roomRect.scale,
      y: fixture.wall === "top" ? roomRect.y + 8 : roomRect.y + roomRect.height - thickness - 8,
      width: length,
      height: thickness,
    };
  }

  return {
    x: fixture.wall === "left" ? roomRect.x + 8 : roomRect.x + roomRect.width - thickness - 8,
    y: roomRect.y + fixture.offset * roomRect.scale,
    width: thickness,
    height: length,
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function canvasToBlob(canvas, type, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error(`Failed to create ${type} blob.`));
    }, type, quality);
  });
}

async function buildPdfBlobFromCanvas(canvas) {
  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.94);
  const jpegBuffer = await jpegBlob.arrayBuffer();
  const pdfBuffer = buildPdfFromJpeg(jpegBuffer, canvas.width, canvas.height);
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

function buildPdfFromJpeg(jpegBuffer, widthPx, heightPx) {
  const pdfWidth = 842;
  const pdfHeight = Math.round((heightPx / widthPx) * pdfWidth);
  const imgData = bytesToBinaryString(new Uint8Array(jpegBuffer));
  const contentStream = `q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im0 Do\nQ`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgData.length} >>\nstream\n${imgData}\nendstream`,
  ];
  return buildPdfDocument(objects);
}

function buildPdfDocument(objects) {
  let body = "%PDF-1.3\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array([...body].map((char) => char.charCodeAt(0))).buffer;
}

function bytesToBinaryString(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binary;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createExportFilename(format) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("")
    + "-"
    + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("-");
  return `room-plan-${stamp}.${format}`;
}
