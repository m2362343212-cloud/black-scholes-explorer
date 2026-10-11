"""Performance statistics for monthly return series."""
import numpy as np
import pandas as pd


def annual_return(r: pd.Series) -> float:
    r = r.dropna()
    return float((1 + r).prod() ** (12 / len(r)) - 1)


def annual_vol(r: pd.Series) -> float:
    return float(r.dropna().std(ddof=1) * np.sqrt(12))


def sharpe(r: pd.Series, rf: float = 0.02) -> float:
    r = r.dropna()
    excess = r - ((1 + rf) ** (1 / 12) - 1)
    return float(excess.mean() / excess.std(ddof=1) * np.sqrt(12))


def max_drawdown(r: pd.Series) -> float:
    wealth = (1 + r.dropna()).cumprod()
    return float((wealth / wealth.cummax() - 1).min())


def capture(r: pd.Series, bench: pd.Series) -> tuple[float, float]:
    """Upside / downside capture: average return in the benchmark's up (down) months,
    divided by the benchmark's average in those months."""
    df = pd.concat([r, bench], axis=1, keys=["r", "b"], sort=True).dropna()
    up, down = df[df.b > 0], df[df.b < 0]
    return float(up.r.mean() / up.b.mean()), float(down.r.mean() / down.b.mean())


def summary(series: dict[str, pd.Series], bench: pd.Series, rf: float = 0.02) -> pd.DataFrame:
    rows = {}
    for name, r in series.items():
        up, down = capture(r, bench)
        rows[name] = {
            "annual_return": annual_return(r),
            "annual_vol": annual_vol(r),
            "sharpe": sharpe(r, rf),
            "max_drawdown": max_drawdown(r),
            "upside_capture": up,
            "downside_capture": down,
            "worst_month": float(r.min()),
            "best_month": float(r.max()),
        }
    return pd.DataFrame(rows).T
