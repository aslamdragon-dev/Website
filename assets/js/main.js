/* Artura — the splash gate, and the title's transition into the tour.

   The ARTURA text is one element throughout, and it never moves. It sits from
   the very first frame exactly where it will end up: on the site pin, as that
   landmark's label. Entering only changes its size — the name and tagline scale
   down to their final size, and the place line fades out. No travel, no
   handover to a second copy.

   That works because the tour's opening yaw matches the pin's own yaw, so the
   pin is centred in frame and the title reads as a title. See YAW in tour.js.

   Everything is driven by transform from a 0,0 origin with the scale taken
   about the core's centre, so the core stays pinned to its landing point at
   every scale and at any viewport size. */

(function () {
  "use strict";

  var body = document.body;
  var mark = document.getElementById("mark");
  var splash = document.getElementById("splash");
  var enterBtn = document.getElementById("enter");
  if (!mark || !splash) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MOVE_MS = 1400;
  var entered = false;

  /* Natural, untransformed geometry of the lockup.

     Two boxes matter. The whole lockup (name + tagline + place line) is what
     has to fit the viewport. The core (name + tagline) is what lands on the pin,
     so the flight is measured from it — and the core's offset within the lockup
     matters because the transform positions the lockup's top-left, not the
     core's. If the place line is the widest line, those differ. */
  function naturalRect() {
    var prev = mark.style.transform;
    mark.style.transition = "none";
    mark.style.transform = "none";

    var r = mark.getBoundingClientRect();
    var coreEl = mark.querySelector(".lockup__core");
    var c = coreEl ? coreEl.getBoundingClientRect() : r;

    mark.style.transform = prev;
    /* Two frames, so restoring the transition does not animate this probe. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { mark.style.transition = ""; });
    });

    return {
      w: r.width, h: r.height,
      coreW: c.width, coreH: c.height,
      coreDx: c.left - r.left, coreDy: c.top - r.top
    };
  }

  /* How large the title sits on the splash. Fitted to the viewport rather than
     hard-coded per breakpoint, because the tagline is wider than the name and
     it is the tagline that runs out of room first. */
  function splashScale(r) {
    if (!r.w) return 1.6;
    var byWidth = (window.innerWidth * 0.33) / r.w;
    var byHeight = (window.innerHeight * 0.14) / r.h;
    return Math.max(0.8, Math.min(1.7, byWidth, byHeight));
  }

  /* Where the lockup must sit for its core to land on the pin's label. */
  function landingPosition(size) {
    var tour = window.arturaTour;
    var target = tour && tour.primaryLabelTarget
      ? tour.primaryLabelTarget({ w: size.coreW, h: size.coreH })
      : null;

    if (target) {
      return { x: target.x - size.coreDx, y: target.y - size.coreDy };
    }

    /* No tour, so no pin. Centre it and leave it there. */
    return {
      x: (window.innerWidth - size.w) / 2,
      y: (window.innerHeight - size.h) / 2
    };
  }

  function place() {
    var size = naturalRect();
    var pos = landingPosition(size);

    /* Scaling about the core's centre keeps the core fixed on its landing point
       however large the title is, so entering is a pure scale change. */
    mark.style.transformOrigin =
      (size.coreDx + size.coreW / 2).toFixed(1) + "px " +
      (size.coreDy + size.coreH / 2).toFixed(1) + "px";

    mark.style.setProperty("--mark-x", Math.round(pos.x) + "px");
    mark.style.setProperty("--mark-y", Math.round(pos.y) + "px");
    mark.style.setProperty("--mark-scale", entered ? 1 : splashScale(size));
  }

  place();
  window.addEventListener("resize", place);

  /* Fonts change the measured width, so re-place once they land. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(place);
  }

  function enter() {
    if (entered) return;
    entered = true;

    body.classList.remove("is-splash");

    var tour = window.arturaTour;
    if (tour && tour.enter) tour.enter();

    /* Position is already correct — only the scale changes. */
    mark.style.setProperty("--mark-scale", 1);

    window.setTimeout(function () {
      body.classList.add("has-landed");
      if (tour && tour.markLanded) tour.markLanded();
    }, reduced ? 0 : MOVE_MS);

    if (document.activeElement === enterBtn) enterBtn.blur();

    window.setTimeout(function () {
      splash.setAttribute("hidden", "");
    }, reduced ? 0 : 950);
  }

  if (enterBtn) enterBtn.addEventListener("click", enter);

  document.addEventListener("keydown", function (e) {
    if (entered) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.key === "Escape") {
      e.preventDefault();
      enter();
    }
  });
})();
