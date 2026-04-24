(function () {
  'use strict';

  var SETUP_PAGE_COUNT = 5;
  var cfg = window.SETUP_CONFIG || {};
  var currentAspectRatio = cfg.current_ratio != null ? cfg.current_ratio : '16:9';
  var currentOrientation = cfg.current_orientation != null ? cfg.current_orientation : 'landscape';
  var targetRatio = 16 / 9;

  function getDOMElements() {
    var previewSquare = document.getElementById('preview-square');
    return {
      gridColumnsInput: document.getElementById('grid_columns'),
      gridRowsInput: document.getElementById('grid_rows'),
      aspectRatioSelect: document.getElementById('aspect_ratio'),
      orientationSelect: document.getElementById('orientation'),
      columnsValue: document.getElementById('columns-value'),
      rowsValue: document.getElementById('rows-value'),
      previewSquare: previewSquare,
      previewContainer: previewSquare && previewSquare.parentElement,
      sliderContainerInner: document.querySelector('.slider-container-inner'),
      previewWrapper: document.querySelector('.preview-wrapper'),
      rowSliderWrapper: document.querySelector('.slider-vertical-wrapper'),
      sliderRotated: document.querySelector('.slider-vertical-rotated')
    };
  }

  function updateBoxDimensions() {
    var els = getDOMElements();
    if (!els.previewContainer || !els.previewSquare) return;
    var orientation = (els.orientationSelect && els.orientationSelect.value) || currentOrientation;
    var isPortrait = orientation === 'portrait';
    var containerWidth = els.previewContainer.offsetWidth;
    var maxHeightPx = Math.min(window.innerHeight * 0.55, 500);
    var boxWidth, boxHeight;
    if (isPortrait) {
      var displayRatio = 1 / targetRatio;
      boxHeight = maxHeightPx;
      boxWidth = boxHeight * displayRatio;
    } else {
      if (containerWidth <= 0) return;
      displayRatio = targetRatio;
      boxWidth = containerWidth;
      boxHeight = containerWidth / displayRatio;
    }
    els.previewSquare.style.width = boxWidth + 'px';
    els.previewSquare.style.height = boxHeight + 'px';
    if (els.previewContainer) {
      if (isPortrait) {
        els.previewContainer.style.width = boxWidth + 'px';
        els.previewContainer.style.maxWidth = boxWidth + 'px';
      } else {
        els.previewContainer.style.width = '';
        els.previewContainer.style.maxWidth = '';
      }
    }
    if (els.sliderContainerInner && els.previewWrapper) {
      els.sliderContainerInner.style.width = boxWidth + 'px';
      var wrapperRect = els.previewWrapper.getBoundingClientRect();
      var boxRect = els.previewSquare.getBoundingClientRect();
      var rightEdge = boxRect.right - wrapperRect.left;
      els.sliderContainerInner.style.marginRight = (els.previewWrapper.offsetWidth - rightEdge) + 'px';
    }
    if (els.rowSliderWrapper && boxHeight > 0) {
      els.rowSliderWrapper.style.height = boxHeight + 'px';
      if (els.sliderRotated) {
        els.sliderRotated.style.width = boxHeight + 'px';
        els.sliderRotated.style.height = '8px';
        els.sliderRotated.style.marginLeft = (-boxHeight / 2) + 'px';
      }
    }
  }

  function updatePreview() {
    var els = getDOMElements();
    if (!els.gridColumnsInput || !els.gridRowsInput || !els.aspectRatioSelect ||
        !els.columnsValue || !els.rowsValue || !els.previewSquare) {
      return;
    }
    var columns = parseInt(els.gridColumnsInput.value, 10);
    var rows = parseInt(els.gridRowsInput.value, 10);
    if (!isFinite(columns) || columns < 1) columns = 1;
    if (!isFinite(rows) || rows < 1) rows = 1;
    var aspectRatio = els.aspectRatioSelect.value;
    if (els.orientationSelect) currentOrientation = els.orientationSelect.value;
    els.columnsValue.textContent = columns;
    els.rowsValue.textContent = rows;
    currentAspectRatio = aspectRatio;
    var ratioParts = aspectRatio.split(':');
    var ratioNum = parseFloat(ratioParts[0]);
    var ratioDen = parseFloat(ratioParts[1]);
    if (!isFinite(ratioNum) || !isFinite(ratioDen) || ratioDen === 0) {
      targetRatio = 16 / 9;
    } else {
      targetRatio = ratioNum / ratioDen;
    }
    els.previewSquare.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';
    els.previewSquare.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < columns * rows; i++) {
      var cell = document.createElement('div');
      cell.className = 'preview-cell';
      fragment.appendChild(cell);
    }
    els.previewSquare.innerHTML = '';
    els.previewSquare.appendChild(fragment);
    requestAnimationFrame(function () {
      updateBoxDimensions();
      setTimeout(updateBoxDimensions, 50);
    });
  }

  function initializeEventListeners() {
    var els = getDOMElements();
    if (!els.gridColumnsInput || !els.gridRowsInput || !els.aspectRatioSelect) return;
    els.gridColumnsInput.addEventListener('input', updatePreview);
    els.gridRowsInput.addEventListener('input', updatePreview);
    els.aspectRatioSelect.addEventListener('change', updatePreview);
    if (els.orientationSelect) {
      els.orientationSelect.addEventListener('change', updatePreview);
    }
  }

  var resizeTimeout;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      var layoutPage = document.getElementById('setup-page-4');
      if (layoutPage && layoutPage.classList.contains('active')) {
        updatePreview();
      }
    }, 100);
  });

  function showSetupPage(num) {
    if (num < 1 || num > SETUP_PAGE_COUNT) return;
    var i;
    for (i = 1; i <= SETUP_PAGE_COUNT; i++) {
      var page = document.getElementById('setup-page-' + i);
      var tab = document.getElementById('tab-page-' + i);
      if (page) page.classList.toggle('active', num === i);
      if (tab) {
        tab.classList.toggle('active', num === i);
        tab.setAttribute('aria-selected', num === i ? 'true' : 'false');
      }
    }
    if (num === 2 && window._gpsLoadOnShow) {
      window._gpsLoadOnShow();
      window._gpsSetupLoadedOnce = true;
    }
    if (num === 3 && window._gpsLoadOnShow && !window._gpsSetupLoadedOnce) {
      window._gpsLoadOnShow();
      window._gpsSetupLoadedOnce = true;
    }
    if (num === 4) { updatePreview(); setTimeout(updatePreview, 100); }
  }

  function bindSetupNavButton(id, page) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function () { showSetupPage(page); });
  }

  bindSetupNavButton('setup-welcome-next', 2);
  bindSetupNavButton('setup-hardware-next', 3);
  bindSetupNavButton('setup-station-next', 4);
  bindSetupNavButton('setup-layout-next', 5);
  bindSetupNavButton('setup-station-back', 2);
  bindSetupNavButton('setup-layout-back', 3);
  bindSetupNavButton('setup-tips-back', 4);

  var tabsRoot = document.querySelector('.setup-tabs');
  if (tabsRoot) {
    tabsRoot.addEventListener('click', function (e) {
      var btn = e.target.closest('.setup-tab');
      if (!btn || !tabsRoot.contains(btn)) return;
      var p = parseInt(btn.getAttribute('data-page'), 10);
      if (p >= 1 && p <= SETUP_PAGE_COUNT) showSetupPage(p);
    });
  }

  function initGpsTab() {
    var container = document.getElementById('gps-status-container');
    var summaryLine = document.getElementById('gps-summary-line');
    var gpsSection = document.getElementById('gps-section');
    var refreshBtn = document.getElementById('gps-refresh-btn');
    var sourceSelect = document.getElementById('gps_source');
    var portRow = document.getElementById('gps-serial-port-row');
    var portSelect = document.getElementById('gps_serial_port');
    var locationToggle = document.getElementById('gps_location_enabled');
    var locationHint = document.getElementById('gps-location-hint');
    var locationSubmit = document.getElementById('gps_location_enabled_submit');
    if (!container || !summaryLine) return;

    function setSummaryLine(text, kind) {
      summaryLine.textContent = text || '';
      summaryLine.className = 'gps-summary-line gps-summary-' + (kind || 'neutral');
    }

    function escapeHtml(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function renderStatus(data) {
      var gpsConnected = data.gpsd_connected || (data.serial_ports_with_gps && data.serial_ports_with_gps.length > 0);
      var hasFix = data.gpsd_has_fix || (data.serial_ports_with_gps && data.serial_ports_with_gps.length > 0);

      if (gpsSection) gpsSection.style.display = 'block';  // Always show config

      if (!gpsConnected) {
        setSummaryLine('No GPS detected. Choose a method and press Refresh status.', 'warning');
        container.innerHTML = '';
      } else {
        setSummaryLine(
          hasFix ? 'GPS connected — fix acquired.' : 'GPS connected — waiting for fix.',
          hasFix ? 'ok' : 'warning'
        );
        if (data.methods && data.methods.length > 0) {
          var boxClass = hasFix ? 'ok' : 'warning';
          var html = '<div class="gps-status-box gps-status-' + boxClass + '"><ul class="gps-devices-list">';
          data.methods.forEach(function(m) {
            var badge = m.working ? (m.has_fix ? 'Active' : 'Waiting') : (m.available ? 'Not running' : 'Unavailable');
            html += '<li><strong>' + escapeHtml(m.name) + '</strong>: ' + escapeHtml(m.detail) + ' <span class="gps-device-badge">(' + badge + ')</span></li>';
          });
          html += '</ul></div>';
          container.innerHTML = html;
        } else {
          container.innerHTML = '';
        }
      }

      if (locationToggle && locationHint) {
        if (hasFix) {
          locationToggle.disabled = false;
          locationHint.textContent = 'GPS has fix. You can use GPS for default location.';
          locationHint.className = 'setup-location-hint setup-location-hint--ok';
        } else {
          locationToggle.disabled = true;
          locationToggle.value = '0';
          if (locationSubmit) locationSubmit.value = '0';
          locationHint.textContent = 'No GPS fix. Enter manual location above.';
          locationHint.className = 'setup-location-hint setup-location-hint--muted';
        }
      }
      if (locationToggle && locationSubmit && !locationToggle.disabled) {
        locationSubmit.value = locationToggle.value;
      }

      if (sourceSelect && portRow && portSelect) {
        sourceSelect.value = data.gps_source || 'auto';
        portRow.style.display = sourceSelect.value === 'serial' ? 'block' : 'none';
        portSelect.innerHTML = '<option value="">-- Select port --</option>';
        var ports = data.serial_ports_with_gps || data.devices || [];
        if (ports.length === 0) ports = data.devices || [];
        ports.forEach(function(p) {
          var path = typeof p === 'string' ? p : (p.path || p.device);
          if (path) {
            var opt = document.createElement('option');
            opt.value = path;
            opt.textContent = path;
            if (path === (data.gps_serial_port || '')) opt.selected = true;
            portSelect.appendChild(opt);
          }
        });
      }
    }

    function loadStatus() {
      if (gpsSection) gpsSection.style.display = 'block';
      setSummaryLine('Checking GPS status…', 'checking');
      if (container) container.innerHTML = '';
      if (refreshBtn) refreshBtn.disabled = true;
      fetch('/api/gps/status')
        .then(function(r) {
          if (!r.ok) throw new Error('GPS status HTTP ' + r.status);
          return r.json();
        })
        .then(function(data) {
          renderStatus(data);
          if (refreshBtn) refreshBtn.disabled = false;
        })
        .catch(function() {
          setSummaryLine('Could not check GPS status.', 'error');
          if (container) container.innerHTML = '';
          if (gpsSection) gpsSection.style.display = 'block';
          if (refreshBtn) refreshBtn.disabled = false;
        });
    }

    window._gpsLoadOnShow = loadStatus;
    if (refreshBtn) refreshBtn.addEventListener('click', loadStatus);
    if (sourceSelect) sourceSelect.addEventListener('change', function() {
      if (portRow) portRow.style.display = sourceSelect.value === 'serial' ? 'block' : 'none';
    });
    if (locationToggle && locationSubmit) {
      locationToggle.addEventListener('change', function() {
        if (!locationToggle.disabled) locationSubmit.value = locationToggle.value;
      });
    }
    var setupForm = document.getElementById('setup-form');
    if (setupForm && locationToggle && locationSubmit) {
      setupForm.addEventListener('submit', function() {
        locationSubmit.value = locationToggle.disabled ? '0' : locationToggle.value;
      });
    }
  }

  function initSetupClickOnlyNav() {
    var root = document.querySelector('.setup-container');
    var form = document.getElementById('setup-form');
    if (root) {
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var el = e.target;
        if (el && el.classList && el.classList.contains('setup-nav-action')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    }
    if (form) {
      form.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var t = e.target;
        if (!t || t.tagName !== 'INPUT') return;
        var type = (t.type || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio' || type === 'range' || type === 'button' || type === 'submit' || type === 'reset') return;
        e.preventDefault();
      }, true);
    }
  }

  function initializeSetup() {
    initSetupClickOnlyNav();
    initializeEventListeners();
    updatePreview();
    initGpsTab();
    var setupForm = document.getElementById('setup-form');
    if (setupForm) {
      setupForm.addEventListener('submit', function (e) {
        var tipsPage = document.getElementById('setup-page-5');
        if (!tipsPage || !tipsPage.classList.contains('active')) {
          e.preventDefault();
          return;
        }
        if (window._setupFormSubmitting) {
          e.preventDefault();
          return;
        }
        window._setupFormSubmitting = true;
        var btn = document.getElementById('setup-continue-btn');
        if (btn) btn.disabled = true;
      });
    }
    var match = /[?&]tab=([^&]+)/.exec(window.location.search || '');
    if (match) {
      try {
        var tabParam = decodeURIComponent(match[1]);
        if (tabParam === 'gps' || tabParam === 'hardware') showSetupPage(2);
      } catch (e) {
        if (match[1] === 'gps' || match[1] === 'hardware') showSetupPage(2);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSetup);
  } else {
    initializeSetup();
  }
})();
