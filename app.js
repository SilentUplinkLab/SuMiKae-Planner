const STORAGE_KEY = "room-planner-state-v3";
const WALL_DEPTH_LIMIT = 120;

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
  selectedWall: null,
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
const wallDetail = document.querySelector("#wall-detail");
const itemDetail = document.querySelector("#item-detail");
const detailTitle = document.querySelector("#detail-title");
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
    selectedWall: parsed.selectedWall || null,
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

  roomCanvas.querySelectorAll(".wall").forEach((wallButton) => {
    wallButton.addEventListener("click", () => {
      state.selectedWall = wallButton.dataset.wall;
      renderAll();
    });
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
  renderWallSelection();
  renderWallDetail();
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
  const fitScale = Math.min(availableWidth / state.room.width, availableHeight / state.room.depth);
  const scale = Math.max(fitScale * (state.ui.zoomPercent / 100), 0.04);
  roomCanvas.style.width = `${Math.round(state.room.width * scale)}px`;
  roomCanvas.style.height = `${Math.round(state.room.depth * scale)}px`;
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
  const rect = roomCanvas.getBoundingClientRect();
  const scaleX = rect.width / state.room.width;
  const scaleY = rect.height / state.room.depth;
  const size = Math.max(fixture.size * (isHorizontalWall(fixture.wall) ? scaleX : scaleY), 18);
  if (isHorizontalWall(fixture.wall)) {
    el.style.width = `${size}px`;
    el.style.height = fixture.kind === "window" ? "20px" : "24px";
    el.style.left = `${fixture.offset * scaleX}px`;
    el.style.top = fixture.wall === "top" ? `${WALL_ATTACH_MARGIN}px` : `${rect.height - (fixture.kind === "window" ? 20 : 24) - WALL_ATTACH_MARGIN}px`;
  } else {
    el.style.width = fixture.kind === "window" ? "20px" : "24px";
    el.style.height = `${size}px`;
    el.style.top = `${fixture.offset * scaleY}px`;
    el.style.left = fixture.wall === "left" ? `${WALL_ATTACH_MARGIN}px` : `${rect.width - (fixture.kind === "window" ? 20 : 24) - WALL_ATTACH_MARGIN}px`;
  }
}

function renderItems() {
  itemLayer.innerHTML = "";
  const rect = roomCanvas.getBoundingClientRect();
  const scaleX = rect.width / state.room.width;
  const scaleY = rect.height / state.room.depth;
  for (const item of state.items) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "item";
    if (state.selectedItemId === item.id) el.classList.add("selected");
    el.dataset.itemId = item.id;
    el.style.left = `${item.x * scaleX}px`;
    el.style.top = `${item.y * scaleY}px`;
    el.style.width = `${Math.max(item.width * scaleX, 44)}px`;
    el.style.height = `${Math.max(item.depth * scaleY, 44)}px`;
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

function renderWallSelection() {
  roomCanvas.querySelectorAll(".wall").forEach((wallButton) => {
    wallButton.classList.toggle("active", wallButton.dataset.wall === state.selectedWall);
  });
}

function renderWallDetail() {
  if (!state.selectedWall) {
    detailTitle.textContent = "壁情報";
    wallDetail.textContent = "壁をクリックすると、その壁に対する家具の位置と高さを表示します。";
    return;
  }
  detailTitle.textContent = `${wallLabel(state.selectedWall)}の壁`;
  const items = state.items.map((item) => describeAgainstWall(item, state.selectedWall)).sort((a, b) => a.from - b.from);
  const windows = state.fixtures.filter((fixture) => fixture.kind === "window" && fixture.wall === state.selectedWall);
  wallDetail.innerHTML = [
    ...items.map((item) => `
      <div>
        <strong>${item.name}</strong>
        <div class="metric"><span>壁に沿った範囲</span><span>${item.from} - ${item.to}mm</span></div>
        <div class="metric"><span>壁からの離れ</span><span>${item.distance}mm</span></div>
        <div class="metric"><span>家具の高さ</span><span>${item.height}mm</span></div>
      </div>
    `),
    ...windows.map((fixture) => `
      <div>
        <strong>窓</strong>
        <div class="metric"><span>範囲</span><span>${fixture.offset} - ${fixture.offset + fixture.size}mm</span></div>
        <div class="metric"><span>下枠高さ</span><span>${fixture.sillHeight}mm</span></div>
      </div>
    `),
  ].join("") || "情報がありません。";
}

function renderSelectionDetail() {
  const item = state.items.find((entry) => entry.id === state.selectedItemId);
  if (item) {
    itemDetail.innerHTML = detailMarkup(item.name, [
      ["位置", `${round(item.x)}mm, ${round(item.y)}mm`],
      ["大きさ", `${item.width} × ${item.depth}mm`],
      ["高さ", `${item.height}mm`],
    ]);
    return;
  }
  const fixture = state.fixtures.find((entry) => entry.id === state.selectedFixtureId);
  if (fixture) {
    itemDetail.innerHTML = detailMarkup(fixtureLabel(fixture.kind), [
      ["壁", wallLabel(fixture.wall)],
      ["位置", `${round(fixture.offset)}mm`],
      ["幅", `${fixture.size}mm`],
      ...(fixture.kind === "window" ? [["下枠高さ", `${fixture.sillHeight}mm`]] : []),
    ]);
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
  const rect = roomCanvas.getBoundingClientRect();
  dragState = {
    type: "item",
    id: item.id,
    startX: item.x,
    startY: item.y,
    startWidth: item.width,
    startDepth: item.depth,
    pointerOffsetX: event.clientX - rect.left - item.x * (rect.width / state.room.width),
    pointerOffsetY: event.clientY - rect.top - item.y * (rect.height / state.room.depth),
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
  const rect = roomCanvas.getBoundingClientRect();
  dragState = {
    type: "fixture",
    id: fixture.id,
    startOffset: fixture.offset,
    pointerOffset: isHorizontalWall(fixture.wall)
      ? event.clientX - rect.left - fixture.offset * (rect.width / state.room.width)
      : event.clientY - rect.top - fixture.offset * (rect.height / state.room.depth),
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
    const rect = roomCanvas.getBoundingClientRect();
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
    item.x = clamp((event.clientX - rect.left - dragState.pointerOffsetX) / (rect.width / state.room.width), 0, state.room.width - item.width);
    item.y = clamp((event.clientY - rect.top - dragState.pointerOffsetY) / (rect.height / state.room.depth), 0, state.room.depth - item.depth);
    renderItems();
    renderSelectionDetail();
    if (state.selectedWall) renderWallDetail();
    showFloatingInfoForItem(item);
    return;
  }

  const fixture = state.fixtures.find((entry) => entry.id === dragState.id);
  if (!fixture) return;
  const rect = roomCanvas.getBoundingClientRect();
  const localX = clamp(event.clientX - rect.left, 0, rect.width);
  const localY = clamp(event.clientY - rect.top, 0, rect.height);
  const snappedWall = findNearestWall(localX, localY, rect);
  fixture.wall = snappedWall;
  const scale = isHorizontalWall(snappedWall) ? rect.width / state.room.width : rect.height / state.room.depth;
  const pointer = isHorizontalWall(snappedWall) ? localX : localY;
  const roomOffset = (pointer - dragState.pointerOffset) / scale;
  fixture.offset = clampFixtureOffset({ ...fixture, wall: snappedWall, offset: roomOffset });
  if (editingFixtureId === fixture.id) {
    fixtureWallInput.value = fixture.wall;
    fixtureOffsetInput.value = round(fixture.offset);
  }
  renderFixtures();
  renderFixtureList();
  renderSelectionDetail();
  if (state.selectedWall) renderWallDetail();
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
    selectedWall: state.selectedWall,
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

function clampObjectsToRoom() {
  for (const fixture of state.fixtures) fixture.offset = clampFixtureOffset(fixture);
  for (const item of state.items) {
    item.x = clamp(item.x, 0, Math.max(state.room.width - item.width, 0));
    item.y = clamp(item.y, 0, Math.max(state.room.depth - item.depth, 0));
  }
}

function findFreePlacement(item) {
  for (let y = 60; y <= state.room.depth - item.depth; y += 80) {
    for (let x = 60; x <= state.room.width - item.width; x += 80) {
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

function describeAgainstWall(item, wall) {
  if (wall === "top") return { name: item.name, from: round(item.x), to: round(item.x + item.width), distance: round(item.y), height: item.height };
  if (wall === "bottom") return { name: item.name, from: round(item.x), to: round(item.x + item.width), distance: round(state.room.depth - (item.y + item.depth)), height: item.height };
  if (wall === "left") return { name: item.name, from: round(item.y), to: round(item.y + item.depth), distance: round(item.x), height: item.height };
  return { name: item.name, from: round(item.y), to: round(item.y + item.depth), distance: round(state.room.width - (item.x + item.width)), height: item.height };
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

function detailMarkup(title, rows) {
  return `<strong>${title}</strong>${rows.map(([label, value]) => `<div class="metric"><span>${label}</span><span>${value}</span></div>`).join("")}`;
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
  const rect = roomCanvas.getBoundingClientRect();
  dragState.pointerOffsetX = dragState.lastClientX - rect.left - item.x * (rect.width / state.room.width);
  dragState.pointerOffsetY = dragState.lastClientY - rect.top - item.y * (rect.height / state.room.depth);
  renderItems();
  renderSelectionDetail();
  if (state.selectedWall) renderWallDetail();
  showFloatingInfoForItem(item);
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
    selectedWall: state.selectedWall,
    selectedItemId: state.selectedItemId,
    selectedFixtureId: state.selectedFixtureId,
    ui: { ...state.ui, roomModalOpen: false },
  }));
}
