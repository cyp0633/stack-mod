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

function createZoomContainer(imgSrc: string, altText: string): HTMLDivElement {
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
    return container;
}

function enablePanzoom(container: HTMLElement) {
    // @ts-ignore
    const panzoom = (window as any).Panzoom ? (window as any).Panzoom(container, {
        maxScale: 8,
        minScale: 0.2,
        animate: true,
        contain: 'outside'
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
    }
}

function closeOverlay(overlay: HTMLElement) {
    overlay.remove();
}

function openZoom(src: string, alt: string) {
    const overlay = createOverlay();
    const container = createZoomContainer(src, alt);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    enablePanzoom(container);
}


