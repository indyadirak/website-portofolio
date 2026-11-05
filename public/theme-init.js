(function () {
  try {
    var t = localStorage.getItem("cyb-theme");
    if (t === "cyan" || t === "green" || t === "amber") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {
    /* storage tidak tersedia — biarkan default */
  }
})();
