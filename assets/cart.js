if (!customElements.get('tab-list')) {
  customElements.define(
    'tab-list',
    class TabList extends HTMLUListElement {
      constructor() {
        super();

        this.controls.forEach((button) => button.addEventListener('click', this.handleButtonClick.bind(this)));
      }

      get controls() {
        return this._controls = this._controls || Array.from(this.querySelectorAll('[aria-controls]'));
      }

      handleButtonClick(event) {
        event.preventDefault();

        this.controls.forEach((button) => {
          button.setAttribute('aria-expanded', 'false');

          const panel = document.getElementById(button.getAttribute('aria-controls'));
          panel?.removeAttribute('open');
        });

        const target = event.currentTarget;
        target.setAttribute('aria-expanded', 'true');

        const panel = document.getElementById(target.getAttribute('aria-controls'));
        panel?.setAttribute('open', '');
      }

      reset() {
        const firstControl = this.controls[0];
        firstControl.dispatchEvent(new Event('click'));
      }
    }, { extends: 'ul' }
  );
}

if (!customElements.get('cart-drawer')) {
  customElements.define(
    'cart-drawer',
    class CartDrawer extends DrawerElement {
      constructor() {
        super();

        this.onPrepareBundledSectionsListener = this.onPrepareBundledSections.bind(this);
        this.onCartRefreshListener = this.onCartRefresh.bind(this);
      }

      get sectionId() {
        return this.getAttribute('data-section-id');
      }

      get shouldAppendToBody() {
        return false;
      }

      get recentlyViewed() {
        return this.querySelector('recently-viewed');
      }

      get tabList() {
        return this.querySelector('[is="tab-list"]');
      }

      connectedCallback() {
        super.connectedCallback();

        document.addEventListener('cart:bundled-sections', this.onPrepareBundledSectionsListener);
        document.addEventListener('cart:refresh', this.onCartRefreshListener);
        if (this.recentlyViewed) {
          this.recentlyViewed.addEventListener('is-empty', this.onRecentlyViewedEmpty.bind(this));
        }
      }

      disconnectedCallback() {
        super.disconnectedCallback();
    
        document.removeEventListener('cart:bundled-sections', this.onPrepareBundledSectionsListener);
        document.removeEventListener('cart:refresh', this.onCartRefreshListener);
      }

      onPrepareBundledSections(event) {
        event.detail.sections.push(this.sectionId);
      }

      onRecentlyViewedEmpty() {
        this.recentlyViewed.innerHTML = `
        <div class="drawer__scrollable relative flex justify-center items-start grow shrink text-center">
          <div class="drawer__empty grid gap-5 md:gap-8">
            <p class="drawer__empty-text h2 heading leading-none tracking-tight">${theme.strings.recentlyViewedEmpty}</p>
          </div>
        </div>
        `;
      }

      async onCartRefresh(event) {
        const id = `MiniCart-${this.sectionId}`;
        if (document.getElementById(id) === null) return;

        const responseText = await (await fetch(`${theme.routes.root_url}?section_id=${this.sectionId}`)).text();
        const parsedHTML = new DOMParser().parseFromString(responseText, 'text/html');

        document.getElementById(id).innerHTML = parsedHTML.getElementById(id).innerHTML;

        if (event.detail.open === true) {
          this.show();
        }
      }

      show(focusElement = null, animate = true) {
        super.show(focusElement, animate);

        if (this.tabList) {
          this.tabList.reset();

          if (this.open) {
            theme.a11y.trapFocus(this, this.focusElement);
          }
        }
      }
    }
  );
}

if (!customElements.get('cart-remove-button')) {
  customElements.define(
    'cart-remove-button',
    class CartRemoveButton extends HTMLAnchorElement {
      constructor() {
        super();

        this.addEventListener('click', (event) => {
          event.preventDefault();

          const cartItems = this.closest('cart-items');
          cartItems.updateQuantity(this.getAttribute('data-index'), 0);
        });
      }
    }, { extends: 'a' }
  );
}

if (!customElements.get('cart-items')) {
  customElements.define(
    'cart-items',
    class CartItems extends HTMLElement {
      cartUpdateUnsubscriber = undefined;

      constructor() {
        super();

        this.addEventListener('change', theme.utils.debounce(this.onChange.bind(this), 300));
        this.cartUpdateUnsubscriber = theme.pubsub.subscribe(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, this.onCartUpdate.bind(this));
      }

      get sectionId() {
        return this.getAttribute('data-section-id');
      }

      disconnectedCallback() {
        if (this.cartUpdateUnsubscriber) {
          this.cartUpdateUnsubscriber();
        }
      }

      onChange(event) {
        this.validateQuantity(event);
      }

      onCartUpdate(event) {
        if (event.cart.errors) {
          this.onCartError(event.cart.errors, event.target);
          return;
        }

        if (typeof event.cart.sections === 'undefined') return;
        const sectionToRender = new DOMParser().parseFromString(event.cart.sections[this.sectionId], 'text/html');

        const miniCart = document.querySelector(`#MiniCart-${this.sectionId}`);
        if (miniCart) {
          const updatedElement = sectionToRender.querySelector(`#MiniCart-${this.sectionId}`);
          if (updatedElement) {
            if (event.source === 'cart-discount') {
              const cartDiscount = updatedElement.querySelector(`#CartDiscount-${this.sectionId}`);
              if (cartDiscount) {
                cartDiscount.hidden = false
                cartDiscount.setAttribute('open', 'immediate');
                cartDiscount.setAttribute('active', '');
              }
            }
            miniCart.innerHTML = updatedElement.innerHTML;
          }
        }

        const mainCart = document.querySelector(`#MainCart-${this.sectionId}`);
        if (mainCart) {
          const updatedElement = sectionToRender.querySelector(`#MainCart-${this.sectionId}`);
          if (updatedElement) {
            if (event.source === 'cart-discount') {
              const cartDiscount = updatedElement.querySelector(`#CartDiscount-${this.sectionId}`);
              if (cartDiscount) {
                cartDiscount.hidden = false
                cartDiscount.setAttribute('open', '');
                cartDiscount.setAttribute('aria-expanded', 'true');
              }
            }
            
            const scrollTop = window.scrollY;
            mainCart.innerHTML = updatedElement.innerHTML;

            if (event.source === 'cart-discount') {
              requestIdleCallback(() => {
                window.scrollTo({
                  top: scrollTop,
                  behavior: 'instant'
                });
              });
              
            }
          }
          else {
            mainCart.closest('.cart').classList.add('is-empty');
            mainCart.remove();
          }
        }

        const lineItem = document.getElementById(`CartItem-${event.line}`) || document.getElementById(`CartDrawer-Item-${event.line}`);
        if (lineItem && lineItem.querySelector(`[name="${event.name}"]`)) {
          theme.a11y.trapFocus(mainCart || miniCart, lineItem.querySelector(`[name="${event.name}"]`));
        }
        else if (event.cart.item_count === 0) {
          miniCart
            ? theme.a11y.trapFocus(miniCart, miniCart.querySelector('a'))
            : theme.a11y.trapFocus(document.querySelector('.empty-state'), document.querySelector('.empty-state__link'));
        }
        else {
          miniCart
            ? theme.a11y.trapFocus(miniCart, miniCart.querySelector('.horizontal-product__title'))
            : theme.a11y.trapFocus(mainCart, mainCart.querySelector('.cart__item-title'));
        }

        document.dispatchEvent(new CustomEvent('cart:updated', {
          detail: {
            cart: event.cart
          }
        }));
      }

      onCartError(errors, target) {
        if (target) {
          // this.updateQuantity(target.getAttribute('data-index'), target.defaultValue, document.activeElement.getAttribute('name'), target);
          this.disableLoading(target.getAttribute('data-index'));
          this.setValidity(target, errors);
          return;
        }
        else {
          window.location.href = theme.routes.cart_url;
        }

        alert(errors);
      }

      updateQuantity(line, quantity, name, target) {
        this.enableLoading(line);

        let sectionsToBundle = [];
        document.documentElement.dispatchEvent(new CustomEvent('cart:bundled-sections', { bubbles: true, detail: { sections: sectionsToBundle } }));

        const body = JSON.stringify({
          id: line,
          quantity,
          sections: sectionsToBundle
        });

        fetch(theme.routes.cart_change_url, { ...theme.utils.fetchConfig(), ...{ body } })
          .then((response) => response.json())
          .then((parsedState) => {
            theme.pubsub.publish(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cart: parsedState, target, line, name });
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            }
            else {
              console.error(error);
            }
          });
      }

      enableLoading(line) {
        this.classList.add('pointer-events-none');

        const loader = document.getElementById(`Loader-${this.sectionId}-${line}`);
        if (loader) loader.hidden = false;
      }

      disableLoading(line) {
        this.classList.remove('pointer-events-none');

        const loader = document.getElementById(`Loader-${this.sectionId}-${line}`);
        if (loader) loader.hidden = true;
      }

      setValidity(target, message) {
        target.setCustomValidity(message);
        target.reportValidity();
        target.value = target.defaultValue;
        target.select();
      }

      validateQuantity(event) {
        const target = event.target;
        const inputValue = parseInt(target.value);
        const index = target.getAttribute('data-index');
        let message = '';

        if (inputValue < parseInt(target.getAttribute('data-min'))) {
          message = theme.quickOrderListStrings.minError.replace('[min]', target.getAttribute('data-min'));
        }
        else if (inputValue > parseInt(target.max)) {
          message = theme.quickOrderListStrings.maxError.replace('[max]', target.max);
        }
        else if (inputValue % parseInt(target.step) !== 0) {
          message = theme.quickOrderListStrings.stepError.replace('[step]', target.step);
        }

        if (message) {
          this.setValidity(target, message);
        }
        else {
          target.setCustomValidity('');
          target.reportValidity();
          this.updateQuantity(index, inputValue, document.activeElement.getAttribute('name'), target);
        }
      }
    }
  );
}

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener('change', theme.utils.debounce(this.onChange.bind(this), 300));
      }

      onChange(event) {
        const body = JSON.stringify({ note: event.target.value });
        fetch(theme.routes.cart_update_url, { ...theme.utils.fetchConfig(), ...{ body } });
      }
    }
  );
}

if (!customElements.get('main-cart')) {
  customElements.define(
    'main-cart',
    class MainCart extends HTMLElement {
      constructor() {
        super();

        document.addEventListener('cart:bundled-sections', this.onPrepareBundledSections.bind(this));
      }

      get sectionId() {
        return this.getAttribute('data-section-id');
      }

      onPrepareBundledSections(event) {
        event.detail.sections.push(this.sectionId);
      }
    }
  );
}

if (!customElements.get('country-province')) {
  customElements.define(
    'country-province',
    class CountryProvince extends HTMLElement {
      constructor() {
        super();

        this.provinceElement = this.querySelector('[name="address[province]"]');
        this.countryElement = this.querySelector('[name="address[country]"]');
        this.countryElement.addEventListener('change', this.handleCountryChange.bind(this));

        if (this.getAttribute('country') !== '') {
          this.countryElement.selectedIndex = Math.max(0, Array.from(this.countryElement.options).findIndex((option) => option.textContent === this.getAttribute('data-country')));
          this.countryElement.dispatchEvent(new Event('change'));
        }
        else {
          this.handleCountryChange();
        }
      }

      handleCountryChange() {
        const option = this.countryElement.options[this.countryElement.selectedIndex], provinces = JSON.parse(option.getAttribute('data-provinces'));
        this.provinceElement.parentElement.hidden = provinces.length === 0;

        if (provinces.length === 0) {
          return;
        }

        this.provinceElement.innerHTML = '';

        provinces.forEach((data) => {
          const selected = data[1] === this.getAttribute('data-province');
          this.provinceElement.options.add(new Option(data[1], data[0], selected, selected));
        });
      }
    }
  );
}

if (!customElements.get('shipping-calculator')) {
  customElements.define(
    'shipping-calculator',
    class ShippingCalculator extends HTMLFormElement {
      constructor() {
        super();

        this.onSubmitHandler = this.onSubmit.bind(this);
      }

      connectedCallback() {
        this.submitButton = this.querySelector('[type="submit"]');
        this.resultsElement = this.lastElementChild;

        this.submitButton.addEventListener('click', this.onSubmitHandler);
      }

      disconnectedCallback() {
        this.abortController?.abort();
        this.submitButton.removeEventListener('click', this.onSubmitHandler);
      }

      onSubmit(event) {
        event.preventDefault();

        this.abortController?.abort();
        this.abortController = new AbortController();

        const zip = this.querySelector('[name="address[zip]"]').value,
          country = this.querySelector('[name="address[country]"]').value,
          province = this.querySelector('[name="address[province]"]').value;

        this.submitButton.setAttribute('aria-busy', 'true');

        const body = JSON.stringify({
          shipping_address: { zip, country, province }
        });
        let sectionUrl = `${theme.routes.cart_url}/shipping_rates.json`;

        // remove double `/` in case shop might have /en or language in URL
        sectionUrl = sectionUrl.replace('//', '/');

        fetch(sectionUrl, { ...theme.utils.fetchConfig('javascript'), ...{ body }, signal: this.abortController.signal })
          .then((response) => response.json())
          .then((parsedState) => {
            if (parsedState.shipping_rates) {
              this.formatShippingRates(parsedState.shipping_rates);
            }
            else {
              this.formatError(parsedState);
            }
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            }
            else {
              console.error(error);
            }
          })
          .finally(() => {
            this.resultsElement.hidden = false;
            this.submitButton.removeAttribute('aria-busy');
          });
      }

      formatError(errors) {
        const shippingRatesList = Object.keys(errors).map((errorKey) => {
          return `<li>${errors[errorKey]}</li>`;
        });
        this.resultsElement.classList.remove('alert--success');
        this.resultsElement.classList.add('alert--error');
        this.resultsElement.lastElementChild.innerHTML = `
          <p>${theme.shippingCalculatorStrings.error}</p>
          <ul class="list-disc grid gap-2" role="list">${shippingRatesList.join('')}</ul>
        `;
      }

      formatShippingRates(shippingRates) {
        const shippingRatesList = shippingRates.map(({ presentment_name, currency, price }) => {
          return `<li>${presentment_name}: ${currency} ${price}</li>`;
        });
        if (shippingRates.length) {
          this.resultsElement.classList.remove('alert--error');
          this.resultsElement.classList.add('alert--success');
        }
        else {
          this.resultsElement.classList.remove('alert--success');
          this.resultsElement.classList.add('alert--error');
        }
        this.resultsElement.lastElementChild.innerHTML = `
          <p>${shippingRates.length === 0 ? theme.shippingCalculatorStrings.notFound : shippingRates.length === 1 ? theme.shippingCalculatorStrings.oneResult : theme.shippingCalculatorStrings.multipleResults}</p>
          ${shippingRatesList === '' ? '' : `<ul class="list-disc grid gap-2" role="list">${shippingRatesList.join('')}</ul>`}
        `;
      }
    }, { extends: 'form' }
  );
}

if (!customElements.get('cart-discount')) {
  customElements.define(
    'cart-discount',
    class CartDiscount extends HTMLFormElement {
      constructor() {
        super();

        this.onApplyDiscount = this.applyDiscount.bind(this);
      }

      get sectionId() {
        return this.getAttribute('data-section-id');
      }
      
      connectedCallback() {
        this.submitButton = this.querySelector('[type="submit"]');
        this.resultsElement = this.lastElementChild;

        this.submitButton.addEventListener('click', this.onApplyDiscount);
      }

      disconnectedCallback() {
        this.abortController?.abort();
        this.submitButton.removeEventListener('click', this.onApplyDiscount);
      }

      applyDiscount(event) {
        event.preventDefault();

        const discountCode = this.querySelector('[name="discount"]');
        if (!(discountCode instanceof HTMLInputElement) || typeof this.getAttribute('data-section-id') !== 'string') return;

        this.abortController?.abort();
        this.abortController = new AbortController();

        const discountCodeValue = discountCode.value.trim();
        if (discountCodeValue === '') return;

        const existingDiscounts = this.existingDiscounts();
        if (existingDiscounts.includes(discountCodeValue)) return;

        this.setDiscountError('');
        this.submitButton.setAttribute('aria-busy', 'true');

        const body = JSON.stringify({
          discount: [...existingDiscounts, discountCodeValue].join(','),
          sections: [this.sectionId]
        });
        
        fetch(theme.routes.cart_update_url, { ...theme.utils.fetchConfig('json'), ...{ body }, signal: this.abortController.signal })
          .then((response) => response.json())
          .then((parsedState) => {
            if (
              parsedState.discount_codes.find((discount) => {
                return discount.code === discountCodeValue && discount.applicable === false;
              })
            ) {
              discountCode.value = '';
              this.setDiscountError(theme.discountStrings.error);
              return;
            }

            const newHtml = parsedState.sections[this.sectionId];
            const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
            const section = parsedHtml.getElementById(`shopify-section-${this.sectionId}`);
            if (section) {
              const discountCodes = section?.querySelectorAll('button[is="discount-remove"]') || [];
              const codes = Array.from(discountCodes)
                .map((element) => (element instanceof HTMLButtonElement ? element.getAttribute('data-discount') : null))
                .filter(Boolean);

              if (
                codes.length === existingDiscounts.length &&
                codes.every((code) => existingDiscounts.includes(code)) &&
                parsedState.discount_codes.find((discount) => {
                  return discount.code === discountCodeValue && discount.applicable === true;
                })
              ) {
                discountCode.value = '';
                this.setDiscountError(theme.discountStrings.shippingError);
                return;
              }
            }

            theme.pubsub.publish(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, { source: 'cart-discount', cart: parsedState });
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            }
            else {
              console.error(error);
            }
          })
          .finally(() => {
            this.submitButton.removeAttribute('aria-busy');
          });
      }

      removeDiscount(event) {
        if ((event instanceof KeyboardEvent && event.key !== 'Enter') || !(event instanceof MouseEvent)) {
          return;
        }

        const discountCode = event.target.getAttribute('data-discount');
        if (!discountCode) return;

        const existingDiscounts = this.existingDiscounts();
        const index = existingDiscounts.indexOf(discountCode);
        if (index === -1) return;

        existingDiscounts.splice(index, 1);

        this.abortController?.abort();
        this.abortController = new AbortController();

        this.setDiscountError('');
        event.target.setAttribute('loading', '');

        const body = JSON.stringify({
          discount: existingDiscounts.join(','),
          sections: [this.sectionId]
        });
        
        fetch(theme.routes.cart_update_url, { ...theme.utils.fetchConfig('json'), ...{ body }, signal: this.abortController.signal })
          .then((response) => response.json())
          .then((parsedState) => {
            theme.pubsub.publish(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, { source: 'cart-discount', cart: parsedState });
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            }
            else {
              console.error(error);
            }
          })
          .finally(() => {
            event.target.removeAttribute('loading');
          });
      }

      existingDiscounts() {
        const discountCodes = [];
        const discountPills = this.querySelectorAll('button[is="discount-remove"]');
        for (const pill of discountPills) {
          if (pill.hasAttribute('data-discount')) {
            discountCodes.push(pill.getAttribute('data-discount'));
          }
        }
        return discountCodes;
      }

      setDiscountError(error) {
        this.resultsElement.lastElementChild.textContent = error;
        this.resultsElement.hidden = error.length === 0;
      }
    }, { extends: 'form' }
  );
}

if (!customElements.get('discount-remove')) {
  customElements.define(
    'discount-remove',
    class DiscountRemove extends MagnetButton {
      constructor() {
        super();

        this.addEventListener('click', this.onClick);
      }

      onClick(event) {
        const form = this.closest('form[is="cart-discount"]') || document.querySelector('form[is="cart-discount"]');

        if (form) {
          event.preventDefault();
          form.removeDiscount(event);
        }
      }
    }, { extends: 'button' }
  );
}
(() => {
  const SHIPPING_PROTECTION_ATTRIBUTE = 'shipping_protection_opt_in';
  const CHECKOUT_URL = '/checkout';
  const AU_COUNTRY = 'AU';
  const AU_CURRENCY = 'AUD';

  let shippingProtectionBusy = false;
  let lastCheckoutButton = null;

  function getShippingProtectionWidget() {
    return document.querySelector('[data-shipping-protection]');
  }

  function isAuShippingProtectionContext() {
    const widget = getShippingProtectionWidget();
    if (!widget) return false;
    return (
      widget.getAttribute('data-country') === AU_COUNTRY &&
      widget.getAttribute('data-currency') === AU_CURRENCY
    );
  }

  function getShippingProtectionVariantId() {
    const widget = getShippingProtectionWidget();
    if (!widget) return null;
    const id = parseInt(widget.getAttribute('data-variant-id'), 10);
    return Number.isFinite(id) ? id : null;
  }

  function getShippingProtectionEnabledFromUI() {
    const toggle = document.querySelector('[data-shipping-protection-toggle]');
    if (!toggle) return true;
    return !!toggle.checked;
  }

  function setShippingProtectionLoading(isLoading) {
    document.querySelectorAll('[data-shipping-protection]').forEach((widget) => {
      widget.classList.toggle('is-loading', isLoading);
    });

    document.querySelectorAll('[data-shipping-protection-toggle]').forEach((toggle) => {
      toggle.disabled = isLoading;
    });
  }

  function getBundledSections() {
    let sectionsToBundle = [];
    document.documentElement.dispatchEvent(new CustomEvent('cart:bundled-sections', {
      bubbles: true,
      detail: { sections: sectionsToBundle }
    }));
    return sectionsToBundle;
  }

  async function updateShippingProtectionPreference(enabled) {
    const sections = getBundledSections();
    const body = JSON.stringify({
      attributes: {
        [SHIPPING_PROTECTION_ATTRIBUTE]: enabled ? 'yes' : 'no'
      },
      sections
    });

    const response = await fetch(theme.routes.cart_update_url, {
      ...theme.utils.fetchConfig('json'),
      body
    });

    const parsedState = await response.json();

    if (theme.pubsub?.publish) {
      theme.pubsub.publish(theme.pubsub.PUB_SUB_EVENTS.cartUpdate, {
        source: 'shipping-protection',
        cart: parsedState
      });
    } else {
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { open: true } }));
    }

    return parsedState;
  }

  async function fetchCartState() {
    const response = await fetch(`${theme.routes.cart_url}.js`, {
      headers: { 'Accept': 'application/json' }
    });
    return await response.json();
  }

  async function addShippingProtection(variantId) {
    const body = JSON.stringify({
      items: [{ id: variantId, quantity: 1 }]
    });

    await fetch(theme.routes.cart_add_url, {
      ...theme.utils.fetchConfig('json'),
      body
    });
  }

  async function updateShippingProtectionLines(updates) {
    await fetch(theme.routes.cart_update_url, {
      ...theme.utils.fetchConfig('json'),
      body: JSON.stringify({ updates })
    });
  }

  async function syncShippingProtectionBeforeCheckout() {
    if (!isAuShippingProtectionContext()) {
      window.location.href = CHECKOUT_URL;
      return;
    }

    const variantId = getShippingProtectionVariantId();
    if (!variantId) {
      window.location.href = CHECKOUT_URL;
      return;
    }

    const enabled = getShippingProtectionEnabledFromUI();
    const cart = await fetchCartState();
    const matchingItems = (cart.items || []).filter((item) => item.variant_id === variantId);

    if (enabled) {
      if (matchingItems.length === 0) {
        await addShippingProtection(variantId);
      } else {
        const updates = {};
        matchingItems.forEach((item, index) => {
          updates[item.key] = index === 0 ? 1 : 0;
        });

        const needsUpdate = matchingItems.length > 1 || matchingItems[0].quantity !== 1;
        if (needsUpdate) {
          await updateShippingProtectionLines(updates);
        }
      }
    } else {
      if (matchingItems.length > 0) {
        const updates = {};
        matchingItems.forEach((item) => {
          updates[item.key] = 0;
        });
        await updateShippingProtectionLines(updates);
      }
    }

    window.location.href = CHECKOUT_URL;
  }

  document.addEventListener('change', async (event) => {
    const toggle = event.target.closest('[data-shipping-protection-toggle]');
    if (!toggle || shippingProtectionBusy) return;
    if (!isAuShippingProtectionContext()) return;

    try {
      shippingProtectionBusy = true;
      setShippingProtectionLoading(true);
      await updateShippingProtectionPreference(toggle.checked);
    } catch (error) {
      console.error('Shipping protection preference update failed:', error);
      toggle.checked = !toggle.checked;
      alert('We could not update Shipping Protection just now. Please try again.');
    } finally {
      shippingProtectionBusy = false;
      setShippingProtectionLoading(false);
    }
  });

  document.addEventListener('click', (event) => {
    const checkoutButton = event.target.closest('button[name="checkout"]');
    if (checkoutButton) {
      lastCheckoutButton = checkoutButton;
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const submitter = event.submitter || lastCheckoutButton;
    if (!submitter || submitter.getAttribute('name') !== 'checkout') return;

    if (!isAuShippingProtectionContext()) return;

    event.preventDefault();

    if (shippingProtectionBusy) return;

    try {
      shippingProtectionBusy = true;
      setShippingProtectionLoading(true);
      await syncShippingProtectionBeforeCheckout();
    } catch (error) {
      console.error('Shipping protection checkout sync failed:', error);
      alert('We could not prepare Shipping Protection for checkout. Please try again.');
      shippingProtectionBusy = false;
      setShippingProtectionLoading(false);
    }
  });
})();
