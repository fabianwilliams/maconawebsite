(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  ready(function () {
    var overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Full size image');
    overlay.innerHTML =
      '<button class="lightbox-close" type="button" aria-label="Close full size view">&times;</button>' +
      '<img alt="">' +
      '<div class="lightbox-caption"></div>';
    document.body.appendChild(overlay);

    var overlayImg = overlay.querySelector('img');
    var overlayCap = overlay.querySelector('.lightbox-caption');
    var closeBtn = overlay.querySelector('.lightbox-close');
    var lastFocused = null;

    function openLightbox(src, alt) {
      lastFocused = document.activeElement;
      overlayImg.src = src;
      overlayImg.alt = alt || '';
      overlayCap.textContent = alt || '';
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function closeLightbox() {
      overlay.classList.remove('open');
      overlayImg.removeAttribute('src');
      overlayImg.alt = '';
      overlayCap.textContent = '';
      document.body.style.overflow = '';
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target === closeBtn) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        closeLightbox();
      }
    });

    var imgs = document.querySelectorAll('.lightbox-enabled img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.closest('a[href]')) { return; }
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.addEventListener('click', function () {
        openLightbox(img.currentSrc || img.src, img.alt);
      });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(img.currentSrc || img.src, img.alt);
        }
      });
    });
  });
})();
