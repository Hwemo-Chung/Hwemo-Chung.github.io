/**
 * Optional live payment buttons from payment-links.json.
 * Empty strings → keep mailto CTAs only.
 */
(function () {
  function inject(id, url, label) {
    if (!url) return;
    var el = document.getElementById(id);
    if (!el) return;
    var a = document.createElement("a");
    a.className = "ls-btn ls-btn--primary";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label || "Pay now";
    el.hidden = false;
    el.appendChild(a);
  }

  var base = document.querySelector('script[src*="payment.js"]');
  var src = base && base.getAttribute("src");
  var jsonUrl = (src && src.replace(/payment\.js.*$/, "payment-links.json")) || "payment-links.json";

  fetch(jsonUrl)
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      inject("pay-pilot", d.pilot_usd, "Pay pilot $400");
      inject("pay-stabilizer", d.stabilizer_usd, "Pay Stabilizer");
      inject("pay-diag", d.diag_paid_krw, "유료 진단 결제");
      inject("pay-threads", d.threads_report_krw, "리포트 결제");
      if (d.paypal_me_base) {
        inject("pay-pilot", d.paypal_me_base.replace(/\/?$/, "") + "/400", "PayPal $400");
      }
    })
    .catch(function () {
      /* silent — mailto remains */
    });
})();
