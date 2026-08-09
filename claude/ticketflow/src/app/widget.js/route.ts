import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /widget.js — the embeddable contact form.
 *
 * Embed with:
 *   <script src="https://your-ticketflow/widget.js"
 *           data-workspace="agent"
 *           data-color="#1e1e1e"
 *           data-label="Support"></script>
 *
 * It renders inside a shadow root so the host page's CSS cannot affect it and
 * ours cannot leak out. No framework, no external requests.
 */
export async function GET() {
  const appUrl = env().APP_URL;

  const script = `(function () {
  "use strict";

  var current = document.currentScript;
  if (!current) return;

  var workspace = current.getAttribute("data-workspace");
  if (!workspace) {
    console.error("[ticketflow] the widget needs a data-workspace attribute");
    return;
  }

  var endpoint = ${JSON.stringify(`${appUrl}/api/inbound/form`)};
  var color = current.getAttribute("data-color") || "#1e1e1e";
  var label = current.getAttribute("data-label") || "Support";
  var title = current.getAttribute("data-title") || "How can we help?";
  var categories = (current.getAttribute("data-categories") || "")
    .split(",").map(function (s) { return s.trim(); }).filter(Boolean);

  var host = document.createElement("div");
  host.setAttribute("data-ticketflow-widget", workspace);
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    ':host,*{box-sizing:border-box}',
    '.launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:9999px;',
    'padding:12px 18px;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'color:#fff;background:' + color + ';cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18)}',
    '.launch:focus-visible{outline:3px solid ' + color + '99;outline-offset:2px}',
    '.overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);',
    'display:flex;align-items:flex-end;justify-content:flex-end;padding:20px}',
    '.panel{width:360px;max-width:100%;max-height:80vh;overflow:auto;background:#fff;color:#111827;',
    'border-radius:14px;padding:18px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'box-shadow:0 20px 50px rgba(0,0,0,.3)}',
    '.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
    '.head h2{margin:0;font-size:16px}',
    '.close{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#6b7280}',
    'label{display:block;margin:10px 0 4px;font-weight:600;font-size:13px}',
    'input,textarea,select{width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;',
    'font:inherit;color:inherit;background:#fff}',
    'input:focus,textarea:focus,select:focus{outline:2px solid ' + color + ';outline-offset:1px;border-color:' + color + '}',
    'textarea{min-height:96px;resize:vertical}',
    '.submit{margin-top:14px;width:100%;border:0;border-radius:8px;padding:11px;color:#fff;',
    'background:' + color + ';font-weight:600;cursor:pointer}',
    '.submit[disabled]{opacity:.6;cursor:default}',
    '.err{color:#b91c1c;font-size:13px;margin-top:8px}',
    '.ok{text-align:center;padding:14px 4px}',
    '.ok h3{margin:8px 0 4px;font-size:16px}',
    '.ok p{margin:0;color:#6b7280;font-size:13px}',
    '.ok a{color:' + color + '}',
    '.hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important}',
    '@media (max-width:420px){.overlay{padding:0;align-items:stretch}.panel{width:100%;max-height:100vh;border-radius:0}}'
  ].join("");
  root.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "launch";
  launcher.type = "button";
  launcher.textContent = label;
  launcher.setAttribute("aria-haspopup", "dialog");
  root.appendChild(launcher);

  var overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    launcher.style.display = "";
    launcher.focus();
  }

  function open() {
    if (overlay) return;
    launcher.style.display = "none";

    overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", title);

    var categoryField = categories.length
      ? '<label for="dk-cat">Category</label><select id="dk-cat" name="category">' +
        '<option value="">Choose one…</option>' +
        categories.map(function (c) {
          var safe = c.replace(/[&<>"]/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
          });
          return '<option value="' + safe + '">' + safe + "</option>";
        }).join("") +
        "</select>"
      : "";

    panel.innerHTML =
      '<div class="head"><h2></h2><button class="close" type="button" aria-label="Close">&times;</button></div>' +
      '<form novalidate>' +
      '<label for="dk-name">Your name</label><input id="dk-name" name="name" autocomplete="name" />' +
      '<label for="dk-email">Email <span aria-hidden="true">*</span></label>' +
      '<input id="dk-email" name="email" type="email" required autocomplete="email" />' +
      '<label for="dk-subject">Subject <span aria-hidden="true">*</span></label>' +
      '<input id="dk-subject" name="subject" required />' +
      categoryField +
      '<label for="dk-message">Message <span aria-hidden="true">*</span></label>' +
      '<textarea id="dk-message" name="message" required></textarea>' +
      '<input class="hp" tabindex="-1" autocomplete="off" name="website" aria-hidden="true" />' +
      '<button class="submit" type="submit">Send request</button>' +
      '<div class="err" role="alert" hidden></div>' +
      "</form>";

    panel.querySelector("h2").textContent = title;
    overlay.appendChild(panel);
    root.appendChild(overlay);

    panel.querySelector(".close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    panel.querySelector("#dk-name").focus();

    var form = panel.querySelector("form");
    var submit = panel.querySelector(".submit");
    var err = panel.querySelector(".err");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;

      var data = new FormData(form);
      var payload = {
        workspace: workspace,
        name: data.get("name") || undefined,
        email: data.get("email"),
        subject: data.get("subject"),
        message: data.get("message"),
        category: data.get("category") || undefined,
        website: data.get("website") || undefined
      };

      if (!payload.email || !payload.subject || !payload.message) {
        err.textContent = "Please fill in email, subject and message.";
        err.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = "Sending…";

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body }; });
        })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || "Something went wrong.");
          panel.innerHTML =
            '<div class="ok"><h3></h3><p></p></div>';
          panel.querySelector("h3").textContent =
            "Thanks — ticket #" + result.body.ticketNumber;
          var p = panel.querySelector("p");
          p.textContent = "We've emailed you a confirmation. ";
          if (result.body.trackUrl) {
            var a = document.createElement("a");
            a.href = result.body.trackUrl;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "Track this request";
            p.appendChild(a);
          }
          setTimeout(close, 6000);
        })
        .catch(function (e2) {
          err.textContent = e2.message || "Something went wrong.";
          err.hidden = false;
          submit.disabled = false;
          submit.textContent = "Send request";
        });
    });
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  launcher.addEventListener("click", open);
})();
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
