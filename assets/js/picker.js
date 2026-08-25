/* Artura — picker mode.
   ---------------------------------------------------------------------------
   Loaded only when the URL carries ?pick, so it never reaches a visitor.

   Two modes:
     Landmark  — each click records one point
     Boundary  — clicks accumulate as corners of a shape

   Click a point in the panorama and its yaw/pitch is recorded and written into
   a paste-ready block at the side. Drag to look around as normal; a drag does
   not drop a point, only a clean click does.
   --------------------------------------------------------------------------- */

(function () {
  "use strict";

  var t = window.arturaTour;
  if (!t) return;

  var body = document.body;
  var tourEl = document.getElementById("pano");

  body.classList.add("is-picking");
  body.classList.remove("is-splash");

  /* Skip the splash and settle at the tour framing straight away. */
  t.view.setFov(t.fov.tour);
  t.redraw();

  var mode = "landmark";
  var landmarks = [];
  var corners = [];

  /* --- Panel -------------------------------------------------------------- */

  var panel = document.createElement("div");
  panel.className = "picker";
  panel.innerHTML =
    '<div class="picker__head">' +
      '<span class="picker__title">Picker</span>' +
      '<button class="picker__btn" id="pkClose" type="button">Close</button>' +
    '</div>' +
    '<div class="picker__body">' +
      '<div class="picker__modes">' +
        '<button class="picker__mode is-on" id="pkLandmark" type="button">Landmark</button>' +
        '<button class="picker__mode" id="pkBoundary" type="button">Boundary</button>' +
      '</div>' +
      '<p class="picker__hint" id="pkHint"></p>' +
      '<textarea class="picker__out" id="pkOut" readonly spellcheck="false"></textarea>' +
      '<p class="picker__count" id="pkCount"></p>' +
      '<div class="picker__actions">' +
        '<button class="picker__btn" id="pkUndo" type="button">Undo</button>' +
        '<button class="picker__btn" id="pkClear" type="button">Clear</button>' +
        '<button class="picker__btn picker__btn--go" id="pkCopy" type="button">Copy</button>' +
      '</div>' +
    '</div>';
  body.appendChild(panel);

  var out = panel.querySelector("#pkOut");
  var hint = panel.querySelector("#pkHint");
  var count = panel.querySelector("#pkCount");
  var btnLandmark = panel.querySelector("#pkLandmark");
  var btnBoundary = panel.querySelector("#pkBoundary");

  /* Stop clicks on the panel from dropping points behind it. */
  panel.addEventListener("mousedown", function (e) { e.stopPropagation(); });
  panel.addEventListener("click", function (e) { e.stopPropagation(); });

  /* --- Marker layer ------------------------------------------------------- */

  var layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.setAttribute("class", "pick-layer");
  var poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("class", "pick-line");
  layer.appendChild(poly);
  document.getElementById("tour").appendChild(layer);

  var dots = [];

  function clearDots() {
    dots.forEach(function (d) { d.remove(); });
    dots = [];
  }

  function drawMarkers() {
    clearDots();
    var list = mode === "landmark" ? landmarks : corners;
    var pts = [];

    list.forEach(function (p) {
      var s = t.screenPosition(p.yaw, p.pitch);
      if (!s) return;
      var d = document.createElement("div");
      d.className = "pick-dot" + (mode === "boundary" ? " pick-dot--corner" : "");
      d.style.left = s.x + "px";
      d.style.top = s.y + "px";
      document.getElementById("tour").appendChild(d);
      dots.push(d);
      pts.push(s.x.toFixed(1) + "," + s.y.toFixed(1));
    });

    poly.setAttribute("points", mode === "boundary" && pts.length > 2 ? pts.join(" ") : "");
  }

  t.view.addEventListener("change", drawMarkers);
  window.addEventListener("resize", drawMarkers);

  /* --- Output ------------------------------------------------------------- */

  function round(n) { return Number(n.toFixed(4)); }

  function render() {
    if (mode === "landmark") {
      hint.textContent =
        "Click a point to record a landmark. Fill in the label and text afterwards, " +
        "then paste the block over LANDMARKS in assets/js/tour.js.";
      count.textContent = landmarks.length + " landmark" + (landmarks.length === 1 ? "" : "s");

      if (!landmarks.length) { out.value = "var LANDMARKS = [];"; return; }

      out.value =
        "var LANDMARKS = [\n" +
        landmarks.map(function (p, i) {
          return "  {\n" +
                 "    yaw: " + round(p.yaw) + ", pitch: " + round(p.pitch) + ",\n" +
                 '    label: "Landmark ' + (i + 1) + '",\n' +
                 '    title: "",\n' +
                 '    text:  "",\n' +
                 "    meta:  []\n" +
                 "  }";
        }).join(",\n") +
        "\n];";
    } else {
      hint.textContent =
        "Click each corner of the site in order, going round the outside. " +
        "Three or more corners close into a shape. Paste the block over " +
        "BOUNDARY in assets/js/tour.js.";
      count.textContent = corners.length + " corner" + (corners.length === 1 ? "" : "s") +
                          (corners.length > 2 ? " — shape closed" : " — need at least 3");

      if (!corners.length) { out.value = "// click the corners of the site"; return; }

      out.value =
        "var BOUNDARY = {\n" +
        '  id: "site",\n' +
        '  label: "Artura estate",\n' +
        "  corners: [\n" +
        corners.map(function (p) {
          return "    { yaw: " + round(p.yaw) + ", pitch: " + round(p.pitch) + " }";
        }).join(",\n") +
        "\n  ]\n};";
    }
  }

  /* --- Clicking ----------------------------------------------------------- */

  /* Only a clean click drops a point — a drag is someone looking around. */
  var down = null;

  tourEl.addEventListener("mousedown", function (e) {
    down = { x: e.clientX, y: e.clientY, at: Date.now() };
  });

  tourEl.addEventListener("mouseup", function (e) {
    if (!down) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    var held = Date.now() - down.at;
    down = null;
    if (moved > 5 || held > 500) return;

    var c = t.view.screenToCoordinates({ x: e.clientX, y: e.clientY });
    if (!c) return;

    (mode === "landmark" ? landmarks : corners).push({ yaw: c.yaw, pitch: c.pitch });
    render();
    drawMarkers();
  });

  /* --- Controls ----------------------------------------------------------- */

  function setMode(next) {
    mode = next;
    btnLandmark.classList.toggle("is-on", mode === "landmark");
    btnBoundary.classList.toggle("is-on", mode === "boundary");
    render();
    drawMarkers();
  }

  btnLandmark.addEventListener("click", function () { setMode("landmark"); });
  btnBoundary.addEventListener("click", function () { setMode("boundary"); });

  panel.querySelector("#pkUndo").addEventListener("click", function () {
    (mode === "landmark" ? landmarks : corners).pop();
    render(); drawMarkers();
  });

  panel.querySelector("#pkClear").addEventListener("click", function () {
    if (mode === "landmark") landmarks = []; else corners = [];
    render(); drawMarkers();
  });

  panel.querySelector("#pkCopy").addEventListener("click", function (e) {
    out.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    if (navigator.clipboard && !ok) {
      navigator.clipboard.writeText(out.value).catch(function () {});
    }
    e.target.textContent = "Copied";
    setTimeout(function () { e.target.textContent = "Copy"; }, 1200);
  });

  panel.querySelector("#pkClose").addEventListener("click", function () {
    window.location.search = "";
  });

  render();
  drawMarkers();

  window.arturaPicker = {
    landmarks: function () { return landmarks; },
    corners: function () { return corners; },
    setMode: setMode
  };
})();
