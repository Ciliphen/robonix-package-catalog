/* Robonix Package Catalog — shared behaviour.
 *
 * Three independent pieces, each a no-op when its markup is absent:
 * the theme toggle, the masthead search, and the listing filter/sort.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------- theme */

  const THEME_KEY = "robonix-catalog-theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const MODES = ["auto", "light", "dark"];

  // 'auto' is a real stored state, not the absence of one. Treating any
  // truthy value as an explicit choice pinned everyone who had used the
  // previous switcher to light, whatever their system was set to.
  const readPref = () => {
    let v = null;
    try {
      v = localStorage.getItem(THEME_KEY);
    } catch (_) {}
    return v === "light" || v === "dark" ? v : "auto";
  };

  const apply = (pref) => {
    const dark = pref === "dark" || (pref === "auto" && media.matches);
    const root = document.documentElement;
    root.dataset.bsTheme = dark ? "dark" : "light";
    root.dataset.themePref = pref;
    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      const label = { auto: "following system", light: "light", dark: "dark" }[pref];
      toggle.title = `Colour theme: ${label}`;
      toggle.setAttribute("aria-label", `Colour theme: ${label}`);
    }
  };

  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = MODES[(MODES.indexOf(readPref()) + 1) % MODES.length];
      // Storing 'auto' keeps the choice explicit across pages; the reader
      // asked to follow the system rather than merely never having chosen.
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) {}
      apply(next);
    });
  }

  media.addEventListener("change", () => {
    if (readPref() === "auto") apply("auto");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) apply(readPref());
  });
  apply(readPref());

  /* --------------------------------------------------------- masthead */

  const omni = document.getElementById("omnisearch");
  if (omni) {
    // "/" focuses search from anywhere, the way a code host does it.
    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable) return;
      event.preventDefault();
      omni.focus();
      omni.select();
    });
    omni.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        omni.value = "";
        omni.dispatchEvent(new Event("input", { bubbles: true }));
        omni.blur();
      }
    });
  }

  /* ---------------------------------------------------------- listing */

  const listing = document.querySelector("[data-listing]");
  if (!listing) {
    // Off the listing pages the masthead field is a jump-to-search box.
    const form = document.getElementById("omnisearch-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const q = omni.value.trim();
        window.location.href = form.dataset.target + (q ? "?q=" + encodeURIComponent(q) : "");
      });
    }
    return;
  }

  const noun = listing.dataset.listing;
  const rows = Array.from(listing.querySelectorAll("[data-entry]"));
  const list = listing.querySelector("[data-entry-list]");
  const countEl = listing.querySelector("[data-count]");
  const emptyEl = listing.querySelector("[data-empty]");
  const sortEl = listing.querySelector("[data-sort]");
  const clearEl = listing.querySelector("[data-clear]");
  const pagerEl = listing.querySelector("[data-pager]");
  const pagerListEl = listing.querySelector("[data-pager-list]");
  const rangeEl = listing.querySelector("[data-page-range]");
  const params = new URLSearchParams(window.location.search);

  // Every row is already in the DOM, so paging is presentational: without
  // JavaScript the page simply shows the whole list.
  const PAGE_SIZE = 20;

  const state = {
    q: params.get("q") || "",
    kind: params.get("kind") || "",
    tag: params.get("tag") || "",
    sort: params.get("sort") || "name",
    page: Math.max(1, Number(params.get("page")) || 1),
  };

  if (omni) omni.value = state.q;
  if (sortEl) sortEl.value = state.sort;

  const collator = new Intl.Collator("en");
  const sorters = {
    name: (a, b) => collator.compare(a.dataset.name, b.dataset.name),
    kind: (a, b) =>
      collator.compare(a.dataset.kind, b.dataset.kind) ||
      collator.compare(a.dataset.name, b.dataset.name),
    units: (a, b) =>
      Number(b.dataset.units) - Number(a.dataset.units) ||
      collator.compare(a.dataset.name, b.dataset.name),
  };

  const syncPressed = (selector, attr, value) => {
    for (const button of listing.querySelectorAll(selector)) {
      button.setAttribute("aria-pressed", String(button.dataset[attr] === value));
    }
  };

  /* Page controls: first and last are always reachable, the current page keeps
   * a neighbour on each side, and the gaps collapse into an ellipsis. */
  const pageItems = (current, total) => {
    const wanted = new Set([1, total, current, current - 1, current + 1]);
    const numbers = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const items = [];
    let previous = 0;
    for (const n of numbers) {
      if (previous && n - previous > 1) items.push(null);
      items.push(n);
      previous = n;
    }
    return items;
  };

  const renderPager = (current, total) => {
    if (!pagerEl || !pagerListEl) return;
    pagerEl.hidden = total < 2;
    if (total < 2) {
      pagerListEl.replaceChildren();
      return;
    }
    const build = (label, page, { disabled = false, active = false, gap = false } = {}) => {
      const li = document.createElement("li");
      li.className = `page-item${disabled || gap ? " disabled" : ""}${active ? " active" : ""}`;
      const node = document.createElement(gap || disabled ? "span" : "button");
      node.className = "page-link";
      node.textContent = label;
      if (!gap && !disabled) {
        node.type = "button";
        node.dataset.page = String(page);
      }
      if (active) node.setAttribute("aria-current", "page");
      if (!gap && !disabled && typeof page === "number") {
        node.setAttribute("aria-label", `Page ${page}`);
      }
      li.appendChild(node);
      return li;
    };

    const children = [build("Previous", current - 1, { disabled: current === 1 })];
    for (const n of pageItems(current, total)) {
      children.push(n === null ? build("…", 0, { gap: true }) : build(String(n), n, { active: n === current }));
    }
    children.push(build("Next", current + 1, { disabled: current === total }));
    pagerListEl.replaceChildren(...children);
  };

  const render = () => {
    const q = state.q.trim().toLowerCase();
    const matched = rows.filter(
      (row) =>
        (!q || row.dataset.search.includes(q)) &&
        (!state.kind || row.dataset.kind === state.kind) &&
        (!state.tag || row.dataset.tags.split(" ").includes(state.tag)),
    );

    const sorter = sorters[state.sort] || sorters.name;
    matched.sort(sorter);

    // Re-inserting a node restarts any CSS animation on it, so only touch the
    // DOM when the order actually changed. The server already emits rows in
    // name order, which means the default sort moves nothing at all.
    const ordered = [...rows].sort(sorter);
    const current = Array.from(list.children);
    if (ordered.some((row, i) => row !== current[i])) {
      const frag = document.createDocumentFragment();
      for (const row of ordered) frag.appendChild(row);
      list.appendChild(frag);
    }

    const total = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), total);
    const start = (state.page - 1) * PAGE_SIZE;
    const onPage = new Set(matched.slice(start, start + PAGE_SIZE));
    for (const row of rows) row.hidden = !onPage.has(row);

    const shown = matched.length;
    if (countEl) {
      // The header counts what matched, never the packages a filter left
      // out. Filtered to one kind it also says how many skills (services,
      // primitives) those packages hold: "17 packages, 23 skills". A kind no
      // row has (a hand-typed ?kind=) matches nothing and names nothing.
      let provided = "";
      if (state.kind && state.kind !== "robot" && shown) {
        const n = matched.reduce((sum, row) => sum + (Number(row.dataset.provides) || 0), 0);
        provided = `, <b>${n}</b> ${n === 1 ? state.kind : `${state.kind}s`}`;
      }
      countEl.innerHTML = `<b>${shown}</b> ${noun}${provided}`;
    }
    // The header counts the whole match; which slice this page shows is
    // said beside the page controls.
    if (rangeEl) {
      const last = Math.min(start + PAGE_SIZE, shown);
      rangeEl.textContent = `${start + 1}–${last} of ${shown}`;
    }
    renderPager(state.page, total);
    if (emptyEl) emptyEl.hidden = shown !== 0;
    if (clearEl) clearEl.hidden = !(q || state.kind || state.tag);

    syncPressed("[data-kind-filter]", "kindFilter", state.kind);
    syncPressed("[data-tag-filter]", "tagFilter", state.tag);

    // Skills / Services / Primitives are one page behind three nav links, so
    // the masthead has to follow the kind filter rather than the URL path.
    for (const link of document.querySelectorAll("[data-nav-kind]")) {
      if (link.dataset.navKind === state.kind) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    const url = new URL(window.location.href);
    const defaults = { sort: "name", page: 1 };
    for (const [key, value] of Object.entries(state)) {
      if (value && value !== defaults[key]) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, "", url);
  };

  // Any change to what is being listed invalidates the current page number.
  const refilter = () => {
    state.page = 1;
    render();
  };

  if (omni) {
    omni.addEventListener("input", () => {
      state.q = omni.value;
      refilter();
    });
    const form = document.getElementById("omnisearch-form");
    if (form) form.addEventListener("submit", (event) => event.preventDefault());
  }

  listing.addEventListener("click", (event) => {
    const kindButton = event.target.closest("[data-kind-filter]");
    if (kindButton) {
      // Clicking the active facet clears it, so the rail needs no "All" row.
      state.kind = state.kind === kindButton.dataset.kindFilter ? "" : kindButton.dataset.kindFilter;
      refilter();
      return;
    }
    const tagButton = event.target.closest("[data-tag-filter]");
    if (tagButton) {
      event.preventDefault();
      state.tag = state.tag === tagButton.dataset.tagFilter ? "" : tagButton.dataset.tagFilter;
      refilter();
      return;
    }
    const more = event.target.closest("[data-facet-more]");
    if (more) {
      for (const hidden of listing.querySelectorAll("[data-tag-overflow]")) hidden.hidden = false;
      more.hidden = true;
      return;
    }
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      state.page = Number(pageButton.dataset.page);
      render();
      // Paging without this leaves the reader at the old scroll offset,
      // looking at the middle of a list that just changed under them.
      listing.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });

  if (sortEl) {
    sortEl.addEventListener("change", () => {
      state.sort = sortEl.value;
      refilter();
    });
  }

  if (clearEl) {
    clearEl.addEventListener("click", () => {
      state.q = "";
      state.kind = "";
      state.tag = "";
      if (omni) omni.value = "";
      refilter();
    });
  }

  render();
  // The stylesheet's pre-paint filter has done its job; from here the script
  // owns which rows are visible.
  delete document.documentElement.dataset.prefilterKind;
})();
