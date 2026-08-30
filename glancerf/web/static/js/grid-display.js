/* GlanceRF grid display - shared between the main dashboard and the readonly view.
   Anything here is purely about how the grid renders/rotates; it must not depend on or
   assume a particular WebSocket connection, since main.js (desktop/browser sync) and
   readonly.js (locked-down, no editing) each manage their own connection differently. */

(function () {
  'use strict';

  /**
   * When the visible slot in a stacked cell changes, module UIs (maps, scaled text, etc.)
   * often need a fresh layout: ResizeObserver may not fire if the cell size did not change,
   * and Leaflet needs invalidateSize() when a map was in an opacity-0 layer.
   *
   * The newly-active slot fires immediately (covers the instant "none" case, and gives
   * modules a first chance to react before any transition even starts), then again once
   * the slot's own CSS transition actually finishes (transitionend) rather than guessing
   * a timeout - see main.css for the real durations (currently 0.4-0.45s depending on
   * data-rotate-animation). A short fallback timeout covers browsers/cases where
   * transitionend doesn't fire (e.g. no matching transition-property, or "none").
   */
  function notifyStackSlotChange(stack, activeSlotEl) {
    try {
      window.dispatchEvent(new CustomEvent('glancerf_stack_slot_change', { detail: { stack: stack } }));
    } catch (e) {}
    window.dispatchEvent(new Event('resize'));

    var animation = stack.getAttribute('data-rotate-animation');
    if (!animation || animation === 'none' || !activeSlotEl) return;

    var fired = false;
    function fireOnce() {
      if (fired) return;
      fired = true;
      activeSlotEl.removeEventListener('transitionend', onTransitionEnd);
      window.dispatchEvent(new Event('resize'));
    }
    // transitionend bubbles - ignore a descendant's own transition (e.g. a button hover
    // effect) finishing first; only react to the slot element's own transition.
    function onTransitionEnd(ev) {
      if (ev.target === activeSlotEl) fireOnce();
    }
    activeSlotEl.addEventListener('transitionend', onTransitionEnd);
    setTimeout(fireOnce, 600); // safety net if transitionend never fires
  }

  function initCellStackRotators() {
    document.querySelectorAll('.grid-cell-stack').forEach(function (stack) {
      var sec = parseFloat(stack.getAttribute('data-rotate-seconds'));
      if (isNaN(sec) || sec < 5) sec = 30;
      var slots = stack.querySelectorAll('.glancerf-cell-slot');
      if (slots.length <= 1) return;
      var idx = 0;
      var intervalId = setInterval(function () {
        idx = (idx + 1) % slots.length;
        for (var i = 0; i < slots.length; i++) {
          slots[i].classList.toggle('glancerf-cell-slot-active', i === idx);
        }
        notifyStackSlotChange(stack, slots[idx]);
      }, sec * 1000);
      stack._glancerfRotatorIntervalId = intervalId;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('aspect-container');
    var grid = container && container.querySelector('.grid-layout');
    if (grid) grid.style.minHeight = '100%';
    initCellStackRotators();
  });

  /**
   * Shared guard every module's periodic refresh calls instead of hand-rolling its own
   * visibility check, so "pause background updates while hidden in a rotating cell" is
   * implemented once instead of per module.
   *
   * el: any element inside the module's cell/slot (used to find its stacked-slot ancestor,
   *     if any - a cell that is never stacked always returns true here).
   * settings: that module instance's current settings object (must include
   *           `background_updates`; the universal schema field the routes add defaults it
   *           to true, so an unconfigured/legacy instance keeps updating as before).
   *
   * Modules should also re-run their own refresh entrypoint on 'glancerf_stack_slot_change'
   * (most already re-check per-cell staleness on every call, so this is a cheap no-op for
   * cells that don't need it) so a slot that was skipped while hidden catches up immediately
   * on becoming visible instead of waiting for the next normal poll tick.
   */
  window.glancerfBackgroundUpdatesAllowed = function (el, settings) {
    var s = settings || {};
    if (!(s.background_updates === '0' || s.background_updates === false)) return true;
    var slot = el && el.closest ? el.closest('.glancerf-cell-slot') : null;
    return !(slot && !slot.classList.contains('glancerf-cell-slot-active'));
  };
})();
