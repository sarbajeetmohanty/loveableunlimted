(() => {
  'use strict';
  if (window.__bundleeBrandingV175) return;
  window.__bundleeBrandingV175 = true;

  const BRAND = 'Loveable Unlimited';
  const WHATSAPP = 'https://wa.me/918825666207';
  const TELEGRAM = 'https://t.me/+yLiULPFmK9A5NjNl';
  const OLD_STORE_ID = 'lfmnjhgmpdpncnicdchcgnpkeodbnpmj';
  const OLD_STORE_URL = 'https://chromewebstore.google.com/detail/127hub-manager/' + OLD_STORE_ID;

  const replacements = [
    [/Successful\s+from\s+Lovable\s+Infinity/gi, 'Successful from ' + BRAND],
    [/Success(?:ful)?\s+from\s+Lovable\s+Infinity/gi, 'Successful from ' + BRAND],
    [/Send\s+by\s+Lovable\s+Infinity/gi, 'Send by ' + BRAND],
    [/Sent\s+by\s+Lovable\s+Infinity/gi, 'Sent by ' + BRAND],
    [/Welcome\s+to\s+Lovable\s+Infinity\.?/gi, 'Welcome to ' + BRAND + '.'],
    [/Manage\s+by\s+Lovable\s+Infinity/gi, 'Manage by ' + BRAND],
    [/Managed\s+by\s+Lovable\s+Infinity/gi, 'Manage by ' + BRAND],
    [/127HUB\s+Eklas\s+Dispatcher/gi, 'Bundlee Dispatcher'],
    [/127\s+Eklas\s+Dispatcher/gi, 'Bundlee Dispatcher'],
    [/127HUB\.COM/gi, 'bundlee.in'],
    [/Lovable\s+Infinity/gi, BRAND]
  ];

  function replaceText(value) {
    let out = value;
    for (const [rx, replacement] of replacements) out = out.replace(rx, replacement);
    return out;
  }

  function shouldSkip(node) {
    const p = node && node.parentElement;
    if (!p) return false;
    return !!p.closest('textarea,input,[contenteditable="true"],[contenteditable=""],script,style,pre,code');
  }

  function patchText(root) {
    if (!root) return;
    try {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!shouldSkip(root)) {
          const next = replaceText(root.nodeValue || '');
          if (next !== root.nodeValue) root.nodeValue = next;
        }
        return;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (shouldSkip(node)) continue;
        const next = replaceText(node.nodeValue || '');
        if (next !== node.nodeValue) node.nodeValue = next;
      }
    } catch (_) {}
  }

  function normalizedText(el) {
    try { return (el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim(); }
    catch (_) { return ''; }
  }

  function destinationFor(el) {
    const text = normalizedText(el).toLowerCase();
    const href = (el.getAttribute && el.getAttribute('href') || '').toLowerCase();
    if (href.includes(OLD_STORE_ID) || href.includes('chromewebstore.google.com/detail/127hub-manager')) return '__BLOCK__';
    if (text.includes('contact admin')) return WHATSAPP;
    if (text.includes('main channel')) return TELEGRAM;
    if (text.includes('bundlee.in') || text.includes('127hub.com') || href.includes('127hub.com')) return WHATSAPP;
    return null;
  }

  function patchLinks(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      const elements = root.querySelectorAll('a,button,[role="button"]');
      for (const el of elements) {
        const url = destinationFor(el);
        if (!url) continue;
        if (url === '__BLOCK__') {
          el.setAttribute('data-bundlee-blocked-link', '1');
          el.removeAttribute('href');
          el.removeAttribute('target');
          continue;
        }
        el.setAttribute('data-bundlee-destination', url);
        if (el.tagName === 'A') {
          el.setAttribute('href', url);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
    } catch (_) {}
  }

  function patchLicenseInputs(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      for (const input of root.querySelectorAll('input,textarea')) {
        for (const attr of ['placeholder', 'aria-label', 'title']) {
          const value = input.getAttribute(attr);
          if (!value) continue;
          if (/127\s*hub|127hub/i.test(value)) input.setAttribute(attr, 'Bundlee License Key');
        }
      }
    } catch (_) {}
  }

  function patch(root) {
    patchText(root);
    patchLicenseInputs(root && root.nodeType === Node.ELEMENT_NODE ? root : document);
    patchLinks(root && root.nodeType === Node.ELEMENT_NODE ? root : document);
    // Also process open shadow roots without touching application state.
    try {
      const elements = (root && root.querySelectorAll) ? root.querySelectorAll('*') : [];
      for (const el of elements) if (el.shadowRoot) { patchText(el.shadowRoot); patchLinks(el.shadowRoot); }
    } catch (_) {}
  }

  document.addEventListener('click', (event) => {
    try {
      const target = event.target && event.target.closest && event.target.closest('a,button,[role="button"]');
      if (!target) return;
      const url = target.getAttribute('data-bundlee-destination') || destinationFor(target);
      if (!url) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (url === '__BLOCK__') return;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {}
  }, true);

  function start() {
    patch(document.body || document.documentElement);
    const base = document.body || document.documentElement;
    if (!base) return setTimeout(start, 100);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') patch(mutation.target);
        for (const node of mutation.addedNodes || []) patch(node);
      }
      patchLinks(document);
    });
    observer.observe(base, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder','aria-label','title'] });
    // Some v17.5 labels are refreshed by its own UI timer; keep branding authoritative.
    setInterval(() => patch(document.body || document.documentElement), 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
