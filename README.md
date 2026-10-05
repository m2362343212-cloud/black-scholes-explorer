# Black–Scholes Explorer

An interactive learning tool for pricing European call and put options and understanding how the model connects to present-value discounting.

## Explore

- Enter spot price, strike, time to expiry, risk-free rate, and volatility using number fields or sliders.
- See theoretical call and put premiums per share.
- Vary one input at a time in a sensitivity chart; inspect values with a pointer or arrow keys.
- Follow the strike payment from future value to present value with a live numerical explanation.
- Explore expiry, zero volatility, and negative interest rates.

## Run locally

No build step or dependencies are required. Open `index.html` in your browser, or serve this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Input conventions

| Input | Meaning | Units |
| --- | --- | --- |
| S | Current stock price | Currency per share |
| K | Agreed exercise price | Same currency per share |
| T | Time remaining until expiry | Years; 0.5 means six months |
| r | Risk-free discount rate | Annual continuous percent; enter 5 for 5% |
| σ | Stock-return volatility | Annual percent; enter 20 for 20% |

The discounted strike is `PV(K) = K × exp(−rT)`, using decimal r. With annual effective interest i, `1 + i = exp(r)`, so `FV / (1 + i)^T` gives the same present value.

The model assumes European exercise, no dividends, constant volatility and interest rate, and frictionless trading. It produces model values, not live quotes or forecasts of trading profits. All calculations happen in the browser; entered values are not stored or sent to a server by this application.

## Check pricing

With Node.js installed:

```bash
node --test tests/pricing.test.cjs
```

## Files

- `index.html`: interface and plain-language explanations
- `styles.css`: responsive styling
- `app.js`: input updates and sensitivity-chart interactions
- `pricing.js`: pricing formulas, input validation, and normal CDF approximation
- `tests/pricing.test.cjs`: reproducible pricing checks

Formula reference: [Columbia University — The Black-Scholes Model](https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf).
