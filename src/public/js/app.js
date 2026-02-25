(function () {
  function isInteractiveElement(target) {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest(
        "a,button,input,select,textarea,label,summary,details,form,[role='button'],[data-row-ignore]",
      ),
    );
  }

  function navigateToRow(row) {
    let href = String(row.getAttribute("data-row-href") || "").trim();
    if (!href) return;

    // Defensive: some templates may render quoted values like "\"/rota\"".
    const hasDoubleQuotes = href.startsWith('"') && href.endsWith('"');
    const hasSingleQuotes = href.startsWith("'") && href.endsWith("'");
    if (hasDoubleQuotes || hasSingleQuotes) {
      href = href.slice(1, -1).trim();
    }
    if (!href) return;

    window.location.assign(href);
  }

  function enableClickableRows(root = document) {
    const rows = root.querySelectorAll("[data-row-href]");

    rows.forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      if (row.dataset.rowClickableReady === "1") return;

      row.dataset.rowClickableReady = "1";
      row.classList.add("table-row-clickable");
      if (!row.hasAttribute("tabindex")) row.tabIndex = 0;
      if (!row.hasAttribute("role")) row.setAttribute("role", "link");

      row.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (isInteractiveElement(event.target)) return;
        navigateToRow(row);
      });

      row.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (isInteractiveElement(event.target)) return;

        event.preventDefault();
        navigateToRow(row);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enableClickableRows());
    return;
  }

  enableClickableRows();
})();
 
