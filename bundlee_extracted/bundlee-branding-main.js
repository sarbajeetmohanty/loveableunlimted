(() => {
  'use strict';
  if (window.__bundleeMainBrandingV175) return;
  window.__bundleeMainBrandingV175 = true;

  const BRAND = 'Loveable Unlimited';
  const WHATSAPP = 'https://wa.me/918825666207';
  const OLD_STORE_ID = 'lfmnjhgmpdpncnicdchcgnpkeodbnpmj';
  const OLD_STORE_HOST = 'chromewebstore.google.com/detail/127hub-manager';

  const isOldStore = (value) => {
    const v = String(value || '').toLowerCase();
    return v.includes(OLD_STORE_ID) || v.includes(OLD_STORE_HOST);
  };

  // Block only the obsolete 127HUB Manager store destination. All other window.open calls are untouched.
  try {
    const nativeOpen = window.open;
    window.open = function(url, ...args) {
      if (isOldStore(url)) return null;
      return nativeOpen.call(this, url, ...args);
    };
  } catch (_) {}

  const replace = (text) => String(text || '')
    .replace(/Welcome\s+to\s+Lovable\s+Infinity\.?/gi, 'Welcome to ' + BRAND + '.')
    .replace(/Manage(?:d)?\s+by\s+Lovable\s+Infinity/gi, 'Manage by ' + BRAND)
    .replace(/Lovable\s+Infinity/gi, BRAND)
    .replace(/127HUB\.COM/gi, 'bundlee.in');

  function patch(root) {
    try {
      const base = root || document;
      const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent && parent.closest('textarea,input,[contenteditable],script,style,pre,code')) continue;
        const next = replace(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }

      // Normalize visible provider branding in the license-key input only; never touch the entered key value.
      const inputs = base.querySelectorAll ? base.querySelectorAll('input,textarea') : [];
      for (const input of inputs) {
        const attrs = ['placeholder', 'aria-label', 'title'];
        for (const attr of attrs) {
          const value = input.getAttribute && input.getAttribute(attr);
          if (!value) continue;
          if (/127\s*hub|127hub/i.test(value)) {
            input.setAttribute(attr, attr === 'placeholder' ? 'Bundlee License Key' : 'Bundlee License Key');
          }
        }
      }

      const els = base.querySelectorAll ? base.querySelectorAll('a,button,[role="button"],*') : [];
      for (const el of els) {
        if (el.shadowRoot) patch(el.shadowRoot);
        if (!el.getAttribute) continue;
        const href = el.getAttribute('href') || '';
        if (isOldStore(href)) {
          el.setAttribute('data-bundlee-blocked-link', '1');
          el.removeAttribute('href');
          el.removeAttribute('target');
        }
        const t = (el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
        if (el.tagName === 'A' && (t === 'bundlee.in' || t === '127hub.com')) {
          el.textContent = 'bundlee.in';
          el.href = WHATSAPP;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        }
      }
    } catch (_) {}
  }

  document.addEventListener('click', (event) => {
    try {
      const el = event.target && event.target.closest && event.target.closest('a,button,[role="button"]');
      if (!el) return;
      const href = (el.getAttribute && el.getAttribute('href')) || '';
      if (el.getAttribute('data-bundlee-blocked-link') === '1' || isOldStore(href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    } catch (_) {}
  }, true);

  const boot = () => {
    patch(document.body || document.documentElement || document);
    const target = document.documentElement;
    if (target) {
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'characterData') patch(m.target.parentNode || document);
          for (const n of m.addedNodes || []) if (n.nodeType === 1) patch(n);
        }
      }).observe(target, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['href','placeholder','aria-label','title']});
    }
    setInterval(() => patch(document.body || document.documentElement || document), 200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
