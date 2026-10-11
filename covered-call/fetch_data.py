"""Download daily prices and dividends for the Big 6 Canadian banks and two BMO ETFs.

    pip install yfinance pandas
    python fetch_data.py

Writes data/close.csv, data/adj_close.csv and data/dividends.csv.
"""
from pathlib import Path

import pandas as pd
import yfinance as yf

BANKS = ["RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO", "NA.TO"]
ETFS = ["ZEB.TO",  # BMO Equal Weight Banks ETF: the six banks, no options
        "ZWB.TO"]  # BMO Covered Call Canadian Banks ETF: the same banks, with calls written
START = "2009-01-01"


def main() -> None:
    out = Path(__file__).parent / "data"
    out.mkdir(exist_ok=True)
    close, adj, divs = {}, {}, {}
    for tk in BANKS + ETFS:
        h = yf.Ticker(tk).history(start=START, auto_adjust=False, actions=True)
        if h.empty:
            raise SystemExit(f"No data returned for {tk}; check the ticker or your connection.")
        h.index = pd.DatetimeIndex(h.index).tz_localize(None).normalize()
        close[tk], adj[tk], divs[tk] = h["Close"], h["Adj Close"], h["Dividends"]
        print(f"{tk}: {h.index[0].date()} to {h.index[-1].date()}, {len(h)} days")
    pd.DataFrame(close).to_csv(out / "close.csv")
    pd.DataFrame(adj).to_csv(out / "adj_close.csv")
    pd.DataFrame(divs).fillna(0.0).to_csv(out / "dividends.csv")
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
