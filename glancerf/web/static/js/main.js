/* GlanceRF main display - WebSocket sync for desktop/browser mirroring */

(function showFinalTourMessage() {
  try {
    var path = window.location.pathname || '';
    if (path !== '/' && path !== '') return;
    var flag = sessionStorage.getItem('glancerf_show_final_tour_msg');
    if (flag !== '1') return;
    sessionStorage.removeItem('glancerf_show_final_tour_msg');
  } catch (e) { return; }

  function build() {
    if (document.getElementById('glancerf-final-tour-msg')) return;
    var root = document.createElement('div');
    root.id = 'glancerf-final-tour-msg';
    root.className = 'glancerf-final-tour-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'glancerf-final-tour-title');
    root.innerHTML = ''
      + '<div class="glancerf-final-tour-backdrop"></div>'
      + '<div class="glancerf-final-tour-panel">'
      + '  <h2 class="glancerf-final-tour-title" id="glancerf-final-tour-title">All set</h2>'
      + '  <p class="glancerf-final-tour-body">Your dashboard is live. To open the menu and change settings, modules, or the layout later:</p>'
      + '  <ul class="glancerf-final-tour-list">'
      + '    <li>Press <strong>M</strong> on the keyboard, or</li>'
      + '    <li><strong>Right-click</strong> anywhere on the dashboard.</li>'
      + '  </ul>'
      + '  <p class="glancerf-final-tour-body">From the menu you can return to <strong>Setup</strong>, the <strong>Layout &amp; Config editor</strong>, the <strong>Modules list</strong>, or run <strong>Manual Updates</strong>.</p>'
      + '  <div class="glancerf-final-tour-actions">'
      + '    <button type="button" class="glancerf-final-tour-btn" id="glancerf-final-tour-ok">Got it</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(root);

    function close() {
      if (root.parentNode) root.parentNode.removeChild(root);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        close();
      }
    }
    var btn = root.querySelector('#glancerf-final-tour-ok');
    if (btn) btn.addEventListener('click', close);
    var backdrop = root.querySelector('.glancerf-final-tour-backdrop');
    if (backdrop) backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    if (btn) try { btn.focus(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();

(function () {
  'use strict';

  var ws = null;
  var urlParams = new URLSearchParams(window.location.search);
  var isDesktop = urlParams.get('desktop') === 'true' || window.navigator.userAgent.indexOf('QtWebEngine') !== -1;

  function shouldSyncPage() {
    var path = window.location.pathname;
    return path === '/' || path === '';
  }

  var wsDisconnectedAt = null;
  var wsLostIntervalId = null;
  var wsReconnectIntervalId = null;

  function formatDisconnectedTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + 'm ' + s + 's';
  }

  function updateWsLostTimer() {
    if (!wsDisconnectedAt) return;
    var el = document.getElementById('ws-lost-timer');
    if (el) el.textContent = 'Disconnected: ' + formatDisconnectedTime(Date.now() - wsDisconnectedAt);
  }

  function showWsLostStartTimer(reconnectFn) {
    var el = document.getElementById('ws-lost-warning');
    if (el) { el.classList.add('show'); el.style.display = 'block'; }
    if (!wsDisconnectedAt) wsDisconnectedAt = Date.now();
    if (!wsLostIntervalId) wsLostIntervalId = setInterval(updateWsLostTimer, 1000);
    updateWsLostTimer();
    if (reconnectFn && !wsReconnectIntervalId) {
      wsReconnectIntervalId = setInterval(reconnectFn, 10000);
      setTimeout(reconnectFn, 10000);
    }
  }

  function hideWsLostStopTimer() {
    var el = document.getElementById('ws-lost-warning');
    if (el) { el.classList.remove('show'); el.style.display = 'none'; }
    wsDisconnectedAt = null;
    if (wsLostIntervalId) { clearInterval(wsLostIntervalId); wsLostIntervalId = null; }
    if (wsReconnectIntervalId) { clearInterval(wsReconnectIntervalId); wsReconnectIntervalId = null; }
  }

  function showUpdateNotification(data) {
    var notif = document.getElementById('update-notification');
    var content = document.getElementById('update-notification-content');
    if (!notif || !content) return;
    var current = data.current_version || 'unknown';
    var latest = data.latest_version || 'unknown';
    var msg = 'Update available: ' + current + ' → ' + latest;
    if (data.docker_mode) {
      msg += ' (In Docker: pull new image and recreate container)';
    }
    content.textContent = msg;
    notif.classList.add('show');
  }

  function safeGetFormElement(id) {
    if (!id || typeof id !== 'string') return null;
    var el = document.getElementById(id);
    if (el) return el;
    if (typeof CSS !== 'undefined' && CSS.escape) {
      try {
        return document.querySelector('[name="' + CSS.escape(id) + '"]');
      } catch (e) {
        return null;
      }
    }
    var inputs = document.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].name === id) return inputs[i];
    }
    return null;
  }

  function collectFormState() {
    var formState = {};
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      var id = el.id || el.name;
      if (id) formState[id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
    return formState;
  }

  function sendState() {
    if (!shouldSyncPage()) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    var formState = collectFormState();
    var scrollState = { x: window.scrollX, y: window.scrollY };
    var activeEl = document.activeElement;
    var activeElementState = activeEl ? { tag: activeEl.tagName, id: activeEl.id, name: activeEl.name, type: activeEl.type, value: activeEl.value, checked: activeEl.checked } : null;
    var currentHtml = document.documentElement.outerHTML;
    var currentFormState = JSON.stringify(formState);
    var currentScrollState = JSON.stringify(scrollState);
    var currentActiveElement = JSON.stringify(activeElementState);
    if (currentHtml !== sendState.lastSentHtml || currentFormState !== sendState.lastSentFormState || currentScrollState !== sendState.lastSentScrollState || currentActiveElement !== sendState.lastSentActiveElement) {
      sendState.lastSentHtml = currentHtml;
      sendState.lastSentFormState = currentFormState;
      sendState.lastSentScrollState = currentScrollState;
      sendState.lastSentActiveElement = currentActiveElement;
      ws.send(JSON.stringify({ type: 'dom', data: { html: currentHtml, url: window.location.href, formState: formState, scrollState: scrollState, activeElement: activeElementState } }));
    }
  }

  /* DOM morphing for the browser side of desktop<->browser mirroring.
     Patches the live document in place to match an incoming HTML snapshot, instead of
     document.open()/write()/close() (full document replace). That approach re-parsed and
     re-executed every <script> tag on every 'dom' message - since sendState() resends
     whenever outerHTML differs at all, any per-second-updating module (clock, countdown)
     meant every mirrored browser tab accumulated a brand new setInterval from each
     module's script on every tick, forever, without ever clearing the previous one:
     confirmed via test that after 3 resyncs a clock module had 3 concurrent intervals
     running instead of 1. Morphing preserves existing nodes/listeners/intervals and never
     touches <script> element content, so scripts execute exactly once (on first load). */
  function morphAttributes(oldEl, newEl) {
    var oldAttrs = oldEl.attributes;
    var newAttrs = newEl.attributes;
    for (var i = oldAttrs.length - 1; i >= 0; i--) {
      var name = oldAttrs[i].name;
      if (!newEl.hasAttribute(name)) oldEl.removeAttribute(name);
    }
    for (var j = 0; j < newAttrs.length; j++) {
      var attr = newAttrs[j];
      if (oldEl.getAttribute(attr.name) !== attr.value) {
        oldEl.setAttribute(attr.name, attr.value);
      }
    }
  }

  function isScriptTag(node) {
    return !!node && node.nodeType === 1 && node.tagName === 'SCRIPT';
  }

  function morphChildren(oldParent, newParent) {
    var oldChildren = Array.prototype.slice.call(oldParent.childNodes);
    var newChildren = Array.prototype.slice.call(newParent.childNodes);
    var max = Math.max(oldChildren.length, newChildren.length);
    for (var i = 0; i < max; i++) {
      var oldChild = oldChildren[i];
      var newChild = newChildren[i];
      if (!oldChild && newChild) {
        // Never insert a brand-new <script> element - dynamically appended scripts
        // execute per spec, and a 'dom' sync should never legitimately carry new script
        // content anyway (only the initial page load should ever introduce scripts).
        if (isScriptTag(newChild)) continue;
        oldParent.appendChild(document.importNode(newChild, true));
      } else if (oldChild && !newChild) {
        oldParent.removeChild(oldChild);
      } else if (oldChild && newChild) {
        morphNode(oldChild, newChild, oldParent);
      }
    }
  }

  function morphNode(oldNode, newNode, parent) {
    if (oldNode.nodeType !== newNode.nodeType ||
        (oldNode.nodeType === 1 && oldNode.tagName !== newNode.tagName)) {
      if (isScriptTag(newNode)) return; // never swap other content out for a script
      parent.replaceChild(document.importNode(newNode, true), oldNode);
      return;
    }
    if (oldNode.nodeType === 3 || oldNode.nodeType === 8) {
      if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
      return;
    }
    if (oldNode.nodeType !== 1) return;
    if (oldNode.tagName === 'SCRIPT') return; // never touch script content/attrs - already executed
    morphAttributes(oldNode, newNode);
    // Sync live form state that isn't reflected as an attribute (value/checked can
    // diverge from the value="" attribute once the user or a script changes it).
    var tag = oldNode.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (oldNode.type === 'checkbox' || oldNode.type === 'radio') {
        if (oldNode.checked !== newNode.checked) oldNode.checked = newNode.checked;
      } else if (oldNode.value !== newNode.value) {
        oldNode.value = newNode.value;
      }
    }
    morphChildren(oldNode, newNode);
  }

  function morphDocument(htmlString) {
    var newDoc = new DOMParser().parseFromString(htmlString, 'text/html');
    morphNode(document.documentElement, newDoc.documentElement, document);
  }

  // Grid rendering/rotation (stacked cells, aspect-container sizing) lives in
  // grid-display.js, shared with readonly.js - see that file, loaded alongside this one.

  if (isDesktop) {
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws/desktop';

    function attachDesktopHandlers() {
      ws.onerror = function () { showWsLostStartTimer(desktopReconnect); };
      ws.onclose = function () { showWsLostStartTimer(desktopReconnect); };
      ws.onmessage = function (event) {
        try {
          var message = JSON.parse(event.data);
          if (message.type === 'config_update') { window.location.reload(); return; }
          if (message.type === 'update_available') { showUpdateNotification(message.data); return; }
          if (message.type === 'aprs_update') { window.dispatchEvent(new CustomEvent('glancerf_aprs_update')); return; }
          if (message.type === 'gpio_input' && message.data) {
            window.dispatchEvent(new CustomEvent('glancerf_gpio_input', { detail: message.data }));
          }
          if (message.type === 'dom') return;
        } catch (e) {
          if (typeof console !== 'undefined' && console.debug) console.debug('WebSocket message parse error', e);
        }
      };
      ws.onopen = function () { hideWsLostStopTimer(); };
    }

    function desktopReconnect() {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      ws = new WebSocket(wsUrl);
      attachDesktopHandlers();
    }

    ws = new WebSocket(wsUrl);
    attachDesktopHandlers();
    setInterval(sendState, 1000);
  } else {
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws/browser';

    function applyDomUpdate(d) {
      if (!d || !d.html) return;
      var scrollState = d.scrollState || {};
      var formState = d.formState || {};
      morphDocument(d.html);
      if (scrollState.x !== undefined || scrollState.y !== undefined) {
        window.scrollTo(scrollState.x || 0, scrollState.y || 0);
      }
      Object.keys(formState).forEach(function (id) {
        var el = safeGetFormElement(id);
        if (el) {
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!formState[id];
          else el.value = formState[id];
        }
      });
    }

    function attachBrowserHandlers() {
      ws.onerror = function () { showWsLostStartTimer(browserReconnect); };
      ws.onclose = function () { showWsLostStartTimer(browserReconnect); };
      ws.onmessage = function (event) {
        try {
          var message = JSON.parse(event.data);
          if (message.type === 'config_update') { window.location.reload(); return; }
          if (message.type === 'update_available') { showUpdateNotification(message.data); return; }
          if (message.type === 'aprs_update') { window.dispatchEvent(new CustomEvent('glancerf_aprs_update')); return; }
          if (message.type === 'gpio_input' && message.data) {
            window.dispatchEvent(new CustomEvent('glancerf_gpio_input', { detail: message.data }));
          }
          if (message.type === 'dom') {
            applyDomUpdate(message.data);
            return;
          }
          if (message.type === 'state' && message.data && (message.data.grid_columns !== undefined || message.data.grid_rows !== undefined)) {
            window.location.reload();
          }
        } catch (e) {
          if (typeof console !== 'undefined' && console.debug) console.debug('WebSocket message parse error', e);
        }
      };
      ws.onopen = function () { hideWsLostStopTimer(); };
    }

    function browserReconnect() {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      ws = new WebSocket(wsUrl);
      attachBrowserHandlers();
    }

    ws = new WebSocket(wsUrl);
    attachBrowserHandlers();
    setInterval(sendState, 1000);
  }
})();
