"""
modules/energy_analytics.py
=============================
Pure-Python analytics engine for smart home energy data.

Computes:
- Monthly cost and bill projections
- Appliance-level cost breakdown
- Carbon footprint (kg CO₂ equivalent)
- Energy efficiency score (0–100)
- Peak / off-peak usage split and savings potential
- 12-month trend summary
- Comparison vs US national average
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

import pytz

# US average annual household consumption = ~10,500 kWh → ~875/month
US_AVG_MONTHLY_KWH = 875.0


def load_energy_data(path: str = "data/energy_data.json") -> dict:
    """Load the energy dataset from disk."""
    abs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), path)
    with open(abs_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ──────────────────────────────────────────────────────────────
#  Core Calculations
# ──────────────────────────────────────────────────────────────

def calculate_monthly_cost(kwh: float, rate: float) -> float:
    """Return cost in USD for the given kWh and $/kWh rate."""
    return round(kwh * rate, 2)


def calculate_carbon(kwh: float, factor: float) -> float:
    """Return CO₂ equivalent in kg for the given kWh and kg-CO₂/kWh factor."""
    return round(kwh * factor, 2)


def efficiency_score(monthly_kwh: float,
                     home_size_sqft: int = 2000,
                     household_size: int = 4) -> int:
    """
    Compute an efficiency score from 0–100 by normalising consumption
    against a benchmark adjusted for home size and occupants.

    Formula:
        benchmark_kwh = base_per_person × occupants + size_factor × sqft
        score = 100 – clamp(((actual – benchmark) / benchmark) × 100, 0, 100)
    """
    base_per_person = 120    # kWh / person / month (appliances + lighting)
    size_factor     = 0.06   # kWh / sqft / month (HVAC & base load)

    benchmark = (base_per_person * household_size) + (size_factor * home_size_sqft)
    delta_pct  = ((monthly_kwh - benchmark) / benchmark) * 100
    raw_score  = 100 - max(0, min(100, delta_pct))
    return int(round(raw_score))


def score_label(score: int) -> str:
    """Map a numeric efficiency score to an A–F letter grade."""
    if score >= 90: return "A+"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 60: return "C"
    if score >= 50: return "D"
    return "F"


# ──────────────────────────────────────────────────────────────
#  Appliance Analytics
# ──────────────────────────────────────────────────────────────

def appliance_analytics(appliances: list[dict],
                        rate: float,
                        carbon_factor: float) -> list[dict]:
    """
    Enrich each appliance record with cost, carbon, and share metrics.

    Returns a list sorted descending by monthly_kwh.
    """
    total_kwh = sum(a.get("monthly_kwh", 0) for a in appliances)

    enriched = []
    for appl in appliances:
        kwh = appl.get("monthly_kwh", 0)
        cost = calculate_monthly_cost(kwh, rate)
        carbon = calculate_carbon(kwh, carbon_factor)
        pct = (kwh / total_kwh * 100) if total_kwh > 0 else 0

        enriched.append({
            **appl,
            "monthly_cost":   cost,
            "carbon_kg":      carbon,
            "pct_of_total":   round(pct, 1),
            "daily_kwh":      round(kwh / 30, 2),
            "daily_cost":     round(cost / 30, 2),
            "efficiency_label": _appliance_grade(appl.get("efficiency_rating", "B")),
        })

    return sorted(enriched, key=lambda x: x["monthly_kwh"], reverse=True)


def _appliance_grade(rating: str) -> dict:
    """Return label + badge colour for an appliance efficiency rating."""
    grades = {
        "A+": {"label": "A+",      "colour": "#16a34a"},
        "A":  {"label": "A",       "colour": "#22c55e"},
        "B":  {"label": "B",       "colour": "#84cc16"},
        "C":  {"label": "C",       "colour": "#eab308"},
        "D":  {"label": "D",       "colour": "#f97316"},
        "F":  {"label": "F",       "colour": "#ef4444"},
    }
    return grades.get(rating.upper(), grades["B"])


# ──────────────────────────────────────────────────────────────
#  Hourly / Peak Usage
# ──────────────────────────────────────────────────────────────

def peak_analysis(hourly_data: dict, peak_config: dict, rate: float) -> dict:
    """
    Split hourly usage into on-peak, off-peak, and super-off-peak buckets
    and calculate cost savings potential.

    Args:
        hourly_data:  {"weekday": [...24 floats...], "weekend": [...]}
        peak_config:  peak_hours block from energy_data.json
        rate:         base electricity rate $/kWh

    Returns:
        dict with usage splits, costs, and savings_potential.
    """
    on_peak_range   = range(14, 21)   # 2 PM – 9 PM
    off_peak_range  = list(range(21, 24)) + list(range(6, 14))
    super_off_range = range(0, 6)     # midnight – 6 AM

    on_peak_mult   = peak_config.get("on_peak",       {}).get("rate_multiplier", 1.5)
    off_peak_mult  = peak_config.get("off_peak",      {}).get("rate_multiplier", 0.7)
    super_off_mult = peak_config.get("super_off_peak",{}).get("rate_multiplier", 0.5)

    weekday = hourly_data.get("weekday", [0] * 24)
    weekend = hourly_data.get("weekend", [0] * 24)

    # Weighted average (5 weekdays + 2 weekends per week × ~4.33 weeks)
    avg = [(weekday[h] * 5 + weekend[h] * 2) / 7 for h in range(24)]

    buckets: dict[str, Any] = {
        "on_peak":    {"hours": [], "daily_kwh": 0.0, "daily_cost": 0.0},
        "off_peak":   {"hours": [], "daily_kwh": 0.0, "daily_cost": 0.0},
        "super_off":  {"hours": [], "daily_kwh": 0.0, "daily_cost": 0.0},
    }

    for h, kwh in enumerate(avg):
        if h in on_peak_range:
            k, m, b = "on_peak", on_peak_mult, buckets["on_peak"]
        elif h in super_off_range:
            k, m, b = "super_off", super_off_mult, buckets["super_off"]
        else:
            k, m, b = "off_peak", off_peak_mult, buckets["off_peak"]
        b["hours"].append(h)
        b["daily_kwh"]  += kwh
        b["daily_cost"] += kwh * rate * m

    for b in buckets.values():
        b["monthly_kwh"]  = round(b["daily_kwh"]  * 30, 1)
        b["monthly_cost"] = round(b["daily_cost"] * 30, 2)
        b["daily_kwh"]    = round(b["daily_kwh"],  2)
        b["daily_cost"]   = round(b["daily_cost"], 3)

    # Potential savings: shifting on-peak usage to off-peak
    saveable_kwh    = buckets["on_peak"]["monthly_kwh"] * 0.30   # assume 30% shiftable
    savings_low     = round(saveable_kwh * rate * (on_peak_mult - off_peak_mult), 2)
    savings_high    = round(saveable_kwh * rate * (on_peak_mult - super_off_mult), 2)

    return {
        "buckets":       buckets,
        "savings_low":   savings_low,
        "savings_high":  savings_high,
        "peak_hours_display": "2 PM – 9 PM",
        "off_peak_display":   "9 PM – 2 PM",
        "super_off_display":  "Midnight – 6 AM",
        "on_peak_rate":       round(rate * on_peak_mult, 4),
        "off_peak_rate":      round(rate * off_peak_mult, 4),
        "super_off_rate":     round(rate * super_off_mult, 4),
    }


# ──────────────────────────────────────────────────────────────
#  Full Dashboard Summary
# ──────────────────────────────────────────────────────────────

def build_dashboard(data: dict | None = None) -> dict:
    """
    Build the complete analytics payload consumed by the frontend
    dashboard and injected as AI context.

    Args:
        data: Energy data dict. Loaded from disk if None.

    Returns:
        Comprehensive analytics dict.
    """
    if data is None:
        data = load_energy_data()

    household     = data["household"]
    appliances    = data["appliances"]
    hourly        = data["hourly_usage_kwh"]
    monthly_hist  = data["monthly_kwh_history"]
    peak_cfg      = data["peak_hours"]
    suggestions   = data.get("smart_suggestions", [])
    goals         = data.get("energy_goals", {})

    rate          = float(household.get("electricity_rate", 8.0))
    carbon_factor = float(os.getenv("CARBON_FACTOR_KG_PER_KWH", 0.386))
    home_sqft     = int(household.get("home_size_sqft", 2000))
    occupants     = int(household.get("household_size", 4))

    # ── Totals ──
    total_monthly_kwh = sum(a.get("monthly_kwh", 0) for a in appliances)
    monthly_cost      = calculate_monthly_cost(total_monthly_kwh, rate)
    carbon_kg         = calculate_carbon(total_monthly_kwh, carbon_factor)
    eff_score         = efficiency_score(total_monthly_kwh, home_sqft, occupants)
    vs_avg_pct        = round(((total_monthly_kwh - US_AVG_MONTHLY_KWH) / US_AVG_MONTHLY_KWH) * 100, 1)

    # ── Appliances ──
    enriched_appliances = appliance_analytics(appliances, rate, carbon_factor)

    # ── Category rollup ──
    category_map: dict[str, float] = {}
    for a in enriched_appliances:
        cat = a.get("category", "Other")
        category_map[cat] = round(category_map.get(cat, 0) + a["monthly_kwh"], 1)

    # ── Peak analysis ──
    peak_data = peak_analysis(hourly, peak_cfg, rate)

    # ── Bill projection (12 months using history) ──
    monthly_costs = {
        month: calculate_monthly_cost(kwh, rate)
        for month, kwh in monthly_hist.items()
    }
    annual_kwh  = sum(monthly_hist.values())
    annual_cost = calculate_monthly_cost(annual_kwh, rate)

    # ── Goal progress ──
    kwh_target  = goals.get("monthly_kwh_target", total_monthly_kwh)
    cost_target = goals.get("monthly_cost_target", monthly_cost)
    goal_pct    = min(100, round((kwh_target / total_monthly_kwh) * 100)) if total_monthly_kwh else 100

    return {
        # KPI cards
        "current_month_kwh":  total_monthly_kwh,
        "estimated_bill":     monthly_cost,
        "carbon_kg":          carbon_kg,
        "efficiency_score":   eff_score,
        "efficiency_label":   score_label(eff_score),
        "vs_average_pct":     vs_avg_pct,
        "annual_kwh":         annual_kwh,
        "annual_cost":        annual_cost,

        # Appliances
        "appliances":         enriched_appliances,
        "top_appliances":     enriched_appliances[:5],
        "category_breakdown": category_map,

        # Charts
        "monthly_kwh_history":   monthly_hist,
        "monthly_cost_history":  monthly_costs,
        "hourly_weekday":        hourly.get("weekday", []),
        "hourly_weekend":        hourly.get("weekend", []),

        # Peak/Off-peak
        "peak_analysis":      peak_data,

        # Goals
        "goals": {
            "kwh_target":    kwh_target,
            "cost_target":   cost_target,
            "goal_pct":      goal_pct,
            "carbon_target": goals.get("carbon_reduction_target_pct", 20),
        },

        # Context for AI
        "household":          household,
        "smart_suggestions":  suggestions,
        "rates": {
            "base":      rate,
            "on_peak":   peak_data["on_peak_rate"],
            "off_peak":  peak_data["off_peak_rate"],
            "super_off": peak_data["super_off_rate"],
        },
    }
