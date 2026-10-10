(function (root) {
  'use strict';
  const limits = { S: [0.01, 1000000], K: [0.01, 1000000], T: [0, 10], r: [-20, 50], sigma: [0, 300] };
  const defaults = Object.freeze({ S: 100, K: 100, T: 1, r: 5, sigma: 20 });
  function validate(input) {
    if (!input || typeof input !== 'object') throw new Error('Enter all five inputs.');
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max)
        throw new Error(`${key} must be between ${min} and ${max}.`);
    }
    return { S: input.S, K: input.K, T: input.T, r: input.r, sigma: input.sigma };
  }
  // Hart rational approximation; compute the tail directly to avoid cancellation.
  function normalCDF(x) {
    if (x === Infinity) return 1;
    if (x === -Infinity) return 0;
    const z = Math.abs(x);
    let tail;
    if (z > 37) tail = 0;
    else if (z < 7.07106781186547) {
      const a = ((((((0.0352624965998911 * z + 0.700383064443688) * z + 6.37396220353165) * z + 33.912866078383) * z + 112.079291497871) * z + 221.213596169931) * z + 220.206867912376);
      const b = (((((((0.0883883476483184 * z + 1.75566716318264) * z + 16.064177579207) * z + 86.7807322029461) * z + 296.564248779674) * z + 637.333633378831) * z + 793.826512519948) * z + 440.413735824752);
      tail = Math.exp(-z * z / 2) * a / b;
    } else tail = Math.exp(-z * z / 2) / (z + 1 / (z + 2 / (z + 3 / (z + 4 / (z + 0.65))))) / Math.sqrt(2 * Math.PI);
    return x > 0 ? 1 - tail : tail;
  }
  function price(input) {
    const { S, K, T, r: rate, sigma: vol } = validate(input);
    const r = rate / 100, sigma = vol / 100;
    const discount = Math.exp(-r * T), pvStrike = K * discount;
    let call, put, d1 = null, d2 = null;
    if (T === 0) {
      call = Math.max(S - K, 0); put = Math.max(K - S, 0);
    } else if (sigma === 0) {
      call = Math.max(S - pvStrike, 0); put = Math.max(pvStrike - S, 0);
    } else {
      const width = sigma * Math.sqrt(T);
      d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / width;
      d2 = d1 - width;
      // Calculate the forward out-of-the-money side first, then use parity.
      if (S >= pvStrike) {
        put = Math.max(0, pvStrike * normalCDF(-d2) - S * normalCDF(-d1));
        call = put + S - pvStrike;
      } else {
        call = Math.max(0, S * normalCDF(d1) - pvStrike * normalCDF(d2));
        put = call + pvStrike - S;
      }
    }
    return { call, put, pvStrike, discount, d1, d2, intrinsicCall: Math.max(S - K, 0), intrinsicPut: Math.max(K - S, 0), effectiveRate: Math.expm1(r) * 100 };
  }

  // ---------- Greeks: how the price responds to each input (analytic Black–Scholes) ----------
  function greeks(input) {
    const { S, K, T, r: rate, sigma: vol } = validate(input);
    const r = rate / 100, sigma = vol / 100;
    if (T === 0 || sigma === 0) return null; // derivatives are not defined at expiry or with no uncertainty
    const sqrtT = Math.sqrt(T), width = sigma * sqrtT, pvStrike = K * Math.exp(-r * T);
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / width, d2 = d1 - width;
    const pdf = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    const decay = -S * pdf * sigma / (2 * sqrtT);
    return {
      call: { delta: normalCDF(d1), theta: (decay - r * pvStrike * normalCDF(d2)) / 365, rho: K * T * Math.exp(-r * T) * normalCDF(d2) / 100 },
      put: { delta: normalCDF(d1) - 1, theta: (decay + r * pvStrike * normalCDF(-d2)) / 365, rho: -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100 },
      gamma: pdf / (S * width),          // change in delta per $1 move in S (same for call and put)
      vega: S * pdf * sqrtT / 100        // price change per 1 percentage point of volatility
    };
  }

  // ---------- Binomial tree (Cox–Ross–Rubinstein): converges to Black–Scholes, and can price American options ----------
  function binomial(input, steps = 500) {
    const { S, K, T, r: rate, sigma: vol } = validate(input);
    const r = rate / 100, sigma = vol / 100;
    if (T === 0 || sigma === 0) {
      const p = price(input);
      return { europeanCall: p.call, europeanPut: p.put, americanCall: Math.max(p.call, S - K, 0), americanPut: Math.max(p.put, K - S, 0) };
    }
    const dt = T / steps, u = Math.exp(sigma * Math.sqrt(dt)), d = 1 / u, growth = Math.exp(r * dt);
    const q = (growth - d) / (u - d); // risk-neutral probability of an up move
    if (!(q > 0 && q < 1)) throw new Error('Too few tree steps for these inputs; increase steps.');
    const disc = 1 / growth;
    const run = (payoff, american) => {
      const v = new Float64Array(steps + 1);
      for (let j = 0; j <= steps; j++) v[j] = payoff(S * Math.pow(u, j) * Math.pow(d, steps - j));
      for (let n = steps - 1; n >= 0; n--) {
        for (let j = 0; j <= n; j++) {
          const cont = disc * (q * v[j + 1] + (1 - q) * v[j]);
          v[j] = american ? Math.max(cont, payoff(S * Math.pow(u, j) * Math.pow(d, n - j))) : cont;
        }
      }
      return v[0];
    };
    const call = x => Math.max(x - K, 0), put = x => Math.max(K - x, 0);
    return { europeanCall: run(call, false), europeanPut: run(put, false), americanCall: run(call, true), americanPut: run(put, true) };
  }

  // ---------- Monte Carlo: simulate many possible stock prices at expiry and average the payoffs ----------
  function seededRandom(seed) { // mulberry32: reproducible results for the same seed
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function monteCarlo(input, paths = 100000, seed = 42) {
    const { S, K, T, r: rate, sigma: vol } = validate(input);
    const r = rate / 100, sigma = vol / 100, disc = Math.exp(-r * T);
    const rand = seededRandom(seed), drift = (r - sigma * sigma / 2) * T, width = sigma * Math.sqrt(T);
    const pairs = Math.ceil(paths / 2);
    let sumC = 0, sumC2 = 0, sumP = 0, sumP2 = 0;
    for (let i = 0; i < pairs; i++) {
      const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()); // Box–Muller
      // antithetic pair: use z and -z together, which cancels much of the sampling noise
      const up = S * Math.exp(drift + width * z), down = S * Math.exp(drift - width * z);
      const c = (Math.max(up - K, 0) + Math.max(down - K, 0)) / 2, p = (Math.max(K - up, 0) + Math.max(K - down, 0)) / 2;
      sumC += c; sumC2 += c * c; sumP += p; sumP2 += p * p;
    }
    const stat = (sum, sum2) => {
      const mean = sum / pairs, variance = Math.max(sum2 / pairs - mean * mean, 0) * pairs / Math.max(pairs - 1, 1);
      return { price: disc * mean, standardError: disc * Math.sqrt(variance / pairs) };
    };
    return { call: stat(sumC, sumC2), put: stat(sumP, sumP2), paths: pairs * 2 };
  }

  // ---------- Implied volatility: the volatility at which Black–Scholes matches a market price ----------
  function impliedVolatility(input, marketPrice, type = 'call') {
    const base = validate(input);
    if (base.T === 0) throw new Error('Implied volatility needs time to expiry above 0.');
    const pvStrike = base.K * Math.exp(-base.r / 100 * base.T);
    const lower = type === 'call' ? Math.max(base.S - pvStrike, 0) : Math.max(pvStrike - base.S, 0);
    const upper = type === 'call' ? base.S : pvStrike;
    if (!(marketPrice > lower && marketPrice < upper)) {
      throw new Error(`A ${type} price must be between ${lower.toFixed(2)} and ${upper.toFixed(2)} to have an implied volatility; outside that range it would allow arbitrage.`);
    }
    // price rises with volatility, so bisection always finds the unique answer
    let lo = 1e-6, hi = 300;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, value = price({ ...base, sigma: mid })[type];
      if (value > marketPrice) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2; // annual percent
  }

  const api = { price, validate, normalCDF, limits, defaults, greeks, binomial, monteCarlo, impliedVolatility };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlackScholes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
