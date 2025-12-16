/*
      Shiori – Homepage JS (MVP)
      - Handles bookshelf data
      - Renders shelf cards
      - Creates a new shelf (demo)
      This is intentionally simple + readable.
    */

// ---- Storage helpers ----
const STORAGE_KEY = "shiori_shelves";

function loadShelves() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveShelves(shelves) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shelves));
}

// ---- State ----
let shelves = loadShelves();

// ---- Menu state ----
let openMenuEl = null;

function closeOpenMenu() {
  if (openMenuEl) {
    openMenuEl.classList.remove("open");
    openMenuEl = null;
  }
}

function deleteShelfById(id) {
  closeOpenMenu();
  shelves = shelves.filter((s) => s.id !== id);
  saveShelves(shelves);
  renderShelves();
}

// Close any open menu when clicking elsewhere
document.addEventListener("click", () => {
  closeOpenMenu();
});

// ---- DOM refs ----
const grid = document.querySelector(".grid");
const shelfCount = document.querySelector(".meta");
const newShelfButton = document.getElementById("new-shelf-btn");
const shelfModal = document.getElementById("shelf-modal");
const shelfModalTitle = document.getElementById("shelf-modal-title");
const shelfForm = document.getElementById("shelf-form");
const shelfNameInput = document.getElementById("shelf-name");
const shelfColorInput = document.getElementById("shelf-color");
const shelfCoverUrlInput = document.getElementById("shelf-cover-url");
const shelfCoverFileInput = document.getElementById("shelf-cover-file");

// ---- Utilities ----
const pastelVarNames = [
  "--p-blush",
  "--p-lav",
  "--p-sage",
  "--p-butter",
  "--p-sky",
  "--p-peach",
];

const pastelFallbackDefaults = [
  "#f6c6d6",
  "#d7d2ff",
  "#cfe7d5",
  "#f8e7b1",
  "#cfe7ff",
  "#ffd7c2",
];

const rootStyles =
  typeof window !== "undefined" && window.getComputedStyle
    ? window.getComputedStyle(document.documentElement)
    : null;

const pastelFallbacks = pastelVarNames.map((varName, idx) => {
  const cssValue = rootStyles ? rootStyles.getPropertyValue(varName).trim() : "";
  return cssValue || pastelFallbackDefaults[idx] || "#f6c6d6";
});

let shelfColorCycleIndex = 0;
let editingShelfId = null;

function pickPastel(index) {
  if (!pastelFallbacks.length) {
    return pastelFallbackDefaults[index % pastelFallbackDefaults.length] || "#f6c6d6";
  }
  return pastelFallbacks[index % pastelFallbacks.length];
}

function formatDate(ts) {
  const base = ts || Date.now();
  const diff = Date.now() - base;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return "Updated today";
  if (diff < day * 2) return "Updated yesterday";
  return `Updated ${Math.floor(diff / day)}d ago`;
}

function getShelfBookCount(shelf) {
  if (shelf && Array.isArray(shelf.books)) {
    return shelf.books.length;
  }
  if (shelf && typeof shelf.bookCount === "number") {
    return shelf.bookCount;
  }
  return 0;
}

function pluralize(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

function nextShelfModalColor() {
  if (!pastelFallbacks.length) return "#f6c6d6";
  const color = pastelFallbacks[shelfColorCycleIndex % pastelFallbacks.length];
  shelfColorCycleIndex += 1;
  return color || "#f6c6d6";
}

function getColorInputValue() {
  const value = shelfColorInput ? shelfColorInput.value.trim() : "";
  return value || pastelFallbacks[0] || "#f6c6d6";
}

function resetShelfFormExtras() {
  if (shelfColorInput) {
    shelfColorInput.value = nextShelfModalColor();
  }
  if (shelfCoverUrlInput) {
    shelfCoverUrlInput.value = "";
  }
  if (shelfCoverFileInput) {
    shelfCoverFileInput.value = "";
  }
}

function openShelfModal(existingShelf = null) {
  if (!shelfModal || !shelfForm || !shelfNameInput) return;
  shelfForm.reset();
  if (existingShelf) {
    editingShelfId = existingShelf.id;
    if (shelfModalTitle) {
      shelfModalTitle.textContent = "Edit bookshelf";
    }
    shelfNameInput.value = existingShelf.name || "";
    if (shelfColorInput) {
      const shelfIndex = shelves.findIndex(
        (s) => s.id === existingShelf.id
      );
      const fallbackColor =
        existingShelf.coverColor ||
        pickPastel(shelfIndex >= 0 ? shelfIndex : 0);
      shelfColorInput.value = fallbackColor || "#f6c6d6";
    }
    if (shelfCoverUrlInput) {
      shelfCoverUrlInput.value = existingShelf.cover || "";
    }
    if (shelfCoverFileInput) {
      shelfCoverFileInput.value = "";
    }
  } else {
    editingShelfId = null;
    if (shelfModalTitle) {
      shelfModalTitle.textContent = "New bookshelf";
    }
    resetShelfFormExtras();
  }
  shelfModal.classList.add("is-open");
  shelfModal.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    shelfNameInput.focus();
  }, 0);
}

function closeShelfModal() {
  if (!shelfModal) return;
  shelfModal.classList.remove("is-open");
  shelfModal.setAttribute("aria-hidden", "true");
  editingShelfId = null;
  if (shelfModalTitle) {
    shelfModalTitle.textContent = "New bookshelf";
  }
}

if (shelfModal) {
  shelfModal.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.dataset && target.dataset.close === "true") {
      closeShelfModal();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && shelfModal && shelfModal.classList.contains("is-open")) {
    closeShelfModal();
  }
});

function handleShelfFormSubmit(event) {
  event.preventDefault();
  if (!shelfNameInput) return;

  const name = shelfNameInput.value.trim();
  if (!name) {
    shelfNameInput.focus();
    return;
  }

  const colorValue = getColorInputValue();
  const coverUrl = shelfCoverUrlInput ? shelfCoverUrlInput.value.trim() : "";
  const coverFromInput = coverUrl !== "" ? coverUrl : null;
  const file =
    shelfCoverFileInput && shelfCoverFileInput.files
      ? shelfCoverFileInput.files[0]
      : null;
  const isEditing = Boolean(editingShelfId);
  const existingShelf = isEditing
    ? shelves.find((s) => s.id === editingShelfId)
    : null;

  const finalizeShelf = (overrideCover) => {
    const resolvedCover =
      typeof overrideCover !== "undefined" ? overrideCover : coverFromInput;

    if (isEditing && existingShelf) {
      const updatedShelf = {
        ...existingShelf,
        name,
        cover: resolvedCover,
        coverColor: colorValue,
        updatedAt: Date.now(),
      };
      if (!Array.isArray(updatedShelf.books)) {
        updatedShelf.books = [];
      }
      updatedShelf.bookCount = updatedShelf.books.length;
      shelves = shelves.map((s) =>
        s.id === updatedShelf.id ? updatedShelf : s
      );
    } else {
      const newShelf = {
        id: crypto.randomUUID(),
        name,
        cover: resolvedCover,
        coverColor: colorValue,
        books: [],
        bookCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      shelves.unshift(newShelf);
    }

    saveShelves(shelves);
    closeShelfModal();
    renderShelves();
  };

  if (file && typeof FileReader !== "undefined") {
    const reader = new FileReader();
    reader.onload = () => {
      finalizeShelf(reader.result);
    };
    reader.onerror = () => {
      if (isEditing && existingShelf && coverFromInput === null) {
        finalizeShelf(existingShelf.cover || null);
      } else {
        finalizeShelf(coverFromInput);
      }
    };
    reader.readAsDataURL(file);
  } else {
    finalizeShelf();
  }
}

// ---- Rendering ----
function renderShelves() {
  // Clear grid
  grid.innerHTML = "";

  // Render shelf cards
  shelves.forEach((shelf, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.role = "button";
    card.setAttribute("aria-label", `Open bookshelf: ${shelf.name}`);

    const cover = document.createElement("div");
    cover.className = "cover";

    if (shelf.cover) {
      const img = document.createElement("img");
      img.src = shelf.cover;
      img.alt = `${shelf.name} cover`;
      cover.appendChild(img);
    } else {
      const fallbackColor = shelf.coverColor || pickPastel(i);
      cover.style.background = fallbackColor;
      const title = document.createElement("div");
      title.className = "fallback-title";
      title.textContent = shelf.name;
      cover.appendChild(title);
    }

    const info = document.createElement("div");
    info.className = "info";

    const bookCount = getShelfBookCount(shelf);
    const updatedTimestamp = shelf.updatedAt || shelf.createdAt || Date.now();

    info.innerHTML = `
          <h3 class="title">${shelf.name}</h3>
          <div class="sub">
            <span>${bookCount} ${pluralize(bookCount, "book")}</span>
            <span>${formatDate(updatedTimestamp)}</span>
          </div>
        `;

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "card-menu-btn";
    menuBtn.setAttribute("aria-label", `Shelf options for ${shelf.name}`);
    menuBtn.innerHTML = `
      <span class="menu-icon" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    `;

    const menu = document.createElement("div");
    menu.className = "card-menu";
    menu.innerHTML = `
      <button type="button" class="edit">Edit shelf</button>
      <button type="button" class="danger">Delete shelf</button>
    `;

    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const alreadyOpen = menu.classList.contains("open");
      closeOpenMenu();
      if (!alreadyOpen) {
        menu.classList.add("open");
        openMenuEl = menu;
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const editBtn = menu.querySelector(".edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        closeOpenMenu();
        openShelfModal(shelf);
      });
    }

    const deleteBtn = menu.querySelector(".danger");
    deleteBtn.addEventListener("click", () => {
      const confirmDelete = confirm(`Delete shelf "${shelf.name}"?`);
      if (!confirmDelete) return;
      deleteShelfById(shelf.id);
    });

    card.appendChild(cover);
    card.appendChild(info);
    card.appendChild(menuBtn);
    card.appendChild(menu);

    card.addEventListener("click", () => {
      window.location.href = `/pages/shelf.html?id=${shelf.id}`;
    });

    grid.appendChild(card);
  });

  // New shelf card (always last)
  const newCard = document.createElement("article");
  newCard.className = "card new";
  newCard.tabIndex = 0;
  newCard.role = "button";
  newCard.innerHTML = `
        <div class="cover">
          <div class="plus">+</div>
        </div>
        <div class="info">
          <h3 class="title">New bookshelf</h3>
          <div class="sub"><span>Click to create</span></div>
        </div>
      `;

  newCard.addEventListener("click", () => openShelfModal());
  newCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openShelfModal();
    }
  });
  grid.appendChild(newCard);

  shelfCount.textContent = `${shelves.length} shelves`;
}

// ---- Bind top button ----
if (newShelfButton) {
  newShelfButton.addEventListener("click", () => openShelfModal());
}

if (shelfForm) {
  shelfForm.addEventListener("submit", handleShelfFormSubmit);
}

// ---- Initial render ----
renderShelves();
