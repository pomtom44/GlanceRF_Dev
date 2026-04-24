(function() {
    function updateOnTheAirCells() {
        var visible = !!window.GLANCERF_ON_THE_AIR;
        document.querySelectorAll('.grid-cell-on_air_indicator').forEach(function(cell) {
            var onEl = cell.querySelector('.on_air_indicator_on');
            var offEl = cell.querySelector('.on_air_indicator_off');
            if (onEl) onEl.style.display = visible ? '' : 'none';
            if (offEl) offEl.style.display = visible ? 'none' : '';
        });
    }
    if (window.GLANCERF_ON_THE_AIR === undefined) window.GLANCERF_ON_THE_AIR = false;
    window.addEventListener('glancerf_gpio_input', function(e) {
        var d = e.detail || {};
        if ((d.module_id === 'callsign' || d.module_id === 'on_air_indicator') && d.function_id === 'on_air_indicator') {
            window.GLANCERF_ON_THE_AIR = !!d.value;
            updateOnTheAirCells();
            var callsignEls = document.querySelectorAll('.grid-cell-callsign .callsign_on_air_indicator');
            if (callsignEls.length) {
                callsignEls.forEach(function(el) {
                    el.style.display = window.GLANCERF_ON_THE_AIR ? '' : 'none';
                });
            }
            window.dispatchEvent(new CustomEvent('glancerf_on_the_air', { detail: { value: window.GLANCERF_ON_THE_AIR } }));
        }
    });
    window.addEventListener('glancerf_on_the_air', function(e) {
        window.GLANCERF_ON_THE_AIR = e.detail != null ? !!e.detail.value : !window.GLANCERF_ON_THE_AIR;
        updateOnTheAirCells();
        var callsignEls = document.querySelectorAll('.grid-cell-callsign .callsign_on_air_indicator');
        if (callsignEls.length) {
            callsignEls.forEach(function(el) {
                el.style.display = window.GLANCERF_ON_THE_AIR ? '' : 'none';
            });
        }
    });
    updateOnTheAirCells();
})();
