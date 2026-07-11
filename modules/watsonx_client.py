"""
modules/watsonx_client.py
==========================
IBM watsonx.ai Granite model integration layer.

Handles:
- Authentication via IBM Cloud API key
- Model inference (chat completions via generate endpoint)
- Graceful fallback when credentials are missing
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from ibm_watsonx_ai import APIClient, Credentials
    from ibm_watsonx_ai.foundation_models import ModelInference
    from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams
    WATSONX_AVAILABLE = True
except ImportError:
    WATSONX_AVAILABLE = False
    logger.warning("ibm-watsonx-ai SDK not installed. AI responses will be simulated.")


class WatsonxClient:
    """
    Wrapper around IBM watsonx.ai ModelInference for the
    Smart Home Energy Advisor chat flow.
    """

    def __init__(self):
        self.api_key       = os.getenv("IBM_API_KEY", "")
        self.url           = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
        self.project_id    = os.getenv("WATSONX_PROJECT_ID", "")
        self.model_id      = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-1-8b-base")
        self.max_tokens    = int(os.getenv("AI_MAX_TOKENS", 1024))
        self.temperature   = float(os.getenv("AI_TEMPERATURE", 0.7))

        self._model: Optional[object] = None
        self._initialized = False

        if self.api_key and self.project_id and WATSONX_AVAILABLE:
            self._initialize_model()
        else:
            logger.info("WatsonxClient running in DEMO mode (no credentials or SDK).")

    # ──────────────────────────────────────────────────────────
    #  Initialization
    # ──────────────────────────────────────────────────────────
    def _initialize_model(self) -> None:
        try:
            credentials = Credentials(url=self.url, api_key=self.api_key)
            client = APIClient(credentials=credentials, project_id=self.project_id)

            self._model = ModelInference(
                model_id=self.model_id,
                api_client=client,
                project_id=self.project_id,
                validate=False,
                params={
                    GenParams.MAX_NEW_TOKENS:     self.max_tokens,
                    GenParams.TEMPERATURE:        self.temperature,
                    GenParams.TOP_P:              0.9,
                    GenParams.REPETITION_PENALTY: 1.1,
                },
            )
            self._initialized = True
            logger.info("WatsonxClient initialized with model: %s", self.model_id)

        except Exception as exc:
            logger.error("WatsonxClient initialization failed: %s", exc)
            self._initialized = False

    # ──────────────────────────────────────────────────────────
    #  Chat Interface
    # ──────────────────────────────────────────────────────────
    def chat(self, messages: list) -> str:
        """
        Send messages to Granite and return the assistant reply.
        Converts chat messages into a single prompt string since
        granite-3-1-8b-base uses the generate (not chat) endpoint.
        """
        if not self._initialized or self._model is None:
            return self._demo_response(messages)

        try:
            # Build prompt from messages
            prompt = self._messages_to_prompt(messages)

            response = self._model.generate_text(prompt=prompt)

            if isinstance(response, str) and response.strip():
                return response.strip()

            # Dict response
            if isinstance(response, dict):
                results = response.get("results", [])
                if results:
                    return results[0].get("generated_text", "").strip()

            return self._demo_response(messages)

        except Exception as exc:
            logger.error("Granite model inference error: %s", exc)
            # Try demo fallback on error
            return self._demo_response(messages)

    # ──────────────────────────────────────────────────────────
    #  Prompt Builder
    # ──────────────────────────────────────────────────────────
    def _messages_to_prompt(self, messages: list) -> str:
        """
        Convert chat messages list to a single prompt string
        compatible with granite-3-1-8b-base generate endpoint.
        """
        parts = []
        system_text = ""

        for msg in messages:
            role    = msg.get("role", "")
            content = msg.get("content", "").strip()

            if role == "system":
                system_text = content
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")

        # Build full prompt
        prompt = ""
        if system_text:
            # Take just the key instructions — base model needs concise context
            lines = [l for l in system_text.split("\n")
                     if l.strip() and not l.startswith("━") and not l.startswith("#")]
            condensed = " ".join(lines[:20])
            prompt += f"[Instructions: {condensed[:800]}]\n\n"

        prompt += "\n".join(parts)
        prompt += "\nAssistant:"
        return prompt

    # ──────────────────────────────────────────────────────────
    #  Status
    # ──────────────────────────────────────────────────────────
    @property
    def is_ready(self) -> bool:
        return self._initialized

    def get_status(self) -> dict:
        return {
            "model_id":      self.model_id,
            "url":           self.url,
            "initialized":   self._initialized,
            "mode":          "live" if self._initialized else "demo",
            "sdk_available": WATSONX_AVAILABLE,
        }

    # ──────────────────────────────────────────────────────────
    #  Citizen-focused Demo Responses
    # ──────────────────────────────────────────────────────────
    @staticmethod
    def _demo_response(messages: list) -> str:
        last = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last = msg.get("content", "").lower()
                break

        # Bill / cost
        if any(k in last for k in ["bill", "cost", "pay", "price", "much", "spend"]):
            return (
                "## 💰 Your Estimated Electricity Bill\n\n"
                "Based on your current usage of **1,583 kWh** this month at **$0.12/kWh**:\n\n"
                "**Estimated Monthly Bill: ~$189.96**\n\n"
                "**Top 3 cost drivers:**\n"
                "1. 🚗 EV Charger — $103.68/month *(shift to after 9 PM → save ~$31)*\n"
                "2. ❄️ HVAC System — $100.80/month *(smart thermostat → save ~$15)*\n"
                "3. 🚿 Water Heater — $48.60/month *(lower to 120°F → save ~$8)*\n\n"
                "**💡 Quick action:** Moving your EV charging to midnight saves **$31 this month** with zero cost or effort.\n\n"
                "**Annual projection at current rate: ~$1,820/year**\n"
                "With optimizations: potentially **~$1,400/year** — saving $420 annually."
            )

        # Carbon / environment
        if any(k in last for k in ["carbon", "co2", "emission", "environment", "green", "planet", "climate"]):
            return (
                "## 🌱 Your Carbon Footprint\n\n"
                "**This month:** ~611 kg CO₂ (1,583 kWh × 0.386 kg/kWh)\n"
                "**US average household:** ~900 kg CO₂/month\n"
                "**Your home is 32% below average** — great work! 🎉\n\n"
                "**Annual footprint:** ~7.3 tonnes CO₂\n"
                "**Trees needed to offset:** ~35 trees/year\n\n"
                "**Top ways to reduce further:**\n"
                "1. 🌞 Rooftop solar (5kW) → eliminate ~80% of grid emissions\n"
                "2. ♻️ Switch to a green electricity tariff → net-zero carbon today\n"
                "3. 🔥 Heat pump water heater → saves ~156 kg CO₂/month\n"
                "4. 🌡️ Smart thermostat → saves ~50 kg CO₂/month\n"
                "5. 🚗 Charge EV with solar or off-peak renewable energy\n\n"
                "Every kWh saved = 0.386 kg less CO₂ in the atmosphere."
            )

        # Peak / off-peak / schedule
        if any(k in last for k in ["peak", "off-peak", "schedule", "time", "when", "night", "cheap"]):
            return (
                "## ⏰ Best Times to Run Your Appliances\n\n"
                "Your utility uses **Time-of-Use (TOU) pricing**:\n\n"
                "| Period | Hours | Rate | Tip |\n"
                "|--------|-------|------|-----|\n"
                "| 🔴 On-Peak | 2 PM – 9 PM | $0.18/kWh | Avoid heavy use |\n"
                "| 🟡 Off-Peak | 9 PM – 2 PM | $0.084/kWh | Good for laundry |\n"
                "| 🟢 Super Off-Peak | Midnight – 6 AM | $0.06/kWh | Best time! |\n\n"
                "**Shift these appliances to Super Off-Peak (midnight–6 AM):**\n"
                "- 🚗 EV Charging → saves **$31/month**\n"
                "- 👕 Washing Machine → saves **$4/month**\n"
                "- 🌀 Dryer → saves **$9/month**\n"
                "- 🍽️ Dishwasher → saves **$3/month**\n\n"
                "**Total potential savings: ~$47/month** just by rescheduling!"
            )

        # Solar / renewable
        if any(k in last for k in ["solar", "renewable", "panel", "wind", "battery"]):
            return (
                "## ☀️ Solar & Renewable Energy for Your Home\n\n"
                "**Your home uses 1,583 kWh/month** — here's what solar could do:\n\n"
                "**Recommended system: 6 kW rooftop solar**\n"
                "- Monthly generation: ~720 kWh (covers ~45% of your usage)\n"
                "- Monthly savings: ~$86\n"
                "- Annual savings: ~$1,032\n"
                "- System cost: ~$18,000 (before incentives)\n"
                "- Federal tax credit (30%): -$5,400\n"
                "- **Net cost: ~$12,600 → payback in ~12 years**\n\n"
                "**Battery storage (optional):**\n"
                "Adding a 10 kWh battery lets you use solar power at night, "
                "saving another ~$40/month.\n\n"
                "**Quick wins while saving for solar:**\n"
                "- Switch to a green electricity tariff (same price, zero carbon)\n"
                "- Shift EV charging to use off-peak renewable grid power"
            )

        # Appliances / devices
        if any(k in last for k in ["appliance", "device", "fridge", "washer", "dryer", "hvac", "heater", "which"]):
            return (
                "## 🔌 Your Top Energy-Consuming Appliances\n\n"
                "Ranked by monthly cost:\n\n"
                "| # | Appliance | kWh/month | Cost/month | Grade |\n"
                "|---|-----------|-----------|------------|-------|\n"
                "| 1 | 🚗 EV Charger | 864 | $103.68 | A |\n"
                "| 2 | ❄️ HVAC System | 840 | $100.80 | B |\n"
                "| 3 | 🚿 Water Heater | 405 | $48.60 | C |\n"
                "| 4 | 🌀 Clothes Dryer | 150 | $18.00 | C |\n"
                "| 5 | 🍽️ Refrigerator | 108 | $12.96 | A |\n\n"
                "**EV + HVAC = 54% of your total bill.**\n\n"
                "**Best upgrade for the money:** Replace the C-rated water heater "
                "with a heat pump model → saves ~$31/month, pays back in 2.5 years."
            )

        # Savings / tips / recommendations
        if any(k in last for k in ["save", "tip", "recommend", "reduce", "efficient", "help", "improve", "advice"]):
            return (
                "## 💡 Top 8 Energy-Saving Tips for Your Home\n\n"
                "**No-cost actions (do today):**\n"
                "1. ⏰ Shift EV charging to midnight → **saves $31/month**\n"
                "2. 🌡️ Set thermostat to 68°F (winter) / 78°F (summer) → **saves $12/month**\n"
                "3. 🥶 Wash clothes in cold water → **saves $5/month**\n"
                "4. 🔌 Unplug TVs, chargers, game consoles when not in use → **saves $10/month**\n"
                "5. 🌡️ Turn water heater down to 120°F → **saves $8/month**\n\n"
                "**Low-cost upgrades (<$50):**\n"
                "6. 💡 Replace remaining incandescent bulbs with LEDs → **saves $8/month**\n"
                "7. 🔧 Smart power strips for home office → **saves $6/month**\n\n"
                "**Bigger investments (high ROI):**\n"
                "8. 🌡️ Smart thermostat ($130) → **saves $15/month** — pays back in 9 months\n\n"
                "**Combined total: ~$95/month in savings = $1,140/year** 🎯"
            )

        # Efficiency score
        if any(k in last for k in ["score", "grade", "rating", "efficient", "benchmark", "compare"]):
            return (
                "## 🏆 Your Home Energy Efficiency Score\n\n"
                "**Your Score: 72 / 100 — Grade B (Good)**\n\n"
                "| Category | Your Home | US Average | Status |\n"
                "|----------|-----------|------------|--------|\n"
                "| Monthly kWh | 1,583 | 875 | ⚠️ 81% above avg |\n"
                "| Cost/sqft | $0.09 | $0.06 | ⚠️ Above avg |\n"
                "| Carbon/month | 611 kg | 900 kg | ✅ 32% below avg |\n"
                "| Smart devices | 4/10 | 2/10 | ✅ Above avg |\n\n"
                "**Why your kWh is high despite good carbon score:**\n"
                "Your EV charging adds 864 kWh/month but is charged with low-carbon "
                "grid power — great for the environment, just costly.\n\n"
                "**To reach Grade A (score 85+):**\n"
                "- Upgrade HVAC to SEER 18+ system\n"
                "- Install heat pump water heater\n"
                "- Add rooftop solar\n"
                "- These changes would drop your bill by ~$75/month"
            )

        # Greeting / general
        return (
            "## 👋 Welcome! I'm Aria, Your Smart Home Energy Advisor\n\n"
            "I'm powered by **IBM Granite AI** and I help homeowners across the country "
            "understand and reduce their energy costs. Here's what I can do for you:\n\n"
            "**Ask me about:**\n"
            "- 💰 *\"What is my electricity bill this month?\"*\n"
            "- 🔌 *\"Which appliances use the most energy?\"*\n"
            "- ⏰ *\"When should I run my dishwasher to save money?\"*\n"
            "- 🌱 *\"How can I reduce my carbon footprint?\"*\n"
            "- ☀️ *\"Should I install solar panels?\"*\n"
            "- 💡 *\"Give me your top energy saving tips\"*\n"
            "- 🏆 *\"What is my home energy efficiency score?\"*\n\n"
            "**Your home at a glance:**\n"
            "- 📊 Monthly usage: **1,583 kWh** (81% above US average)\n"
            "- 💵 Estimated bill: **~$189.96/month**\n"
            "- 🌍 Carbon footprint: **611 kg CO₂/month** (32% below average ✅)\n"
            "- 🏆 Efficiency score: **72/100 — Grade B**\n\n"
            "What would you like to know?"
        )
