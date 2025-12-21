const { CompositeDisposable, Disposable } = require("atom");

module.exports = {

  activate() {
    this.viewers = new Map();
    this.pdfService = null;
    this.Simplemap = null;
    this.viewerObserver = null;
    this.disposables = new CompositeDisposable();
  },

  deactivate() {
    for (const ctx of this.viewers.values()) {
      ctx.scrollmap?.destroy();
      ctx.subscription?.dispose();
      ctx.paneSubscription?.dispose();
    }
    this.viewers.clear();
    this.viewerObserver?.dispose();
    this.disposables.dispose();
  },

  consumePdfViewer(service) {
    this.pdfService = service;
    this.observeViewers();
    return new Disposable(() => {
      this.viewerObserver?.dispose();
      this.viewerObserver = null;
      this.pdfService = null;
    });
  },

  consumeSimpleMap(Simplemap) {
    this.Simplemap = Simplemap;
    this.observeViewers();
    return new Disposable(() => {
      for (const ctx of this.viewers.values()) {
        ctx.scrollmap?.destroy();
        ctx.scrollmap = null;
      }
      this.Simplemap = null;
    });
  },

  observeViewers() {
    if (!this.pdfService || !this.Simplemap || this.viewerObserver) {
      return;
    }
    this.viewerObserver = this.pdfService.observeViewers((viewer) => {
      this.setupViewer(viewer);
    });
  },

  setupViewer(viewer) {
    if (this.viewers.has(viewer)) {
      return;
    }
    const ctx = { viewer, scrollmap: null, subscription: null, paneSubscription: null, lastData: null };
    this.viewers.set(viewer, ctx);
    this.insertScrollmap(ctx);
    ctx.subscription = viewer.observeScrollMapData?.((data) => {
      ctx.lastData = data;
      this.updateScrollmap(ctx, data);
    });
    ctx.paneSubscription = atom.workspace.onDidChangeActivePaneItem(() => {
      if (atom.workspace.getActivePaneItem() === viewer && ctx.lastData) {
        requestAnimationFrame(() => this.updateScrollmap(ctx, ctx.lastData));
      }
    });
    viewer.onDidDispose?.(() => {
      ctx.scrollmap?.destroy();
      ctx.subscription?.dispose();
      ctx.paneSubscription?.dispose();
      this.viewers.delete(viewer);
    });
  },

  insertScrollmap(ctx) {
    if (ctx.scrollmap || !this.Simplemap) {
      return;
    }
    const element = ctx.viewer.element;
    if (!element?.parentNode) {
      requestAnimationFrame(() => this.insertScrollmap(ctx));
      return;
    }
    ctx.scrollmap = new this.Simplemap();
    element.parentNode.insertBefore(ctx.scrollmap.element, element.nextSibling);
  },

  ensureScrollmapPosition(ctx) {
    const element = ctx.viewer.element;
    if (!element?.parentNode || !ctx.scrollmap) {
      return;
    }
    const scrollmapEl = ctx.scrollmap.element;
    if (scrollmapEl.parentNode !== element.parentNode || element.nextSibling !== scrollmapEl) {
      scrollmapEl.remove();
      element.parentNode.insertBefore(scrollmapEl, element.nextSibling);
    }
  },

  updateScrollmap(ctx, data) {
    if (!ctx.scrollmap || !this.Simplemap) {
      return;
    }
    this.ensureScrollmapPosition(ctx);
    ctx.scrollmap.element.style.display = "block";
    const maxDepth = atom.config.get("scrollmap-pdf-viewer.maxDepth");
    const threshold = atom.config.get("scrollmap-pdf-viewer.threshold");
    let filtered = data.items;
    if (maxDepth > 0) {
      filtered = filtered.filter((item) => item.level < maxDepth);
    }
    if (threshold > 0 && filtered.length > threshold) {
      ctx.scrollmap.setItems([]);
      return;
    }
    const items = filtered.map((item) => ({
      percent: item.percent,
      cls: item.isCurrent ? "marker-pdf-current" : `marker-pdf-h${Math.min(item.level + 1, 6)}`,
      click: () => ctx.viewer.scrollToPosition(item.page, item.x, item.y),
    }));
    ctx.scrollmap.setItems(items);
  },
};
