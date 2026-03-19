// ============================================================
// app.js — Page Navigation & Scroll Reveal
// implanted | Custom 3D Pet Decor
// ============================================================

/**
 * showPage — single-page-app router.
 * Hides all content wrappers, then shows the requested one.
 * @param {string} pageName — 'home' | 'shop' | 'contact' | 'privacy' | 'terms' | 'product-pet-plant-stake'
 */
function showPage(pageName) {
    const pages = [
        'content-home',
        'content-contact',
        'content-privacy',
        'content-terms',
        'content-shop',
        'content-product-pet-plant-stake'
    ];

    // Hide all pages
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Reset scroll position
    window.scrollTo(0, 0);

    // Show the requested page
    const targetMap = {
        'home':                   'content-home',
        'contact':                'content-contact',
        'privacy':                'content-privacy',
        'terms':                  'content-terms',
        'shop':                   'content-shop',
        'product-pet-plant-stake':'content-product-pet-plant-stake'
    };

    const targetId = targetMap[pageName];
    if (targetId) {
        const target = document.getElementById(targetId);
        if (target) target.classList.remove('hidden');
    }

    // Page-specific side-effects
    if (pageName === 'home') {
        reveal();
    } else if (pageName === 'contact') {
        // Small delay so the DOM is visible before chat initialises
        setTimeout(initChat, 100);
    } else {
        // Stop chat polling when navigating away from contact
        if (typeof pollInterval !== 'undefined') clearInterval(pollInterval);
    }
}

// ============================================================
// Scroll Reveal
// ============================================================

function reveal() {
    const reveals       = document.querySelectorAll('.reveal');
    const windowHeight  = window.innerHeight;
    const elementVisible = 150;

    reveals.forEach(el => {
        const elementTop = el.getBoundingClientRect().top;
        if (elementTop < windowHeight - elementVisible) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

window.addEventListener('scroll', reveal);

// Run on initial load
reveal();
