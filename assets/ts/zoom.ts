const ARTICLE_SELECTOR = '.article-content';
const ZOOMABLE_SELECTOR = 'img[data-zoomable="true"], .article-content figure > img, .article-content p > img';
const PLACEHOLDER_PREFIX = 'data:image/gif;base64';

type Point = { x: number; y: number };
type Transform = { x: number; y: number; scale: number };

let articleBound = false;
let activeLightbox: ImageLightbox | null = null;

export function initImageZoom() {
    const article = document.querySelector<HTMLElement>(ARTICLE_SELECTOR);
    if (!article || articleBound) return;

    articleBound = true;
    article.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        const img = target?.closest<HTMLImageElement>(ZOOMABLE_SELECTOR);
        if (!img || !article.contains(img)) return;

        const src = getZoomSource(img);
        if (src) {
            event.preventDefault();
            openZoom(src, img.alt || '');
            return;
        }

        if (isPendingImage(img)) {
            event.preventDefault();
            waitForImageSource(img);
        }
    });
}

function waitForImageSource(img: HTMLImageElement) {
    img.classList.add('image-zoom-pending');

    const openWhenReady = () => {
        img.classList.remove('image-zoom-pending');
        const nextSrc = getZoomSource(img);
        if (nextSrc) openZoom(nextSrc, img.alt || '');
    };

    img.addEventListener('load', openWhenReady, { once: true });
    window.setTimeout(() => {
        img.classList.remove('image-zoom-pending');
        img.removeEventListener('load', openWhenReady);
    }, 8000);
}

function getZoomSource(img: HTMLImageElement): string {
    const useHdr = document.documentElement.dataset.hdr === 'on';
    const candidates = [
        img.dataset.zoomSrc,
        useHdr ? img.dataset.hdrSrc : img.dataset.sdrSrc,
        img.dataset.sdrSrc,
        img.currentSrc,
        img.src
    ];

    return candidates.find((src) => src && !isPlaceholder(src)) || '';
}

function isPendingImage(img: HTMLImageElement): boolean {
    return Boolean(img.dataset.ossKey || img.dataset.ossKeyHdr || img.dataset.ossKeySdr);
}

function isPlaceholder(src: string): boolean {
    return src.startsWith(PLACEHOLDER_PREFIX);
}

function openZoom(src: string, alt: string) {
    activeLightbox?.close();
    activeLightbox = new ImageLightbox(src, alt);
}

class ImageLightbox {
    private overlay: HTMLDivElement;
    private image: HTMLImageElement;
    private transform: Transform = { x: 0, y: 0, scale: 1 };
    private minScale = 1;
    private maxScale = 8;
    private pointers = new Map<number, Point>();
    private dragStart: Point | null = null;
    private transformStart: Transform = { x: 0, y: 0, scale: 1 };
    private pinchStartDistance = 0;
    private pinchStartCenter: Point | null = null;
    private previousBodyOverflow = '';
    private closeTimer = 0;
    private closed = false;
    private backdropPointerId: number | null = null;
    private backdropPointerStart: Point | null = null;

    constructor(src: string, alt: string) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'image-zoom-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');

        this.image = document.createElement('img');
        this.image.className = 'image-zoom-image';
        this.image.src = src;
        if (alt) this.image.alt = alt;
        this.image.draggable = false;

        this.overlay.appendChild(this.image);
        document.body.appendChild(this.overlay);

        this.previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        this.bindEvents();
        void this.prepareImage();
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        window.clearTimeout(this.closeTimer);
        document.removeEventListener('keydown', this.onKeyDown);
        this.overlay.classList.remove('is-open');
        this.overlay.classList.add('is-closing');
        document.body.style.overflow = this.previousBodyOverflow;
        activeLightbox = activeLightbox === this ? null : activeLightbox;

        this.closeTimer = window.setTimeout(() => {
            this.overlay.remove();
        }, prefersReducedMotion() ? 0 : 180);
    }

    private bindEvents() {
        this.overlay.addEventListener('wheel', (event) => {
            event.preventDefault();
            const direction = event.deltaY > 0 ? -1 : 1;
            const factor = Math.exp(direction * 0.18);
            this.zoomAt(factor, { x: event.clientX, y: event.clientY });
        }, { passive: false });

        this.overlay.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        this.overlay.addEventListener('pointermove', (event) => this.onPointerMove(event));
        this.overlay.addEventListener('pointerup', (event) => this.onPointerEnd(event));
        this.overlay.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
        this.image.addEventListener('dblclick', (event) => {
            event.preventDefault();
            const targetScale = this.transform.scale > this.minScale * 1.4 ? this.minScale : Math.min(this.maxScale, this.minScale * 2.5);
            this.zoomTo(targetScale, { x: event.clientX, y: event.clientY }, true);
        });

        document.addEventListener('keydown', this.onKeyDown);
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.close();
    };

    private async prepareImage() {
        const image = this.image;
        const decode = image.decode;

        if (!image.complete) {
            await new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
        }

        try {
            if (typeof decode === 'function') await decode.call(image);
        } catch {
            // Some browsers reject decode() for already-loaded animated or cross-origin images.
        }

        this.fitToViewport();
        requestAnimationFrame(() => this.overlay.classList.add('is-open'));
    }

    private fitToViewport() {
        const margin = window.innerWidth < 768 ? 28 : 80;
        const availableW = Math.max(1, window.innerWidth - margin);
        const availableH = Math.max(1, window.innerHeight - margin);
        const naturalW = this.image.naturalWidth || this.image.width;
        const naturalH = this.image.naturalHeight || this.image.height;
        if (!naturalW || !naturalH) return;

        this.minScale = Math.min(1, availableW / naturalW, availableH / naturalH);
        this.maxScale = Math.max(3, this.minScale * 8);
        this.transform = {
            scale: this.minScale,
            x: (window.innerWidth - naturalW * this.minScale) / 2,
            y: (window.innerHeight - naturalH * this.minScale) / 2
        };
        this.applyTransform(false);
    }

    private onPointerDown(event: PointerEvent) {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.preventDefault();
        if (event.target === this.overlay) {
            this.backdropPointerId = event.pointerId;
            this.backdropPointerStart = { x: event.clientX, y: event.clientY };
        } else {
            this.backdropPointerId = null;
            this.backdropPointerStart = null;
        }
        this.overlay.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.transformStart = { ...this.transform };

        if (this.pointers.size === 1) {
            this.dragStart = { x: event.clientX, y: event.clientY };
        } else if (this.pointers.size === 2) {
            const points = Array.from(this.pointers.values());
            this.pinchStartDistance = distance(points[0], points[1]);
            this.pinchStartCenter = center(points[0], points[1]);
        }
    }

    private onPointerMove(event: PointerEvent) {
        if (!this.pointers.has(event.pointerId)) return;
        event.preventDefault();
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this.pointers.size === 1 && this.dragStart) {
            const dx = event.clientX - this.dragStart.x;
            const dy = event.clientY - this.dragStart.y;
            this.transform.x = this.transformStart.x + dx;
            this.transform.y = this.transformStart.y + dy;
            this.applyTransform();
            return;
        }

        if (this.pointers.size === 2 && this.pinchStartCenter && this.pinchStartDistance > 0) {
            const points = Array.from(this.pointers.values());
            const nextCenter = center(points[0], points[1]);
            const nextDistance = distance(points[0], points[1]);
            const nextScale = this.clampScale(this.transformStart.scale * (nextDistance / this.pinchStartDistance));
            const ratio = nextScale / this.transformStart.scale;

            this.transform.scale = nextScale;
            this.transform.x = nextCenter.x - (this.pinchStartCenter.x - this.transformStart.x) * ratio;
            this.transform.y = nextCenter.y - (this.pinchStartCenter.y - this.transformStart.y) * ratio;
            this.applyTransform();
        }
    }

    private onPointerEnd(event: PointerEvent) {
        const shouldCloseBackdrop = this.shouldCloseFromBackdrop(event);
        this.pointers.delete(event.pointerId);
        if (this.overlay.hasPointerCapture(event.pointerId)) {
            this.overlay.releasePointerCapture(event.pointerId);
        }

        this.transformStart = { ...this.transform };
        const points = Array.from(this.pointers.values());
        this.dragStart = points[0] || null;

        if (points.length === 2) {
            this.pinchStartDistance = distance(points[0], points[1]);
            this.pinchStartCenter = center(points[0], points[1]);
        } else {
            this.pinchStartDistance = 0;
            this.pinchStartCenter = null;
        }

        if (shouldCloseBackdrop) this.close();
    }

    private shouldCloseFromBackdrop(event: PointerEvent): boolean {
        if (this.backdropPointerId !== event.pointerId || !this.backdropPointerStart) return false;
        this.backdropPointerId = null;
        const movement = distance(this.backdropPointerStart, { x: event.clientX, y: event.clientY });
        this.backdropPointerStart = null;
        return movement < 6 && this.pointers.size <= 1;
    }

    private zoomAt(factor: number, point: Point) {
        this.zoomTo(this.transform.scale * factor, point);
    }

    private zoomTo(scale: number, point: Point, animated = false) {
        const nextScale = this.clampScale(scale);
        const ratio = nextScale / this.transform.scale;
        this.transform.x = point.x - (point.x - this.transform.x) * ratio;
        this.transform.y = point.y - (point.y - this.transform.y) * ratio;
        this.transform.scale = nextScale;
        this.applyTransform(animated);
    }

    private clampScale(scale: number): number {
        return Math.min(this.maxScale, Math.max(this.minScale, scale));
    }

    private applyTransform(animated = false) {
        this.image.classList.toggle('is-animating', animated);
        this.image.style.transform = `translate3d(${this.transform.x}px, ${this.transform.y}px, 0) scale(${this.transform.scale})`;
    }
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function center(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
