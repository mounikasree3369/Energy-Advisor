/**
 * app.js — Smart Home Energy Advisor
 * =====================================
 * Handles:
 *  - Dark / light theme persistence
 *  - Tab navigation
 *  - Dashboard data loading & KPI rendering
 *  - Chart.js chart instances (monthly, category, hourly, appliance, annual, TOU)
 *  - Chat interface (send/receive, markdown rendering, history management)
 *  - Appliance grid rendering & category filter
 *  - Analytics tab (carbon, rate calculator, optimisations)
 *  - Toast notifications
 *  - Responsive auto-resize textarea
 */

"use strict";

/* ═══════════════════════════════════════════════════════════
   GLOBAL STATE
══════════════════════════════════════════════════════════ */
const State = {
  dashboard:      null,      // Latest dashboard payload from /api/dashboard
  appliances:     [],        // Enriched appliance list
  chatHistory:    [],        // [{role, content}] for the AI API
  charts:         {},        // Chart.js instances keyed by canvas id
  currentTab:     "dashboard",
  isDark:         false,
  isLoading:      false,
};

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const CHART_COLOURS = [
  "#3b82f6","#10b981","#f59e0b","#8b5cf6",
  "#14b8a6","#ef4444","#ec4899","#6366f1",
  "#f97316","#22d3ee",
];

const HOURS_LABELS = Array.from({length: 24}, (_, h) =>
  `${String(h).padStart(2,"0")}:00`
);

/* ═══════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initChatInput();
  checkAIStatus();
  loadDashboard();

  // Keyboard shortcut: Enter to send (Shift+Enter for newline)
  document.getElementById("chatInput")
    .addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

  document.getElementById("clearChatBtn")
    .addEventListener("click", clearChat);
});

/* ═══════════════════════════════════════════════════════════
   THEME (DARK / LIGHT)
══════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem("energyAdvisorTheme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  State.isDark = saved ? saved === "dark" : prefersDark;
  applyTheme(State.isDark);
}

function applyTheme(dark) {
  State.isDark = dark;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.className = dark ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
  }
  localStorage.setItem("energyAdvisorTheme", dark ? "dark" : "light");

  // Refresh all charts for correct colours
  Object.values(State.charts).forEach(c => {
    if (c && c.options && c.options.plugins) {
      c.options.plugins.legend.labels.color = dark ? "#8b949e" : "#475569";
    }
    if (c && c.options && c.options.scales) {
      Object.values(c.options.scales).forEach(axis => {
        if (axis.ticks) axis.ticks.color = dark ? "#8b949e" : "#475569";
        if (axis.grid)  axis.grid.color  = dark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
      });
    }
    c && c.update && c.update();
  });
}

document.getElementById("themeToggle")
  .addEventListener("click", () => applyTheme(!State.isDark));

/* ═══════════════════════════════════════════════════════════
   TAB NAVIGATION
══════════════════════════════════════════════════════════ */
function showTab(tab) {
  State.currentTab = tab;

  // Update nav link active state
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.remove("active");
    if (link.getAttribute("onclick") && link.getAttribute("onclick").includes(`'${tab}'`)) {
      link.classList.add("active");
    }
  });

  // Show / hide panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.style.display = pane.id === `tab-${tab}` ? "" : "none";
  });

  // Lazy-load appliance grid
  if (tab === "appliances" && State.appliances.length === 0) {
    renderApplianceGrid(State.dashboard);
  }

  // Close Bootstrap mobile navbar
  const menu = document.getElementById("navMenu");
  if (menu.classList.contains("show")) {
    const toggler = document.querySelector(".navbar-toggler");
    toggler && toggler.click();
  }
}

/* ═══════════════════════════════════════════════════════════
   AI STATUS CHECK
══════════════════════════════════════════════════════════ */
async function checkAIStatus() {
  try {
    const res  = await fetch("/api/status");
    const data = await res.json();
    const mode = data.watsonx?.mode || "demo";
    const dot  = document.getElementById("statusDot");
    const txt  = document.getElementById("statusText");
    const tag  = document.getElementById("chatModeTag");
    const foot = document.getElementById("footerMode");

    dot.className = `status-dot ${mode}`;
    txt.textContent = mode === "live" ? "IBM Granite Live" : "Demo Mode";
    if (tag) {
      tag.textContent = mode;
      tag.className = `mode-tag ${mode}`;
    }
    if (foot) foot.textContent = mode === "live" ? "Live AI Mode" : "Demo Mode";

  } catch {
    document.getElementById("statusText").textContent = "Offline";
    document.getElementById("statusDot").className = "status-dot error";
  }
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD — LOAD & RENDER
══════════════════════════════════════════════════════════ */
async function loadDashboard() {
  try {
    const res  = await fetch("/api/dashboard");
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    State.dashboard  = json.data;
    State.appliances = json.data.appliances || [];

    renderKPIs(json.data);
    renderMonthlyChart(json.data);
    renderCategoryChart(json.data);
    renderHourlyChart(json.data);
    renderPeakSummary(json.data);
    renderQuickTips(json.data);
    renderGoals(json.data);
    renderAnnualCostChart(json.data);
    renderTOUChart(json.data);
    renderCarbonSummary(json.data);
    renderOptimisations(json.data);
    populateCategoryFilter(json.data.appliances);

    // Render appliance grid if tab is already visible
    if (State.currentTab === "appliances") {
      renderApplianceGrid(json.data);
    }

  } catch (err) {
    showToast("Failed to load dashboard: " + err.message, "danger");
    console.error("Dashboard load error:", err);
  }
}

function refreshDashboard() {
  // Destroy all charts before refresh to avoid canvas reuse errors
  Object.entries(State.charts).forEach(([id, chart]) => {
    chart && chart.destroy();
    delete State.charts[id];
  });
  State.appliances = [];
  loadDashboard();
  showToast("Dashboard refreshed!", "success");
}

/* ─── KPI Cards ───────────────────────────────────────────── */
function renderKPIs(data) {
  const {
    current_month_kwh: kwh,
    estimated_bill:    bill,
    carbon_kg:         carbon,
    efficiency_score:  score,
    efficiency_label:  label,
    vs_average_pct:    vsPct,
    rates,
  } = data;

  setText("kpiKwh",       `${kwh.toLocaleString()} kWh`);
  setText("kpiKwhSub",    `${vsPct > 0 ? "+" : ""}${vsPct}% vs US average`);

  setText("kpiCost",      `$${bill.toFixed(2)}`);
  setText("kpiCostSub",   `at $${rates.base.toFixed(3)}/kWh`);

  setText("kpiCarbon",    `${carbon.toLocaleString()} kg`);
  setText("kpiCarbonSub", "CO₂ equivalent this month");

  setText("kpiScore",     `${score} / 100`);
  setText("kpiScoreSub",  `Grade: ${label} — ${scoreDescription(score)}`);

  // Colour-code vs-average
  const kwhSub = document.getElementById("kpiKwhSub");
  if (kwhSub) {
    kwhSub.style.color = vsPct > 0 ? "var(--red)" : "var(--green)";
  }
}

function scoreDescription(score) {
  if (score >= 90) return "Excellent 🏆";
  if (score >= 80) return "Very Good ✅";
  if (score >= 70) return "Good 👍";
  if (score >= 60) return "Average";
  if (score >= 50) return "Below Average";
  return "Needs Work ⚠️";
}

/* ─── Monthly Chart ───────────────────────────────────────── */
function renderMonthlyChart(data) {
  const months  = Object.keys(data.monthly_kwh_history);
  const kwhVals = Object.values(data.monthly_kwh_history);
  const costVals = Object.values(data.monthly_cost_history);
  const dark    = State.isDark;

  const ctx = document.getElementById("monthlyChart");
  if (!ctx) return;
  destroyChart("monthlyChart");

  State.charts["monthlyChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "kWh Usage",
          data: kwhVals,
          backgroundColor: CHART_COLOURS[0] + "cc",
          borderColor: CHART_COLOURS[0],
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: "y",
        },
        {
          label: "Est. Cost (₹)",
          data: costVals,
          type: "line",
          borderColor: CHART_COLOURS[2],
          backgroundColor: CHART_COLOURS[2] + "22",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: "y1",
        },
      ],
    },
    options: chartDefaults({
      scales: {
        y: {
          type: "linear", position: "left",
          title: { display: true, text: "kWh", color: gridColour(), font: {size:11} },
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font: {size:11} },
        },
        y1: {
          type: "linear", position: "right",
          title: { display: true, text: "Cost (₹)", color: gridColour(), font: {size:11} },
          grid: { drawOnChartArea: false },
          ticks: {
            color: tickColour(), font: {size:11},
            callback: v => "$" + v.toFixed(0),
          },
        },
        x: {
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font: {size:11} },
        },
      },
    }),
  });
}

/* ─── Category Donut ──────────────────────────────────────── */
function renderCategoryChart(data) {
  const cats   = Object.keys(data.category_breakdown);
  const values = Object.values(data.category_breakdown);
  const ctx    = document.getElementById("categoryChart");
  if (!ctx) return;
  destroyChart("categoryChart");

  State.charts["categoryChart"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: cats,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLOURS.slice(0, cats.length),
        hoverOffset: 6,
        borderWidth: 2,
        borderColor: State.isDark ? "#161b22" : "#ffffff",
      }],
    },
    options: chartDefaults({
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: tickColour(), font: {size: 11},
            padding: 10, boxWidth: 12,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              const total = ds.data.reduce((a, b) => a + b, 0);
              return chart.data.labels.map((label, i) => ({
                text: `${label} (${((ds.data[i]/total)*100).toFixed(0)}%)`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                lineWidth: 0, index: i,
              }));
            },
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} kWh`,
          },
        },
      },
    }),
  });
}

/* ─── Hourly Chart ────────────────────────────────────────── */
function renderHourlyChart(data) {
  const ctx = document.getElementById("hourlyChart");
  if (!ctx) return;
  destroyChart("hourlyChart");

  const onPeakBg = hourIndex =>
    hourIndex >= 14 && hourIndex < 21
      ? "rgba(239,68,68,.15)"
      : "transparent";

  State.charts["hourlyChart"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: HOURS_LABELS,
      datasets: [
        {
          label: "Weekday",
          data: data.hourly_weekday,
          borderColor: CHART_COLOURS[0],
          backgroundColor: CHART_COLOURS[0] + "30",
          fill: true, tension: 0.4,
          pointRadius: 2, pointHoverRadius: 5,
        },
        {
          label: "Weekend",
          data: data.hourly_weekend,
          borderColor: CHART_COLOURS[1],
          backgroundColor: CHART_COLOURS[1] + "30",
          fill: true, tension: 0.4,
          pointRadius: 2, pointHoverRadius: 5,
        },
      ],
    },
    options: chartDefaults({
      scales: {
        y: {
          title: { display: true, text: "kWh", color: gridColour(), font:{size:11} },
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font:{size:11} },
        },
        x: {
          grid: { color: gridColour() },
          ticks: {
            color: tickColour(), font:{size:10},
            maxRotation: 0,
            callback: (_, i) => i % 3 === 0 ? HOURS_LABELS[i] : "",
          },
        },
      },
    }),
  });
}

/* ─── Annual Cost Chart ───────────────────────────────────── */
function renderAnnualCostChart(data) {
  const ctx = document.getElementById("annualCostChart");
  if (!ctx) return;
  destroyChart("annualCostChart");

  const months = Object.keys(data.monthly_cost_history);
  const costs  = Object.values(data.monthly_cost_history);
  const annual = data.annual_cost;

  setText("annualTotalBadge", `Annual Total: ₹${annual.toFixed(2)}`);

  State.charts["annualCostChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [{
        label: "Monthly Cost ($)",
        data: costs,
        backgroundColor: costs.map(c =>
          c === Math.max(...costs) ? CHART_COLOURS[5] + "cc" : CHART_COLOURS[0] + "cc"
        ),
        borderColor: costs.map(c =>
          c === Math.max(...costs) ? CHART_COLOURS[5] : CHART_COLOURS[0]
        ),
        borderWidth: 1, borderRadius: 4,
      }],
    },
    options: chartDefaults({
      scales: {
        y: {
          grid: { color: gridColour() },
          ticks: {
            color: tickColour(), font:{size:11},
            callback: v => "$" + v.toFixed(0),
          },
        },
        x: {
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font:{size:11} },
        },
      },
    }),
  });
}

/* ─── TOU Chart ───────────────────────────────────────────── */
function renderTOUChart(data) {
  const ctx = document.getElementById("touChart");
  if (!ctx || !data.peak_analysis) return;
  destroyChart("touChart");

  const pa = data.peak_analysis.buckets;
  const labels = ["On-Peak (2–9 PM)", "Off-Peak (9 PM–2 PM)", "Super Off-Peak (Midnight–6 AM)"];
  const values = [
    pa.on_peak?.monthly_kwh  || 0,
    pa.off_peak?.monthly_kwh || 0,
    pa.super_off?.monthly_kwh || 0,
  ];
  const colours = [CHART_COLOURS[5], CHART_COLOURS[1], CHART_COLOURS[4]];

  State.charts["touChart"] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colours.map(c => c + "cc"),
        borderColor: colours,
        borderWidth: 2,
      }],
    },
    options: chartDefaults({
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: tickColour(), font:{size:11}, padding:8, boxWidth:12,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)} kWh/month`,
          },
        },
      },
    }),
  });
}

/* ─── Appliance Bar Chart ─────────────────────────────────── */
function renderApplianceBarChart(appliances) {
  const ctx = document.getElementById("applianceChart");
  if (!ctx) return;
  destroyChart("applianceChart");

  const names = appliances.map(a => truncate(a.name, 18));
  const kwhs  = appliances.map(a => a.monthly_kwh);
  const costs = appliances.map(a => a.monthly_cost);

  State.charts["applianceChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: names,
      datasets: [
        {
          label: "Monthly kWh",
          data: kwhs,
          backgroundColor: CHART_COLOURS.map(c => c + "cc"),
          borderColor: CHART_COLOURS,
          borderWidth: 1, borderRadius: 4,
          yAxisID: "y",
        },
        {
          label: "Monthly Cost (₹)",
          data: costs,
          type: "line",
          borderColor: CHART_COLOURS[2],
          backgroundColor: "transparent",
          tension: 0.3, pointRadius: 4,
          yAxisID: "y1",
        },
      ],
    },
    options: chartDefaults({
      indexAxis: "y",
      scales: {
        y: {
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font:{size:11} },
        },
        x: {
          title: { display: true, text: "kWh / month", color: gridColour(), font:{size:11} },
          grid: { color: gridColour() },
          ticks: { color: tickColour(), font:{size:11} },
          yAxisID: "y",
        },
        y1: {
          type: "linear", position: "right",
          display: false,
        },
      },
    }),
  });
}

/* ─── Supplementary Panels ────────────────────────────────── */
function renderPeakSummary(data) {
  const pa  = data.peak_analysis;
  const el  = document.getElementById("peakSummary");
  if (!el || !pa) return;

  el.innerHTML = `
    <div class="peak-rate-row">
      <span class="peak-rate-label">🔴 On-Peak Rate</span>
      <span class="peak-rate-value">₹${pa.on_peak_rate}/kWh</span>
    </div>
    <div class="peak-rate-row">
      <span class="peak-rate-label">🟡 Off-Peak Rate</span>
      <span class="peak-rate-value">₹${pa.off_peak_rate}/kWh</span>
    </div>
    <div class="peak-rate-row">
      <span class="peak-rate-label">🟢 Super Off-Peak</span>
      <span class="peak-rate-value">₹${pa.super_off_rate}/kWh</span>
    </div>
    <div class="peak-savings-box">
      💰 Shift usage to off-peak and save <strong>₹${pa.savings_low}–₹${pa.savings_high}/month</strong>
      by rescheduling shiftable loads.
    </div>
  `;
}

function renderQuickTips(data) {
  const el = document.getElementById("quickTips");
  if (!el) return;
  const tips = data.smart_suggestions || [];
  el.innerHTML = tips.map(t => `<li>${t}</li>`).join("") || "<li>No tips available.</li>";
}

function renderGoals(data) {
  const g = data.goals;
  if (!g) return;

  const kwh    = data.current_month_kwh;
  const bill   = data.estimated_bill;
  const carbon = data.carbon_kg;

  // kWh goal (lower is better — progress = target/actual)
  const kwhPct  = Math.min(100, Math.round((g.kwh_target  / kwh)  * 100));
  // Cost goal
  const costPct = Math.min(100, Math.round((g.cost_target / bill) * 100));
  // Carbon goal — show % toward reduction
  const carbonPct = Math.min(100, g.carbon_target || 20);

  setText("goalKwhVal",    `${kwh.toLocaleString()} / ${g.kwh_target.toLocaleString()} kWh`);
  setText("goalCostVal",   `₹${bill.toFixed(0)} / ₹${g.cost_target.toFixed(0)}`);
  setText("goalCarbonVal", `${carbon.toFixed(0)} kg CO₂`);

  animateBar("goalKwhBar",    kwhPct);
  animateBar("goalCostBar",   costPct);
  animateBar("goalCarbonBar", carbonPct);

  const over = kwh > g.kwh_target;
  setText("goalKwhFoot",    over ? `⚠️ ${(kwh - g.kwh_target).toLocaleString()} kWh over target` : `✅ On track`);
  setText("goalCostFoot",   bill > g.cost_target ? `⚠️ ₹${(bill - g.cost_target).toFixed(2)} over budget` : `✅ Within budget`);
  setText("goalCarbonFoot", `Target: ${g.carbon_target}% reduction vs baseline`);
}

function renderCarbonSummary(data) {
  const el = document.getElementById("carbonSummary");
  if (!el) return;
  const carbon = data.carbon_kg;
  const usAvg  = 900;
  const diff   = ((carbon - usAvg) / usAvg * 100).toFixed(0);
  const better = carbon < usAvg;

  el.innerHTML = `
    <div class="carbon-row">
      <span class="carbon-label">Your Monthly CO₂</span>
      <span class="carbon-value">${carbon.toFixed(1)} kg</span>
    </div>
    <div class="carbon-row">
      <span class="carbon-label">US Avg Monthly CO₂</span>
      <span class="carbon-value">~900 kg</span>
    </div>
    <div class="carbon-row">
      <span class="carbon-label">vs National Average</span>
      <span class="carbon-value" style="color:var(--${better?"green":"red"})">
        ${better ? "↓" : "↑"} ${Math.abs(diff)}% ${better ? "below" : "above"} average
      </span>
    </div>
    <div class="carbon-row">
      <span class="carbon-label">Annual CO₂ Estimate</span>
      <span class="carbon-value">${(carbon * 12 / 1000).toFixed(2)} tonnes</span>
    </div>
    <div class="carbon-row">
      <span class="carbon-label">Equivalent Trees Needed</span>
      <span class="carbon-value">${Math.ceil(carbon * 12 / 21)} trees/year</span>
    </div>
  `;
}

function renderOptimisations(data) {
  const el  = document.getElementById("optimisationList");
  const tips = data.smart_suggestions || [];
  if (!el) return;
  el.innerHTML = tips.map((tip, i) => `
    <div class="opt-item">
      <div class="opt-number">${i + 1}</div>
      <div class="opt-text">${tip}</div>
    </div>
  `).join("") || "<p class='text-muted small'>No suggestions available.</p>";
}

/* ═══════════════════════════════════════════════════════════
   APPLIANCE GRID
══════════════════════════════════════════════════════════ */
const CATEGORY_COLOURS = {
  "Heating & Cooling": 0,
  "Water Heating":     1,
  "Kitchen":           2,
  "Laundry":           3,
  "Transportation":    4,
  "Lighting":          5,
  "Electronics":       6,
};

function populateCategoryFilter(appliances) {
  const sel = document.getElementById("categoryFilter");
  if (!sel) return;
  const cats = [...new Set(appliances.map(a => a.category))].sort();
  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function filterAppliances() {
  const cat = document.getElementById("categoryFilter").value;
  const filtered = cat
    ? State.appliances.filter(a => a.category === cat)
    : State.appliances;
  renderApplianceGrid({appliances: filtered});
}

function renderApplianceGrid(data) {
  const grid = document.getElementById("applianceGrid");
  if (!grid) return;
  const appliances = data?.appliances || State.appliances;
  if (!appliances.length) {
    grid.innerHTML = `<div class="col-12 text-center py-4 text-muted">No appliances found.</div>`;
    return;
  }

  grid.innerHTML = appliances.map((a, idx) => {
    const colIdx   = CATEGORY_COLOURS[a.category] ?? (idx % CHART_COLOURS.length);
    const colour   = CHART_COLOURS[colIdx];
    const effGrade = a.efficiency_label || {};
    const barWidth = Math.min(100, Math.round(a.pct_of_total * 2));

    return `
    <div class="col-sm-6 col-lg-4 col-xl-3">
      <div class="appliance-card">
        <div class="appliance-header">
          <div class="appliance-icon" style="background:linear-gradient(135deg,${colour}cc,${colour})">
            <i class="bi bi-${a.icon || 'plug-fill'}"></i>
          </div>
          <div>
            <div class="appliance-name">${a.name}</div>
            <div class="appliance-cat">${a.category}</div>
            ${a.smart_enabled ? '<span class="smart-tag">⚡ Smart</span>' : ""}
          </div>
        </div>

        <div class="usage-bar-wrap">
          <div class="d-flex justify-content-between mb-1" style="font-size:11px;color:var(--text-muted)">
            <span>Share of total</span><span>${a.pct_of_total}%</span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill" style="width:${barWidth}%;background:linear-gradient(90deg,${colour}99,${colour})"></div>
          </div>
        </div>

        <div class="appliance-stat">
          <span class="label">Monthly kWh</span>
          <span class="value">${a.monthly_kwh.toLocaleString()} kWh</span>
        </div>
        <div class="appliance-stat">
          <span class="label">Monthly Cost</span>
          <span class="value">₹${a.monthly_cost.toFixed(2)}</span>
        </div>
        <div class="appliance-stat">
          <span class="label">Daily Usage</span>
          <span class="value">${a.daily_kwh} kWh / ₹${a.daily_cost.toFixed(2)}</span>
        </div>
        <div class="appliance-stat">
          <span class="label">Efficiency</span>
          <span class="value">
            <span class="eff-badge" style="color:${effGrade.colour};border-color:${effGrade.colour}">
              ${effGrade.label || a.efficiency_rating}
            </span>
          </span>
        </div>
        <div class="appliance-stat">
          <span class="label">CO₂ / month</span>
          <span class="value">${a.carbon_kg.toFixed(1)} kg</span>
        </div>
      </div>
    </div>`;
  }).join("");

  renderApplianceBarChart(appliances);
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS — SETTINGS UPDATE
══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   METER BILL CALCULATOR
══════════════════════════════════════════════════════════ */
function calculateMeterBill() {
  const prev    = parseFloat(document.getElementById("prevReading").value);
  const curr    = parseFloat(document.getElementById("currReading").value);
  const rate    = parseFloat(document.getElementById("meterRate").value);
  const fixed   = parseFloat(document.getElementById("fixedCharge").value) || 0;

  // Validation
  if (isNaN(prev) || isNaN(curr) || isNaN(rate)) {
    showToast("Please fill in Previous Reading, Current Reading, and Rate.", "warning");
    return;
  }
  if (curr < prev) {
    showToast("Current reading cannot be less than previous reading.", "warning");
    return;
  }
  if (rate <= 0) {
    showToast("Rate must be greater than 0.", "warning");
    return;
  }

  // Core calculation
  const unitsConsumed  = Math.round((curr - prev) * 10) / 10;
  const energyCharge   = Math.round(unitsConsumed * rate * 100) / 100;
  const taxRate        = 0.08;   // 8% tax — adjust if needed
  const taxAmount      = Math.round(energyCharge * taxRate * 100) / 100;
  const totalBill      = Math.round((energyCharge + fixed + taxAmount) * 100) / 100;
  const carbonKg       = Math.round(unitsConsumed * 0.386 * 10) / 10;
  const dailyUnits     = Math.round((unitsConsumed / 30) * 10) / 10;
  const dailyCost      = Math.round((totalBill / 30) * 100) / 100;

  // Efficiency label
  let effLabel, effColor;
  if (unitsConsumed < 200)       { effLabel = "🟢 Very Low Usage";    effColor = "var(--green)"; }
  else if (unitsConsumed < 500)  { effLabel = "🟡 Below Average";     effColor = "var(--teal)"; }
  else if (unitsConsumed < 875)  { effLabel = "🟠 Average Usage";     effColor = "var(--orange)"; }
  else if (unitsConsumed < 1500) { effLabel = "🔴 Above Average";     effColor = "var(--orange)"; }
  else                           { effLabel = "🔴 High Usage";        effColor = "var(--red)"; }

  // Render stat cards
  const cardsEl = document.getElementById("meterResultCards");
  cardsEl.innerHTML = `
    <div class="col-6 col-md-3">
      <div class="meter-stat-card">
        <div class="meter-stat-label">Units Consumed</div>
        <div class="meter-stat-value">${unitsConsumed.toLocaleString()}</div>
        <div class="meter-stat-sub">kWh this period</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="meter-stat-card">
        <div class="meter-stat-label">Total Bill</div>
        <div class="meter-stat-value" style="color:var(--accent)">₹${totalBill.toFixed(2)}</div>
        <div class="meter-stat-sub">incl. tax & fixed charges</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="meter-stat-card">
        <div class="meter-stat-label">Carbon Footprint</div>
        <div class="meter-stat-value" style="color:var(--teal)">${carbonKg}</div>
        <div class="meter-stat-sub">kg CO₂ this period</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="meter-stat-card">
        <div class="meter-stat-label">Daily Average</div>
        <div class="meter-stat-value">${dailyUnits}</div>
        <div class="meter-stat-sub">kWh/day • ₹${dailyCost}/day</div>
      </div>
    </div>
  `;

  // Render breakdown table
  const breakdownEl = document.getElementById("meterBreakdown");
  breakdownEl.innerHTML = `
    <h6 style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">
      📋 Bill Breakdown
    </h6>
    <table class="bill-breakdown-table">
      <thead>
        <tr>
          <th>Component</th>
          <th>Calculation</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Units Consumed</td>
          <td>${curr} − ${prev} = <strong>${unitsConsumed} kWh</strong></td>
          <td>—</td>
        </tr>
        <tr>
          <td>⚡ Energy Charge</td>
          <td>${unitsConsumed} kWh × $${rate}/kWh</td>
          <td>$${energyCharge.toFixed(2)}</td>
        </tr>
        <tr>
          <td>🔧 Fixed/Meter Charge</td>
          <td>Monthly service charge</td>
          <td>₹${fixed.toFixed(2)}</td>
        </tr>
        <tr>
          <td>🏛️ Tax (8%)</td>
          <td>$${energyCharge.toFixed(2)} × 8%</td>
          <td>$${taxAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="2"><strong>💰 Total Bill</strong></td>
          <td><strong>₹${totalBill.toFixed(2)}</strong></td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">
      Usage category: <strong style="color:${effColor}">${effLabel}</strong>
      &nbsp;|&nbsp; US average: ~875 kWh/month
      &nbsp;|&nbsp; Annual projection: <strong>~₹${(totalBill * 12).toFixed(0)}/year</strong>
    </div>
  `;

  // Render tip
  const tipEl = document.getElementById("meterTip");
  let tip = "";
  if (unitsConsumed > 1500) {
    tip = `⚠️ Your usage of ${unitsConsumed} kWh is significantly above average. Top action: shift EV charging and laundry to off-peak hours (after 9 PM) to potentially save $30–50/month with zero investment.`;
  } else if (unitsConsumed > 875) {
    tip = `💡 Your usage is above the US average of 875 kWh/month. Setting your thermostat 2°F closer to outside temperature and using cold-water washing cycles could save ~$15–25/month.`;
  } else if (unitsConsumed > 400) {
    tip = `✅ Your usage is at or below average — good work! To go further, consider LED lighting upgrades and smart power strips to eliminate standby power (vampire loads) worth ~$10/month.`;
  } else {
    tip = `🌟 Excellent! Your usage of ${unitsConsumed} kWh is very low. You're already an energy efficiency champion! Consider switching to a green electricity tariff to make your home carbon-neutral.`;
  }
  tipEl.textContent = tip;

  // Show results
  document.getElementById("meterResult").style.display = "";

  // Scroll to results smoothly
  document.getElementById("meterResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast(`Bill calculated: ₹${totalBill.toFixed(2)} for ${unitsConsumed} kWh`, "success");
}


async function updateSettings() {
  const rate     = parseFloat(document.getElementById("rateInput").value);
  const hsize    = parseInt(document.getElementById("householdInput").value, 10);
  const resultEl = document.getElementById("calcResult");
  const boxEl    = resultEl?.querySelector(".calc-result-box");

  if (isNaN(rate) || rate < 0.01 || rate > 2.0) {
    showToast("Rate must be between ₹0.01 and ₹20.00/kWh", "warning");
    return;
  }

  try {
    const res  = await fetch("/api/update-settings", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({electricity_rate: rate, household_size: hsize}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    // Recalculate on frontend with new rate
    const kwh      = State.dashboard?.current_month_kwh || 0;
    const newBill  = (kwh * rate).toFixed(2);
    const annualKwh = State.dashboard?.annual_kwh || 0;
    const annualBill = (annualKwh * rate).toFixed(2);

    if (boxEl) {
      boxEl.innerHTML = `
        <strong>📊 Recalculation Results</strong><br/>
        Rate: <strong>$${rate}/kWh</strong> &nbsp;|&nbsp;
        Household: <strong>${hsize} people</strong><br/><br/>
        <div>Monthly Bill: <strong>~$${newBill}</strong></div>
        <div>Annual Bill: <strong>~$${annualBill}</strong></div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          Reload dashboard to see updated analytics.
        </div>
      `;
    }
    if (resultEl) resultEl.style.display = "";

    showToast("Settings updated! Refresh dashboard for full recalculation.", "success");

    // Refresh dashboard with new rate
    refreshDashboard();

  } catch (err) {
    showToast("Update failed: " + err.message, "danger");
  }
}

/* ═══════════════════════════════════════════════════════════
   CHAT INTERFACE
══════════════════════════════════════════════════════════ */
function initChatInput() {
  const input = document.getElementById("chatInput");
  const count = document.getElementById("charCount");
  if (!input) return;

  input.addEventListener("input", () => {
    // Auto-resize
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    // Char count
    if (count) count.textContent = `${input.value.length} / 2000`;
    // Enable/disable send
    const btn = document.getElementById("sendBtn");
    if (btn) btn.disabled = input.value.trim().length === 0;
  });

  // Disable send button initially
  const btn = document.getElementById("sendBtn");
  if (btn) btn.disabled = true;
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input?.value.trim();
  if (!message || State.isLoading) return;

  // Render user message
  appendMessage("user", message);

  // Clear input
  input.value = "";
  input.style.height = "auto";
  const count = document.getElementById("charCount");
  if (count) count.textContent = "0 / 2000";
  const btn = document.getElementById("sendBtn");
  if (btn) btn.disabled = true;

  // Show typing indicator
  State.isLoading = true;
  showTyping(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        message,
        history: State.chatHistory,
      }),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Unknown error");

    // Update history
    State.chatHistory.push({role: "user",      content: message});
    State.chatHistory.push({role: "assistant", content: json.reply});

    // Trim history to last 20 turns
    if (State.chatHistory.length > 20) {
      State.chatHistory = State.chatHistory.slice(-20);
    }

    showTyping(false);
    appendMessage("assistant", json.reply);

  } catch (err) {
    showTyping(false);
    appendMessage("assistant",
      `⚠️ Sorry, I encountered an error: *${err.message}*\n\nPlease try again.`
    );
    console.error("Chat error:", err);
  } finally {
    State.isLoading = false;
  }
}

function sendQuickPrompt(text) {
  const input = document.getElementById("chatInput");
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event("input"));
  }
  sendMessage();
}

function appendMessage(role, content) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const isUser = role === "user";
  const time   = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});

  const div = document.createElement("div");
  div.className = `msg msg-${role}`;

  div.innerHTML = `
    <div class="msg-avatar">
      ${isUser ? "" : '<i class="bi bi-robot"></i>'}
    </div>
    <div>
      <div class="msg-bubble">${renderMarkdown(content)}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping(visible) {
  const el = document.getElementById("typingIndicator");
  if (el) el.style.display = visible ? "flex" : "none";
  const container = document.getElementById("chatMessages");
  if (container) container.scrollTop = container.scrollHeight;
}

function clearChat() {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  // Keep only the welcome message (first child)
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }
  State.chatHistory = [];
  showToast("Chat cleared.", "info");
}

/* ─── Simple Markdown Renderer ────────────────────────────── */
function renderMarkdown(text) {
  return text
    // Code blocks
    .replace(/```[\s\S]*?```/g, m => `<pre style="font-size:12px;background:var(--bg-input);padding:8px;border-radius:4px;overflow-x:auto">${escHtml(m.slice(3,-3))}</pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:2px 5px;border-radius:3px;font-size:12px">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Headings
    .replace(/^### (.+)$/gm, '<h6 style="margin:8px 0 4px;font-size:13px">$1</h6>')
    .replace(/^## (.+)$/gm,  '<h5 style="margin:10px 0 4px;font-size:14px">$1</h5>')
    // Markdown tables
    .replace(/(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)+)/g, renderTable)
    // Horizontal rule
    .replace(/^---+$/gm, "<hr style='border-color:var(--border-color);margin:8px 0'>")
    // Unordered lists
    .replace(/^[\*\-] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul style="margin:6px 0">${m}</ul>`)
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Newlines → <br>
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g,   "<br/>");
}

function renderTable(match, header, separator, body) {
  const heads = header.trim().split("|").filter(s => s.trim()).map(s => `<th>${s.trim()}</th>`).join("");
  const rows  = body.trim().split("\n").map(row => {
    const cells = row.split("|").filter(s => s.trim()).map(s => `<td>${s.trim()}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════════════════ */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {success:"check-circle-fill", danger:"x-circle-fill",
                 warning:"exclamation-triangle-fill", info:"info-circle-fill"};
  const colours = {success:"var(--green)", danger:"var(--red)",
                   warning:"var(--orange)", info:"var(--accent)"};

  const toastEl = document.createElement("div");
  toastEl.className = "toast app-toast show";
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="toast-body d-flex align-items-center gap-2">
      <i class="bi bi-${icons[type]}" style="color:${colours[type]};flex-shrink:0"></i>
      <span>${message}</span>
      <button type="button" class="btn-close ms-auto" style="font-size:11px"
              onclick="this.closest('.toast').remove()"></button>
    </div>
  `;

  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 5000);
}

/* ═══════════════════════════════════════════════════════════
   CHART HELPERS
══════════════════════════════════════════════════════════ */
function chartDefaults(overrides = {}) {
  const dark = State.isDark;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: {
      legend: {
        labels: {
          color: tickColour(),
          font: { size: 12, family: "'Inter', system-ui, sans-serif" },
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: dark ? "#1c2128" : "#0f172a",
        titleColor:  "#f8fafc",
        bodyColor:   "#cbd5e1",
        borderColor: dark ? "#30363d" : "#1e293b",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    ...overrides,
  };
}

function destroyChart(id) {
  if (State.charts[id]) {
    State.charts[id].destroy();
    delete State.charts[id];
  }
}

function gridColour()  { return State.isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)"; }
function tickColour()  { return State.isDark ? "#8b949e" : "#475569"; }

/* ═══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════════ */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function animateBar(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  setTimeout(() => { el.style.width = `${pct}%`; }, 100);
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
