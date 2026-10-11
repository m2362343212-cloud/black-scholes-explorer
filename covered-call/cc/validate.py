"""Check the simulation against a real covered-call ETF.

We do not have historical option prices, so the calls are priced with
Black–Scholes and an assumed volatility. To test that assumption, compare the
*overlay effect* the model produces (covered call minus buy-and-hold) with the
real one (ZWB minus ZEB: same banks, with and without the calls). Comparing the
gap rather than the raw returns cancels most of what the two ETFs share
(the stocks, dividends, rebalancing).

The unknown settings (how far out of the money, how big the volatility markup)
are fitted on the first part of the history only, then judged on the rest.
"""
from itertools import product

import numpy as np
import pandas as pd

from .strategy import Panel, Params, simulate


def overlay_error(model_gap: pd.Series, real_gap: pd.Series) -> dict:
    df = pd.concat([model_gap, real_gap], axis=1, keys=["model", "real"], sort=True).dropna()
    diff = df.model - df.real
    return {
        "months": len(df),
        "rmse_monthly": float(np.sqrt((diff ** 2).mean())),
        "correlation": float(df.model.corr(df.real)),
        "model_gap_annual": float(df.model.mean() * 12),
        "real_gap_annual": float(df.real.mean() * 12),
    }


def fit_and_test(panel: Panel, real_gap: pd.Series, split: str, base: Params,
                 moneyness_grid=(0.0, 0.01, 0.02, 0.03, 0.05),
                 markup_grid=(-0.06, -0.04, -0.02, 0.0, 0.02, 0.04, 0.06, 0.08)) -> dict:
    """Pick the (moneyness, markup) pair that best matches the real gap before `split`,
    then report how well that choice does after `split`."""
    split_ts = pd.Timestamp(split)
    trials = []
    for m, v in product(moneyness_grid, markup_grid):
        sim = simulate(panel, base.with_(moneyness=m, vol_markup=v))
        gap = sim.cc - sim.bh
        fit = overlay_error(gap[gap.index < split_ts], real_gap)
        trials.append((fit["rmse_monthly"], m, v, gap))
    trials.sort(key=lambda t: t[0])
    _, best_m, best_v, best_gap = trials[0]
    return {
        "moneyness": best_m,
        "vol_markup": best_v,
        "in_sample": overlay_error(best_gap[best_gap.index < split_ts], real_gap),
        "out_of_sample": overlay_error(best_gap[best_gap.index >= split_ts], real_gap),
        "grid": pd.DataFrame([(m, v, e) for e, m, v, _ in trials],
                             columns=["moneyness", "vol_markup", "in_sample_rmse"]),
    }
