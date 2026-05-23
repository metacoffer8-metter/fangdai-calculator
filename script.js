(function () {
  "use strict";

  const ordersRoot = document.querySelector("#orders");
  const orderResultsRoot = document.querySelector("#orderResults");
  const emptyState = document.querySelector("#emptyState");
  const summaryRate = document.querySelector("#summaryRate");
  const summaryHint = document.querySelector("#summaryHint");
  const summaryTier = document.querySelector("#summaryTier");
  const summaryOutflow = document.querySelector("#summaryOutflow");
  const summaryInflow = document.querySelector("#summaryInflow");
  const summaryProfit = document.querySelector("#summaryProfit");
  const summaryPayback = document.querySelector("#summaryPayback");
  const summaryCount = document.querySelector("#summaryCount");
  const statusText = document.querySelector("#statusText");
  const addOrderButton = document.querySelector("#addOrderButton");
  const fillDemoButton = document.querySelector("#fillDemoButton");
  const clearButton = document.querySelector("#clearButton");
  const calculateButton = document.querySelector("#calculateButton");

  const moneyFormatter = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const percentFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const state = {
    orders: [],
    nextOrderId: 1,
  };

  function createOrder(seed = {}) {
    const order = {
      id: seed.id || `order-${state.nextOrderId++}`,
      name: seed.name || `订单 ${state.nextOrderId - 1}`,
      outflows: seed.outflows || [
        {
          type: "",
          date: seed.startDate || "",
          amount: seed.amount || "",
          note: "",
        },
      ],
      inflows: seed.inflows || [
        {
          type: "",
          date: seed.endDate || "",
          amount: seed.returnAmount || "",
          note: "",
        },
      ],
      extras: seed.extras || [],
    };
    state.orders.push(order);
    return order;
  }

  function cloneCashflow(flow) {
    return {
      type: flow.type || "",
      date: flow.date || "",
      amount: flow.amount || "",
      note: flow.note || "",
      direction: flow.direction || "in",
    };
  }

  function moneyInputValue(value) {
    return value === "" || value === null || value === undefined ? "" : String(value);
  }

  function parseAmount(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const normalized = text.replace(/,/g, "").replace(/元/g, "").replace(/\s/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : Number.NaN;
  }

  function parseDate(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const value = new Date(text);
    return Number.isNaN(value.getTime()) ? Number.NaN : value;
  }

  function formatDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "--";
    return dateFormatter.format(value);
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "--";
    return moneyFormatter.format(value);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "--";
    return `${percentFormatter.format(value)}%`;
  }

  function isBlankRow(row) {
    return !String(row.type || "").trim()
      && !String(row.date || "").trim()
      && !String(row.amount || "").trim()
      && !String(row.note || "").trim();
  }

  function rowHasAnyValue(row) {
    return Boolean(
      String(row.type || "").trim()
      || String(row.date || "").trim()
      || String(row.amount || "").trim()
      || String(row.note || "").trim()
    );
  }

  function updateSummary(orderCount = state.orders.length) {
    summaryCount.textContent = String(orderCount);
    if (orderCount === 0) {
      summaryRate.textContent = "--";
      summaryTier.textContent = "--";
      summaryOutflow.textContent = "--";
      summaryInflow.textContent = "--";
      summaryProfit.textContent = "--";
      summaryPayback.textContent = "--";
      summaryHint.textContent = "录入至少一笔支出和回款后即可测算。";
      emptyState.style.display = "block";
      orderResultsRoot.innerHTML = "";
      return;
    }
  }

  function addCashflowRow(orderId, bucket, seed = {}) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return null;
    const list = order[bucket];
    const row = cloneCashflow(seed);
    list.push(row);
    render();
    return row;
  }

  function removeCashflowRow(orderId, bucket, index) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return;
    const list = order[bucket];
    if (list.length <= 1) return;
    list.splice(index, 1);
    render();
  }

  function removeOrder(orderId) {
    const index = state.orders.findIndex((item) => item.id === orderId);
    if (index >= 0) {
      state.orders.splice(index, 1);
      render();
    }
  }

  function xnpv(rate, cashflows) {
    const origin = cashflows[0].date.getTime();
    return cashflows.reduce((sum, flow) => {
      const years = (flow.date.getTime() - origin) / (1000 * 60 * 60 * 24 * 365);
      return sum + flow.amount / Math.pow(1 + rate, years);
    }, 0);
  }

  function xirr(cashflows) {
    const flows = cashflows
      .filter((flow) => Number.isFinite(flow.amount) && flow.amount !== 0 && flow.date instanceof Date)
      .sort((a, b) => a.date - b.date);

    if (flows.length < 2) {
      throw new Error("至少需要一笔支出和一笔回款。");
    }

    const hasNegative = flows.some((flow) => flow.amount < 0);
    const hasPositive = flows.some((flow) => flow.amount > 0);
    if (!hasNegative || !hasPositive) {
      throw new Error("现金流必须同时包含支出和回款。");
    }

    let low = -0.9999;
    let high = 1;
    let npvLow = xnpv(low, flows);
    let npvHigh = xnpv(high, flows);

    let attempts = 0;
    while (npvLow * npvHigh > 0 && attempts < 60) {
      high *= 2;
      npvHigh = xnpv(high, flows);
      attempts += 1;
      if (high > 1000) break;
    }

    if (npvLow * npvHigh > 0) {
      throw new Error("这组现金流无法稳定求出年化收益率，请检查日期和金额方向。");
    }

    for (let i = 0; i < 120; i += 1) {
      const mid = (low + high) / 2;
      const npvMid = xnpv(mid, flows);
      if (Math.abs(npvMid) < 1e-9) return mid;
      if (npvLow * npvMid <= 0) {
        high = mid;
        npvHigh = npvMid;
      } else {
        low = mid;
        npvLow = npvMid;
      }
    }

    return (low + high) / 2;
  }

  function tierFromRate(rate) {
    if (!Number.isFinite(rate)) return "--";
    if (rate >= 40) return "19配资";
    if (rate >= 30) return "28配资";
    return "55配资";
  }

  function rateRuleText(rate) {
    if (!Number.isFinite(rate)) return "";
    if (rate >= 40) return "适合 19 配资档位";
    if (rate >= 30) return "适合 28 配资档位";
    return "适合 55 配资档位";
  }

  function getOrderCashflows(order) {
    const flows = [];
    const errors = [];

    const buckets = [
      { key: "outflows", sign: -1, label: "支出" },
      { key: "inflows", sign: 1, label: "回款" },
      { key: "extras", sign: 1, label: "额外现金流" },
    ];

    buckets.forEach(({ key, sign, label }) => {
      order[key].forEach((row, index) => {
        const amount = parseAmount(row.amount);
        const date = parseDate(row.date);
        const note = String(row.note || "").trim();
        const type = String(row.type || "").trim() || label;

        if (!rowHasAnyValue(row)) return;

        if (amount === null || date === null) {
          errors.push(`${order.name} 的 ${label} ${index + 1} 还没填完整。`);
          return;
        }

        if (!Number.isFinite(amount)) {
          errors.push(`${order.name} 的 ${label} ${index + 1} 金额不是有效数字。`);
          return;
        }

        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
          errors.push(`${order.name} 的 ${label} ${index + 1} 日期不是有效日期。`);
          return;
        }

        const directionSign = key === "extras"
          ? (String(row.direction || "in") === "out" ? -1 : 1)
          : sign;

        flows.push({
          amount: directionSign * amount,
          date,
          type,
          note,
        });
      });
    });

    return { flows, errors };
  }

  function summarizeOrder(order) {
    const allRows = [...order.outflows, ...order.inflows, ...order.extras];
    if (allRows.every(isBlankRow)) {
      return { draft: true };
    }

    const { flows, errors } = getOrderCashflows(order);
    if (errors.length > 0) return { errors };
    if (flows.length < 2) {
      return { errors: [`${order.name} 至少需要一笔支出和一笔回款。`] };
    }

    const negativeTotal = flows.filter((flow) => flow.amount < 0).reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
    const positiveTotal = flows.filter((flow) => flow.amount > 0).reduce((sum, flow) => sum + flow.amount, 0);
    const profit = positiveTotal - negativeTotal;
    const rate = xirr(flows) * 100;

    const sortedFlows = flows.slice().sort((a, b) => a.date - b.date);
    let cumulative = 0;
    let paybackDate = null;
    for (const flow of sortedFlows) {
      cumulative += flow.amount;
      if (cumulative >= 0) {
        paybackDate = flow.date;
        break;
      }
    }

    return {
      rate,
      tier: tierFromRate(rate),
      rule: rateRuleText(rate),
      outflow: negativeTotal,
      inflow: positiveTotal,
      profit,
      paybackDate,
      flows,
    };
  }

  function aggregateOrders(results) {
    const allFlows = [];
    let outflow = 0;
    let inflow = 0;
    let profit = 0;
    let orderCount = 0;

    results.forEach((result) => {
      if (result.errors || result.draft) return;
      orderCount += 1;
      outflow += result.outflow;
      inflow += result.inflow;
      profit += result.profit;
      result.flows.forEach((flow) => allFlows.push(flow));
    });

    if (allFlows.length < 2) {
      return {
        orderCount,
        outflow,
        inflow,
        profit,
        rate: NaN,
        tier: "--",
        paybackDate: null,
      };
    }

    try {
      const rate = xirr(allFlows) * 100;
      let cumulative = 0;
      let paybackDate = null;
      const sorted = allFlows.slice().sort((a, b) => a.date - b.date);
      for (const flow of sorted) {
        cumulative += flow.amount;
        if (cumulative >= 0) {
          paybackDate = flow.date;
          break;
        }
      }
      return {
        orderCount,
        outflow,
        inflow,
        profit,
        rate,
        tier: tierFromRate(rate),
        paybackDate,
      };
    } catch (error) {
      return {
        orderCount,
        outflow,
        inflow,
        profit,
        rate: NaN,
        tier: "--",
        paybackDate: null,
        aggregateError: error.message,
      };
    }
  }

  function renderCashflowInputs(order, bucket, title, hint, sign) {
    const rows = order[bucket]
      .map((row, index) => {
        const rowId = `${order.id}-${bucket}-${index}`;
        return `
          <div class="cashflow-row" data-row-id="${rowId}">
            <div class="row-topline">
              <span>${title}</span>
              <button type="button" class="mini-button" data-action="remove-row" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}">删除</button>
            </div>
            <div class="row-grid">
              <label>
                <span>类型</span>
                <input data-bind="type" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}" value="${escapeHtml(row.type)}" placeholder="${title}">
              </label>
              <label>
                <span>日期</span>
                <input data-bind="date" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}" type="date" value="${escapeHtml(row.date)}">
              </label>
              <label>
                <span>${sign > 0 ? "回款金额" : "支出金额"}</span>
                <input data-bind="amount" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}" inputmode="decimal" value="${escapeHtml(moneyInputValue(row.amount))}" placeholder="0.00">
              </label>
              <label class="wide">
                <span>备注</span>
                <input data-bind="note" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}" value="${escapeHtml(row.note)}" placeholder="${hint}">
              </label>
              ${
                bucket === "extras"
                  ? `
                    <label>
                      <span>方向</span>
                      <select data-bind="direction" data-order-id="${order.id}" data-bucket="${bucket}" data-index="${index}">
                        <option value="in" ${String(row.direction || "in") === "in" ? "selected" : ""}>收入</option>
                        <option value="out" ${String(row.direction || "in") === "out" ? "selected" : ""}>支出</option>
                      </select>
                    </label>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <section class="cashflow-group">
        <div class="group-head">
          <div>
            <p class="group-label">${title}</p>
            <p class="group-hint">${hint}</p>
          </div>
          <button type="button" class="ghost small" data-action="add-row" data-order-id="${order.id}" data-bucket="${bucket}">新增一行</button>
        </div>
        <div class="cashflow-stack">${rows}</div>
      </section>
    `;
  }

  function renderOrder(order) {
    return `
      <article class="order-card" data-order-id="${order.id}">
        <div class="order-head">
          <div>
            <p class="order-label">订单</p>
            <input class="order-name" data-bind="order-name" data-order-id="${order.id}" value="${escapeHtml(order.name)}" placeholder="订单名称">
          </div>
          <button type="button" class="ghost danger small" data-action="remove-order" data-order-id="${order.id}">删除订单</button>
        </div>
        ${renderCashflowInputs(order, "outflows", "配资支出", "录入你的配资投入、装修款、垫付成本等支出", -1)}
        ${renderCashflowInputs(order, "inflows", "租金回款", "录入租金到账日期，支持三个月一付、季度回款等", 1)}
        ${renderCashflowInputs(order, "extras", "额外现金流", "录入维修追偿、押金返还、违约金、民宿收益等", 1)}
        <div class="order-result" data-order-result="${order.id}">
          <span class="order-result-label">订单真实收益率</span>
          <strong data-order-rate="${order.id}">--</strong>
          <span data-order-rule="${order.id}">等待计算</span>
        </div>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function render() {
    if (state.orders.length === 0) {
      ordersRoot.innerHTML = "";
      emptyState.style.display = "block";
      updateSummary(0);
      return;
    }

    ordersRoot.innerHTML = state.orders.map(renderOrder).join("");

    const results = [];
    const errorMessages = [];

    state.orders.forEach((order) => {
      const result = summarizeOrder(order);
      results.push(result);
      const rateNode = document.querySelector(`[data-order-rate="${order.id}"]`);
      const ruleNode = document.querySelector(`[data-order-rule="${order.id}"]`);
      if (result.draft) {
        rateNode.textContent = "--";
        ruleNode.textContent = "填写支出和回款后计算";
        return;
      }
      if (result.errors) {
        rateNode.textContent = "--";
        ruleNode.textContent = result.errors[0];
        errorMessages.push(result.errors[0]);
      } else {
        rateNode.textContent = formatPercent(result.rate);
        ruleNode.textContent = `${result.tier} · ${result.rule}`;
      }
    });

    const aggregate = aggregateOrders(results);
    if (aggregate.aggregateError) {
      summaryRate.textContent = "--";
      summaryHint.textContent = aggregate.aggregateError;
      summaryTier.textContent = "--";
    } else {
      summaryRate.textContent = formatPercent(aggregate.rate);
      summaryTier.textContent = aggregate.tier;
      summaryHint.textContent = aggregate.rate >= 40
        ? "项目收益率足以覆盖 19 配资档位。"
        : aggregate.rate >= 30
          ? "项目收益率落在 28 配资档位。"
          : "项目收益率低于 30%，对应 55 配资档位。";
    }
    summaryOutflow.textContent = formatMoney(aggregate.outflow);
    summaryInflow.textContent = formatMoney(aggregate.inflow);
    summaryProfit.textContent = formatMoney(aggregate.profit);
    summaryPayback.textContent = aggregate.paybackDate ? formatDate(aggregate.paybackDate) : "--";
    summaryCount.textContent = String(aggregate.orderCount);
    statusText.textContent = errorMessages.length > 0 ? errorMessages[0] : "录入完成后点击测算即可汇总全部订单。";

    orderResultsRoot.innerHTML = results
      .map((result, index) => {
        const order = state.orders[index];
        if (result.errors) {
          return `
            <div class="result-item error">
              <div>
                <p>${escapeHtml(order.name)}</p>
                <strong>无法计算</strong>
              </div>
              <span>${escapeHtml(result.errors[0])}</span>
            </div>
          `;
        }
        return `
          <div class="result-item">
            <div>
              <p>${escapeHtml(order.name)}</p>
              <strong>${formatPercent(result.rate)}</strong>
            </div>
            <span>${result.tier} · 回本 ${result.paybackDate ? formatDate(result.paybackDate) : '--'}</span>
          </div>
        `;
      })
      .join("");

    const hasComputedOrder = results.some((result) => !result.errors && !result.draft);
    emptyState.style.display = hasComputedOrder ? "none" : "block";
    if (!hasComputedOrder) {
      summaryRate.textContent = "--";
      summaryTier.textContent = "--";
      summaryOutflow.textContent = "--";
      summaryInflow.textContent = "--";
      summaryProfit.textContent = "--";
      summaryPayback.textContent = "--";
      summaryHint.textContent = "填写至少一笔支出和一笔回款后即可测算。";
    }
  }

  function bindEvents() {
    addOrderButton.addEventListener("click", () => {
      createOrder({
        name: `订单 ${state.orders.length + 1}`,
      });
      render();
    });

    fillDemoButton.addEventListener("click", () => {
      state.orders = [];
      state.nextOrderId = 1;
      createOrder({
        name: "样例订单 A",
        startDate: "2026-01-10",
        amount: 120000,
        endDate: "2026-04-10",
        returnAmount: 132000,
        outflows: [
          { type: "首期配资", date: "2026-01-10", amount: 120000, note: "首次配资投入" },
          { type: "维修垫付", date: "2026-02-15", amount: 8000, note: "中途维修" },
        ],
        inflows: [
          { type: "三个月租金", date: "2026-04-10", amount: 135000, note: "客户三个月一付" },
        ],
        extras: [
          { type: "押金返还", date: "2026-04-11", amount: 20000, note: "押金退回" },
        ],
      });
      createOrder({
        name: "样例订单 B",
        outflows: [
          { type: "配资投入", date: "2026-02-01", amount: 90000, note: "第二套房源" },
        ],
        inflows: [
          { type: "首笔回款", date: "2026-05-01", amount: 98000, note: "季度收租" },
          { type: "二笔回款", date: "2026-08-01", amount: 102000, note: "续租上调" },
        ],
        extras: [
          { type: "违约金", date: "2026-06-12", amount: 6000, note: "提前解约补偿" },
        ],
      });
      render();
    });

    clearButton.addEventListener("click", () => {
      state.orders = [];
      state.nextOrderId = 1;
      render();
    });

    calculateButton.addEventListener("click", () => {
      render();
      if (state.orders.length > 0) {
        document.querySelector(".summary-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    ordersRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action) return;

      if (action === "add-row") {
        addCashflowRow(target.dataset.orderId, target.dataset.bucket, {
          type: "",
          date: "",
          amount: "",
          note: "",
        });
      }

      if (action === "remove-row") {
        removeCashflowRow(target.dataset.orderId, target.dataset.bucket, Number(target.dataset.index));
      }

      if (action === "remove-order") {
        removeOrder(target.dataset.orderId);
      }
    });

    const syncField = (target) => {
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const order = state.orders.find((item) => item.id === target.dataset.orderId);
      if (!order) return;

      if (target.dataset.bind === "order-name") {
        order.name = target.value;
        return;
      }

      const bucket = target.dataset.bucket;
      const index = Number(target.dataset.index);
      const row = order[bucket]?.[index];
      if (!row) return;

      row[target.dataset.bind] = target.value;
    };

    ordersRoot.addEventListener("input", (event) => {
      const target = event.target;
      syncField(target);
    });

    ordersRoot.addEventListener("change", (event) => {
      const target = event.target;
      syncField(target);
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
        render();
      }
    });
  }

  function initialize() {
    bindEvents();
    render();
  }

  initialize();
})();
