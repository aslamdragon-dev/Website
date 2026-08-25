/* Artura — 360 aerial tour (Marzipano).
   ---------------------------------------------------------------------------
   The tour runs from page load, underneath the splash. Entering is a camera
   move (SPLASH_FOV -> TOUR_FOV), not a page change, so the handover is
   seamless by construction — it is the same renderer throughout.

   Marzipano's `fov` is the VERTICAL field of view. Verified against
   coordinatesToScreen: focal = (height / 2) / tan(fov / 2).

   COORDINATES
   Positions are yaw/pitch in radians. To convert a pixel in the equirectangular
   original (12000 x 6000):
       yaw   = (x / 12000 - 0.5) * 2 * Math.PI
       pitch = (y /  6000 - 0.5) * Math.PI
   Easier: open the page with ?pick and click the point you want.
   --------------------------------------------------------------------------- */

(function () {
  "use strict";

  /* Opening framing. SPLASH_FOV must match POSTER_FOV in tools/render-poster.ps1,
     or the still and the live panorama will not line up behind the splash. */
  /* Yaw matches the site pin's own yaw, which centres it horizontally in frame.
     That is what lets the title occupy the same screen position on both screens
     — see the note on the flight in main.js. Change it and re-run
     tools/render-poster.ps1, or the splash still will no longer match. */
  var YAW        = -0.033;
  var PITCH      = 0.24;
  var SPLASH_FOV = 1.60;   /* wide — what the splash still is rendered at */
  var TOUR_FOV   = 1.45;   /* the gentle push-in settles here */

  /* --- Landmarks ---------------------------------------------------------
     Marked up from the panorama with ?pick.

       label    the text shown at the top of the leader
       primary  the estate itself — drawn as a pin with a star rather than a
                dot on a leader, with its tip on the coordinate
       lead     length of the leader line in pixels, from the dot up to the
                label. This is what stops labels clashing. Ignored for a pin.
       side     "left" puts the label on the left of the leader

     A distant landmark is a dot with a thin line rising from it to its label.
     The dot never moves off its picked coordinate; the label is lifted clear
     on the leader, and the line keeps the two visibly tied together however
     far apart they get. A pin carries its label alongside instead, which is
     how a pin reads — a stem growing out of its head looks wrong.

     The four northern landmarks crowd on the horizon — Coin de Mire and Mont
     Choisy sit 36px apart on screen, Grand Baie and Trou aux Biches 41px, and
     the labels are several times wider than that. Giving them stepped leader
     lengths (150 / 110 / 70 / 30) fans the labels up and away from each other,
     so the gaps between the dots stop mattering.

     Note that a longer leader is not automatically safer. Artura's dot sits
     well below Pamplemousses', so lengthening Artura's leader carries its
     label up TOWARDS Pamplemousses. Pamplemousses is lifted to 100 instead,
     which opens the gap rather than closing it.
     ---------------------------------------------------------------------- */
  var LANDMARKS = [
    { yaw: -1.4635, pitch: -0.0250, label: "Coin de Mire",    lead: 150 },
    { yaw: -1.3946, pitch: -0.0080, label: "Mont Choisy",     lead: 110 },
    { yaw: -1.2293, pitch: -0.0056, label: "Grand Baie",      lead:  70 },
    { yaw: -1.1509, pitch:  0.0168, label: "Trou aux Biches", lead:  30 },
    { yaw: -0.0330, pitch:  0.1494, label: "Artura",          primary: true,
      tagline: "Resorts · Clubhouse · Concierge" },
    { yaw:  1.0245, pitch: -0.0040, label: "Port Louis",      lead:  40 }
  ];

  /* --- Site boundary -----------------------------------------------------
     Marked up from the panorama with ?pick. To change it, open the page with
     ?pick again, choose Boundary mode, click round the corners and paste the
     generated block over this one.
     ---------------------------------------------------------------------- */
  var BOUNDARY = {
    id: "site",
    label: "Artura estate",
    corners: [
      { yaw:  0.2074, pitch: 0.2507 },
      { yaw: -0.3409, pitch: 0.2550 },
      { yaw: -0.1465, pitch: 0.1058 },
      { yaw:  0.0954, pitch: 0.1073 }
    ]
  };

  /* --- The sun -----------------------------------------------------------
     A fixed direction in the panorama, roughly opposite the site. The glare
     element is moved to wherever this lands on screen and brightens as it
     approaches the centre of frame, so turning away from the estate turns you
     into the light. Adjust to taste — pitch is negative for above the horizon. */
  var SUN = { yaw: -2.85, pitch: -0.28 };

  var tourEl = document.getElementById("pano");
  var section = document.getElementById("tour");
  var shapesEl = document.getElementById("shapes");
  if (!tourEl || !section) return;

  /* Marzipano ships no support helper, so probe for a WebGL context directly.
     Without it the poster still image simply stays put and the splash prompt
     is meaningless, so it is removed. */
  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) {
      return false;
    }
  }

  if (typeof window.Marzipano === "undefined" || !hasWebGL()) {
    document.body.classList.add("no-tour");
    return;
  }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = window.matchMedia("(max-width: 900px)").matches;

  var viewer = new Marzipano.Viewer(tourEl, {
    controls: { mouseViewMode: "drag" }
  });

  var source = Marzipano.ImageUrlSource.fromString(
    small ? "assets/img/pano-aerial-2048.jpg" : "assets/img/pano-aerial-4096.jpg"
  );
  var geometry = new Marzipano.EquirectGeometry([{ width: small ? 2048 : 4096 }]);

  var limiter = Marzipano.util.compose(
    Marzipano.RectilinearView.limit.vfov(0.5, 1.90),
    Marzipano.RectilinearView.limit.pitch(-0.7, 1.2)
  );
  var view = new Marzipano.RectilinearView(
    { yaw: YAW, pitch: PITCH, fov: SPLASH_FOV },
    limiter
  );

  var scene = viewer.createScene({
    source: source,
    geometry: geometry,
    view: view,
    pinFirstLevel: true
  });

  scene.switchTo({ transitionDuration: 0 });

  /* --- Boundary drawing ---------------------------------------------------
     Marzipano positions DOM elements at a yaw/pitch but has no concept of a
     polygon, so the shapes are an SVG overlay whose points are recomputed from
     the view on every change. A corner that swings behind the camera returns no
     screen position — the whole shape is hidden rather than allowed to fold
     inside out. */

  var SVG_NS = "http://www.w3.org/2000/svg";
  var shapes = [];

  function addShape(def) {
    if (!shapesEl || !def || !def.corners || def.corners.length < 3) return;
    var poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("class", "shape");
    poly.dataset.id = def.id;

    /* Inert for now. When the plan view (page 3) exists, uncomment the handler
       below and add `.is-hoverable` handling for the pointer cursor.
       poly.addEventListener("click", function () {
         window.location.href = "plan.html";
       });
    */

    shapesEl.appendChild(poly);
    shapes.push({ def: def, el: poly });
  }

  function drawShapes() {
    if (!shapes.length) return;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      var pts = [];
      var clipped = false;

      for (var j = 0; j < s.def.corners.length; j++) {
        var c = s.def.corners[j];
        var p = view.coordinatesToScreen({ yaw: c.yaw, pitch: c.pitch });
        if (!p) { clipped = true; break; }
        pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
      }

      if (clipped) {
        s.el.classList.add("is-clipped");
      } else {
        s.el.classList.remove("is-clipped");
        s.el.setAttribute("points", pts.join(" "));
      }
    }
  }

  addShape(BOUNDARY);

  /* --- Landmarks ---------------------------------------------------------- */

  /* The element is deliberately zero-sized: Marzipano centres a hotspot on its
     coordinate, so anything with width would push the dot off the point. The
     dot and label are positioned off that zero origin instead, which keeps the
     dot exact however long the label runs. */
  /* The marker itself lives as <symbol id="pin-artura"> in index.html, so the
     path data stays in markup and its fill can come from CSS. */
  /* viewBox and width/height are set as ATTRIBUTES as well as in CSS. An inline
     <svg> with neither has no intrinsic size, so it depends entirely on the
     stylesheet resolving — and the reset's max-width once collapsed it to
     nothing. With attributes present it always has a size to fall back on. */
  var PIN_SVG =
    '<svg class="landmark__pin" viewBox="0 0 64 64" width="56" height="56" ' +
         'aria-hidden="true" focusable="false">' +
      '<use href="#pin-artura"/>' +
    '</svg>';

  function buildLandmark(spot) {
    var el = document.createElement("div");
    el.className = "landmark" +
      (spot.primary ? " landmark--primary" : "") +
      (spot.side === "left" ? " landmark--left" : "");
    if (spot.lead) el.style.setProperty("--lead", spot.lead + "px");

    var marker = spot.primary
      ? PIN_SVG
      : '<span class="landmark__dot"></span><span class="landmark__stem"></span>';

    /* The site's label is the full lockup, matching the brand document, and
       shares its markup with the flying title so the two cannot drift apart. */
    if (spot.tagline) {
      el.innerHTML = marker +
        '<span class="landmark__label lockup">' +
          '<span class="lockup__core">' +
            '<span class="lockup__name"></span>' +
            '<span class="lockup__tag"></span>' +
          '</span>' +
        '</span>';
      el.querySelector(".lockup__name").textContent = spot.label || "";
      el.querySelector(".lockup__tag").textContent = spot.tagline;
    } else {
      el.innerHTML = marker + '<span class="landmark__label"></span>';
      el.querySelector(".landmark__label").textContent = spot.label || spot.title || "";
    }
    return el;
  }

  var hotspots = scene.hotspotContainer();

  LANDMARKS.forEach(function (spot) {
    hotspots.createHotspot(
      buildLandmark(spot),
      { yaw: spot.yaw, pitch: spot.pitch }
    );
  });

  /* Lift the markers in front of the boundary hatch.

     Marzipano nests the hotspot container inside a wrapper that carries a
     transform, and a transform creates its own stacking context. Styling the
     container itself therefore does nothing useful — its z-index only competes
     inside that wrapper, which sits at `auto` and paints below .tour__shapes.

     So walk up to the outermost Marzipano layer, the one that is a direct child
     of #pano, and tag that instead. Raised there, the whole hotspot subtree
     competes against the shapes in #tour's stacking context.

     This also depends on #pano having no z-index of its own — see the note in
     the stylesheet. */
  if (typeof hotspots.domElement === "function") {
    var layer = hotspots.domElement();
    while (layer.parentElement && layer.parentElement !== tourEl) {
      layer = layer.parentElement;
    }
    if (layer.parentElement === tourEl) {
      layer.classList.add("tour__hotspots");
    }
  }

  /* --- Wiring ------------------------------------------------------------- */

  view.addEventListener("change", drawShapes);
  window.addEventListener("resize", drawShapes);
  drawShapes();

  /* Fade the poster once the panorama has actually painted. The two are framed
     identically, so nothing visibly changes. */
  var markLive = function () { section.classList.add("is-live"); };
  viewer.addEventListener("sceneChange", markLive);
  setTimeout(markLive, 900);

  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.018,
    targetPitch: PITCH,
    targetFov: TOUR_FOV
  });

  /* Called by main.js when the visitor enters. */
  function enter(onDone) {
    if (reduced) {
      view.setFov(TOUR_FOV);
      drawShapes();
      if (onDone) onDone();
      return;
    }
    viewer.lookTo(
      { yaw: YAW, pitch: PITCH, fov: TOUR_FOV },
      { transitionDuration: 1400 },
      function () {
        viewer.startMovement(autorotate);
        viewer.setIdleMovement(5000, autorotate);
        if (onDone) onDone();
      }
    );
  }

  /* --- The site pin, and where its label will land ------------------------
     main.js flies the splash wordmark onto this point, so it needs the label's
     screen position at the SETTLED view, not the current one. Computed on a
     throwaway view at TOUR_FOV rather than by nudging the live one. */

  var primarySpot = null;
  for (var pi = 0; pi < LANDMARKS.length; pi++) {
    if (LANDMARKS[pi].primary) { primarySpot = LANDMARKS[pi]; break; }
  }

  function viewSize() {
    var s = view.size();
    if (s && s.width) return s;
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /* The site label sits centred ABOVE the marker, which CSS does with
     translate(-50%, -100%). A transform is invisible to getComputedStyle's
     left/top, so the caller passes in the lockup's measured size and we undo
     the translate here. Without this the flight lands half a label's width to
     the right and a label's height too low.

     `size` comes from the flying title, which carries the identical lockup and
     is always laid out — unlike this label, which sits inside a Marzipano
     hotspot and may not be measurable yet. */
  function primaryLabelTarget(size) {
    if (!primarySpot) return null;
    var probe = new Marzipano.RectilinearView(
      { yaw: YAW, pitch: PITCH, fov: TOUR_FOV }, null
    );
    probe.setSize(viewSize());
    var p = probe.coordinatesToScreen(primarySpot);
    if (!p) return null;

    var el = document.querySelector(".landmark--primary .landmark__label");
    if (!el) return null;
    var cs = window.getComputedStyle(el);

    var x = p.x + parseFloat(cs.left);
    var y = p.y + parseFloat(cs.top);
    if (size) { x -= size.w / 2; y -= size.h; }
    return { x: x, y: y };
  }

  /* --- Sun glare ----------------------------------------------------------
     The glare element is moved to wherever the sun direction falls on screen,
     and its strength comes from how near the centre of frame that is. Turning
     towards the site turns the light off; turning away brings it up. */

  var sunEl = document.getElementById("sun");

  function updateSun() {
    if (!sunEl) return;
    var s = viewSize();
    var p = view.coordinatesToScreen(SUN);

    /* Null means the sun is behind the camera. */
    if (!p) { sunEl.style.opacity = 0; return; }

    var dx = p.x - s.width / 2;
    var dy = p.y - s.height / 2;
    var reach = Math.sqrt(s.width * s.width + s.height * s.height) * 0.62;
    var strength = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / reach);

    sunEl.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
    /* Eased so the glare comes up late and quickly rather than washing over
       the whole rotation. */
    sunEl.style.opacity = (strength * strength).toFixed(3);
  }

  view.addEventListener("change", updateSun);
  window.addEventListener("resize", updateSun);
  updateSun();

  /* Once the wordmark has landed on the pin, the pin's label carries the brand.
     If the visitor turns far enough that the pin leaves the frame, a small
     corner wordmark stands in until it comes back. */
  var landed = false;

  function updateCornerMark() {
    if (!landed || !primarySpot) return;
    var s = viewSize();
    var p = view.coordinatesToScreen(primarySpot);
    var off = !p || p.x < 0 || p.x > s.width || p.y < 0 || p.y > s.height;
    document.body.classList.toggle("pin-offscreen", off);
  }

  view.addEventListener("change", updateCornerMark);
  window.addEventListener("resize", updateCornerMark);

  /* Exposed so main.js can trigger the move, the picker can read coordinates,
     and further scenes can be added without reaching into this file. */
  window.arturaTour = {
    viewer: viewer,
    scene: scene,
    view: view,
    enter: enter,
    redraw: drawShapes,
    landmarks: LANDMARKS,
    boundary: BOUNDARY,
    fov: { splash: SPLASH_FOV, tour: TOUR_FOV },
    primaryLabelTarget: primaryLabelTarget,
    markLanded: function () { landed = true; updateCornerMark(); },
    screenPosition: function (yaw, pitch) {
      return view.coordinatesToScreen({ yaw: yaw, pitch: pitch });
    }
  };

  /* Picker mode is only fetched when asked for, so it never ships weight to a
     visitor. */
  if (/[?&]pick\b/.test(window.location.search)) {
    var s = document.createElement("script");
    s.src = "assets/js/picker.js";
    document.body.appendChild(s);
  }
})();
