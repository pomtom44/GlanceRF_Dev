(function() {
    var cfg = window.LAYOUT_CONFIG || {};
    var MODULE_SETTINGS_BY_CELL = cfg.module_settings_by_cell || {};
    var MODULES_SETTINGS_SCHEMA = cfg.modules_settings_schema || {};
    window.GLANCERF_SETUP_CALLSIGN = cfg.setup_callsign != null ? cfg.setup_callsign : '';
    window.GLANCERF_SETUP_LOCATION = cfg.setup_location != null ? cfg.setup_location : '';
    var gridColumns = Number(cfg.grid_columns) || 3;
    var gridRows = Number(cfg.grid_rows) || 3;

    function stripTrailingSlash(s) {
        var p = (s == null || s === '') ? '/' : String(s);
        return (p.length > 1 && p.charAt(p.length - 1) === '/') ? p.slice(0, -1) : p;
    }

    function layoutHasBothCallsignAndOnTheAir() {
        var selects = document.querySelectorAll('.grid-layout .cell-slot-module-select');
        var hasCallsign = false, hasOnTheAir = false;
        selects.forEach(function(sel) {
            if (sel.value === 'callsign') hasCallsign = true;
            if (sel.value === 'on_air_indicator') hasOnTheAir = true;
        });
        return hasCallsign && hasOnTheAir;
    }

var currentDesktopWidth = 0;
            var currentDesktopHeight = 0;

            var expandedSettingsCell = null;
            var expandedSettingsSlotRow = null;

            function slotNamePrefix(row, col, slotIdx) {
                return 'ms_' + row + '_' + col + '__slot_' + slotIdx + '__';
            }

            function syncCellModuleSettingsCacheFromDom(cell) {
                var row = cell.getAttribute('data-row');
                var col = cell.getAttribute('data-col');
                var cellKey = row + '_' + col;
                var rotateInput = cell.querySelector('.cell-rotate-seconds');
                var rotate_seconds = 30;
                if (rotateInput) {
                    var rv = parseFloat(rotateInput.value);
                    if (!isNaN(rv)) rotate_seconds = Math.max(5, Math.min(86400, rv));
                }
                var slots = [];
                cell.querySelectorAll('.cell-module-slot-row').forEach(function(sr, idx) {
                    var sel = sr.querySelector('.cell-slot-module-select');
                    if (!sel || !sel.value) return;
                    var settings = {};
                    var prefix = 'ms_' + row + '_' + col + '__slot_' + idx + '__';
                    document.querySelectorAll('[name^="' + prefix.replace(/"/g, '\\"') + '"]').forEach(function(el) {
                        var name = el.getAttribute('name');
                        if (!name || name.indexOf(prefix) !== 0) return;
                        var sid = name.slice(prefix.length);
                        if (!sid) return;
                        if (el.type === 'checkbox') {
                            settings[sid] = el.checked;
                        } else {
                            settings[sid] = el.value || '';
                        }
                    });
                    slots.push({ module_id: sel.value, settings: settings });
                });
                if (slots.length > 0) {
                    var animSel = cell.querySelector('.cell-rotate-animation');
                    var rotate_animation = (animSel && animSel.value) ? String(animSel.value).toLowerCase() : 'none';
                    var validAnim = { none: 1, fade: 1, zoom: 1, slide: 1, flip: 1 };
                    if (!validAnim[rotate_animation]) rotate_animation = 'none';
                    MODULE_SETTINGS_BY_CELL[cellKey] = {
                        rotate_seconds: rotate_seconds,
                        rotate_animation: rotate_animation,
                        slots: slots,
                    };
                } else {
                    delete MODULE_SETTINGS_BY_CELL[cellKey];
                }
            }

            function reindexSlotRows(cell) {
                var row = cell.getAttribute('data-row');
                var col = cell.getAttribute('data-col');
                cell.querySelectorAll('.cell-module-slot-row').forEach(function(sr, idx) {
                    sr.setAttribute('data-slot-index', String(idx));
                    var sel = sr.querySelector('.cell-slot-module-select');
                    if (sel) sel.setAttribute('name', 'cell_slot_' + row + '_' + col + '_' + idx);
                    var btn = sr.querySelector('.cell-slot-config-btn');
                    if (btn) btn.setAttribute('data-slot-index', String(idx));
                    var host = sr.querySelector('.cell-slot-settings-host');
                    if (host) host.setAttribute('data-slot-index', String(idx));
                    if (!host) return;
                    host.querySelectorAll('[name]').forEach(function(el) {
                        var n = el.getAttribute('name');
                        if (!n) return;
                        var m = n.match(/^ms_\d+_\d+__slot_\d+__(.+)$/);
                        if (m) el.setAttribute('name', 'ms_' + row + '_' + col + '__slot_' + idx + '__' + m[1]);
                    });
                });
            }

            function addSlotRowElement(cell, idx) {
                var container = cell.querySelector('.cell-slots-container');
                if (!container) return;
                var row = cell.getAttribute('data-row');
                var col = cell.getAttribute('data-col');
                var firstSel = container.querySelector('.cell-slot-module-select');
                var optsHtml = firstSel ? firstSel.innerHTML : '';
                var wrap = document.createElement('div');
                wrap.className = 'cell-module-slot-row';
                wrap.setAttribute('data-slot-index', String(idx));
                wrap.innerHTML = '<div class="cell-slot-row-actions" aria-label="Reorder and remove">' +
                    '<button type="button" class="cell-slot-move-up" data-row="' + row + '" data-col="' + col + '" title="Move module up" aria-label="Move module up">▲</button>' +
                    '<button type="button" class="cell-slot-move-down" data-row="' + row + '" data-col="' + col + '" title="Move module down" aria-label="Move module down">▼</button>' +
                    '<button type="button" class="cell-slot-remove" data-row="' + row + '" data-col="' + col + '" title="Remove module" aria-label="Remove module">✕</button></div>' +
                    '<select class="cell-slot-module-select" data-row="' + row + '" data-col="' + col + '" name="cell_slot_' + row + '_' + col + '_' + idx + '" aria-label="Module ' + (idx + 1) + '">' + optsHtml + '</select>' +
                    '<button type="button" class="cell-slot-config-btn" data-row="' + row + '" data-col="' + col + '" data-slot-index="' + idx + '" title="Configure this module" aria-label="Configure module">⚙</button>' +
                    '<div class="cell-slot-settings-host cell-module-settings" data-slot-index="' + idx + '"></div>';
                container.appendChild(wrap);
                var newSel = wrap.querySelector('.cell-slot-module-select');
                if (newSel) newSel.value = '';
            }

            var MAX_CELL_MODULE_SLOTS = 12;

            function syncSlotRows(cell) {
                var container = cell.querySelector('.cell-slots-container');
                if (!container) return;
                // If the first row is empty but a later row has a module (e.g. bfcache/back restores
                // the blank option on row 0), the trim below would keep only the empty row and delete
                // real modules. Remove leading empty rows first (keep one row if all empty).
                while (true) {
                    var leadRows = container.querySelectorAll('.cell-module-slot-row');
                    if (leadRows.length <= 1) break;
                    var leadSel = leadRows[0].querySelector('.cell-slot-module-select');
                    if (leadSel && leadSel.value) break;
                    if (expandedSettingsCell === cell && expandedSettingsSlotRow === leadRows[0]) closeCellSettingsModal();
                    leadRows[0].remove();
                }
                var rowEls = Array.prototype.slice.call(container.querySelectorAll('.cell-module-slot-row'));
                var firstEmpty = -1;
                for (var i = 0; i < rowEls.length; i++) {
                    var sel = rowEls[i].querySelector('.cell-slot-module-select');
                    if (!sel || !sel.value) {
                        firstEmpty = i;
                        break;
                    }
                }
                if (expandedSettingsCell === cell && expandedSettingsSlotRow && firstEmpty !== -1) {
                    var exIdx = rowEls.indexOf(expandedSettingsSlotRow);
                    if (exIdx > firstEmpty) closeCellSettingsModal();
                }
                if (firstEmpty === -1) {
                    if (rowEls.length < MAX_CELL_MODULE_SLOTS) {
                        addSlotRowElement(cell, rowEls.length);
                        reindexSlotRows(cell);
                        refreshAllSlotsInCell(cell);
                        refreshSlotConfigButtons();
                    }
                    return;
                }
                while (container.querySelectorAll('.cell-module-slot-row').length > firstEmpty + 1) {
                    var last = container.querySelector('.cell-module-slot-row:last-child');
                    if (last) last.remove();
                }
                if (container.querySelectorAll('.cell-module-slot-row').length === 0) {
                    addSlotRowElement(cell, 0);
                }
                reindexSlotRows(cell);
                refreshAllSlotsInCell(cell);
                refreshSlotConfigButtons();
            }

            function refreshSlotReorderButtons(cell) {
                if (!cell) return;
                var rows = cell.querySelectorAll('.cell-module-slot-row');
                var n = rows.length;
                for (var i = 0; i < n; i++) {
                    var sr = rows[i];
                    var sel = sr.querySelector('.cell-slot-module-select');
                    var emptySlot = !sel || !sel.value;
                    var up = sr.querySelector('.cell-slot-move-up');
                    var down = sr.querySelector('.cell-slot-move-down');
                    var rm = sr.querySelector('.cell-slot-remove');
                    if (up) up.disabled = i === 0 || emptySlot;
                    if (down) down.disabled = i === n - 1 || emptySlot;
                    if (rm) rm.disabled = emptySlot;
                }
            }

            function moveSlotRowUp(cell, rowEl) {
                var prev = rowEl.previousElementSibling;
                if (!prev || !prev.classList.contains('cell-module-slot-row')) return;
                rowEl.parentNode.insertBefore(rowEl, prev);
                reindexSlotRows(cell);
                syncCellModuleSettingsCacheFromDom(cell);
                refreshSlotReorderButtons(cell);
                refreshSlotConfigButtons();
                refreshCellBackground(cell);
            }

            function moveSlotRowDown(cell, rowEl) {
                var next = rowEl.nextElementSibling;
                if (!next || !next.classList.contains('cell-module-slot-row')) return;
                next.parentNode.insertBefore(next, rowEl);
                reindexSlotRows(cell);
                syncCellModuleSettingsCacheFromDom(cell);
                refreshSlotReorderButtons(cell);
                refreshSlotConfigButtons();
                refreshCellBackground(cell);
            }

            function removeSlotRow(cell, rowEl, e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                var container = cell.querySelector('.cell-slots-container');
                if (!container) return;
                var rows = container.querySelectorAll('.cell-module-slot-row');
                if (expandedSettingsCell === cell && expandedSettingsSlotRow === rowEl) closeCellSettingsModal();
                if (rows.length <= 1) {
                    var sel = rowEl.querySelector('.cell-slot-module-select');
                    if (sel) sel.value = '';
                    updateSlotRowSettings(cell, rowEl);
                    syncCellModuleSettingsCacheFromDom(cell);
                    syncSlotRows(cell);
                    refreshSlotReorderButtons(cell);
                    refreshSlotConfigButtons();
                    refreshCellBackground(cell);
                    return;
                }
                rowEl.remove();
                reindexSlotRows(cell);
                syncCellModuleSettingsCacheFromDom(cell);
                refreshSlotReorderButtons(cell);
                refreshSlotConfigButtons();
                refreshCellBackground(cell);
                syncSlotRows(cell);
            }

            function getSlotSettingsFromConfig(cellKey, slotIdx) {
                var cell = MODULE_SETTINGS_BY_CELL[cellKey];
                if (!cell) return {};
                if (cell.slots && cell.slots[slotIdx] && cell.slots[slotIdx].settings) {
                    var s = cell.slots[slotIdx].settings;
                    return typeof s === 'object' && s ? Object.assign({}, s) : {};
                }
                if (slotIdx === 0) {
                    var o = {};
                    for (var k in cell) {
                        if (cell.hasOwnProperty(k) && k !== 'slots' && k !== 'rotate_seconds' && k !== 'rotate_animation') {
                            o[k] = cell[k];
                        }
                    }
                    return o;
                }
                return {};
            }

            function updateSlotRowSettings(cellEl, slotRow) {
                var row = cellEl.getAttribute('data-row');
                var col = cellEl.getAttribute('data-col');
                var cellKey = row + '_' + col;
                var slotIdx = parseInt(slotRow.getAttribute('data-slot-index'), 10);
                if (isNaN(slotIdx)) slotIdx = 0;
                var select = slotRow.querySelector('.cell-slot-module-select');
                var moduleId = select ? select.value : '';
                var container = slotRow.querySelector('.cell-slot-settings-host');
                if (!container) return;
                container.innerHTML = '';
                var schema = MODULES_SETTINGS_SCHEMA[moduleId];
                if (!schema || schema.length === 0) return;
                var vals = getSlotSettingsFromConfig(cellKey, slotIdx);
                var inner = document.createElement('div');
                inner.className = 'cell-module-settings-inner';
                var hasShowWhenSource = schema.some(function(x) { return x.show_when_source; });
                var lastBandCheckboxRow = null;
                var lastBandCheckboxId = null;
                var nameP = slotNamePrefix(row, col, slotIdx);
                schema.forEach(function(s) {
                    if (s.type === 'separator') {
                        var sep = document.createElement('div');
                        sep.className = 'cell-setting-separator';
                        var line = document.createElement('div');
                        line.className = 'cell-setting-separator-line';
                        sep.appendChild(line);
                        inner.appendChild(sep);
                        return;
                    }
                    if (moduleId === 'callsign' && s.id === 'on_the_air_shortcut' && layoutHasBothCallsignAndOnTheAir()) {
                        var otaLabel = document.createElement('label');
                        otaLabel.className = 'cell-setting-label';
                        otaLabel.textContent = s.label;
                        inner.appendChild(otaLabel);
                        var otaInp = document.createElement('input');
                        otaInp.type = 'text';
                        otaInp.className = 'cell-setting-select';
                        otaInp.disabled = true;
                        otaInp.placeholder = 'Uses the shared On-Air shortcut';
                        otaInp.value = '';
                        inner.appendChild(otaInp);
                        return;
                    }
                    var cur = vals[s.id] !== undefined ? vals[s.id] : (s.default !== undefined ? s.default : '');
                    if (!cur || cur === '') {
                        if (s.id === 'callsign' && window.GLANCERF_SETUP_CALLSIGN) {
                            cur = window.GLANCERF_SETUP_CALLSIGN;
                        } else if ((s.id === 'location' || s.id === 'grid') && window.GLANCERF_SETUP_LOCATION) {
                            cur = window.GLANCERF_SETUP_LOCATION;
                        }
                    }
                    var rowWrap = null;
                    if (hasShowWhenSource && s.show_when_source) {
                        rowWrap = document.createElement('div');
                        rowWrap.className = 'cell-setting-row';
                        rowWrap.setAttribute('data-show-when-source', s.show_when_source);
                    }
                    var label = document.createElement('label');
                    label.className = 'cell-setting-label';
                    label.textContent = s.label;
                    if (rowWrap) rowWrap.appendChild(label); else if (s.type !== 'checkbox' && s.type !== 'color') inner.appendChild(label);
                    if (s.type === 'select') {
                        var opts = s.options || [];
                        if (s.optionsBySource && s.parentSettingId) {
                            var parentVal = vals[s.parentSettingId];
                            if (parentVal === undefined || parentVal === '' || !s.optionsBySource[parentVal])
                                parentVal = Object.keys(s.optionsBySource)[0];
                            opts = s.optionsBySource[parentVal] || opts;
                            var curInOpts = opts.some(function(opt) { return String(opt.value) === String(cur); });
                            if (!curInOpts && opts.length && opts[0].value !== undefined) cur = opts[0].value;
                        }
                        var sel = document.createElement('select');
                        sel.className = 'cell-setting-select';
                        sel.setAttribute('name', nameP + s.id);
                        if (s.optionsBySource && s.parentSettingId) {
                            sel.setAttribute('data-parent-setting-id', s.parentSettingId);
                            sel.setAttribute('data-options-by-source', JSON.stringify(s.optionsBySource));
                        }
                        opts.forEach(function(opt) {
                            var op = document.createElement('option');
                            op.value = opt.value;
                            op.textContent = opt.label;
                            if (String(opt.value) === String(cur)) op.selected = true;
                            sel.appendChild(op);
                        });
                        if (rowWrap) { rowWrap.appendChild(sel); inner.appendChild(rowWrap); } else inner.appendChild(sel);
                    } else if (s.type === 'number' || s.type === 'text') {
                        var inp = document.createElement('input');
                        inp.type = s.type;
                        inp.className = 'cell-setting-select';
                        inp.setAttribute('name', nameP + s.id);
                        inp.value = cur;
                        if (s.placeholder) inp.placeholder = s.placeholder;
                        if (s.type === 'number') {
                            if (s.min !== undefined) inp.min = s.min;
                            if (s.max !== undefined) inp.max = s.max;
                        }
                        if (rowWrap) { rowWrap.appendChild(inp); inner.appendChild(rowWrap); } else inner.appendChild(inp);
                    } else if (s.type === 'range') {
                        var wrap = document.createElement('div');
                        wrap.className = 'cell-setting-range-wrap';
                        wrap.style.display = 'flex';
                        wrap.style.alignItems = 'center';
                        wrap.style.gap = '8px';
                        var inp = document.createElement('input');
                        inp.type = 'range';
                        inp.className = 'cell-setting-select';
                        inp.setAttribute('name', nameP + s.id);
                        if (s.min !== undefined) inp.min = s.min;
                        if (s.max !== undefined) inp.max = s.max;
                        if (s.step !== undefined) inp.step = s.step;
                        var numCur = (cur !== '' && cur !== undefined && cur !== null) ? Number(cur) : NaN;
                        if (!isNaN(numCur) && s.min !== undefined && s.max !== undefined) {
                            numCur = Math.max(s.min, Math.min(s.max, numCur));
                        }
                        inp.value = (!isNaN(numCur) ? numCur : (s.default !== undefined ? s.default : s.min !== undefined ? s.min : 0));
                        var valSpan = document.createElement('span');
                        valSpan.style.minWidth = '2.5em';
                        valSpan.textContent = inp.value + (s.unit || '');
                        inp.addEventListener('input', function() { valSpan.textContent = inp.value + (s.unit || ''); });
                        wrap.appendChild(inp);
                        wrap.appendChild(valSpan);
                        if (rowWrap) { rowWrap.appendChild(wrap); inner.appendChild(rowWrap); } else inner.appendChild(wrap);
                    } else if (s.type === 'checkbox') {
                        var inp = document.createElement('input');
                        inp.type = 'checkbox';
                        inp.className = 'cell-setting-select';
                        inp.setAttribute('name', nameP + s.id);
                        inp.checked = (cur === true || cur === 'true' || cur === 1 || cur === '1');
                        var rowEl = document.createElement('div');
                        rowEl.className = 'cell-setting-row cell-setting-inline-row';
                        rowEl.style.display = 'flex';
                        rowEl.style.alignItems = 'center';
                        rowEl.style.gap = '8px';
                        rowEl.appendChild(label);
                        rowEl.appendChild(inp);
                        inner.appendChild(rowEl);
                        if (s.id && s.id.indexOf('band_') === 0 && s.id.indexOf('_color') === -1) {
                            lastBandCheckboxRow = rowEl;
                            lastBandCheckboxId = s.id;
                        } else {
                            lastBandCheckboxRow = null;
                            lastBandCheckboxId = null;
                        }
                    } else if (s.type === 'color') {
                        var hex = (cur && /^#[0-9A-Fa-f]{3,8}$/.test(String(cur))) ? String(cur) : (s.default && /^#[0-9A-Fa-f]{3,8}$/.test(String(s.default)) ? String(s.default) : '#0f0');
                        var inp = document.createElement('input');
                        inp.type = 'color';
                        inp.className = 'cell-setting-select';
                        inp.setAttribute('name', nameP + s.id);
                        inp.value = hex;
                        if (lastBandCheckboxRow && lastBandCheckboxId && s.id === lastBandCheckboxId + '_color') {
                            lastBandCheckboxRow.classList.add('cell-setting-band-row');
                            var spacer = document.createElement('span');
                            spacer.className = 'cell-setting-inline-spacer';
                            var colorLabel = document.createElement('span');
                            colorLabel.className = 'cell-setting-label cell-setting-color-label';
                            colorLabel.textContent = s.label;
                            lastBandCheckboxRow.appendChild(spacer);
                            lastBandCheckboxRow.appendChild(colorLabel);
                            lastBandCheckboxRow.appendChild(inp);
                            lastBandCheckboxRow = null;
                            lastBandCheckboxId = null;
                        } else {
                            var rowEl = document.createElement('div');
                            rowEl.className = 'cell-setting-row cell-setting-inline-row';
                            rowEl.style.display = 'flex';
                            rowEl.style.alignItems = 'center';
                            rowEl.style.gap = '8px';
                            rowEl.appendChild(label);
                            rowEl.appendChild(inp);
                            inner.appendChild(rowEl);
                        }
                    } else {
                        var customWrap = document.createElement('div');
                        customWrap.className = 'cell-setting-custom';
                        customWrap.setAttribute('data-setting-type', s.type);
                        customWrap.setAttribute('data-cell-key', cellKey);
                        customWrap.setAttribute('data-setting-id', s.id);
                        customWrap.setAttribute('data-current-value', typeof cur === 'string' ? cur : (cur != null ? JSON.stringify(cur) : ''));
                        var hidden = document.createElement('input');
                        hidden.type = 'hidden';
                        hidden.className = 'cell-setting-custom-value';
                        hidden.setAttribute('name', nameP + s.id);
                        hidden.value = typeof cur === 'string' ? cur : (cur != null ? JSON.stringify(cur) : '');
                        var customUi = document.createElement('div');
                        customUi.className = 'cell-setting-custom-ui';
                        customWrap.appendChild(hidden);
                        customWrap.appendChild(customUi);
                        if (rowWrap) { rowWrap.appendChild(customWrap); inner.appendChild(rowWrap); } else inner.appendChild(customWrap);
                    }
                    if (s.hintUrl) {
                        var hintLink = document.createElement('a');
                        hintLink.href = s.hintUrl;
                        hintLink.target = '_blank';
                        hintLink.rel = 'noopener noreferrer';
                        hintLink.textContent = s.hintText || 'Guide';
                        hintLink.className = 'cell-setting-hint-link';
                        inner.appendChild(hintLink);
                    }
                });
                container.appendChild(inner);
                if (hasShowWhenSource) {
                    var sourceSelect = container.querySelector('select[name="' + nameP.replace(/"/g, '\\"') + 'source_type"]');
                    if (sourceSelect) {
                        function applyWebcamSourceVisibility() {
                            var v = sourceSelect.value;
                            container.querySelectorAll('.cell-setting-row[data-show-when-source]').forEach(function(rowEl) {
                                rowEl.style.display = (rowEl.getAttribute('data-show-when-source') === v) ? '' : 'none';
                            });
                        }
                        applyWebcamSourceVisibility();
                        sourceSelect.addEventListener('change', applyWebcamSourceVisibility);
                    }
                }
                try {
                    document.dispatchEvent(new CustomEvent('glancerf-cell-settings-updated', { detail: { container: container } }));
                } catch (e) {}
                refreshSlotConfigButtons();
            }

            function refreshAllSlotsInCell(cellEl) {
                cellEl.querySelectorAll('.cell-module-slot-row').forEach(function(sr) {
                    updateSlotRowSettings(cellEl, sr);
                });
                refreshCellBackground(cellEl);
            }

            function refreshCellBackground(cellEl) {
                var first = cellEl.querySelector('.cell-slot-module-select');
                var mid = first && first.value ? first.value : '';
                var colors = (window.LAYOUT_CONFIG && window.LAYOUT_CONFIG.module_colors) || {};
                var mod = colors[mid];
                if (mod) cellEl.style.backgroundColor = mod;
            }

            /** Re-apply module dropdowns from MODULE_SETTINGS_BY_CELL (fixes bfcache/back losing selections). */
            function applySlotModuleSelectionsFromCell(cell) {
                var row = cell.getAttribute('data-row');
                var col = cell.getAttribute('data-col');
                var cellKey = row + '_' + col;
                var ms = MODULE_SETTINGS_BY_CELL[cellKey];
                if (!ms || !ms.slots || !ms.slots.length) return;
                var slotRows = cell.querySelectorAll('.cell-module-slot-row');
                ms.slots.forEach(function(slot, idx) {
                    if (idx >= slotRows.length) return;
                    var sel = slotRows[idx].querySelector('.cell-slot-module-select');
                    if (!sel || !slot.module_id) return;
                    for (var oi = 0; oi < sel.options.length; oi++) {
                        if (sel.options[oi].value === slot.module_id) {
                            sel.value = slot.module_id;
                            break;
                        }
                    }
                });
            }

            function updateAllCellSettings() {
                document.querySelectorAll('.grid-cell:not(.hidden)').forEach(function(cell) {
                    var ck = cell.getAttribute('data-row') + '_' + cell.getAttribute('data-col');
                    var ms = MODULE_SETTINGS_BY_CELL[ck];
                    if (ms && ms.rotate_seconds != null) {
                        var ri = cell.querySelector('.cell-rotate-seconds');
                        if (ri) ri.value = ms.rotate_seconds;
                    }
                    if (ms && ms.rotate_animation != null) {
                        var ani = cell.querySelector('.cell-rotate-animation');
                        if (ani) ani.value = String(ms.rotate_animation).toLowerCase();
                    }
                    refreshAllSlotsInCell(cell);
                    syncSlotRows(cell);
                });
                refreshSlotConfigButtons();
            }

            function refreshSlotConfigButtons() {
                document.querySelectorAll('.grid-cell:not(.hidden)').forEach(function(cell) {
                    cell.querySelectorAll('.cell-module-slot-row').forEach(function(slotRow) {
                        var btn = slotRow.querySelector('.cell-slot-config-btn');
                        if (!btn) return;
                        if (expandedSettingsCell === cell && expandedSettingsSlotRow === slotRow) {
                            btn.classList.remove('cell-slot-config-btn-hidden');
                            btn.setAttribute('aria-hidden', 'false');
                            return;
                        }
                        var sel = slotRow.querySelector('.cell-slot-module-select');
                        var mid = sel ? sel.value : '';
                        var schema = MODULES_SETTINGS_SCHEMA[mid];
                        var hasSchema = schema && schema.length > 0;
                        var show = mid && hasSchema;
                        if (show) {
                            btn.classList.remove('cell-slot-config-btn-hidden');
                            btn.setAttribute('aria-hidden', 'false');
                        } else {
                            btn.classList.add('cell-slot-config-btn-hidden');
                            btn.setAttribute('aria-hidden', 'true');
                        }
                    });
                    refreshSlotReorderButtons(cell);
                });
            }

            function formatSettingValueForSummary(s, el) {
                if (!el) return '';
                if (el.type === 'checkbox') return el.checked ? 'On' : 'Off';
                if (el.type === 'color') return el.value || '';
                if (el.type === 'range') return (el.value || '') + (s.unit || '');
                if (el.classList && el.classList.contains('cell-setting-custom-value')) {
                    var v = el.value || '';
                    if (v.length > 80) return v.slice(0, 77) + '…';
                    return v;
                }
                var t = el.value != null ? String(el.value) : '';
                if (t.length > 80) return t.slice(0, 77) + '…';
                return t;
            }

            function updateExpandedLiveSummary(cellEl, slotRow) {
                var live = cellEl.querySelector('.cell-settings-expanded-live');
                if (!live) return;
                var row = cellEl.getAttribute('data-row');
                var col = cellEl.getAttribute('data-col');
                var cellKey = row + '_' + col;
                var slotIdx = parseInt(slotRow.getAttribute('data-slot-index'), 10) || 0;
                var sel = slotRow.querySelector('.cell-slot-module-select');
                var moduleId = sel ? sel.value : '';
                var schema = MODULES_SETTINGS_SCHEMA[moduleId];
                if (!schema || !schema.length) {
                    live.innerHTML = '';
                    return;
                }
                var nameP = slotNamePrefix(row, col, slotIdx);
                var parts = [];
                schema.forEach(function(s) {
                    if (s.type === 'separator') return;
                    if (moduleId === 'callsign' && s.id === 'on_the_air_shortcut' && layoutHasBothCallsignAndOnTheAir()) return;
                    var name = nameP + s.id;
                    var modalBody = document.getElementById('layout-cell-settings-modal-body');
                    var el = modalBody ? modalBody.querySelector('[name="' + name.replace(/"/g, '\\"') + '"]') : null;
                    if (!el) return;
                    var val = formatSettingValueForSummary(s, el);
                    parts.push('<div class="cell-settings-live-line"><span class="cell-settings-live-label">' + String(s.label || s.id).replace(/</g, '&lt;') + '</span>: <span class="cell-settings-live-val">' + String(val).replace(/</g, '&lt;') + '</span></div>');
                });
                live.innerHTML = parts.join('') || '<span class="cell-settings-live-empty">(no values)</span>';
            }

            function closeCellSettingsModal() {
                if (!expandedSettingsCell) return;
                var cellEl = expandedSettingsCell;
                var slotRow = expandedSettingsSlotRow;
                var modal = document.getElementById('layout-cell-settings-modal');
                var modalBody = document.getElementById('layout-cell-settings-modal-body');
                var ph = cellEl.querySelector('.cell-module-settings-placeholder');
                var host = modalBody ? modalBody.querySelector('.cell-slot-settings-host') : null;
                if (ph) ph.remove();
                if (host && slotRow) {
                    slotRow.appendChild(host);
                }
                expandedSettingsCell = null;
                expandedSettingsSlotRow = null;
                if (modal) {
                    modal.classList.remove('open');
                    modal.setAttribute('aria-hidden', 'true');
                }
                refreshSlotConfigButtons();
            }

            function openCellSlotSettingsModal(cellEl, slotRow) {
                var host = slotRow.querySelector('.cell-slot-settings-host');
                if (!host) return;
                var inner = host.querySelector('.cell-module-settings-inner');
                if (!inner) {
                    updateSlotRowSettings(cellEl, slotRow);
                    inner = host.querySelector('.cell-module-settings-inner');
                }
                if (!inner) return;
                if (expandedSettingsCell && (expandedSettingsCell !== cellEl || expandedSettingsSlotRow !== slotRow)) closeCellSettingsModal();
                var modal = document.getElementById('layout-cell-settings-modal');
                var modalBody = document.getElementById('layout-cell-settings-modal-body');
                var titleEl = document.getElementById('layout-cell-settings-modal-title');
                if (!modal || !modalBody) return;
                var row = cellEl.getAttribute('data-row');
                var col = cellEl.getAttribute('data-col');
                var sel = slotRow.querySelector('.cell-slot-module-select');
                var opt = sel && sel.options[sel.selectedIndex];
                if (titleEl) titleEl.textContent = (opt ? opt.textContent : 'Module') + ' — cell ' + row + ',' + col;
                modalBody.innerHTML = '';
                modalBody.appendChild(host);
                modalBody.scrollTop = 0;
                var ph = document.createElement('div');
                ph.className = 'cell-module-settings-placeholder';
                ph.innerHTML = '<div class="cell-settings-expanded-hint">Module settings (this slot). Changes apply when you save the layout.</div><div class="cell-settings-expanded-live"></div>';
                var controls = cellEl.querySelector('.cell-controls');
                if (controls) cellEl.insertBefore(ph, controls);
                else cellEl.appendChild(ph);
                expandedSettingsCell = cellEl;
                expandedSettingsSlotRow = slotRow;
                modal.classList.add('open');
                modal.setAttribute('aria-hidden', 'false');
                refreshSlotConfigButtons();
                updateExpandedLiveSummary(cellEl, slotRow);
                try {
                    document.dispatchEvent(new CustomEvent('glancerf-cell-settings-updated', { detail: { container: host } }));
                } catch (e) {}
                var closeBtn = document.getElementById('layout-cell-settings-modal-close');
                if (closeBtn) closeBtn.focus();
            }

            document.addEventListener('click', function(e) {
                var t = e.target;
                if (t && t.classList && t.classList.contains('cell-slot-config-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var cell = t.closest('.grid-cell');
                    var sr = t.closest('.cell-module-slot-row');
                    if (cell && sr) openCellSlotSettingsModal(cell, sr);
                }
            }, true);

            document.addEventListener('click', function(e) {
                var t = e.target;
                if (!t || !t.classList) return;
                if (t.classList.contains('cell-slot-move-up')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var cell = t.closest('.grid-cell');
                    var rowEl = t.closest('.cell-module-slot-row');
                    if (cell && rowEl && !t.disabled) moveSlotRowUp(cell, rowEl);
                    return;
                }
                if (t.classList.contains('cell-slot-move-down')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var cell = t.closest('.grid-cell');
                    var rowEl = t.closest('.cell-module-slot-row');
                    if (cell && rowEl && !t.disabled) moveSlotRowDown(cell, rowEl);
                    return;
                }
                if (t.classList.contains('cell-slot-remove')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var cell = t.closest('.grid-cell');
                    var rowEl = t.closest('.cell-module-slot-row');
                    if (cell && rowEl) removeSlotRow(cell, rowEl, e);
                }
            }, true);

            document.addEventListener('input', function(e) {
                if (!expandedSettingsCell || !expandedSettingsSlotRow) return;
                var modal = document.getElementById('layout-cell-settings-modal');
                if (!modal || !modal.classList.contains('open')) return;
                if (!e.target || !modal.contains(e.target)) return;
                updateExpandedLiveSummary(expandedSettingsCell, expandedSettingsSlotRow);
            }, true);

            document.addEventListener('change', function(e) {
                if (!expandedSettingsCell || !expandedSettingsSlotRow) return;
                var modal = document.getElementById('layout-cell-settings-modal');
                if (!modal || !modal.classList.contains('open')) return;
                if (!e.target || !modal.contains(e.target)) return;
                updateExpandedLiveSummary(expandedSettingsCell, expandedSettingsSlotRow);
            }, true);

            (function bindModalClose() {
                var modal = document.getElementById('layout-cell-settings-modal');
                if (!modal) return;
                var backdrop = modal.querySelector('.layout-cell-settings-modal-backdrop');
                var closeBtn = document.getElementById('layout-cell-settings-modal-close');
                if (backdrop) backdrop.addEventListener('click', closeCellSettingsModal);
                if (closeBtn) closeBtn.addEventListener('click', closeCellSettingsModal);
            })();
        
            document.addEventListener('change', function(e) {
                if (e.target && e.target.classList && e.target.classList.contains('cell-rotate-animation')) {
                    var cell = e.target.closest('.grid-cell');
                    if (cell) syncCellModuleSettingsCacheFromDom(cell);
                }
                if (e.target && e.target.classList && e.target.classList.contains('cell-slot-module-select')) {
                    var cell = e.target.closest('.grid-cell');
                    var sr = e.target.closest('.cell-module-slot-row');
                    if (cell && expandedSettingsCell === cell && expandedSettingsSlotRow === sr) closeCellSettingsModal();
                    if (cell && sr) updateSlotRowSettings(cell, sr);
                    if (cell) refreshCellBackground(cell);
                    if (cell) syncSlotRows(cell);
                    if (cell) syncCellModuleSettingsCacheFromDom(cell);
                }
                if (e.target && e.target.classList && e.target.classList.contains('cell-setting-select') && e.target.name && e.target.getAttribute('name').indexOf('__slot_') >= 0) {
                    var container = e.target.closest('.cell-slot-settings-host');
                    if (!container) return;
                    var name = e.target.getAttribute('name');
                    var m = name.match(/__slot_(\d+)__(.+)$/);
                    if (!m) return;
                    var settingId = m[2];
                    var dependent = container.querySelector('.cell-setting-select[data-parent-setting-id="' + settingId + '"]');
                    if (!dependent || !dependent.getAttribute('data-options-by-source')) return;
                    var optionsBySource = JSON.parse(dependent.getAttribute('data-options-by-source'));
                    var newParentVal = e.target.value;
                    var opts = optionsBySource[newParentVal];
                    if (!opts || !opts.length) return;
                    var cur = dependent.value;
                    var curInOpts = opts.some(function(opt) { return String(opt.value) === String(cur); });
                    if (!curInOpts) cur = opts[0].value;
                    dependent.innerHTML = '';
                    opts.forEach(function(opt) {
                        var op = document.createElement('option');
                        op.value = opt.value;
                        op.textContent = opt.label;
                        if (String(opt.value) === String(cur)) op.selected = true;
                        dependent.appendChild(op);
                    });
                    dependent.value = cur;
                }
            });

            function enforceAspectRatio() {
                const container = document.getElementById('aspect-container');
                if (!container) return;
                container.style.width = '';
                container.style.height = '';
                container.style.maxWidth = '';
                container.style.maxHeight = '';
            }

            let resizeTimeout;
            function debouncedEnforceAspectRatio() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(enforceAspectRatio, 50);
            }

            window.addEventListener('load', function() {
                enforceAspectRatio();
                updateAllCellSettings();
                setTimeout(function() { enforceAspectRatio(); updateAllCellSettings(); }, 100);
            });
            window.addEventListener('pageshow', function(ev) {
                if (!ev.persisted) return;
                document.querySelectorAll('.grid-cell:not(.hidden)').forEach(function(cell) {
                    applySlotModuleSelectionsFromCell(cell);
                });
                updateAllCellSettings();
            });
            window.addEventListener('resize', debouncedEnforceAspectRatio);
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    setTimeout(enforceAspectRatio, 100);
                }
            });

            // Expand/Contract functionality
            function getCell(row, col) {
                return document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            }
        
            function isPrimaryCell(row, col) {
                // Check if this cell is a primary cell (not hidden and has colspan/rowspan > 1 or is visible)
                const cell = getCell(row, col);
                if (!cell || cell.classList.contains('hidden')) {
                    return false;
                }
                const colspan = parseInt(cell.dataset.colspan) || 1;
                const rowspan = parseInt(cell.dataset.rowspan) || 1;
                // If it has spans > 1, it's a primary cell of an expansion
                // If it's hidden, it's not a primary cell
                return !cell.classList.contains('hidden');
            }
        
            function getPrimaryCellForPosition(row, col) {
                // Find which primary cell (if any) owns this position
                // Check all visible cells to see if this position is within their span
                const allCells = document.querySelectorAll('.grid-cell:not(.hidden)');
                for (let cell of allCells) {
                    const cellRow = parseInt(cell.dataset.row);
                    const cellCol = parseInt(cell.dataset.col);
                    const colspan = parseInt(cell.dataset.colspan) || 1;
                    const rowspan = parseInt(cell.dataset.rowspan) || 1;
                
                    // Check if (row, col) is within this cell's span
                    if (row >= cellRow && row < cellRow + rowspan &&
                        col >= cellCol && col < cellCol + colspan) {
                        // If it's the primary cell itself, return null (can't expand into own primary)
                        if (row === cellRow && col === cellCol) {
                            return null;
                        }
                        // Otherwise, return the primary cell that owns this position
                        return {row: cellRow, col: cellCol, cell: cell};
                    }
                }
                return null;
            }
        
            function resetCellExpansion(primaryRow, primaryCol) {
                // Reset a cell's expansion back to 1x1 and show all its merged cells
                const cell = getCell(primaryRow, primaryCol);
                if (!cell) return;
            
                const colspan = parseInt(cell.dataset.colspan) || 1;
                const rowspan = parseInt(cell.dataset.rowspan) || 1;
            
                // Show all cells that were merged into this one
                for (let r = primaryRow; r < primaryRow + rowspan; r++) {
                    for (let c = primaryCol; c < primaryCol + colspan; c++) {
                        if (r !== primaryRow || c !== primaryCol) {
                            showCell(r, c);
                        }
                    }
                }
            
                // Reset the span to 1x1
                updateCellSpan(cell, 1, 1);
            }
        
            function updateCellSpan(cell, colspan, rowspan) {
                cell.setAttribute('data-colspan', colspan);
                cell.setAttribute('data-rowspan', rowspan);
                cell.style.gridColumn = `span ${colspan}`;
                cell.style.gridRow = `span ${rowspan}`;
            
                // Update button visibility
                const contractLeft = cell.querySelector('.contract-left');
                const contractTop = cell.querySelector('.contract-top');
                const expandRight = cell.querySelector('.expand-right');
                const expandDown = cell.querySelector('.expand-down');
            
                contractLeft.classList.toggle('contract-disabled', colspan <= 1);
                contractTop.classList.toggle('contract-disabled', rowspan <= 1);

                // Hide expand buttons if at grid edge
                const maxCol = gridColumns;
                const maxRow = gridRows;
                const cellCol = parseInt(cell.dataset.col);
                const cellRow = parseInt(cell.dataset.row);
            
                expandRight.style.display = (cellCol + colspan < maxCol) ? 'flex' : 'none';
                expandDown.style.display = (cellRow + rowspan < maxRow) ? 'flex' : 'none';
            
                // Dropdown is always centered horizontally and pinned to top
                // No need to change alignment based on span
            }
        
            function hideCell(row, col) {
                const cell = getCell(row, col);
                if (cell) {
                    cell.classList.add('hidden');
                }
            }
        
            function showCell(row, col) {
                const cell = getCell(row, col);
                if (cell) {
                    cell.classList.remove('hidden');
                }
            }
        
            // Handle expand/contract button clicks
            document.addEventListener('click', function(event) {
                if (event.target.classList.contains('expand-btn')) {
                    const btn = event.target;
                    const row = parseInt(btn.dataset.row);
                    const col = parseInt(btn.dataset.col);
                    const direction = btn.dataset.direction;
                    const cell = getCell(row, col);
                
                    if (!cell) return;
                
                    const currentColspan = parseInt(cell.dataset.colspan) || 1;
                    const currentRowspan = parseInt(cell.dataset.rowspan) || 1;
                
                    if (direction === 'right') {
                        const targetCol = col + currentColspan;
                        // Check all cells in the target column that are covered by the current rowspan
                        let canExpand = true;
                        const cellsToHide = [];
                        const primaryCellsToReset = new Set();
                    
                        for (let r = row; r < row + currentRowspan; r++) {
                            const targetCell = getCell(r, targetCol);
                            if (!targetCell || targetCell.classList.contains('hidden')) {
                                canExpand = false;
                                break;
                            }
                        
                            // Check if this position is owned by a primary cell
                            const owner = getPrimaryCellForPosition(r, targetCol);
                            if (owner) {
                                // This position is part of another expansion
                                // We need to reset that expansion first
                                const ownerKey = `${owner.row}_${owner.col}`;
                                if (!primaryCellsToReset.has(ownerKey)) {
                                    primaryCellsToReset.add(ownerKey);
                                    resetCellExpansion(owner.row, owner.col);
                                }
                            }
                        
                            // Mark this cell to be hidden
                            cellsToHide.push({row: r, col: targetCol});
                        }
                    
                        if (canExpand) {
                            // Hide all marked cells
                            cellsToHide.forEach(function(pos) {
                                hideCell(pos.row, pos.col);
                            });
                            updateCellSpan(cell, currentColspan + 1, currentRowspan);
                        }
                    } else if (direction === 'down') {
                        const targetRow = row + currentRowspan;
                        // Check all cells in the target row that are covered by the current colspan
                        let canExpand = true;
                        const cellsToHide = [];
                        const primaryCellsToReset = new Set();
                    
                        for (let c = col; c < col + currentColspan; c++) {
                            const targetCell = getCell(targetRow, c);
                            if (!targetCell || targetCell.classList.contains('hidden')) {
                                canExpand = false;
                                break;
                            }
                        
                            // Check if this position is owned by a primary cell
                            const owner = getPrimaryCellForPosition(targetRow, c);
                            if (owner) {
                                // This position is part of another expansion
                                // We need to reset that expansion first
                                const ownerKey = `${owner.row}_${owner.col}`;
                                if (!primaryCellsToReset.has(ownerKey)) {
                                    primaryCellsToReset.add(ownerKey);
                                    resetCellExpansion(owner.row, owner.col);
                                }
                            }
                        
                            // Mark this cell to be hidden
                            cellsToHide.push({row: targetRow, col: c});
                        }
                    
                        if (canExpand) {
                            // Hide all marked cells
                            cellsToHide.forEach(function(pos) {
                                hideCell(pos.row, pos.col);
                            });
                            updateCellSpan(cell, currentColspan, currentRowspan + 1);
                        }
                    }
                } else if (event.target.classList.contains('contract-btn')) {
                    const btn = event.target;
                    if (btn.classList.contains('contract-disabled')) return;
                    const row = parseInt(btn.dataset.row);
                    const col = parseInt(btn.dataset.col);
                    const direction = btn.dataset.direction;
                    const cell = getCell(row, col);
                
                    if (!cell) return;
                
                    const currentColspan = parseInt(cell.dataset.colspan) || 1;
                    const currentRowspan = parseInt(cell.dataset.rowspan) || 1;
                
                    if (direction === 'left' && currentColspan > 1) {
                        // Show the rightmost column of cells and contract
                        const showCol = col + currentColspan - 1;
                        for (let r = row; r < row + currentRowspan; r++) {
                            showCell(r, showCol);
                        }
                        updateCellSpan(cell, currentColspan - 1, currentRowspan);
                    } else if (direction === 'top' && currentRowspan > 1) {
                        // Show the bottommost row of cells and contract
                        const showRow = row + currentRowspan - 1;
                        for (let c = col; c < col + currentColspan; c++) {
                            showCell(showRow, c);
                        }
                        updateCellSpan(cell, currentColspan, currentRowspan - 1);
                    }
                }
            });
        
            // Initialize cell spans and button visibility, and hide merged cells
            document.querySelectorAll('.grid-cell').forEach(function(cell) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                const colspan = parseInt(cell.dataset.colspan) || 1;
                const rowspan = parseInt(cell.dataset.rowspan) || 1;
            
                // Apply the span
                updateCellSpan(cell, colspan, rowspan);
            
                // Hide cells that are merged into this one
                for (let r = row; r < row + rowspan; r++) {
                    for (let c = col; c < col + colspan; c++) {
                        if (r !== row || c !== col) {
                            const mergedCell = getCell(r, c);
                            if (mergedCell) {
                                hideCell(r, c);
                            }
                        }
                    }
                }
            });
        
            // Save button handler
            document.getElementById('save-button').addEventListener('click', async function() {
                const layout = [];
                const spans = {};
                const rows = gridRows;
                const cols = gridColumns;

                for (let row = 0; row < rows; row++) {
                    layout[row] = [];
                    for (let col = 0; col < cols; col++) {
                        layout[row][col] = '';
                    }
                }

                document.querySelectorAll('.grid-cell:not(.hidden)').forEach(function(cell) {
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);
                    const colspan = parseInt(cell.dataset.colspan) || 1;
                    const rowspan = parseInt(cell.dataset.rowspan) || 1;
                    const firstSel = cell.querySelector('.cell-slot-module-select');
                    const value = firstSel ? firstSel.value : '';
                    if (!layout[row]) layout[row] = [];
                    layout[row][col] = value || '';
                    if (colspan > 1 || rowspan > 1) {
                        spans[`${row}_${col}`] = {colspan: colspan, rowspan: rowspan};
                    }
                    for (let r = row; r < row + rowspan; r++) {
                        if (!layout[r]) layout[r] = [];
                        for (let c = col; c < col + colspan; c++) {
                            if (r !== row || c !== col) {
                                layout[r][c] = '';
                            }
                        }
                    }
                });

                const module_settings = {};
                document.querySelectorAll('.grid-cell:not(.hidden)').forEach(function(cell) {
                    const row = cell.getAttribute('data-row');
                    const col = cell.getAttribute('data-col');
                    const cellKey = row + '_' + col;
                    const rotateInput = cell.querySelector('.cell-rotate-seconds');
                    let rotate_seconds = 30;
                    if (rotateInput) {
                        const v = parseFloat(rotateInput.value);
                        if (!isNaN(v)) rotate_seconds = Math.max(5, Math.min(86400, v));
                    }
                    const slots = [];
                    cell.querySelectorAll('.cell-module-slot-row').forEach(function(sr, idx) {
                        const sel = sr.querySelector('.cell-slot-module-select');
                        if (!sel || !sel.value) return;
                        const module_id = sel.value;
                        const settings = {};
                        const prefix = 'ms_' + row + '_' + col + '__slot_' + idx + '__';
                        document.querySelectorAll('[name^="' + prefix.replace(/"/g, '\\"') + '"]').forEach(function(el) {
                            const name = el.getAttribute('name');
                            if (!name || name.indexOf(prefix) !== 0) return;
                            const sid = name.slice(prefix.length);
                            if (!sid) return;
                            if (el.type === 'checkbox') {
                                settings[sid] = el.checked;
                            } else {
                                settings[sid] = el.value || '';
                            }
                        });
                        slots.push({ module_id: module_id, settings: settings });
                    });
                    if (slots.length > 0) {
                        var animSel2 = cell.querySelector('.cell-rotate-animation');
                        var rotate_animation = (animSel2 && animSel2.value) ? String(animSel2.value).toLowerCase() : 'none';
                        var validAnim2 = { none: 1, fade: 1, zoom: 1, slide: 1, flip: 1 };
                        if (!validAnim2[rotate_animation]) rotate_animation = 'none';
                        module_settings[cellKey] = {
                            rotate_seconds: rotate_seconds,
                            rotate_animation: rotate_animation,
                            slots: slots,
                        };
                    }
                });

                try {
                    const response = await fetch('/layout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ layout: layout, spans: spans, module_settings: module_settings })
                    });

                    if (response.ok) {
                        window.location.href = '/';
                    } else {
                        alert('Error saving layout');
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('Error saving layout');
                }
            });
        
            function sendDesktopSize() {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'desktop_size', width: window.innerWidth, height: window.innerHeight }));
                }
            }
            let ws = null;
            const urlParams = new URLSearchParams(window.location.search);
            const isDesktop = urlParams.get('desktop') === 'true' || window.navigator.userAgent.includes('QtWebEngine');
        
            if (isDesktop) {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/desktop`;
                console.log('Desktop connecting to WebSocket (layout):', wsUrl);
                ws = new WebSocket(wsUrl);
            
                ws.onerror = function(error) {
                    console.error('Desktop WebSocket error (layout):', error);
                };
            
                ws.onclose = function(event) {
                    console.log('Desktop WebSocket closed (layout):', event.code, event.reason);
                };
            
                // Desktop receives updates from browsers
                ws.onmessage = function(event) {
                    const message = JSON.parse(event.data);
                
                    if (message.type === 'config_update') {
                        console.log('Config updated, reloading page...');
                        window.location.reload();
                        return;
                    }
                    if (message.type === 'state') {
                        if (message.data.desktop_width !== undefined && message.data.desktop_height !== undefined) {
                            currentDesktopWidth = message.data.desktop_width || 0;
                            currentDesktopHeight = message.data.desktop_height || 0;
                        } else {
                            currentDesktopWidth = 0;
                            currentDesktopHeight = 0;
                        }
                        enforceAspectRatio();
                        return;
                    }
                    if (message.type === 'dom') {
                        // Layout editor should not receive DOM updates - only main dashboard syncs
                        return;
                        
                        if (message.data && message.data.html) {
                            var incomingUrl = message.data.url || '';
                            var incomingPath = (function() {
                                try {
                                    var p = new URL(incomingUrl, window.location.origin).pathname;
                                    return stripTrailingSlash(p) || '/';
                                } catch (e) {
                                    var a = document.createElement('a');
                                    a.href = incomingUrl;
                                    return stripTrailingSlash(a.pathname) || '/';
                                }
                            })();
                            var ourPath = stripTrailingSlash(window.location.pathname) || '/';
                            if (incomingPath !== ourPath) return;
                        
                            const parser = new DOMParser();
                            const newDoc = parser.parseFromString(message.data.html, 'text/html');
                            document.documentElement.innerHTML = newDoc.documentElement.innerHTML;
                        
                            if (message.data.formState) {
                                for (const [id, value] of Object.entries(message.data.formState)) {
                                    const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
                                    if (el) {
                                        if (el.type === 'checkbox' || el.type === 'radio') {
                                            el.checked = value;
                                        } else {
                                            el.value = value;
                                        }
                                    }
                                }
                            }
                        
                            if (message.data.scrollState) {
                                window.scrollTo(message.data.scrollState.x, message.data.scrollState.y);
                            }
                        
                            if (message.data.activeElement) {
                                const ae = message.data.activeElement;
                                let element = null;
                                if (ae.id) {
                                    element = document.getElementById(ae.id);
                                } else if (ae.name) {
                                    element = document.querySelector(`[name="${ae.name}"]`);
                                }
                            
                                if (element) {
                                    if (ae.value !== null && element.value !== undefined) {
                                        element.value = ae.value;
                                    }
                                    if (ae.checked !== null && element.checked !== undefined) {
                                        element.checked = ae.checked;
                                    }
                                    if (element.tagName === 'SELECT' && ae.selectedIndex !== null) {
                                        element.selectedIndex = ae.selectedIndex;
                                    }
                                    setTimeout(function() {
                                        element.focus();
                                        if (element.tagName === 'SELECT' && ae.size !== null && ae.size > 1) {
                                            element.size = Math.min(ae.size, element.options.length);
                                            element.style.position = 'relative';
                                            element.style.zIndex = '9999';
                                        }
                                    }, 10);
                                }
                            }
                        
                            setTimeout(function() {
                                enforceAspectRatio();
                            }, 100);
                        }
                    }
                };
            
                ws.onopen = function() {
                    console.log('Desktop app connected to mirroring server (layout configurator)');
                    sendDesktopSize();
                    var layoutDesktopResizeTimeout;
                    window.addEventListener('resize', function() {
                        clearTimeout(layoutDesktopResizeTimeout);
                        layoutDesktopResizeTimeout = setTimeout(sendDesktopSize, 100);
                    });
                    sendDesktopState();
                
                    let updateScheduled = false;
                    const observer = new MutationObserver(function(mutations) {
                        if (!updateScheduled) {
                            updateScheduled = true;
                            requestAnimationFrame(function() {
                                sendDesktopState();
                                updateScheduled = false;
                            });
                        }
                    });
                
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeOldValue: true
                    });
                
                    let interactionScheduled = false;
                    function scheduleUpdate() {
                        if (!interactionScheduled) {
                            interactionScheduled = true;
                            requestAnimationFrame(function() {
                                sendDesktopState();
                                interactionScheduled = false;
                            });
                        }
                    }
                
                    document.addEventListener('click', scheduleUpdate, true);
                    document.addEventListener('input', scheduleUpdate, true);
                    document.addEventListener('change', scheduleUpdate, true);
                    document.addEventListener('focus', scheduleUpdate, true);
                    document.addEventListener('mousedown', scheduleUpdate, true);
                    document.addEventListener('mouseup', scheduleUpdate, true);
                    document.addEventListener('keydown', scheduleUpdate, true);
                    document.addEventListener('keyup', scheduleUpdate, true);
                };
            
                let lastSentHtml = '';
                let lastSentFormState = '';
                let lastSentScrollState = '';
                let lastSentActiveElement = '';
            
                function sendDesktopState() {
                    // Layout editor should not sync DOM - only main dashboard syncs
                    return;
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        const formState = {};
                        document.querySelectorAll('input, select, textarea').forEach(function(el) {
                            const id = el.id || el.name;
                            if (id) {
                                if (el.type === 'checkbox' || el.type === 'radio') {
                                    formState[id] = el.checked;
                                } else {
                                    formState[id] = el.value;
                                }
                            }
                        });
                    
                        const scrollState = {
                            x: window.scrollX,
                            y: window.scrollY
                        };
                    
                        let activeElementState = null;
                        if (document.activeElement) {
                            const el = document.activeElement;
                            activeElementState = {
                                tag: el.tagName,
                                id: el.id || null,
                                name: el.name || null,
                                type: el.type || null,
                                value: el.value || null,
                                checked: el.checked || null,
                                size: el.tagName === 'SELECT' ? el.size : null,
                                selectedIndex: el.tagName === 'SELECT' ? el.selectedIndex : null
                            };
                        }
                    
                        const currentHtml = document.documentElement.outerHTML;
                        const currentFormState = JSON.stringify(formState);
                        const currentScrollState = JSON.stringify(scrollState);
                        const currentActiveElement = JSON.stringify(activeElementState);
                    
                        if (currentHtml !== lastSentHtml || 
                            currentFormState !== lastSentFormState || 
                            currentScrollState !== lastSentScrollState ||
                            currentActiveElement !== lastSentActiveElement) {
                        
                            lastSentHtml = currentHtml;
                            lastSentFormState = currentFormState;
                            lastSentScrollState = currentScrollState;
                            lastSentActiveElement = currentActiveElement;
                        
                            ws.send(JSON.stringify({
                                type: 'dom',
                                data: {
                                    html: currentHtml,
                                    url: window.location.href,
                                    formState: formState,
                                    scrollState: scrollState,
                                    activeElement: activeElementState
                                }
                            }));
                        }
                    }
                }
            } else {
                // Web browser connects to /ws/browser for two-way mirroring
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/browser`;
                console.log('Browser connecting to WebSocket (layout):', wsUrl);
                ws = new WebSocket(wsUrl);
            
                ws.onerror = function(error) {
                    console.error('Browser WebSocket error (layout):', error);
                };
            
                ws.onclose = function(event) {
                    console.log('Browser WebSocket closed (layout):', event.code, event.reason);
                };
            
                let lastSentHtml = '';
                let lastSentFormState = '';
                let lastSentScrollState = '';
                let lastSentActiveElement = '';
            
                function sendBrowserState() {
                    // Layout editor should not sync DOM - only main dashboard syncs
                    return;
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        const formState = {};
                        document.querySelectorAll('input, select, textarea').forEach(function(el) {
                            const id = el.id || el.name;
                            if (id) {
                                if (el.type === 'checkbox' || el.type === 'radio') {
                                    formState[id] = el.checked;
                                } else {
                                    formState[id] = el.value;
                                }
                            }
                        });
                    
                        const scrollState = {
                            x: window.scrollX,
                            y: window.scrollY
                        };
                    
                        let activeElementState = null;
                        if (document.activeElement) {
                            const el = document.activeElement;
                            activeElementState = {
                                tag: el.tagName,
                                id: el.id || null,
                                name: el.name || null,
                                type: el.type || null,
                                value: el.value || null,
                                checked: el.checked || null,
                                size: el.tagName === 'SELECT' ? el.size : null,
                                selectedIndex: el.tagName === 'SELECT' ? el.selectedIndex : null
                            };
                        }
                    
                        const currentHtml = document.documentElement.outerHTML;
                        const currentFormState = JSON.stringify(formState);
                        const currentScrollState = JSON.stringify(scrollState);
                        const currentActiveElement = JSON.stringify(activeElementState);
                    
                        if (currentHtml !== lastSentHtml || 
                            currentFormState !== lastSentFormState || 
                            currentScrollState !== lastSentScrollState ||
                            currentActiveElement !== lastSentActiveElement) {
                        
                            lastSentHtml = currentHtml;
                            lastSentFormState = currentFormState;
                            lastSentScrollState = currentScrollState;
                            lastSentActiveElement = currentActiveElement;
                        
                            ws.send(JSON.stringify({
                                type: 'dom',
                                data: {
                                    html: currentHtml,
                                    url: window.location.href,
                                    formState: formState,
                                    scrollState: scrollState,
                                    activeElement: activeElementState
                                }
                            }));
                        }
                    }
                }
            
                ws.onmessage = function(event) {
                    const message = JSON.parse(event.data);
                
                    if (message.type === 'config_update') {
                        console.log('Config updated, reloading page...');
                        window.location.reload();
                        return;
                    }
                    if (message.type === 'state') {
                        if (message.data.desktop_width !== undefined && message.data.desktop_height !== undefined) {
                            currentDesktopWidth = message.data.desktop_width || 0;
                            currentDesktopHeight = message.data.desktop_height || 0;
                        } else {
                            currentDesktopWidth = 0;
                            currentDesktopHeight = 0;
                        }
                        enforceAspectRatio();
                        return;
                    }
                    if (message.type === 'dom') {
                        // Layout editor should not receive DOM updates - only main dashboard syncs
                        return;
                        
                        if (message.data && message.data.html) {
                            var incomingUrl = message.data.url || '';
                            var incomingPath = (function() {
                                try {
                                    var p = new URL(incomingUrl, window.location.origin).pathname;
                                    return stripTrailingSlash(p) || '/';
                                } catch (e) {
                                    var a = document.createElement('a');
                                    a.href = incomingUrl;
                                    return stripTrailingSlash(a.pathname) || '/';
                                }
                            })();
                            var ourPath = stripTrailingSlash(window.location.pathname) || '/';
                            if (incomingPath !== ourPath) return;
                        
                            const parser = new DOMParser();
                            const newDoc = parser.parseFromString(message.data.html, 'text/html');
                            document.documentElement.innerHTML = newDoc.documentElement.innerHTML;
                        
                            if (message.data.formState) {
                                for (const [id, value] of Object.entries(message.data.formState)) {
                                    const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
                                    if (el) {
                                        if (el.type === 'checkbox' || el.type === 'radio') {
                                            el.checked = value;
                                        } else {
                                            el.value = value;
                                        }
                                    }
                                }
                            }
                        
                            if (message.data.scrollState) {
                                window.scrollTo(message.data.scrollState.x, message.data.scrollState.y);
                            }
                        
                            if (message.data.activeElement) {
                                const ae = message.data.activeElement;
                                let element = null;
                                if (ae.id) {
                                    element = document.getElementById(ae.id);
                                } else if (ae.name) {
                                    element = document.querySelector(`[name="${ae.name}"]`);
                                }
                            
                                if (element) {
                                    if (ae.value !== null && element.value !== undefined) {
                                        element.value = ae.value;
                                    }
                                    if (ae.checked !== null && element.checked !== undefined) {
                                        element.checked = ae.checked;
                                    }
                                    if (element.tagName === 'SELECT' && ae.selectedIndex !== null) {
                                        element.selectedIndex = ae.selectedIndex;
                                    }
                                    setTimeout(function() {
                                        element.focus();
                                        if (element.tagName === 'SELECT' && ae.size !== null && ae.size > 1) {
                                            element.size = Math.min(ae.size, element.options.length);
                                            element.style.position = 'relative';
                                            element.style.zIndex = '9999';
                                        }
                                    }, 10);
                                }
                            }
                        
                            setTimeout(function() {
                                enforceAspectRatio();
                            }, 100);
                        }
                    }
                };
            
                ws.onopen = function() {
                    console.log('Browser connected to mirroring server (layout configurator)');
                    sendBrowserState();
                
                    let updateScheduled = false;
                    const observer = new MutationObserver(function(mutations) {
                        if (!updateScheduled) {
                            updateScheduled = true;
                            requestAnimationFrame(function() {
                                sendBrowserState();
                                updateScheduled = false;
                            });
                        }
                    });
                
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeOldValue: true
                    });
                
                    let interactionScheduled = false;
                    function scheduleUpdate() {
                        if (!interactionScheduled) {
                            interactionScheduled = true;
                            requestAnimationFrame(function() {
                                sendBrowserState();
                                interactionScheduled = false;
                            });
                        }
                    }
                
                    document.addEventListener('click', scheduleUpdate, true);
                    document.addEventListener('input', scheduleUpdate, true);
                    document.addEventListener('change', scheduleUpdate, true);
                    document.addEventListener('focus', scheduleUpdate, true);
                    document.addEventListener('mousedown', scheduleUpdate, true);
                    document.addEventListener('mouseup', scheduleUpdate, true);
                    document.addEventListener('keydown', scheduleUpdate, true);
                    document.addEventListener('keyup', scheduleUpdate, true);
                };
            }
        
            // Keyboard shortcut: M opens menu
            document.addEventListener('keydown', function(event) {
                const isInputFocused = document.activeElement && (
                    document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.isContentEditable
                );
                if (isInputFocused) return;
            if (event.key === 'm' || event.key === 'M') {
                event.preventDefault();
                event.stopPropagation();
                var menu = document.getElementById('glancerf-menu');
                if (menu) menu.classList.toggle('open');
                return false;
            }
                if (event.key === 'Escape') {
                    var layoutModal = document.getElementById('layout-cell-settings-modal');
                    if (layoutModal && layoutModal.classList.contains('open')) {
                        closeCellSettingsModal();
                        event.preventDefault();
                        return;
                    }
                    var menu = document.getElementById('glancerf-menu');
                    if (menu && menu.classList.contains('open')) {
                        menu.classList.remove('open');
                        event.preventDefault();
                    }
                }
            }, true);

            (function() {
                var overlay = document.getElementById('glancerf-menu-overlay');
                if (overlay) overlay.addEventListener('click', function() {
                    var menu = document.getElementById('glancerf-menu');
                    if (menu) menu.classList.remove('open');
                });
            })();

            if (typeof window.renderConflictBanner === 'function') {
                window.renderConflictBanner('conflict-resolution-container');
            }
})();