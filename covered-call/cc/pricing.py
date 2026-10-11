"""Black–Scholes call price with a continuous dividend yield.

Same model as ../pricing.js, extended with a dividend yield q, because bank
stocks pay 4-5% a year and ignoring that would overprice the calls we sell.
"""
from math import erf, exp, log, sqrt


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


def bs_call(S: float, K: float, T: float, r: float, q: float, sigma: float) -> float:
    """Price of a European call. r, q and sigma are decimals (0.05 = 5%), T in years."""
    if S <= 0 or K <= 0:
        raise ValueError("S and K must be positive")
    if T <= 0 or sigma <= 0:
        # no time or no uncertainty: discounted forward payoff
        forward = S * exp((r - q) * max(T, 0.0))
        return exp(-r * max(T, 0.0)) * max(forward - K, 0.0)
    width = sigma * sqrt(T)
    d1 = (log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / width
    d2 = d1 - width
    return S * exp(-q * T) * norm_cdf(d1) - K * exp(-r * T) * norm_cdf(d2)


def bs_put(S: float, K: float, T: float, r: float, q: float, sigma: float) -> float:
    """European put via put–call parity (used only to test the call price)."""
    return bs_call(S, K, T, r, q, sigma) - S * exp(-q * T) + K * exp(-r * T)
