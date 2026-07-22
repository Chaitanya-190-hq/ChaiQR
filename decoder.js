// QR code decoder — client-side, GitHub Pages friendly
import jsQR from 'jsqr';
import { isEncrypted, decryptText } from './crypto.js';

const HISTORY_KEY = 'snd_qr_history';
const MAX_HISTORY = 12;

const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('file-input');
const pickBtn = $('pick-btn');
const clearBtn = $('clear-btn');
const previewWrap = $('preview-wrap');
const previewImg = $('preview-img');

const resultCard = $('result-card');
const resultEmpty = $('result-empty');
const resultContent = $('result-content');
const resultError = $('result-error');
const resultErrorMsg = $('result-error-msg');
const resultType = $('result-type');
const resultText = $('result-text');
const copyBtn = $('copy-btn');
const openBtn = $('open-btn');
const shareBtn = $('share-btn');
const againBtn = $('decode-again');

const decryptPanel = $('decrypt-panel');
const decryptPwd = $('decrypt-pwd');
const decryptBtn = $('decrypt-btn');
const decryptCancel = $('decrypt-cancel');
const decryptNote = $('decrypt-note');

let lastEncrypted = null;

const historyList = $('history-list');
const clearHistory = $('clear-history');

const tabs = Array.from(document.querySelectorAll('.mode-tab'));
const panels = Array.from(document.querySelectorAll('.mode-panel'));

const camStart = $('cam-start');
const camStop = $('cam-stop');
const camSwitch = $('cam-switch');
const camNote = $('cam-note');
const camVideo = $('camera-video');
const camEmpty = $('camera-empty');

let stream = null;
let scanTimer = null;
let facing = 'environment';
let scanning = false;

// ---------- Mode switching ----------
tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

function switchMode(mode) {
  tabs.forEach((t) => {
    const active = t.dataset.mode === mode;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('is-active', p.id === `panel-${mode}`));
  if (mode !== 'camera') stopCamera();
}

// ---------- Image decoding ----------
pickBtn.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleFile(file);
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-drag');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-drag');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});

clearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  previewWrap.hidden = true;
  previewImg.src = '';
  clearBtn.hidden = true;
  showEmpty();
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('That file is not an image. Please choose a PNG, JPG, or similar image file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const url = e.target.result;
    previewImg.src = url;
    previewWrap.hidden = false;
    clearBtn.hidden = false;
    decodeFromUrl(url);
  };
  reader.onerror = () => showError('Could not read the selected file.');
  reader.readAsDataURL(file);
}

function decodeFromUrl(url) {
  showLoading();
  const img = new Image();
  img.onload = () => decodeImage(img);
  img.onerror = () => showError('The image could not be loaded.');
  img.src = url;
}

function decodeImage(img) {
  try {
    const canvas = document.createElement('canvas');
    const maxDim = 1500;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height);
    const code = jsQR(data.data, width, height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) {
      showResult(code.data);
    } else {
      showError('No QR code was detected. Try a sharper, well-lit image with the code centred.');
    }
  } catch (err) {
    console.error(err);
    showError('Something went wrong while decoding the image.');
  }
}

// ---------- Camera decoding ----------
camStart.addEventListener('click', startCamera);
camStop.addEventListener('click', stopCamera);
camSwitch.addEventListener('click', flipCamera);

async function startCamera() {
  camNote.textContent = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camNote.textContent = 'Camera access is not supported in this browser.';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    camVideo.srcObject = stream;
    await camVideo.play();
    camEmpty.hidden = true;
    camStart.disabled = true;
    camStop.disabled = false;
    camSwitch.disabled = false;
    scanning = true;
    scanLoop();
    camNote.textContent = 'Point your camera at a QR code.';
  } catch (err) {
    const msg =
      err && err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow access in your browser settings.'
        : 'Could not start the camera. ' + (err && err.message ? err.message : '');
    camNote.textContent = msg;
  }
}

function stopCamera() {
  scanning = false;
  if (scanTimer) {
    cancelAnimationFrame(scanTimer);
    scanTimer = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  camVideo.srcObject = null;
  camEmpty.hidden = false;
  camStart.disabled = false;
  camStop.disabled = true;
  camSwitch.disabled = true;
  camNote.textContent = '';
}

async function flipCamera() {
  facing = facing === 'environment' ? 'user' : 'environment';
  stopCamera();
  await startCamera();
}

function scanLoop() {
  if (!scanning) return;
  if (camVideo.readyState === camVideo.HAVE_ENOUGH_DATA) {
    const w = camVideo.videoWidth;
    const h = camVideo.videoHeight;
    if (w && h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(camVideo, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const code = jsQR(data.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        showResult(code.data);
        stopCamera();
        return;
      }
    }
  }
  scanTimer = requestAnimationFrame(scanLoop);
}

// ---------- Result handling ----------
function showEmpty() {
  resultEmpty.hidden = false;
  resultContent.hidden = true;
  resultError.hidden = true;
  decryptPanel.hidden = true;
  lastEncrypted = null;
}

function showLoading() {
  resultEmpty.hidden = true;
  resultError.hidden = true;
  resultContent.hidden = true;
  decryptPanel.hidden = true;
  resultEmpty.innerHTML =
    '<span class="result-empty-icon" aria-hidden="true"><span class="spinner"></span></span><h2>Decoding…</h2><p>Reading the QR pattern from your image.</p>';
  resultEmpty.hidden = false;
}

function detectType(text) {
  if (isEncrypted(text)) return 'Encrypted';
  if (/^https?:\/\//i.test(text)) return 'URL';
  if (/^mailto:/i.test(text)) return 'Email';
  if (/^tel:/i.test(text)) return 'Phone';
  if (/^WIFI:/i.test(text)) return 'Wi-Fi';
  if (/^BEGIN:VCARD/i.test(text)) return 'Contact';
  if (/^geo:/i.test(text)) return 'Location';
  if (/^smsto?:/i.test(text)) return 'SMS';
  return 'Text';
}

function showResult(text) {
  const type = detectType(text);

  if (isEncrypted(text)) {
    lastEncrypted = text;
    resultEmpty.hidden = true;
    resultError.hidden = true;
    resultContent.hidden = true;
    decryptPanel.hidden = false;
    decryptPwd.value = '';
    decryptNote.textContent = '';
    decryptNote.classList.remove('is-error');
    resultCard.classList.add('is-found');
    addHistory(text, 'Encrypted');
    return;
  }

  resultText.textContent = text;
  resultType.textContent = type;

  const isUrl = /^https?:\/\//i.test(text);
  openBtn.hidden = !isUrl;
  if (isUrl) openBtn.href = text;

  resultEmpty.hidden = true;
  resultError.hidden = true;
  decryptPanel.hidden = true;
  resultContent.hidden = false;
  resultCard.classList.add('is-found');

  addHistory(text, type);
}

function showError(msg) {
  resultEmpty.hidden = true;
  resultContent.hidden = true;
  decryptPanel.hidden = true;
  resultErrorMsg.textContent = msg;
  resultError.hidden = false;
  resultCard.classList.remove('is-found');
}

copyBtn.addEventListener('click', async () => {
  const text = resultText.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashButton(copyBtn, 'Copied');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    flashButton(copyBtn, 'Copied');
  }
});

shareBtn.addEventListener('click', async () => {
  const text = resultText.textContent;
  if (!text) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Decoded QR', text });
    } catch {
      /* cancelled */
    }
  } else {
    copyBtn.click();
  }
});

againBtn.addEventListener('click', () => {
  showEmpty();
  fileInput.value = '';
  previewWrap.hidden = true;
  clearBtn.hidden = true;
  switchMode('image');
});

// ---------- Encrypted QR handling ----------
decryptBtn.addEventListener('click', async () => {
  if (!lastEncrypted) return;
  const password = decryptPwd.value;
  if (!password) {
    decryptNote.textContent = 'Please enter the password.';
    decryptNote.classList.add('is-error');
    return;
  }
  decryptBtn.disabled = true;
  decryptBtn.textContent = 'Decrypting…';
  decryptNote.textContent = '';
  decryptNote.classList.remove('is-error');
  try {
    const plain = await decryptText(lastEncrypted, password);
    resultText.textContent = plain;
    resultType.textContent = 'Decrypted';
    openBtn.hidden = true;
    decryptPanel.hidden = true;
    resultContent.hidden = false;
    // update the most recent history entry from Encrypted to Decrypted
    const items = loadHistory();
    if (items.length && items[0].text === lastEncrypted) {
      items[0].text = plain;
      items[0].type = 'Decrypted';
      saveHistory(items);
      renderHistory();
    }
  } catch (err) {
    decryptNote.textContent = 'Wrong password, or the QR is corrupted.';
    decryptNote.classList.add('is-error');
  } finally {
    decryptBtn.disabled = false;
    decryptBtn.textContent = 'Decrypt';
  }
});

decryptCancel.addEventListener('click', () => {
  showEmpty();
});

decryptPwd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') decryptBtn.click();
});

document.querySelectorAll('.pwd-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

function flashButton(btn, label) {
  const original = btn.textContent;
  btn.textContent = label;
  btn.classList.add('is-flash');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('is-flash');
  }, 1400);
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
    /* storage full or disabled */
  }
}

function addHistory(text, type) {
  const items = loadHistory();
  if (items.length && items[0].text === text) return;
  items.unshift({ text, type, at: Date.now() });
  if (items.length > MAX_HISTORY) items.length = MAX_HISTORY;
  saveHistory(items);
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  if (!items.length) {
    historyList.innerHTML = '<li class="history-empty">No scans yet — your decoded results will show up here.</li>';
    return;
  }
  historyList.innerHTML = items
    .map((it) => {
      const safe = escapeHtml(it.text);
      const time = formatTime(it.at);
      const isUrl = /^https?:\/\//i.test(it.text);
      const action = isUrl
        ? `<a href="${escapeAttr(it.text)}" target="_blank" rel="noopener noreferrer" class="history-open">Open</a>`
        : `<button class="history-copy" data-text="${escapeAttr(it.text)}" type="button">Copy</button>`;
      return `<li class="history-item">
          <div class="history-item-main">
            <span class="history-item-type">${it.type}</span>
            <span class="history-item-text">${truncate(safe, 80)}</span>
          </div>
          <div class="history-item-meta">
            <span class="history-item-time">${time}</span>
            ${action}
          </div>
        </li>`;
    })
    .join('');

  historyList.querySelectorAll('.history-copy').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.text);
        const orig = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = orig), 1200);
      } catch {
        /* ignore */
      }
    })
  );
}

clearHistory.addEventListener('click', () => {
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

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------- Mobile nav (shared) ----------
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
