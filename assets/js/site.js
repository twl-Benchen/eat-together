/* EatTogether 共用腳本：標出目前所在的導覽連結、填入頁尾年份。
 * 頁首頁尾的 HTML 直接寫在每一頁（沒有 JS 也看得到），這裡只做小幫手。
 */
(function () {
  "use strict";
  const here = location.pathname.replace(/index\.html$/, "");
  document.querySelectorAll(".site-nav a").forEach((a) => {
    const target = new URL(a.getAttribute("href"), location.href).pathname.replace(/index\.html$/, "");
    if (target === here) a.setAttribute("aria-current", "page");
  });
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
