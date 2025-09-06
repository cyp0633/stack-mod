export function initImageZoom() {
    const selector = '.article-content img';
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(selector));
    imgs.forEach((img) => {
        if ((img as any)._zoomBound) return;
        (img as any)._zoomBound = true;
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
            openZoom(img.currentSrc || img.src, img.alt || '');
        });
    });
}

function createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'zoom-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.9)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.touchAction = 'none';
    return overlay;
}

function createZoomContainer(imgSrc: string, altText: string): { container: HTMLDivElement; img: HTMLImageElement } {
    const container = document.createElement('div');
    container.style.maxWidth = '100%';
    container.style.maxHeight = '100%';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';

    const img = document.createElement('img');
    img.src = imgSrc;
    if (altText) img.alt = altText;
    img.style.display = 'block';
    img.style.userSelect = 'none';
    img.style.transformOrigin = '0 0';
    img.style.maxWidth = 'unset';
    img.style.maxHeight = 'unset';

    container.appendChild(img);
    return { container, img };
}

function enablePanzoom(container: HTMLElement, img: HTMLImageElement) {
    // @ts-ignore
    const panzoom = (window as any).Panzoom ? (window as any).Panzoom(container, {
        maxScale: 8,
        minScale: 0.1,
        animate: true,
        contain: 'inside'
    }) : null;

    const parent = container.parentElement as HTMLElement;
    if (panzoom && parent) {
        parent.addEventListener('wheel', panzoom.zoomWithWheel);
        let lastTouchEnd = 0;
        parent.addEventListener('click', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd > 250) {
                if ((e.target as HTMLElement).id === 'zoom-overlay') closeOverlay(parent);
            }
        });
        parent.addEventListener('touchend', () => {
            lastTouchEnd = Date.now();
        });

        const fitAndCenter = () => {
            const parentW = parent.clientWidth || window.innerWidth;
            const parentH = parent.clientHeight || window.innerHeight;
            const naturalW = img.naturalWidth || img.width;
            const naturalH = img.naturalHeight || img.height;
            if (!naturalW || !naturalH) return;
            const scaleFit = Math.min(parentW / naturalW, parentH / naturalH);
            const initialScale = Math.min(1, scaleFit || 1);
            panzoom.zoom(initialScale, { animate: false });
            const scaledW = naturalW * initialScale;
            const scaledH = naturalH * initialScale;
            const dx = (parentW - scaledW) / 2;
            const dy = (parentH - scaledH) / 2;
            panzoom.pan(dx, dy, { animate: false });
        };

        if (img.complete && img.naturalWidth) {
            fitAndCenter();
        } else {
            img.addEventListener('load', fitAndCenter, { once: true });
        }
    }
}

function closeOverlay(overlay: HTMLElement) {
    overlay.remove();
}

function openZoom(src: string, alt: string) {
    const overlay = createOverlay();
    const { container, img } = createZoomContainer(src, alt);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    enablePanzoom(container, img);
}


