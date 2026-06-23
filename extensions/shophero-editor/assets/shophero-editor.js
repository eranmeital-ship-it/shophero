/*
 * ShopHero click-to-edit bridge (runs on the storefront).
 *
 * Dormant by default. Only when ShopHero's preview iframe sends "shophero:enable"
 * does it highlight elements on hover and report clicks back via postMessage.
 * Has no effect for real shoppers (it only acts inside the ShopHero preview and
 * only after an explicit enable message from the parent app).
 */
(function () {
  // Two ways ShopHero drives this:
  //  1) inside its preview IFRAME (talks to window.parent), or
  //  2) in a POPUP window opened with ?shophero_edit=1 (talks to window.opener) —
  //     used when the storefront can't be framed (e.g. password-protected dev
  //     stores, which serve a frame-blocked password page).
  var params = (function () { try { return new URLSearchParams(location.search); } catch (e) { return null; } })();
  var popupEdit = !!params && params.get("shophero_edit") === "1";
  var inFrame = window.top !== window.self;
  if (!inFrame && !popupEdit) return; // real shopper — do nothing
  var targetWin = inFrame ? window.parent : window.opener;
  if (!targetWin) return;

  // In popup mode the selection payload is non-sensitive DOM info, so post to "*"
  // — avoids silent drops when the opener origin doesn't byte-match the param.
  var parentOrigin = popupEdit ? "*" : null;
  var enabled = false;
  var box = null;
  var label = null;
  var current = null;
  var raf = 0;

  function ensureOverlay() {
    if (box) return;
    box = document.createElement("div");
    box.style.cssText =
      "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #0a84ff;" +
      "background:rgba(10,132,255,0.12);border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.6);display:none;";
    label = document.createElement("div");
    label.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;background:#0a84ff;color:#fff;" +
      "font:600 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2px 8px;" +
      "border-radius:6px;white-space:nowrap;display:none;box-shadow:0 2px 8px rgba(0,0,0,.25);";
    (document.body || document.documentElement).appendChild(box);
    (document.body || document.documentElement).appendChild(label);
  }
  function removeOverlay() {
    if (box) box.remove();
    if (label) label.remove();
    box = label = null;
  }

  function sectionInfo(el) {
    var sec = el.closest ? el.closest('[id^="shopify-section-"]') : null;
    var id = sec ? sec.id.replace("shopify-section-", "") : "";
    var type = id.indexOf("__") !== -1 ? id.split("__").pop() : id;
    return { sectionId: id, sectionType: type };
  }
  function readableName(el, info) {
    var t = el.tagName.toLowerCase();
    var map = { h1: "Heading", h2: "Heading", h3: "Heading", h4: "Heading", p: "Text", span: "Text",
      img: "Image", a: "Link / button", button: "Button", ul: "List", ol: "List", li: "List item",
      section: "Section", svg: "Icon", input: "Field", form: "Form" };
    var nice = map[t] || t;
    var sect = info.sectionType ? info.sectionType.replace(/[-_]/g, " ").trim() : "";
    return (sect ? sect + " › " : "") + nice;
  }
  function cssPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var sel = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(sel + "#" + node.id); break; }
      if (typeof node.className === "string" && node.className.trim()) {
        var c = node.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (c) sel += "." + c;
      }
      var parent = node.parentNode;
      if (parent && parent.children) {
        var same = Array.prototype.filter.call(parent.children, function (s) { return s.tagName === node.tagName; });
        if (same.length > 1) sel += ":nth-of-type(" + (Array.prototype.indexOf.call(same, node) + 1) + ")";
      }
      parts.unshift(sel);
      node = node.parentNode;
    }
    return parts.join(" > ");
  }

  function position(el) {
    if (!box) return;
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    label.textContent = readableName(el, sectionInfo(el));
    label.style.display = "block";
    label.style.left = r.left + "px";
    label.style.top = (r.top - 20 < 0 ? r.top + 2 : r.top - 20) + "px";
  }

  function onMove(e) {
    if (!enabled) return;
    var el = e.target;
    if (!el || el === box || el === label) return;
    current = el;
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; if (current) position(current); });
  }
  var panel = null;
  function onClick(e) {
    if (!enabled) return;
    if (panel && panel.contains(e.target)) return; // clicks inside our editor panel
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || el === box || el === label) return;
    var info = sectionInfo(el);
    var payload = {
      type: "shophero:select",
      name: readableName(el, info),
      sectionType: info.sectionType,
      sectionId: info.sectionId,
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || "").trim().slice(0, 180),
      html: (el.outerHTML || "").slice(0, 400),
    };
    // Popup mode: ask for the change right here so the merchant never leaves the
    // storefront window. Iframe mode: hand the selection to the app's own modal.
    if (popupEdit) showEditPanel(payload);
    else if (parentOrigin) targetWin.postMessage(payload, parentOrigin);
  }

  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function showEditPanel(payload) {
    closePanel();
    panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;width:min(560px,92vw);" +
      "background:#fff;color:#111;border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.32);padding:16px 16px 14px;" +
      "font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    var name = document.createElement("div");
    name.style.cssText = "font-weight:700;font-size:14px;margin-bottom:2px;";
    name.textContent = "✏️ " + payload.name;
    var snippet = document.createElement("div");
    snippet.style.cssText = "font-size:12px;color:#667085;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    snippet.textContent = payload.text ? "“" + payload.text.slice(0, 90) + "”" : "";
    var ta = document.createElement("textarea");
    ta.placeholder = "What do you want to change? e.g. make this headline bigger and say ‘Winter Sale’";
    ta.style.cssText = "width:100%;box-sizing:border-box;min-height:64px;resize:vertical;border:1px solid #d0d5dd;border-radius:10px;padding:10px 12px;font:inherit;outline:none;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:10px;";
    var cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "font:600 13px inherit;cursor:pointer;border:none;background:none;color:#667085;padding:8px 12px;";
    var apply = document.createElement("button");
    apply.textContent = "Make change →";
    apply.style.cssText = "font:700 13px inherit;cursor:pointer;border:none;background:#16a34a;color:#fff;padding:8px 16px;border-radius:999px;";
    function submit() {
      var v = ta.value.trim();
      if (!v) { ta.focus(); return; }
      var msg = {}; for (var k in payload) msg[k] = payload[k];
      msg.type = "shophero:edit";
      msg.instruction = v;
      try { targetWin.postMessage(msg, parentOrigin || "*"); } catch (err) {}
      apply.textContent = "Sent ✓ — switch to ShopHero";
      apply.disabled = true; apply.style.background = "#667085";
      setTimeout(closePanel, 2200);
    }
    cancel.onclick = closePanel;
    apply.onclick = submit;
    ta.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); submit(); } });
    row.appendChild(cancel); row.appendChild(apply);
    panel.appendChild(name);
    if (payload.text) panel.appendChild(snippet);
    panel.appendChild(ta); panel.appendChild(row);
    (document.body || document.documentElement).appendChild(panel);
    ta.focus();
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    ensureOverlay();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.documentElement.style.cursor = "crosshair";
  }
  function disable() {
    enabled = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    removeOverlay();
    document.documentElement.style.cursor = "";
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type === "shophero:ping") {
      parentOrigin = e.origin;
      targetWin.postMessage({ type: "shophero:ready" }, e.origin);
    } else if (d.type === "shophero:enable") {
      parentOrigin = e.origin;
      enable();
    } else if (d.type === "shophero:disable") {
      disable();
    }
  });

  // Announce readiness so the parent knows the embed is installed & active.
  try { targetWin.postMessage({ type: "shophero:ready" }, "*"); } catch (err) {}

  // Popup mode: there's no parent to send an enable message, so turn selection on
  // ourselves and show a small banner telling the merchant to click an element.
  if (popupEdit) {
    var start = function () {
      enable();
      var bar = document.createElement("div");
      bar.textContent = "🖱 ShopHero edit mode — click any element to change it";
      bar.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;" +
        "background:#0a84ff;color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        "padding:9px 16px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;";
      (document.body || document.documentElement).appendChild(bar);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
