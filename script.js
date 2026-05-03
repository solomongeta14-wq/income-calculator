const STORAGE_KEY = "flowbudget-state-v2";
const LEGACY_STORAGE_KEY = "flowbudget-state-v1";
const expenseCategories = ["Food", "Transport", "Rent", "Education", "Entertainment", "Other"];
const palette = ["#00d4ff", "#00f5a0", "#ffcf5a", "#ff7f50", "#8b5cf6", "#ff4d6d", "#66e3ff"];

const elements = {
  body: document.body,
  emailInput: document.getElementById("emailInput"),
  registerAccountBtn: document.getElementById("registerAccountBtn"),
  accountPicker: document.getElementById("accountPicker"),
  accountStatus: document.getElementById("accountStatus"),
  monthPicker: document.getElementById("monthPicker"),
  currencyPicker: document.getElementById("currencyPicker"),
  themeToggle: document.getElementById("themeToggle"),
  addIncomeBtn: document.getElementById("addIncomeBtn"),
  addExpenseBtn: document.getElementById("addExpenseBtn"),
  calculateBtn: document.getElementById("calculateBtn"),
  resetBtn: document.getElementById("resetBtn"),
  exportBtn: document.getElementById("exportBtn"),
  incomeList: document.getElementById("incomeList"),
  expenseList: document.getElementById("expenseList"),
  incomeTotal: document.getElementById("incomeTotal"),
  expenseTotal: document.getElementById("expenseTotal"),
  balanceTotal: document.getElementById("balanceTotal"),
  usageBar: document.getElementById("usageBar"),
  usageLabel: document.getElementById("usageLabel"),
  expenseLegend: document.getElementById("expenseLegend"),
  insightsList: document.getElementById("insightsList"),
  expenseTableBody: document.getElementById("expenseTableBody"),
  summaryPanel: document.getElementById("summaryPanel"),
  emptyState: document.getElementById("emptyState")
};

let charts = {
  expense: null,
  comparison: null
};

let store = loadStore();
let state = getActiveState();

init();

function init() {
  ensureSeedRows();
  bindEvents();
  syncControls();
  syncAccountUi();
  renderLists();
  calculateAndRender(false);
}

function persist() {
  if (store.activeEmail) {
    store.accounts[store.activeEmail] = {
      ...cloneState(state),
      updatedAt: new Date().toISOString()
    };
  } else {
    store.guestState = cloneState(state);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function syncControls() {
  elements.monthPicker.value = state.month;
  elements.currencyPicker.value = state.currency;
  elements.body.dataset.theme = state.theme;
  elements.themeToggle.textContent = state.theme === "dark" ? "Light mode" : "Dark mode";
}

function bindEvents() {
  elements.registerAccountBtn.addEventListener("click", registerAccount);
  elements.accountPicker.addEventListener("change", (event) => switchAccount(event.target.value));

  elements.addIncomeBtn.addEventListener("click", () => {
    state.incomes.push({ id: makeId(), name: "", amount: 0 });
    persist();
    renderLists();
  });

  elements.addExpenseBtn.addEventListener("click", () => {
    state.expenses.push({ id: makeId(), name: "", category: "Other", amount: 0 });
    persist();
    renderLists();
  });

  elements.calculateBtn.addEventListener("click", () => calculateAndRender(true));
  elements.resetBtn.addEventListener("click", resetState);
  elements.exportBtn.addEventListener("click", exportDashboard);

  elements.monthPicker.addEventListener("change", (event) => {
    state.month = event.target.value;
    persist();
  });

  elements.currencyPicker.addEventListener("change", (event) => {
    state.currency = event.target.value;
    persist();
    calculateAndRender(false);
  });

  elements.themeToggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    syncControls();
    persist();
    refreshChartsTheme();
  });
}

function loadStore() {
  const fallbackState = buildDefaultState();
  const fallbackStore = {
    activeEmail: "",
    accounts: {},
    guestState: fallbackState
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed) {
      return {
        activeEmail: normalizeEmail(parsed.activeEmail || ""),
        accounts: sanitizeAccounts(parsed.accounts),
        guestState: sanitizeState(parsed.guestState)
      };
    }
  } catch {
    // Ignore malformed local data and fall back below.
  }

  const legacyState = loadLegacyState();
  return {
    ...fallbackStore,
    guestState: legacyState || fallbackState
  };
}

function loadLegacyState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return parsed ? sanitizeState(parsed) : null;
  } catch {
    return null;
  }
}

function sanitizeAccounts(accounts) {
  if (!accounts || typeof accounts !== "object") {
    return {};
  }

  const cleanAccounts = {};
  Object.entries(accounts).forEach(([email, accountState]) => {
    const normalized = normalizeEmail(email);
    if (normalized) {
      cleanAccounts[normalized] = {
        ...sanitizeState(accountState),
        updatedAt: typeof accountState?.updatedAt === "string" ? accountState.updatedAt : null
      };
    }
  });
  return cleanAccounts;
}

function sanitizeState(candidate) {
  const fallback = buildDefaultState();
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  return {
    month: typeof candidate.month === "string" && candidate.month ? candidate.month : fallback.month,
    currency: ["USD", "ETB", "EUR"].includes(candidate.currency) ? candidate.currency : fallback.currency,
    theme: candidate.theme === "light" ? "light" : "dark",
    incomes: Array.isArray(candidate.incomes) ? candidate.incomes.map((item) => ({
      id: item.id || makeId(),
      name: String(item.name || ""),
      amount: safeNumber(item.amount)
    })) : fallback.incomes,
    expenses: Array.isArray(candidate.expenses) ? candidate.expenses.map((item) => ({
      id: item.id || makeId(),
      name: String(item.name || ""),
      category: expenseCategories.includes(item.category) ? item.category : "Other",
      amount: safeNumber(item.amount)
    })) : fallback.expenses
  };
}

function getActiveState() {
  const source = store.activeEmail && store.accounts[store.activeEmail]
    ? store.accounts[store.activeEmail]
    : store.guestState;
  return cloneState(source);
}

function buildDefaultState() {
  const now = new Date();
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    currency: "USD",
    theme: "dark",
    incomes: [],
    expenses: []
  };
}

function cloneState(source) {
  return {
    month: source.month,
    currency: source.currency,
    theme: source.theme,
    incomes: source.incomes.map((item) => ({ ...item })),
    expenses: source.expenses.map((item) => ({ ...item }))
  };
}

function ensureSeedRows() {
  if (!state.incomes.length) {
    state.incomes = [
      { id: makeId(), name: "Salary", amount: 0 },
      { id: makeId(), name: "Freelance", amount: 0 }
    ];
  }

  if (!state.expenses.length) {
    state.expenses = [
      { id: makeId(), name: "Rent", category: "Rent", amount: 0 },
      { id: makeId(), name: "Food", category: "Food", amount: 0 }
    ];
  }
}

function registerAccount() {
  const email = normalizeEmail(elements.emailInput.value);
  if (!isValidEmail(email)) {
    setAccountStatus("Enter a valid email address to register an account.");
    elements.emailInput.focus();
    return;
  }

  if (!store.accounts[email]) {
    store.accounts[email] = {
      ...cloneState(state),
      updatedAt: new Date().toISOString()
    };
  }

  store.activeEmail = email;
  state = getActiveState();
  ensureSeedRows();
  persist();
  syncControls();
  syncAccountUi();
  renderLists();
  calculateAndRender(false);
  setAccountStatus(`Signed in as ${email}. This account now restores its own last saved budget.`);
}

function switchAccount(email) {
  const normalized = normalizeEmail(email);
  store.activeEmail = normalized && store.accounts[normalized] ? normalized : "";
  state = getActiveState();
  ensureSeedRows();
  persist();
  syncControls();
  syncAccountUi();
  renderLists();
  calculateAndRender(false);

  if (store.activeEmail) {
    setAccountStatus(`Loaded saved state for ${store.activeEmail}.`);
  } else {
    setAccountStatus("Switched to guest mode. Guest changes stay on this browser only.");
  }
}

function syncAccountUi() {
  const accountEmails = Object.keys(store.accounts).sort();
  elements.accountPicker.innerHTML = ['<option value="">Guest</option>']
    .concat(accountEmails.map((email) => `<option value="${escapeHtml(email)}">${escapeHtml(email)}</option>`))
    .join("");
  elements.accountPicker.value = store.activeEmail || "";
  elements.emailInput.value = store.activeEmail || "";

  if (store.activeEmail) {
    setAccountStatus(`Active account: ${store.activeEmail}`);
  } else {
    setAccountStatus("Using guest mode. Register an email to save a personal state.");
  }
}

function setAccountStatus(message) {
  elements.accountStatus.textContent = message;
}

function renderLists() {
  elements.incomeList.innerHTML = "";
  elements.expenseList.innerHTML = "";

  state.incomes.forEach((income) => {
    elements.incomeList.appendChild(buildIncomeRow(income));
  });

  state.expenses.forEach((expense) => {
    elements.expenseList.appendChild(buildExpenseRow(expense));
  });
}

function buildIncomeRow(income) {
  const row = document.createElement("div");
  row.className = "entry-row income-row";
  row.innerHTML = `
    <input type="text" placeholder="Source name" value="${escapeHtml(income.name)}" data-field="name">
    <input type="number" placeholder="Amount" min="0" step="0.01" value="${income.amount || ""}" data-field="amount">
    <div></div>
    <button class="delete-button" type="button" aria-label="Delete income">X</button>
  `;

  row.querySelector('[data-field="name"]').addEventListener("input", (event) => {
    income.name = event.target.value;
    persist();
  });

  row.querySelector('[data-field="amount"]').addEventListener("input", (event) => {
    income.amount = safeNumber(event.target.value);
    persist();
  });

  row.querySelector(".delete-button").addEventListener("click", () => {
    state.incomes = state.incomes.filter((item) => item.id !== income.id);
    persist();
    renderLists();
    calculateAndRender(false);
  });

  return row;
}

function buildExpenseRow(expense) {
  const row = document.createElement("div");
  row.className = "entry-row expense-row";
  row.innerHTML = `
    <input type="text" placeholder="Expense name" value="${escapeHtml(expense.name)}" data-field="name">
    <input type="number" placeholder="Amount" min="0" step="0.01" value="${expense.amount || ""}" data-field="amount">
    <select data-field="category">
      ${expenseCategories.map((category) => `<option value="${category}" ${expense.category === category ? "selected" : ""}>${category}</option>`).join("")}
    </select>
    <button class="delete-button" type="button" aria-label="Delete expense">X</button>
  `;

  row.querySelector('[data-field="name"]').addEventListener("input", (event) => {
    expense.name = event.target.value;
    persist();
  });

  row.querySelector('[data-field="amount"]').addEventListener("input", (event) => {
    expense.amount = safeNumber(event.target.value);
    persist();
  });

  row.querySelector('[data-field="category"]').addEventListener("change", (event) => {
    expense.category = event.target.value;
    if (!expense.name.trim()) {
      expense.name = expense.category;
      renderLists();
    }
    persist();
  });

  row.querySelector(".delete-button").addEventListener("click", () => {
    state.expenses = state.expenses.filter((item) => item.id !== expense.id);
    persist();
    renderLists();
    calculateAndRender(false);
  });

  return row;
}

function calculateAndRender(celebrate) {
  persist();

  const incomes = state.incomes
    .map(normalizeRow)
    .filter((item) => item.name || item.amount > 0);
  const expenses = state.expenses
    .map(normalizeExpenseRow)
    .filter((item) => item.name || item.amount > 0);

  const totalIncome = sumAmounts(incomes);
  const totalExpenses = sumAmounts(expenses);
  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;
  const usagePct = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  animateValue(elements.incomeTotal, totalIncome, state.currency);
  animateValue(elements.expenseTotal, totalExpenses, state.currency);
  animateValue(elements.balanceTotal, netBalance, state.currency);
  elements.balanceTotal.classList.toggle("negative-balance", netBalance < 0);

  updateUsage(usagePct);
  renderCharts(incomes, expenses, totalIncome, totalExpenses);
  renderInsights(expenses, totalIncome, totalExpenses, netBalance, savingsRate);
  renderTable(expenses, totalExpenses);
  updateEmptyState(incomes.length === 0 && expenses.length === 0);

  if (celebrate && savingsRate > 20 && totalIncome > 0 && typeof confetti === "function") {
    confetti({ particleCount: 140, spread: 75, origin: { y: 0.65 } });
  }
}

function renderCharts(incomes, expenses, totalIncome, totalExpenses) {
  const textColor = getCss("--text").trim();
  const gridColor = getCss("--grid-line").trim();
  const positive = getCss("--positive").trim();
  const negative = getCss("--negative").trim();

  const expenseTotals = aggregateExpenses(expenses);
  const labels = expenseTotals.length ? expenseTotals.map((item) => item.name) : ["No expenses"];
  const values = expenseTotals.length ? expenseTotals.map((item) => item.amount) : [1];
  const colors = expenseTotals.length ? expenseTotals.map((_, index) => palette[index % palette.length]) : ["rgba(255,255,255,0.12)"];

  if (charts.expense) {
    charts.expense.destroy();
  }

  charts.expense = new Chart(document.getElementById("expenseChart"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => expenseTotals.length
              ? `${context.label}: ${formatCurrency(context.parsed, state.currency)}`
              : "Add expenses to see the breakdown."
          }
        }
      },
      cutout: "68%"
    }
  });

  elements.expenseLegend.innerHTML = expenseTotals.length
    ? expenseTotals.map((item, index) => {
      const percentage = totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0;
      return `
        <div class="legend-item">
          <div class="legend-left">
            <span class="legend-dot" style="background:${colors[index]}"></span>
            <span>${escapeHtml(item.name)}</span>
          </div>
          <span>${formatCurrency(item.amount, state.currency)} | ${percentage.toFixed(1)}%</span>
        </div>
      `;
    }).join("")
    : `<p class="section-caption">No expenses to visualize yet.</p>`;

  if (charts.comparison) {
    charts.comparison.destroy();
  }

  charts.comparison = new Chart(document.getElementById("comparisonChart"), {
    type: "bar",
    data: {
      labels: ["Income", "Expenses"],
      datasets: [{
        data: [totalIncome, totalExpenses],
        backgroundColor: [positive, negative],
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            callback: (value) => formatCurrency(value, state.currency)
          },
          grid: { color: gridColor }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatCurrency(context.parsed.y, state.currency)
          }
        }
      }
    }
  });
}

function renderInsights(expenses, totalIncome, totalExpenses, netBalance, savingsRate) {
  const insights = [];
  const largestExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0];

  if (largestExpense && totalIncome > 0) {
    insights.push(`Your biggest expense is ${largestExpense.name || largestExpense.category} at ${((largestExpense.amount / totalIncome) * 100).toFixed(1)}% of your income.`);
  }

  if (netBalance >= 0 && totalIncome > 0) {
    insights.push(`You're saving ${Math.max(savingsRate, 0).toFixed(1)}% of your income this month.`);
  } else if (netBalance < 0) {
    insights.push(`Your expenses exceed your income by ${formatCurrency(Math.abs(netBalance), state.currency)}. Watch the overrun.`);
  }

  if (totalExpenses === 0 && totalIncome === 0) {
    insights.push("Start by entering at least one income source and one expense.");
  } else if (totalIncome === 0 && totalExpenses > 0) {
    insights.push("You have expenses logged without income. Add income to get a meaningful budget usage rate.");
  } else {
    const grouped = aggregateExpenses(expenses);
    const topCategory = grouped.sort((a, b) => b.amount - a.amount)[0];
    if (topCategory && totalExpenses > 0) {
      insights.push(`${topCategory.name} makes up ${((topCategory.amount / totalExpenses) * 100).toFixed(1)}% of total expenses.`);
    }
  }

  elements.insightsList.innerHTML = insights.slice(0, 3).map((text) => `<div class="insight-item">${escapeHtml(text)}</div>`).join("");
}

function renderTable(expenses, totalExpenses) {
  const sorted = [...expenses].sort((a, b) => b.amount - a.amount);
  elements.expenseTableBody.innerHTML = sorted.length
    ? sorted.map((expense, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(expense.name || expense.category)}</td>
        <td class="money">${formatCurrency(expense.amount, state.currency)}</td>
        <td>${totalExpenses > 0 ? ((expense.amount / totalExpenses) * 100).toFixed(1) : "0.0"}%</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="section-caption">No expense data yet.</td></tr>`;
}

function updateUsage(value) {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  elements.usageBar.style.width = `${Math.min(normalized, 100)}%`;
  elements.usageLabel.textContent = `You've used ${normalized.toFixed(1)}% of your income.`;
}

function updateEmptyState(isEmpty) {
  elements.summaryPanel.classList.toggle("has-empty", isEmpty);
  elements.emptyState.classList.toggle("visible", isEmpty);
}

function resetState() {
  state = {
    ...state,
    incomes: [{ id: makeId(), name: "", amount: 0 }],
    expenses: [{ id: makeId(), name: "", category: "Other", amount: 0 }]
  };
  persist();
  renderLists();
  calculateAndRender(false);
}

function exportDashboard() {
  html2canvas(elements.summaryPanel, { backgroundColor: null, scale: 2 }).then((canvas) => {
    const link = document.createElement("a");
    link.download = `flowbudget-${state.month || "summary"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

function refreshChartsTheme() {
  calculateAndRender(false);
}

function animateValue(node, target, currency) {
  const start = Number(node.dataset.value || 0);
  const end = Number.isFinite(target) ? target : 0;
  const startTime = performance.now();
  const duration = 500;
  node.dataset.value = String(end);

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = start + (end - start) * easeOutCubic(progress);
    node.textContent = formatCurrency(value, currency);
    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function sumAmounts(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function aggregateExpenses(expenses) {
  const totals = new Map();
  expenses.forEach((expense) => {
    const key = expense.name || expense.category || "Other";
    totals.set(key, (totals.get(key) || 0) + expense.amount);
  });

  return [...totals.entries()].map(([name, amount]) => ({ name, amount }));
}

function normalizeRow(item) {
  return {
    id: item.id,
    name: String(item.name || "").trim(),
    amount: safeNumber(item.amount)
  };
}

function normalizeExpenseRow(item) {
  return {
    id: item.id,
    name: String(item.name || "").trim(),
    category: item.category || "Other",
    amount: safeNumber(item.amount)
  };
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value || 0);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getCss(name) {
  return getComputedStyle(document.body).getPropertyValue(name);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
