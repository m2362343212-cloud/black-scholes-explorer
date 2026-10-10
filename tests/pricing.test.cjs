const test = require('node:test');
const assert = require('node:assert/strict');
const { price, defaults, normalCDF } = require('../pricing.js');

const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

test('standard European call and put reference values', () => {
  const result = price(defaults);
  near(result.call, 10.450583572185565);
  near(result.put, 5.573526022256971);
  near(result.pvStrike, 95.1229424500714);
});

test('normal distribution reference values', () => {
  near(normalCDF(0), 0.5, 1e-14);
  near(normalCDF(1.96), 0.9750021048517795, 1e-13);
  near(normalCDF(-1.96), 0.024997895148220435, 1e-13);
});

test('expiry gives the intrinsic payoff', () => {
  for (const S of [80, 100, 120]) {
    const result = price({ ...defaults, S, T: 0 });
    near(result.call, Math.max(S - 100, 0));
    near(result.put, Math.max(100 - S, 0));
  }
});

test('zero volatility gives discounted deterministic payoffs', () => {
  for (const r of [-5, 0, 5]) {
    const result = price({ ...defaults, r, sigma: 0 });
    const discountedStrike = 100 * Math.exp(-r / 100);
    near(result.call, Math.max(100 - discountedStrike, 0));
    near(result.put, Math.max(discountedStrike - 100, 0));
  }
});

test('matching options obey parity and price bounds', () => {
  for (const S of [0.01, 50, 100, 200, 1000000]) {
    for (const r of [-20, 0, 50]) {
      const result = price({ ...defaults, S, r });
      near(result.call - result.put, S - result.pvStrike, 1e-8);
      assert.ok(result.call >= 0 && result.call <= S + 1e-8);
      assert.ok(result.put >= 0 && result.put <= result.pvStrike + 1e-8);
    }
  }
});

test('spot, volatility, and rate changes have the expected direction', () => {
  const baseline = price(defaults);
  const higherSpot = price({ ...defaults, S: 110 });
  assert.ok(higherSpot.call > baseline.call && higherSpot.put < baseline.put);
  const higherVol = price({ ...defaults, sigma: 30 });
  assert.ok(higherVol.call > baseline.call && higherVol.put > baseline.put);
  const higherRate = price({ ...defaults, r: 6 });
  assert.ok(higherRate.call > baseline.call && higherRate.put < baseline.put);
});

test('invalid inputs are rejected', () => {
  for (const change of [{ S: 0 }, { K: -1 }, { T: -1 }, { r: NaN }, { sigma: -1 }, { sigma: Infinity }]) {
    assert.throws(() => price({ ...defaults, ...change }));
  }
});

// ---------- pricing models beyond the closed form ----------
const { greeks, binomial, monteCarlo, impliedVolatility } = require('../pricing.js');

test('greeks match finite differences of the price', () => {
  const g = greeks(defaults), h = 1e-4;
  const at = changes => price({ ...defaults, ...changes });
  near(g.call.delta, (at({ S: 100 + h }).call - at({ S: 100 - h }).call) / (2 * h), 1e-6);
  near(g.gamma, (at({ S: 100 + h }).call - 2 * at({}).call + at({ S: 100 - h }).call) / (h * h), 1e-4);
  near(g.vega, (at({ sigma: 20 + h }).call - at({ sigma: 20 - h }).call) / (2 * h), 1e-6);
  near(g.put.delta, g.call.delta - 1, 1e-12);
});

test('binomial tree converges to Black–Scholes for European options', () => {
  const tree = binomial(defaults, 2000), bs = price(defaults);
  near(tree.europeanCall, bs.call, 0.01);
  near(tree.europeanPut, bs.put, 0.01);
});

test('early exercise adds value to an American put but not to a call without dividends', () => {
  const tree = binomial({ ...defaults, S: 80 }, 1000);
  assert.ok(tree.americanPut > tree.europeanPut + 0.1, 'deep in-the-money American put should be worth more');
  near(tree.americanCall, tree.europeanCall, 1e-9);
});

test('Monte Carlo agrees with Black–Scholes within its own error bars', () => {
  const mc = monteCarlo(defaults, 200000, 7), bs = price(defaults);
  assert.ok(Math.abs(mc.call.price - bs.call) < 3 * mc.call.standardError, `call ${mc.call.price} vs ${bs.call}`);
  assert.ok(Math.abs(mc.put.price - bs.put) < 3 * mc.put.standardError, `put ${mc.put.price} vs ${bs.put}`);
  near(monteCarlo(defaults, 1000, 7).call.price, monteCarlo(defaults, 1000, 7).call.price, 0); // same seed, same answer
});

test('implied volatility recovers the volatility used to make the price', () => {
  for (const sigma of [5, 20, 60]) {
    const input = { ...defaults, sigma, K: 110 };
    near(impliedVolatility(input, price(input).call, 'call'), sigma, 1e-8);
    near(impliedVolatility(input, price(input).put, 'put'), sigma, 1e-8);
  }
  assert.throws(() => impliedVolatility(defaults, 120, 'call'), /arbitrage/);
});
