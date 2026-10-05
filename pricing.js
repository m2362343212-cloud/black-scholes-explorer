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
  const api = { price, validate, normalCDF, limits, defaults };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlackScholes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
