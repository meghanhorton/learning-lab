/* Little Learning Lab - Google Analytics interaction tracking.
   Sends events for clicks, control changes, form submits, help panels,
   dialogs, copy, print and JavaScript errors. One listener on the whole
   document, so buttons and links added later by the app are tracked too.
   Privacy: what people type (word lists, lesson text, learner names) is
   never sent. Only control IDs, labels and choice values are sent. */
(function () {
  'use strict';
  if (window.__lllAnalytics) return;
  window.__lllAnalytics = true;

  var MAX = 100;
  var PAGE = (document.body && document.body.dataset.page) ||
    location.pathname.replace(/\/+$/, '/index.html').split('/').slice(-2).join('/').replace(/\.html$/, '');

  function send(name, params) {
    if (typeof window.gtag !== 'function') return;
    params = params || {};
    params.page_name = PAGE;
    var clean = {};
    for (var k in params) {
      var v = params[k];
      if (v === undefined || v === null || v === '') continue;
      clean[k] = typeof v === 'string' ? v.slice(0, MAX) : v;
    }
    window.gtag('event', name, clean);
  }

  function squish(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function labelOf(el) {
    var aria = el.getAttribute('aria-label') || el.getAttribute('title');
    if (aria) return squish(aria);
    if (el.matches('input[type=button],input[type=submit],input[type=reset]')) return squish(el.value);
    if (el.labels && el.labels[0]) return squish(el.labels[0].textContent);
    var text = squish(el.innerText || el.textContent);
    if (text) return text;
    var img = el.querySelector && el.querySelector('img[alt]');
    return img ? squish(img.alt) : '';
  }

  function idOf(el) {
    if (el.id) return el.id;
    if (el.dataset.tool) return 'tool:' + el.dataset.tool;
    if (el.name) return el.name;
    var cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(function (c) {
      return c && !/^(btn|btn-|form-|mt-|mb-|ms-|me-|p-|d-|col|row|small|text-)/.test(c);
    })[0];
    if (cls) return '.' + cls;
    var label = labelOf(el);
    return el.tagName.toLowerCase() + (label ? ':' + label.slice(0, 40) : '');
  }

  function areaOf(el) {
    var box = el.parentElement && el.parentElement.closest('dialog,nav,header,footer,aside,section,form,main,details,[id]');
    if (!box) return '';
    return box.id || box.getAttribute('aria-label') || box.tagName.toLowerCase();
  }

  var CLICKABLE = 'a[href],button,summary,[role=button],[role=link],[role=tab],[role=menuitem],[data-tool],' +
    '.tile-grab,input[type=button],input[type=submit],input[type=reset],input[type=image],[onclick],[data-track]';

  function findClickable(start) {
    var el = start && start.nodeType === 1 ? start : start && start.parentElement;
    if (!el) return null;
    var known = el.closest(CLICKABLE);
    if (known) return known;
    // Custom clickable elements made by the app's scripts (pointer cursor).
    // The cursor style is inherited, so use the outermost pointer element.
    var found = null;
    for (var depth = 0; el && el !== document.body && depth < 8; depth++, el = el.parentElement) {
      var pointer = false;
      try { pointer = getComputedStyle(el).cursor === 'pointer'; } catch (e) {}
      if (pointer && !el.matches('label,input,select,textarea,option')) found = el;
      else if (found) break;
    }
    return found;
  }

  // Clicks (capture phase, so the app stopping the click cannot block tracking).
  document.addEventListener('click', function (event) {
    var el = findClickable(event.target);
    if (!el || el.matches('input[type=checkbox],input[type=radio]')) return; // reported as changes instead
    var params = {
      element_type: el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? ':' + el.type : ''),
      element_id: idOf(el),
      element_label: labelOf(el),
      element_area: areaOf(el),
      tool_name: el.dataset.tool || (el.closest('[data-tool]') || {dataset: {}}).dataset.tool
    };
    if (el.matches('a[href]')) {
      try {
        var url = new URL(el.getAttribute('href'), location.href);
        params.link_url = url.origin === location.origin ? url.pathname : url.origin + url.pathname;
        params.link_domain = url.hostname;
        params.outbound = url.origin !== location.origin;
        params.link_has_params = !!(url.search || url.hash);
      } catch (e) {}
    }
    if (el.matches('summary')) return; // reported by the help-panel toggle below
    send('ui_click', params);
  }, true);

  // Dropdowns, sliders, checkboxes, radios, number fields, file pickers.
  // Free-text boxes only report that they changed, never their contents.
  document.addEventListener('change', function (event) {
    var el = event.target;
    if (!el || !el.matches || !el.matches('input,select,textarea')) return;
    var type = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text');
    var params = { element_type: type, element_id: idOf(el), element_label: labelOf(el), element_area: areaOf(el) };
    if (type === 'select') params.element_value = el.value;
    else if (type === 'checkbox' || type === 'radio') { params.element_value = el.checked ? 'checked' : 'unchecked'; if (type === 'radio') params.element_value = el.value; }
    else if (type === 'range' || type === 'number') params.element_value = el.value;
    else if (type === 'file') params.element_value = (el.files && el.files.length) + ' file(s)';
    else params.element_value = 'edited'; // text, textarea, etc.: contents are never sent
    send('ui_change', params);
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    send('form_submit', {
      form_id: form.id || idOf(form),
      form_area: areaOf(form),
      form_label: (form.querySelector('h1,h2,h3,legend') || {}).textContent ? squish(form.querySelector('h1,h2,h3,legend').textContent) : ''
    });
  }, true);

  // "How to use" help panels and any other <details>.
  document.addEventListener('toggle', function (event) {
    var el = event.target;
    if (!el || el.tagName !== 'DETAILS') return;
    var summary = el.querySelector('summary');
    send('help_toggle', { element_id: idOf(el), element_label: summary ? squish(summary.textContent) : '', panel_state: el.open ? 'open' : 'closed' });
  }, true);

  // Dialogs (share links, add-to-lesson, weekly report, etc.).
  function dialogParams(d) {
    var h = d.querySelector('h1,h2,h3');
    return { dialog_id: d.id || idOf(d), dialog_title: h ? squish(h.textContent) : labelOf(d) };
  }
  document.addEventListener('close', function (event) {
    if (event.target && event.target.tagName === 'DIALOG') send('dialog_close', dialogParams(event.target));
  }, true);
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        var t = r.target;
        if (r.type === 'attributes' && t.tagName === 'DIALOG' && t.hasAttribute('open') && r.oldValue === null) send('dialog_open', dialogParams(t));
        if (r.type === 'attributes' && r.attributeName === 'hidden' && t.id && /reader|setup|view|screen|practice/i.test(t.id + ' ' + (t.className || ''))) {
          send('view_change', { element_id: t.id, view_state: t.hidden ? 'hidden' : 'shown' });
        }
      });
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'], attributeOldValue: true });
  }

  document.addEventListener('copy', function (event) {
    var el = event.target && event.target.nodeType === 1 ? event.target : document.activeElement;
    send('copy_text', { element_id: el ? idOf(el) : '', element_area: el ? areaOf(el) : '' });
  }, true);

  window.addEventListener('beforeprint', function () { send('print_page', {}); });

  window.addEventListener('error', function (event) {
    send('js_error', {
      error_message: squish(event.message),
      error_source: (event.filename || '').split('/').slice(-2).join('/') + ':' + (event.lineno || 0)
    });
  });
  window.addEventListener('unhandledrejection', function (event) {
    var r = event.reason;
    send('js_error', { error_message: squish(r && (r.message || String(r))), error_source: 'promise' });
  });
})();
