"""
app.py
=======
Smart Home Energy Advisor — Flask Application Entry Point

REST Endpoints:
    GET  /                    → Serve the single-page application
    GET  /api/status          → Health check + model status
    GET  /api/dashboard       → Full analytics payload for the dashboard
    POST /api/chat            → Send a message to the Granite AI agent
    GET  /api/appliances      → Appliance list with analytics
    GET  /api/hourly          → Hourly usage data for chart
    GET  /api/tips            → Pre-computed energy-saving tips
    POST /api/update-settings → Update household settings (rate, etc.)
"""

import logging
import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request, session
from flask_cors import CORS
from dotenv import load_dotenv

# ── Load .env before anything else ──────────────────────────
load_dotenv()

# ── Local modules ─────────────────────────────────────────────
from modules.agent_instructions import build_chat_prompt, AGENT_NAME, AGENT_VERSION
from modules.energy_analytics   import build_dashboard, load_energy_data
from modules.watsonx_client     import WatsonxClient

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Flask App Factory ──────────────────────────────────────────
def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-in-production")
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Singleton service instances ──────────────────────────
    watsonx = WatsonxClient()
    energy_data = load_energy_data()

    logger.info("Smart Home Energy Advisor v%s starting...", AGENT_VERSION)
    logger.info("Granite model status: %s", watsonx.get_status())

    # ────────────────────────────────────────────────────────
    #  Page Routes
    # ────────────────────────────────────────────────────────

    @app.route("/")
    def index():
        """Serve the main SPA."""
        return render_template(
            "index.html",
            agent_name=AGENT_NAME,
            agent_version=AGENT_VERSION,
            model_id=os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct"),
            ai_mode="live" if watsonx.is_ready else "demo",
        )

    # ────────────────────────────────────────────────────────
    #  Health / Status
    # ────────────────────────────────────────────────────────

    @app.route("/api/status")
    def api_status():
        """Health check and model status."""
        return jsonify({
            "status":     "ok",
            "agent":      AGENT_NAME,
            "version":    AGENT_VERSION,
            "timestamp":  datetime.utcnow().isoformat() + "Z",
            "watsonx":    watsonx.get_status(),
        })

    # ────────────────────────────────────────────────────────
    #  Dashboard Data
    # ────────────────────────────────────────────────────────

    @app.route("/api/dashboard")
    def api_dashboard():
        """Return the full analytics payload for the frontend dashboard."""
        try:
            dashboard = build_dashboard(energy_data)
            return jsonify({"success": True, "data": dashboard})
        except Exception as exc:
            logger.exception("Dashboard computation error")
            return jsonify({"success": False, "error": str(exc)}), 500

    # ────────────────────────────────────────────────────────
    #  Chat Endpoint
    # ────────────────────────────────────────────────────────

    @app.route("/api/chat", methods=["POST"])
    def api_chat():
        """
        Accept a user message and return the Granite AI response.

        Request JSON:
            {
                "message":  "How can I reduce my electricity bill?",
                "history":  [{"role": "user", "content": "..."}, ...]  // optional
            }

        Response JSON:
            {
                "success": true,
                "reply":   "...",
                "agent":   "Aria",
                "mode":    "live" | "demo"
            }
        """
        body = request.get_json(silent=True) or {}
        user_message = (body.get("message") or "").strip()

        if not user_message:
            return jsonify({"success": False, "error": "Message is required."}), 400

        # Max message length guard
        if len(user_message) > 2000:
            return jsonify({"success": False,
                            "error": "Message too long (max 2,000 characters)."}), 400

        history = body.get("history", [])
        if not isinstance(history, list):
            history = []

        # Sanitise history to valid roles only
        history = [
            {"role": h["role"], "content": str(h.get("content", ""))}
            for h in history
            if isinstance(h, dict) and h.get("role") in ("user", "assistant")
        ]

        try:
            # Build energy context for AI injection
            dashboard = build_dashboard(energy_data)
            energy_ctx = {
                "household":         dashboard["household"],
                "analytics":         {
                    "current_month_kwh": dashboard["current_month_kwh"],
                    "estimated_bill":    dashboard["estimated_bill"],
                    "carbon_kg":         dashboard["carbon_kg"],
                    "efficiency_score":  dashboard["efficiency_score"],
                    "vs_average_pct":    dashboard["vs_average_pct"],
                },
                "top_appliances":    dashboard["top_appliances"],
                "smart_suggestions": dashboard["smart_suggestions"],
            }

            messages = build_chat_prompt(history, user_message, energy_ctx)
            reply    = watsonx.chat(messages)

            return jsonify({
                "success": True,
                "reply":   reply,
                "agent":   AGENT_NAME,
                "mode":    "live" if watsonx.is_ready else "demo",
            })

        except Exception as exc:
            logger.exception("Chat endpoint error")
            return jsonify({
                "success": False,
                "error":   f"AI service error: {str(exc)}",
            }), 500

    # ────────────────────────────────────────────────────────
    #  Appliances
    # ────────────────────────────────────────────────────────

    @app.route("/api/appliances")
    def api_appliances():
        """Return enriched appliance analytics."""
        try:
            dashboard = build_dashboard(energy_data)
            return jsonify({
                "success":    True,
                "appliances": dashboard["appliances"],
                "total_kwh":  dashboard["current_month_kwh"],
                "total_cost": dashboard["estimated_bill"],
            })
        except Exception as exc:
            logger.exception("Appliances endpoint error")
            return jsonify({"success": False, "error": str(exc)}), 500

    # ────────────────────────────────────────────────────────
    #  Hourly Usage
    # ────────────────────────────────────────────────────────

    @app.route("/api/hourly")
    def api_hourly():
        """Return hourly usage arrays for chart rendering."""
        try:
            hourly = energy_data.get("hourly_usage_kwh", {})
            return jsonify({
                "success": True,
                "weekday": hourly.get("weekday", []),
                "weekend": hourly.get("weekend", []),
                "labels":  [f"{h:02d}:00" for h in range(24)],
            })
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    # ────────────────────────────────────────────────────────
    #  Energy Tips
    # ────────────────────────────────────────────────────────

    @app.route("/api/tips")
    def api_tips():
        """Return pre-computed quick-win tips from the dataset."""
        suggestions = energy_data.get("smart_suggestions", [])
        return jsonify({"success": True, "tips": suggestions})

    # ────────────────────────────────────────────────────────
    #  Update Settings
    # ────────────────────────────────────────────────────────

    @app.route("/api/update-settings", methods=["POST"])
    def api_update_settings():
        """
        Allow the UI to temporarily override household settings
        (e.g., custom electricity rate) for this session.

        Modifies the in-memory energy_data dict — not persisted to disk.
        """
        body = request.get_json(silent=True) or {}
        updated = []

        rate = body.get("electricity_rate")
        if rate is not None:
            try:
                r = float(rate)
                if 0.01 <= r <= 2.0:
                    energy_data["household"]["electricity_rate"] = r
                    updated.append(f"electricity_rate={r}")
                else:
                    return jsonify({"success": False,
                                    "error": "Rate must be between 0.01 and 2.00 $/kWh"}), 400
            except (TypeError, ValueError):
                return jsonify({"success": False, "error": "Invalid rate value"}), 400

        household_size = body.get("household_size")
        if household_size is not None:
            try:
                hs = int(household_size)
                if 1 <= hs <= 20:
                    energy_data["household"]["household_size"] = hs
                    updated.append(f"household_size={hs}")
            except (TypeError, ValueError):
                pass

        return jsonify({
            "success": True,
            "updated": updated,
            "message": f"Settings updated: {', '.join(updated) or 'none'}",
        })

    # ────────────────────────────────────────────────────────
    #  Error Handlers
    # ────────────────────────────────────────────────────────

    @app.errorhandler(404)
    def not_found(_err):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_err):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def server_error(_err):
        return jsonify({"error": "Internal server error"}), 500

    return app


# ── Entry Point ────────────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    host  = os.getenv("FLASK_HOST", "0.0.0.0")
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    logger.info("Starting server on http://%s:%d (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)
