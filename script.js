(function () {
  "use strict";

  const fieldConfig = {
    principal: {
      label: "贷款金额",
      input: document.querySelector("#principal"),
      kind: "money",
      min: 0,
    },
    annualRate: {
      label: "年利率",
      input: document.querySelector("#annualRate"),
      kind: "rate",
      min: 0,
      allowZero: true,
    },
    monthlyPayment: {
      label: "月供",
      input: document.querySelector("#monthlyPayment"),
      kind: "money",
      min: 0,
    },
    months: {
      label: "还款月数",
      input: document.querySelector("#months"),
      kind: "months",
      min: 0,
    },
  };

  const form = document.querySelector("#loanForm");
  const helperText = document.querySelector("#helperText");
  const answerLabel = document.querySelector("#answerLabel");
  const answerValue = document.querySelector("#answerValue");
  const totalPaymentEl = document.querySelector("#totalPayment");
  const totalInterestEl = document.querySelector("#totalInterest");
  const monthlyRateEl = document.querySelector("#monthlyRate");
  const principalBar = document.querySelector("#principalBar");
  const interestBar = document.querySelector("#interestBar");
  const resultNote = document.querySelector("#resultNote");
  const sampleButton = document.querySelector("#sampleButton");
  const clearButton = document.querySelector("#clearButton");

  const moneyFormatter = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const numberFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  function parseInput(rawValue, kind) {
    const raw = rawValue.trim();
    if (!raw) return null;

    const hasWan = /万/.test(raw);
    const hasYear = /年/.test(raw);
    const normalized = raw
      .replace(/,/g, "")
      .replace(/，/g, "")
      .replace(/%/g, "")
      .replace(/元/g, "")
      .replace(/月/g, "")
      .replace(/个/g, "")
      .replace(/期/g, "")
      .replace(/年/g, "")
      .replace(/万/g, "")
      .replace(/\s/g, "");

    if (!normalized || normalized === "." || normalized === "-") {
      return Number.NaN;
    }

    let value = Number(normalized);
    if (!Number.isFinite(value)) return Number.NaN;
    if (kind === "money" && hasWan) value *= 10000;
    if (kind === "months" && hasYear) value *= 12;
    return value;
  }

  function formatEditable(value, kind) {
    if (!Number.isFinite(value)) return "";
    if (kind === "money") return numberFormatter.format(roundTo(value, 2));
    if (kind === "rate") return trimZeros(value, 6);
    if (kind === "months") {
      return isNearlyInteger(value) ? String(Math.round(value)) : trimZeros(value, 2);
    }
    return String(value);
  }

  function formatAnswer(key, value) {
    if (key === "principal" || key === "monthlyPayment") return moneyFormatter.format(value);
    if (key === "annualRate") return `${trimZeros(value, 6)}%`;
    if (key === "months") {
      if (isNearlyInteger(value)) return `${Math.round(value)} 期`;
      return `${trimZeros(value, 2)} 期`;
    }
    return String(value);
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "--";
    return moneyFormatter.format(value);
  }

  function trimZeros(value, maxDigits) {
    return Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDigits,
    });
  }

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function isNearlyInteger(value) {
    return Math.abs(value - Math.round(value)) < 1e-7;
  }

  function paymentFromTerms(principal, monthlyRate, months) {
    if (monthlyRate === 0) return principal / months;
    const discount = 1 - Math.pow(1 + monthlyRate, -months);
    return (principal * monthlyRate) / discount;
  }

  function principalFromTerms(monthlyPayment, monthlyRate, months) {
    if (monthlyRate === 0) return monthlyPayment * months;
    const discount = 1 - Math.pow(1 + monthlyRate, -months);
    return (monthlyPayment * discount) / monthlyRate;
  }

  function monthsFromTerms(principal, annualRate, monthlyPayment) {
    const monthlyRate = annualRate / 100 / 12;
    if (monthlyRate === 0) return principal / monthlyPayment;

    const monthlyInterest = principal * monthlyRate;
    if (monthlyPayment <= monthlyInterest) {
      throw new Error("月供需要大于首月利息，否则本金不会下降。");
    }

    const ratio = 1 - monthlyInterest / monthlyPayment;
    return -Math.log(ratio) / Math.log(1 + monthlyRate);
  }

  function annualRateFromTerms(principal, monthlyPayment, months) {
    const zeroRatePayment = principal / months;
    if (Math.abs(monthlyPayment - zeroRatePayment) < 0.000001) return 0;
    if (monthlyPayment < zeroRatePayment) {
      throw new Error("月供低于 0 利率下的分摊金额，无法反推出非负年利率。");
    }

    let low = 0;
    let high = 0.01;
    while (paymentFromTerms(principal, high, months) < monthlyPayment && high < 100) {
      high *= 2;
    }

    if (high >= 100) {
      throw new Error("这组数字需要异常高的利率，无法稳定计算。");
    }

    for (let i = 0; i < 120; i += 1) {
      const mid = (low + high) / 2;
      if (paymentFromTerms(principal, mid, months) < monthlyPayment) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return ((low + high) / 2) * 12 * 100;
  }

  function readValues() {
    const values = {};
    const missing = [];
    const errors = [];

    Object.entries(fieldConfig).forEach(([key, config]) => {
      const rawValue = config.input.value;
      const parsed = parseInput(rawValue, config.kind);
      const wrapper = document.querySelector(`.field[data-key="${key}"]`);
      wrapper.classList.remove("is-missing", "has-error");

      if (parsed === null) {
        missing.push(key);
        wrapper.classList.add("is-missing");
        return;
      }

      if (!Number.isFinite(parsed)) {
        errors.push(`${config.label}不是有效数字。`);
        wrapper.classList.add("has-error");
        return;
      }

      const belowMinimum = config.allowZero ? parsed < config.min : parsed <= config.min;
      if (belowMinimum) {
        const compareText = config.allowZero ? `不小于 ${config.min}` : "大于 0";
        errors.push(`${config.label}需要${compareText}。`);
        wrapper.classList.add("has-error");
        return;
      }

      values[key] = parsed;
    });

    return { values, missing, errors };
  }

  function calculate(values, missingKey) {
    const next = { ...values };

    if (missingKey === "monthlyPayment") {
      next.monthlyPayment = paymentFromTerms(
        next.principal,
        next.annualRate / 100 / 12,
        next.months
      );
    }

    if (missingKey === "principal") {
      next.principal = principalFromTerms(
        next.monthlyPayment,
        next.annualRate / 100 / 12,
        next.months
      );
    }

    if (missingKey === "annualRate") {
      next.annualRate = annualRateFromTerms(next.principal, next.monthlyPayment, next.months);
    }

    if (missingKey === "months") {
      next.months = monthsFromTerms(next.principal, next.annualRate, next.monthlyPayment);
    }

    return next;
  }

  function renderResult(values, missingKey) {
    const monthlyRate = values.annualRate / 100 / 12;
    const exactMonths = values.months;
    const totalPayment = values.monthlyPayment * exactMonths;
    const totalInterest = totalPayment - values.principal;
    const principalShare = Math.max(0, Math.min(100, (values.principal / totalPayment) * 100));
    const interestShare = Math.max(0, 100 - principalShare);

    fieldConfig[missingKey].input.value = formatEditable(values[missingKey], fieldConfig[missingKey].kind);

    answerLabel.textContent = fieldConfig[missingKey].label;
    answerValue.textContent = formatAnswer(missingKey, values[missingKey]);
    totalPaymentEl.textContent = formatMoney(totalPayment);
    totalInterestEl.textContent = formatMoney(totalInterest);
    monthlyRateEl.textContent = `${trimZeros(monthlyRate * 100, 6)}%`;
    principalBar.style.width = `${principalShare}%`;
    interestBar.style.width = `${interestShare}%`;

    const interestRatio = totalInterest > 0 ? `利息约占总还款 ${trimZeros(interestShare, 2)}%。` : "这组条件下没有利息成本。";
    if (missingKey === "months" && !isNearlyInteger(exactMonths)) {
      resultNote.textContent = `${interestRatio} 还款月数为公式精确值，实际排期通常按 ${Math.ceil(exactMonths)} 期处理，最后一期会调整。`;
    } else {
      resultNote.textContent = interestRatio;
    }

    helperText.className = "helper-text";
    helperText.textContent = `已反推出${fieldConfig[missingKey].label}。`;
  }

  function showError(message, className = "is-error") {
    helperText.className = `helper-text ${className}`;
    helperText.textContent = message;
  }

  function resetResult() {
    answerLabel.textContent = "缺失项";
    answerValue.textContent = "--";
    totalPaymentEl.textContent = "--";
    totalInterestEl.textContent = "--";
    monthlyRateEl.textContent = "--";
    principalBar.style.width = "0";
    interestBar.style.width = "0";
    resultNote.textContent = "计算完成后会显示本金与利息占比。";
  }

  function handleSubmit(event) {
    event.preventDefault();

    const { values, missing, errors } = readValues();
    resetResult();

    if (errors.length > 0) {
      showError(errors[0]);
      return;
    }

    if (missing.length !== 1) {
      const message = missing.length === 0
        ? "请清空一个字段，让计算器知道要反推哪一项。"
        : "请只留空一个字段，并填好另外三项。";
      showError(message, missing.length === 0 ? "is-warning" : "is-error");
      return;
    }

    try {
      const completedValues = calculate(values, missing[0]);
      renderResult(completedValues, missing[0]);
    } catch (error) {
      showError(error.message);
    }
  }

  function updateMissingHint() {
    const missingLabels = Object.entries(fieldConfig)
      .filter(([, config]) => config.input.value.trim() === "")
      .map(([, config]) => config.label);

    Object.entries(fieldConfig).forEach(([key, config]) => {
      const wrapper = document.querySelector(`.field[data-key="${key}"]`);
      wrapper.classList.toggle("is-missing", config.input.value.trim() === "");
      wrapper.classList.remove("has-error");
    });

    if (missingLabels.length === 1) {
      helperText.className = "helper-text";
      helperText.textContent = `将反推：${missingLabels[0]}。`;
      return;
    }

    if (missingLabels.length === 0) {
      helperText.className = "helper-text is-warning";
      helperText.textContent = "请清空一个字段。";
      return;
    }

    helperText.className = "helper-text";
    helperText.textContent = "请填好任意三项，留空一项。";
  }

  form.addEventListener("submit", handleSubmit);

  Object.values(fieldConfig).forEach((config) => {
    config.input.addEventListener("input", updateMissingHint);
  });

  sampleButton.addEventListener("click", () => {
    fieldConfig.principal.input.value = "100万";
    fieldConfig.annualRate.input.value = "4.2";
    fieldConfig.months.input.value = "360";
    fieldConfig.monthlyPayment.input.value = "";
    updateMissingHint();
    resetResult();
    fieldConfig.monthlyPayment.input.focus();
  });

  clearButton.addEventListener("click", () => {
    Object.values(fieldConfig).forEach((config) => {
      config.input.value = "";
    });
    updateMissingHint();
    resetResult();
    fieldConfig.principal.input.focus();
  });

  updateMissingHint();
})();
