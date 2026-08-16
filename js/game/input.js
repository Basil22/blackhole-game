// game/input.js — camera orbit, pinch zoom, zoom slider, keyboard, and the
// slingshot drag. Talks to the Game through callbacks so the Game stays
// focused on simulation state.

const MIN_DIST = 96;
const MAX_DIST = 1200;

export class CameraInput {
  constructor(el, camera, callbacks) {
    this.el = el;
    this.camera = camera;
    this.cb = callbacks; // { isAiming, onAimMove(dx,dy), onAimEnd, onSpace, onEnter, onSlowmo, onRespawn, syncZoomSlider(dist) }

    this.theta = Math.atan2(camera.position.z, camera.position.x);
    this.phi = Math.acos(camera.position.y / camera.position.length());
    this.dist = camera.position.length();

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.aimActive = false;

    this._bindPointers();
    this._bindSlider();
    this._bindKeyboard();
  }

  _applyCam() {
    const c = this.camera;
    c.position.set(
      this.dist * Math.sin(this.phi) * Math.cos(this.theta),
      this.dist * Math.cos(this.phi),
      this.dist * Math.sin(this.phi) * Math.sin(this.theta),
    );
    c.lookAt(0, 0, 0);
  }

  _getPos(e) {
    const rect = this.el.getBoundingClientRect();
    return {
      x: (e.clientX || e.changedTouches[0].clientX) - rect.left,
      y: (e.clientY || e.changedTouches[0].clientY) - rect.top,
    };
  }

  _pdist() {
    const pts = [...this.pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _bindPointers() {
    const el = this.el;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointers.set(e.pointerId, this._getPos(e));
      if (this.pointers.size === 2) {
        // pinch — cancel drag + aim, orbit is handled by pinch zoom
        this.pinchDist = this._pdist();
        this.dragging = false;
        this.aimActive = false;
        return;
      }
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      // In aim mode, a pointer down anywhere = start slingshot
      if (this.cb.isAiming()) {
        this.aimActive = true;
      }
    });

    el.addEventListener('pointermove', (e) => {
      // pinch zoom (regardless of drag state)
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, this._getPos(e));
        if (this.pointers.size === 2) {
          const d = this._pdist();
          const f = d / (this.pinchDist || 1);
          this.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.dist / f));
          this.pinchDist = d;
          this._applyCam();
          if (this.cb.syncZoomSlider) this.cb.syncZoomSlider(this.dist);
        }
      }
      if (!this.dragging || this.pointers.size >= 2) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (this.aimActive) {
        this.cb.onAimMove(dx, dy);
        return;
      }
      // camera orbit
      this.theta -= dx * 0.005;
      this.phi -= dy * 0.005;
      this.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.phi));
      this._applyCam();
    });

    const endDrag = (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.delete(e.pointerId);
      if (!this.dragging) return;
      this.dragging = false;
      if (this.aimActive && this.cb.isAiming()) {
        this.aimActive = false;
        this.cb.onAimEnd();
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  _bindSlider() {
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomVal = document.getElementById('zoom-val');
    const distFromSlider = (v) => MIN_DIST + (v / 100) * (MAX_DIST - MIN_DIST);
    const sliderFromDist = (d) => Math.round(((d - MIN_DIST) / (MAX_DIST - MIN_DIST)) * 100);
    this._distFromSlider = distFromSlider;
    this._sliderFromDist = sliderFromDist;
    this._zoomSlider = zoomSlider;
    this._zoomVal = zoomVal;
    if (zoomSlider) {
      zoomSlider.value = String(sliderFromDist(this.dist));
      if (zoomVal) zoomVal.textContent = zoomSlider.value;
      zoomSlider.addEventListener('input', () => {
        this.dist = distFromSlider(parseFloat(zoomSlider.value));
        this._applyCam();
      });
    }
  }

  // keep the slider + label in sync when pinch-zooming
  syncZoomSlider(d) {
    if (this._zoomVal) this._zoomVal.textContent = String(this._sliderFromDist(d));
    if (this._zoomSlider) this._zoomSlider.value = String(this._sliderFromDist(d));
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); this.cb.onSpace(); }
      if (e.code === 'Enter' && this.cb.isAiming()) this.cb.onEnter();
      if (e.code === 'KeyS') this.cb.onSlowmo();
      if (e.code === 'KeyR') this.cb.onRespawn();
    });
  }
}