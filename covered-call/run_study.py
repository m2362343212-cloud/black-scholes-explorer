"""Run the covered-call study on the downloaded data.

    python run_study.py [--split 2019-01-01] [--rf 0.02]

Reads data/*.csv (from fetch_data.py) and writes tables, charts and a short
summary to results/.
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from cc.stats import summary
from cc.strategy import Params, build_panel, month_end_dates, simulate
from cc.validate import fit_and_test

BANKS = ["RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO", "NA.TO"]
HERE = Path(__file__).parent


def load(name: str) -> pd.DataFrame:
    return pd.read_csv(HERE / "data" / name, index_col=0, parse_dates=True).sort_index()


def etf_monthly(adj: pd.Series) -> pd.Series:
    adj = adj.dropna()
    m = adj.loc[month_end_dates(adj.index)]
    return (m / m.shift(1) - 1).dropna()


def trailing_yield(close: pd.Series, divs: pd.Series) -> float:
    """Last 12 months of distributions / latest price."""
    last = close.dropna().index[-1]
    paid = divs.loc[last - pd.Timedelta(days=365):last].sum()
    return float(paid / close.loc[last])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="2019-01-01", help="fit settings before this date, test after")
    ap.add_argument("--rf", type=float, default=0.02, help="risk-free rate for Sharpe ratios")
    ap.add_argument("--fee-gap", type=float, default=0.0044,
                    help="ZWB's yearly expense ratio minus ZEB's (0.72%% - 0.28%%); added back so the "
                         "real gap measures the options only")
    args = ap.parse_args()
    out = HERE / "results"
    out.mkdir(exist_ok=True)

    close, adj, divs = load("close.csv"), load("adj_close.csv"), load("dividends.csv")
    panel = build_panel(close[BANKS], adj[BANKS], divs[BANKS])
    zeb, zwb = etf_monthly(adj["ZEB.TO"]), etf_monthly(adj["ZWB.TO"])
    start = max(zeb.index[0], zwb.index[0])
    zeb, zwb = zeb[zeb.index >= start], zwb[zwb.index >= start]
    # ZWB charges more than ZEB; add that back so the real gap reflects only the option overlay
    real_gap = zwb - zeb + args.fee_gap / 12

    # 1. Fit the two unknowns on the early years, test on the later years
    base = Params(coverage=0.5)
    fit = fit_and_test(panel, real_gap, args.split, base)
    fit["grid"].to_csv(out / "calibration_grid.csv", index=False)
    params = base.with_(moneyness=fit["moneyness"], vol_markup=fit["vol_markup"])

    # 2. Replica vs the real ETFs, same months
    sim = simulate(panel, params)
    sim = sim[sim.index >= start]
    series = {"Banks buy-and-hold (model)": sim.bh, "Covered call 50% (model)": sim.cc,
              "ZEB (real)": zeb, "ZWB (real)": zwb}
    table = summary(series, bench=sim.bh, rf=args.rf)
    table.to_csv(out / "summary_vs_etfs.csv")

    # 3. Design choices: how much to cover, how far out of the money
    design = []
    for cov in (0.25, 0.5, 0.75, 1.0):
        for m in (0.0, 0.02, 0.05, 0.10):
            s = simulate(panel, params.with_(coverage=cov, moneyness=m))
            s = s[s.index >= start]
            row = summary({"x": s.cc}, bench=s.bh, rf=args.rf).iloc[0].to_dict()
            row.update(coverage=cov, moneyness=m, premium_yield=float(s.premium.mean() * 12),
                       called_share=float(s.called.mean()))
            design.append(row)
    design = pd.DataFrame(design)
    design.to_csv(out / "design_grid.csv", index=False)

    # 3b. Does the conclusion depend on the volatility assumption?
    sens = []
    for v in (-0.04, -0.02, 0.0, 0.02, 0.04, 0.06):
        s = simulate(panel, params.with_(vol_markup=v))
        s = s[s.index >= start]
        row = summary({"x": s.cc}, bench=s.bh, rf=args.rf).iloc[0].to_dict()
        row.update(vol_markup=v, premium_yield=float(s.premium.mean() * 12),
                   buy_hold_return=summary({"b": s.bh}, bench=s.bh, rf=args.rf).iloc[0]["annual_return"],
                   buy_hold_sharpe=summary({"b": s.bh}, bench=s.bh, rf=args.rf).iloc[0]["sharpe"])
        sens.append(row)
    sens = pd.DataFrame(sens)
    sens.to_csv(out / "vol_markup_sensitivity.csv", index=False)

    # 4. Year by year
    yearly = pd.DataFrame({k: (1 + v).groupby(v.index.year).prod() - 1 for k, v in series.items()})
    yearly.to_csv(out / "calendar_years.csv")

    # 5. Charts
    fig, ax = plt.subplots(figsize=(9, 5))
    for k, v in series.items():
        ax.plot((1 + v).cumprod(), label=k, linestyle="--" if "model" in k else "-")
    ax.set_title("Growth of $1, dividends reinvested")
    ax.set_ylabel("$")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out / "growth.png", dpi=150)
    plt.close(fig)

    gap_model = (sim.cc - sim.bh)
    fig, ax = plt.subplots(figsize=(9, 4))
    ax.plot(gap_model.rolling(12).sum(), label="Model: covered call minus buy-and-hold")
    ax.plot(real_gap.rolling(12).sum(), label="Real: ZWB minus ZEB")
    ax.axvline(pd.Timestamp(args.split), color="grey", linestyle=":", label="fit | test split")
    ax.axhline(0, color="black", linewidth=0.6)
    ax.set_title("What the options cost or added over the past 12 months")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out / "overlay_gap.png", dpi=150)
    plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, col, title in [(axes[0], "annual_return", "Annual return"), (axes[1], "upside_capture", "Upside captured")]:
        grid = design.pivot(index="coverage", columns="moneyness", values=col)
        im = ax.imshow(grid.values, cmap="viridis", aspect="auto")
        ax.set_xticks(range(len(grid.columns)), [f"{c:.0%}" for c in grid.columns])
        ax.set_yticks(range(len(grid.index)), [f"{c:.0%}" for c in grid.index])
        ax.set_xlabel("Strike above price")
        ax.set_ylabel("Share of holdings covered")
        ax.set_title(title)
        for i in range(grid.shape[0]):
            for j in range(grid.shape[1]):
                ax.text(j, i, f"{grid.values[i, j]:.0%}", ha="center", va="center", color="white", fontsize=8)
        fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(out / "design_grid.png", dpi=150)
    plt.close(fig)

    # 6. Key numbers in one place
    key = {
        "period": f"{start.date()} to {sim.index[-1].date()} ({len(sim)} months)",
        "fitted_moneyness": fit["moneyness"],
        "fitted_vol_markup": fit["vol_markup"],
        "fit_in_sample": fit["in_sample"],
        "fit_out_of_sample": fit["out_of_sample"],
        "zwb_trailing_distribution_yield": trailing_yield(close["ZWB.TO"], divs["ZWB.TO"]),
        "zeb_trailing_distribution_yield": trailing_yield(close["ZEB.TO"], divs["ZEB.TO"]),
        "model_premium_yield_50pct": float(sim.premium.mean() * 12),
    }
    (out / "key_numbers.json").write_text(json.dumps(key, indent=2, default=float))

    pd.set_option("display.width", 140)
    print(json.dumps(key, indent=2, default=float))
    print("\nSummary vs ETFs\n", table.round(3))
    print("\nCalendar years\n", yearly.round(3))
    print("\nVolatility-markup sensitivity (50% coverage, fitted strike)\n",
          sens[["vol_markup", "premium_yield", "annual_return", "sharpe", "buy_hold_return", "buy_hold_sharpe"]].round(3))
    print("\nDesign grid\n", design[["coverage", "moneyness", "annual_return", "annual_vol", "sharpe",
                                     "max_drawdown", "upside_capture", "downside_capture",
                                     "premium_yield"]].round(3))


if __name__ == "__main__":
    main()
