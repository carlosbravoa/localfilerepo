"use strict";

const $ = (id) => document.getElementById(id);
const fileList = $("fileList");
const crumbs = $("crumbs");
const dropzone = $("dropzone");
const dropOverlay = $("dropOverlay");
const emptyState = $("empty");
const diskInfo = $("diskInfo");

let cwd = ""; // current folder, relative to share root

// --------------------------------------------------------------------------- //
// Helpers
// --------------------------------------------------------------------------- //
function fmtSize(bytes) {
  if (bytes === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const n = bytes / Math.pow(1024, i);
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

function fmtDate(epoch) {
  const d = new Date(epoch * 1000);
  const now = new Date();
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function joinPath(dir, name) {
  return dir ? `${dir}/${name}` : name;
}

function svgIcon(kind) {
  if (kind === "folder") {
    return `<svg class="icon folder" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>`;
  }
  return `<svg class="icon file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
}

const ICONS = {
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
  rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
};

let toastTimer = null;
function toast(msg, isError) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// --------------------------------------------------------------------------- //
// Listing & rendering
// --------------------------------------------------------------------------- //
async function load(path) {
  cwd = path || "";
  let data;
  try {
    const r = await fetch(`/api/list?path=${encodeURIComponent(cwd)}`);
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    data = await r.json();
  } catch (e) {
    toast("Could not load folder: " + e.message, true);
    return;
  }
  cwd = data.path;
  renderCrumbs();
  renderList(data.items);
  const d = data.disk;
  diskInfo.textContent =
    `${fmtSize(d.used)} used · ${fmtSize(d.free)} free of ${fmtSize(d.total)}`;
}

function renderCrumbs() {
  crumbs.innerHTML = "";
  const parts = cwd ? cwd.split("/") : [];
  const home = document.createElement("a");
  home.textContent = "🏠 Home";
  home.onclick = () => load("");
  if (!parts.length) home.classList.add("current");
  crumbs.appendChild(home);
  let acc = "";
  parts.forEach((p, i) => {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "/";
    crumbs.appendChild(sep);
    acc = acc ? `${acc}/${p}` : p;
    const a = document.createElement("a");
    a.textContent = p;
    const target = acc;
    a.onclick = () => load(target);
    if (i === parts.length - 1) a.classList.add("current");
    crumbs.appendChild(a);
  });
}

function renderList(items) {
  fileList.innerHTML = "";
  emptyState.hidden = items.length > 0;
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "file-row";

    const nameCell = document.createElement("div");
    nameCell.className = "name-cell " + (it.is_dir ? "folder" : "file");
    nameCell.innerHTML = svgIcon(it.is_dir ? "folder" : "file") +
      `<span class="label"></span>`;
    nameCell.querySelector(".label").textContent = it.name;
    if (it.is_dir) {
      nameCell.querySelector(".label").onclick = () => load(it.path);
    } else {
      const lbl = nameCell.querySelector(".label");
      lbl.style.cursor = "pointer";
      lbl.title = "Download";
      lbl.onclick = () => download(it.path);
    }

    const sizeCell = document.createElement("div");
    sizeCell.className = "col-size";
    sizeCell.textContent = it.is_dir ? "—" : fmtSize(it.size);

    const modCell = document.createElement("div");
    modCell.className = "col-mod";
    modCell.textContent = fmtDate(it.modified);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (!it.is_dir) {
      actions.appendChild(iconButton(ICONS.download, "Download", () => download(it.path)));
    }
    actions.appendChild(iconButton(ICONS.rename, "Rename", () => rename(it)));
    actions.appendChild(iconButton(ICONS.trash, "Delete", () => remove(it), true));

    li.append(nameCell, sizeCell, modCell, actions);
    fileList.appendChild(li);
  }
}

function iconButton(svg, title, onClick, danger) {
  const b = document.createElement("button");
  b.className = "icon-btn" + (danger ? " danger" : "");
  b.title = title;
  b.innerHTML = svg;
  b.onclick = onClick;
  return b;
}

// --------------------------------------------------------------------------- //
// File operations
// --------------------------------------------------------------------------- //
function download(path) {
  window.location.href = `/api/download?path=${encodeURIComponent(path)}`;
}

async function remove(it) {
  if (!confirm(`Delete ${it.is_dir ? "folder" : "file"} "${it.name}"?` +
    (it.is_dir ? "\nEverything inside it will be removed." : ""))) return;
  try {
    const r = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: it.path }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    toast(`Deleted "${it.name}"`);
    load(cwd);
  } catch (e) {
    toast("Delete failed: " + e.message, true);
  }
}

async function rename(it) {
  const name = prompt("Rename to:", it.name);
  if (!name || name === it.name) return;
  try {
    const r = await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: it.path, name }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    load(cwd);
  } catch (e) {
    toast("Rename failed: " + e.message, true);
  }
}

async function makeFolder() {
  const name = prompt("New folder name:");
  if (!name) return;
  try {
    const r = await fetch("/api/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: joinPath(cwd, name) }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    load(cwd);
  } catch (e) {
    toast("Could not create folder: " + e.message, true);
  }
}

// --------------------------------------------------------------------------- //
// Upload queue (raw streamed PUT, with progress)
// --------------------------------------------------------------------------- //
const uploadsBox = $("uploads");
const uploadList = $("uploadList");
const uploadsTitle = $("uploadsTitle");
let queue = [];
let active = 0;
const MAX_CONCURRENT = 3;
let pending = 0;

$("uploadsClose").onclick = () => {
  uploadsBox.hidden = true;
  uploadList.innerHTML = "";
  queue = [];
};

function enqueue(file, relPath) {
  // relPath is the destination path relative to current cwd (may include subdirs)
  const dest = joinPath(cwd, relPath);
  const row = document.createElement("li");
  row.className = "up-item";
  row.innerHTML =
    `<div class="up-top"><span class="up-name"></span><span class="up-pct">0%</span></div>` +
    `<div class="bar"><span></span></div>`;
  row.querySelector(".up-name").textContent = relPath;
  uploadList.appendChild(row);
  queue.push({ file, dest, row });
  pending++;
  uploadsBox.hidden = false;
  updateTitle();
  pump();
}

function updateTitle() {
  uploadsTitle.textContent = pending > 0
    ? `Uploading ${pending} item${pending === 1 ? "" : "s"}…`
    : "Uploads complete";
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    active++;
    sendOne(job);
  }
}

function sendOne({ file, dest, row }) {
  const pct = row.querySelector(".up-pct");
  const bar = row.querySelector(".bar > span");
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", `/api/upload?path=${encodeURIComponent(dest)}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const p = Math.round((e.loaded / e.total) * 100);
      bar.style.width = p + "%";
      pct.textContent = p + "%";
    }
  };
  const finish = (ok, msg) => {
    active--;
    pending--;
    row.classList.add(ok ? "done" : "error");
    if (ok) { bar.style.width = "100%"; pct.textContent = "✓"; }
    else { pct.textContent = msg || "failed"; }
    updateTitle();
    if (ok && pending === 0) load(cwd);
    else if (ok) refreshSoon();
    pump();
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) finish(true);
    else {
      let m = "failed";
      try { m = JSON.parse(xhr.responseText).error || m; } catch (_) {}
      finish(false, m);
    }
  };
  xhr.onerror = () => finish(false, "network error");
  xhr.send(file);
}

let refreshTimer = null;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => load(cwd), 600);
}

// --------------------------------------------------------------------------- //
// Drag & drop (files and folders) + file picker
// --------------------------------------------------------------------------- //
// Recursively walk a dropped directory entry, enqueueing files with their path.
function walkEntry(entry, prefix) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        enqueue(file, prefix + entry.name);
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (!batch.length) {
            Promise.all(all.map((e) => walkEntry(e, prefix + entry.name + "/")))
              .then(resolve);
            return;
          }
          all.push(...batch);
          readBatch(); // directories may return entries in multiple batches
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

let dragDepth = 0;
function showOverlay(show) {
  dropOverlay.hidden = !show;
  dropzone.classList.toggle("dragging", show);
}

window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  showOverlay(true);
});
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault();
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; showOverlay(false); }
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  showOverlay(false);
  const dt = e.dataTransfer;
  if (!dt) return;

  // Prefer the entry API so dropped folders are walked recursively.
  const items = dt.items ? [...dt.items] : [];
  const entries = items
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, "");
  } else if (dt.files && dt.files.length) {
    for (const f of dt.files) enqueue(f, f.name);
  }
});

// Upload button / file picker
$("uploadBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => {
  for (const f of e.target.files) enqueue(f, f.name);
  e.target.value = "";
};
$("newFolderBtn").onclick = makeFolder;

// --------------------------------------------------------------------------- //
load("");
