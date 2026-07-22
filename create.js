// Encrypted QR creator
import qrcode from 'qrcode-generator';
import { encryptText } from './crypto.js';

const HISTORY_KEY = 'snd_create_history';
const MAX_HISTORY = 12;

const $ = (id) => document.getElementById(id);
const form = $('create-form');
const msg = $('msg');
const msgCount = $('msg-count');
const pwd = $('pwd');
const pwd2 = $('pwd2');
const size = $('size');
const sizeVal = $('size-val');
const level = $('level');
const generateBtn = $('generate-btn');
const resetBtn = $('reset-btn');
const formNote = $('form-note');

const resultEmpty = $('result-empty');
const resultContent = $('result-content');
const resultError = $('result-error');
const resultErrorMsg = $('result-error-msg');
const resultErrorTitle = $('result-error-title');
const qrOut = $('qr-out');
const dlBtn = $('dl-btn');
const copyImgBtn = $('copy-img-btn');
const againBtn = $('again-btn');

const historyList = $('history-list');
const clearHistoryBtn = $('clear-history');
const rawPreviewText = $('raw-preview-text');
const copyRawBtn = $('copy-raw-btn');

let currentDataUrl = null;
let currentEncrypted = null;

// char counter
msg.addEventListener('input', () => {
  const n = msg.value.length;
  msgCount.textContent = `${n} char${n === 1 ? '' : 's'}`;
  if (n > 800) {
    msgCount.classList.add('is-warn');
    msgCount.textContent += ' — keep under 1000 for reliable scanning';
  } else {
    msgCount.classList.remove('is-warn');
  }
});

// size slider
size.addEventListener('input', () => {
  sizeVal.textContent = `${size.value} px`;
});

// password toggles
document.querySelectorAll('.pwd-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

resetBtn.addEventListener('click', () => {
  form.reset();
  msgCount.textContent = '0 chars';
  msgCount.classList.remove('is-warn');
  sizeVal.textContent = '320 px';
  showEmpty();
  formNote.textContent = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.classList.remove('is-error');

  if (pwd.value !== pwd2.value) {
    showError('Passwords don’t match', 'Please type the same password in both fields.');
    return;
  }
  if (pwd.value.length < 4) {
    showError('Password too short', 'Use at least 4 characters for a stronger secret.');
    return;
  }
  const text = msg.value.trim();
  if (!text) {
    showError('Empty message', 'Type the secret message you want to encode first.');
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = 'Encrypting…';

  try {
    const encrypted = await encryptText(text, pwd.value);
    const eccLevel = level.value;
    const px = parseInt(size.value, 10);

    // qrcode-generator: typeNumber 0 = auto-select best version
    const qr = qrcode(0, eccLevel);
    qr.addData(encrypted);
    qr.make();
    const cellSize = Math.max(4, Math.floor(px / qr.getModuleCount()));
    const dataUrl = qr.createDataURL(cellSize, 2);

    currentDataUrl = dataUrl;
    currentEncrypted = encrypted;
    qrOut.src = dataUrl;
    rawPreviewText.textContent = encrypted;
    resultEmpty.hidden = true;
    resultError.hidden = true;
    resultContent.hidden = false;
    formNote.textContent = 'QR code generated. Save the PNG or copy it.';
    formNote.classList.remove('is-error');

    addHistory(text, encrypted);
  } catch (err) {
    console.error(err);
    showError('Generation failed', err && err.message ? err.message : 'Something went wrong while creating the QR.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg> Generate QR';
  }
});

function showEmpty() {
  resultEmpty.hidden = false;
  resultContent.hidden = true;
  resultError.hidden = true;
  currentDataUrl = null;
  currentEncrypted = null;
}

function showError(title, msg) {
  resultEmpty.hidden = true;
  resultContent.hidden = true;
  resultErrorTitle.textContent = title;
  resultErrorMsg.textContent = msg;
  resultError.hidden = false;
  currentDataUrl = null;
  currentEncrypted = null;
}

againBtn.addEventListener('click', () => {
  showEmpty();
  formNote.textContent = '';
});

copyRawBtn.addEventListener('click', async () => {
  if (!currentEncrypted) return;
  try {
    await navigator.clipboard.writeText(currentEncrypted);
    flash(copyRawBtn, 'Copied!');
  } catch {
    flash(copyRawBtn, 'Copy failed');
  }
});

// download
dlBtn.addEventListener('click', () => {
  if (!currentDataUrl) return;
  const a = document.createElement('a');
  a.href = currentDataUrl;
  a.download = `secret-qr-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// copy image to clipboard
copyImgBtn.addEventListener('click', async () => {
  if (!currentDataUrl) return;
  try {
    const res = await fetch(currentDataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    flash(copyImgBtn, 'Copied!');
  } catch {
    flash(copyImgBtn, 'Copy failed');
  }
});

function flash(btn, label) {
  const orig = btn.textContent;
  btn.textContent = label;
  setTimeout(() => (btn.textContent = orig), 1400);
}

// ---------- History (local storage only) ----------
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function addHistory(text, encrypted) {
  const items = loadHistory();
  const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
  items.unshift({ preview, at: Date.now(), len: encrypted.length });
  if (items.length > MAX_HISTORY) items.length = MAX_HISTORY;
  saveHistory(items);
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  if (!items.length) {
    historyList.innerHTML = '<li class="history-empty">Nothing yet — your created QR codes will be listed here.</li>';
    return;
  }
  historyList.innerHTML = items
    .map((it) => {
      const time = formatTime(it.at);
      return `<li class="history-item">
        <div class="history-item-main">
          <span class="history-item-type">Encrypted</span>
          <span class="history-item-text">${escapeHtml(it.preview)}</span>
        </div>
        <div class="history-item-meta">
          <span class="history-item-time">${time}</span>
        </div>
      </li>`;
    })
    .join('');
}

clearHistoryBtn.addEventListener('click', () => {
  saveHistory([]);
  renderHistory();
});

function formatTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today ${time}` : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Mobile nav ----------
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.classList.toggle('is-active', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// ---------- Footer year ----------
const yearEl = document.querySelector('[data-year]');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// ---------- Init ----------
renderHistory();
