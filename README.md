# ⚡ Smart Home Energy Advisor

> An AI-powered home energy analysis and optimization agent built with **IBM watsonx.ai Granite models**, **Python Flask**, and **IBM Cloud Lite**.

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![Flask 3.0](https://img.shields.io/badge/Flask-3.0-green)](https://flask.palletsprojects.com/)
[![IBM Granite](https://img.shields.io/badge/IBM-Granite%20AI-blue)](https://www.ibm.com/products/watsonx-ai)
[![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-purple)](https://getbootstrap.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [REST API Reference](#rest-api-reference)
- [Customizing the Agent](#customizing-the-agent)
- [IBM Cloud Lite Deployment](#ibm-cloud-lite-deployment)
- [Screenshots](#screenshots)
- [Contributing](#contributing)

---

## Overview

The **Smart Home Energy Advisor** is a production-ready web application that connects your household's smart meter and appliance data to IBM's **Granite large language models** on **watsonx.ai**. The AI agent — named *Aria* — analyses your consumption patterns, predicts bills, identifies energy waste, and delivers personalized recommendations through an interactive chat interface and real-time analytics dashboard.

---

## Features

### 🤖 AI Agent (IBM Granite)
- Natural language Q&A about energy usage, costs, and savings
- Context-aware responses grounded in your actual household data
- Customizable persona, tone, and domain policies via `AGENT_INSTRUCTIONS`
- Fully functional **demo mode** when IBM credentials are not configured

### 📊 Interactive Dashboard
- KPI cards: monthly kWh, estimated bill, carbon footprint, efficiency score
- 12-month usage trend chart (bar + line overlay)
- Category breakdown donut chart
- Weekday vs weekend hourly consumption profile
- Energy goal progress indicators

### 🔌 Appliance Analytics
- All appliances ranked by monthly energy consumption
- Per-appliance: kWh, cost, CO₂, daily usage, efficiency grade
- Horizontal bar chart comparison
- Smart appliance indicator
- Category filter

### ⏰ Peak / Off-Peak Optimization
- Time-of-Use (TOU) rate breakdown
- On-peak / off-peak / super off-peak usage buckets
- Savings potential calculation
- Smart scheduling recommendations

### 🌱 Carbon Footprint
- Monthly and annual CO₂ equivalent emissions
- Comparison vs US national average household
- Equivalent trees needed visualization

### ⚙️ Analytics & Settings
- Custom electricity rate calculator
- Household size adjustment
- Annual bill projection
- Optimization opportunity list

### 🎨 Modern UI
- Responsive design — works on mobile, tablet, and desktop
- **Dark / light mode** toggle with system preference detection
- Bootstrap 5.3 + custom CSS
- Chart.js interactive charts
- Toast notifications
- Typing indicator and markdown-rendered AI responses

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                        │
│  HTML + Bootstrap 5 + Chart.js + Vanilla JS              │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API (JSON)
┌─────────────────────▼───────────────────────────────────┐
│                  Flask Application                        │
│  app.py — REST endpoints, session handling               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ modules/agent_instructions.py                       │ │
│  │   AGENT_INSTRUCTIONS, build_chat_prompt()           │ │
│  │ modules/watsonx_client.py                           │ │
│  │   WatsonxClient → IBM Granite API                   │ │
│  │ modules/energy_analytics.py                         │ │
│  │   build_dashboard(), peak_analysis(), scoring       │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────┬────────────────────┬────────────────────┘
               │                    │
   ┌───────────▼───────┐  ┌─────────▼──────────────────┐
   │  data/             │  │  IBM watsonx.ai             │
   │  energy_data.json  │  │   ibm/granite-3-3-8b-instruct│
   └───────────────────┘  └────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Python 3.10 or newer
- pip
- An **IBM Cloud** account (free Lite tier works)
- An **IBM watsonx.ai** project

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/smart-home-energy-advisor.git
cd smart-home-energy-advisor
```

### 2. Create & Activate a Virtual Environment

```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your IBM Cloud credentials (see [Configuration](#configuration)).

### 5. Run the Application

```bash
python app.py
```

Open your browser at **http://localhost:5000**

> **No IBM credentials?** The app runs in **demo mode** with simulated AI responses. All dashboard features and charts are fully functional.

---

## Project Structure

```
smart-home-energy-advisor/
│
├── app.py                      # Flask application & REST API
│
├── modules/
│   ├── __init__.py
│   ├── agent_instructions.py   # AGENT_INSTRUCTIONS + prompt builder
│   ├── watsonx_client.py       # IBM Granite model client
│   └── energy_analytics.py     # Analytics engine
│
├── templates/
│   └── index.html              # Single-page application template
│
├── static/
│   ├── css/
│   │   └── style.css           # Styles + dark mode
│   └── js/
│       └── app.js              # Charts, chat, dashboard logic
│
├── data/
│   └── energy_data.json        # Sample smart home dataset
│
├── .env.example                # Environment variable template
├── requirements.txt            # Python dependencies
├── Procfile                    # IBM Cloud / Heroku deployment
└── README.md
```

---

## Configuration

Copy `.env.example` to `.env` and set the following variables:

| Variable | Required | Description |
|---|---|---|
| `IBM_API_KEY` | Yes* | IBM Cloud API key |
| `WATSONX_URL` | Yes* | watsonx.ai service URL (region-specific) |
| `WATSONX_PROJECT_ID` | Yes* | watsonx.ai project ID |
| `WATSONX_MODEL_ID` | No | Granite model ID (default: ` ibm/granite-3-3-8b-instruct`) |
| `FLASK_SECRET_KEY` | Yes | Long random secret for session signing |
| `ELECTRICITY_RATE_PER_KWH` | No | Local rate in $/kWh (default: 0.12) |
| `CARBON_FACTOR_KG_PER_KWH` | No | kg CO₂/kWh emission factor (default: 0.386) |
| `AI_MAX_TOKENS` | No | Max tokens per response (default: 1024) |
| `AI_TEMPERATURE` | No | Creativity (0–1, default: 0.7) |

*Required only for live AI mode. Demo mode works without these.

### Getting IBM Cloud Credentials

1. Sign up at [cloud.ibm.com](https://cloud.ibm.com) (free Lite tier)
2. Create an **API Key**: IAM → API keys → Create
3. Create a **watsonx.ai project**: [dataplatform.cloud.ibm.com/projects](https://dataplatform.cloud.ibm.com/projects)
4. Note your Project ID from the project settings
5. Choose a region URL:
   - US South: `https://us-south.ml.cloud.ibm.com`
   - EU Germany: `https://eu-de.ml.cloud.ibm.com`
   - UK: `https://eu-gb.ml.cloud.ibm.com`
   - Japan: `https://jp-tok.ml.cloud.ibm.com`

---

## REST API Reference

### `GET /api/status`
Health check and AI model status.

```json
{
  "status": "ok",
  "agent": "Aria",
  "version": "2.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "watsonx": { "model_id": " ibm/granite-3-3-8b-instruct", "mode": "live" }
}
```

---

### `GET /api/dashboard`
Full analytics payload for the dashboard.

```json
{
  "success": true,
  "data": {
    "current_month_kwh": 1583,
    "estimated_bill": 189.96,
    "carbon_kg": 611.0,
    "efficiency_score": 72,
    "efficiency_label": "B",
    "vs_average_pct": 81.0,
    "appliances": [...],
    "monthly_kwh_history": { "Jan": 1420, ... },
    "peak_analysis": { ... },
    "goals": { ... }
  }
}
```

---

### `POST /api/chat`
Send a message to the Granite AI agent.

**Request:**
```json
{
  "message": "Which appliances use the most electricity?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! I'm Aria..." }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "reply": "Your top 3 energy consumers are...",
  "agent": "Aria",
  "mode": "live"
}
```

---

### `GET /api/appliances`
Appliance list with enriched analytics.

---

### `GET /api/hourly`
Hourly usage arrays (weekday and weekend) for charts.

---

### `GET /api/tips`
Pre-computed energy-saving tips.

---

### `POST /api/update-settings`
Temporarily override household settings.

**Request:**
```json
{ "electricity_rate": 0.15, "household_size": 3 }
```

---

## Customizing the Agent

All agent behavior is controlled in [`modules/agent_instructions.py`](modules/agent_instructions.py).

### Changing the Agent Name
```python
AGENT_NAME = "Max"   # Line 18
```

### Modifying Response Tone
Edit the `PERSONA & TONE` section inside `AGENT_INSTRUCTIONS`:
```python
AGENT_INSTRUCTIONS = """
...
PERSONA & TONE
- Be formal and technical (targeting energy engineers)
- Use SI units (Wh, MWh) throughout
...
"""
```

### Adding Domain Policies
Add new policies to the `ENERGY-SAVING POLICIES` section:

```python
  Solar Panels:
  - A 5kW residential system produces ~600 kWh/month in a sunny climate.
  - Payback period is typically 7–10 years with current incentives.
  - Net metering allows selling excess power back to the grid.
```

### Restricting Topics
Modify the `SAFETY & BOUNDARIES` section to add more restrictions:
```python
- Do not discuss competitor smart home platforms.
- Only provide recommendations for US residential properties.
```

---

## IBM Cloud Lite Deployment

### Option 1: IBM Cloud Foundry (Free Tier)

#### Prerequisites
- [IBM Cloud CLI](https://cloud.ibm.com/docs/cli)
- Cloud Foundry CLI plugin: `ibmcloud cf install-plugin`

#### Steps

**1. Create a `Procfile`:**
```
web: gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

**2. Create `manifest.yml`:**
```yaml
applications:
  - name: smart-home-energy-advisor
    memory: 512M
    instances: 1
    buildpack: python_buildpack
    command: gunicorn app:app --bind 0.0.0.0:$PORT --workers 2
    env:
      IBM_API_KEY: your_api_key
      WATSONX_URL: https://us-south.ml.cloud.ibm.com
      WATSONX_PROJECT_ID: your_project_id
      FLASK_SECRET_KEY: your_secret_key
      FLASK_ENV: production
      FLASK_DEBUG: "False"
```

> ⚠️ **Security:** Use IBM Cloud environment variables instead of hardcoding secrets in `manifest.yml`.

**3. Login and Deploy:**
```bash
ibmcloud login --sso
ibmcloud target --cf
ibmcloud cf push
```

**4. Set Environment Variables Securely:**
```bash
ibmcloud cf set-env smart-home-energy-advisor IBM_API_KEY "your_key"
ibmcloud cf set-env smart-home-energy-advisor WATSONX_PROJECT_ID "your_project_id"
ibmcloud cf restage smart-home-energy-advisor
```

**5. Open the App:**
```bash
ibmcloud cf open smart-home-energy-advisor
```

---

### Option 2: IBM Code Engine (Serverless)

**1. Build and push a container image:**
```bash
# Build
docker build -t smart-home-energy-advisor .

# Push to IBM Container Registry
ibmcloud cr login
docker tag smart-home-energy-advisor us.icr.io/your-namespace/energy-advisor:latest
docker push us.icr.io/your-namespace/energy-advisor:latest
```

**2. Deploy to Code Engine:**
```bash
ibmcloud ce application create \
  --name energy-advisor \
  --image us.icr.io/your-namespace/energy-advisor:latest \
  --port 5000 \
  --env IBM_API_KEY=your_key \
  --env WATSONX_PROJECT_ID=your_id \
  --env WATSONX_URL=https://us-south.ml.cloud.ibm.com \
  --env FLASK_SECRET_KEY=your_secret
```

**3. Get the URL:**
```bash
ibmcloud ce application get --name energy-advisor --output url
```

---

### Option 3: Docker (Local / Any Cloud)

**1. Create a `Dockerfile`:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120"]
```

**2. Build and run:**
```bash
docker build -t energy-advisor .
docker run -p 5000:5000 --env-file .env energy-advisor
```

---

### Production Checklist

Before going live, ensure:

- [ ] `FLASK_DEBUG=False` in production environment
- [ ] `FLASK_SECRET_KEY` is a 32+ character random string
- [ ] Never commit `.env` to version control (`.gitignore` should include it)
- [ ] Set IBM credentials as environment variables, not in code
- [ ] Enable HTTPS (handled automatically by IBM Cloud)
- [ ] Review `AGENT_INSTRUCTIONS` for appropriate content policies
- [ ] Test the application in demo mode before connecting live credentials

---

## Customizing Energy Data

Replace or extend `data/energy_data.json` with your real smart meter data:

```json
{
  "household": { ... },           // Home metadata
  "appliances": [ ... ],          // Appliance list with wattage + usage
  "hourly_usage_kwh": { ... },    // 24-hour usage profiles
  "monthly_kwh_history": { ... }, // 12-month history
  "peak_hours": { ... },          // TOU rate configuration
  "energy_goals": { ... },        // Monthly targets
  "smart_suggestions": [ ... ]    // Custom tip strings
}
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test thoroughly
4. Submit a pull request with a clear description

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

- **IBM watsonx.ai** — Granite foundation models
- **IBM Cloud** — Hosting and infrastructure
- **Chart.js** — Interactive data visualizations
- **Bootstrap 5** — Responsive UI framework
- **Flask** — Python web framework

---

*Built with ❤️ using IBM Granite AI on IBM Cloud*
