/* ============================================================
   SPACETALK BUNDLE BUILDER
   assets/bundle-builder.js
   ============================================================ */

(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  const uid = () => Math.random().toString(36).slice(2, 10);

  const COLOUR_MAP = {
    'midnight': '#1a1a1a', 'black': '#1a1a1a', 'frost': '#C0C8D4',
    'white': '#f5f5f5', 'dusk': '#9B8EA0', 'arctic': '#7EC8D4',
    'ocean': '#2B6CB0', 'blue': '#378ADD', 'pink': '#F4C0D1',
    'red': '#E24B4A', 'green': '#5DCAA5', 'yellow': '#D4FD00',
    'orange': '#F0997B', 'purple': '#7F77DD', 'grey': '#888780',
    'gray': '#888780', 'silver': '#C0C8D4',
  };

  function colourForTitle(title) {
    if (!title) return '#EFEFEF';
    const key = title.toLowerCase().trim();
    for (const [name, hex] of Object.entries(COLOUR_MAP)) {
      if (key.includes(name)) return hex;
    }
    return '#EFEFEF';
  }

  class BundleBuilder {
    constructor(productId) {
      this.productId = productId;
      this.data = this._parseData();
      if (!this.data) return;

      this.slides = this.data.slides;
      this.currentIdx = 0;
      this.bundleId = uid();
      this.bundleAdded = false;

      this.selection = {
        watch: null,
        plan: null,
        straps: [],
        accessories: [],
        mobileUpsellPlan: null,
        mobileUpsellIncludeSim: true,
      };

      this._preselectAll();
      this._bindElements();
      this._captureStepDefaults();
      this._bindEvents();
      this._applyPreselectToDOM();
      this._updateCTA();
      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    /* --------------------------------------------------------
       Data parsing
    -------------------------------------------------------- */
    _parseData() {
      const el = document.getElementById(`BBData-${this.productId}`);
      if (!el) return null;
      try {
        return JSON.parse(el.textContent);
      } catch (e) {
        console.error('[BundleBuilder] JSON parse error', e);
        return null;
      }
    }

    /* --------------------------------------------------------
       Pre-selections
    -------------------------------------------------------- */
    _preselectAll() {
      // Watch — first variant of first watch
      if (this.data.watches?.length) {
        const w = this.data.watches[0];
        const v = w.variants?.[0];
        if (v) {
          this.selection.watch = {
            variantId: v.id,
            title: v.title,
            price: v.price,
            compareAtPrice: v.compareAtPrice || 0,
            image: v.image,
            leftImage: v.leftImage,
          };
        }
      }

      // Plan — default (365-day) or first
      const defaultPlan = this.data.plans?.find(p => p.default) || this.data.plans?.[0];
      if (defaultPlan) {
        this.selection.plan = {
          variantId: defaultPlan.variantId,
          label: defaultPlan.label,
          price: defaultPlan.price,
        };
      }

      // Accessories included — always pre-selected
      this.selection.accessories = (this.data.accessoriesIncluded || []).map(acc => ({
        variantId: acc.variantId,
        title: acc.title,
        price: 0,
        compareAtPrice: 0,
        image: acc.image,
        included: true,
      }));

      const mobileDefaultPlan = this.data.mobileUpsell?.plans?.find(p => p.default)
        || this.data.mobileUpsell?.plans?.find(p => p.variantId === this.data.mobileUpsell?.defaultPlanVariantId)
        || this.data.mobileUpsell?.plans?.[0];
      if (mobileDefaultPlan) {
        this.selection.mobileUpsellPlan = {
          variantId: mobileDefaultPlan.variantId,
          label: mobileDefaultPlan.label,
          price: mobileDefaultPlan.price,
          cta: mobileDefaultPlan.cta,
        };
      }
    }

    /* --------------------------------------------------------
       Apply pre-selections visually to the DOM
    -------------------------------------------------------- */
    _applyPreselectToDOM() {
      const id = this.productId;

      // Mark first watch swatch as active and update preview image
      const allSwatches = $$(`#BBSwatches-${id} .bb-swatch`);
      if (allSwatches.length) {
        allSwatches.forEach(s => s.classList.remove('is-active'));
        allSwatches[0].classList.add('is-active');

        // Set the main preview image from first swatch
        const firstImage = allSwatches[0].dataset.variantImage;
        const firstLeftImage = allSwatches[0].dataset.leftImage;
        const heroImg = $(`#BBWatchImg-${id}`);
        if (heroImg && firstImage) heroImg.src = firstImage;
        if (this.el.leftWatchImg && firstLeftImage) this.el.leftWatchImg.src = firstLeftImage;
      }

      // Load features for first watch
      this._updateWatchFeatures(0);

      // Mark default plan as selected
      if (this.selection.plan) {
        $$(`#BBPlans-${id} .bb-plan`).forEach(card => {
          const isSelected = parseInt(card.dataset.variantId, 10) === this.selection.plan.variantId;
          card.classList.toggle('is-selected', isSelected);
        });
      }

      if (this.el?.mobileUpsellPlans?.length) {
        this.el.mobileUpsellPlans.forEach(card => {
          const isSelected = parseInt(card.dataset.variantId, 10) === this.selection.mobileUpsellPlan?.variantId;
          card.classList.toggle('is-selected', isSelected);
        });
      }

      if (this.el?.mobileUpsellSimInput) {
        this.el.mobileUpsellSimInput.checked = !!this.selection.mobileUpsellIncludeSim;
        this.el.mobileUpsellSimWrap?.classList.toggle('is-on', !!this.selection.mobileUpsellIncludeSim);
        if (this.el.mobileUpsellSimText) {
          this.el.mobileUpsellSimText.textContent = this.selection.mobileUpsellIncludeSim
            ? 'Include a physical SIM card (FREE)'
            : 'Use eSIM instead (instant setup)';
        }
      }

      this._renderLeftBundlePreview();
      this._updateStrapPriceDisplay();
      this._updateAccessorySelectionsUI();
    }

    _renderLeftBundlePreview() {
      const id = this.productId;
      const setTileFilled = (tileEl, isFilled) => tileEl?.classList.toggle('is-filled', !!isFilled);
      const slideIdx = (name) => this.slides.indexOf(name);
      const hasReached = (name) => {
        const idx = slideIdx(name);
        return idx > -1 && this.currentIdx >= idx;
      };

      // 1) Watch pane
      if (this.el.leftWatchImg) {
        const showWatch = hasReached('watches');
        const watchImage = showWatch ? (this.selection.watch?.leftImage || this.selection.watch?.image || '') : '';
        if (watchImage) {
          this.el.leftWatchImg.src = watchImage;
          this.el.leftWatchImg.style.display = '';
        } else {
          this.el.leftWatchImg.removeAttribute('src');
          this.el.leftWatchImg.style.display = 'none';
        }
        setTileFilled(this.el.leftWatchTile, !!watchImage);
      }

      // 2) Plan pane
      if (this.el.leftPlanPane) {
        const showPlan = hasReached('plans');
        const planData = this.data.plans?.find(p => p.variantId === this.selection.plan?.variantId);
        const planImage = showPlan ? (planData?.image || '') : '';
        const planLabelRaw = showPlan ? (this.selection.plan?.label || '') : '';
        const planLabel = planLabelRaw
          ? planLabelRaw.replace('-day', ' Day').replace('plan', 'Plan')
          : '';
        if (planImage || planLabel) {
          this.el.leftPlanPane.classList.add('bb-left__pane--plan');
          this.el.leftPlanPane.innerHTML = `
            ${planImage ? `<img src="${planImage}" alt="${planLabel || 'Selected plan'}" width="100" height="100" loading="lazy">` : ''}
            ${planLabel ? `<span class="bb-left__plan-chip">${planLabel}</span>` : ''}
          `;
          setTileFilled(this.el.leftPlanTile, true);
        } else {
          this.el.leftPlanPane.classList.remove('bb-left__pane--plan');
          this.el.leftPlanPane.innerHTML = '';
          setTileFilled(this.el.leftPlanTile, false);
        }
      }

      // 3) Straps pane (show all selected)
      if (this.el.leftStrapsPane) {
        const showStraps = hasReached('straps');
        if (showStraps && this.selection.straps.length) {
          const strapItems = this.selection.straps.map(strap => {
            const swatchEl = document.querySelector(`#BBStrapsList-${id} .bb-strap-swatch[data-variant-id="${strap.variantId}"]`);
            return swatchEl?.dataset.variantImage || '';
          }).filter(Boolean);

          const displayed = strapItems.slice(0, 4);
          const overflow = strapItems.length - displayed.length;
          let html = '<div class="bb-left__mini-grid">';
          displayed.forEach(src => {
            html += `<div class="bb-left__mini-item"><img src="${src}" alt="Selected strap" width="60" height="60" loading="lazy"></div>`;
          });
          if (overflow > 0) {
            html += `<div class="bb-left__mini-item">+${overflow}</div>`;
          }
          html += '</div>';
          this.el.leftStrapsPane.innerHTML = html;
          setTileFilled(this.el.leftStrapsTile, true);
        } else {
          this.el.leftStrapsPane.innerHTML = '';
          setTileFilled(this.el.leftStrapsTile, false);
        }
      }

      // 4) Accessories pane (show included + selected once accessories step is reached)
      if (this.el.leftAccessoriesPane) {
        const showAccessories = hasReached('accessories');
        const visibleAccessories = showAccessories ? this.selection.accessories : [];
        if (visibleAccessories.length) {
          const displayed = visibleAccessories.slice(0, 4);
          const overflow = visibleAccessories.length - displayed.length;
          let html = '<div class="bb-left__mini-grid">';
          displayed.forEach(acc => {
            html += `
              <div class="bb-left__mini-item">
                ${acc.image ? `<img src="${acc.image}" alt="${acc.title || 'Selected accessory'}" width="60" height="60" loading="lazy">` : ''}
              </div>
            `;
          });
          if (overflow > 0) {
            html += `<div class="bb-left__mini-item">+${overflow}</div>`;
          }
          html += '</div>';
          this.el.leftAccessoriesPane.innerHTML = html;
          setTileFilled(this.el.leftAccessoriesTile, true);
        } else {
          this.el.leftAccessoriesPane.innerHTML = '';
          setTileFilled(this.el.leftAccessoriesTile, false);
        }
      }
    }

    /* --------------------------------------------------------
       Element references
    -------------------------------------------------------- */
    _bindElements() {
      const id = this.productId;
      const drawerEl = document.getElementById(`BundleBuilderDrawer-${id}`);
      const mobileUpsellSlide = document.getElementById(`BBSlideMobileUpsell-${id}`);
      this.el = {
        overlay:          document.getElementById(`BundleBuilderOverlay-${id}`),
        drawer:           drawerEl,
        drawerInner:      drawerEl?.querySelector('.bb-drawer__inner'),
        openBtn:          document.getElementById(`BundleBuilderOpen-${id}`),
        closeBtn:         drawerEl?.querySelector('.bb-topbar__close'),
        stepLabel:        document.getElementById(`BBStepLabel-${id}`),
        progressFill:     document.getElementById(`BBProgress-${id}`),
        backBtn:          document.getElementById(`BBBack-${id}`),
        mobileUpsellFooterSkipBtn: document.getElementById(`BBMobileSkipFooter-${id}`),
        nextBtn:          document.getElementById(`BBNext-${id}`),
        leftWatchImg:     document.getElementById(`BBLeftWatchImg-${id}`),
        priceOrig:        document.getElementById(`BBPriceOrig-${id}`),
        priceFinal:       document.getElementById(`BBPriceFinal-${id}`),
        savePill:         document.getElementById(`BBSavePill-${id}`),
        mobilePriceOrig:  document.getElementById(`BBMobilePriceOrig-${id}`),
        mobilePriceFinal: document.getElementById(`BBMobilePriceFinal-${id}`),
        summaryList:      document.getElementById(`BBSummaryList-${id}`),
        summaryOrig:      document.getElementById(`BBSummaryOrig-${id}`),
        summaryFinal:     document.getElementById(`BBSummaryFinal-${id}`),
        summarySave:      document.getElementById(`BBSummarySave-${id}`),
        strapCount:       document.getElementById(`BBStrapCount-${id}`),
        strapCounterNote: document.getElementById(`BBStrapCounterNote-${id}`),
        watchImg:         document.getElementById(`BBWatchImg-${id}`),
        swatchLabel:      document.getElementById(`BBSwatchLabel-${id}`),
        leftWatchTile:    document.getElementById(`BBLeftWatchTile-${id}`),
        leftPlanTile:     document.getElementById(`BBLeftPlanTile-${id}`),
        leftStrapsTile:   document.getElementById(`BBLeftStrapsTile-${id}`),
        leftAccessoriesTile: document.getElementById(`BBLeftAccessoriesTile-${id}`),
        leftPlanPane:     document.getElementById(`BBLeftPlanPane-${id}`),
        leftStrapsPane:   document.getElementById(`BBLeftStrapsPane-${id}`),
        leftAccessoriesPane: document.getElementById(`BBLeftAccessoriesPane-${id}`),
        accChips:         document.getElementById(`BBAccChips-${id}`),
        mobileUpsellPlans: mobileUpsellSlide ? $$('.bb-mobile-plan', mobileUpsellSlide) : [],
        mobileUpsellSkipBtn: document.getElementById(`BBMobileSkip-${id}`),
        mobileUpsellSimInput: document.getElementById(`BBMobileSimToggleInput-${id}`),
        mobileUpsellSimWrap: document.getElementById(`BBMobileSimToggleWrap-${id}`),
        mobileUpsellSimText: document.getElementById(`BBMobileSimToggleText-${id}`),
      };
    }

    _captureStepDefaults() {
      const id = this.productId;
      $$(`#BBSteps-${id} .bb-step`).forEach(step => {
        const valEl = step.querySelector('.bb-step__val');
        if (valEl) {
          step.dataset.defaultVal = (valEl.textContent || '').trim();
        }
      });
    }

    /* --------------------------------------------------------
       Events
    -------------------------------------------------------- */
    _bindEvents() {
      const id = this.productId;

      this.el.openBtn?.addEventListener('click', () => this.open());
      this.el.closeBtn?.addEventListener('click', () => this._handleDismiss());
      this.el.backBtn?.addEventListener('click', () => this.goBack());
      this.el.nextBtn?.addEventListener('click', () => this.goNext());

      // Use document delegation for overlay — survives body re-append
      document.addEventListener('click', (e) => {
        if (e.target === this.el.overlay) this._handleDismiss();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen()) this._handleDismiss();
      });

      // Watch swatches
      $$(`#BBSwatches-${id} .bb-swatch`).forEach(swatch => {
        swatch.addEventListener('click', () => this._selectWatchSwatch(swatch));
      });

      // Watch radio (multiple watch products)
      $$(`#BBSlideWatches-${id} .bb-watch-radio`).forEach(radio => {
        radio.addEventListener('change', () => this._onWatchProductChange(radio));
      });

      // Plan cards
      $$(`#BBPlans-${id} .bb-plan`).forEach(card => {
        card.addEventListener('click', () => this._selectPlan(card));
      });

      this.el.mobileUpsellPlans?.forEach(card => {
        card.addEventListener('click', () => this._selectMobileUpsellPlan(card));
      });

      this.el.mobileUpsellSimInput?.addEventListener('change', () => {
        const includeSim = !!this.el.mobileUpsellSimInput?.checked;
        this.selection.mobileUpsellIncludeSim = includeSim;
        this.el.mobileUpsellSimWrap?.classList.toggle('is-on', includeSim);
        if (this.el.mobileUpsellSimText) {
          this.el.mobileUpsellSimText.textContent = includeSim
            ? 'Include a physical SIM card (FREE)'
            : 'Use eSIM instead (instant setup)';
        }
        this._renderLeftBundlePreview();
      });

      this.el.mobileUpsellSkipBtn?.addEventListener('click', () => this._skipMobileUpsell());
      this.el.mobileUpsellFooterSkipBtn?.addEventListener('click', () => this._skipMobileUpsell());

      // Strap swatches — delegated
      document.getElementById(`BBStrapsList-${id}`)?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.bb-strap-swatch-remove');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          const variantId = parseInt(removeBtn.dataset.variantId || '0', 10);
          if (variantId) this._removeStrap(variantId);
          return;
        }

        const swatch = e.target.closest('.bb-strap-swatch');
        if (swatch) this._toggleStrap(swatch);
      });

      // Accessory cards — delegated (upsells and included cards can both add paid extras)
      document.getElementById(`BBAccGrid-${id}`)?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.bb-acc-card__remove');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          const variantId = parseInt(removeBtn.dataset.variantId || '0', 10);
          if (variantId) this._removeAccessory(variantId);
          return;
        }

        const card = e.target.closest('.bb-acc-card');
        if (card) this._toggleAccessory(card);
      });

      // Desktop step nav — jump back to completed steps
      $$(`#BBSteps-${id} .bb-step`).forEach((step, i) => {
        step.addEventListener('click', () => {
          if (i < this.currentIdx) {
            this.currentIdx = i;
            this._renderSlide();
          }
        });
      });
    }

    /* --------------------------------------------------------
       Open / Close
    -------------------------------------------------------- */
    open() {
      // Overlay contains drawer as child — move overlay to body, drawer comes with it
      document.body.appendChild(this.el.overlay);
      this.el.drawer.removeAttribute('hidden');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.el.overlay.classList.add('is-open');
        });
      });

      this.el.openBtn?.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      this._renderSlide();
      this._updatePrice();
    }

    close() {
      this.el.overlay.classList.remove('is-open');
      this.el.openBtn?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setTimeout(() => {
        this.el.drawer.setAttribute('hidden', '');
      }, 420);
    }

    _handleDismiss() {
      const slideName = this.slides[this.currentIdx];
      const shouldOpenCart = slideName === 'mobile-upsell' && this.bundleAdded;

      if (shouldOpenCart) {
        this._openCartAndReset();
        return;
      }

      this.close();
    }



    _isOpen() {
      return this.el.overlay?.classList.contains('is-open');
    }

    /* --------------------------------------------------------
       Navigation
    -------------------------------------------------------- */
    async goNext() {
      const slideName = this.slides[this.currentIdx];
      if (slideName === 'summary') {
        await this._handleSummaryContinue();
        return;
      }

      if (slideName === 'mobile-upsell') {
        await this._addMobileUpsellAndOpenCart();
        return;
      }

      this._markStepDone(this.currentIdx);
      this.currentIdx = Math.min(this.currentIdx + 1, this.slides.length - 1);
      this._renderSlide();
    }

    goBack() {
      if (this.currentIdx > 0) {
        this.currentIdx--;
        this._renderSlide();
      }
    }

    _renderSlide() {
      const id = this.productId;
      const total = this.slides.length;
      const current = this.currentIdx + 1;
      const slideName = this.slides[this.currentIdx];
      const isMobileUpsellStep = slideName === 'mobile-upsell';

      // Show/hide slides
      $$(`#BBSlides-${id} .bb-slide`).forEach(el => {
        el.classList.toggle('is-active', el.dataset.slide === slideName);
      });

      // Step label + progress
      if (this.el.stepLabel) this.el.stepLabel.textContent = `Step ${current} of ${total}`;
      if (this.el.progressFill) this.el.progressFill.style.width = `${(current / total) * 100}%`;

      // Back button visibility
      if (this.el.backBtn) this.el.backBtn.style.display = (this.currentIdx > 0 && !isMobileUpsellStep) ? '' : 'none';

      // Mobile upsell skip button lives in footer and only appears on that step
      if (this.el.mobileUpsellFooterSkipBtn) {
        this.el.mobileUpsellFooterSkipBtn.style.display = isMobileUpsellStep ? 'block' : 'none';
      }

      // CTA label
      this._updateCTA();

      // Step states in left panel
      this._updateStepStates();

      // Keep left collage in sync with current step visibility rules
      this._renderLeftBundlePreview();

      // Build summary when on last slide
      if (slideName === 'summary') this._buildSummary();

      // Scroll to top
      $(`#BBSlides-${id}`)?.scrollTo({ top: 0 });
    }

    _markStepDone(idx) {
      const id = this.productId;
      const steps = $$(`#BBSteps-${id} .bb-step`);
      const step = steps[idx];
      if (!step) return;

      const slideType = step.dataset.slideType || this.slides[idx];

      step.classList.remove('bb-step--active', 'bb-step--pending');
      step.classList.add('bb-step--done');

      const num = step.querySelector('.bb-step__num');
      if (num) num.className = 'bb-step__num bb-step__num--done';

      const name = step.querySelector('.bb-step__name');
      if (name) name.classList.remove('bb-step__name--pending');

      // Tap to change hint
      const body = step.querySelector('.bb-step__body');
      if (body && !body.querySelector('.bb-step__edit')) {
        const edit = document.createElement('div');
        edit.className = 'bb-step__edit';
        edit.textContent = 'Tap to change';
        body.appendChild(edit);
      }

      // Checkmark
      if (!step.querySelector('.bb-step__check')) {
        const check = document.createElement('div');
        check.className = 'bb-step__check';
        check.innerHTML = `<svg width="14" height="11" viewBox="0 0 14 11" fill="none"><path d="M1 5.5L5 9.5L13 1" stroke="#171717" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        step.appendChild(check);
      }

      // Update value label
      const valEl = step.querySelector('.bb-step__val');
      if (valEl) {
        switch(slideType) {
          case 'watches':
            if (this.selection.watch) valEl.textContent = this.selection.watch.title;
            break;
          case 'plans':
            if (this.selection.plan) valEl.textContent = this.selection.plan.label;
            break;
          case 'straps':
            valEl.textContent = this.selection.straps.length
              ? this.selection.straps.map(s => s.title).join(', ')
              : 'None selected';
            break;
          case 'accessories':
            valEl.textContent = `${this.selection.accessories.length} item${this.selection.accessories.length !== 1 ? 's' : ''}`;
            break;
          case 'mobile-upsell':
            valEl.textContent = this.selection.mobileUpsellPlan?.label || 'Skipped';
            break;
        }
      }
    }

    _updateStepStates() {
      const id = this.productId;
      $$(`#BBSteps-${id} .bb-step`).forEach((step, i) => {
        const num = step.querySelector('.bb-step__num');
        const name = step.querySelector('.bb-step__name');
        step.classList.remove('bb-step--active', 'bb-step--done', 'bb-step--pending');
        if (i < this.currentIdx) {
          step.classList.add('bb-step--done');
          if (num) num.className = 'bb-step__num bb-step__num--done';
          if (name) name.classList.remove('bb-step__name--pending');
        } else if (i === this.currentIdx) {
          step.classList.add('bb-step--active');
          if (num) num.className = 'bb-step__num bb-step__num--active';
          if (name) name.classList.remove('bb-step__name--pending');
        } else {
          step.classList.add('bb-step--pending');
          if (num) num.className = 'bb-step__num bb-step__num--pending';
          if (name) name.classList.add('bb-step__name--pending');
        }
      });
    }

    _validateSlide(slideName) {
      switch (slideName) {
        case 'watches':  return !!this.selection.watch;
        case 'plans':    return !!this.selection.plan;
        case 'straps': {
          const required = this.data.freeStrapCount || 0;
          return required === 0 || this.selection.straps.length >= required;
        }
        case 'accessories':
        case 'summary':
          return true;
        case 'mobile-upsell':
          return !!this.selection.mobileUpsellPlan;
        default: return true;
      }
    }

    _updateCTA() {
      const btn = this.el.nextBtn;
      if (!btn) return;
      const slideName = this.slides[this.currentIdx];
      const valid = this._validateSlide(slideName);

      // Disable button if slide requirements not met
      btn.disabled = !valid;
      btn.style.opacity = valid ? '1' : '0.4';
      btn.style.cursor = valid ? 'pointer' : 'not-allowed';

      switch (slideName) {
        case 'watches':
          btn.textContent = 'Select';
          break;
        case 'plans': {
          const plan = this.data.plans?.find(p => p.variantId === this.selection.plan?.variantId);
          btn.textContent = plan ? `Continue with ${plan.id}-day` : 'Select';
          break;
        }
        case 'straps': {
          const required = this.data.freeStrapCount || 0;
          const selected = this.selection.straps.length;
          const remaining = required - selected;
          btn.textContent = remaining > 0
            ? `Select ${remaining} more strap${remaining !== 1 ? 's' : ''}`
            : 'Select';
          break;
        }
        case 'accessories': btn.textContent = 'Select'; break;
        case 'summary': {
          const hasMobileUpsell = this.data.mobileUpsell?.enabled && (this.data.mobileUpsell?.plans || []).length;
          btn.textContent = hasMobileUpsell ? 'Add bundle and continue' : 'Add bundle to cart';
          break;
        }
        case 'mobile-upsell': {
          const selected = this.selection.mobileUpsellPlan;
          btn.textContent = selected?.cta || 'Add mobile plan + open cart';
          break;
        }
        default:            btn.textContent = 'Continue';
      }
    }

    _selectMobileUpsellPlan(card) {
      this.el.mobileUpsellPlans?.forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');

      const variantId = parseInt(card.dataset.variantId, 10);
      const label = card.dataset.label || 'Mobile Plan';
      const price = parseInt(card.dataset.priceCents || '0', 10);
      const cta = card.dataset.cta || 'Add mobile plan + open cart';
      this.selection.mobileUpsellPlan = { variantId, label, price, cta };
      this._updateCTA();
      this._renderLeftBundlePreview();
    }

    /* --------------------------------------------------------
       Watch selection
    -------------------------------------------------------- */
    _selectWatchSwatch(swatch) {
      const id = this.productId;
      $$(`#BBSwatches-${id} .bb-swatch`).forEach(s => s.classList.remove('is-active'));
      swatch.classList.add('is-active');

      const variantId    = parseInt(swatch.dataset.variantId, 10);
      const variantTitle = swatch.dataset.variantTitle;
      const variantPrice = parseInt(swatch.dataset.variantPrice, 10);
      const variantCompareAtPrice = parseInt(swatch.dataset.variantCompareAtPrice || '0', 10);
      const variantImage = swatch.dataset.variantImage;
      const leftImage    = swatch.dataset.leftImage;
      const watchIndex   = parseInt(swatch.dataset.watchIndex || '0', 10);

      this.selection.watch = {
        variantId,
        title: variantTitle,
        price: variantPrice,
        compareAtPrice: variantCompareAtPrice,
        image: variantImage,
        leftImage,
      };

      // Update hero image
      const heroImg = $(`#BBWatchImg-${id}`);
      if (heroImg && variantImage) {
        heroImg.classList.add('is-loading');
        heroImg.src = variantImage;
        heroImg.onload = () => heroImg.classList.remove('is-loading');
      }

      // Update left panel image
      if (this.el.leftWatchImg && leftImage) this.el.leftWatchImg.src = leftImage;

      // Update swatch label
      const label = $(`#BBSwatchLabel-${id}`);
      if (label) label.textContent = `Colour: ${variantTitle}`;

      // Update features for this watch
      this._updateWatchFeatures(watchIndex);

      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    _updateWatchFeatures(watchIndex) {
      const id = this.productId;
      const watchData = this.data.watches[watchIndex];
      const featuresEl = document.getElementById(`BBWatchFeatures-${id}`);
      console.log('[BB] features el:', !!featuresEl, 'watchData:', !!watchData);
      if (!featuresEl || !watchData) return;

      const features = watchData.features || [];
      console.log('[BB] features:', features);
      if (!features.length) {
        featuresEl.style.display = 'none';
        return;
      }

      featuresEl.style.display = '';
      featuresEl.innerHTML = `
        <div class="bb-watch-features__label">What's included</div>
        <ul class="bb-watch-features__list">
          ${features.map(f => `
            <li class="bb-watch-features__item">
              <span class="bb-watch-features__check">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#3315D0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              ${f}
            </li>
          `).join('')}
        </ul>
      `;

      // Also update watch title
      const titleEl = document.getElementById(`BBWatchTitle-${id}`);
      if (titleEl) titleEl.textContent = watchData.title;
    }

    _onWatchProductChange(radio) {
      const id = this.productId;
      const watchIndex = parseInt(radio.dataset.watchIndex, 10);
      const watchData = this.data.watches[watchIndex];
      if (!watchData) return;

      const swatchContainer = $(`#BBSwatches-${id}`);
      if (!swatchContainer) return;

      swatchContainer.innerHTML = '';
      watchData.variants.forEach((variant, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `bb-swatch${i === 0 ? ' is-active' : ''}`;
        btn.dataset.variantId    = variant.id;
        btn.dataset.variantTitle = variant.title;
        btn.dataset.variantPrice = variant.price;
        btn.dataset.variantCompareAtPrice = variant.compareAtPrice || 0;
        btn.dataset.variantImage = variant.image;
        btn.dataset.leftImage    = variant.leftImage;
        btn.dataset.watchIndex   = String(watchIndex);
        btn.setAttribute('aria-label', variant.title);
        btn.innerHTML = `
          <span class="bb-swatch__img">
            ${variant.image ? `<img src="${variant.image}" alt="${variant.title}" width="200" height="200" loading="lazy">` : ''}
          </span>
          <span class="bb-swatch__label">${variant.title}</span>
          <span class="bb-swatch__price${variant.compareAtPrice > variant.price ? ' is-on-sale' : ''}">
            ${variant.compareAtPrice > variant.price
              ? `<s>${money(variant.compareAtPrice)}</s><strong>${money(variant.price)}</strong><em>Save ${money(variant.compareAtPrice - variant.price)}</em>`
              : `<strong>${money(variant.price)}</strong>`
            }
          </span>
        `;
        btn.addEventListener('click', () => this._selectWatchSwatch(btn));
        swatchContainer.appendChild(btn);
      });

      const first = watchData.variants[0];
      if (first) {
        this.selection.watch = {
          variantId: first.id, title: first.title,
          price: first.price, compareAtPrice: first.compareAtPrice || 0,
          image: first.image, leftImage: first.leftImage,
        };
        const label = $(`#BBSwatchLabel-${id}`);
        if (label) label.textContent = `Colour: ${first.title}`;
        const heroImg = $(`#BBWatchImg-${id}`);
        if (heroImg) heroImg.src = first.image;
        if (this.el.leftWatchImg) this.el.leftWatchImg.src = first.leftImage;
      }

      this._updateWatchFeatures(watchIndex);
      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    /* --------------------------------------------------------
       Plan selection
    -------------------------------------------------------- */
    _selectPlan(card) {
      const id = this.productId;
      $$(`#BBPlans-${id} .bb-plan`).forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');

      const variantId = parseInt(card.dataset.variantId, 10);
      const planData  = this.data.plans?.find(p => p.variantId === variantId);
      if (planData) {
        this.selection.plan = { variantId: planData.variantId, label: planData.label, price: planData.price };
      }

      this._updateCTA();
      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    /* --------------------------------------------------------
       Strap selection
    -------------------------------------------------------- */
    _toggleStrap(swatch) {
      const variantId    = parseInt(swatch.dataset.variantId, 10);
      const variantTitle = swatch.dataset.variantTitle;
      const variantPrice = parseInt(swatch.dataset.variantPrice, 10);
      const variantCompareAtPrice = parseInt(swatch.dataset.variantCompareAtPrice || '0', 10);
      const productTitle = swatch.dataset.productTitle;
      const productId    = parseInt(swatch.dataset.productId, 10);

      // Each tap adds one more of this strap
      this.selection.straps.push({
        variantId,
        title: variantTitle,
        price: variantPrice,
        compareAtPrice: variantCompareAtPrice,
        productTitle,
        productId,
      });

      // Update swatch active state — active if at least one selected
      const count = this.selection.straps.filter(s => s.variantId === variantId).length;
      swatch.classList.add('is-active');

      // Show count badge on swatch
      let badge = swatch.querySelector('.bb-swatch-qty');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'bb-swatch-qty';
        swatch.querySelector('.bb-strap-swatch__img').appendChild(badge);
      }
      badge.textContent = count > 1 ? `×${count}` : '';
      badge.style.display = count > 1 ? 'flex' : 'none';

      // Add/remove affordance on the swatch image (tap X to remove one)
      let removeBtn = swatch.querySelector('.bb-strap-swatch-remove');
      if (!removeBtn) {
        removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'bb-strap-swatch-remove';
        removeBtn.dataset.variantId = String(variantId);
        removeBtn.setAttribute('aria-label', `Remove one ${variantTitle}`);
        removeBtn.textContent = '×';
        swatch.querySelector('.bb-strap-swatch__img').appendChild(removeBtn);
      }
      removeBtn.style.display = 'flex';

      this._updateStrapCounter();
      this._updatePrice();
      this._updateCTA();
      this._renderLeftBundlePreview();
    }

    _removeStrap(variantId) {
      const id = this.productId;
      // Remove last instance of this variant
      const idx = this.selection.straps.map(s => s.variantId).lastIndexOf(variantId);
      if (idx > -1) this.selection.straps.splice(idx, 1);

      // Update swatch
      const swatch = document.querySelector(`#BBStrapsList-${id} .bb-strap-swatch[data-variant-id="${variantId}"]`);
      const count = this.selection.straps.filter(s => s.variantId === variantId).length;
      if (swatch) {
        if (count === 0) swatch.classList.remove('is-active');
        const badge = swatch.querySelector('.bb-swatch-qty');
        if (badge) {
          badge.textContent = count > 1 ? `×${count}` : '';
          badge.style.display = count > 1 ? 'flex' : 'none';
        }
        const removeBtn = swatch.querySelector('.bb-strap-swatch-remove');
        if (removeBtn) removeBtn.style.display = count > 0 ? 'flex' : 'none';
      }

      this._updateStrapCounter();
      this._updatePrice();
      this._updateCTA();
      this._renderLeftBundlePreview();
    }

    _updateStrapCounter() {
      const id        = this.productId;
      const count     = this.selection.straps.length;
      const freeCount = this.data.freeStrapCount || 0;

      // Update count
      if (this.el.strapCount) this.el.strapCount.textContent = count;

      // Update status note
      if (this.el.strapCounterNote) {
        if (count < freeCount) {
          this.el.strapCounterNote.textContent = `Choose ${freeCount - count} more`;
          this.el.strapCounterNote.style.color = '#3315D0';
        } else if (count === freeCount) {
          this.el.strapCounterNote.textContent = 'Free straps selected';
          this.el.strapCounterNote.style.color = '#3315D0';
        } else {
          this.el.strapCounterNote.textContent = `+${count - freeCount} extra · +${money((count - freeCount) * (this.selection.straps[0]?.price || 0))}`;
          this.el.strapCounterNote.style.color = '#171717';
        }
      }

      // Render selected strap chips
      const chipsContainer = document.getElementById(`BBStrapChips-${id}`);
      this._updateStrapPriceDisplay();
      if (!chipsContainer) return;
      chipsContainer.innerHTML = '';

      if (this.selection.straps.length === 0) {
        chipsContainer.style.display = 'none';
        return;
      }

      chipsContainer.style.display = 'flex';
      this.selection.straps.forEach((strap, i) => {
        const chip = document.createElement('div');
        chip.className = 'bb-strap-chip';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', `Remove ${strap.title}`);
        const isFree = i < freeCount;
        chip.innerHTML = `
          <span class="bb-strap-chip__label">${strap.title}</span>
          ${isFree ? '<span class="bb-strap-chip__free">Free</span>' : `<span class="bb-strap-chip__price">+${money(strap.price)}</span>`}
          <button type="button" class="bb-strap-chip__remove" data-variant-id="${strap.variantId}" aria-label="Remove ${strap.title}">×</button>
        `;
        chip.addEventListener('click', () => {
          this._removeStrap(strap.variantId);
        });
        chip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._removeStrap(strap.variantId);
          }
        });
        chipsContainer.appendChild(chip);
      });

      // Bind remove buttons
      chipsContainer.querySelectorAll('.bb-strap-chip__remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeStrap(parseInt(btn.dataset.variantId, 10));
        });
      });
    }

    _updateStrapPriceDisplay() {
      const id = this.productId;
      const freeCount = this.data.freeStrapCount || 0;
      const selectedCount = this.selection.straps.length;
      const showFreePrice = freeCount > 0 && selectedCount < freeCount;

      $$(`#BBStrapsList-${id} .bb-strap-swatch`).forEach(swatch => {
        const priceEl = swatch.querySelector('.bb-strap-swatch__price');
        if (!priceEl) return;

        const price = parseInt(swatch.dataset.variantPrice || '0', 10);
        const compareAtPrice = parseInt(swatch.dataset.variantCompareAtPrice || '0', 10);
        const isOnSale = compareAtPrice > price;

        if (showFreePrice) {
          priceEl.classList.remove('is-on-sale');
          priceEl.innerHTML = '<strong>FREE</strong>';
          return;
        }

        if (isOnSale) {
          priceEl.classList.add('is-on-sale');
          priceEl.innerHTML = `<s>${money(compareAtPrice)}</s><strong>${money(price)}</strong>`;
        } else {
          priceEl.classList.remove('is-on-sale');
          priceEl.innerHTML = `<strong>${money(price)}</strong>`;
        }
      });
    }

    /* --------------------------------------------------------
       Accessory toggle (upsell only)
    -------------------------------------------------------- */
    _toggleAccessory(card) {
      const variantId = parseInt(card.dataset.variantId, 10);
      const title     = card.dataset.productTitle;
      const price     = parseInt(card.dataset.variantPrice, 10);
      const compareAtPrice = parseInt(card.dataset.variantCompareAtPrice || '0', 10);
      const image     = card.querySelector('img')?.src || null;
      const isIncludedCard = card.dataset.included === 'true';

      // Accessory cards are additive: each tap adds one more paid unit.
      // Included cards keep their bundled free line item and add paid extras on top.
      this.selection.accessories.push({ variantId, title, price, compareAtPrice, image, included: false, sourceIncluded: isIncludedCard });
      card.classList.add('is-selected');

      this._updateAccessorySelectionsUI();
      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    _removeAccessory(variantId) {
      const idx = this.selection.accessories.findIndex(a => a.variantId === variantId && !a.included);
      if (idx === -1) return;

      this.selection.accessories.splice(idx, 1);

      const card = document.querySelector(`#BBAccGrid-${this.productId} .bb-acc-card[data-variant-id="${variantId}"]`);
      if (card) {
        const remaining = this.selection.accessories.filter(a => !a.included && a.variantId === variantId).length;
        if (card.dataset.included === 'true') {
          card.classList.add('is-selected');
        } else {
          card.classList.toggle('is-selected', remaining > 0);
        }
      }

      this._updateAccessorySelectionsUI();
      this._updatePrice();
      this._renderLeftBundlePreview();
    }

    _updateAccessorySelectionsUI() {
      const container = this.el.accChips;
      if (!container) return;

      const selectedUpsells = this.selection.accessories.filter(acc => !acc.included);
      if (!selectedUpsells.length) {
        container.innerHTML = '';
        container.style.display = 'none';
        document.querySelectorAll(`#BBAccGrid-${this.productId} .bb-acc-card`).forEach(card => {
          if (card.dataset.included === 'false') {
            card.classList.remove('is-selected');
          }
          card.removeAttribute('data-selected-count');
        });
        return;
      }

      const grouped = selectedUpsells.reduce((acc, item) => {
        if (!acc[item.variantId]) {
          acc[item.variantId] = { ...item, qty: 0, hasIncludedBase: false };
        }
        acc[item.variantId].qty += 1;
        if (item.sourceIncluded) acc[item.variantId].hasIncludedBase = true;
        return acc;
      }, {});

      Object.values(grouped).forEach(group => {
        const card = document.querySelector(`#BBAccGrid-${this.productId} .bb-acc-card[data-variant-id="${group.variantId}"]`);
        if (card) {
          card.classList.add('is-selected');
          card.setAttribute('data-selected-count', String(group.qty));
        }
      });

      document.querySelectorAll(`#BBAccGrid-${this.productId} .bb-acc-card[data-included="false"]`).forEach(card => {
        const variantId = parseInt(card.dataset.variantId || '0', 10);
        if (!grouped[variantId]) {
          card.classList.remove('is-selected');
          card.removeAttribute('data-selected-count');
        }
      });

      document.querySelectorAll(`#BBAccGrid-${this.productId} .bb-acc-card[data-included="true"]`).forEach(card => {
        const variantId = parseInt(card.dataset.variantId || '0', 10);
        if (!grouped[variantId]) {
          card.removeAttribute('data-selected-count');
        }
      });

      container.style.display = 'flex';
      container.innerHTML = Object.values(grouped).map(acc => `
        <div class="bb-acc-chip" data-variant-id="${acc.variantId}">
          <span class="bb-acc-chip__label">${acc.title}${acc.qty > 1 ? ` x${acc.qty}` : ''}</span>
          <span class="bb-acc-chip__price">${acc.hasIncludedBase ? `1 free + ${money(acc.price * acc.qty)}` : `+ ${money(acc.price * acc.qty)}`}</span>
          <button type="button" class="bb-acc-chip__remove" data-variant-id="${acc.variantId}" aria-label="Remove ${acc.title}">×</button>
        </div>
      `).join('');

      container.querySelectorAll('.bb-acc-chip__remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const variantId = parseInt(btn.dataset.variantId || '0', 10);
          if (variantId) this._removeAccessory(variantId);
        });
      });
    }

    /* --------------------------------------------------------
       Price calculation
    -------------------------------------------------------- */
    _calcTotals() {
      let subtotal = 0;
      let compareSubtotal = 0;

      const addLine = (price, compareAtPrice = 0) => {
        subtotal += price;
        const effectiveCompare = compareAtPrice > price ? compareAtPrice : price;
        compareSubtotal += effectiveCompare;
      };

      if (this.selection.watch) addLine(this.selection.watch.price, this.selection.watch.compareAtPrice || 0);
      if (this.selection.plan)  addLine(this.selection.plan.price, 0);

      const freeCount = this.data.freeStrapCount || 0;
      this.selection.straps.forEach((strap, i) => {
        if (i >= freeCount) addLine(strap.price, strap.compareAtPrice || 0);
      });

      this.selection.accessories.forEach(acc => {
        if (!acc.included) addLine(acc.price, acc.compareAtPrice || 0);
      });

      const discountCents = this.data.discountCents || 0;
      const bundlePrice   = Math.max(0, subtotal - discountCents);
      const totalSavings  = Math.max(0, (compareSubtotal - subtotal) + discountCents);
      return { subtotal, compareSubtotal, discountCents, bundlePrice, totalSavings };
    }

    _updatePrice() {
      const { subtotal, compareSubtotal, bundlePrice, totalSavings } = this._calcTotals();
      const showCompare = compareSubtotal > bundlePrice && subtotal > 0;

      if (this.el.priceOrig)        this.el.priceOrig.textContent        = showCompare ? money(compareSubtotal) : '';
      if (this.el.priceFinal)       this.el.priceFinal.textContent       = subtotal > 0 ? money(bundlePrice) : '—';
      if (this.el.savePill) {
        this.el.savePill.textContent = totalSavings > 0 ? `Save ${money(totalSavings)} today` : '';
        this.el.savePill.style.display = totalSavings > 0 ? '' : 'none';
      }
      if (this.el.mobilePriceOrig)  this.el.mobilePriceOrig.textContent  = showCompare ? money(compareSubtotal) : '';
      if (this.el.mobilePriceFinal) this.el.mobilePriceFinal.textContent = subtotal > 0 ? money(bundlePrice) : '—';
    }

    /* --------------------------------------------------------
       Summary
    -------------------------------------------------------- */
    _buildSummary() {
      const list = this.el.summaryList;
      if (!list) return;
      list.innerHTML = '';

      const rows = [];

      if (this.selection.watch) {
        rows.push({
          title: 'Watch',
          variant: this.selection.watch.title,
          price: this.selection.watch.price,
          compareAtPrice: this.selection.watch.compareAtPrice || 0,
          image: this.selection.watch.image,
          included: false,
        });
      }
      if (this.selection.plan) {
        const planData = this.data.plans?.find(p => p.variantId === this.selection.plan.variantId);
        rows.push({ title: this.selection.plan.label, variant: null, price: this.selection.plan.price, compareAtPrice: 0, image: planData?.image || null, icon: 'plan', included: false });
      }

      const freeCount = this.data.freeStrapCount || 0;
      this.selection.straps.forEach((strap, i) => {
        // Use variant image stored on the swatch element
        const swatchEl = document.querySelector(`#BBStrapsList-${this.productId} .bb-strap-swatch[data-variant-id="${strap.variantId}"]`);
        const strapImage = swatchEl?.dataset.variantImage || null;
        rows.push({
          title: strap.productTitle,
          variant: strap.title,
          price: i < freeCount ? 0 : strap.price,
          compareAtPrice: i < freeCount ? 0 : (strap.compareAtPrice || 0),
          image: strapImage,
          included: i < freeCount,
        });
      });

      this.selection.accessories.forEach(acc => {
        rows.push({ title: acc.title, variant: null, price: acc.price, compareAtPrice: acc.compareAtPrice || 0, image: acc.image, included: acc.included });
      });

      const icons = {
        plan: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="13" rx="2" stroke="#171717" stroke-width="1.3"/><path d="M6 4V3a2 2 0 014 0v1M10 4V3a2 2 0 014 0v1" stroke="#171717" stroke-width="1.3"/><path d="M5 10h10M5 13h6" stroke="#171717" stroke-width="1.3" stroke-linecap="round"/></svg>`,
        default: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="3" stroke="#171717" stroke-width="1.2"/></svg>`
      };

      rows.forEach(row => {
        const isOnSale = !row.included && row.compareAtPrice > row.price;
        const el = document.createElement('div');
        el.className = 'bb-summary-row';
        el.innerHTML = `
          <div class="bb-summary-row__thumb">
            ${row.image
              ? `<img src="${row.image}" alt="${row.title}" width="48" height="48" loading="lazy">`
              : (icons[row.icon] || icons.default)
            }
          </div>
          <div class="bb-summary-row__info">
            <div class="bb-summary-row__name">${row.title}</div>
            ${row.variant ? `<div class="bb-summary-row__variant">${row.variant}</div>` : ''}
          </div>
          <div class="bb-summary-row__price ${row.included ? 'bb-summary-row__price--included' : ''}${isOnSale ? ' is-on-sale' : ''}">
            ${row.included
              ? '—'
              : isOnSale
                ? `<s>${money(row.compareAtPrice)}</s><strong>${money(row.price)}</strong>`
                : `<strong>${money(row.price)}</strong>`
            }
          </div>`;
        list.appendChild(el);
      });

      const { subtotal, compareSubtotal, bundlePrice, totalSavings } = this._calcTotals();
      const showCompare = compareSubtotal > bundlePrice;
      if (this.el.summaryOrig)  this.el.summaryOrig.textContent  = showCompare ? money(compareSubtotal) : '';
      if (this.el.summaryFinal) this.el.summaryFinal.textContent = money(bundlePrice);
      if (this.el.summarySave) {
        this.el.summarySave.textContent = totalSavings > 0 ? `You save ${money(totalSavings)} today` : '';
        this.el.summarySave.style.display = totalSavings > 0 ? '' : 'none';
      }
    }

    /* --------------------------------------------------------
       Cart add
    -------------------------------------------------------- */
    _setButtonLoading(btn, isLoading) {
      if (!btn) return;
      btn.classList.toggle('bb-btn--loading', isLoading);
      btn.disabled = isLoading;
    }

    async _addItemsToCart(items) {
      const res = await fetch(theme.routes.cart_add_url, {
        ...theme.utils.fetchConfig(),
        body: JSON.stringify({ items }),
      });
      return res.json();
    }

    async _handleSummaryContinue() {
      const btn = this.el.nextBtn;
      if (!btn || btn.classList.contains('bb-btn--loading')) return;

      // Base bundle was already added on a previous summary submit.
      if (this.bundleAdded) {
        const hasMobileUpsell = this.data.mobileUpsell?.enabled && (this.data.mobileUpsell?.plans || []).length;
        if (hasMobileUpsell) {
          this.currentIdx = Math.min(this.currentIdx + 1, this.slides.length - 1);
          this._renderSlide();
        } else {
          this._openCartAndReset();
        }
        return;
      }

      const items = this._buildBundleCartItems();
      if (!items.length) {
        alert('Please make your selections before adding to cart.');
        return;
      }

      this._setButtonLoading(btn, true);

      try {
        const data = await this._addItemsToCart(items);

        if (data.status || data.description) {
          alert(data.description || 'Something went wrong. Please try again.');
          return;
        }

        this.bundleAdded = true;

        const hasMobileUpsell = this.data.mobileUpsell?.enabled && (this.data.mobileUpsell?.plans || []).length;
        if (!hasMobileUpsell) {
          this._openCartAndReset();
          return;
        }

        this._markStepDone(this.currentIdx);
        this.currentIdx = Math.min(this.currentIdx + 1, this.slides.length - 1);
        this._renderSlide();

      } catch (err) {
        console.error('[BundleBuilder] Cart error', err);
        alert('Something went wrong. Please try again.');
      } finally {
        this._setButtonLoading(btn, false);
      }
    }

    async _addMobileUpsellAndOpenCart() {
      const btn = this.el.nextBtn;
      const selectedPlan = this.selection.mobileUpsellPlan;
      if (!btn || btn.classList.contains('bb-btn--loading')) return;
      if (!selectedPlan?.variantId) {
        alert('Please select a mobile plan to continue.');
        return;
      }

      this._setButtonLoading(btn, true);

      try {
        const items = [];
        items.push(this._stampBundleItem(selectedPlan.variantId));

        const simVariantId = parseInt(this.data.mobileUpsell?.simVariantId || '0', 10);
        if (this.selection.mobileUpsellIncludeSim && simVariantId > 0) {
          items.push(this._stampBundleItem(simVariantId));
        }

        const data = await this._addItemsToCart(items);
        if (data.status || data.description) {
          alert(data.description || 'Something went wrong. Please try again.');
          return;
        }

        this._markStepDone(this.currentIdx);
        this._openCartAndReset();
      } catch (err) {
        console.error('[BundleBuilder] Mobile upsell cart error', err);
        alert('Something went wrong. Please try again.');
      } finally {
        this._setButtonLoading(btn, false);
      }
    }

    _skipMobileUpsell() {
      if (this.slides[this.currentIdx] !== 'mobile-upsell') return;
      this._markStepDone(this.currentIdx);
      this._openCartAndReset();
    }

    _openCartDrawer() {
      const cartDrawer = document.getElementById('CartDrawer');
      if (!cartDrawer) return;

      // Prefer the drawer custom element API when available.
      if (typeof cartDrawer.open === 'function') {
        cartDrawer.open();
        return;
      }

      // Fallback: click any external trigger targeting CartDrawer.
      const triggers = Array.from(document.querySelectorAll('[aria-controls="CartDrawer"]'));
      const externalTrigger = triggers.find(el => !cartDrawer.contains(el));
      externalTrigger?.click();
    }

    _openCartAndReset() {
      this.close();
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { open: true } }));

      requestAnimationFrame(() => {
        this._openCartDrawer();
      });

      // Keep cart drawer open and reset builder state in the background.
      window.setTimeout(() => {
        this._reset();
      }, 320);
    }

    _stampBundleItem(variantId) {
      const bundleKey  = this.data.productHandle;
      const bundleInst = this.bundleId;
      return {
        id: variantId,
        quantity: 1,
        properties: { _bundle_key: bundleKey, _bundle_instance: bundleInst },
      };
    }

    _buildBundleCartItems() {
      const items = [];
      if (this.selection.watch) items.push(this._stampBundleItem(this.selection.watch.variantId));
      if (this.selection.plan)  items.push(this._stampBundleItem(this.selection.plan.variantId));
      this.selection.straps.forEach(s => items.push(this._stampBundleItem(s.variantId)));

      this.selection.accessories.forEach(a => {
        // Included accessory baseline stays in the bundle (free line).
        if (a.included) {
          items.push(this._stampBundleItem(a.variantId));
          return;
        }

        // Extra units added by clicking an included card should be paid.
        // Add these as normal cart lines so the "included free" rule is not reapplied.
        if (a.sourceIncluded) {
          items.push({ id: a.variantId, quantity: 1 });
          return;
        }

        // Upsell accessories remain part of the bundle payload.
        items.push(this._stampBundleItem(a.variantId));
      });

      return items;
    }

    /* --------------------------------------------------------
       Reset after add
    -------------------------------------------------------- */
    _reset() {
      this.bundleId   = uid();
      this.bundleAdded = false;
      this.currentIdx = 0;
      this.selection  = {
        watch: null,
        plan: null,
        straps: [],
        accessories: [],
        mobileUpsellPlan: null,
        mobileUpsellIncludeSim: true,
      };
      this._preselectAll();
      // Re-apply DOM selections so builder is fresh next time it opens
      requestAnimationFrame(() => {
        this._resetStepSidebar();
        this._applyPreselectToDOM();
        this._renderSlide();
        this._updatePrice();
        this._updateStrapCounter();
        this._updateCTA();
        // Remove all is-active strap swatches
        document.querySelectorAll(`#BBStrapsList-${this.productId} .bb-strap-swatch`).forEach(s => {
          s.classList.remove('is-active');
          const badge = s.querySelector('.bb-swatch-qty');
          if (badge) {
            badge.textContent = '';
            badge.style.display = 'none';
          }
        });
        // Remove all upsell accessory selections
        document.querySelectorAll(`#BBAccGrid-${this.productId} .bb-acc-card[data-included="false"]`).forEach(c => c.classList.remove('is-selected'));
        this._updateAccessorySelectionsUI();
      });
    }

    _resetStepSidebar() {
      const id = this.productId;
      const steps = $$(`#BBSteps-${id} .bb-step`);

      steps.forEach((step, i) => {
        step.classList.remove('bb-step--active', 'bb-step--done', 'bb-step--pending');
        step.classList.add(i === 0 ? 'bb-step--active' : 'bb-step--pending');

        const num = step.querySelector('.bb-step__num');
        if (num) {
          num.className = i === 0 ? 'bb-step__num bb-step__num--active' : 'bb-step__num bb-step__num--pending';
        }

        const name = step.querySelector('.bb-step__name');
        if (name) {
          name.classList.toggle('bb-step__name--pending', i !== 0);
        }

        step.querySelectorAll('.bb-step__check, .bb-step__edit').forEach(el => el.remove());

        const valEl = step.querySelector('.bb-step__val');
        if (valEl) {
          valEl.textContent = step.dataset.defaultVal || '';
        }
      });
    }
  }

  /* ----------------------------------------------------------
     Init
  ---------------------------------------------------------- */
  const initialised = new Set();

  function init() {
    $$('[id^="BBData-"]').forEach(el => {
      const productId = el.id.replace('BBData-', '');
      if (productId && !initialised.has(productId)) {
        initialised.add(productId);
        new BundleBuilder(productId);
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also run after a short delay in case of late rendering
  setTimeout(init, 500);

  // Watch for dynamically added content
  const observer = new MutationObserver(() => init());
  observer.observe(document.body, { childList: true, subtree: true });

})();