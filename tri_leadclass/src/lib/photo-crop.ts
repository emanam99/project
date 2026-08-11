/** Portal node offcanvas/crop ke body agar tidak terjebak stacking context layout. */
export function portalOverlayNodes(): void {
  const selectors = '.admin-offcanvas, .admin-offcanvas-backdrop, #tri-photo-crop';
  document.querySelectorAll(selectors).forEach((el) => {
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });
}

export type PhotoCropAspect = 'square' | 'cover' | 'circle';

export interface PhotoCropOptions {
  aspect?: PhotoCropAspect;
  title?: string;
}

type ResolveFn = (file: File | null) => void;

interface CropState {
  scale: number;
  rotation: number;
  panX: number;
  panY: number;
}

let mounted = false;
let pendingResolve: ResolveFn | null = null;
let currentFile: File | null = null;
let currentAspect: PhotoCropAspect = 'square';
let img: HTMLImageElement | null = null;
let state: CropState = { scale: 1, rotation: 0, panX: 0, panY: 0 };
let cropRect = { w: 0, h: 0 };
let stageW = 0;
let stageH = 0;
let baseScale = 1;
let dragging = false;
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
let pinchStartDist = 0;
let pinchStartScale = 1;

function getEl<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel) as T | null;
}

function aspectRatio(aspect: PhotoCropAspect): number {
  if (aspect === 'cover') return 16 / 9;
  return 1;
}

function fitBaseScale(iw: number, ih: number, cw: number, ch: number): number {
  return Math.max(cw / iw, ch / ih);
}

function computeCropSize(aspect: PhotoCropAspect, sw: number, sh: number): { w: number; h: number } {
  const ratio = aspectRatio(aspect);
  const maxW = sw * 0.92;
  const maxH = sh * 0.72;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

function drawPreview(canvas: HTMLCanvasElement): void {
  if (!img) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stageW * dpr);
  canvas.height = Math.round(stageH * dpr);
  canvas.style.width = `${stageW}px`;
  canvas.style.height = `${stageH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, stageW, stageH);

  const cx = stageW / 2;
  const cy = stageH / 2;

  ctx.save();
  ctx.translate(cx + state.panX, cy + state.panY);
  ctx.rotate((state.rotation * Math.PI) / 180);
  const s = baseScale * state.scale;
  ctx.scale(s, s);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

function updateDimOverlays(): void {
  const x = (stageW - cropRect.w) / 2;
  const y = (stageH - cropRect.h) / 2;
  const top = getEl<HTMLElement>('[data-crop-dim-top]');
  const bottom = getEl<HTMLElement>('[data-crop-dim-bottom]');
  const left = getEl<HTMLElement>('[data-crop-dim-left]');
  const right = getEl<HTMLElement>('[data-crop-dim-right]');

  if (top) top.style.height = `${Math.max(0, y)}px`;
  if (bottom) {
    bottom.style.top = `${y + cropRect.h}px`;
    bottom.style.height = `${Math.max(0, stageH - y - cropRect.h)}px`;
  }
  if (left) {
    left.style.top = `${y}px`;
    left.style.width = `${Math.max(0, x)}px`;
    left.style.height = `${cropRect.h}px`;
  }
  if (right) {
    right.style.top = `${y}px`;
    right.style.left = `${x + cropRect.w}px`;
    right.style.width = `${Math.max(0, stageW - x - cropRect.w)}px`;
    right.style.height = `${cropRect.h}px`;
  }
}

function updateFrame(frame: HTMLElement, aspect: PhotoCropAspect): void {
  frame.style.width = `${cropRect.w}px`;
  frame.style.height = `${cropRect.h}px`;
  frame.className = 'photo-crop-frame';
  if (aspect === 'circle') frame.classList.add('photo-crop-frame--circle');
  else if (aspect === 'cover') frame.classList.add('photo-crop-frame--cover');
  else frame.classList.add('photo-crop-frame--square');
}

function clampPan(): void {
  if (!img) return;
  const s = baseScale * state.scale;
  const rad = (state.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = (img.naturalWidth * cos + img.naturalHeight * sin) * s;
  const bh = (img.naturalWidth * sin + img.naturalHeight * cos) * s;
  const maxX = Math.max(0, (bw - cropRect.w) / 2 + 24);
  const maxY = Math.max(0, (bh - cropRect.h) / 2 + 24);
  state.panX = Math.min(maxX, Math.max(-maxX, state.panX));
  state.panY = Math.min(maxY, Math.max(-maxY, state.panY));
}

function render(): void {
  const canvas = getEl<HTMLCanvasElement>('[data-crop-canvas]');
  const frame = getEl<HTMLElement>('[data-crop-frame]');
  const stage = getEl<HTMLElement>('[data-crop-stage]');
  if (!canvas || !frame || !stage || !img) return;

  stageW = stage.clientWidth;
  stageH = stage.clientHeight;
  cropRect = computeCropSize(currentAspect, stageW, stageH);
  updateFrame(frame, currentAspect);
  updateDimOverlays();
  clampPan();
  drawPreview(canvas);

  const zoom = getEl<HTMLInputElement>('[data-crop-zoom]');
  if (zoom) zoom.value = String(state.scale);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal memuat gambar'));
    };
    image.src = url;
  });
}

function exportCroppedFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!img || !currentFile) {
      reject(new Error('Tidak ada gambar'));
      return;
    }

    const ratio = aspectRatio(currentAspect);
    const outLong = 1600;
    const outW = ratio >= 1 ? outLong : Math.round(outLong * ratio);
    const outH = ratio >= 1 ? Math.round(outLong / ratio) : outLong;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas tidak tersedia'));
      return;
    }

    const cx = stageW / 2;
    const cy = stageH / 2;
    const cropX = cx - cropRect.w / 2;
    const cropY = cy - cropRect.h / 2;
    const s = baseScale * state.scale;
    const rad = (state.rotation * Math.PI) / 180;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);

    ctx.save();
    ctx.translate(-cropX * (outW / cropRect.w), -cropY * (outH / cropRect.h));
    ctx.scale(outW / cropRect.w, outH / cropRect.h);
    ctx.translate(cx + state.panX, cy + state.panY);
    ctx.rotate(rad);
    ctx.scale(s, s);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengekspor gambar'));
          return;
        }
        const base = currentFile!.name.replace(/\.[^.]+$/, '') || 'photo';
        const out = new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        resolve(out);
      },
      'image/jpeg',
      0.92,
    );
  });
}

function closeEditor(result: File | null): void {
  const root = getEl<HTMLElement>('#tri-photo-crop');
  root?.classList.remove('is-open');
  root?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('photo-crop-open');
  img = null;
  currentFile = null;
  if (pendingResolve) {
    pendingResolve(result);
    pendingResolve = null;
  }
}

function openEditorUI(title: string): void {
  portalOverlayNodes();
  bindStageHandlers();
  const root = getEl<HTMLElement>('#tri-photo-crop');
  const titleEl = getEl<HTMLElement>('[data-crop-title]');
  if (titleEl) titleEl.textContent = title;
  root?.classList.add('is-open');
  root?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('photo-crop-open');
  requestAnimationFrame(() => render());
}

async function applyCropAndClose(): Promise<void> {
  try {
    const file = await exportCroppedFile();
    closeEditor(file);
  } catch {
    closeEditor(null);
  }
}

function bindStageHandlers(): void {
  const stage = getEl<HTMLElement>('[data-crop-stage]');
  if (!stage || stage.dataset.stageBound === '1') return;
  stage.dataset.stageBound = '1';

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchmove', onTouchMove, { passive: false });
}

function bindDocumentControls(): void {
  if (document.documentElement.dataset.photoCropCtrl === '1') return;
  document.documentElement.dataset.photoCropCtrl = '1';

  document.addEventListener(
    'click',
    (e) => {
      const root = getEl('#tri-photo-crop');
      if (!root?.classList.contains('is-open')) return;

      const target = e.target as Element;
      if (target.closest('[data-crop-cancel]')) {
        e.preventDefault();
        closeEditor(null);
        return;
      }
      if (target.closest('[data-crop-done]')) {
        e.preventDefault();
        void applyCropAndClose();
        return;
      }
      if (target.closest('[data-crop-rotate-ccw]')) {
        e.preventDefault();
        rotate(-90);
        return;
      }
      if (target.closest('[data-crop-rotate-cw]')) {
        e.preventDefault();
        rotate(90);
        return;
      }
      if (target.closest('[data-crop-zoom-out]')) {
        e.preventDefault();
        setZoom(state.scale - 0.15);
        return;
      }
      if (target.closest('[data-crop-zoom-in]')) {
        e.preventDefault();
        setZoom(state.scale + 0.15);
      }
    },
    true,
  );

  document.addEventListener('input', (e) => {
    const root = getEl('#tri-photo-crop');
    if (!root?.classList.contains('is-open')) return;
    const target = e.target as Element;
    if (target.matches('[data-crop-zoom]')) {
      setZoom(Number((target as HTMLInputElement).value));
    }
  });
}

export function openPhotoCrop(file: File, options: PhotoCropOptions = {}): Promise<File | null> {
  mountPhotoCropEditor();
  return new Promise(async (resolve) => {
    pendingResolve = resolve;
    currentFile = file;
    currentAspect = options.aspect ?? 'square';
    state = { scale: 1, rotation: 0, panX: 0, panY: 0 };

    try {
      img = await loadImage(file);
      const stage = getEl<HTMLElement>('[data-crop-stage]');
      if (stage) {
        stageW = stage.clientWidth || window.innerWidth;
        stageH = stage.clientHeight || window.innerHeight * 0.65;
        cropRect = computeCropSize(currentAspect, stageW, stageH);
        baseScale = fitBaseScale(img.naturalWidth, img.naturalHeight, cropRect.w, cropRect.h);
      }
      openEditorUI(options.title ?? 'Sesuaikan foto');
    } catch {
      closeEditor(null);
    }
  });
}

function onPointerDown(e: PointerEvent): void {
  const stage = getEl<HTMLElement>('[data-crop-stage]');
  if (!stage) return;
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
  stage.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging) return;
  state.panX = dragStart.panX + (e.clientX - dragStart.x);
  state.panY = dragStart.panY + (e.clientY - dragStart.y);
  render();
}

function onPointerUp(e: PointerEvent): void {
  dragging = false;
  getEl<HTMLElement>('[data-crop-stage]')?.releasePointerCapture(e.pointerId);
}

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartScale = state.scale;
  }
}

function onTouchMove(e: TouchEvent): void {
  if (e.touches.length !== 2 || !pinchStartDist) return;
  e.preventDefault();
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  const dist = Math.hypot(dx, dy);
  state.scale = Math.min(3, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
  render();
}

function setZoom(val: number): void {
  state.scale = Math.min(3, Math.max(1, val));
  render();
}

function rotate(delta: number): void {
  state.rotation = (state.rotation + delta + 360) % 360;
  state.panX = 0;
  state.panY = 0;
  render();
}

function dedupePhotoCropRoots(): void {
  const crops = document.querySelectorAll('#tri-photo-crop');
  crops.forEach((el, index) => {
    if (index > 0) el.remove();
  });
}

export function mountPhotoCropEditor(): void {
  portalOverlayNodes();
  dedupePhotoCropRoots();
  bindDocumentControls();
  if (mounted) return;
  mounted = true;

  window.addEventListener('resize', () => {
    if (getEl('#tri-photo-crop')?.classList.contains('is-open')) render();
  });
}

let binding = false;

export function bindPhotoCropInputs(root: ParentNode = document): void {
  mountPhotoCropEditor();
  root.querySelectorAll<HTMLInputElement>('input[type="file"][data-photo-crop]').forEach((input) => {
    if (input.dataset.cropBound) return;
    input.dataset.cropBound = '1';

    input.addEventListener('change', async () => {
      if (binding) return;
      const file = input.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;

      const aspect = (input.getAttribute('data-photo-crop') as PhotoCropAspect) || 'square';
      const cropped = await openPhotoCrop(file, { aspect });

      binding = true;
      if (!cropped) {
        input.value = '';
      } else {
        const dt = new DataTransfer();
        dt.items.add(cropped);
        input.files = dt.files;
        input.dispatchEvent(new Event('tri-photo-cropped', { bubbles: true }));
      }
      binding = false;
    });
  });
}

export function initPhotoCropSystem(): void {
  dedupePhotoCropRoots();
  mountPhotoCropEditor();
  bindPhotoCropInputs();
  portalOverlayNodes();

  const stage = getEl<HTMLElement>('[data-crop-stage]');
  if (stage) stage.removeAttribute('data-stage-bound');
}

declare global {
  interface Window {
    triPhotoCrop?: {
      open: typeof openPhotoCrop;
    };
  }
}

if (typeof window !== 'undefined') {
  window.triPhotoCrop = { open: openPhotoCrop };
}
