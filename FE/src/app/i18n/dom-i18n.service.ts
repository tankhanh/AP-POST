import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, effect, Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { LanguageService } from './language.service';

@Injectable({ providedIn: 'root' })
export class DomI18nService {
  private readonly attributeNames = [
    'alt',
    'aria-description',
    'aria-label',
    'placeholder',
    'title',
  ];
  private readonly originalText = new WeakMap<Text, string>();
  private readonly lastAppliedText = new WeakMap<Text, string>();
  private readonly originalAttributes = new WeakMap<Element, Map<string, string>>();
  private readonly lastAppliedAttributes = new WeakMap<Element, Map<string, string>>();
  private observer?: MutationObserver;
  private started = false;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly destroyRef: DestroyRef,
    private readonly ngZone: NgZone,
    private readonly languageService: LanguageService,
  ) {
    effect(() => {
      this.languageService.language();
      if (this.started) queueMicrotask(() => this.ngZone.runOutsideAngular(() => this.translateTree(this.document.body)));
    });
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
  }

  start() {
    if (this.started || !isPlatformBrowser(this.platformId) || !this.document.body) return;
    this.started = true;
    this.ngZone.runOutsideAngular(() => {
      this.translateTree(this.document.body);
      this.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData' && mutation.target instanceof Text) {
            this.translateTextNode(mutation.target);
          }
          mutation.addedNodes.forEach((node) => this.translateTree(node));
          if (mutation.type === 'attributes' && mutation.target instanceof Element) {
            this.translateAttributes(mutation.target);
          }
        }
      });
      this.observer.observe(this.document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: this.attributeNames,
      });
    });
  }

  private translateTree(root: Node) {
    if (root instanceof Text) {
      this.translateTextNode(root);
      return;
    }
    if (!(root instanceof Element) && root !== this.document.body) return;
    if (root instanceof Element && this.shouldIgnore(root)) return;

    if (root instanceof Element) this.translateAttributes(root);
    const walker = this.document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Text) this.translateTextNode(node);
      else if (node instanceof Element) this.translateAttributes(node);
      node = walker.nextNode();
    }
  }

  private translateTextNode(node: Text) {
    const parent = node.parentElement;
    if (!parent || this.shouldIgnore(parent)) return;
    const current = node.data;
    let original = this.originalText.get(node);
    if (original === undefined) {
      original = current;
      this.originalText.set(node, original);
    } else if (current !== this.lastAppliedText.get(node)) {
      // Angular changed an interpolation after the first render. Treat it as a new
      // Vietnamese source instead of restoring a stale value from the WeakMap.
      original = current;
      this.originalText.set(node, current);
    }
    const translated =
      this.languageService.language() === 'vi' ? original : this.languageService.translate(original);
    this.lastAppliedText.set(node, translated);
    if (current !== translated) node.data = translated;
  }

  private translateAttributes(element: Element) {
    if (this.shouldIgnore(element)) return;
    let originals = this.originalAttributes.get(element);
    if (!originals) {
      originals = new Map<string, string>();
      this.originalAttributes.set(element, originals);
    }
    let lastApplied = this.lastAppliedAttributes.get(element);
    if (!lastApplied) {
      lastApplied = new Map<string, string>();
      this.lastAppliedAttributes.set(element, lastApplied);
    }
    for (const name of this.attributeNames) {
      const current = element.getAttribute(name);
      if (current === null) continue;
      let original = originals.get(name);
      if (original === undefined) {
        original = current;
        originals.set(name, original);
      } else if (current !== lastApplied.get(name)) {
        // Keep bound placeholders/ARIA labels in sync when Angular updates them.
        original = current;
        originals.set(name, current);
      }
      const translated =
        this.languageService.language() === 'vi'
          ? original
          : this.languageService.translateAttribute(original);
      lastApplied.set(name, translated);
      if (current !== translated) element.setAttribute(name, translated);
    }
  }

  private shouldIgnore(element: Element): boolean {
    return (
      ['CODE', 'NOSCRIPT', 'PRE', 'SCRIPT', 'STYLE'].includes(element.tagName) ||
      element.closest('[data-i18n-ignore], [translate="no"], [contenteditable="true"]') !== null
    );
  }
}
