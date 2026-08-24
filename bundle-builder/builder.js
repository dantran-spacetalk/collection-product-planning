(function () {
  var screenLabels = {
    variant: "Variant Selector",
    plan: "Plan Selector",
    strap: "Strap Selector",
    accessory: "Accessory Selector",
    summary: "Summary Screen",
    mobile: "Mobile Upsell Screen"
  };

  var catalogByMarket = {
    AU: {
      straps: ["black-strap", "pink-strap", "mint-strap"],
      accessories: ["watch-stand", "screen-protector", "usb-cable"],
      plans: ["30-day", "180-day", "365-day"],
      mobileOffer: "discount_70_first_month"
    },
    GB: {
      straps: ["black-strap", "blue-strap"],
      accessories: ["screen-protector", "usb-cable"],
      plans: ["starter", "plus"],
      mobileOffer: "none"
    }
  };

  var state = {
    market: "AU",
    mode: "bundle",
    screens: ["variant", "plan", "strap", "summary", "mobile"],
    rules: {
      require_watch_plan: true,
      strap_free_qty: 1,
      accessory_free_qty: 0,
      accessory_free_handles: ["watch-stand"],
      accessory_discount: {
        type: "none",
        value: 0,
        max_qty: 0,
        handles: ["watch-stand"]
      }
    },
    offers: {
      mobile: {
        enabled: true,
        type: "discount_70_first_month",
        offer_key: "mobile_discount_70"
      }
    },
    keys: {
      strap_discount_key: "regios_free_strap_bundle",
      accessory_free_key: "regios_free_accessory_bundle",
      accessory_discount_key: "regios_stand_50",
      mobile_discount_key: "regios_discount70"
    }
  };

  var screenOrderEl = document.getElementById("screenOrder");
  var previewFlowEl = document.getElementById("previewFlow");
  var previewBodyEl = document.getElementById("previewBody");
  var jsonOutputEl = document.getElementById("jsonOutput");
  var marketIssueEl = document.getElementById("marketIssue");

  function byId(id) {
    return document.getElementById(id);
  }

  function screenMarkup(screenId) {
    var marketData = catalogByMarket[state.market];

    if (screenId === "variant") {
      return "<div class='screen'><h3>Variant Selector</h3><div class='grid'>"
        + "<div class='item'>Frost</div><div class='item'>Dusk</div></div></div>";
    }

    if (screenId === "plan") {
      var plans = marketData.plans.map(function (p) {
        return "<div class='item'>" + p + "</div>";
      }).join("");
      return "<div class='screen'><h3>Plan Selector</h3><div class='grid'>" + plans + "</div></div>";
    }

    if (screenId === "strap") {
      var straps = marketData.straps.map(function (s) {
        return "<div class='item'>" + s + "</div>";
      }).join("");
      return "<div class='screen'><h3>Strap Selector</h3><p>Free qty: " + state.rules.strap_free_qty + "</p><div class='grid'>" + straps + "</div></div>";
    }

    if (screenId === "accessory") {
      var handles = state.rules.accessory_discount.handles;
      var all = ["watch-stand", "screen-protector", "usb-cable"];
      var accessories = all.map(function (a) {
        var available = marketData.accessories.indexOf(a) > -1;
        var targeted = handles.indexOf(a) > -1;
        var text = a;
        if (targeted && state.rules.accessory_discount.type !== "none") {
          text += " (" + state.rules.accessory_discount.value + "% off)";
        }
        if (targeted && state.rules.accessory_free_qty > 0) {
          text += " (free)";
        }
        return "<div class='item " + (available ? "" : "unavailable") + "'>" + text + (available ? "" : " - not in market") + "</div>";
      }).join("");
      return "<div class='screen'><h3>Accessory Selector</h3><div class='grid'>" + accessories + "</div></div>";
    }

    if (screenId === "summary") {
      return "<div class='screen'><h3>Summary Screen</h3><p>Watch + plan + straps + accessories subtotal shown here.</p></div>";
    }

    if (screenId === "mobile") {
      var offer = state.offers.mobile.enabled ? state.offers.mobile.type : "disabled";
      return "<div class='screen'><h3>Mobile Upsell Screen</h3><p>Offer: " + offer + "</p></div>";
    }

    return "";
  }

  function buildConfig() {
    return {
      version: 1,
      market: state.market,
      mode: state.mode,
      screens: state.screens.slice(),
      rules: {
        require_watch_plan: state.rules.require_watch_plan,
        strap_free_qty: state.rules.strap_free_qty,
        accessory_free: {
          qty: state.rules.accessory_free_qty,
          handles: state.rules.accessory_free_handles
        },
        accessory_discount: {
          type: state.rules.accessory_discount.type,
          value: state.rules.accessory_discount.value,
          max_qty: state.rules.accessory_discount.max_qty,
          handles: state.rules.accessory_discount.handles
        }
      },
      offers: state.offers,
      keys: state.keys
    };
  }

  function renderScreenOrder() {
    screenOrderEl.innerHTML = "";
    state.screens.forEach(function (id, i) {
      var row = document.createElement("div");
      row.className = "screen-item";
      row.innerHTML = "<span>" + screenLabels[id] + "</span>"
        + "<div class='moves'>"
        + "<button data-up='" + i + "'>&uarr;</button>"
        + "<button data-down='" + i + "'>&darr;</button>"
        + "<button data-remove='" + i + "'>Remove</button>"
        + "</div>";
      screenOrderEl.appendChild(row);
    });
  }

  function renderPreview() {
    previewFlowEl.innerHTML = state.screens.map(function (id) {
      return "<span class='pill'>" + screenLabels[id] + "</span>";
    }).join("");

    previewBodyEl.innerHTML = state.screens.map(screenMarkup).join("");

    var issues = [];
    if (state.market === "GB" && state.rules.accessory_discount.handles.indexOf("watch-stand") > -1) {
      var hasStand = catalogByMarket.GB.accessories.indexOf("watch-stand") > -1;
      if (!hasStand) {
        issues.push("watch-stand is configured but currently unavailable in GB catalog mock.");
      }
    }
    marketIssueEl.textContent = issues.join(" ");
    marketIssueEl.style.display = issues.length ? "block" : "none";

    jsonOutputEl.value = JSON.stringify(buildConfig(), null, 2);
  }

  function move(array, from, to) {
    if (to < 0 || to >= array.length) return;
    var item = array.splice(from, 1)[0];
    array.splice(to, 0, item);
  }

  function bindEvents() {
    byId("market").addEventListener("change", function (e) {
      state.market = e.target.value;
      if (state.market === "GB" && state.offers.mobile.enabled) {
        state.offers.mobile.enabled = false;
        byId("mobileEnabled").checked = false;
      }
      renderPreview();
    });

    byId("mode").addEventListener("change", function (e) {
      state.mode = e.target.value;
      renderPreview();
    });

    byId("addScreen").addEventListener("click", function () {
      var id = byId("screenToAdd").value;
      if (state.screens.indexOf(id) === -1) {
        state.screens.push(id);
        renderScreenOrder();
        renderPreview();
      }
    });

    screenOrderEl.addEventListener("click", function (e) {
      var up = e.target.getAttribute("data-up");
      var down = e.target.getAttribute("data-down");
      var remove = e.target.getAttribute("data-remove");
      if (up !== null) move(state.screens, Number(up), Number(up) - 1);
      if (down !== null) move(state.screens, Number(down), Number(down) + 1);
      if (remove !== null) state.screens.splice(Number(remove), 1);
      renderScreenOrder();
      renderPreview();
    });

    byId("requirePlan").addEventListener("change", function (e) {
      state.rules.require_watch_plan = e.target.checked;
      renderPreview();
    });

    byId("strapFreeQty").addEventListener("input", function (e) {
      state.rules.strap_free_qty = Number(e.target.value || 0);
      renderPreview();
    });

    byId("accessoryFreeQty").addEventListener("input", function (e) {
      state.rules.accessory_free_qty = Number(e.target.value || 0);
      renderPreview();
    });

    byId("accessoryDiscountType").addEventListener("change", function (e) {
      state.rules.accessory_discount.type = e.target.value;
      renderPreview();
    });

    byId("accessoryDiscountValue").addEventListener("input", function (e) {
      state.rules.accessory_discount.value = Number(e.target.value || 0);
      renderPreview();
    });

    byId("mobileEnabled").addEventListener("change", function (e) {
      state.offers.mobile.enabled = e.target.checked;
      renderPreview();
    });

    byId("copyJson").addEventListener("click", function () {
      jsonOutputEl.select();
      document.execCommand("copy");
      byId("copyStatus").textContent = "Copied JSON to clipboard.";
      setTimeout(function () { byId("copyStatus").textContent = ""; }, 1500);
    });

    byId("presetAuStandalone").addEventListener("click", function () {
      state.market = "AU";
      state.mode = "standalone";
      state.screens = ["plan", "mobile"];
      state.rules.require_watch_plan = true;
      state.rules.strap_free_qty = 0;
      state.rules.accessory_free_qty = 0;
      state.rules.accessory_discount = { type: "none", value: 0, max_qty: 0, handles: ["watch-stand"] };
      state.offers.mobile.enabled = true;
      syncInputs();
      renderScreenOrder();
      renderPreview();
    });

    byId("presetAuSmart").addEventListener("click", function () {
      state.market = "AU";
      state.mode = "bundle";
      state.screens = ["variant", "plan", "strap", "summary", "mobile"];
      state.rules.require_watch_plan = true;
      state.rules.strap_free_qty = 1;
      state.rules.accessory_free_qty = 0;
      state.rules.accessory_discount = { type: "none", value: 0, max_qty: 0, handles: ["watch-stand"] };
      state.offers.mobile.enabled = true;
      syncInputs();
      renderScreenOrder();
      renderPreview();
    });

    byId("presetUkStarter").addEventListener("click", function () {
      state.market = "GB";
      state.mode = "bundle";
      state.screens = ["variant", "strap", "accessory", "summary"];
      state.rules.require_watch_plan = false;
      state.rules.strap_free_qty = 1;
      state.rules.accessory_free_qty = 0;
      state.rules.accessory_discount = { type: "percent", value: 50, max_qty: 1, handles: ["watch-stand"] };
      state.offers.mobile.enabled = false;
      syncInputs();
      renderScreenOrder();
      renderPreview();
    });
  }

  function syncInputs() {
    byId("market").value = state.market;
    byId("mode").value = state.mode;
    byId("requirePlan").checked = state.rules.require_watch_plan;
    byId("strapFreeQty").value = state.rules.strap_free_qty;
    byId("accessoryFreeQty").value = state.rules.accessory_free_qty;
    byId("accessoryDiscountType").value = state.rules.accessory_discount.type;
    byId("accessoryDiscountValue").value = state.rules.accessory_discount.value;
    byId("mobileEnabled").checked = state.offers.mobile.enabled;
  }

  bindEvents();
  syncInputs();
  renderScreenOrder();
  renderPreview();
})();
