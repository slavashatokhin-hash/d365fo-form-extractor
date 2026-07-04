// Injected into the active tab via chrome.scripting.executeScript.
// Must be self-contained (no closures over outer variables).
// Exposes window.__d365foScanForm(options) -> Promise<ScanResult>
// options: { deep: boolean, walkTabs: boolean }

function scanD365FOFormFactory() {
  function cleanText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  // D365FO's vertical tab/pivot control keeps every tab's panel mounted in the DOM at
  // once (hidden via CSS, not removed), so querying the whole document for controls
  // returns the same set regardless of which tab is active unless we filter to what's
  // actually visible/rendered right now.
  function isVisible(el) {
    return !!el.offsetParent || el.getClientRects().length > 0;
  }

  // ---------- label / static help text ----------

  function findLabelFor(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl && cleanText(lbl.textContent)) return { text: cleanText(lbl.textContent), node: lbl };
    }
    if (el.getAttribute("aria-label")) {
      return { text: cleanText(el.getAttribute("aria-label")), node: el };
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const nodes = labelledBy.split(" ").map((id) => document.getElementById(id)).filter(Boolean);
      const text = nodes.map((n) => cleanText(n.textContent)).filter(Boolean).join(" ");
      if (text) return { text, node: nodes[0] };
    }
    let node = el.closest("[data-dyn-role='Field'], .field-container, .form-group, [data-dyn-controlname]");
    for (let i = 0; i < 4 && node; i++) {
      const labelNode = node.querySelector("label, .dyn-headerLabel, .field-label, [data-dyn-role='Label']");
      if (labelNode && labelNode !== el) {
        const t = cleanText(labelNode.textContent);
        if (t) return { text: t, node: labelNode };
      }
      node = node.parentElement ? node.parentElement.closest("[data-dyn-role='Field'], .field-container, .form-group") : null;
    }
    return { text: "", node: null };
  }

  function findHelpTextStatic(el) {
    if (el.title && cleanText(el.title)) return cleanText(el.title);
    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy) {
      const text = describedBy.split(" ").map((id) => document.getElementById(id)).filter(Boolean)
        .map((n) => cleanText(n.textContent)).filter(Boolean).join(" ");
      if (text) return text;
    }
    const wrapper = el.closest("[data-dyn-controlname]");
    if (wrapper && wrapper !== el && wrapper.title && cleanText(wrapper.title)) return cleanText(wrapper.title);
    const container = el.closest(".field-container, .form-group, [data-dyn-role='Field']");
    if (container) {
      const infoIcon = container.querySelector(
        "[data-dyn-role='InfoTip'], .fieldInfoIcon, .dyn-infoTip, [title]:not([data-dyn-controlname])"
      );
      if (infoIcon && infoIcon !== el) {
        const t = cleanText(infoIcon.getAttribute("title") || infoIcon.getAttribute("aria-label"));
        if (t) return t;
      }
    }
    return "";
  }

  // ---------- hover-triggered tooltip help text ----------

  function getVisibleStyleTooltipDivs() {
    return Array.from(document.querySelectorAll('div[style*="visibility"]')).filter((n) => {
      const style = n.getAttribute("style") || "";
      return /visibility:\s*visible/i.test(style) && /display:\s*block/i.test(style) && n.children.length === 0;
    });
  }

  function getFluentTooltipNodes() {
    const tipSelectors = ['[role="tooltip"]', ".ms-Tooltip-content", ".ms-Tooltip", '[class*="fui-Tooltip"]'];
    const nodes = [];
    tipSelectors.forEach((sel) => nodes.push(...document.querySelectorAll(sel)));
    return nodes.filter((n) => cleanText(n.textContent) && n.getBoundingClientRect().width > 0);
  }

  function revealHoverHelp(target, waitMs) {
    return new Promise((resolve) => {
      if (!target) return resolve("");
      const before = new Set(getVisibleStyleTooltipDivs());
      const rect = target.getBoundingClientRect();
      const pos = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: window };
      try {
        target.dispatchEvent(new PointerEvent("pointerover", pos));
        target.dispatchEvent(new PointerEvent("pointerenter", pos));
      } catch (e) {}
      target.dispatchEvent(new MouseEvent("mouseover", pos));
      target.dispatchEvent(new MouseEvent("mouseenter", pos));
      target.dispatchEvent(new MouseEvent("mousemove", pos));
      target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

      setTimeout(() => {
        let text = "";
        const after = getVisibleStyleTooltipDivs().filter((n) => !before.has(n));
        if (after.length) {
          const best = after.sort((a, b) => cleanText(b.textContent).length - cleanText(a.textContent).length)[0];
          text = cleanText(best.textContent);
        }
        if (!text) {
          const fluent = getFluentTooltipNodes();
          if (fluent.length) text = cleanText(fluent[0].textContent);
        }
        try {
          target.dispatchEvent(new PointerEvent("pointerout", pos));
          target.dispatchEvent(new PointerEvent("pointerleave", pos));
        } catch (e) {}
        target.dispatchEvent(new MouseEvent("mouseout", pos));
        target.dispatchEvent(new MouseEvent("mouseleave", pos));
        target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        resolve(text);
      }, waitMs);
    });
  }

  // ---------- tab strip detection / walking ----------

  function getTabHeaderElements() {
    const selectorGroups = [
      '[role="tablist"] [role="tab"]',
      '[data-dyn-role="TabHeader"]',
      '[data-dyn-role="NavPage"] [role="tab"]',
    ];
    for (const sel of selectorGroups) {
      const nodes = Array.from(document.querySelectorAll(sel)).filter((n) => cleanText(n.textContent));
      if (nodes.length > 1) return nodes;
    }
    return [];
  }

  function getActiveTabHeader(tabs) {
    return tabs.find((t) => t.getAttribute("aria-selected") === "true" || /active|selected/i.test(t.className)) || tabs[0];
  }

  function waitForStableDom(maxWaitMs, quietMs) {
    return new Promise((resolve) => {
      let quietTimer;
      const hardStop = setTimeout(finish, maxWaitMs);
      const obs = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      function finish() {
        clearTimeout(quietTimer);
        clearTimeout(hardStop);
        obs.disconnect();
        resolve();
      }
      quietTimer = setTimeout(finish, quietMs);
    });
  }

  // ---------- field collection for whatever is currently in the DOM ----------

  function collectFieldsFromDom() {
    const controls = Array.from(document.querySelectorAll("[data-dyn-controlname]")).filter(isVisible);
    const fields = [];
    controls.forEach((el) => {
      const controlName = el.getAttribute("data-dyn-controlname");
      if (!controlName) return;
      const role = el.getAttribute("data-dyn-role") || "";
      if (["Group", "Tab", "TabPage", "FormRoot", "Section"].includes(role)) return;
      const { text: label, node: labelNode } = findLabelFor(el);
      const helpText = findHelpTextStatic(el);
      if (!label && !helpText) return;
      fields.push({ el, labelNode, controlName, role, label, helpText, helpSource: helpText ? "dom" : "" });
    });
    return fields;
  }

  async function hoverFillHelpText(fields) {
    const targets = fields.filter((f) => !f.helpText);
    for (const f of targets) {
      const hoverTarget = f.labelNode || f.el;
      const text = await revealHoverHelp(hoverTarget, 500);
      if (text && text !== f.label) {
        f.helpText = text;
        f.helpSource = "hover";
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  function getFormName() {
    const formEl = document.querySelector("[data-dyn-formname]");
    return formEl ? formEl.getAttribute("data-dyn-formname") : (document.title || "");
  }

  function dedupeKey(tabName, controlName, id) {
    return `${tabName || ""}|${controlName}|${id || ""}`;
  }

  // ---------- main entry point ----------

  async function scanD365FOForm(options) {
    const opts = options || {};
    const deep = !!opts.deep;
    const walkTabs = !!opts.walkTabs;

    const formName = cleanText(getFormName());
    const seen = new Set();
    const allFields = [];
    let tabsFound = [];
    let tabsScanned = 0;

    function addFields(fields, tabName) {
      fields.forEach((f) => {
        const key = dedupeKey(tabName, f.controlName, f.el && f.el.id);
        if (seen.has(key)) return;
        seen.add(key);
        const { el, labelNode, ...rest } = f;
        allFields.push({ ...rest, tab: tabName || "" });
      });
    }

    const tabs = walkTabs ? getTabHeaderElements() : [];

    if (tabs.length > 1) {
      tabsFound = tabs.map((t) => cleanText(t.textContent));
      const originalActive = getActiveTabHeader(tabs);

      for (const tabEl of tabs) {
        tabEl.click();
        await waitForStableDom(1200, 250);
        const tabName = cleanText(tabEl.textContent);
        const fields = collectFieldsFromDom();
        if (deep) await hoverFillHelpText(fields);
        addFields(fields, tabName);
        tabsScanned++;
      }

      if (originalActive) {
        originalActive.click();
        await waitForStableDom(800, 200);
      }
    } else {
      const fields = collectFieldsFromDom();
      if (deep) await hoverFillHelpText(fields);
      addFields(fields, "");
    }

    return {
      formName,
      url: window.location.href,
      scannedAt: new Date().toISOString(),
      deep,
      walkTabs,
      tabsFound,
      tabsScanned,
      fields: allFields,
    };
  }

  return scanD365FOForm;
}

window.__d365foScanForm = scanD365FOFormFactory();

// ---------- granular API: lets the popup interleave chrome.tabs.captureVisibleTab
// between tab switches, since screenshot capture is only available outside the page. ----------
(function setupGranularApi() {
  const factory = scanD365FOFormFactory;
  // Re-run the factory body just to get access to its private helpers via closures below.
  // We rebuild the needed helpers directly here instead, kept intentionally small.

  function cleanText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    return !!el.offsetParent || el.getClientRects().length > 0;
  }

  window.__d365foGetTabHeaders = function () {
    // Reuses the same detection selectors as the main scanner.
    const selectorGroups = [
      '[role="tablist"] [role="tab"]',
      '[data-dyn-role="TabHeader"]',
      '[data-dyn-role="NavPage"] [role="tab"]',
    ];
    let tabs = [];
    for (const sel of selectorGroups) {
      const nodes = Array.from(document.querySelectorAll(sel)).filter((n) => cleanText(n.textContent));
      if (nodes.length > 1) { tabs = nodes; break; }
    }
    window.__d365foTabElements = tabs;
    window.__d365foOriginalActiveTab =
      tabs.find((t) => t.getAttribute("aria-selected") === "true" || /active|selected/i.test(t.className)) || tabs[0] || null;
    return tabs.map((t) => cleanText(t.textContent));
  };

  function waitForStableDom(maxWaitMs, quietMs) {
    return new Promise((resolve) => {
      let quietTimer;
      const hardStop = setTimeout(finish, maxWaitMs);
      const obs = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      function finish() {
        clearTimeout(quietTimer);
        clearTimeout(hardStop);
        obs.disconnect();
        resolve();
      }
      quietTimer = setTimeout(finish, quietMs);
    });
  }

  window.__d365foActivateTabByIndex = async function (index) {
    const tabs = window.__d365foTabElements || [];
    const el = tabs[index];
    if (!el) return false;
    el.click();
    await waitForStableDom(1200, 250);
    return true;
  };

  window.__d365foRestoreOriginalTab = async function () {
    const el = window.__d365foOriginalActiveTab;
    if (el) {
      el.click();
      await waitForStableDom(800, 200);
    }
    return true;
  };

  // Delegates to the main scanner's internal collectFieldsFromDom/hoverFillHelpText by
  // creating a one-off instance of the factory scoped to "no tab walking" so we reuse
  // the exact same label/help-text logic without duplicating it.
  window.__d365foCollectCurrentFields = async function (deep) {
    const singleShotScan = scanD365FOFormFactory();
    const result = await singleShotScan({ deep, walkTabs: false });
    return { formName: result.formName, url: result.url, fields: result.fields };
  };

  // ---------- lookup fields: detect, open, read available values, close ----------

  function isLikelyLookupField(el) {
    if (el.getAttribute("role") === "combobox") return true;
    if (el.hasAttribute("aria-haspopup")) return true;
    const container = el.closest("[data-dyn-controlname]") || el;
    if (container.querySelector('button[aria-label*="lookup" i], button[class*="lookup" i], [class*="lookupButton"], [class*="dyn-lookupButton"]')) {
      return true;
    }
    if (/lookup/i.test(el.className || "")) return true;
    return false;
  }

  window.__d365foGetLookupCandidates = function () {
    const controls = Array.from(document.querySelectorAll("[data-dyn-controlname]")).filter(isVisible);
    const seen = new Set();
    const result = [];
    controls.forEach((el) => {
      const controlName = el.getAttribute("data-dyn-controlname");
      if (!controlName || seen.has(controlName)) return;
      const role = el.getAttribute("data-dyn-role") || "";
      if (["Group", "Tab", "TabPage", "FormRoot", "Section"].includes(role)) return;
      if (isLikelyLookupField(el)) {
        seen.add(controlName);
        result.push(controlName);
      }
    });
    return result;
  };

  function getFloatingContainers() {
    return Array.from(document.querySelectorAll('[role="listbox"], [role="grid"], [role="dialog"], [role="tree"]'));
  }

  function extractOptionTexts(container) {
    const nodes = Array.from(container.querySelectorAll('[role="option"], [role="row"], li, tr'));
    const seen = new Set();
    const out = [];
    for (const n of nodes) {
      const t = cleanText(n.textContent);
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
        if (out.length >= 200) break; // guard against enormous grids
      }
    }
    return out;
  }

  // Opens the lookup for `controlName` and leaves it open (caller decides when to close,
  // e.g. after taking a screenshot). Returns { opened, values }.
  window.__d365foOpenLookup = async function (controlName) {
    const el = document.querySelector(`[data-dyn-controlname="${CSS.escape(controlName)}"]`);
    if (!el) return { opened: false, values: [], reason: "control not found" };

    const container = el.closest("[data-dyn-controlname]") || el;
    const trigger =
      container.querySelector('button[aria-label*="lookup" i], button[class*="lookup" i], [class*="lookupButton"], [class*="dyn-lookupButton"]') || el;

    const before = new Set(getFloatingContainers());
    trigger.click();
    await waitForStableDom(900, 250);
    let candidates = getFloatingContainers().filter((n) => !before.has(n) && n.getBoundingClientRect().width > 0);

    if (!candidates.length) {
      // Fallback: focus the field and try the classic Alt+Down combo-open shortcut.
      if (el.focus) el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
      await waitForStableDom(900, 250);
      candidates = getFloatingContainers().filter((n) => !before.has(n) && n.getBoundingClientRect().width > 0);
    }

    if (!candidates.length) return { opened: false, values: [], reason: "no lookup panel detected" };

    const values = extractOptionTexts(candidates[0]);
    return { opened: true, values };
  };

  window.__d365foCloseLookup = async function () {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 150));
    return true;
  };
})();
