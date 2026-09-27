/* Fernanda Crochê — minimal behavior:
   1. logotype entrance  2. scroll reveals  3. topbar on scroll */

(function () {
  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only hide what will be animated if JS is actually running.
  root.classList.add('js-anim');

  /* 1. logotype: entrance after the paint */
  requestAnimationFrame(function () { root.classList.add('is-loaded'); });

  /* 2. reveals */
  var revealTargets = document.querySelectorAll('.reveal');
  revealTargets.forEach(function (el) {
    var delay = el.dataset.delay;
    if (delay) el.style.transitionDelay = delay + 'ms';
  });

  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  /* 2b. footer line: same stroke animation as the hero's.
     Its own observer, without the negative margin — it lives at the page end. */
  var footerSwash = document.querySelector('.footer__swash');
  if (footerSwash) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      footerSwash.classList.add('is-drawn');
    } else {
      var swashObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-drawn');
          swashObserver.unobserve(entry.target);
        });
      }, { threshold: 0.01 });
      swashObserver.observe(footerSwash);
    }
  }

  /* 3. topbar gains a border after the first scroll */
  var topbar = document.getElementById('topbar');
  var markStuck = function () {
    topbar.classList.toggle('is-stuck', window.scrollY > 12);
  };
  markStuck();
  window.addEventListener('scroll', markStuck, { passive: true });

  /* 4. collapsed menu on mobile */
  var navToggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('nav');

  var closeMenu = function () {
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menu');
  };

  navToggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    navToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  });

  // clicking a link or pressing Esc closes it
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      closeMenu();
      navToggle.focus();
    }
  });
  // back on desktop, clear the state
  window.matchMedia('(min-width: 761px)').addEventListener('change', function (e) {
    if (e.matches) closeMenu();
  });

  /* 5. Instagram feed */
  var feedGrid = document.getElementById('insta');
  var feedNotice = document.getElementById('insta-notice');

  var showNotice = function (text) {
    feedGrid.hidden = true;
    feedNotice.textContent = text;
    feedNotice.hidden = false;
  };

  var typeBadges = { VIDEO: '▶', CAROUSEL_ALBUM: '❐' };

  var renderFeed = function (posts) {
    feedGrid.innerHTML = '';
    posts.forEach(function (post) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'insta__link';
      link.href = post.link;
      link.target = '_blank';
      link.rel = 'noopener';

      var photo = document.createElement('span');
      photo.className = 'insta__photo';

      var img = document.createElement('img');
      img.className = 'insta__img';
      img.src = post.image;
      img.loading = 'lazy';
      img.decoding = 'async';
      // no caption on the card, the description lives in the image alt
      img.alt = post.caption ? post.caption.slice(0, 120) : 'Publicação no Instagram do ateliê';
      photo.appendChild(img);

      if (typeBadges[post.type]) {
        var badge = document.createElement('span');
        badge.className = 'insta__badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = typeBadges[post.type];
        photo.appendChild(badge);
      }

      link.appendChild(photo);
      item.appendChild(link);
      feedGrid.appendChild(item);
    });
    feedGrid.setAttribute('aria-busy', 'false');
  };

  if (feedGrid) {
    fetch('/api/instagram')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.posts && data.posts.length) renderFeed(data.posts);
        else showNotice('O feed não está conectado agora — o botão abaixo leva ao perfil.');
      })
      .catch(function () {
        showNotice('Não consegui carregar o feed agora — o botão abaixo leva ao perfil.');
      });
  }

  /* footer: current year */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
