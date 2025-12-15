/*
  Shiori – Shelf page JS (MVP)
  - Loads a shelf by id from URL (?id=...)
  - Renders Bookwalker-style book grid
  - Simple Add Book prompt (title + optional volume)
*/

const STORAGE_KEY = "shiori_shelves";

function loadShelves() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveShelves(nextShelves) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextShelves));
}

function getShelfIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function safeText(str) {
  return String(str ?? "");
}

const grid = document.querySelector(".grid.books");
const titleEl = document.getElementById("shelf-title");
const metaEl = document.getElementById("shelf-meta");
const headerNameEl = document.getElementById("header-shelf-name");
const addBookBtn = document.getElementById("add-book-btn");

const bookModal = document.getElementById("book-modal");
const bookModalTitle = document.getElementById("book-modal-title");
const bookForm = document.getElementById("book-form");
const bookTitleInput = document.getElementById("book-title");
const bookAuthorInput = document.getElementById("book-author");
const bookVolumeInput = document.getElementById("book-volume");
const bookCoverInput = document.getElementById("book-cover");

let shelves = loadShelves();
const shelfId = getShelfIdFromUrl();
let shelf = shelves.find((s) => s.id === shelfId);
let openBookMenu = null;
let editingBookId = null;

// If the user opened shelf.html without an id, go back home
if (!shelfId || !shelf) {
  window.location.href = "index.html";
}

function closeBookMenu() {
  if (openBookMenu) {
    openBookMenu.classList.remove("open");
    openBookMenu = null;
  }
}

document.addEventListener("click", () => {
  closeBookMenu();
});

function openBookModal(existingBook = null) {
  // reset form every time
  bookForm.reset();
  if (existingBook) {
    editingBookId = existingBook.id;
    if (bookModalTitle) {
      bookModalTitle.textContent = "Edit book";
    }
    bookTitleInput.value = existingBook.title || "";
    bookAuthorInput.value = existingBook.author || "";
    bookVolumeInput.value =
      typeof existingBook.volume === "number" ? existingBook.volume : "";
    bookCoverInput.value = existingBook.cover || "";
  } else {
    editingBookId = null;
    if (bookModalTitle) {
      bookModalTitle.textContent = "Add a book";
    }
  }

  bookModal.classList.add("is-open");
  bookModal.setAttribute("aria-hidden", "false");

  // focus title for speedy typing
  setTimeout(() => {
    bookTitleInput.focus();
  }, 0);
}

function closeBookModal() {
  bookModal.classList.remove("is-open");
  bookModal.setAttribute("aria-hidden", "true");
  editingBookId = null;
  if (bookModalTitle) {
    bookModalTitle.textContent = "Add a book";
  }
}

// Close modal on backdrop / X / cancel clicks
bookModal.addEventListener("click", (e) => {
  const target = e.target;
  if (target && target.dataset && target.dataset.close === "true") {
    closeBookModal();
  }
});

// Escape closes modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && bookModal.classList.contains("is-open")) {
    closeBookModal();
  }
});

function pastelForBook(index) {
  const options = [
    "var(--p-blush)",
    "var(--p-lav)",
    "var(--p-sage)",
    "var(--p-butter)",
    "var(--p-sky)",
    "var(--p-peach)",
  ];
  return options[index % options.length];
}

function formatDate(ts) {
  const diff = Date.now() - ts;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return "Updated today";
  if (diff < day * 2) return "Updated yesterday";
  return `Updated ${Math.floor(diff / day)}d ago`;
}

function ensureBooksArray() {
  if (!Array.isArray(shelf.books)) shelf.books = [];
}

function sortBooksForDisplay(books) {
  // If volume exists, sort ascending; otherwise fallback to newest first
  const hasAnyVolume = books.some((b) => typeof b.volume === "number");
  if (hasAnyVolume) {
    return [...books].sort((a, b) => {
      const av =
        typeof a.volume === "number" ? a.volume : Number.POSITIVE_INFINITY;
      const bv =
        typeof b.volume === "number" ? b.volume : Number.POSITIVE_INFINITY;
      return av - bv;
    });
  }
  return [...books].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderBooks() {
  ensureBooksArray();

  titleEl.textContent = shelf.name;
  headerNameEl.textContent = shelf.name;
  metaEl.textContent = `${shelf.books.length} books`;

  grid.innerHTML = "";

  const books = sortBooksForDisplay(shelf.books);

  books.forEach((book, i) => {
    const card = document.createElement("article");
    card.className = "book-card";
    card.tabIndex = 0;
    card.role = "button";
    card.setAttribute("aria-label", `Open book: ${book.title}`);

    const cover = document.createElement("div");
    cover.className = "book-cover";

    if (book.cover) {
      const img = document.createElement("img");
      img.src = book.cover;
      img.alt = `${book.title} cover`;
      cover.appendChild(img);
    } else {
      cover.style.background = pastelForBook(i);

      const fallback = document.createElement("div");
      fallback.className = "book-fallback";

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent =
        typeof book.volume === "number" ? `Vol. ${book.volume}` : "Book";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = safeText(book.title);

      fallback.appendChild(badge);
      fallback.appendChild(name);
      cover.appendChild(fallback);
    }

    const info = document.createElement("div");
    info.className = "book-info";

    const updatedAt = book.updatedAt ?? book.createdAt ?? Date.now();

    const authorText = book.author ? safeText(book.author) : "";

    info.innerHTML = `
      <h3 class="book-title">${safeText(book.title)}</h3>
      ${authorText ? `<div class="book-author">${authorText}</div>` : ""}
      <div class="book-sub">
        <span>${
          typeof book.volume === "number" ? `Vol. ${book.volume}` : ""
        }</span>
        <span>${formatDate(updatedAt)}</span>
      </div>
    `;

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "book-menu-btn";
    menuBtn.setAttribute("aria-label", `Book options for ${book.title}`);
    menuBtn.innerHTML = `
      <span class="menu-icon" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    `;

    const menu = document.createElement("div");
    menu.className = "book-menu";
    menu.innerHTML = `
      <button type="button" class="edit">Edit book</button>
      <button type="button" class="danger">Delete book</button>
    `;

    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const alreadyOpen = menu.classList.contains("open");
      closeBookMenu();
      if (!alreadyOpen) {
        menu.classList.add("open");
        openBookMenu = menu;
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const editBtn = menu.querySelector(".edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        closeBookMenu();
        openBookModal(book);
      });
    }

    const deleteBtn = menu.querySelector(".danger");
    deleteBtn.addEventListener("click", () => {
      const confirmDelete = confirm(`Delete book "${book.title}"?`);
      if (!confirmDelete) return;
      deleteBookById(book.id);
    });

    card.appendChild(cover);
    card.appendChild(info);
    card.appendChild(menuBtn);
    card.appendChild(menu);

    card.addEventListener("click", () => {
      window.location.href = `editor.html?shelfId=${shelf.id}&bookId=${book.id}`;
    });

    grid.appendChild(card);
  });

  // Add-book card
  const addCard = document.createElement("article");
  addCard.className = "add-book-card";
  addCard.tabIndex = 0;
  addCard.role = "button";
  addCard.setAttribute("aria-label", "Add a new book");

  addCard.innerHTML = `
    <div class="book-cover">
      <div class="plus">+</div>
    </div>
    <div class="book-info">
      <h3 class="book-title">Add book</h3>
      <div class="book-sub"><span>Click to create</span></div>
    </div>
  `;

  addCard.addEventListener("click", () => openBookModal());
  grid.appendChild(addCard);
}

function persistShelfChanges() {
  ensureBooksArray();
  shelf.bookCount = shelf.books.length;
  shelves = shelves.map((s) => (s.id === shelf.id ? shelf : s));
  saveShelves(shelves);
}

function deleteBookById(bookId) {
  ensureBooksArray();
  closeBookMenu();
  shelf.books = shelf.books.filter((b) => b.id !== bookId);
  shelf.updatedAt = Date.now();
  persistShelfChanges();
  renderBooks();
}

function handleBookFormSubmit(e) {
  e.preventDefault();
  ensureBooksArray();

  const title = (bookTitleInput.value || "").trim();
  const author = (bookAuthorInput.value || "").trim();
  const volRaw = (bookVolumeInput.value || "").trim();
  const coverUrl = (bookCoverInput.value || "").trim();

  if (!title) {
    bookTitleInput.focus();
    return;
  }

  const volNum = volRaw !== "" ? Number(volRaw) : null;
  const volume = Number.isFinite(volNum) && volNum > 0 ? volNum : null;
  const normalizedCover = coverUrl !== "" ? coverUrl : null;
  const isEditing = Boolean(editingBookId);
  const targetIndex = isEditing
    ? shelf.books.findIndex((b) => b.id === editingBookId)
    : -1;

  if (isEditing && targetIndex !== -1) {
    const original = shelf.books[targetIndex];
    const updatedBook = {
      ...original,
      title,
      author: author || null,
      volume,
      cover: normalizedCover,
      updatedAt: Date.now(),
    };
    shelf.books[targetIndex] = updatedBook;
  } else {
    const book = {
      id: crypto.randomUUID(),
      title,
      author: author || null,
      volume,
      cover: normalizedCover,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    shelf.books.push(book);

    // 👇 AUTO-OPEN NEW BOOK
    persistShelfChanges();
    closeBookModal();
    window.location.href = `editor.html?shelfId=${shelf.id}&bookId=${book.id}`;
    return;
  }

  shelf.updatedAt = Date.now();

  persistShelfChanges();
  closeBookModal();
  renderBooks();
}

addBookBtn.addEventListener("click", () => openBookModal());
bookForm.addEventListener("submit", handleBookFormSubmit);

renderBooks();
