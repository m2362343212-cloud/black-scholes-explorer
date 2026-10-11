"""Monthly covered-call simulation on an equal-weight basket of stocks.

Each month-end, for every stock in the basket:
  * hold the stock (its total return includes dividends), and
  * sell a one-month call on `coverage` of the shares, struck `moneyness` above
    today's price, priced with Black–Scholes using trailing realized volatility
    plus a markup (options usually trade above realized volatility).
At the next month-end the call expires: we keep the premium (plus a month of
interest, minus a trading cost) and pay out max(S_T - K, 0) if the stock rose
past the strike.
"""
from dataclasses import dataclass, replace
from math import exp

import numpy as np
import pandas as pd

from .pricing import bs_call

TRADING_DAYS = 252


@dataclass(frozen=True)
class Params:
    coverage: float = 0.5      # share of each holding with a call written on it
    moneyness: float = 0.02    # strike = price * (1 + moneyness)
    vol_markup: float = 0.0    # added to realized vol to approximate implied vol (0.02 = +2 points)
    vol_window: int = 63       # trading days of history used for realized vol (~3 months)
    r: float = 0.03            # risk-free rate, annual, continuous
    option_cost: float = 0.05  # share of premium lost to bid-ask spread
    min_vol: float = 0.08      # floor on the volatility used for pricing

    def with_(self, **kw) -> "Params":
        return replace(self, **kw)


@dataclass
class Panel:
    """Month-end data the simulation needs; one row per month-end, one column per ticker."""
    close: pd.DataFrame        # split-adjusted price (no dividend adjustment): used for strikes and payoffs
    total_return: pd.DataFrame # return from the previous month-end, dividends included
    hist_vol: pd.DataFrame     # annualized realized volatility up to that month-end
    div_yield: pd.DataFrame    # trailing 12-month dividends / price


def month_end_dates(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """Last trading day of each calendar month present in the index."""
    s = pd.Series(index, index=index)
    return pd.DatetimeIndex(s.groupby([index.year, index.month]).max().values)


def build_panel(close: pd.DataFrame, adj_close: pd.DataFrame, dividends: pd.DataFrame,
                vol_window: int = 63) -> Panel:
    """Turn daily prices and dividend payments into month-end inputs.

    close      daily split-adjusted close (yfinance auto_adjust=False 'Close')
    adj_close  daily close adjusted for splits and dividends (total-return series)
    dividends  daily dividend cash amounts per share, 0 on non-payment days
    """
    close = close.sort_index()
    adj_close = adj_close.reindex(close.index).sort_index()
    dividends = dividends.reindex(close.index).fillna(0.0)

    log_ret = np.log(adj_close / adj_close.shift(1))
    hist_vol = log_ret.rolling(vol_window, min_periods=int(vol_window * 0.8)).std() * np.sqrt(TRADING_DAYS)
    trailing_div = dividends.rolling("365D").sum()
    # only trust the trailing dividend sum once a full year of history exists
    has_year = pd.Series(close.index - close.index[0] >= pd.Timedelta(days=365), index=close.index)
    div_yield = (trailing_div / close).where(has_year, axis=0)

    ends = month_end_dates(close.index)
    m_close = close.loc[ends]
    m_adj = adj_close.loc[ends]
    return Panel(close=m_close,
                 total_return=m_adj / m_adj.shift(1) - 1.0,
                 hist_vol=hist_vol.loc[ends],
                 div_yield=div_yield.loc[ends])


def simulate(panel: Panel, p: Params) -> pd.DataFrame:
    """Return a DataFrame indexed by month-end with, for each month:
    bh          equal-weight buy-and-hold total return
    cc          covered-call total return
    premium     premium collected that month, as a share of the basket (after costs)
    called      share of holdings whose stock finished above the strike
    """
    dates = panel.close.index
    rows = []
    for t0, t1 in zip(dates[:-1], dates[1:]):
        T = (t1 - t0).days / 365.0
        bh, cc, prem, called = [], [], [], []
        for tk in panel.close.columns:
            S0, S1 = panel.close.at[t0, tk], panel.close.at[t1, tk]
            tr = panel.total_return.at[t1, tk]
            vol, q = panel.hist_vol.at[t0, tk], panel.div_yield.at[t0, tk]
            if not all(np.isfinite([S0, S1, tr, vol, q])):
                continue  # stock not yet listed / not enough history: leave it out this month
            sigma = max(vol + p.vol_markup, p.min_vol)
            K = S0 * (1.0 + p.moneyness)
            premium = bs_call(S0, K, T, p.r, q, sigma) * (1.0 - p.option_cost)
            payout = max(S1 - K, 0.0)
            overlay = p.coverage * (premium * exp(p.r * T) - payout) / S0
            bh.append(tr)
            cc.append(tr + overlay)
            prem.append(p.coverage * premium / S0)
            called.append(1.0 if S1 > K else 0.0)
        if bh:
            rows.append((t1, np.mean(bh), np.mean(cc), np.mean(prem), np.mean(called), len(bh)))
    out = pd.DataFrame(rows, columns=["date", "bh", "cc", "premium", "called", "n_stocks"]).set_index("date")
    return out
