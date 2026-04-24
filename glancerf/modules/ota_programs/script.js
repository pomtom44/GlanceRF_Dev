(function() {
  function getCellSettings(cell) {
    var allSettings = window.GLANCERF_MODULE_SETTINGS || {};
    var r = cell.getAttribute('data-row');
    var c = cell.getAttribute('data-col');
    if (typeof window.glancerfSettingsForElement === 'function') {
        return window.glancerfSettingsForElement(cell);
    }
    var cellKey = (r != null && c != null) ? r + '_' + c : '';
    return (cellKey && allSettings[cellKey]) ? allSettings[cellKey] : {};
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseIso(ts) {
    if (!ts) return null;
    try {
      return new Date(ts.replace('Z', ''));
    } catch (e) {
      return null;
    }
  }

  function formatTimeSince(ts) {
    var d = parseIso(ts);
    if (!d || isNaN(d.getTime())) return '';
    var now = Date.now();
    var diffMs = now - d.getTime();
    var mins = Math.floor(diffMs / 60000);
    var hrs = Math.floor(mins / 60);
    var days = Math.floor(hrs / 24);
    if (days > 0) return days + 'd ago';
    if (hrs > 0) return hrs + 'h ago';
    if (mins > 0) return mins + 'm ago';
    return 'now';
  }

  function formatCountdown(ts) {
    var d = parseIso(ts);
    if (!d || isNaN(d.getTime())) return '';
    var now = Date.now();
    var diffMs = d.getTime() - now;
    if (diffMs < 0) return formatTimeSince(ts);
    var mins = Math.floor(diffMs / 60000);
    var hrs = Math.floor(mins / 60);
    var days = Math.floor(hrs / 24);
    if (days > 0) return 'in ' + days + 'd';
    if (hrs > 0) return 'in ' + hrs + 'h';
    if (mins > 0) return 'in ' + mins + 'm';
    return 'now';
  }

  function formatTime(ts) {
    var d = parseIso(ts);
    if (!d || isNaN(d.getTime())) return ts || '';
    return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0') + 'Z';
  }

  function buildSotaQuery(settings) {
    var q = [];
    var hp = 24;
    try {
      var v = parseFloat(settings.cache_hours_past, 10);
      if (v >= 1 && v <= 720) hp = v;
    } catch (e) {}
    q.push('hours=' + encodeURIComponent(hp));
    var hf = 168;
    try {
      var v = parseFloat(settings.cache_hours_future, 10);
      if (v >= 1 && v <= 720) hf = v;
    } catch (e) {}
    q.push('hours_future=' + encodeURIComponent(hf));
    var call = (settings.callsign_filter || '').trim();
    if (call) q.push('callsign=' + encodeURIComponent(call));
    var showSpots = settings.show_sota_spots !== false && settings.show_sota_spots !== 'false' && settings.show_sota_spots !== '0';
    var showAlerts = settings.show_sota_alerts !== false && settings.show_sota_alerts !== 'false' && settings.show_sota_alerts !== '0';
    q.push('spots=' + (showSpots ? 'true' : 'false'));
    q.push('alerts=' + (showAlerts ? 'true' : 'false'));
    return q.join('&');
  }

  function buildPotaQuery(settings) {
    var q = [];
    var hp = 24;
    try {
      var v = parseFloat(settings.cache_hours_past, 10);
      if (v >= 1 && v <= 720) hp = v;
    } catch (e) {}
    q.push('hours=' + encodeURIComponent(hp));
    var call = (settings.callsign_filter || '').trim();
    if (call) q.push('callsign=' + encodeURIComponent(call));
    return q.join('&');
  }

  function buildWwffQuery(settings) {
    var q = [];
    var hp = 24;
    try {
      var v = parseFloat(settings.cache_hours_past, 10);
      if (v >= 1 && v <= 720) hp = v;
    } catch (e) {}
    q.push('hours=' + encodeURIComponent(hp));
    var call = (settings.callsign_filter || '').trim();
    if (call) q.push('callsign=' + encodeURIComponent(call));
    return q.join('&');
  }

  function renderSotaSpot(s, showTimeSince) {
    var call = escapeHtml(s.activatorCallsign || '');
    var summit = escapeHtml(s.summitCode || s.summitDetails || '');
    var freq = escapeHtml(s.frequency || '');
    var mode = escapeHtml(s.mode || '');
    var timePart = showTimeSince ? formatTimeSince(s.timeStamp) : formatTime(s.timeStamp);
    return '<span class="ota_programs_src">SOTA</span> <strong>' + call + '</strong> ' + summit + ' ' + freq + ' ' + mode + ' ' + timePart;
  }

  function renderSotaAlert(a, showCountdown) {
    var call = escapeHtml(a.activatingCallsign || a.posterCallsign || '');
    var summit = escapeHtml(a.summitCode || a.summitDetails || '');
    var timePart = showCountdown ? formatCountdown(a.dateActivated || a.timeStamp) : formatTime(a.dateActivated || a.timeStamp);
    return '<span class="ota_programs_src">SOTA</span> <strong>' + call + '</strong> ' + summit + ' ' + timePart;
  }

  function renderPotaSpot(s, showTimeSince) {
    var call = escapeHtml(s.activator || '');
    var park = escapeHtml(s.reference || s.name || '');
    var freq = escapeHtml(s.frequency || '');
    var mode = escapeHtml(s.mode || '');
    var timePart = showTimeSince ? formatTimeSince(s.spotTime) : formatTime(s.spotTime);
    return '<span class="ota_programs_src">POTA</span> <strong>' + call + '</strong> ' + park + ' ' + freq + ' ' + mode + ' ' + timePart;
  }

  function renderWwffSpot(s, showTimeSince) {
    var call = escapeHtml(s.activator || '');
    var ref = escapeHtml(s.reference || s.reference_name || '');
    var freq = s.frequency_khz ? String(s.frequency_khz / 1000) + ' MHz' : '';
    var mode = escapeHtml(s.mode || '');
    var timePart = showTimeSince ? formatTimeSince(s.spotTime) : formatTime(s.spotTime);
    return '<span class="ota_programs_src">WWFF</span> <strong>' + call + '</strong> ' + ref + ' ' + freq + ' ' + mode + ' ' + timePart;
  }

  function updateCell(cell) {
    var wrap = cell.querySelector('.ota_programs_wrap');
    var loadEl = cell.querySelector('.ota_programs_loading');
    var errEl = cell.querySelector('.ota_programs_error');
    var emptyEl = cell.querySelector('.ota_programs_empty');
    var contentEl = cell.querySelector('.ota_programs_content');
    var listEl = cell.querySelector('.ota_programs_list');
    var refreshEl = cell.querySelector('.ota_programs_last_refresh');

    if (!wrap || !listEl) return;

    var settings = getCellSettings(cell);
    var showSotaSpots = settings.show_sota_spots !== false && settings.show_sota_spots !== 'false' && settings.show_sota_spots !== '0';
    var showSotaAlerts = settings.show_sota_alerts !== false && settings.show_sota_alerts !== 'false' && settings.show_sota_alerts !== '0';
    var showPotaSpots = settings.show_pota_spots !== false && settings.show_pota_spots !== 'false' && settings.show_pota_spots !== '0';
    var showWwffSpots = settings.show_wwff_spots !== false && settings.show_wwff_spots !== 'false' && settings.show_wwff_spots !== '0';
    var listMode = (settings.list_mode || 'separate').toLowerCase();
    var showCountdown = settings.show_countdown !== false && settings.show_countdown !== 'false' && settings.show_countdown !== '0';
    var showTimeSince = settings.show_time_since !== false && settings.show_time_since !== 'false' && settings.show_time_since !== '0';

    var wantsSota = showSotaSpots || showSotaAlerts;
    var wantsPota = showPotaSpots;
    var wantsWwff = showWwffSpots;
    if (!wantsSota && !wantsPota && !wantsWwff) {
      if (emptyEl) {
        emptyEl.textContent = 'Enable at least one source (SOTA spots, SOTA alerts, POTA spots, WWFF spots).';
        emptyEl.style.display = '';
      }
      return;
    }

    if (loadEl) loadEl.style.display = '';
    if (errEl) errEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';

    var promises = [];
    var idx = 0;
    if (wantsSota) promises.push(fetch('/api/sota/data?' + buildSotaQuery(settings)).then(function(r) { return r.json(); }));
    if (wantsPota) promises.push(fetch('/api/pota/data?' + buildPotaQuery(settings)).then(function(r) { return r.json(); }));
    if (wantsWwff) promises.push(fetch('/api/wwff/data?' + buildWwffQuery(settings)).then(function(r) { return r.json(); }));

    Promise.all(promises).then(function(results) {
      var sotaData = wantsSota ? results[0] : { spots: [], alerts: [] };
      var potaData = wantsPota ? results[wantsSota ? 1 : 0] : { spots: [] };
      var wwffData = wantsWwff ? results[(wantsSota ? 1 : 0) + (wantsPota ? 1 : 0)] : { spots: [] };
      if (sotaData.error || (potaData && potaData.error) || (wwffData && wwffData.error)) {
        if (errEl) {
          errEl.textContent = sotaData.error || (potaData && potaData.error) || (wwffData && wwffData.error) || 'Failed to load data.';
          errEl.style.display = '';
        }
        if (loadEl) loadEl.style.display = 'none';
        return;
      }

      var sotaSpots = (sotaData.spots && Array.isArray(sotaData.spots)) ? sotaData.spots : [];
      var sotaAlerts = (sotaData.alerts && Array.isArray(sotaData.alerts)) ? sotaData.alerts : [];
      var potaSpots = (potaData && potaData.spots && Array.isArray(potaData.spots)) ? potaData.spots : [];
      var wwffSpots = (wwffData && wwffData.spots && Array.isArray(wwffData.spots)) ? wwffData.spots : [];

      var hasAny = (showSotaSpots && sotaSpots.length > 0) || (showSotaAlerts && sotaAlerts.length > 0) || (showPotaSpots && potaSpots.length > 0) || (showWwffSpots && wwffSpots.length > 0);
      if (!hasAny) {
        if (emptyEl) {
          emptyEl.textContent = 'No data. Cache populates every 2 min.';
          emptyEl.style.display = '';
        }
        if (loadEl) loadEl.style.display = 'none';
        return;
      }

      if (loadEl) loadEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';
      listEl.innerHTML = '';

      if (listMode === 'together') {
        var combined = [];
        if (showSotaSpots) sotaSpots.forEach(function(s) { combined.push({ type: 'sota_spot', data: s }); });
        if (showSotaAlerts) sotaAlerts.forEach(function(a) { combined.push({ type: 'sota_alert', data: a }); });
        if (showPotaSpots) potaSpots.forEach(function(s) { combined.push({ type: 'pota_spot', data: s }); });
        if (showWwffSpots) wwffSpots.forEach(function(s) { combined.push({ type: 'wwff_spot', data: s }); });
        combined.sort(function(a, b) {
          var ta = 0;
          if (a.type === 'sota_spot') ta = parseIso(a.data.timeStamp) || 0;
          else if (a.type === 'sota_alert') ta = parseIso(a.data.dateActivated) || 0;
          else if (a.type === 'pota_spot') ta = parseIso(a.data.spotTime) || 0;
          else if (a.type === 'wwff_spot') ta = parseIso(a.data.spotTime) || 0;
          var tb = 0;
          if (b.type === 'sota_spot') tb = parseIso(b.data.timeStamp) || 0;
          else if (b.type === 'sota_alert') tb = parseIso(b.data.dateActivated) || 0;
          else if (b.type === 'pota_spot') tb = parseIso(b.data.spotTime) || 0;
          else if (b.type === 'wwff_spot') tb = parseIso(b.data.spotTime) || 0;
          return tb - ta;
        });
        combined.slice(0, 30).forEach(function(item) {
          var div = document.createElement('div');
          div.className = 'ota_programs_item ota_programs_item_' + item.type;
          if (item.type === 'sota_spot') div.innerHTML = renderSotaSpot(item.data, showTimeSince);
          else if (item.type === 'sota_alert') div.innerHTML = renderSotaAlert(item.data, showCountdown);
          else if (item.type === 'pota_spot') div.innerHTML = renderPotaSpot(item.data, showTimeSince);
          else if (item.type === 'wwff_spot') div.innerHTML = renderWwffSpot(item.data, showTimeSince);
          listEl.appendChild(div);
        });
        if (combined.length > 30) {
          var more = document.createElement('div');
          more.className = 'ota_programs_item ota_programs_more';
          more.textContent = '... and ' + (combined.length - 30) + ' more';
          listEl.appendChild(more);
        }
      } else {
        if (showSotaSpots && sotaSpots.length > 0) {
          var st = document.createElement('div');
          st.className = 'ota_programs_section_title';
          st.textContent = 'SOTA spots';
          listEl.appendChild(st);
          sotaSpots.slice(0, 10).forEach(function(s) {
            var div = document.createElement('div');
            div.className = 'ota_programs_item';
            div.innerHTML = renderSotaSpot(s, showTimeSince);
            listEl.appendChild(div);
          });
          if (sotaSpots.length > 10) {
            var m = document.createElement('div');
            m.className = 'ota_programs_item ota_programs_more';
            m.textContent = '... ' + (sotaSpots.length - 10) + ' more';
            listEl.appendChild(m);
          }
        }
        if (showSotaAlerts && sotaAlerts.length > 0) {
          var at = document.createElement('div');
          at.className = 'ota_programs_section_title';
          at.textContent = 'SOTA alerts';
          listEl.appendChild(at);
          sotaAlerts.slice(0, 8).forEach(function(a) {
            var div = document.createElement('div');
            div.className = 'ota_programs_item ota_programs_item_alert';
            div.innerHTML = renderSotaAlert(a, showCountdown);
            listEl.appendChild(div);
          });
          if (sotaAlerts.length > 8) {
            var m = document.createElement('div');
            m.className = 'ota_programs_item ota_programs_more';
            m.textContent = '... ' + (sotaAlerts.length - 8) + ' more';
            listEl.appendChild(m);
          }
        }
        if (showPotaSpots && potaSpots.length > 0) {
          var pt = document.createElement('div');
          pt.className = 'ota_programs_section_title';
          pt.textContent = 'POTA spots';
          listEl.appendChild(pt);
          potaSpots.slice(0, 10).forEach(function(s) {
            var div = document.createElement('div');
            div.className = 'ota_programs_item';
            div.innerHTML = renderPotaSpot(s, showTimeSince);
            listEl.appendChild(div);
          });
          if (potaSpots.length > 10) {
            var m = document.createElement('div');
            m.className = 'ota_programs_item ota_programs_more';
            m.textContent = '... ' + (potaSpots.length - 10) + ' more';
            listEl.appendChild(m);
          }
        }
        if (showWwffSpots && wwffSpots.length > 0) {
          var wt = document.createElement('div');
          wt.className = 'ota_programs_section_title';
          wt.textContent = 'WWFF spots';
          listEl.appendChild(wt);
          wwffSpots.slice(0, 10).forEach(function(s) {
            var div = document.createElement('div');
            div.className = 'ota_programs_item';
            div.innerHTML = renderWwffSpot(s, showTimeSince);
            listEl.appendChild(div);
          });
          if (wwffSpots.length > 10) {
            var m = document.createElement('div');
            m.className = 'ota_programs_item ota_programs_more';
            m.textContent = '... ' + (wwffSpots.length - 10) + ' more';
            listEl.appendChild(m);
          }
        }
      }

      if (refreshEl) {
        refreshEl.textContent = 'From cache (refreshes every 2 min)';
        refreshEl.style.display = '';
      }
    }).catch(function() {
      if (loadEl) loadEl.style.display = 'none';
      if (errEl) {
        errEl.textContent = 'Failed to load data.';
        errEl.style.display = '';
      }
    });
  }

  function run() {
    document.querySelectorAll('.grid-cell-ota_programs').forEach(function(cell) {
      updateCell(cell);
    });
  }

  run();
  setInterval(run, 60000);
})();
