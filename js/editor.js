const STORAGE_KEY = "shiori_shelves";

// ---- Helpers ----
function loadShelves() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveShelves(shelves) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shelves));
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function makeId() {
  return `p_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function chapterKey(ch) {
  return ch === null ? "none" : String(ch);
}

// ---- Data model helpers ----
// Each page: { id, ch (number|null), n (page# within chapter), title, content, updatedAt }

function pagesInChapter(bookObj, ch) {
  return (bookObj?.pages || [])
    .filter((p) => p.ch === ch)
    .sort((a, b) => a.n - b.n);
}

function getPage(bookObj, ch, pageNum) {
  return (
    (bookObj?.pages || []).find((p) => p.ch === ch && p.n === pageNum) || null
  );
}

function setPageContent(bookObj, ch, pageNum, content) {
  const pg = getPage(bookObj, ch, pageNum);
  if (!pg) return;
  pg.content = content;
  pg.updatedAt = Date.now();
}

function setPageTitle(bookObj, ch, pageNum, title) {
  const pg = getPage(bookObj, ch, pageNum);
  if (!pg) return;
  pg.title = title;
  pg.updatedAt = Date.now();
}

function getChapters(bookObj) {
  const map = new Map();
  (bookObj?.pages || []).forEach((p) => {
    const key = chapterKey(p.ch);
    if (!map.has(key)) map.set(key, p.ch);
  });

  const arr = Array.from(map.values());
  const nums = arr.filter((c) => typeof c === "number").sort((a, b) => a - b);
  const hasNone = arr.some((c) => c === null);

  // No chapter first (brain dump vibes)
  if (hasNone) nums.unshift(null);
  return nums;
}

function nextPageNumberInChapter(bookObj, ch) {
  const pages = pagesInChapter(bookObj, ch);
  if (pages.length === 0) return 1;
  return Math.max(...pages.map((p) => p.n)) + 1;
}

function renumberChapter(bookObj, ch) {
  const pages = pagesInChapter(bookObj, ch);
  pages.forEach((p, idx) => {
    p.n = idx + 1;
  });
}

function renumberAllChapters(bookObj) {
  getChapters(bookObj).forEach((ch) => renumberChapter(bookObj, ch));
}

function ensurePagesModel(bookObj) {
  if (!bookObj) return;

  // Back-compat: convert old `content` into Pg.1 with no chapter
  if (!Array.isArray(bookObj.pages)) {
    bookObj.pages = [
      {
        id: makeId(),
        ch: null,
        n: 1,
        title: "",
        content: typeof bookObj.content === "string" ? bookObj.content : "",
        updatedAt: bookObj.updatedAt || Date.now(),
      },
    ];
  }

  // Ensure required fields
  bookObj.pages.forEach((p) => {
    if (!p.id) p.id = makeId();
    if (typeof p.ch !== "number") p.ch = null;
    if (typeof p.n !== "number") p.n = 1;
    if (typeof p.title !== "string") p.title = "";
    if (typeof p.content !== "string") p.content = "";
    if (!Array.isArray(p.annotations)) p.annotations = [];
    if (!Array.isArray(p.suppressedGlossary)) p.suppressedGlossary = [];
  });

  // Renumber within each chapter to keep consistency
  renumberAllChapters(bookObj);

  // Default current chapter/page
  if (typeof bookObj.currentChapter !== "number") bookObj.currentChapter = null;
  if (typeof bookObj.currentPage !== "number") bookObj.currentPage = 1;

  // Per-chapter last visited page
  if (
    typeof bookObj.lastPageByChapter !== "object" ||
    bookObj.lastPageByChapter === null
  ) {
    bookObj.lastPageByChapter = {};
  }

  // Glossary for recognition (word -> reading/meaning/notes)
  if (typeof bookObj.glossary !== "object" || bookObj.glossary === null) {
    bookObj.glossary = {};
  }
}

// ---- Grab ids from URL ----
const shelfId = qs("shelfId");
const bookId = qs("bookId");

// ---- DOM ----
const titleEl = document.getElementById("book-title");
const metaEl = document.getElementById("book-meta");
const editorEl = document.getElementById("editor");
const statusEl = document.getElementById("save-status");
const backBtn = document.getElementById("back-btn");

// toolbar UI
const tocBtn = document.getElementById("toc-btn");
const tocEl = document.getElementById("toc");
const tocBody = document.getElementById("toc-body");
const tocClose = document.getElementById("toc-close");
const tocBackdrop = document.getElementById("toc-backdrop");
const tocSearchInput = document.getElementById("toc-search");

const pagePill = document.getElementById("page-pill");
const pagePopover = document.getElementById("page-popover");
const pageList = document.getElementById("page-list");

const shortcutsBtn = document.getElementById("shortcuts-btn");
const shortcutsPopover = document.getElementById("shortcuts-popover");

const newPageBtn = document.getElementById("new-page-btn");

const pageTitleInput = document.getElementById("page-title-input");
const chapterInput = document.getElementById("chapter-input");

const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalText = document.getElementById("confirm-modal-text");
const confirmModalConfirm = document.getElementById("confirm-modal-confirm");

const annotateBtn = document.getElementById("annotate-btn");
const annotationPanel = document.getElementById("annotation-panel");
const annotationCloseBtn = document.getElementById("annotation-close-btn");
const annotationCancelBtn = document.getElementById("annotation-cancel-btn");
const annotationForm = document.getElementById("annotation-form");
const annotationSelectedText = document.getElementById(
  "annotation-selected-text"
);
const annotationReadingInput = document.getElementById("annotation-reading");
const annotationMeaningInput = document.getElementById("annotation-meaning");
const annotationNotesInput = document.getElementById("annotation-notes");
const annotationTypeInputs = document.querySelectorAll(
  'input[name="annotation-reading-type"]'
);
const annotationListEl = document.getElementById("annotation-list");

// toasts
const toastHost = document.getElementById("toast-host");
function showToast({ title, text, emoji = "✨", ms = 2600 } = {}) {
  if (!toastHost) return;
  const toast = document.createElement("div");
  toast.className = "toast";

  const em = document.createElement("div");
  em.className = "toast-emoji";
  em.textContent = emoji;

  const content = document.createElement("div");
  content.className = "toast-content";

  const t = document.createElement("div");
  t.className = "toast-title";
  t.textContent = title || "Notice";

  const p = document.createElement("div");
  p.className = "toast-text";
  p.textContent = text || "";

  const dismiss = document.createElement("button");
  dismiss.className = "toast-dismiss";
  dismiss.type = "button";
  dismiss.textContent = "✕";
  dismiss.addEventListener("click", () => toast.remove());

  content.appendChild(t);
  if (text) content.appendChild(p);

  toast.appendChild(em);
  toast.appendChild(content);
  toast.appendChild(dismiss);
  toastHost.appendChild(toast);

  window.setTimeout(() => toast.remove(), ms);
}

// ---- Contenteditable helpers ----
function editorSetHTML(html) {
  if (!editorEl) return;
  editorEl.innerHTML = (html ?? "").toString();
  if (editorEl.innerHTML.trim() === "") editorEl.innerHTML = "";
  ensureEditorHasEntry();
  assignIdsToAllEntries();
  refreshEntryTypeClasses();
}

function editorGetHTML() {
  if (!editorEl) return "";
  return editorEl.innerHTML;
}

function htmlToText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return (tmp.innerText || "").trim();
}

function keepCaretBreathingRoom() {
  // Keeps margin visible when typing near bottom
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  const rects = r.getClientRects();
  if (!rects || rects.length === 0) return;
  const rect = rects[rects.length - 1];

  const padding = 120;
  const bottomLimit = window.innerHeight - padding;
  if (rect.bottom > bottomLimit) {
    window.scrollBy(0, rect.bottom - bottomLimit);
  }
}

function getCurrentPageObject() {
  if (!book) return null;
  return getPage(book, currentChapter, currentPage);
}

function ensureAnnotationsArray(pageObj) {
  if (!pageObj) return null;
  if (!Array.isArray(pageObj.annotations)) pageObj.annotations = [];
  return pageObj.annotations;
}

function clearAnnotationHighlights() {
  if (!editorEl) return;
  editorEl.querySelectorAll(".annotation-highlight").forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;

    // If we rendered a dedicated furigana element, remove it first.
    const furi = node.querySelector(".annotation-furigana");
    if (furi) furi.remove();

    // Prefer unwrapping the text wrapper if present.
    const textWrap =
      node.querySelector(".annotation-highlight__text") ||
      node.querySelector(".annotation-highlight__content") ||
      node;

    while (textWrap.firstChild) {
      parent.insertBefore(textWrap.firstChild, node);
    }

    parent.removeChild(node);
    parent.normalize();
  });
}

function locateTextPosition(root, targetOffset) {
  let remaining = targetOffset;

  // Skip text nodes that belong to furigana, otherwise offsets drift and
  // highlights can “ghost” onto adjacent words.
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parentEl = node.parentElement;
        if (parentEl && parentEl.closest(".annotation-furigana")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let lastTextNode = null;
  let node = walker.nextNode();
  while (node) {
    lastTextNode = node;
    const len = node.textContent.length;
    if (remaining <= len) {
      return { node, offset: remaining };
    }
    remaining -= len;
    node = walker.nextNode();
  }

  if (lastTextNode) {
    return { node: lastTextNode, offset: lastTextNode.textContent.length };
  }
  return null;
}

function getAnnotationTooltipText(annotation) {
  if (!annotation) return "";
  const bits = [];
  if (annotation.meaning) bits.push(annotation.meaning);
  if (annotation.notes) bits.push(annotation.notes);
  return bits.join(" • ");
}

function wrapAnnotationRange(entryInner, start, end, annotationData) {
  if (!entryInner) return;

  const startPos = locateTextPosition(entryInner, start);
  const endPos = locateTextPosition(entryInner, end);
  if (!startPos || !endPos) return;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const annotationId =
    annotationData && typeof annotationData === "object"
      ? annotationData.id || ""
      : annotationData || "";

  const tooltip =
    annotationData && typeof annotationData === "object"
      ? getAnnotationTooltipText(annotationData)
      : "";

  const reading =
    annotationData && typeof annotationData === "object"
      ? annotationData.reading || ""
      : "";

  // Outer highlight wrapper
  const span = document.createElement("span");
  span.className = "annotation-highlight";
  span.dataset.annotationId = annotationId;
  span.dataset.tooltip = tooltip || "";

  // IMPORTANT:
  // We intentionally do NOT set `data-reading` on any element.
  // If your CSS previously used `::before { content: attr(data-reading) }`,
  // that approach can "ghost" onto adjacent highlights when they sit side-by-side.

  // Build a self-contained structure so furigana can't drift:
  // <span.annotation-highlight>
  //   <span.annotation-furigana>...</span>
  //   <span.annotation-highlight__text>...</span>
  // </span>

  const textWrap = document.createElement("span");
  textWrap.className = "annotation-highlight__text";

  // Furigana element (only if we actually have a reading)
  let furiEl = null;
  if (reading) {
    furiEl = document.createElement("span");
    furiEl.className = "annotation-furigana";
    furiEl.setAttribute("aria-hidden", "true");
    furiEl.textContent = reading;

    // Minimal inline layout so it behaves even before CSS tweaks.
    // (No colors here, just structure.)
    furiEl.style.display = "block";
    furiEl.style.fontSize = "0.75em";
    furiEl.style.lineHeight = "1";
    furiEl.style.textAlign = "center";
    furiEl.style.marginBottom = "2px";
  }

  // Make the wrapper behave like a compact inline "stack"
  span.style.display = "inline-flex";
  span.style.flexDirection = "column";
  span.style.alignItems = "center";
  span.style.verticalAlign = "bottom";

  let success = false;

  // Try to surround the selected contents.
  try {
    range.surroundContents(span);
    success = true;
  } catch {
    // Fallback: extract and insert
    try {
      const contents = range.extractContents();
      textWrap.appendChild(contents);
      if (furiEl) span.appendChild(furiEl);
      span.appendChild(textWrap);
      range.insertNode(span);
      success = true;
    } catch {
      success = false;
    }
  }

  if (!success) return;

  // If surroundContents succeeded, move wrapped contents into our textWrap.
  // (surroundContents puts the original nodes directly under `span`.)
  if (!span.querySelector(".annotation-highlight__text")) {
    // Move everything currently inside span into textWrap
    while (span.firstChild) {
      textWrap.appendChild(span.firstChild);
    }

    // Rebuild the intended structure
    if (furiEl) span.appendChild(furiEl);
    span.appendChild(textWrap);
  } else {
    // Ensure furigana exists and is in the right spot if surround created a different structure
    const existingTextWrap = span.querySelector(".annotation-highlight__text");
    if (furiEl && !span.querySelector(".annotation-furigana")) {
      span.insertBefore(furiEl, existingTextWrap);
    }
  }
}

function computeRangeOffsets(entryInner, range) {
  const start = getOffsetWithin(
    entryInner,
    range.startContainer,
    range.startOffset
  );
  const end = getOffsetWithin(entryInner, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function getOffsetWithin(root, node, offset) {
  // We want offsets in the same coordinate system that `locateTextPosition()` uses,
  // which walks TEXT nodes and uses `textContent` lengths.
  // Using Range#toString() / innerText can disagree (line breaks, layout, etc.),
  // which causes highlights to wrap the wrong characters.
  try {
    const r = document.createRange();
    r.selectNodeContents(root);

    // Most of the time, Selection gives us a text node.
    if (node && node.nodeType === Node.TEXT_NODE) {
      r.setEnd(node, offset);
      const frag = r.cloneContents();
      if (frag && frag.querySelectorAll) {
        frag.querySelectorAll(".annotation-furigana").forEach((n) => n.remove());
      }
      return (frag.textContent || "").length;
    }

    // Sometimes the container is an element; map the offset (child index) to the
    // closest text position by selecting contents up to that child.
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      const kids = el.childNodes;
      const idx = Math.max(0, Math.min(kids.length, offset));

      if (idx === 0) {
        r.setEnd(el, 0);
        const frag = r.cloneContents();
        if (frag && frag.querySelectorAll) {
          frag.querySelectorAll(".annotation-furigana").forEach((n) => n.remove());
        }
        return (frag.textContent || "").length;
      }

      const before = kids[idx - 1];
      if (before) {
        r.setEndAfter(before);
        const frag = r.cloneContents();
        if (frag && frag.querySelectorAll) {
          frag.querySelectorAll(".annotation-furigana").forEach((n) => n.remove());
        }
        return (frag.textContent || "").length;
      }

      // Fallback: end at element start
      r.setEnd(el, 0);
      const frag = r.cloneContents();
      if (frag && frag.querySelectorAll) {
        frag.querySelectorAll(".annotation-furigana").forEach((n) => n.remove());
      }
      return (frag.textContent || "").length;
    }

    return null;
  } catch {
    return null;
  }
}

function applyAnnotationHighlightsForCurrentPage() {
  clearAnnotationHighlights();
  const pg = getCurrentPageObject();
  if (!pg || !editorEl) return;
  ensureAnnotationsArray(pg);
  assignIdsToAllEntries();
  pg.annotations.forEach((ann) => {
    const entry = editorEl.querySelector(
      `.entry[data-entry-id="${ann.entryId}"] .entry-inner`
    );
    if (!entry) return;
    const start = typeof ann.startOffset === "number" ? ann.startOffset : 0;
    const end =
      typeof ann.endOffset === "number"
        ? ann.endOffset
        : start + (ann.text || "").length;
    wrapAnnotationRange(entry, start, end, ann);
  });
}

function renderAnnotationList() {
  if (!annotationListEl) return;
  const pg = getCurrentPageObject();
  annotationListEl.innerHTML = "";
  if (!pg) return;

  const annotations = ensureAnnotationsArray(pg);
  if (!annotations.length) {
    const empty = document.createElement("div");
    empty.className = "annotation-empty";
    empty.textContent = "No annotations yet.";
    annotationListEl.appendChild(empty);
    return;
  }

  // Group duplicates (same word/reading/meaning/etc.) so the panel stays clean.
  const groups = new Map();
  annotations.forEach((ann) => {
    const key = annotationGroupKey(ann);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ann);
  });

  // Sort groups by most recent update inside the group
  const grouped = Array.from(groups.entries()).sort((a, b) => {
    const aMax = Math.max(...a[1].map((x) => x.updatedAt || 0));
    const bMax = Math.max(...b[1].map((x) => x.updatedAt || 0));
    return bMax - aMax;
  });

  grouped.forEach(([groupKey, list]) => {
    // Prefer a user-made annotation as the “representative” when possible
    const rep = list.find((a) => a.source !== "glossary") || list[0];

    const item = document.createElement("div");
    item.className = "annotation-item";
    item.dataset.annotationGroupKey = groupKey;

    const header = document.createElement("header");

    const typeGlyph =
      rep.readingType === "on" ? "音" : rep.readingType === "kun" ? "訓" : "";

    const leftLabel = rep.reading || "";
    const rightLabel = typeGlyph || rep.text || "(text)";

    // Count badge for duplicates
    const count = list.length;
    const countBadge = count > 1 ? ` ×${count}` : "";

    header.innerHTML = `<span>${leftLabel}</span><span>${rightLabel}${countBadge}</span>`;

    const body = document.createElement("div");
    body.className = "annotation-body";
    const parts = [];
    if (rep.text) parts.push(`<strong>${rep.text}</strong>`);
    if (rep.meaning) parts.push(rep.meaning);
    if (rep.notes) parts.push(`<em>${rep.notes}</em>`);
    body.innerHTML =
      parts.join(" • ") ||
      "<span class='annotation-empty'>No details yet.</span>";

    const footer = document.createElement("footer");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      openAnnotationForEdit(rep.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      const label = rep.text || "this annotation";
      openConfirmModalUI({
        title: `Delete “${label}”?`,
        text:
          count > 1
            ? `This will remove ${count} identical highlights on this page.`
            : "This will remove the highlight on this page.",
        confirmLabel: "Delete",
        onConfirm: () => deleteAnnotationGroup(groupKey),
      });
    });

    footer.appendChild(editBtn);
    footer.appendChild(delBtn);

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(footer);

    // Clicking the card jumps to the rep occurrence
    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openAnnotationForEdit(rep.id);
    });

    annotationListEl.appendChild(item);
  });
}

// ---- Glossary / recognition ----

function ensureSuppressedGlossary(pageObj) {
  if (!pageObj) return [];
  if (!Array.isArray(pageObj.suppressedGlossary)) pageObj.suppressedGlossary = [];
  return pageObj.suppressedGlossary;
}

function addSuppressedGlossaryWord(pageObj, word) {
  const w = (word || "").trim();
  if (!w) return;
  const list = ensureSuppressedGlossary(pageObj);
  if (!list.includes(w)) list.push(w);
}

function removeSuppressedGlossaryWord(pageObj, word) {
  const w = (word || "").trim();
  if (!w) return;
  const list = ensureSuppressedGlossary(pageObj);
  pageObj.suppressedGlossary = list.filter((x) => x !== w);
}

function cloneEntryWithoutHighlightsAndFurigana(entryInner) {
  // We must ignore furigana text when matching, otherwise offsets drift and we
  // get "random" highlights or duplicated ones.
  const clone = entryInner.cloneNode(true);

  // Remove furigana nodes
  clone.querySelectorAll(".annotation-furigana").forEach((n) => n.remove());

  // Unwrap highlight wrappers (keep only the original text)
  clone.querySelectorAll(".annotation-highlight").forEach((wrap) => {
    const textWrap =
      wrap.querySelector(".annotation-highlight__text") ||
      wrap.querySelector(".annotation-highlight__content") ||
      wrap;

    const frag = document.createDocumentFragment();
    Array.from(textWrap.childNodes).forEach((c) => frag.appendChild(c.cloneNode(true)));
    wrap.replaceWith(frag);
  });

  return clone;
}

function getCleanEntryTextForMatching(entryInner) {
  if (!entryInner) return "";
  const clone = cloneEntryWithoutHighlightsAndFurigana(entryInner);
  return (clone.textContent || "").replace(/\r/g, "");
}
function ensureGlossary(bookObj) {
  if (!bookObj) return {};
  if (typeof bookObj.glossary !== "object" || bookObj.glossary === null) {
    bookObj.glossary = {};
  }
  return bookObj.glossary;
}

function glossaryKeyFromText(text) {
  return (text || "").trim();
}

function upsertGlossaryFromAnnotation(bookObj, annotation) {
  if (!bookObj || !annotation) return;
  const key = glossaryKeyFromText(annotation.text);
  if (!key) return;

  const glossary = ensureGlossary(bookObj);
  glossary[key] = {
    text: key,
    reading: annotation.reading || "",
    meaning: annotation.meaning || "",
    notes: annotation.notes || "",
    readingType: annotation.readingType || "kun",
    updatedAt: Date.now(),
  };
}

function findAllOccurrences(haystack, needle) {
  const out = [];
  if (!haystack || !needle) return out;
  let i = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) break;
    out.push(idx);
    i = idx + needle.length;
  }
  return out;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return !(aEnd <= bStart || aStart >= bEnd);
}

function annotationExistsOrOverlaps(annotations, entryId, start, end) {
  if (!Array.isArray(annotations)) return false;
  return annotations.some((ann) => {
    if (ann.entryId !== entryId) return false;
    const s = typeof ann.startOffset === "number" ? ann.startOffset : 0;
    const e = typeof ann.endOffset === "number" ? ann.endOffset : s;
    // Exact same range OR any overlap counts as "already annotated"
    return (s === start && e === end) || rangesOverlap(s, e, start, end);
  });
}

// Applies the book glossary to the CURRENT page: highlights every occurrence
// of known words across all entries, skipping overlaps.
function autoApplyGlossaryToCurrentPage() {
  if (!book || !editorEl) return 0;

  const pg = getCurrentPageObject();
  if (!pg) return 0;

  const suppressed = new Set(ensureSuppressedGlossary(pg).map((x) => (x || "").trim()).filter(Boolean));
  const glossary = ensureGlossary(book);
  const keys = Object.keys(glossary || {})
    .map((k) => (k || "").trim())
    .filter((k) => k.length && !suppressed.has(k));
  if (!keys.length) return 0;

  const annotations = ensureAnnotationsArray(pg);
  assignIdsToAllEntries();

  let added = 0;

  // Longer keys first reduces annoying partial matches
  keys.sort((a, b) => b.length - a.length);

  const entries = Array.from(editorEl.querySelectorAll(".entry"));
  entries.forEach((entry) => {
    const entryId = ensureEntryHasId(entry);
    const inner = entry.querySelector(".entry-inner") || entry;
    const plain = getCleanEntryTextForMatching(inner);
    if (!plain) return;

    keys.forEach((key) => {
      const g = glossary[key];
      if (!g) return;

      const positions = findAllOccurrences(plain, key);
      if (!positions.length) return;

      positions.forEach((pos) => {
        const start = pos;
        const end = pos + key.length;

        if (annotationExistsOrOverlaps(annotations, entryId, start, end))
          return;

        annotations.push({
          id: makeId(),
          entryId,
          startOffset: start,
          endOffset: end,
          text: key,
          reading: g.reading || "",
          readingType: g.readingType || "kun",
          meaning: g.meaning || "",
          notes: g.notes || "",
          updatedAt: Date.now(),
          source: "glossary",
        });

        added += 1;
      });
    });
  });

  pg.annotations = annotations;
  return added;
}

function refreshAnnotationsUI() {
  applyAnnotationHighlightsForCurrentPage();
  renderAnnotationList();
}

function collapseSelectionToRangeEnd(range) {
  const sel = document.getSelection();
  if (!sel) return;
  const target =
    range && typeof range.cloneRange === "function"
      ? range.cloneRange()
      : sel.rangeCount > 0
      ? sel.getRangeAt(0).cloneRange()
      : null;
  if (!target) return;
  target.collapse(false);
  sel.removeAllRanges();
  sel.addRange(target);
}

function focusEditorAfterAnnotation(annotationId) {
  if (!annotationId || !editorEl) return;
  const highlight = editorEl.querySelector(
    `.annotation-highlight[data-annotation-id="${annotationId}"]`
  );
  if (!highlight || !highlight.parentNode) return;
  const range = document.createRange();
  range.setStartAfter(highlight);
  range.collapse(true);
  const sel = document.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
  editorEl.focus();
}
function getSelectedReadingType() {
  let value = "kun";
  annotationTypeInputs?.forEach((input) => {
    if (input.checked) value = input.value;
  });
  return value;
}

function setReadingType(value) {
  annotationTypeInputs?.forEach((input) => {
    input.checked = input.value === value;
  });
}

function openAnnotationPanelUI() {
  if (!annotationPanel) return;
  annotationPanel.classList.add("open");
  annotationPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("annotations-open");
}

function closeAnnotationPanelUI() {
  if (!annotationPanel) return;
  annotationPanel.classList.remove("open");
  annotationPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("annotations-open");
}

function hideAnnotateButton() {
  if (annotateBtn) annotateBtn.classList.remove("show");
  pendingAnnotationSelection = null;
}

function showAnnotateButton(range, selectionData) {
  if (!annotateBtn || !range) return;
  const rect = range.getBoundingClientRect();
  annotateBtn.style.top = `${window.scrollY + rect.top - 40}px`;
  annotateBtn.style.left = `${window.scrollX + rect.left}px`;
  annotateBtn.classList.add("show");
  pendingAnnotationSelection = selectionData;
}

function findEntryForRange(range) {
  if (!range || !editorEl) return null;

  const startEntry = nearestEntry(range.startContainer);
  if (startEntry) return startEntry;

  const endEntry = nearestEntry(range.endContainer);
  if (endEntry) return endEntry;

  const commonEntry = nearestEntry(range.commonAncestorContainer);
  if (commonEntry) return commonEntry;

  // Fallback: sometimes the Selection reports the container as the editor itself
  // (especially around fresh lines / block boundaries). Try to resolve an entry
  // from the child node near the start/end offsets.
  const tryResolveFrom = (container, offset) => {
    if (!container) return null;
    if (container === editorEl) {
      const kids = editorEl.childNodes;
      const i = Math.max(0, Math.min(kids.length - 1, offset));
      const near = kids[i] || kids[i - 1] || kids[i + 1];
      if (!near) return null;
      if (near.nodeType === 1) {
        const el = near;
        return el.classList.contains("entry")
          ? el
          : el.querySelector?.(".entry");
      }
      return nearestEntry(near);
    }

    // If container is an element inside the editor, try its children too
    if (container.nodeType === 1) {
      const el = container;
      const kids = el.childNodes;
      const i = Math.max(0, Math.min(kids.length - 1, offset));
      const near = kids[i] || kids[i - 1] || kids[i + 1];
      return nearestEntry(near) || nearestEntry(el);
    }

    return null;
  };

  return (
    tryResolveFrom(range.startContainer, range.startOffset) ||
    tryResolveFrom(range.endContainer, range.endOffset) ||
    null
  );
}

function updateAnnotateButtonFromSelection() {
  if (!annotateBtn || !editorEl) return;
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    hideAnnotateButton();
    return;
  }
  const baseRange = sel.getRangeAt(0);
  const startsInside = editorEl.contains(baseRange.startContainer);
  const endsInside = editorEl.contains(baseRange.endContainer);
  if (!startsInside && !endsInside) {
    const ancestor = baseRange.commonAncestorContainer;
    const touchesEditor = editorEl.contains(ancestor) || ancestor === editorEl;
    if (!touchesEditor) {
      hideAnnotateButton();
      return;
    }
  }

  const targetEntry = findEntryForRange(baseRange);
  if (!targetEntry) {
    hideAnnotateButton();
    return;
  }

  const entryInner = targetEntry.querySelector(".entry-inner") || targetEntry;

  const entryRange = document.createRange();
  entryRange.selectNodeContents(entryInner);

  const workingRange = baseRange.cloneRange();
  try {
    if (
      workingRange.compareBoundaryPoints(Range.START_TO_START, entryRange) < 0
    ) {
      workingRange.setStart(entryRange.startContainer, entryRange.startOffset);
    }
    if (workingRange.compareBoundaryPoints(Range.END_TO_END, entryRange) > 0) {
      workingRange.setEnd(entryRange.endContainer, entryRange.endOffset);
    }
  } catch {
    hideAnnotateButton();
    return;
  }

  const text = workingRange.toString().trim();
  if (!text) {
    hideAnnotateButton();
    return;
  }

  assignIdsToAllEntries();
  const entryId = ensureEntryHasId(targetEntry);
  const offsets = computeRangeOffsets(entryInner, workingRange);
  if (!offsets) {
    hideAnnotateButton();
    return;
  }
  showAnnotateButton(workingRange, {
    entryId,
    startOffset: offsets.start,
    endOffset: offsets.end,
    text,
  });
}

function populateAnnotationForm(data) {
  if (annotationSelectedText) {
    annotationSelectedText.textContent = data?.text || "—";
  }
  if (annotationReadingInput) {
    annotationReadingInput.value = data?.reading || "";
  }
  if (annotationMeaningInput) {
    annotationMeaningInput.value = data?.meaning || "";
  }
  if (annotationNotesInput) {
    annotationNotesInput.value = data?.notes || "";
  }
  setReadingType(data?.readingType || "kun");
}

function clearAnnotationFormFields() {
  if (annotationForm) {
    annotationForm.reset();
  }
  populateAnnotationForm(null);
}

function resetAnnotationState({ closePanel = false } = {}) {
  activeAnnotationSelection = null;
  editingAnnotationId = null;
  pendingAnnotationSelection = null;
  hideAnnotateButton();
  clearAnnotationFormFields();
  if (closePanel) closeAnnotationPanelUI();
}

function openAnnotationForSelection(selection) {
  if (!selection) return;
  activeAnnotationSelection = { ...selection };
  editingAnnotationId = null;
  populateAnnotationForm({ text: selection.text, readingType: "kun" });
  openAnnotationPanelUI();
}

function openAnnotationForEdit(annotationId) {
  const pg = getCurrentPageObject();
  if (!pg) return;
  const annotations = ensureAnnotationsArray(pg);
  const ann = annotations.find((a) => a.id === annotationId);
  if (!ann) return;
  activeAnnotationSelection = {
    entryId: ann.entryId,
    startOffset: ann.startOffset,
    endOffset: ann.endOffset,
    text: ann.text,
  };
  editingAnnotationId = ann.id;
  populateAnnotationForm(ann);
  openAnnotationPanelUI();

  if (editorEl) {
    assignIdsToAllEntries();
    const entry = editorEl.querySelector(
      `.entry[data-entry-id="${ann.entryId}"] .entry-inner`
    );
    if (entry) {
      const highlight = entry.querySelector(
        `.annotation-highlight[data-annotation-id="${ann.id}"]`
      );
      if (highlight) {
        const range = document.createRange();
        range.selectNodeContents(highlight);
        const sel = document.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        highlight.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

function saveAnnotationFromForm() {
  const pg = getCurrentPageObject();
  if (!pg) return;
  const selection = activeAnnotationSelection;
  if (
    !selection ||
    !selection.entryId ||
    typeof selection.startOffset !== "number" ||
    typeof selection.endOffset !== "number"
  ) {
    showToast({
      title: "Select text first",
      text: "Highlight a word or phrase, then hit Annotate.",
      emoji: "🖊️",
    });
    return;
  }

  const annotations = ensureAnnotationsArray(pg);
  const reading = (annotationReadingInput?.value || "").trim();
  const meaning = (annotationMeaningInput?.value || "").trim();
  const notes = (annotationNotesInput?.value || "").trim();
  const readingType = getSelectedReadingType();
  const text = selection.text || "";
  if (text) removeSuppressedGlossaryWord(pg, text);

  const payload = {
    id: editingAnnotationId || makeId(),
    entryId: selection.entryId,
    startOffset: selection.startOffset,
    endOffset: selection.endOffset,
    text,
    reading,
    readingType,
    meaning,
    notes,
    updatedAt: Date.now(),
  };

  let toastTitle = "Annotation saved";
  let toastEmoji = "📌";

  if (editingAnnotationId) {
    const idx = annotations.findIndex((ann) => ann.id === editingAnnotationId);
    if (idx !== -1) {
      annotations[idx] = { ...annotations[idx], ...payload };
      toastTitle = "Annotation updated";
      toastEmoji = "✏️";
    }
  } else {
    annotations.push(payload);
  }

  pg.annotations = annotations;

  // Save the word into the book glossary so we can auto-recognize it later
  upsertGlossaryFromAnnotation(book, payload);

  // Auto-highlight every occurrence of known words on this page (Option B)
  const added = autoApplyGlossaryToCurrentPage();

  persistBookToStorage();
  refreshAnnotationsUI();

  // If we auto-added a bunch, give a tiny hint (no spam)
  if (added > 0) {
    showToast({
      title: "Recognition applied",
      text: `Auto-marked ${added} match${
        added === 1 ? "" : "es"
      } on this page.`,
      emoji: "🔎",
      ms: 1800,
    });
  }

  focusEditorAfterAnnotation(payload.id);
  resetAnnotationState({ closePanel: true });
  showToast({
    title: toastTitle,
    text: reading ? `${text} → ${reading}` : text,
    emoji: toastEmoji,
  });
}

function deleteAnnotation(annotationId) {
  const pg = getCurrentPageObject();
  if (!pg) return;
  const annotations = ensureAnnotationsArray(pg);
  const next = annotations.filter((ann) => ann.id !== annotationId);
  const removedAnn = annotations.find((ann) => ann.id === annotationId);
  if (removedAnn && removedAnn.text) {
    addSuppressedGlossaryWord(pg, removedAnn.text);
  }
  pg.annotations = next;
  persistBookToStorage();
  refreshAnnotationsUI();
  resetAnnotationState({ closePanel: true });
  showToast({
    title: "Annotation removed",
    text: "The highlight was cleared.",
    emoji: "🧽",
  });
}

function annotationGroupKey(ann) {
  const safe = (v) => (v == null ? "" : String(v)).trim();
  // Group by the “identity” of an annotation, not where it appears
  return [
    safe(ann.text),
    safe(ann.reading),
    safe(ann.meaning),
    safe(ann.notes),
    safe(ann.readingType),
  ].join("\u241F");
}

function deleteAnnotationGroup(groupKey) {
  const pg = getCurrentPageObject();
  if (!pg) return;
  const annotations = ensureAnnotationsArray(pg);
  const before = annotations.length;

  const next = annotations.filter(
    (ann) => annotationGroupKey(ann) !== groupKey
  );
  const removed = before - next.length;

  if (removed <= 0) return;

  // Suppress this word on THIS page so auto-recognition doesn't resurrect it.
  const sample = annotations.find((ann) => annotationGroupKey(ann) === groupKey);
  if (sample && sample.text) addSuppressedGlossaryWord(pg, sample.text);

  pg.annotations = next;
  persistBookToStorage();
  refreshAnnotationsUI();
  resetAnnotationState({ closePanel: true });

  showToast({
    title: "Annotation removed",
    text:
      removed === 1
        ? "Removed 1 occurrence."
        : `Removed ${removed} occurrences.`,
    emoji: "🧽",
  });
}

// ---- Entry formatting (script-style blocks) ----
// Types: narration | dialogue | sfx

function nearestEntry(node) {
  if (!node) return null;
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el ? el.closest(".entry") : null;
}

function setCaretInside(el) {
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function createEntryBlock(type, text = "") {
  const entry = document.createElement("div");
  entry.className = `entry entry--${type}`;
  entry.dataset.type = type;
  ensureEntryHasId(entry);

  const inner = document.createElement("div");
  inner.className = "entry-inner";
  inner.textContent = text;

  entry.appendChild(inner);
  return entry;
}

function ensureEntryHasId(entry) {
  if (!entry) return null;
  if (!entry.dataset.entryId) {
    entry.dataset.entryId = `entry_${makeId()}`;
  }
  return entry.dataset.entryId;
}

function assignIdsToAllEntries() {
  if (!editorEl) return;
  editorEl
    .querySelectorAll(".entry")
    .forEach((entry) => ensureEntryHasId(entry));
}

function ensureEditorHasEntry() {
  if (!editorEl) return;
  if (editorEl.querySelector(".entry")) return;
  const block = createEntryBlock("narration", "");
  const inner = block.querySelector(".entry-inner");
  if (inner) inner.innerHTML = "<br>";
  editorEl.appendChild(block);
}

function normalizeType(type) {
  if (
    type === "dialogue" ||
    type === "sfx" ||
    type === "narration" ||
    type === "thought"
  )
    return type;
  return "narration";
}

function refreshEntryTypeClasses() {
  if (!editorEl) return;
  editorEl.querySelectorAll(".entry").forEach((entry) => {
    const t = entry.dataset.type || "narration";
    setEntryType(entry, t);
  });
}

// ✅ NEW: retag existing entries cleanly
function setEntryType(entry, type) {
  if (!entry) return;
  type = normalizeType(type);

  entry.classList.remove(
    "entry--narration",
    "entry--dialogue",
    "entry--sfx",
    "entry--thought"
  );
  entry.classList.add(`entry--${type}`);
  entry.dataset.type = type;
  entry.style.marginLeft = "";
  entry.style.paddingLeft = "";
  entry.dataset.marginPreset = "";

  // Keep blank entries blank ONLY if they truly have no content
  const inner = entry.querySelector(".entry-inner");
  if (inner) {
    inner.style.marginLeft = "";
    inner.style.paddingLeft = "";
  }
  const hasText = (inner?.innerText || "").trim().length > 0;

  if (hasText) {
    entry.classList.remove("entry--blank");
  } else if (entry.classList.contains("entry--blank") && inner) {
    inner.innerHTML = "<br>";
  }
}

function rangeTouchesEntry(range, entry) {
  if (!range || !entry) return false;
  const inner = entry.querySelector(".entry-inner") || entry;
  try {
    if (typeof range.intersectsNode === "function") {
      return range.intersectsNode(inner);
    }
    const entryRange = document.createRange();
    entryRange.selectNodeContents(inner);
    const startsBeforeEntryEnd =
      range.compareBoundaryPoints(Range.START_TO_END, entryRange) > 0;
    const endsAfterEntryStart =
      range.compareBoundaryPoints(Range.END_TO_START, entryRange) < 0;
    return startsBeforeEntryEnd && endsAfterEntryStart;
  } catch {
    return false;
  }
}

function entriesIntersectingRange(range) {
  if (!editorEl || !range) return [];
  return Array.from(editorEl.querySelectorAll(".entry")).filter((entry) =>
    rangeTouchesEntry(range, entry)
  );
}

function replaceRangeWithNodes(range, nodes) {
  if (!range) return;
  range.deleteContents();
  const frag = document.createDocumentFragment();
  nodes.forEach((n) => frag.appendChild(n));
  range.insertNode(frag);
  nodes.forEach((node) => {
    if (node.classList && node.classList.contains("entry")) {
      setEntryType(node, node.dataset.type || "narration");
    }
  });
}

// ✅ Improved selection text extraction: preserves blank lines between blocks
function selectionToPlainText(sel) {
  if (!sel || sel.rangeCount === 0) return "";
  const r = sel.getRangeAt(0);

  const div = document.createElement("div");
  div.appendChild(r.cloneContents());

  let html = div.innerHTML || "";

  html = html.replace(/<br\s*\/?>/gi, "\n");
  html = html.replace(/<\/(div|p|li|h[1-6]|blockquote)>/gi, "\n");
  html = html.replace(/<(div|p|li|h[1-6]|blockquote)(\s[^>]*)?>/gi, "");
  html = html.replace(/<[^>]+>/g, "");

  const txt = html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return txt
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

// ---- Range-only block boundaries (ONLY when selecting a bigger chunk) ----
function clearRangeSelectionUI() {
  if (!editorEl) return;
  editorEl.classList.remove("is-range-selecting");
  editorEl
    .querySelectorAll(".entry.is-range-hit")
    .forEach((e) => e.classList.remove("is-range-hit"));
}

function applyRangeSelectionUI() {
  if (!editorEl) return;
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) {
    clearRangeSelectionUI();
    return;
  }

  const selectedText = (sel.toString() || "").trim();
  const BIG_SELECTION_CHARS = 18;

  if (sel.isCollapsed || selectedText.length < BIG_SELECTION_CHARS) {
    clearRangeSelectionUI();
    return;
  }

  const range = sel.getRangeAt(0);
  const entries = Array.from(editorEl.querySelectorAll(".entry"));
  const hit = entries.filter((entry) => rangeTouchesEntry(range, entry));

  editorEl.classList.add("is-range-selecting");
  editorEl
    .querySelectorAll(".entry.is-range-hit")
    .forEach((e) => e.classList.remove("is-range-hit"));
  hit.forEach((e) => e.classList.add("is-range-hit"));
}

function formatSelectionAs(type) {
  if (!editorEl) return;
  type = normalizeType(type);

  const sel = window.getSelection();
  if (!sel) return;

  // If no selection, apply to current entry or create one.
  if (sel.rangeCount === 0 || sel.isCollapsed) {
    const entry = nearestEntry(sel.anchorNode);
    if (entry) {
      setEntryType(entry, type);
      keepCaretBreathingRoom();
      return;
    }

    // Create a fresh entry at the end and place caret.
    const newEntry = createEntryBlock(type, "");
    editorEl.appendChild(newEntry);
    setCaretInside(newEntry.querySelector(".entry-inner"));
    keepCaretBreathingRoom();
    return;
  }

  // ✅ Key fix: if selection touches existing entry blocks, just retag them.
  // This prevents spacer-duplication / “adds padding but doesn’t reformat” weirdness.
  const range = sel.getRangeAt(0);
  const touchedEntries = entriesIntersectingRange(range);
  if (touchedEntries.length > 0) {
    touchedEntries.forEach((entry) => setEntryType(entry, type));

    const lastInner =
      touchedEntries[touchedEntries.length - 1].querySelector(".entry-inner");
    if (lastInner) setCaretInside(lastInner);

    keepCaretBreathingRoom();
    clearRangeSelectionUI();
    return;
  }

  // Has selection: convert selected text into one or multiple entries (split by newlines).
  const text = selectionToPlainText(sel).replace(/\r/g, "");
  const rawLines = text.split("\n");

  // If selection is basically empty, bail.
  if (!rawLines.some((l) => l.trim().length > 0)) return;

  const nodes = [];
  rawLines.forEach((line, idx) => {
    const isBlank = line.trim().length === 0;

    const block = createEntryBlock(type, isBlank ? "" : line);

    // Make blank lines actually take up vertical space
    if (isBlank) {
      block.classList.add("entry--blank");
      const inner = block.querySelector(".entry-inner");
      if (inner) inner.innerHTML = "<br>";
    }

    nodes.push(block);

    // keep spacing between lines
    if (idx < rawLines.length - 1) {
      const spacer = document.createElement("div");
      spacer.className = "entry-spacer";
      spacer.innerHTML = "<br>";
      nodes.push(spacer);
    }
  });

  replaceRangeWithNodes(range, nodes);
  clearRangeSelectionUI();

  // Put caret at the end of the last inserted non-blank entry (fallback to last entry)
  sel.removeAllRanges();
  const insertedInners = Array.from(
    editorEl.querySelectorAll(`.entry--${type} .entry-inner`)
  );
  const lastNonBlank = insertedInners
    .slice()
    .reverse()
    .find((el) => (el.innerText || "").trim().length > 0);

  const lastInserted =
    lastNonBlank ||
    insertedInners[insertedInners.length - 1] ||
    editorEl.querySelector(".entry:last-child .entry-inner");

  if (lastInserted) setCaretInside(lastInserted);

  keepCaretBreathingRoom();
}

function ensureTopLevelEntries() {
  // Optional cleanup: if user typed plain text nodes directly under editor, wrap them into narration entries.
  if (!editorEl) return;
  const children = Array.from(editorEl.childNodes);
  const hasAnyEntry = editorEl.querySelector(".entry");

  let mutated = false;
  let lastInsertedInner = null;

  children.forEach((node) => {
    if (node.nodeType === 3 && node.textContent.trim() !== "") {
      const block = createEntryBlock("narration", node.textContent);
      editorEl.insertBefore(block, node);
      node.remove();
      mutated = true;
      lastInsertedInner = block.querySelector(".entry-inner") || block;
    }

    if (node.nodeType === 1) {
      const el = node;
      if (el.classList && el.classList.contains("entry")) return;
      if (el.id === "") {
        const txt = (el.innerText || "").trim();
        if (!txt) return;
        const block = createEntryBlock("narration", txt);
        editorEl.insertBefore(block, el);
        el.remove();
        mutated = true;
        lastInsertedInner = block.querySelector(".entry-inner") || block;
      }
    }
  });

  if (!hasAnyEntry && editorEl.innerText.trim() !== "") {
    const txt = editorEl.innerText;
    editorEl.innerHTML = "";
    const block = createEntryBlock("narration", txt);
    editorEl.appendChild(block);
    mutated = true;
    lastInsertedInner = block.querySelector(".entry-inner") || block;
  }

  ensureEditorHasEntry();
  assignIdsToAllEntries();
  refreshEntryTypeClasses();
  if (mutated && lastInsertedInner) {
    setCaretInside(lastInsertedInner);
  }
}

function pushUndoAction(action) {
  undoStack.push({ ...action, at: Date.now() });
  if (undoStack.length > 20) undoStack.shift();
}

function clearUndoActions() {
  undoStack.length = 0;
}

function undoLastAction() {
  if (!undoStack.length) return false;
  const action = undoStack.pop();
  if (!action) return false;

  switch (action.type) {
    case "page_delete":
      return restoreDeletedPage(action);
    default:
      return false;
  }
}

function restoreDeletedPage(action) {
  if (!book) return false;
  const pageClone = JSON.parse(JSON.stringify(action.page || {}));
  if (!pageClone.id) pageClone.id = makeId();
  const insertIndex =
    typeof action.insertionIndex === "number" ? action.insertionIndex : 0;
  pageClone.n = insertIndex + 0.01;
  if (!Array.isArray(pageClone.annotations)) pageClone.annotations = [];

  book.pages = book.pages || [];
  book.pages.push(pageClone);
  renumberChapter(book, pageClone.ch);

  const restored =
    (book.pages || []).find((p) => p.id === pageClone.id) || pageClone;

  loadPageIntoEditor(restored.ch, restored.n);
  persistBookToStorage();
  markSaved();
  showToast({
    title: `Restored Pg. ${restored.n}`,
    text: "Ctrl+Z magic ✨",
    emoji: "⏪",
  });
  return true;
}

// ---- State ----
let shelves = loadShelves();
let shelf = shelves.find((s) => s.id === shelfId);
let book = shelf?.books?.find((b) => b.id === bookId);

let currentChapter = null;
let currentPage = 1;
let tocQuery = "";
let lastPageByChapter = {};
const undoStack = [];
let pendingAnnotationSelection = null;
let editingAnnotationId = null;
let activeAnnotationSelection = null;

// TOC collapse state (not persisted)
const collapsedChapters = new Set();
// Tracks chapters the user explicitly expanded (so default-collapsed doesn't re-collapse them)
const expandedChapters = new Set();

function setLastVisited(ch, pageNum) {
  const key = chapterKey(ch);
  lastPageByChapter[key] = pageNum;
  if (book) book.lastPageByChapter = lastPageByChapter;
}

function getLastVisited(ch) {
  const key = chapterKey(ch);
  const n = lastPageByChapter[key];
  return typeof n === "number" && n >= 1 ? n : null;
}

function persistBookToStorage() {
  if (!shelf || !book) return;

  book.lastPageByChapter = lastPageByChapter;

  shelves = loadShelves();
  shelf = shelves.find((s) => s.id === shelfId);
  if (!shelf) return;

  const idx = shelf.books.findIndex((b) => b.id === bookId);
  if (idx === -1) return;

  shelf.books[idx] = book;
  shelf.updatedAt = Date.now();
  shelf.bookCount = Array.isArray(shelf.books) ? shelf.books.length : 0;

  shelves = shelves.map((s) => (s.id === shelf.id ? shelf : s));
  saveShelves(shelves);
}

function updateHeaderUI() {
  if (chapterInput) {
    chapterInput.value = currentChapter === null ? "" : String(currentChapter);
  }
  if (pagePill) pagePill.textContent = `Pg. ${currentPage}`;

  if (metaEl && shelf && book) {
    const volumeValue =
      typeof book.volume === "number" && Number.isFinite(book.volume)
        ? book.volume
        : typeof book.vol === "number" && Number.isFinite(book.vol)
        ? book.vol
        : null;
    const volText = volumeValue === null ? "Vol. —" : `Vol. ${volumeValue}`;

    const chapterValue =
      typeof currentChapter === "number"
        ? currentChapter
        : typeof book.currentChapter === "number"
        ? book.currentChapter
        : null;
    const chText = chapterValue === null ? "Ch. —" : `Ch. ${chapterValue}`;

    metaEl.textContent = `${
      shelf.name || "Shelf"
    } • ${volText} • ${chText} • Pg. ${currentPage}`;
  }
}

function ensurePageExists(ch, n) {
  if (!book) return;
  const existing = getPage(book, ch, n);
  if (existing) return;

  book.pages.push({
    id: makeId(),
    ch,
    n,
    title: "",
    content: "",
    updatedAt: Date.now(),
    annotations: [],
  });
  renumberChapter(book, ch);
}

function loadPageIntoEditor(ch, n) {
  if (!book || !editorEl) return;
  const pg = getPage(book, ch, n);
  if (!pg) return;

  currentChapter = ch;
  currentPage = n;

  book.currentChapter = currentChapter;
  book.currentPage = currentPage;
  setLastVisited(ch, n);

  // Keep ONLY the current chapter visible in the TOC
  const ck = chapterKey(ch);
  expandedChapters.clear();
  collapsedChapters.clear();
  collapsedChapters.delete(ck);
  expandedChapters.add(ck);

  editorSetHTML(pg.content || "");
  ensureTopLevelEntries();
  const firstInner = editorEl.querySelector(".entry .entry-inner");
  if (firstInner) setCaretInside(firstInner);
  if (pageTitleInput) pageTitleInput.value = pg.title || "";
  keepCaretBreathingRoom();
  clearRangeSelectionUI();

  // Auto-recognize glossary words on page load
  const added = autoApplyGlossaryToCurrentPage();
  if (added > 0) persistBookToStorage();

  refreshAnnotationsUI();
  resetAnnotationState({ closePanel: true });

  updateHeaderUI();
  renderPageLists();
  persistBookToStorage();
}

// ---- Save indicator ----
function markSaving() {
  if (statusEl) statusEl.textContent = "Saving…";
}
function markSaved() {
  if (statusEl) statusEl.textContent = "Saved";
}

// ---- Popovers ----
function closeAllPopovers() {
  if (pagePopover) pagePopover.classList.remove("open");
  if (shortcutsPopover) shortcutsPopover.classList.remove("open");
  if (pagePill) pagePill.classList.remove("is-open");
  if (shortcutsBtn) shortcutsBtn.classList.remove("is-open");
  if (pagePill) pagePill.setAttribute("aria-expanded", "false");
}

function openPopover(popEl, anchorEl) {
  if (!popEl || !anchorEl) return;
  closeAllPopovers();
  const r = anchorEl.getBoundingClientRect();
  popEl.style.top = `${window.scrollY + r.bottom + 8}px`;
  popEl.style.left = `${window.scrollX + r.left}px`;
  popEl.classList.add("open");
}

let confirmModalAction = null;
function openConfirmModalUI({
  title,
  text,
  confirmLabel = "Delete",
  onConfirm,
} = {}) {
  if (!confirmModal || !confirmModalConfirm) {
    if (typeof onConfirm === "function") onConfirm();
    return;
  }
  confirmModalAction = typeof onConfirm === "function" ? onConfirm : null;
  if (confirmModalTitle)
    confirmModalTitle.textContent = title || "Are you sure?";
  if (confirmModalText) confirmModalText.textContent = text || "";
  confirmModalConfirm.textContent = confirmLabel || "Delete";
  confirmModal.classList.add("open");
  confirmModal.setAttribute("aria-hidden", "false");
}

function closeConfirmModal() {
  if (!confirmModal) return;
  confirmModal.classList.remove("open");
  confirmModal.setAttribute("aria-hidden", "true");
  confirmModalAction = null;
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const clickedInsidePagePop = pagePopover && pagePopover.contains(t);
  const clickedInsideShort = shortcutsPopover && shortcutsPopover.contains(t);
  const clickedPagePill = pagePill && pagePill.contains(t);
  const clickedShortBtn = shortcutsBtn && shortcutsBtn.contains(t);

  if (
    clickedInsidePagePop ||
    clickedInsideShort ||
    clickedPagePill ||
    clickedShortBtn
  )
    return;
  closeAllPopovers();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllPopovers();
    if (confirmModal?.classList.contains("open")) closeConfirmModal();
  }

  const isUndoCombo =
    (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z";
  if (isUndoCombo) {
    if (undoLastAction()) {
      e.preventDefault();
    }
  }

  // Script formatting shortcuts: Cmd/Ctrl + 1/2/3/4
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey) {
    if (e.key === "1") {
      e.preventDefault();
      formatSelectionAs("narration");
    }
    if (e.key === "2") {
      e.preventDefault();
      formatSelectionAs("dialogue");
    }
    if (e.key === "3") {
      e.preventDefault();
      formatSelectionAs("sfx");
    }
    if (e.key === "4") {
      e.preventDefault();
      formatSelectionAs("thought");
    }
    if (e.key === "Escape") {
      e.preventDefault();
      formatSelectionAs("thought");
    }
  }
});

if (confirmModal) {
  confirmModal.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.dataset && target.dataset.closeConfirm === "true") {
      closeConfirmModal();
    }
  });
}

if (confirmModalConfirm) {
  confirmModalConfirm.addEventListener("click", () => {
    if (typeof confirmModalAction === "function") confirmModalAction();
    closeConfirmModal();
  });
}

// ---- Preview text ----
function pagePreviewText(page) {
  if (page?.title) return page.title;
  const rawHtml = (page?.content || "").trim();
  if (!rawHtml) return "(empty)";
  const raw = htmlToText(rawHtml);
  if (!raw) return "(empty)";
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > 42 ? `${oneLine.slice(0, 42)}…` : oneLine;
}

// ---- TOC drawer ----
function openTOC() {
  if (!tocEl || !tocBackdrop) return;
  tocEl.classList.add("open");
  tocBackdrop.classList.add("show");
  tocEl.setAttribute("aria-hidden", "false");
  renderPageLists();
  if (tocSearchInput) tocSearchInput.focus();
}

function closeTOC() {
  if (!tocEl || !tocBackdrop) return;
  tocEl.classList.remove("open");
  tocBackdrop.classList.remove("show");
  tocEl.setAttribute("aria-hidden", "true");
}

// ---- Render lists ----
function renderPageLists() {
  if (!book) return;

  // TOC
  if (tocBody) {
    tocBody.innerHTML = "";

    const chapters = getChapters(book);
    if (chapters.length === 0) chapters.push(null);

    chapters.forEach((ch) => {
      const pagesForCh = pagesInChapter(book, ch);

      // apply search
      const filtered = tocQuery
        ? pagesForCh.filter((p) => {
            const chName = ch === null ? "no chapter" : `chapter ${ch}`;
            const contentText = htmlToText(p.content || "");
            const hay = `${chName} pg ${p.n} ${p.title || ""} ${contentText}`
              .toLowerCase()
              .replace(/\s+/g, " ");
            return hay.includes(tocQuery);
          })
        : pagesForCh;

      if (tocQuery && filtered.length === 0) {
        const chHay = (
          ch === null ? "no chapter" : `chapter ${ch}`
        ).toLowerCase();
        if (!chHay.includes(tocQuery)) return;
      }

      const header = document.createElement("div");
      header.className = "toc-chapter";
      if (ch === currentChapter) header.classList.add("active");

      const title = document.createElement("div");
      title.className = "toc-chapter-title";
      title.textContent = ch === null ? "No chapter" : `Chapter ${ch}`;

      const caret = document.createElement("div");
      caret.className = "toc-chapter-caret";

      const key = chapterKey(ch);
      const defaultCollapsed = tocQuery ? false : ch !== currentChapter;
      const isCollapsed = tocQuery
        ? false
        : expandedChapters.has(key)
        ? false
        : collapsedChapters.has(key)
        ? true
        : defaultCollapsed;

      caret.textContent = isCollapsed ? "▸" : "▾";

      const actions = document.createElement("div");
      actions.className = "toc-chapter-actions";

      const delCh = document.createElement("button");
      delCh.className = "toc-chapter-delete";
      delCh.type = "button";
      delCh.setAttribute(
        "aria-label",
        ch === null ? "Delete No chapter" : `Delete Chapter ${ch}`
      );
      delCh.textContent = "🗑";
      delCh.addEventListener("click", (e) => {
        e.stopPropagation();
        openConfirmModalUI({
          title: ch === null ? 'Clear "No chapter"?' : `Delete Chapter ${ch}?`,
          text: "This removes every page inside that chapter. There's no undo for this (yet)!",
          confirmLabel: "Delete",
          onConfirm: () => deleteChapter(ch),
        });
      });

      actions.appendChild(caret);
      actions.appendChild(delCh);

      header.appendChild(title);
      header.appendChild(actions);

      const pagesWrap = document.createElement("div");
      pagesWrap.className = "toc-chapter-pages";
      if (isCollapsed) pagesWrap.classList.add("is-collapsed");

      header.addEventListener("click", () => {
        if (tocQuery) return;

        const key = chapterKey(ch);
        const currentlyCollapsed = expandedChapters.has(key)
          ? false
          : collapsedChapters.has(key)
          ? true
          : ch !== currentChapter;

        if (currentlyCollapsed) {
          collapsedChapters.delete(key);
          expandedChapters.add(key);
        } else {
          expandedChapters.delete(key);
          collapsedChapters.add(key);
        }

        renderPageLists();
      });

      filtered.forEach((p) => {
        const item = document.createElement("div");
        item.className = `toc-item${
          p.ch === currentChapter && p.n === currentPage ? " active" : ""
        }`;

        const labelWrap = document.createElement("div");
        labelWrap.className = "toc-label-wrap";

        const label = document.createElement("div");
        label.className = "toc-label";
        label.textContent = `Pg. ${p.n}`;

        const preview = document.createElement("div");
        preview.className = "toc-preview";
        preview.textContent = pagePreviewText(p);

        labelWrap.appendChild(label);
        labelWrap.appendChild(preview);

        const del = document.createElement("button");
        del.className = "toc-delete";
        del.type = "button";
        del.setAttribute("aria-label", `Delete page ${p.n}`);
        del.textContent = "🗑";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deletePage(p.ch, p.n);
        });

        item.appendChild(labelWrap);
        item.appendChild(del);

        item.addEventListener("click", () => {
          loadPageIntoEditor(p.ch, p.n);
          closeTOC();
        });

        pagesWrap.appendChild(item);
      });

      tocBody.appendChild(header);
      tocBody.appendChild(pagesWrap);
    });
  }

  // Dropdown: pages in current chapter
  if (pageList) {
    pageList.innerHTML = "";
    pagesInChapter(book, currentChapter).forEach((p) => {
      const item = document.createElement("div");
      item.className = "popover-item";
      item.textContent = `Pg. ${p.n}`;
      item.addEventListener("click", () => {
        loadPageIntoEditor(currentChapter, p.n);
        closeAllPopovers();
      });
      pageList.appendChild(item);
    });
  }
}

function deletePage(ch, n) {
  if (!book || !editorEl) return;

  const chapterPages = pagesInChapter(book, ch);
  if (chapterPages.length <= 1) {
    showToast({
      title: "Nope 😭",
      text: "You gotta keep at least one page in this chapter.",
      emoji: "📄",
    });
    return;
  }

  const pageToDelete = getPage(book, ch, n);
  if (!pageToDelete) return;

  setPageContent(book, currentChapter, currentPage, editorGetHTML());

  const pageClone = JSON.parse(JSON.stringify(pageToDelete));
  pushUndoAction({
    type: "page_delete",
    page: pageClone,
    insertionIndex: (pageClone.n || n) - 1,
  });

  book.pages = (book.pages || []).filter((p) => !(p.ch === ch && p.n === n));
  renumberChapter(book, ch);

  showToast({
    title: `Deleted Pg. ${n}`,
    text: "Pages renumbered so everything stays neat. Press Ctrl+Z to undo.",
    emoji: "🗑",
  });

  if (ch === currentChapter) {
    if (n < currentPage) currentPage -= 1;
    const last = pagesInChapter(book, ch).length;
    if (!getPage(book, ch, currentPage)) currentPage = Math.min(n, last);
  }

  book.currentChapter = currentChapter;
  book.currentPage = currentPage;
  book.updatedAt = Date.now();

  const pg =
    getPage(book, currentChapter, currentPage) ||
    getPage(book, currentChapter, 1);
  currentPage = pg?.n ?? 1;
  editorSetHTML(pg?.content || "");
  if (pageTitleInput) pageTitleInput.value = pg?.title || "";
  keepCaretBreathingRoom();
  clearRangeSelectionUI();

  // Auto-recognize glossary words on initial load
  const added = autoApplyGlossaryToCurrentPage();
  if (added > 0) persistBookToStorage();

  refreshAnnotationsUI();
  resetAnnotationState({ closePanel: true });

  updateHeaderUI();
  renderPageLists();
  persistBookToStorage();
  markSaved();
}

function deleteChapter(ch) {
  if (!book || !editorEl) return;
  clearUndoActions();

  const pages = pagesInChapter(book, ch);
  if (pages.length === 0) return;

  if ((book.pages || []).length <= pages.length) {
    showToast({
      title: "Nope 😭",
      text: "You can’t delete the last remaining chapter/pages.",
      emoji: "📚",
    });
    return;
  }

  setPageContent(book, currentChapter, currentPage, editorGetHTML());

  book.pages = (book.pages || []).filter((p) => p.ch !== ch);

  delete lastPageByChapter[chapterKey(ch)];
  book.lastPageByChapter = lastPageByChapter;

  showToast({
    title: ch === null ? "Cleared brain dump" : `Deleted Chapter ${ch}`,
    text: "All pages inside were removed.",
    emoji: "🗑",
  });

  if (currentChapter === ch) {
    const chapters = getChapters(book);
    const fallbackCh =
      chapters.find((c) => pagesInChapter(book, c).length > 0) ?? null;
    currentChapter = fallbackCh;

    const fallbackPages = pagesInChapter(book, currentChapter);
    currentPage = fallbackPages[0]?.n ?? 1;
    ensurePageExists(currentChapter, currentPage);

    loadPageIntoEditor(currentChapter, currentPage);
  } else {
    updateHeaderUI();
    renderPageLists();
    persistBookToStorage();
    markSaved();
  }
}

// ---- Init ----
if (!shelf || !book) {
  if (titleEl) titleEl.textContent = "Book not found";
  if (metaEl) metaEl.textContent = "Try going back and opening the book again.";
  if (editorEl) {
    editorEl.setAttribute("contenteditable", "false");
    editorEl.innerHTML = "";
  }
} else {
  ensurePagesModel(book);

  if (book.lastPageByChapter && typeof book.lastPageByChapter === "object") {
    lastPageByChapter = book.lastPageByChapter;
  }

  if (titleEl) titleEl.textContent = book.title || "Untitled";

  currentChapter =
    typeof book.currentChapter === "number" ? book.currentChapter : null;
  currentPage = typeof book.currentPage === "number" ? book.currentPage : 1;

  ensurePageExists(currentChapter, currentPage);

  if (!getPage(book, currentChapter, currentPage)) {
    if (getPage(book, currentChapter, 1)) {
      currentPage = 1;
    } else {
      const first = (book.pages || [])[0];
      currentChapter = first?.ch ?? null;
      currentPage = first?.n ?? 1;
    }
  }

  const pg =
    getPage(book, currentChapter, currentPage) || getPage(book, null, 1);
  currentChapter = pg?.ch ?? null;
  currentPage = pg?.n ?? 1;

  editorSetHTML(pg?.content || "");
  if (pageTitleInput) pageTitleInput.value = pg?.title || "";
  keepCaretBreathingRoom();
  clearRangeSelectionUI();
  refreshAnnotationsUI();
  resetAnnotationState({ closePanel: true });

  updateHeaderUI();
  renderPageLists();
}

// ---- Back ----
if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = `shelf.html?id=${shelfId}`;
  });
}

// ---- TOC open/close ----
if (tocBtn) tocBtn.addEventListener("click", openTOC);
if (tocClose) tocClose.addEventListener("click", closeTOC);
if (tocBackdrop) tocBackdrop.addEventListener("click", closeTOC);

// ---- TOC search ----
if (tocSearchInput) {
  tocSearchInput.addEventListener("input", () => {
    tocQuery = tocSearchInput.value.toLowerCase().trim();
    renderPageLists();
  });
}

// ---- Toolbar interactions ----
if (pagePill) {
  pagePill.addEventListener("click", () => {
    if (!pagePopover) return;
    const isOpen = pagePopover.classList.contains("open");
    if (isOpen) {
      closeAllPopovers();
      return;
    }
    pagePill.classList.add("is-open");
    pagePill.setAttribute("aria-expanded", "true");
    openPopover(pagePopover, pagePill);
    renderPageLists();
  });
}

if (shortcutsBtn) {
  shortcutsBtn.addEventListener("click", () => {
    if (!shortcutsPopover) return;
    const isOpen = shortcutsPopover.classList.contains("open");
    if (isOpen) {
      closeAllPopovers();
      return;
    }
    shortcutsBtn.classList.add("is-open");
    openPopover(shortcutsPopover, shortcutsBtn);
  });
}

if (newPageBtn) {
  newPageBtn.addEventListener("click", () => {
    if (!book || !editorEl) return;

    setPageContent(book, currentChapter, currentPage, editorGetHTML());

    const n = nextPageNumberInChapter(book, currentChapter);
    book.pages.push({
      id: makeId(),
      ch: currentChapter,
      n,
      title: "",
      content: "",
      updatedAt: Date.now(),
      annotations: [],
    });
    renumberChapter(book, currentChapter);

    currentPage = n;
    book.currentChapter = currentChapter;
    book.currentPage = currentPage;

    editorSetHTML("");
    if (pageTitleInput) pageTitleInput.value = "";
    keepCaretBreathingRoom();
    clearRangeSelectionUI();
    refreshAnnotationsUI();
    resetAnnotationState({ closePanel: true });

    updateHeaderUI();
    renderPageLists();
    persistBookToStorage();
    markSaved();
  });
}

// Chapter input: commit chapter change ONLY on Enter or blur/change
if (chapterInput) {
  const normalizeChapter = (raw) => {
    const s = (raw ?? "").trim();
    if (s === "") return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, n);
  };

  const commitChapterChange = () => {
    if (!book || !editorEl) return;

    setPageContent(book, currentChapter, currentPage, editorGetHTML());

    const nextCh = normalizeChapter(chapterInput.value);

    const changed =
      (currentChapter === null && nextCh !== null) ||
      (currentChapter !== null && nextCh === null) ||
      (currentChapter !== null && nextCh !== null && currentChapter !== nextCh);

    if (!changed) {
      updateHeaderUI();
      persistBookToStorage();
      return;
    }

    currentChapter = nextCh;

    const existingPages = pagesInChapter(book, currentChapter);

    if (existingPages.length === 0) {
      currentPage = 1;
      ensurePageExists(currentChapter, 1);
      loadPageIntoEditor(currentChapter, 1);
      showToast({
        title:
          currentChapter === null
            ? "Chapter cleared"
            : `Chapter set to ${currentChapter}`,
        text: "New chapter created — starting at Pg. 1.",
        emoji: "📚",
      });
      return;
    }

    const isBlank = (p) => {
      const t = (p?.title || "").trim();
      const c = htmlToText(p?.content || "");
      return t === "" && c === "";
    };

    const lastPageNum = Math.max(...existingPages.map((p) => p.n));
    const lastPg = getPage(book, currentChapter, lastPageNum);

    if (lastPg && isBlank(lastPg)) {
      currentPage = lastPageNum;
      loadPageIntoEditor(currentChapter, currentPage);
      showToast({
        title:
          currentChapter === null
            ? "Chapter cleared"
            : `Chapter ${currentChapter}`,
        text: `You’re on a fresh page already — Pg. ${currentPage}.`,
        emoji: "📝",
      });
      return;
    }

    const nextN = nextPageNumberInChapter(book, currentChapter);
    book.pages.push({
      id: makeId(),
      ch: currentChapter,
      n: nextN,
      title: "",
      content: "",
      updatedAt: Date.now(),
      annotations: [],
    });
    renumberChapter(book, currentChapter);

    currentPage = nextN;
    book.currentChapter = currentChapter;
    book.currentPage = currentPage;
    persistBookToStorage();

    loadPageIntoEditor(currentChapter, currentPage);
    showToast({
      title:
        currentChapter === null ? "No chapter" : `Chapter ${currentChapter}`,
      text: `New page created — Pg. ${currentPage}.`,
      emoji: "✨",
    });
  };

  chapterInput.addEventListener("change", commitChapterChange);
  chapterInput.addEventListener("blur", commitChapterChange);
  chapterInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      chapterInput.blur();
      commitChapterChange();
    }
  });
}

// Page title input
if (pageTitleInput) {
  pageTitleInput.addEventListener("input", () => {
    if (!book) return;
    setPageTitle(
      book,
      currentChapter,
      currentPage,
      pageTitleInput.value.trim()
    );
    persistBookToStorage();
    renderPageLists();
  });
}

// ---- Autosave (debounced) ----
let saveTimer = null;

if (editorEl) {
  editorEl.addEventListener("input", () => {
    if (!shelf || !book) return;

    clearUndoActions();
    keepCaretBreathingRoom();
    ensureTopLevelEntries();
    clearRangeSelectionUI();

    markSaving();
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
      shelves = loadShelves();
      shelf = shelves.find((s) => s.id === shelfId);
      if (!shelf) return;

      const idx = shelf.books.findIndex((b) => b.id === bookId);
      if (idx === -1) return;

      ensurePagesModel(book);
      setPageContent(book, currentChapter, currentPage, editorGetHTML());
      book.updatedAt = Date.now();
      book.currentChapter = currentChapter;
      book.currentPage = currentPage;
      book.lastPageByChapter = lastPageByChapter;

      shelf.books[idx] = {
        ...shelf.books[idx],
        pages: book.pages,
        currentChapter: book.currentChapter,
        currentPage: book.currentPage,
        lastPageByChapter: book.lastPageByChapter,
        updatedAt: book.updatedAt,
      };

      shelf.updatedAt = Date.now();
      shelf.bookCount = Array.isArray(shelf.books) ? shelf.books.length : 0;

      shelves = shelves.map((s) => (s.id === shelf.id ? shelf : s));
      saveShelves(shelves);

      renderPageLists();
      markSaved();
    }, 250);
  });

  // Only show block boundaries when selecting a bigger chunk
  const selectionTouchesEditor = (range) => {
    if (!range) return false;
    return (
      editorEl.contains(range.startContainer) ||
      editorEl.contains(range.endContainer) ||
      editorEl === range.commonAncestorContainer ||
      editorEl.contains(range.commonAncestorContainer)
    );
  };

  const handleSelectionTracking = () => {
    const sel = document.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!selectionTouchesEditor(range)) {
      clearRangeSelectionUI();
      hideAnnotateButton();
      pendingAnnotationSelection = null;
      return false;
    }
    applyRangeSelectionUI();
    updateAnnotateButtonFromSelection();
    return true;
  };

  document.addEventListener("selectionchange", handleSelectionTracking);
  document.addEventListener("mouseup", handleSelectionTracking);
  document.addEventListener("keyup", (evt) => {
    if (evt.key === "Shift") return;
    handleSelectionTracking();
  });

  // Enter = new block (prevents “one giant block” merging)
  editorEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!editorEl.contains(sel.anchorNode)) return;

    const currentEntry = nearestEntry(sel.anchorNode);
    if (!currentEntry) return;

    e.preventDefault();

    const type = normalizeType(currentEntry.dataset.type);
    const inner = currentEntry.querySelector(".entry-inner") || currentEntry;

    const range = sel.getRangeAt(0);

    // Extract everything AFTER caret into a new entry
    const extractRange = range.cloneRange();
    // IMPORTANT: keep extraction bounded to the entry's inner content
    try {
      extractRange.setStart(range.startContainer, range.startOffset);
      extractRange.setEnd(inner, inner.childNodes.length);
    } catch {
      // If the caret container is weird, fall back to "after caret" to end of inner
      extractRange.selectNodeContents(inner);
      extractRange.collapse(false);
    }

    const frag = extractRange.extractContents();

    // If the current entry becomes empty, keep a <br> so the caret/selection stays sane
    if ((inner.innerText || "").trim() === "") {
      inner.innerHTML = "<br>";
    }

    const newEntry = createEntryBlock(type, "");
    const newInner = newEntry.querySelector(".entry-inner");

    // Move the remainder into the new entry
    if (frag && frag.childNodes && frag.childNodes.length) {
      newInner.appendChild(frag);
    }

    // If the new entry is empty, also keep a <br>
    if ((newInner.innerText || "").trim() === "") {
      newInner.innerHTML = "<br>";
    }

    currentEntry.insertAdjacentElement("afterend", newEntry);

    // Keep the structure consistent so selection/annotation logic can find entries
    assignIdsToAllEntries();
    refreshEntryTypeClasses();

    // caret to start of new entry
    const caretRange = document.createRange();
    caretRange.selectNodeContents(newInner);
    caretRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caretRange);

    keepCaretBreathingRoom();
    clearRangeSelectionUI();
    hideAnnotateButton();
  });

  // Plain text paste
  editorEl.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData(
      "text/plain"
    );
    document.execCommand("insertText", false, text);
  });

  editorEl.addEventListener("blur", () => {
    ensureTopLevelEntries();
    clearRangeSelectionUI();
    renderPageLists();
  });

  editorEl.addEventListener("mouseup", () => {
    updateAnnotateButtonFromSelection();
  });

  editorEl.addEventListener("keyup", () => {
    updateAnnotateButtonFromSelection();
  });

  editorEl.addEventListener("mousedown", () => {
    hideAnnotateButton();
  });

  editorEl.addEventListener("click", (e) => {
    const highlight = e.target.closest(".annotation-highlight");
    if (!highlight) return;
    const id = highlight.dataset.annotationId;
    if (id) {
      e.preventDefault();
      openAnnotationForEdit(id);
    }
  });
}

if (annotateBtn) {
  annotateBtn.addEventListener("click", () => {
    if (!pendingAnnotationSelection) return;
    const sel = document.getSelection();
    const activeRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (activeRange) {
      collapseSelectionToRangeEnd(activeRange);
    }
    openAnnotationForSelection(pendingAnnotationSelection);
    hideAnnotateButton();
  });
}

if (annotationCloseBtn) {
  annotationCloseBtn.addEventListener("click", () => {
    resetAnnotationState({ closePanel: true });
  });
}

if (annotationCancelBtn) {
  annotationCancelBtn.addEventListener("click", () => {
    resetAnnotationState({ closePanel: true });
  });
}

if (annotationForm) {
  annotationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveAnnotationFromForm();
  });
}

