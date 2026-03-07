(function () {
  var page = document.body && document.body.getAttribute('data-oa-page') || '';
  var pageTitle = document.title || 'Online Attendance';
  var SESSION_KEY = 'oa_supabase_session';

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function getRole() {
    var session = getSession();
    return session && session.role ? String(session.role).toLowerCase() : '';
  }

  function getMainLinksByRole(role) {
    if (role === 'admin') {
      return [
        { href: './index.html', label: 'Home', icon: 'fa-house', key: 'home' },
        { href: './admin.html', label: 'Admin Panel', icon: 'fa-sliders', key: 'admin' },
        { href: './timesheet-view.html', label: 'Timesheet', icon: 'fa-table-list', key: 'timesheet-view' }
      ];
    }

    if (role === 'employee') {
      return [
        { href: './index.html', label: 'Home', icon: 'fa-house', key: 'home' },
        { href: './timesheet-view.html', label: 'Timesheet', icon: 'fa-table-list', key: 'timesheet-view' }
      ];
    }

    return [
      { href: './index.html', label: 'Home', icon: 'fa-house', key: 'home' },
      { href: './login.html', label: 'Login', icon: 'fa-user-check', key: 'login' }
    ];
  }

  function getProfileMenuByRole(role) {
    if (role === 'admin') {
        return [
        { href: './employee-profile.html', label: 'Profile', icon: 'fa-id-badge' },
        { href: './admin.html', label: 'Admin Panel', icon: 'fa-sliders' },
        { href: './admin.html#employee-management', label: 'Manage Employees', icon: 'fa-users-gear' },
        { href: './admin.html#employee-management', label: 'Edit Employees', icon: 'fa-user-pen' }
      ];
    }

    if (role === 'employee') {
      return [
        { href: './employee-profile.html', label: 'Profile', icon: 'fa-id-badge' }
      ];
    }

    return [];
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function ensureHeadAssets() {
    if (!document.querySelector('link[data-oa-icons="1"], link[href*="font-awesome"]')) {
      var iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
      iconLink.setAttribute('data-oa-icons', '1');
      document.head.appendChild(iconLink);
    }

    if (!document.querySelector('style[data-oa-layout="1"]')) {
      var style = document.createElement('style');
      style.setAttribute('data-oa-layout', '1');
      style.textContent = [
        '.oa-site-header{background:#ffffff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:90;animation:oaSlideDown .45s ease both;}',
        '.oa-header-inner{max-width:1180px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
        '.oa-brand{display:flex;align-items:center;gap:8px;color:#111827;}',
        '.oa-brand-text{display:flex;flex-direction:column;line-height:1.1;}',
        '.oa-brand-name{color:#023891;font-size:20px;font-weight:800;}',
        '.oa-brand-subtitle{color:#6b7280;font-size:10px;font-weight:600;}',
        '.oa-brand-logo{width:38px;height:38px;object-fit:contain;display:block;}',
        '.oa-nav{display:flex;gap:8px;flex-wrap:wrap;}',
        '.oa-nav-link{text-decoration:none;color:#374151;font-size:13px;font-weight:700;padding:7px 10px;border-radius:999px;transition:transform .2s ease,background-color .2s ease,color .2s ease;}',
        '.oa-nav-link i{margin-right:6px;}',
        '.oa-nav-link:hover{background:#eff6ff;color:#1d4ed8;transform:translateY(-1px);}',
        '.oa-nav-link.active{background:#dbeafe;color:#1d4ed8;}',
        '.oa-nav-profile{position:relative;}',
        '.oa-profile-toggle{border:none;background:#e5e7eb;color:#111827;font-size:13px;font-weight:700;padding:7px 10px;border-radius:999px;cursor:pointer;}',
        '.oa-profile-toggle i{margin-right:6px;}',
        '.oa-profile-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:220px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 6px 20px rgba(17,24,39,.12);padding:6px;z-index:100;}',
        '.oa-profile-menu.open{display:block;}',
        '.oa-profile-link{display:block;text-decoration:none;color:#374151;font-size:13px;font-weight:700;padding:9px 10px;border-radius:8px;}',
        '.oa-profile-link:hover{background:#eff6ff;color:#1d4ed8;}',
        '.oa-profile-link i{width:16px;margin-right:8px;}',
        '.oa-profile-divider{height:1px;background:#e5e7eb;margin:6px 0;}',
        '.oa-profile-logout{width:100%;text-align:left;border:none;background:transparent;color:#b91c1c;font-size:13px;font-weight:700;padding:9px 10px;border-radius:8px;cursor:pointer;}',
        '.oa-profile-logout:hover{background:#fef2f2;}',
        '.oa-site-footer{margin-top:24px;border-top:1px solid #e5e7eb;background:#ffffff;animation:oaFadeIn .5s ease both;}',
        '.oa-footer-inner{max-width:1180px;margin:0 auto;padding:12px 16px;color:#6b7280;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;}',
        '.oa-footer-right i{color:#2563eb;margin-right:6px;}',
        '[data-oa-animate="content"]{animation:oaFadeUp .4s ease both;}',
        '@keyframes oaFadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}',
        '@keyframes oaSlideDown{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}',
        '@keyframes oaFadeIn{from{opacity:0;}to{opacity:1;}}'
      ].join('');
      document.head.appendChild(style);
    }
  }

  function buildHeader() {
    var role = getRole();
    var links = getMainLinksByRole(role);
    var profileLinks = getProfileMenuByRole(role);
    var nav = links.map(function (link) {
      var active = link.key === page ? ' active' : '';
      return '<a class="oa-nav-link' + active + '" href="' + link.href + '"><i class="fa-solid ' + link.icon + '"></i>' + escapeHtml(link.label) + '</a>';
    }).join('');

    var profileHtml = '';
    if (profileLinks.length) {
      var profileItems = profileLinks.map(function (item) {
        return '<a class="oa-profile-link" href="' + item.href + '"><i class="fa-solid ' + item.icon + '"></i>' + escapeHtml(item.label) + '</a>';
      }).join('');
      profileHtml = [
        '<div class="oa-nav-profile" id="oa-nav-profile">',
        '  <button class="oa-profile-toggle" id="oa-profile-toggle" type="button" aria-expanded="false"><i class="fa-solid fa-circle-user"></i>Profile</button>',
        '  <div class="oa-profile-menu" id="oa-profile-menu">',
             profileItems,
        '    <div class="oa-profile-divider"></div>',
        '    <button class="oa-profile-logout" id="oa-profile-logout" type="button"><i class="fa-solid fa-right-from-bracket"></i>Logout</button>',
        '  </div>',
        '</div>'
      ].join('');
    }

    return [
      '<header class="oa-site-header">',
      '  <div class="oa-header-inner">',
      '    <div class="oa-brand"><img class="oa-brand-logo" src="https://raw.githubusercontent.com/wintechksa/OnlineAttendance/refs/heads/main/WintechIcon.png" alt="Welding Innovation Technology Logo" /><div class="oa-brand-text"><span class="oa-brand-name">WINTECH</span><span class="oa-brand-subtitle">Welding Innovation Technology</span></div></div>',
      '    <nav class="oa-nav" aria-label="Main navigation">' + nav + profileHtml + '</nav>',
      '  </div>',
      '</header>'
    ].join('');
  }

  function setupProfileMenu() {
    var toggle = document.getElementById('oa-profile-toggle');
    var menu = document.getElementById('oa-profile-menu');
    var profileWrap = document.getElementById('oa-nav-profile');
    var logoutBtn = document.getElementById('oa-profile-logout');
    if (!toggle || !menu || !profileWrap || !logoutBtn) return;

    function closeMenu() {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      var willOpen = !menu.classList.contains('open');
      if (willOpen) {
        menu.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        closeMenu();
      }
    });

    document.addEventListener('click', function (event) {
      if (!profileWrap.contains(event.target)) {
        closeMenu();
      }
    });

    logoutBtn.addEventListener('click', function () {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = './login.html';
    });
  }

  function buildFooter() {
    var year = new Date().getFullYear();
    return [
      '<footer class="oa-site-footer">',
      '  <div class="oa-footer-inner">',
      '    <div>© ' + year + ' Online Attendance</div>',
      '    <div class="oa-footer-right"><i class="fa-regular fa-file-lines"></i>' + escapeHtml(pageTitle) + '</div>',
      '  </div>',
      '</footer>'
    ].join('');
  }

  function applyLayout() {
    ensureHeadAssets();

    var headerSlot = document.getElementById('oa-shared-header');
    var footerSlot = document.getElementById('oa-shared-footer');

    if (headerSlot) headerSlot.innerHTML = buildHeader();
    if (footerSlot) footerSlot.innerHTML = buildFooter();
    setupProfileMenu();

    var animatedRoot = document.querySelector('.container, .maincontainer, main');
    if (animatedRoot) animatedRoot.setAttribute('data-oa-animate', 'content');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLayout);
  } else {
    applyLayout();
  }
})();
