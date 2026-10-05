(() => {
  'use strict';
  const { price, validate, limits, defaults } = BlackScholes;
  const $ = id => document.getElementById(id);
  const names = { S: 'spot price', K: 'strike price', T: 'time to expiry', r: 'risk-free rate', sigma: 'volatility' };
  const symbols = { S: 'Spot price S', K: 'Strike price K', T: 'Time to expiry T (years)', r: 'Risk-free rate r (%)', sigma: 'Volatility σ (%)' };
  const insights = {
    S: 'A higher stock price makes the right to buy more valuable and the right to sell less valuable. The other four inputs stay fixed.',
    K: 'A higher strike makes buying at that price less attractive, but selling at that price more attractive. The other four inputs stay fixed.',
    T: 'More time creates more room for the stock to move, and changes how much the strike is discounted. Calls generally benefit when rates are nonnegative; European puts can sometimes fall with more time. Time effects depend on the other inputs.',
    r: 'A higher rate lowers the present value of the strike. Paying that strike later helps a call; receiving it later makes a put less valuable. The stock’s expected return is not an input here.',
    sigma: 'More volatility increases the possible upside of both rights, while the holder can walk away from an unfavorable outcome. Both values increase or stay flat; volatility does not tell you which way the stock will move.'
  };
  const money = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (x, digits = 4) => Number(x.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
  const axisValue = (key, x) => key === 'S' || key === 'K' ? money(x) : key === 'T' ? `${num(x, 2)} yr` : `${num(x, 2)}%`;
  let state = { ...defaults }, sweep = 'S', chartData, inspected = null;
  const svg = $('chart'), H = 330, left = 64, right = 21, top = 28, bottom = 63;
  let W = 760, plotW = W - left - right;
  const plotH = H - top - bottom;
  const tick = x => Math.abs(x) >= 1000000 ? `${num(x / 1000000, 1)}m` : Math.abs(x) >= 10000 ? `${num(x / 1000, 1)}k` : num(x, Math.abs(x) < 1 ? 3 : 1);
  function syncControl(key, preserveInput) {
    const input = $(key + '-number'), slider = $(key + '-range'), val = state[key];
    if (input !== preserveInput) input.value = val;
    if (val > Number(slider.max)) slider.max = Math.min(limits[key][1], key === 'r' ? val + 5 : val * 1.5);
    if (val < Number(slider.min)) slider.min = Math.max(limits[key][0], val - 5);
    slider.value = val;
    slider.style.setProperty('--fill', ((val - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100) + '%');
    slider.setAttribute('aria-valuetext', axisValue(key, val));
  }
  function clearError() {
    $('input-error').hidden = true; $('output').dataset.stale = 'false';
    for (const key of Object.keys(limits)) $(key + '-number').setAttribute('aria-invalid', 'false');
  }
  function readInputs() {
    const candidate = {};
    for (const key of Object.keys(limits)) {
      const input = $(key + '-number');
      const val = input.value.trim() === '' ? NaN : Number(input.value), [min, max] = limits[key];
      if (!Number.isFinite(val) || val < min || val > max) {
        input.setAttribute('aria-invalid', 'true');
        $('input-error').textContent = `Enter ${names[key]} between ${min} and ${max}${key === 'r' || key === 'sigma' ? '%' : key === 'T' ? ' years' : ''}. Results show the last valid inputs.`;
        $('input-error').hidden = false; $('output').dataset.stale = 'true'; return;
      }
      candidate[key] = val;
    }
    state = validate(candidate); clearError(); inspected = null; render(document.activeElement);
  }
  function setInputs(input) {
    const next = validate(input); // validate the complete input before changing visible state
    state = next; clearError(); inspected = null; render();
    return { inputs: { ...state }, ...price(state) };
  }
  function render(preserveInput) {
    for (const key of Object.keys(limits)) syncControl(key, preserveInput);
    const p = price(state), { S, K, T, r } = state;
    $('T-days').textContent = T === 0 ? 'Expiry is now' : `About ${num(T * 365, 1)} calendar days (365-day year)`;
    $('call-price').textContent = money(p.call); $('put-price').textContent = money(p.put);
    $('call-description').textContent = `Pay ${money(K)} for a share at expiry, if you choose.`;
    $('put-description').textContent = `Sell a share for ${money(K)} at expiry, if you choose.`;
    $('call-intrinsic').textContent = money(p.intrinsicCall); $('put-intrinsic').textContent = money(p.intrinsicPut);
    $('result-note').textContent = T === 0 ? 'At expiry, only the payoff remains: call = max(S − K, 0); put = max(K − S, 0).' : state.sigma === 0 ? 'With zero volatility, the model has no price uncertainty: it discounts the known expiry payoffs.' : 'Today’s theoretical premiums. “If expiry were now” is the immediate payoff, also called intrinsic value.';
    $('pv-future').textContent = money(K); $('pv-factor').textContent = p.discount.toFixed(6); $('pv-today').textContent = money(p.pvStrike);
    $('pv-substitution').innerHTML = `= ${num(K)} × e<sup>−(${num(r / 100)}) × ${num(T)}</sup> = ${num(p.pvStrike, 2)}`;
    $('pv-explanation').textContent = T === 0 ? 'With no time remaining, the discount factor is 1: the present and future amounts are the same.' : `At ${num(r)}% for ${num(T)} ${T === 1 ? 'year' : 'years'}, ${money(p.pvStrike)} today ${r < 0 ? 'falls' : 'grows'} to ${money(K)} at expiry. ${r < 0 ? 'A negative rate makes the present value larger than the future amount.' : 'This is the amount needed today to fund that future strike payment.'}`;
    $('rate-equivalent').textContent = `${num(r)}% continuous is equivalent to ${num(p.effectiveRate)}% effective annually. Enter 5 for 5%; the calculation uses 0.05.`;
    $('d-values').textContent = p.d1 === null ? (T === 0 ? 'At expiry, use the payoff directly; d₁ and d₂ are not needed.' : 'At zero volatility, use the discounted deterministic payoff; d₁ and d₂ are not defined.') : `With your inputs: d₁ = ${p.d1.toFixed(4)} · d₂ = ${p.d2.toFixed(4)}`;
    $('parity-values').textContent = `${num(p.call, 4)} − ${num(p.put, 4)} = ${num(S, 4)} − ${num(p.pvStrike, 4)} = ${num(S - p.pvStrike, 4)} (rounded)`;
    drawChart();
  }
  function sweepBounds() {
    const value = state[sweep];
    if (sweep === 'S' || sweep === 'K') return [Math.max(0.01, Math.min(state.S, state.K) * 0.5), Math.min(1000000, Math.max(state.S, state.K) * 1.5)];
    if (sweep === 'T') return [0, Math.min(10, Math.max(2, value * 1.8))];
    if (sweep === 'sigma') return [0, Math.min(300, Math.max(60, value * 1.5))];
    return [Math.max(-20, Math.min(-5, value - 5)), Math.min(50, Math.max(15, value + 5))];
  }
  function niceCeiling(x) {
    if (x <= 0) return 1;
    const scale = 10 ** Math.floor(Math.log10(x));
    return Math.ceil(x / scale / 0.5) * scale * 0.5;
  }
  function drawChart() {
    W = Math.max(280, svg.clientWidth || 760); plotW = W - left - right;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const [min, max] = sweepBounds(), points = [];
    for (let i = 0; i <= 160; i++) {
      const x = min + (max - min) * i / 160;
      points.push({ x, ...price({ ...state, [sweep]: x }) });
    }
    const yMax = niceCeiling(Math.max(...points.map(p => Math.max(p.call, p.put))) * 1.08);
    chartData = { min, max, yMax, points };
    const X = x => left + (x - min) / (max - min) * plotW;
    const Y = y => top + (1 - y / yMax) * plotH;
    const curve = kind => points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(2)},${Y(p[kind]).toFixed(2)}`).join(' ');
    let content = `<title id="chart-svg-title">Call and put value versus ${names[sweep]}</title><desc id="chart-svg-description">${insights[sweep]} Use left and right arrow keys to inspect values. The dashed vertical line marks your input.</desc>`;
    for (let i = 0; i <= 4; i++) {
      const y = yMax * i / 4, py = Y(y);
      content += `<line class="grid-line" x1="${left}" x2="${W - right}" y1="${py}" y2="${py}"/><text x="${left - 12}" y="${py + 5}" text-anchor="end">${tick(y)}</text>`;
    }
    for (let i = 0; i <= 4; i++) {
      const x = min + (max - min) * i / 4;
      content += `<text x="${X(x)}" y="${H - bottom + 25}" text-anchor="middle">${tick(x)}</text>`;
    }
    content += `<text class="axis-title" x="${left}" y="15">Option value ($ per share)</text><text class="axis-title" x="${left + plotW / 2}" y="${H - 9}" text-anchor="middle">${symbols[sweep]}</text><path class="curve call-path" d="${curve('call')}"/><path class="curve put-path" d="${curve('put')}"/><line class="current-line" x1="${X(state[sweep])}" x2="${X(state[sweep])}" y1="${top}" y2="${H - bottom}"/><g id="chart-markers"></g>`;
    svg.innerHTML = content;
    $('insight').textContent = insights[sweep];
    showInspection(inspected);
  }
  function showInspection(value) {
    if (!chartData) return;
    const isCurrent = value === null, x = isCurrent ? state[sweep] : Math.max(chartData.min, Math.min(chartData.max, value));
    const p = price({ ...state, [sweep]: x }), px = left + (x - chartData.min) / (chartData.max - chartData.min) * plotW;
    const Y = v => top + (1 - v / chartData.yMax) * plotH;
    $('chart-at').textContent = `${isCurrent ? 'Your' : 'Preview'} ${names[sweep]}: ${axisValue(sweep, x)}`;
    $('chart-call').textContent = `Call ${money(p.call)}`; $('chart-put').textContent = `Put ${money(p.put)}`;
    $('chart-markers').innerHTML = `${isCurrent ? '' : `<line class="inspect-line" x1="${px}" x2="${px}" y1="${top}" y2="${H - bottom}"/>`}<circle cx="${px}" cy="${Y(p.call)}" r="5" fill="#007e60" stroke="white" stroke-width="2"/><circle cx="${px}" cy="${Y(p.put)}" r="5" fill="#b74e28" stroke="white" stroke-width="2"/>`;
  }
  for (const key of Object.keys(limits)) {
    $(key + '-number').addEventListener('input', readInputs);
    $(key + '-range').addEventListener('input', e => { $(key + '-number').value = e.target.value; readInputs(); });
  }
  document.querySelectorAll('[data-sweep]').forEach(button => button.addEventListener('click', () => {
    sweep = button.dataset.sweep; inspected = null;
    document.querySelectorAll('[data-sweep]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    drawChart();
  }));
  svg.addEventListener('pointermove', event => {
    const rect = svg.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * W;
    inspected = chartData.min + Math.max(0, Math.min(1, (x - left) / plotW)) * (chartData.max - chartData.min);
    showInspection(inspected);
  });
  svg.addEventListener('pointerleave', () => { inspected = null; showInspection(null); });
  svg.addEventListener('blur', () => { inspected = null; showInspection(null); });
  svg.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') inspected = null;
    else if (event.key === 'Home') inspected = chartData.min;
    else if (event.key === 'End') inspected = chartData.max;
    else inspected = Math.max(chartData.min, Math.min(chartData.max, (inspected ?? state[sweep]) + (event.key === 'ArrowRight' ? 1 : -1) * (chartData.max - chartData.min) / 100));
    showInspection(inspected);
  });
  $('reset').addEventListener('click', () => {
    for (const [key, bounds] of Object.entries({ S: [0.01, 200], K: [0.01, 200], T: [0, 5], r: [-5, 15], sigma: [0, 100] })) { $(key + '-range').min = bounds[0]; $(key + '-range').max = bounds[1]; }
    setInputs({ ...defaults });
  });
  render();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawChart()).observe(svg);
})();
