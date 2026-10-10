# Black–Scholes Explorer

An interactive tool for pricing options three ways — the Black–Scholes formula, a binomial tree and Monte Carlo simulation — plus Greeks, American-put early exercise and implied volatility.

## Explore

- Enter spot price, strike, time to expiry, risk-free rate, and volatility using number fields or sliders.
- See theoretical call and put premiums per share.
- Vary one input at a time in a sensitivity chart; inspect values with a pointer or arrow keys.
- Follow the strike payment from future value to present value with a live numerical explanation.
- Explore expiry, zero volatility, and negative interest rates.

## Price modelling

| Method | What it does | Check in the tests |
| --- | --- | --- |
| Black–Scholes formula | Exact closed-form price for European options | Put–call parity |
| Binomial tree (CRR, 500 steps) | Steps the stock up or down through time and works backward from the payoff | Within $0.01 of Black–Scholes at 2,000 steps |
| American option (tree) | Same tree, but checks at every node whether exercising now beats waiting | American put > European put when deep in the money; American call = European call |
| Monte Carlo (100,000 paths) | Simulates prices at expiry, averages the discounted payoffs, reports a 95% range | Within 3 standard errors of Black–Scholes; same seed gives the same answer |
| Greeks | Delta, gamma, vega, theta, rho from the formula | Match finite-difference estimates |
| Implied volatility | Solves for the volatility that reproduces a market price (bisection) | Recovers 5%, 20% and 60%; rejects prices that would allow arbitrage |

At the default inputs (S = K = 100, T = 1, r = 5%, σ = 20%) the European put is $5.57 and the American put is $6.09: the right to exercise early is worth about $0.52.

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
- `app.js`: input updates, sensitivity chart, model comparison, Greeks and implied-volatility panels
- `pricing.js`: Black–Scholes, Greeks, binomial tree, Monte Carlo, implied volatility, input validation, and normal CDF approximation
- `tests/pricing.test.cjs`: reproducible pricing checks

Formula reference: [Columbia University — The Black-Scholes Model](https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf).
