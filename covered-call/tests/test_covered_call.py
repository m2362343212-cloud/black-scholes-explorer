"""Run with:  python -m unittest discover tests"""
import unittest
from math import exp

import numpy as np
import pandas as pd

from cc.pricing import bs_call, bs_put
from cc.stats import capture, max_drawdown
from cc.strategy import Params, build_panel, month_end_dates, simulate
from cc.validate import fit_and_test


def synthetic_market(seed=0, years=6, tickers=("AAA", "BBB"), div_rate=0.04):
    """Daily GBM prices with quarterly dividends, plus the matching total-return series."""
    rng = np.random.default_rng(seed)
    days = pd.bdate_range("2015-01-01", periods=252 * years)
    close, adj, divs = {}, {}, {}
    for tk in tickers:
        z = rng.standard_normal(len(days))
        price = 50 * np.exp(np.cumsum(0.0003 + 0.015 * z))
        pay = np.zeros(len(days))
        pay[63::63] = price[63::63] * div_rate / 4   # quarterly dividend
        tr_daily = (price + pay) / np.r_[price[0], price[:-1]]
        tr_daily[0] = 1.0
        close[tk] = pd.Series(price, index=days)
        divs[tk] = pd.Series(pay, index=days)
        adj[tk] = pd.Series(50 * np.cumprod(tr_daily), index=days)
    return pd.DataFrame(close), pd.DataFrame(adj), pd.DataFrame(divs)


class PricingTest(unittest.TestCase):
    def test_matches_textbook_value(self):
        self.assertAlmostEqual(bs_call(100, 100, 1, 0.05, 0.0, 0.2), 10.4506, places=4)

    def test_put_call_parity_with_dividends(self):
        S, K, T, r, q, v = 100, 95, 0.5, 0.03, 0.045, 0.25
        lhs = bs_call(S, K, T, r, q, v) - bs_put(S, K, T, r, q, v)
        self.assertAlmostEqual(lhs, S * exp(-q * T) - K * exp(-r * T), places=10)

    def test_dividends_make_calls_cheaper(self):
        self.assertLess(bs_call(100, 100, 1, 0.03, 0.05, 0.2), bs_call(100, 100, 1, 0.03, 0.0, 0.2))

    def test_higher_strike_and_lower_vol_are_cheaper(self):
        self.assertLess(bs_call(100, 105, 0.1, 0.03, 0.04, 0.2), bs_call(100, 100, 0.1, 0.03, 0.04, 0.2))
        self.assertLess(bs_call(100, 100, 0.1, 0.03, 0.04, 0.15), bs_call(100, 100, 0.1, 0.03, 0.04, 0.2))


class PanelTest(unittest.TestCase):
    def setUp(self):
        self.close, self.adj, self.divs = synthetic_market()
        self.panel = build_panel(self.close, self.adj, self.divs)

    def test_month_ends_are_last_trading_days(self):
        ends = month_end_dates(self.close.index)
        self.assertEqual(ends[0], pd.Timestamp("2015-01-30"))  # Jan 31 2015 was a Saturday
        self.assertEqual(len(ends), len(set(zip(ends.year, ends.month))))

    def test_total_return_includes_dividends(self):
        price_only = self.panel.close / self.panel.close.shift(1) - 1
        extra = (self.panel.total_return - price_only).stack().mean()
        self.assertGreater(extra, 0.0)

    def test_dividend_yield_close_to_input(self):
        y = self.panel.div_yield.iloc[-1].mean()
        self.assertAlmostEqual(y, 0.04, delta=0.012)


class StrategyTest(unittest.TestCase):
    def setUp(self):
        close, adj, divs = synthetic_market(seed=1)
        self.panel = build_panel(close, adj, divs)

    def test_zero_coverage_equals_buy_and_hold(self):
        sim = simulate(self.panel, Params(coverage=0.0))
        np.testing.assert_allclose(sim.cc.values, sim.bh.values, atol=1e-15)

    def test_overlay_is_premium_when_stock_stays_below_strike(self):
        p = Params(coverage=0.5, moneyness=0.02)
        sim = simulate(self.panel, p)
        quiet = sim[sim.called == 0]
        self.assertGreater(len(quiet), 5)
        # with nothing called away, the only difference is the premium kept (plus interest)
        self.assertTrue(((quiet.cc - quiet.bh) > 0).all())

    def test_full_coverage_caps_the_upside(self):
        p = Params(coverage=1.0, moneyness=0.02)
        sim = simulate(self.panel, p)
        best_bh, best_cc = sim.bh.max(), sim.cc.max()
        self.assertLess(best_cc, best_bh)
        # price gain is capped at the strike; what is left is premium + dividends (a few %)
        self.assertLess(best_cc, 0.02 + 0.06)

    def test_more_coverage_collects_more_premium(self):
        lo = simulate(self.panel, Params(coverage=0.25)).premium.mean()
        hi = simulate(self.panel, Params(coverage=1.0)).premium.mean()
        self.assertAlmostEqual(hi / lo, 4.0, places=6)


class ValidateTest(unittest.TestCase):
    def test_recovers_known_settings(self):
        close, adj, divs = synthetic_market(seed=2)
        panel = build_panel(close, adj, divs)
        truth = Params(coverage=0.5, moneyness=0.02, vol_markup=0.04)
        sim = simulate(panel, truth)
        fit = fit_and_test(panel, sim.cc - sim.bh, "2018-06-01", Params(coverage=0.5))
        self.assertEqual((fit["moneyness"], fit["vol_markup"]), (0.02, 0.04))
        self.assertLess(fit["out_of_sample"]["rmse_monthly"], 1e-12)


class StatsTest(unittest.TestCase):
    def test_drawdown_and_capture(self):
        r = pd.Series([0.10, -0.50, 0.20])
        self.assertAlmostEqual(max_drawdown(r), -0.5)
        up, down = capture(r * 0.5, r)
        self.assertAlmostEqual(up, 0.5)
        self.assertAlmostEqual(down, 0.5)


if __name__ == "__main__":
    unittest.main()
