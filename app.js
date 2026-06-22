document.addEventListener('DOMContentLoaded', () => {
  // Global States
  let currentUser = null;
  let jwtToken = localStorage.getItem('blulegacy_jwt_token') || null;
  let socket = null;
  let userContext = null;
  let adminContext = null;
  let chartInstances = {};

  // DOM Elements - Shell & Views
  const authContainer = document.getElementById('auth-container');
  const appShell = document.getElementById('app-shell');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarClose = document.getElementById('sidebar-close');
  const currentViewTitle = document.getElementById('current-view-title');
  const navItems = document.querySelectorAll('.nav-item');
  const logoutBtns = document.querySelectorAll('.btn-logout, .logout-btn, #logout-button');

  // Form Elements - Login / Register
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const toRegister = document.getElementById('to-register');
  const toLogin = document.getElementById('to-login');

  // Modal Dialogs
  const globalModal = document.getElementById('global-modal');
  const modalContent = document.getElementById('modal-content');
  const modalClose = document.getElementById('modal-close');

  // Notifications Bell
  const notificationsBell = document.getElementById('notifications-bell');
  const notificationsDropdown = document.getElementById('notifications-dropdown');
  const notificationsDropdownList = document.getElementById('notifications-dropdown-list');
  const clearNotificationsBtn = document.getElementById('clear-notifications');
  const bellBadge = document.getElementById('bell-badge');

  // Security Verified Badges
  const verifiedBadges = [
    document.getElementById('sidebar-verified-badge'),
    document.getElementById('top-verified-badge'),
    document.getElementById('prof-verified-badge')
  ];

  // Toast Container
  const toastContainer = document.getElementById('toast-container');

  // Password Visibility Toggle Listeners
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        
        // Toggle the eye / eye-off Lucide icon
        const icon = btn.querySelector('.toggle-icon') || btn.querySelector('svg') || btn.querySelector('i');
        if (icon) {
          if (icon.tagName.toLowerCase() === 'svg') {
            const newIcon = document.createElement('i');
            newIcon.className = 'toggle-icon';
            newIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
            icon.parentNode.replaceChild(newIcon, icon);
          } else {
            icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
          }
          if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
          }
        }
      }
    };
  });


  // ==========================================================================
  // REWARDS DASHBOARD
  // ==========================================================================
  const REWARD_TIERS = [
    { rank: 1, name: 'LEVEL 1 REWARD', displayName: '🎁 Level 1 Reward', requiredDirects: 15, requiredTeam: 200, requiredBronze: 0, requiredLeg1: 80, requiredLeg2: 60, requiredRemaining: 60, rewardDesc: 'Smart Watch' },
    { rank: 2, name: 'LEVEL 2 REWARD', displayName: '🎁 Level 2 Reward', requiredDirects: 15, requiredTeam: 700, requiredBronze: 0, requiredLeg1: 280, requiredLeg2: 210, requiredRemaining: 210, rewardDesc: 'Android Phone' },
    { rank: 3, name: 'LEVEL 3 REWARD', displayName: '🎁 Level 3 Reward', requiredDirects: 15, requiredTeam: 2200, requiredBronze: 0, requiredLeg1: 880, requiredLeg2: 660, requiredRemaining: 660, rewardDesc: 'iPad' },
    { rank: 4, name: 'LEVEL 4 REWARD', displayName: '🎁 Level 4 Reward', requiredDirects: 15, requiredTeam: 10200, requiredBronze: 0, requiredLeg1: 4080, requiredLeg2: 3060, requiredRemaining: 3060, rewardDesc: 'Bike' },
    { rank: 5, name: 'LEVEL 5 REWARD', displayName: '🎁 Level 5 Reward', requiredDirects: 15, requiredTeam: 25200, requiredBronze: 0, requiredLeg1: 10080, requiredLeg2: 7560, requiredRemaining: 7560, rewardDesc: 'Car' }
  ];

  async function renderRewardsData() {
    await fetchUserContext();
    const db = userContext;
    
    const stats = db.rewardStats || { activeDirectsCount: 0, totalActiveTeam: 0, bronzeEligibleDirects: 0, powerLeg1: 0, powerLeg2: 0, remaining: 0 };
    const claims = db.rewardClaims || [];

    // Update Stats Top Bar
    document.getElementById('reward-stat-directs').textContent = stats.activeDirectsCount || 0;
    document.getElementById('reward-stat-leg1').textContent = stats.powerLeg1 || 0;
    document.getElementById('reward-stat-leg2').textContent = stats.powerLeg2 || 0;
    document.getElementById('reward-stat-rem').textContent = stats.remaining || 0;
    document.getElementById('reward-stat-total').textContent = stats.totalActiveTeam || 0;

    const container = document.getElementById('reward-cards-container');
    container.innerHTML = '';

    REWARD_TIERS.forEach(tier => {
      const claim = claims.find(c => c.rewardName === tier.name);
      
      let isStrictlyEligible = stats.activeDirectsCount >= 15;
      let hasRequiredTeam = stats.totalActiveTeam >= tier.requiredTeam;
      
      let status = 'Locked';
      let statusColor = 'var(--text-muted)';
      let statusIcon = 'lock';
      let borderStyle = 'border:1px solid rgba(255,255,255,0.05);';
      let buttonHtml = '';
      
      // Determine logical status
      if (claim && claim.status !== 'Qualified') {
        status = claim.status;
        if (status === 'Claim Submitted') { statusColor = 'var(--warning)'; statusIcon = 'mail'; }
        if (status === 'Approved') { statusColor = 'var(--success)'; statusIcon = 'check-square'; }
        if (status === 'Dispatched') { statusColor = 'var(--sky-primary)'; statusIcon = 'truck'; }
        if (status === 'Delivered') { statusColor = 'var(--gold)'; statusIcon = 'gift'; }
        if (status === 'Rejected') { statusColor = 'var(--danger)'; statusIcon = 'x-circle'; }
        borderStyle = 'border:1px solid var(--sky-primary); box-shadow:inset 0 0 20px rgba(0, 195, 255, 0.1);';
      } else if (isStrictlyEligible && hasRequiredTeam) {
        status = 'Success';
        statusColor = 'var(--success)';
        statusIcon = 'check-circle';
        borderStyle = 'border:1px solid var(--success); box-shadow:inset 0 0 20px rgba(0, 255, 128, 0.1);';
        if (!claim || claim.status === 'Qualified') {
          buttonHtml = `
            <button class="btn btn-sm" onclick="openRewardClaimModal('${tier.name}', '${claim ? claim.qualificationDate : new Date().toISOString()}')" style="width:100%; margin-top:15px; background:linear-gradient(45deg, var(--sky-primary), var(--gold)); color:black; font-weight:bold; border:none; box-shadow:0 0 15px rgba(255,215,0,0.4);">
              &#127873; APPLY REWARD
            </button>
          `;
        }
      } else if (isStrictlyEligible && !hasRequiredTeam) {
        status = 'In Progress';
        statusColor = 'var(--warning)';
        statusIcon = 'loader';
        borderStyle = 'border:1px solid rgba(255, 215, 0, 0.3);';
      } else {
        // Locked (Active Directs < 15)
        status = 'Locked';
        statusColor = 'var(--text-muted)';
        statusIcon = 'lock';
      }
      
      let remainingTeam = Math.max(0, tier.requiredTeam - stats.totalActiveTeam);
      let progress = tier.requiredTeam > 0 ? Math.min(100, (stats.totalActiveTeam / tier.requiredTeam) * 100) : 100;
      if (!isStrictlyEligible) progress = 0; // Show 0 progress if hard gated
      
      let directColor = isStrictlyEligible ? 'var(--success)' : 'var(--danger)';

      container.innerHTML += `
        <div class="glassmorphism" style="padding:20px; position:relative; overflow:hidden; ${borderStyle} transition: all 0.3s ease;">
          <div style="position:absolute; top:-20px; right:-20px; width:100px; height:100px; background:radial-gradient(circle, rgba(255,215,0,0.1) 0%, transparent 70%);"></div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h4 style="color:var(--gold); text-shadow:0 0 10px rgba(255,215,0,0.3); font-size: 1.1rem; text-transform: uppercase; font-weight:700;">${tier.displayName || tier.name}</h4>
            <span style="font-size:0.75rem; color:${statusColor}; display:flex; align-items:center; gap:5px; background:rgba(255,255,255,0.1); padding:4px 10px; border-radius:12px; font-weight:bold; text-transform:uppercase;">
              <i data-lucide="${statusIcon}" style="width:14px;height:14px;"></i> ${status}
            </span>
          </div>
          
          <!-- Data Grid Real-Time Display -->
          <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 15px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
            <div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Directs</div>
              <div style="font-size: 0.9rem; color: ${directColor}; font-weight: bold;">${stats.activeDirectsCount} <span style="font-size:0.6rem;color:var(--text-muted)">/ 15</span></div>
            </div>
            <div style="border-left: 1px solid rgba(255,255,255,0.1); border-right: 1px solid rgba(255,255,255,0.1);">
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Team</div>
              <div style="font-size: 0.9rem; color: white; font-weight: bold;">${stats.totalActiveTeam} <span style="font-size:0.6rem;color:var(--text-muted)">/ ${tier.requiredTeam}</span></div>
            </div>
            <div>
              <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Remaining</div>
              <div style="font-size: 0.9rem; color: var(--sky-primary); font-weight: bold;">${remainingTeam}</div>
            </div>
          </div>

          <div style="background: linear-gradient(135deg, rgba(0, 195, 255, 0.1), transparent); padding: 12px; border-radius: 8px; border: 1px solid rgba(0, 195, 255, 0.2);">
            <div style="font-size: 0.75rem; color: var(--sky-primary); text-transform: uppercase; margin-bottom: 5px; font-weight: bold;">&#127873; Reward Package</div>
            <div style="font-size: 0.95rem; color: white; font-weight: 500;">${tier.rewardDesc}</div>
          </div>
          
          <div style="margin-top:20px; margin-bottom:5px; font-size:0.75rem; color:var(--sky-primary); display:flex; justify-content:space-between; font-weight:600;">
            <span style="text-transform:uppercase;">Network Completion</span>
            <span>${Math.floor(progress)}%</span>
          </div>
          <div class="progress" style="height:6px; background:rgba(0,0,0,0.5); border-radius:10px; overflow:hidden;">
            <div class="progress-bar" style="width:${progress}%; background:linear-gradient(90deg, var(--sky-dark), var(--sky-primary)); box-shadow:0 0 10px var(--sky-primary);"></div>
          </div>
          
          ${buttonHtml}
          ${(claim && claim.status !== 'Qualified') ? `
            <div style="margin-top:15px; font-size:0.75rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
              Claim Date: ${fmtDate(claim.claimDate || claim.qualificationDate)}
              ${claim.dispatchDetails?.trackingNumber ? `<br><strong style="color:var(--sky-primary)">Tracking: ${claim.dispatchDetails.trackingNumber}</strong>` : ''}
              ${claim.rejectionReason ? `<br><strong style="color:var(--danger)">Reason: ${claim.rejectionReason}</strong>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    });

    lucide.createIcons();

    // Attach form submit
    const claimForm = document.getElementById('reward-claim-form');
    if (claimForm && !claimForm._rewardListenerAttached) {
      claimForm._rewardListenerAttached = true;
      claimForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = this.querySelector('button[type="submit"]');
        const ogText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Submitting...';
        btn.disabled = true;

        const payload = {
          rewardName: document.getElementById('claim-hidden-reward-name').value,
          fullAddress: document.getElementById('claim-address').value,
          city: document.getElementById('claim-city').value,
          state: document.getElementById('claim-state').value,
          pincode: document.getElementById('claim-pincode').value,
          altMobile: document.getElementById('claim-alt-mobile').value
        };

        const res = await apiPost('/api/user/reward-claim', payload);
        btn.innerHTML = ogText;
        btn.disabled = false;

        if (res && res.success) {
          showToast('Claim Submitted!', res.message, 'success');
          closeModal('reward-claim-modal');
          renderRewardsData(); // Re-render to show new status
        } else {
          showToast('Submission Failed', res?.error || 'Server error', 'error');
        }
      });
    }
  }

  window.openRewardClaimModal = function(rewardName, qualDate) {
    document.getElementById('claim-reward-name').textContent = rewardName;
    document.getElementById('claim-hidden-reward-name').value = rewardName;
    document.getElementById('claim-reward-date').textContent = 'Qualified On: ' + new Date(qualDate).toLocaleDateString();
    
    document.getElementById('claim-name').value = currentUser.name;
    document.getElementById('claim-mobile').value = currentUser.mobile;
    
    document.getElementById('claim-address').value = '';
    document.getElementById('claim-city').value = '';
    document.getElementById('claim-state').value = '';
    document.getElementById('claim-pincode').value = '';
    document.getElementById('claim-alt-mobile').value = '';
    document.getElementById('claim-confirm').checked = false;

    openModal('reward-claim-modal');
  };


  // ==========================================================================
  // VIEW ROUTER & AUTH HANDLERS
  // ==========================================================================
  
  function routeTo(viewName) {
    if (!currentUser) {
      authContainer?.classList.remove('hidden');
      appShell?.classList.add('hidden');
      return;
    }

    const isUserActive = currentUser.status === 'Active';
    toggleSidebarLocks(isUserActive);

    // Gated Views (Withdraw)
    if (!isUserActive && viewName === 'withdraw') {
      showLockoutScreen(viewName);
    } else {
      hideLockoutScreen(viewName);
    }

    // Role-based security admin route gate
    if (viewName === 'admin' && currentUser.role !== 'admin') {
      showToast("Access Denied", "Administrative privileges required to access this node area.", "error");
      routeTo('dashboard');
      return;
    }

    document.querySelectorAll('.router-view').forEach(view => {
      view?.classList.add('hidden');
      view?.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView?.classList.remove('hidden');
      targetView?.classList.add('active');
    }

    navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item?.classList.add('active');
      } else {
        item?.classList.remove('active');
      }
    });

    currentViewTitle.textContent = viewName === 'admin' ? 'Admin Portal Control' : viewName.charAt(0).toUpperCase() + viewName.slice(1);

    renderViewData(viewName);
    sidebar?.classList.remove('mobile-active');
  }

  function toggleSidebarLocks(isActive) {
    const locks = document.querySelectorAll('.lock-indicator-sidebar');
    locks.forEach(l => {
      if (isActive) l?.classList.add('hidden');
      else l?.classList.remove('hidden');
    });
  }

  function showLockoutScreen(viewName) {
    const notice = document.getElementById(`${viewName}-lockout-notice`);
    const content = document.getElementById(`${viewName}-main-content`);
    if (notice) notice?.classList.remove('hidden');
    if (content) content?.classList.add('hidden');
  }

  function hideLockoutScreen(viewName) {
    const notice = document.getElementById(`${viewName}-lockout-notice`);
    const content = document.getElementById(`${viewName}-main-content`);
    if (notice) notice?.classList.add('hidden');
    if (content) content?.classList.remove('hidden');
  }

  // ==========================================================================
  // API REQUEST HELPERS
  // ==========================================================================

  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }
    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }
    try {
      const response = await fetch(endpoint, config);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Server response failure.");
      }
      return data;
    } catch (error) {
      showToast("API Error", error.message, "error");
      throw error;
    }
  }

  function syncAllWalletBalances(db) {
    if (!db) return;
    const fund = db.fundBalance || 0;
    const income = db.balance || 0;

    const fundEls = ['dash-metric-fund-wallet', 'act-ui-fund-balance', 'wallet-fund-balance', 'withdraw-fund-wallet'];
    fundEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${fund.toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;
    });

    const incomeEls = ['dash-metric-withdraw-wallet', 'wallet-income-balance', 'withdraw-avail-balance'];
    incomeEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${income.toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;
    });
  }

  async function fetchUserContext() {
    try {
      userContext = await apiCall('/api/user/context');
      currentUser = userContext.profile;
      syncAllWalletBalances(userContext);
      return userContext;
    } catch (e) {
      logout();
    }
  }

  async function fetchAdminContext() {
    try {
      adminContext = await apiCall('/api/admin/context');
      return adminContext;
    } catch (e) {
      showToast("Audit Error", "Failed to retrieve global administrative registries.", "error");
    }
  }

  // ==========================================================================
  // REAL-TIME SOCKET.IO HANDLERS
  // ==========================================================================
  
  function initRealTimeCommunications(token) {
    if (typeof io === 'undefined') return;
    
    // Connect to backend Socket.IO
    socket = io();
    
    socket.emit('authenticate', token);

    socket.on('notification', (data) => {
      showToast("Alert Node", data.message, "info");
      loadNotificationsBellBadge();
          if (data.message.includes('network') || data.message.includes('joined')) { if (typeof renderTeamAreaData === 'function') renderTeamAreaData(true); }
    });

    socket.on('reward_update', async () => {
      await fetchUserContext();
      if (document.getElementById('view-rewards')?.classList.contains('active')) {
        renderRewardsData();
      } else {
        renderDashboardData();
      }
      showToast('Reward Ecosystem', 'Your reward status was just updated!', 'info');
    });
    
    socket.on('balance_update', async () => {
      await fetchUserContext();
      renderDashboardData();
      renderWalletData();
      if (typeof renderActivationData === 'function') renderActivationData();
      if (typeof renderTeamAreaData === 'function') renderTeamAreaData(true);
      if (typeof renderWithdrawData === 'function') renderWithdrawData();
    });

    socket.on('ticket_reply', async () => {
      await fetchUserContext();
      if (document.getElementById('view-support')?.classList.contains('active')) {
        renderSupportData();
      }
    });

    socket.on('stats_update', (stats) => {
      if (currentUser.role === 'admin' && document.getElementById('view-admin')?.classList.contains('active')) {
        document.getElementById('admin-stat-users').textContent = stats.totalUsers;
        document.getElementById('admin-stat-active-users').textContent = stats.activeUsers;
        document.getElementById('admin-stat-pending-users').textContent = stats.pendingDeposits;
        document.getElementById('admin-stat-deposits').textContent = `${stats.totalDeposits.toFixed(2)} COIN`;
        document.getElementById('admin-stat-withdrawals').textContent = `${stats.totalWithdrawals.toFixed(2)} COIN`;
        document.getElementById('admin-stat-volume').textContent = `${stats.totalGrossRevenue.toFixed(2)} COIN`;
      }
    });

    socket.on('new_deposit_request', (req) => {
      if (currentUser.role === 'admin') {
        showToast("New Deposit Proof", `User ${req.userId} uploaded a 10 COIN payment hash.`, "warning");
        if (document.getElementById('view-admin')?.classList.contains('active')) {
          refreshAdminTabContent();
        }
      }
    });

    socket.on('new_withdrawal_request', (req) => {
      if (currentUser.role === 'admin') {
        showToast("Withdrawal Request", `User ${req.userId} requested ${req.amount.toFixed(2)} COIN.`, "info");
        if (document.getElementById('view-admin')?.classList.contains('active')) {
          refreshAdminTabContent();
        }
      }
    });
  }

  // ==========================================================================
  // AUTHENTICATION LOGIC & SEEDS
  // ==========================================================================

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;

    try {
      const data = await apiCall('/api/auth/login', 'POST', { identifier, password });
      jwtToken = data.token;
      currentUser = data.user;
      
      localStorage.setItem('blulegacy_jwt_token', jwtToken);
      showToast("Auth Approved", `Session synchronized for ${currentUser.name}`, "success");
      
      initRealTimeCommunications(jwtToken);
      await fetchUserContext();
      
      authContainer?.classList.add('hidden');
      appShell?.classList.remove('hidden');

      loadShellUserInfo();
      routeTo('dashboard');
    } catch (err) {
      showToast("Auth Failed", err.message, "error");
    }
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const mobile = document.getElementById('reg-mobile').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPass = document.getElementById('reg-confirm-password').value;
    const referral = document.getElementById('reg-referral').value.trim().toUpperCase();

    if (password !== confirmPass) {
      showToast('Password Mismatch', 'Passwords do not match. Please re-enter.', 'error');
      return;
    }

    try {
      const data = await apiCall('/api/auth/register', 'POST', { name, email, mobile, password, referral });
      
      if (data.success && data.user) {
        // Hide registration form, show success screen
        registerForm.classList.add('hidden');
        const successScreen = document.getElementById('registration-success-screen');
        if (successScreen) {
          successScreen.classList.remove('hidden');
          
          // Populate details
          document.getElementById('succ-name').textContent = data.user.name;
          document.getElementById('succ-userid').textContent = data.user.userId;
          document.getElementById('succ-email').textContent = data.user.email;
          document.getElementById('succ-mobile').textContent = data.user.mobile;
          document.getElementById('succ-password').textContent = '********';
          document.getElementById('succ-password').dataset.raw = data.user.rawPassword; // Store raw secretly for toggling
          document.getElementById('succ-sponsor').textContent = data.user.parentReferral || 'None';
          document.getElementById('succ-date').textContent = new Date(data.user.registrationDate).toLocaleString();

          // Trigger Confetti if available
          if (typeof confetti === 'function') {
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#00c6ff', '#0072ff', '#10b981', '#fbbf24']
            });
          }
        }
        
        // Reset form & sponsor card
        registerForm.reset();
        const sponsorCard = document.getElementById('sponsor-verified-card');
        if (sponsorCard) sponsorCard.classList.add('hidden');
      } else {
        showToast("Registration Successful", data.message, "success");
        registerForm.reset();
        toLogin.click();
      }
    } catch (err) {}
  };

  // Success Screen Handlers
  const btnSuccLogin = document.getElementById('btn-succ-login');
  if (btnSuccLogin) {
    btnSuccLogin.onclick = () => {
      document.getElementById('registration-success-screen').classList.add('hidden');
      toLogin.click();
    };
  }

  const btnSuccShowPass = document.getElementById('succ-show-pass');
  if (btnSuccShowPass) {
    btnSuccShowPass.onclick = () => {
      const passEl = document.getElementById('succ-password');
      const icon = btnSuccShowPass.querySelector('i');
      if (passEl.textContent === '********') {
        passEl.textContent = passEl.dataset.raw;
        icon.setAttribute('data-lucide', 'eye-off');
      } else {
        passEl.textContent = '********';
        icon.setAttribute('data-lucide', 'eye');
      }
      lucide.createIcons();
    };
  }

  const btnSuccCopy = document.getElementById('btn-succ-copy');
  if (btnSuccCopy) {
    btnSuccCopy.onclick = () => {
      const name = document.getElementById('succ-name').textContent;
      const uid = document.getElementById('succ-userid').textContent;
      const email = document.getElementById('succ-email').textContent;
      const mob = document.getElementById('succ-mobile').textContent;
      const passEl = document.getElementById('succ-password');
      const rawPass = passEl.dataset.raw;
      const sponsor = document.getElementById('succ-sponsor').textContent;
      const date = document.getElementById('succ-date').textContent;
      
      const copyText = `--- BLU LEGACY ACCOUNT DETAILS ---\nName: ${name}\nUser ID: ${uid}\nEmail: ${email}\nMobile: ${mob}\nPassword: ${rawPass}\nSponsor: ${sponsor}\nDate: ${date}\n----------------------------------`;
      
      navigator.clipboard.writeText(copyText).then(() => {
        showToast("Copied", "Account details copied to clipboard", "success");
      }).catch(err => {
        showToast("Error", "Failed to copy details", "error");
      });
    };
  }

  const btnSuccPdf = document.getElementById('btn-succ-pdf');
  if (btnSuccPdf) {
    btnSuccPdf.onclick = () => {
      // Show password temporarily for PDF export so the user actually saves it
      const passEl = document.getElementById('succ-password');
      const wasHidden = passEl.textContent === '********';
      if (wasHidden) passEl.textContent = passEl.dataset.raw;
      
      const element = document.getElementById('reg-success-card');
      const opt = {
        margin:       0.5,
        filename:     `BluLegacy_Account_${document.getElementById('succ-userid').textContent}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      
      if (typeof html2pdf !== 'undefined') {
        showToast("Generating PDF", "Please wait while we generate your secure PDF...", "info");
        html2pdf().set(opt).from(element).save().then(() => {
          // Restore password masking
          if (wasHidden) passEl.textContent = '********';
          showToast("PDF Saved", "Account details securely saved as PDF", "success");
        });
      } else {
        window.print();
        if (wasHidden) passEl.textContent = '********';
      }
    };
  }


  // ============================================================
  // REAL-TIME REFERRAL SPONSOR VERIFICATION (Registration form)
  // ============================================================
  const regReferralInput = document.getElementById('reg-referral');
  if (regReferralInput) {
    let referralLookupTimeout = null;

    const refSpinner = document.getElementById('referral-spinner');
    const refOkIcon = document.getElementById('referral-ok-icon');
    const refErrIcon = document.getElementById('referral-err-icon');
    const sponsorCard = document.getElementById('sponsor-verified-card');
    const sponsorDisplayName = document.getElementById('sponsor-display-name');
    const sponsorDisplayId = document.getElementById('sponsor-display-id');
    const sponsorStatusBadge = document.getElementById('sponsor-status-badge');
    const sponsorErrorMsg = document.getElementById('sponsor-error-msg');

    function resetReferralIcons() {
      if (refSpinner) refSpinner.style.display = 'none';
      if (refOkIcon) refOkIcon.style.display = 'none';
      if (refErrIcon) refErrIcon.style.display = 'none';
      if (sponsorCard) sponsorCard?.classList.add('hidden');
      if (sponsorErrorMsg) sponsorErrorMsg?.classList.add('hidden');
    }

    regReferralInput.addEventListener('input', (e) => {
      // Auto uppercase
      const val = e.target.value.toUpperCase();
      e.target.value = val;

      clearTimeout(referralLookupTimeout);
      resetReferralIcons();

      if (!val || val.length < 5) return;

      // Show spinner after 600ms debounce
      referralLookupTimeout = setTimeout(async () => {
        if (refSpinner) refSpinner.style.display = 'inline-flex';
        try {
          const resp = await fetch(`/api/auth/validate-referral?code=${encodeURIComponent(val)}`);
          const data = await resp.json();
          if (refSpinner) refSpinner.style.display = 'none';

          if (data.valid) {
            if (refOkIcon) refOkIcon.style.display = 'inline-flex';
            if (sponsorCard) sponsorCard?.classList.remove('hidden');
            if (sponsorDisplayName) sponsorDisplayName.textContent = data.sponsorName;
            if (sponsorDisplayId) sponsorDisplayId.textContent = data.sponsorId;
            if (sponsorStatusBadge) {
              sponsorStatusBadge.textContent = data.sponsorStatus;
              sponsorStatusBadge.className = 'badge ' + (data.sponsorStatus === 'Active' ? 'badge-success' : 'badge-warning');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
          } else {
            if (refErrIcon) refErrIcon.style.display = 'inline-flex';
            if (sponsorErrorMsg) {
              sponsorErrorMsg.textContent = data.error || 'Invalid referral ID.';
              sponsorErrorMsg?.classList.remove('hidden');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        } catch (err) {
          if (refSpinner) refSpinner.style.display = 'none';
          if (refErrIcon) refErrIcon.style.display = 'inline-flex';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }, 600);
    });
  }

  logoutBtns.forEach(btn => {
    btn.onclick = () => {
      logout();
    };
  });

  function logout() {
    localStorage.removeItem('blulegacy_jwt_token');
    jwtToken = null;
    currentUser = null;
    userContext = null;
    if (socket) {
      socket.disconnect();
    }
    
    authContainer?.classList.remove('hidden');
    appShell?.classList.add('hidden');
    loginForm.reset();
    registerForm.reset();
  }

  function loadShellUserInfo() {
    document.getElementById('sidebar-user-name').textContent = currentUser.name;
    document.getElementById('sidebar-user-id').textContent = currentUser.userId;
    document.getElementById('sidebar-user-role').textContent = currentUser.role === 'admin' ? 'Administrator' : 'Premium Member';
    document.getElementById('sidebar-user-avatar').textContent = currentUser.name.split(' ').map(n => n[0]).join('');
    document.getElementById('top-username').textContent = currentUser.name;
    document.getElementById('top-userid').textContent = currentUser.userId;
    document.getElementById('top-user-avatar').textContent = currentUser.name.split(' ').map(n => n[0]).join('');
    
    const adminItems = document.querySelectorAll('.admin-only-item');
    adminItems.forEach(item => {
      if (currentUser.role === 'admin') item?.classList.remove('hidden');
      else item?.classList.add('hidden');
    });

    loadNotificationsBellBadge();
  }

  function loadNotificationsBellBadge() {
    if (!userContext) return;
    const notsCount = userContext.notifications.length;
    if (notsCount > 0) {
      bellBadge.textContent = notsCount;
      bellBadge?.classList.remove('hidden');
    } else {
      bellBadge?.classList.add('hidden');
    }
  }

  // ==========================================================================
  // VIEW RENDER CALIBRATIONS
  // ==========================================================================

  function renderViewData(viewName) {
    // Verified security check
    verifiedBadges.forEach(b => {
      if (b) {
        if (currentUser.status === 'Active') b?.classList.remove('hidden');
        else b?.classList.add('hidden');
      }
    });

    switch (viewName) {
      case 'dashboard':
        renderDashboardData();
        break;
      case 'wallet':
        renderWalletData();
        break;
      case 'deposit':
        renderDepositView();
        break;
      case 'withdraw':
        renderWithdrawData();
        break;
      case 'activation':
        if (typeof renderActivationData === 'function') renderActivationData();
        break;
      case 'team-area':
        if (typeof renderTeamAreaData === 'function') renderTeamAreaData();
        break;
      case 'referral-income':
        if (typeof renderReferralIncomeData === 'function') renderReferralIncomeData();
        break;
      case 'level-income':
        if (typeof renderLevelIncomeData === 'function') renderLevelIncomeData();
        break;
      case 'auto-blaster':
        if (typeof renderAutoBlasterData === 'function') renderAutoBlasterData();
        break;
      case 'club-income':
        if (typeof renderClubIncomeData === 'function') renderClubIncomeData();
        break;
      case 'boosting-income':
        if (typeof renderBoostingData === 'function') renderBoostingData();
        break;
      case 'rewards':
        renderRewardsData();
        break;
      case 'support':
        renderSupportData();
        break;
      case 'profile':
        renderProfileData();
        break;
      case 'admin':
        renderAdminData();
        break;
    }
  }

  // Refresh handler
  window.refreshUserDashboard = async function() {
    const icon = document.getElementById('global-refresh-icon');
    if (icon) {
      icon.style.transition = 'transform 1s ease';
      icon.style.transform = `rotate(${window._refreshRot || 360}deg)`;
      window._refreshRot = (window._refreshRot || 360) + 360;
    }
    
    // Fetch fresh data
    await fetchUserContext();
    
    // Re-render whichever view is currently active
    const activeView = document.querySelector('.nav-item.active');
    if (activeView) {
      renderViewData(activeView.dataset.view);
    } else {
      renderViewData('dashboard');
    }
    
    showToast("Refreshed", "Dashboard data synced.", "success");
  };

  // ======== DEPOSIT PAGE RENDERER & HANDLERS ========

  // ==========================================================================
  function renderDepositView() {
    // Auto-fill user ID and name
    const uidEl = document.getElementById('deposit-user-id');
    const nameEl = document.getElementById('deposit-user-name');
    if (uidEl && currentUser) uidEl.value = currentUser.userId;
    if (nameEl && currentUser) nameEl.value = currentUser.name;

    // Attach form submit if not already attached
    const form = document.getElementById('deposit-request-form');
    if (form && !form._depositListenerAttached) {
      form._depositListenerAttached = true;
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('deposit-submit-btn');
        const amount = document.getElementById('deposit-amount').value;
        const txid = document.getElementById('deposit-txid').value.trim();
        const screenshot = document.getElementById('deposit-screenshot-base64').value;

        if (!txid) { showToast('Missing TXID', 'Please enter your blockchain transaction hash.', 'error'); return; }
        if (parseFloat(amount) < 1000) { showToast('Invalid Amount', 'Minimum deposit is 1000.00 COIN.', 'error'); return; }

        try {
          btn.disabled = true;
          const orig = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Submitting...';
          lucide.createIcons();

          const res = await apiCall('/api/user/deposit-request', 'POST', { amount: parseFloat(amount), txid, screenshot });
          showToast('Deposit Submitted', res.message, 'success');

          // Reset form
          form.reset();
          document.getElementById('deposit-screenshot-base64').value = '';
          document.getElementById('deposit-screenshot-preview').style.display = 'none';
          document.getElementById('deposit-drop-zone').style.display = 'block';
          if (currentUser) {
            document.getElementById('deposit-user-id').value = currentUser.userId;
            const nameEl = document.getElementById('deposit-user-name');
            if (nameEl) nameEl.value = currentUser.name;
          }

          // Reload deposit history
          loadDepositHistory();
        } catch (err) {
          showToast('Submission Failed', err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<span>Submit Deposit Request</span><i data-lucide="send"></i>';
          lucide.createIcons();
        }
      });
    }

    // Load history on open
    loadDepositHistory();
  }

  window.copyDepositAddress = function() {
    const addr = '0xE6fc094eF14bD56f2332225fc09c8c00D5067d9b';
    navigator.clipboard.writeText(addr).then(() => {
      const btn = document.getElementById('copy-address-btn');
      if (btn) {
        btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;"></i> Copied!';
        btn.style.color = '#10b981';
        lucide.createIcons();
        setTimeout(() => {
          btn.innerHTML = '<i data-lucide="copy" style="width:13px;height:13px;"></i> Copy';
          btn.style.color = '#3b82f6';
          lucide.createIcons();
        }, 2000);
      }
    }).catch(() => showToast('Copy Failed', 'Please copy the address manually.', 'error'));
  };

  window.previewDepositScreenshot = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('deposit-screenshot-base64').value = e.target.result;
      document.getElementById('deposit-preview-img').src = e.target.result;
      document.getElementById('deposit-screenshot-preview').style.display = 'block';
      document.getElementById('deposit-drop-zone').style.display = 'none';
    };
    reader.readAsDataURL(file);
  };

  window.clearDepositScreenshot = function() {
    document.getElementById('deposit-screenshot-base64').value = '';
    document.getElementById('deposit-screenshot-preview').style.display = 'none';
    document.getElementById('deposit-drop-zone').style.display = 'block';
    document.getElementById('deposit-screenshot-file').value = '';
  };

  async function loadDepositHistory() {
    const tbody = document.getElementById('deposit-history-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Loading...</td></tr>';
    try {
      const deps = await apiCall('/api/user/deposit-history', 'GET');
      if (!deps || deps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No deposit history found.</td></tr>';
        return;
      }
      tbody.innerHTML = deps.map(d => {
        const statusColor = d.status === 'Approved' ? 'badge-success' : d.status === 'Rejected' ? 'badge-danger' : 'badge-warning';
        const date = new Date(d.createdAt);
        return `<tr>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-green);">${parseFloat(d.amount).toFixed(2)} COIN</td>
          <td style="font-family:var(--font-mono); font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${d.txid}">${d.txid}</td>
          <td style="font-size:12px;">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
          <td><span class="badge ${statusColor}">${d.status}</span></td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--accent-red);padding:20px;">Failed to load history.</td></tr>';
    }
  }

  // ======== END DEPOSIT PAGE ========

  // Dashboard Renderer
  // ==========================================
  // CLUB INCOME LOGIC
  // ==========================================
  async function renderClubIncomeData() {
    try {
      await fetchUserContext();
      const db = userContext;
      const clubData = db.clubQualify || {};
      const count    = clubData.directsCount || 0;
      const isActive = currentUser?.status === 'Active' || currentUser?.idStatus === 'Activated';
      const pct = Math.min(100, (count / 15) * 100).toFixed(1);

      // Stats
      const statDirects = document.getElementById('club-stat-directs');
      const statStatus  = document.getElementById('club-stat-status');
      const progMain    = document.getElementById('club-prog-main');
      const progPct     = document.getElementById('club-prog-pct');
      const pageBadge   = document.getElementById('club-page-badge');
      const qualDetails = document.getElementById('club-qualify-details');

      if (statDirects) statDirects.textContent = count;
      if (progMain)    progMain.style.width     = pct + '%';
      if (progPct)     progPct.textContent      = pct + '%';

      if (clubData.qualified) {
        if (statStatus) { statStatus.textContent = '✅ Club Qualified'; statStatus.style.color = '#10b981'; }
        if (pageBadge)  { pageBadge.textContent = '👑 QUALIFIED'; pageBadge.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)'; }
        if (qualDetails) qualDetails.style.display = 'block';
        const qualDate = document.getElementById('club-qualify-date-display');
        const achDir   = document.getElementById('club-achieve-directs');
        if (qualDate && clubData.date) {
          qualDate.textContent = new Date(clubData.date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
        }
        if (achDir) achDir.textContent = count;
      } else {
        if (statStatus) { statStatus.textContent = isActive ? '🎯 In Progress' : '🔒 Not Active'; statStatus.style.color = isActive ? '#fbbf24' : '#ef4444'; }
        if (pageBadge)  {
          pageBadge.textContent = isActive ? 'IN PROGRESS' : 'NOT ACTIVE';
          pageBadge.style.background = isActive ? 'linear-gradient(90deg,#7b2ff7,#a78bfa)' : 'rgba(239,68,68,0.2)';
          pageBadge.style.color = isActive ? '#fff' : '#ef4444';
        }
        if (qualDetails) qualDetails.style.display = 'none';
      }

      if (window.lucide) lucide.createIcons();

      // Fetch Daily Club Progress
      try {
        const dcRes = await apiCall('/api/user/daily-club');
        if (dcRes && dcRes.success) {
          const t = dcRes.today;
          const pct = Math.min(100, (t.totalQualifiedCount / 15) * 100).toFixed(1);
          
          document.getElementById('dc-leg1').textContent = t.leg1Count;
          document.getElementById('dc-leg2').textContent = t.leg2Count;
          document.getElementById('dc-leg3').textContent = t.remainingCount;
          document.getElementById('dc-prog-text').textContent = t.totalQualifiedCount + ' / 15';
          document.getElementById('dc-prog-bar').style.width = pct + '%';
          
          if (t.isQualified) {
            document.getElementById('dc-success-msg').style.display = 'block';
            document.getElementById('daily-club-status-badge').textContent = '✅ QUALIFIED TODAY';
            document.getElementById('daily-club-status-badge').style.background = 'rgba(16,185,129,0.2)';
            document.getElementById('daily-club-status-badge').style.color = '#10b981';
          } else {
            document.getElementById('dc-success-msg').style.display = 'none';
            document.getElementById('daily-club-status-badge').textContent = 'IN PROGRESS';
            document.getElementById('daily-club-status-badge').style.background = 'rgba(255,255,255,0.1)';
            document.getElementById('daily-club-status-badge').style.color = '#fff';
          }
          
          const tbody = document.getElementById('dc-history-tbody');
          if (dcRes.history && dcRes.history.length > 0) {
            tbody.innerHTML = dcRes.history.map(h => {
              const dStr = new Date(h.date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:12px 8px;color:#fff;font-weight:600;">${dStr}</td>
                  <td style="padding:12px 8px;color:#a78bfa;">${h.totalCount} Activations</td>
                  <td style="padding:12px 8px;"><span style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 10px;border-radius:12px;font-size:0.7rem;font-weight:700;">${h.status.toUpperCase()}</span></td>
                </tr>
              `;
            }).join('');
          } else {
            tbody.innerHTML = `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--text-muted);">No daily achievements yet.</td></tr>`;
          }
        }
      } catch(e) {
        console.error('[DAILY CLUB]', e);
        document.getElementById('daily-club-status-badge').textContent = 'ERROR';
      }

    } catch(e) {
      console.error('[CLUB INCOME]', e);
    }
  }

  // ==========================================
  // BOOSTING INCOME LOGIC
  // ==========================================
  
  async function renderBoostingData() {
    try {
      const res = await apiCall('/api/user/boost/board');
      
      const container = document.getElementById('boost-board-container');
      
      document.getElementById('boost-stat-cycles').textContent = res.totalCycles || 0;
      document.getElementById('boost-stat-income').textContent = (res.totalIncome || 0) + ' COIN';
      
      const poolEl = document.getElementById('boost-stat-pool');
      if (poolEl) poolEl.textContent = (res.globalPool || 0) + ' COIN';

      if (!res.hasBoard) {
        if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-secondary);">Your Boosting Matrix will generate automatically upon ID Activation. Activate your ID to enter the Global Pool!</div>';
        if (container) container.classList.remove('hidden');
      } else {
        if (container) container.classList.remove('hidden');
        
        const boardIdEl = document.getElementById('boost-board-id');
        if (boardIdEl) boardIdEl.textContent = res.boardId;
        
        const completedCount = res.members ? res.members.length : 0;
        const pendingCount = Math.max(0, 6 - completedCount);
        
        document.getElementById('boost-completed').textContent = completedCount;
        document.getElementById('boost-pending').textContent = pendingCount;
        
        const globalPosEl = document.getElementById('boost-global-pos');
        if (globalPosEl) globalPosEl.textContent = '#' + (res.globalPosition || '--');
        
        const statusEl = document.getElementById('boost-status');
        if (statusEl) {
          statusEl.textContent = res.isCycled ? 'Completed' : 'In Progress';
          statusEl.style.color = res.isCycled ? 'var(--accent-green)' : 'var(--accent-gold)';
        }
        
        const slotsEl = document.getElementById('boost-slots');
        if (slotsEl) {
          let slotsHtml = '';
          const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
          
          const memberMap = {};
          if (res.members) {
            res.members.forEach(m => { memberMap[m.position] = m; });
          }
          
          for (let i = 1; i <= 6; i++) {
            const letter = labels[i-1];
            const isFilled = !!memberMap[i];
            
            slotsHtml += `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: ${i < 6 ? '1px dashed rgba(255,255,255,0.1)' : 'none'};">
                <span style="font-weight: bold; font-family: var(--font-mono); color: ${isFilled ? '#fff' : 'var(--text-muted)'}; font-size: 15px;">Node ${letter}</span>
                <span style="font-size: 16px;">${isFilled ? '✅' : '⏳'}</span>
              </div>
            `;
          }
          slotsEl.innerHTML = slotsHtml;
        }
      }
    } catch (e) {
      console.error('Error loading boosting data:', e);
    }
  }

  // ==========================================
  // AUTO BLASTER LOGIC
  // ==========================================
  async function renderAutoBlasterData() {
    const container  = document.getElementById('ab-levels-container');
    const historyEl  = document.getElementById('ab-history-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">
      <i data-lucide="loader" style="width:28px;height:28px;animation:spin 1s linear infinite;"></i>
      <p style="margin-top:10px;">Loading...</p></div>`;
    if (window.lucide) lucide.createIcons();

    try {
      const data = await apiCall('/api/user/auto-blaster');

      // Update stats
      const balEl = document.getElementById('ab-total-balance');
      const trEl  = document.getElementById('ab-total-transferred');
      const dirEl = document.getElementById('ab-active-directs');
      if (balEl) balEl.textContent = (data.autoBlasterBalance || 0).toLocaleString('en-US', {minimumFractionDigits:2}) + ' COIN';
      if (trEl)  trEl.textContent  = (data.totalTransferred   || 0).toLocaleString('en-US', {minimumFractionDigits:2}) + ' COIN';
      if (dirEl) dirEl.textContent = data.activeDirects || 0;

      if (!data.levels || data.levels.length === 0) {
        container.innerHTML = `<div class="glassmorphism" style="padding:40px;text-align:center;border-radius:14px;">
          <i data-lucide="lock" style="width:36px;height:36px;color:var(--text-muted);"></i>
          <h4 style="margin:14px 0 8px;color:var(--text-secondary);">Auto Blaster Not Active</h4>
          <p style="color:var(--text-muted);font-size:0.85rem;">Activate your ID to unlock the Auto Blaster wallet system.</p>
        </div>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      // Status colour mapping
      const statusColors = {
        Pending:     { bg:'rgba(251,191,36,0.12)', border:'rgba(251,191,36,0.3)', badge:'#fbbf24', text:'#fbbf24' },
        Locked:      { bg:'rgba(239,68,68,0.10)',  border:'rgba(239,68,68,0.25)', badge:'#ef4444', text:'#ef4444' },
        Unlocked:    { bg:'rgba(16,185,129,0.10)', border:'rgba(16,185,129,0.25)',badge:'#10b981', text:'#10b981' },
        Transferring:{ bg:'rgba(0,198,255,0.08)',  border:'rgba(0,198,255,0.25)', badge:'#00c6ff', text:'#00c6ff' },
        Transferred: { bg:'rgba(123,47,247,0.08)', border:'rgba(123,47,247,0.25)',badge:'#a78bfa', text:'#a78bfa' }
      };

      const levelIcons = ['','⚡','🔥','💎','🚀','🌟','👑'];

      let allHistory = [];

      let tableHtml = `
      <div class="table-responsive glassmorphism" style="border-radius:14px;border:1px solid var(--border-glass);padding:15px;overflow-x:auto;">
        <table class="luxury-table" style="width:100%;text-align:left;font-size:0.85rem;">
          <thead>
            <tr>
              <th>Level</th>
              <th>Coin</th>
              <th>Release Date</th>
              <th>Total Active</th>
              <th>Success Date</th>
              <th>Date Status</th>
              <th>Direct Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.levels.forEach(lv => {
        const canTransfer = (lv.status === 'Unlocked' || lv.status === 'Transferring') && lv.todayTransferable > 0;
        
        // Success Date
        let successDate = '-';
        if (lv.status === 'Transferred' && lv.lastTransferDate) {
          successDate = new Date(lv.lastTransferDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
        }

        // Release Date
        const releaseDate = new Date(lv.scheduledCreditDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

        // Date Status (Remarks 1)
        const datePassed = new Date() >= new Date(lv.scheduledCreditDate);
        const dateStatus = datePassed ? '<span style="color:#10b981;">Successfully ✅</span>' : '<span style="color:#fbbf24;">Pending ⏳</span>';

        // Direct Status (Remarks 2)
        let conditionMet = data.activeDirects >= lv.requiredDirects;
        if (lv.level >= 6 && !datePassed) {
          conditionMet = false; // "6 se sabka total active k koi condition nii haiii lakin succesfully tbhi show hoga jab uska release date ayega"
        }
        const directStatus = conditionMet ? '<span style="color:#10b981;">Successfully ✅</span>' : '<span style="color:#fbbf24;">Pending ⏳</span>';

        // Action Button
        let btnHtml = '-';
        if (lv.status === 'Transferred') {
          btnHtml = `<span style="color:#a78bfa;font-size:0.8rem;">✓ Transferred</span>`;
        } else if (canTransfer) {
          const transferAmt = lv.dailyTransferPct > 0 ? lv.todayTransferable : lv.remaining;
          btnHtml = `<button class="ab-transfer-btn" data-level="${lv.level}" data-amount="${transferAmt}" data-daily="${lv.dailyTransferPct>0}"
            style="background:linear-gradient(135deg,#00c6ff,#7b2ff7);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;">
            Transfer
          </button>`;
        } else if (lv.status === 'Pending' || lv.status === 'Locked') {
          btnHtml = `<span style="color:#ef4444;font-size:0.8rem;">Locked</span>`;
        } else if (lv.status === 'Transferring' && lv.todayTransferable === 0) {
          btnHtml = `<span style="color:#00c6ff;font-size:0.8rem;">Daily Limit Reached</span>`;
        }

        // Collect history
        if (lv.transferHistory && lv.transferHistory.length > 0) {
          lv.transferHistory.forEach(h => allHistory.push({ ...h, level: lv.level }));
        }

        tableHtml += `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:12px 10px;">${lv.level}</td>
            <td style="padding:12px 10px;color:#00c6ff;font-weight:600;">${lv.reward.toLocaleString()}</td>
            <td style="padding:12px 10px;">${releaseDate}</td>
            <td style="padding:12px 10px;">${lv.requiredDirects}</td>
            <td style="padding:12px 10px;">${successDate}</td>
            <td style="padding:12px 10px;">${dateStatus}</td>
            <td style="padding:12px 10px;">${directStatus}</td>
            <td style="padding:12px 10px;">${btnHtml}</td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table></div>`;
      container.innerHTML = tableHtml;

      if (window.lucide) lucide.createIcons();

      // Attach transfer button events
      document.querySelectorAll('.ab-transfer-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const level  = parseInt(btn.dataset.level);
          const amount = parseFloat(btn.dataset.amount);
          const isDaily = btn.dataset.daily === 'true';

          btn.disabled = true;
          btn.textContent = 'Processing...';

          try {
            const resp = await apiCall('/api/user/auto-blaster/transfer', 'POST', { level, amount });
            showToast('Auto Blaster ⚡', resp.message, 'success');
            await renderAutoBlasterData(); // refresh
          } catch (err) {
            showToast('Transfer Failed', err.message, 'error');
            btn.disabled = false;
            btn.textContent = isDaily ? `⚡ Transfer ${amount} COIN Today` : '⚡ Transfer to Withdraw Wallet';
          }
        });
      });

      // Render transfer history
      allHistory.sort((a,b) => new Date(b.date) - new Date(a.date));
      if (allHistory.length === 0) {
        historyEl.innerHTML = `<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:20px;">No transfers yet.</p>`;
      } else {
        historyEl.innerHTML = `<div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead>
              <tr style="color:var(--text-muted);text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">
                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-glass);">Date</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-glass);">Level</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-glass);">Amount</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-glass);">TX ID</th>
                <th style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--border-glass);">Status</th>
              </tr>
            </thead>
            <tbody>
              ${allHistory.map(h => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:9px 10px;color:var(--text-secondary);">${new Date(h.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
                  <td style="padding:9px 10px;"><span style="background:rgba(0,198,255,0.12);color:#00c6ff;padding:2px 8px;border-radius:6px;font-weight:600;">L${h.level}</span></td>
                  <td style="padding:9px 10px;color:#10b981;font-weight:700;">+${h.amount.toLocaleString()} COIN</td>
                  <td style="padding:9px 10px;color:var(--text-muted);font-size:0.75rem;font-family:monospace;">${h.txid}</td>
                  <td style="padding:9px 10px;text-align:center;"><span style="background:rgba(16,185,129,0.12);color:#10b981;padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">Transferred</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="glassmorphism" style="padding:30px;text-align:center;border-radius:14px;">
        <p style="color:#ef4444;">Error loading Auto Blaster: ${e.message}</p>
      </div>`;
      console.error('[AUTO BLASTER UI]', e);
    }
  }

  async function renderDashboardData() {

    await fetchUserContext();
    const db = userContext;
    if (!currentUser) return;
    
    const isActive = currentUser.status === 'Active' || currentUser.idStatus === 'Activated';
    
    // Welcome Header
    document.getElementById('dash-greeting-name').textContent = currentUser.name || 'User';
    document.getElementById('dash-userid-line').textContent = `User ID: ${currentUser.userId || 'N/A'}`;
    
    const statusEl = document.getElementById('dash-account-status');
    if (statusEl) {
      if (isActive) {
        statusEl.textContent = 'ACTIVE';
        statusEl.style.backgroundColor = 'var(--success)';
        statusEl.style.color = '#fff';
      } else {
        statusEl.textContent = currentUser.status === 'Pending Verification' ? 'PENDING' : 'INACTIVE';
        statusEl.style.backgroundColor = 'var(--danger)';
        statusEl.style.color = '#fff';
      }
    }
    
    // Referral Link
    const refLinkInput = document.getElementById('dash-ref-link');
    if (refLinkInput) {
      if (isActive) {
        refLinkInput.value = `${window.location.origin}/register?ref=${currentUser.userId}`;
      } else {
        refLinkInput.value = 'Activate account to unlock referral link';
      }
    }

    // Join Date
    const joinDateEl = document.getElementById('dash-metric-join-date');
    if (joinDateEl) {
      if (currentUser.registrationDate) {
        joinDateEl.textContent = new Date(currentUser.registrationDate).toLocaleDateString();
      } else {
        joinDateEl.textContent = 'N/A';
      }
    }

    // Activation Date
    const actDateEl = document.getElementById('dash-metric-activation-date');
    if (actDateEl) {
      if (isActive && currentUser.activationApproval && currentUser.activationApproval.approvedDate) {
        actDateEl.textContent = new Date(currentUser.activationApproval.approvedDate).toLocaleDateString();
      } else {
        actDateEl.textContent = 'Not Activated';
        actDateEl.style.color = 'var(--text-muted)';
      }
    }

    // Financial Metrics
    const todayIncomeEl = document.getElementById('dash-metric-today-income');
    if (todayIncomeEl) todayIncomeEl.textContent = `${(db.todayIncome || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;

    const totalIncomeEl = document.getElementById('dash-metric-total-income');
    // Using direct+referral+level+club+rewards+auto
    const totalIncomeCalc = db.incomeBreakdown?.total || 0;
    if (totalIncomeEl) totalIncomeEl.textContent = `${totalIncomeCalc.toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;

    const withdrawWalletEl = document.getElementById('dash-metric-withdraw-wallet');
    if (withdrawWalletEl) withdrawWalletEl.textContent = `${(db.balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;
    

    const fundWalletEl = document.getElementById('dash-metric-fund-wallet');
    if (fundWalletEl) fundWalletEl.textContent = `${(db.fundBalance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;

    const totalWithdrawalEl = document.getElementById('dash-metric-total-withdrawal');
    if (totalWithdrawalEl) totalWithdrawalEl.textContent = `${(db.totalWithdrawal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;

    // Team and Referral Metrics
    const totalTeamEl = document.getElementById('dash-metric-total-team');
    if (totalTeamEl) totalTeamEl.textContent = db.teamData?.totalTeamSize || 0;

    const activeTeamEl = document.getElementById('dash-metric-active-team');
    // We assume getActiveTeamCount returns activeCount or activeRefs.length
    const activeTeamCount = db.teamData?.activeCount !== undefined ? db.teamData.activeCount : (db.teamData?.activeRefs?.length || 0);
    if (activeTeamEl) activeTeamEl.textContent = activeTeamCount;

    const totalRefEl = document.getElementById('dash-metric-total-referral');
    if (totalRefEl) totalRefEl.textContent = db.directReferrals?.total || 0;

    const activeRefEl = document.getElementById('dash-metric-active-referral');
    if (activeRefEl) activeRefEl.textContent = db.directReferrals?.active || 0;

    // ===== 👑 CLUB QUALIFY BANNERS =====
    const clubData     = db.clubQualify || {};
    const qualifyBanner  = document.getElementById('club-qualify-banner');
    const progressBanner = document.getElementById('club-progress-banner');
    const isUserActive = currentUser.status === 'Active' || currentUser.idStatus === 'Activated';

    if (qualifyBanner)  qualifyBanner.style.display  = 'none';
    if (progressBanner) progressBanner.style.display = 'none';

    if (isUserActive) {
      if (clubData.qualified) {
        // Show qualified banner
        if (qualifyBanner) qualifyBanner.style.display = 'block';
        const bannerDirects = document.getElementById('club-banner-directs');
        const bannerDate    = document.getElementById('club-banner-date');
        if (bannerDirects) bannerDirects.textContent = clubData.directsCount || 15;
        if (bannerDate && clubData.date) {
          bannerDate.textContent = new Date(clubData.date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
        }
      } else {
        // Show in-progress banner
        if (progressBanner) progressBanner.style.display = 'block';
        const count = clubData.directsCount || 0;
        const countEl   = document.getElementById('club-prog-count');
        const bar2El    = document.getElementById('club-prog-bar2');
        if (countEl) countEl.textContent = count;
        if (bar2El)  bar2El.style.width  = Math.min(100, (count / 15) * 100) + '%';
      }
    }
    
    // Call the new Analytics Renderer
    renderDashboardAnalytics(db);

    // We no longer need to call renderActivationBanner or renderDashboardCharts because they are removed from UI.
  }

  // Analytics Dashboard Feature
  function renderDashboardAnalytics(db) {
    // 1. Data extraction
    const totalIncome = db.incomeBreakdown?.total || 0;
    const totalTeam = db.teamData?.totalTeamSize || 0;
    const activeTeam = db.teamData?.activeCount !== undefined ? db.teamData.activeCount : (db.teamData?.activeRefs?.length || 0);
    const inactiveTeam = Math.max(0, totalTeam - activeTeam);
    const activationRate = totalTeam > 0 ? ((activeTeam / totalTeam) * 100).toFixed(1) : '0.0';

    const incomeWallet = db.balance || 0;
    const fundWallet = db.fundBalance || 0;
    const totalWithdrawal = db.totalWithdrawal || 0;

    // 2. Populate top cards
    const analyticsIncomeEl = document.getElementById('analytics-total-income');
    const analyticsTeamEl = document.getElementById('analytics-total-team');
    const analyticsActiveEl = document.getElementById('analytics-active-team');
    const analyticsRateEl = document.getElementById('analytics-activation-rate');

    if (analyticsIncomeEl) analyticsIncomeEl.textContent = `${totalIncome.toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;
    if (analyticsTeamEl) analyticsTeamEl.textContent = `${totalTeam} Nodes`;
    if (analyticsActiveEl) analyticsActiveEl.textContent = `${activeTeam} Active`;
    if (analyticsRateEl) analyticsRateEl.textContent = `${activationRate}%`;

    // 3. Render Network Chart
    const ctxNetwork = document.getElementById('networkPerformanceChart');
    if (ctxNetwork) {
      if (chartInstances['network']) chartInstances['network'].destroy();
      
      const ctx2d = ctxNetwork.getContext('2d');
      const gradientActive = ctx2d.createLinearGradient(0, 0, 0, 300);
      gradientActive.addColorStop(0, 'rgba(16, 185, 129, 1)'); // Bright green
      gradientActive.addColorStop(1, 'rgba(16, 185, 129, 0.2)');

      const gradientInactive = ctx2d.createLinearGradient(0, 0, 0, 300);
      gradientInactive.addColorStop(0, 'rgba(239, 68, 68, 1)'); // Bright red
      gradientInactive.addColorStop(1, 'rgba(239, 68, 68, 0.2)');

      chartInstances['network'] = new Chart(ctxNetwork, {
        type: 'doughnut',
        data: {
          labels: ['Active Nodes', 'Inactive Nodes'],
          datasets: [{
            data: [activeTeam, inactiveTeam],
            backgroundColor: [gradientActive, gradientInactive],
            borderWidth: 0,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              position: 'bottom', 
              labels: { color: '#e2e8f0', font: { family: "'Space Grotesk', sans-serif", size: 13 }, padding: 20 } 
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleColor: '#fff',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 14,
              cornerRadius: 12,
              displayColors: true
            }
          },
          cutout: '75%',
          layout: { padding: 10 }
        }
      });
    }

    // 4. Render Wallet Distribution Chart
    const ctxWallet = document.getElementById('walletDistributionChart');
    if (ctxWallet) {
      if (chartInstances['wallet']) chartInstances['wallet'].destroy();

      const ctx2d = ctxWallet.getContext('2d');
      const gradIncome = ctx2d.createLinearGradient(0, 0, 0, 300);
      gradIncome.addColorStop(0, 'rgba(0, 198, 255, 1)');
      gradIncome.addColorStop(1, 'rgba(0, 198, 255, 0.1)');

      const gradFund = ctx2d.createLinearGradient(0, 0, 0, 300);
      gradFund.addColorStop(0, 'rgba(38, 161, 123, 1)');
      gradFund.addColorStop(1, 'rgba(38, 161, 123, 0.1)');

      const gradWithdraw = ctx2d.createLinearGradient(0, 0, 0, 300);
      gradWithdraw.addColorStop(0, 'rgba(251, 191, 36, 1)');
      gradWithdraw.addColorStop(1, 'rgba(251, 191, 36, 0.1)');

      chartInstances['wallet'] = new Chart(ctxWallet, {
        type: 'bar',
        data: {
          labels: ['Withdraw Wallet', 'Fund Wallet', 'Total Withdrawn'],
          datasets: [{
            label: 'Capital (COIN)',
            data: [incomeWallet, fundWallet, totalWithdrawal],
            backgroundColor: [gradIncome, gradFund, gradWithdraw],
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 45
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleColor: '#fff',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 14,
              cornerRadius: 12
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#94a3b8', font: { family: "'Space Grotesk', sans-serif" } },
              border: { display: false }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#e2e8f0', font: { family: "'Space Grotesk', sans-serif", size: 12 } },
              border: { display: false }
            }
          },
          layout: { padding: { top: 15 } }
        }
      });
    }
  }

  // Wallet View Renderer
  async function renderWalletData() {
    await fetchUserContext();
    const db = userContext;

    const setContent = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    setContent('wallet-card-balance', `${db.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`);
    setContent('wallet-fund-balance', `${db.fundBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`);
    setContent('wallet-card-holder', currentUser.name);
    setContent('wallet-card-expiry', `ID: ${currentUser.userId}`);

    // Render Activation Banner in Wallet
    const walletIdBadge = document.getElementById('wallet-id-badge');
    const walletActivationBlock = document.getElementById('wallet-activation-action-block');
    const activateIdCard = document.getElementById('activate-id-card');

    if (activateIdCard) {
      if (currentUser.status === 'Active') {
        activateIdCard.style.display = 'none';
      } else {
        activateIdCard.style.display = 'block';
        if (walletIdBadge && walletActivationBlock) {
          const isPending = currentUser.status === 'Pending Verification';
          walletIdBadge.textContent = isPending ? 'Pending' : 'Inactive';
          walletIdBadge.className = isPending ? 'badge badge-warning' : 'badge badge-danger';
          
          walletActivationBlock.innerHTML = `
            <button class="btn btn-primary btn-full sky-gradient-btn" id="activate-id-btn" ${db.fundBalance < 1000 ? 'style="opacity: 0.65;"' : ''}>
              <span>Activate ID Now (1000.00 COIN)</span>
              <i data-lucide="shield-check"></i>
            </button>
            ${db.fundBalance < 1000 
              ? `<p style="color:var(--accent-red); font-size:11px; margin-top:8px; text-align:center; font-family:var(--font-mono);">Fund Wallet Balance (${db.fundBalance.toFixed(2)} COIN) is insufficient. Please deposit.</p>` 
              : `<p style="color:var(--accent-green); font-size:11px; margin-top:8px; text-align:center; font-family:var(--font-mono);">Fund Balance is ready. Click above to activate.</p>`
            }
          `;
          
          lucide.createIcons();
          
          const actBtn = document.getElementById('activate-id-btn');
          if (actBtn) {
            actBtn.onclick = async function() {
              if (db.fundBalance < 1000) {
                showToast("Insufficient Balance", "Your Fund Wallet balance is less than 1000.00 COIN. Please complete deposit verification first.", "error");
                return;
              }
              try {
                this.disabled = true;
                this.innerHTML = '<i data-lucide="loader" class="spin"></i> Activating...';
                lucide.createIcons();
                
                const res = await apiCall('/api/user/activate-id', 'POST');
                showToast("ID Activated", res.message, "success");
                openCongratulationsModal();
                await fetchUserContext();
                renderWalletData();
                toggleSidebarLocks(true);
                const verifiedCheckmark = document.getElementById('dash-verified-checkmark');
                if (verifiedCheckmark) verifiedCheckmark?.classList.remove('hidden');
              } catch (e) {
                this.disabled = false;
                this.innerHTML = '<span>Activate ID Now (1000.00 COIN)</span><i data-lucide="shield-check"></i>';
                lucide.createIcons();
                showToast("Activation Failed", e.message, "error");
              }
            };
          }
        }
      }
    }

    // ===== P2P: Live Receiver Lookup =====
    const p2pTargetInput = document.getElementById('p2p-target-id');
    const p2pPreview = document.getElementById('p2p-receiver-preview');
    const p2pPreviewName = document.getElementById('p2p-receiver-name');
    const p2pPreviewId = document.getElementById('p2p-receiver-id');
    const p2pErrBox = document.getElementById('p2p-receiver-error');

    if (p2pTargetInput) {
      // Use oninput to prevent duplicate listeners if renderWalletData is called multiple times
      p2pTargetInput.oninput = () => {
        if (window.p2pLookupTimer) clearTimeout(window.p2pLookupTimer);
        const val = p2pTargetInput.value.trim().toUpperCase();
        
        if (p2pPreview) p2pPreview.style.display = 'none';
        if (p2pErrBox) p2pErrBox.style.display = 'none';
        
        if (!val || val.length < 5) return;

        window.p2pLookupTimer = setTimeout(async () => {
          try {
            // Use raw fetch to avoid apiCall's built-in error Toasts for partial typing 404s
            const response = await fetch(`/api/user/lookup/${val}`, {
              headers: { 'Authorization': `Bearer ${jwtToken}` }
            });
            const data = await response.json();
            
            if (response.ok && data.userId) {
              if (p2pPreview) p2pPreview.style.display = 'block';
              if (p2pPreviewName) p2pPreviewName.textContent = data.name;
              if (p2pPreviewId) p2pPreviewId.textContent = `(${data.userId})`;
              if (p2pErrBox) p2pErrBox.style.display = 'none';
            } else {
              if (p2pPreview) p2pPreview.style.display = 'none';
              if (p2pErrBox) {
                p2pErrBox.textContent = data.error || "User not found";
                p2pErrBox.style.display = 'block';
              }
            }
          } catch (e) {
            if (p2pPreview) p2pPreview.style.display = 'none';
            if (p2pErrBox) {
              p2pErrBox.textContent = "Error fetching user";
              p2pErrBox.style.display = 'block';
            }
          }
        }, 500);
      };
    }

    // ===== P2P Submit Listener & Modal Handling =====
    const submitBtn = document.getElementById('p2p-submit-btn');
    const confirmModal = document.getElementById('p2p-confirm-modal');
    const confirmYesBtn = document.getElementById('p2p-confirm-yes');
    const confirmCancelBtn = document.getElementById('p2p-confirm-cancel');

    if (submitBtn) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const targetInput = document.getElementById('p2p-target-id');
        const amountInput = document.getElementById('p2p-amount');
        const walletSelect = document.getElementById('p2p-source-wallet');
        const pinInput = document.getElementById('p2p-tx-password');
        
        // Use the resolved userId from lookup preview (handles email input)
        const p2pResolvedId = document.getElementById('p2p-receiver-id');
        let targetUserId = '';
        if (p2pResolvedId && p2pResolvedId.textContent) {
          // Preview shows "(BLU000026)" — strip parentheses
          targetUserId = p2pResolvedId.textContent.replace(/[()]/g, '').trim();
        }
        if (!targetUserId) {
          targetUserId = targetInput ? targetInput.value.trim().toUpperCase() : '';
        }

        const amount = amountInput ? parseFloat(amountInput.value) : 0;
        const sourceWallet = walletSelect ? walletSelect.value : 'fund';
        const pin = pinInput ? pinInput.value : '';

        if (isNaN(amount) || amount < 1) return showToast("Invalid Amount", "Amount must be at least 1 COIN", "error");
        if (!targetUserId) return showToast("Required", "Enter Receiver User ID or Email", "error");
        if (!pin) return showToast("Required", "Enter Transaction Password", "error");
        if (typeof currentUser !== 'undefined' && targetUserId === currentUser.userId) return showToast("Error", "Cannot send to yourself", "error");

        // Verify receiver name is loaded
        const receiverNameEl = document.getElementById('p2p-receiver-name');
        const receiverName = receiverNameEl ? receiverNameEl.textContent : 'Unknown User';
        if (receiverName === 'Unknown User' || receiverName === '') {
          return showToast("Hold on", "Please wait for receiver ID to be verified", "warning");
        }

        // Populate Modal (null-safe)
        const cName = document.getElementById('p2p-confirm-name');
        if (cName) cName.textContent = receiverName;
        const cId = document.getElementById('p2p-confirm-id');
        if (cId) cId.textContent = targetUserId;
        const walletNameEl = document.getElementById('p2p-confirm-wallet');
        if (walletNameEl) walletNameEl.textContent = sourceWallet === 'fund' ? 'Fund Wallet' : 'Withdraw Wallet';
        const cAmount = document.getElementById('p2p-confirm-amount');
        if (cAmount) cAmount.textContent = `${amount.toLocaleString('en-US', {minimumFractionDigits: 2})} COIN`;

        // Open Modal
        if (confirmModal) confirmModal.style.display = 'flex';

        // Bind Confirm Action
        if (confirmYesBtn) {
          confirmYesBtn.onclick = async () => {
            try {
              confirmYesBtn.disabled = true;
              confirmYesBtn.innerText = "Processing...";

              const jwtToken = localStorage.getItem('blulegacy_jwt_token');
              const response = await fetch('/api/user/p2p-transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
                body: JSON.stringify({ targetUserId, amount, sourceWallet, pin })
              });

              const data = await response.json();

              if (response.ok) {
                confirmModal.style.display = 'none';
                showToast("TRANSFER SUCCESSFUL", `Sent ${amount} COIN to ${targetUserId}`, "success");
                
                if (targetInput) targetInput.value = '';
                if (amountInput) amountInput.value = '';
                if (pinInput) pinInput.value = '';
                
                const p2pPrev = document.getElementById('p2p-receiver-preview');
                if (p2pPrev) p2pPrev.style.display = 'none';

                if (typeof fetchUserContext === 'function') await fetchUserContext();
                if (typeof renderWalletData === 'function') renderWalletData();
              } else {
                showToast("TRANSFER FAILED", data.message || data.error, "error");
              }
            } catch (error) {
              showToast("TRANSFER FAILED", error.message, "error");
            } finally {
              confirmYesBtn.disabled = false;
              confirmYesBtn.innerText = "Confirm & Send";
            }
          };
        }

        // Bind Cancel Action
        if (confirmCancelBtn) {
          confirmCancelBtn.onclick = () => {
            confirmModal.style.display = 'none';
          };
        }
      });
    }

    // ===== P2P Transfer History =====
    try {
      const historyData = await apiCall('/api/user/p2p-history');
      const histContainer = document.getElementById('p2p-history-container');
      if (histContainer) {
        const allItems = [];
        (historyData.sent || []).forEach(t => allItems.push({ ...t, direction: 'sent' }));
        (historyData.received || []).forEach(t => allItems.push({ ...t, direction: 'received' }));
        allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (allItems.length === 0) {
          histContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px; font-size:13px;">No P2P transfers yet.</p>';
        } else {
          histContainer.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead><tr style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:0.5px;">
              <th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--border-glass);">Direction</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--border-glass);">Counterparty</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--border-glass);">Amount</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--border-glass);">Date</th>
              <th style="padding:8px 10px; text-align:center; border-bottom:1px solid var(--border-glass);">Status</th>
            </tr></thead><tbody>${allItems.slice(0, 20).map(t => {
              const isSent = t.direction === 'sent';
              const name = isSent ? t.receiverName : t.senderName;
              const id = isSent ? t.receiverId : t.senderId;
              return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:8px 10px;"><span style="color:${isSent ? '#ef4444' : '#10b981'}; font-weight:700;">${isSent ? '↑ SENT' : '↓ RECEIVED'}</span></td>
                <td style="padding:8px 10px; color:var(--text-secondary);">${name} <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">(${id})</span></td>
                <td style="padding:8px 10px; color:${isSent ? '#ef4444' : '#10b981'}; font-weight:700; font-family:var(--font-mono);">${isSent ? '-' : '+'}${t.amount.toLocaleString('en-US', {minimumFractionDigits:2})} COIN</td>
                <td style="padding:8px 10px; color:var(--text-muted);">${new Date(t.date).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</td>
                <td style="padding:8px 10px; text-align:center;"><span style="background:rgba(16,185,129,0.12); color:#10b981; padding:2px 10px; border-radius:20px; font-size:0.72rem; font-weight:700;">Success</span></td>
              </tr>`;
            }).join('')}</tbody></table></div>`;
        }
      }
    } catch(e) { /* p2p history non-fatal */ }

    // ===== ⚡ Auto Blaster Wallet Panel =====
    const abPanelBalance  = document.getElementById('ab-panel-balance');
    const abPanelUnlocked = document.getElementById('ab-panel-unlocked');
    const abPanelDirects  = document.getElementById('ab-panel-directs');
    const abLevelSelect   = document.getElementById('ab-level-select');
    const abLevelInfo     = document.getElementById('ab-selected-level-info');
    const abSelAvail      = document.getElementById('ab-sel-available');
    const abSelDailyWrap  = document.getElementById('ab-sel-daily-wrap');
    const abSelDaily      = document.getElementById('ab-sel-daily');
    const abSelStatus     = document.getElementById('ab-sel-status');
    const abAmountInput   = document.getElementById('ab-transfer-amount');
    const abNoUnlocked    = document.getElementById('ab-no-unlocked-msg');
    const abTransferBtn   = document.getElementById('ab-wallet-transfer-btn');
    const abCardBalance   = document.getElementById('wallet-ab-balance');

    // Load AB data into wallet panel
    let abLevels = [];
    try {
      const abData = await apiCall('/api/user/auto-blaster');
      abLevels = abData.levels || [];

      const abBal = abData.autoBlasterBalance || 0;
      if (abPanelBalance) abPanelBalance.textContent = abBal.toLocaleString('en-US', {minimumFractionDigits:2}) + ' COIN';
      if (abCardBalance)  abCardBalance.textContent  = abBal.toLocaleString('en-US', {minimumFractionDigits:2});
      if (abPanelDirects) abPanelDirects.textContent = abData.activeDirects || 0;

      const unlockedLevels = abLevels.filter(lv => (lv.status === 'Unlocked' || lv.status === 'Transferring') && lv.todayTransferable > 0);
      if (abPanelUnlocked) abPanelUnlocked.textContent = unlockedLevels.length + ' / 6';

      // Populate level dropdown
      if (abLevelSelect) {
        abLevelSelect.innerHTML = '<option value="">-- Select a level --</option>';
        if (unlockedLevels.length === 0) {
          if (abNoUnlocked)    abNoUnlocked.style.display = 'block';
          if (abLevelSelect)   abLevelSelect.style.display = 'none';
          if (abLevelInfo)     abLevelInfo.style.display = 'none';
          if (abAmountInput)   abAmountInput.closest('.input-group').style.display = 'none';
          if (abTransferBtn)   abTransferBtn.style.display = 'none';
        } else {
          if (abNoUnlocked)  abNoUnlocked.style.display = 'none';
          if (abLevelSelect) abLevelSelect.style.display = '';
          if (abAmountInput) abAmountInput.closest('.input-group').style.display = '';
          if (abTransferBtn) abTransferBtn.style.display = '';

          const icons = ['','⚡','🔥','💎','🚀','🌟','👑'];
          unlockedLevels.forEach(lv => {
            const opt = document.createElement('option');
            opt.value = lv.level;
            const lbl = lv.level === 6
              ? `${icons[lv.level]} Level ${lv.level} — ${lv.todayTransferable} COIN today (1%/day)`
              : `${icons[lv.level]} Level ${lv.level} — ${lv.remaining.toLocaleString()} COIN available`;
            opt.textContent = lbl;
            abLevelSelect.appendChild(opt);
          });
        }
      }
    } catch(e) {
      if (abPanelBalance) abPanelBalance.textContent = 'Error';
    }

    // On level select change — update info card and max amount
    if (abLevelSelect) {
      abLevelSelect.onchange = () => {
        const selLevel = parseInt(abLevelSelect.value);
        const lv = abLevels.find(l => l.level === selLevel);
        if (!lv || !abLevelInfo) { if (abLevelInfo) abLevelInfo.style.display='none'; return; }

        abLevelInfo.style.display = 'block';
        if (abSelAvail)  abSelAvail.textContent = lv.level === 6
          ? `${lv.todayTransferable} COIN (today's quota)`
          : `${lv.remaining.toLocaleString()} COIN`;
        if (abSelStatus) abSelStatus.textContent = lv.status;
        if (abSelStatus) abSelStatus.style.color = lv.status === 'Unlocked' ? '#10b981' : '#00c6ff';

        if (lv.level === 6 && lv.dailyTransferPct > 0) {
          if (abSelDailyWrap) abSelDailyWrap.style.display = 'inline';
          if (abSelDaily)     abSelDaily.textContent = `${lv.dailyLimit} COIN/day`;
        } else {
          if (abSelDailyWrap) abSelDailyWrap.style.display = 'none';
        }

        // Auto-fill max amount
        if (abAmountInput) abAmountInput.value = lv.level === 6 ? lv.todayTransferable : lv.remaining;
      };
    }

    // Transfer button handler
    if (abTransferBtn) {
      abTransferBtn.onclick = async () => {
        const selLevel = parseInt(abLevelSelect?.value);
        const amount   = parseFloat(abAmountInput?.value);

        if (!selLevel) return showToast('Select Level', 'Please select an Auto Blaster level.', 'error');
        if (!amount || amount <= 0) return showToast('Invalid Amount', 'Enter amount greater than 0.', 'error');

        const lv = abLevels.find(l => l.level === selLevel);
        if (lv && lv.level === 6 && amount > lv.todayTransferable) {
          return showToast('Limit Exceeded', `Today's max for Level 6 is ${lv.todayTransferable} COIN.`, 'error');
        }
        if (lv && lv.level !== 6 && amount > lv.remaining) {
          return showToast('Limit Exceeded', `Available balance is ${lv.remaining} COIN.`, 'error');
        }

        const origHtml = abTransferBtn.innerHTML;
        abTransferBtn.disabled = true;
        abTransferBtn.innerHTML = '<i data-lucide="loader" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i><span>Processing...</span>';
        if (window.lucide) lucide.createIcons();

        try {
          const res = await apiCall('/api/user/auto-blaster/transfer', 'POST', { level: selLevel, amount });
          showToast('⚡ Auto Blaster', res.message, 'success');
          if (abAmountInput) abAmountInput.value = '';
          if (abLevelSelect) abLevelSelect.value = '';
          if (abLevelInfo)   abLevelInfo.style.display = 'none';
          await renderWalletData(); // full refresh
        } catch (err) {
          showToast('Transfer Failed', err.message, 'error');
          abTransferBtn.disabled = false;
          abTransferBtn.innerHTML = origHtml;
          if (window.lucide) lucide.createIcons();
        }
      };
    }


    // ===== Ledger: All Transactions =====
    const tbody = document.getElementById('wallet-history-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (!db.transactions || db.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No transaction logs recorded.</td></tr>';
      } else {
        db.transactions.forEach(t => {
          const isCredit = t.type === 'credit';
          tbody.innerHTML += `
            <tr>
              <td class="font-space" style="font-size:11px;">${t.txid}</td>
              <td>${new Date(t.date).toLocaleString()}</td>
              <td><strong>${t.category}</strong></td>
              <td><span style="font-size:11px; color:var(--text-muted);">${t.note || '—'}</span></td>
              <td class="font-space ${isCredit ? 'text-green' : 'text-red'}">${isCredit ? '+' : '-'}${t.amount.toFixed(2)} COIN</td>
              <td><span class="badge badge-success">Approved</span></td>
            </tr>
          `;
        });
      }
    }

    // ===== Ledger: P2P Transfer History =====
    const p2pHistoryBody = document.getElementById('p2p-history-body');
    if (p2pHistoryBody) {
      const p2pTxs = db.transactions ? db.transactions.filter(t => t.category === 'P2P Transfer') : [];
      if (p2pTxs.length === 0) {
        p2pHistoryBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No P2P transfers yet.</td></tr>';
      } else {
        p2pHistoryBody.innerHTML = '';
        p2pTxs.forEach(t => {
          const isSent = t.type === 'debit';
          const direction = isSent
            ? `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--accent-red); font-weight:600; font-size:12px;">↑ SENT</span>`
            : `<span style="display:inline-flex; align-items:center; gap:4px; color:#26a17b; font-weight:600; font-size:12px;">↓ RECEIVED</span>`;
          p2pHistoryBody.innerHTML += `
            <tr>
              <td class="font-space" style="font-size:11px;">${t.txid}</td>
              <td>${direction}</td>
              <td style="font-size:12px;">${t.note || '—'}</td>
              <td>${new Date(t.date).toLocaleString()}</td>
              <td class="font-space ${isSent ? 'text-red' : 'text-green'}">${isSent ? '-' : '+'}${t.amount.toFixed(2)} COIN</td>
              <td><span class="badge badge-success">Approved</span></td>
            </tr>
          `;
        });
      }
    }
  }

  // Withdraw View Renderer
  async function renderWithdrawData() {
    await fetchUserContext();
    const db = userContext;

    // Top Metrics
    const balance = db.balance || 0;
    const totalEarnings = db.incomeBreakdown?.total || 0;
    const todayEarnings = db.todayIncome || 0;

    // Calculate Pending Withdrawals
    const pendingTxs = (db.withdrawals || []).filter(w => w.status === 'Pending' || w.status === 'Processing');
    const pendingAmount = pendingTxs.reduce((sum, w) => sum + w.amount, 0);

    const wbal = document.getElementById('withdraw-wallet-balance');
    const wtot = document.getElementById('withdraw-total-earnings');
    const wtoday = document.getElementById('withdraw-today-earnings');
    const wpen = document.getElementById('withdraw-total-pending');

    if (wbal) wbal.textContent = `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wtot) wtot.textContent = `${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wtoday) wtoday.textContent = `${todayEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wpen) wpen.textContent = `${pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    // Auto-fill user details
    const uidEl = document.getElementById('withdraw-auto-userid');
    if (uidEl) uidEl.value = currentUser.userId || '';
    
    const unameEl = document.getElementById('withdraw-auto-name');
    if (unameEl) unameEl.value = currentUser.name || '';
    
    const umobEl = document.getElementById('withdraw-auto-mobile');
    if (umobEl) umobEl.value = currentUser.mobile || '';
    
    const uemailEl = document.getElementById('withdraw-auto-email');
    if (uemailEl) uemailEl.value = currentUser.email || '';

    const ubalEl = document.getElementById('withdraw-auto-balance');
    if (ubalEl) ubalEl.value = `${db.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    const w_avail = document.getElementById('withdraw-avail-balance'); if(w_avail) w_avail.textContent = `${db.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    const withdrawFundEl = document.getElementById('withdraw-fund-wallet');
    if (withdrawFundEl) withdrawFundEl.textContent = `${db.fundBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    document.getElementById('withdraw-request-form').onsubmit = async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('withdraw-amount').value);
      const destination = document.getElementById('withdraw-address').value.trim();
      const pin = document.getElementById('withdraw-pin').value;

      try {
        const res = await apiCall('/api/user/withdraw', 'POST', { amount, destination, pin });
        showToast("Success", res.message, "success");
        document.getElementById('withdraw-request-form').reset();
        renderWithdrawData();
      } catch (err) {}
    };

    // Withdraw History
    const tbody = document.getElementById('withdraw-history-body');
    tbody.innerHTML = '';
    if (db.withdrawals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No withdrawal requests raised.</td></tr>';
    } else {
      db.withdrawals.forEach(w => {
        let badgeClass = 'badge-warning';
        if (w.status === 'Completed') badgeClass = 'badge-success';
        if (w.status === 'Rejected') badgeClass = 'badge-danger';
        tbody.innerHTML += `
          <tr>
            <td class="font-space">${w.id}</td>
            <td>${new Date(w.createdAt).toLocaleString()}</td>
            <td class="font-space">${w.amount.toFixed(2)} COIN</td>
            <td class="font-space" style="font-size:11px;">${w.destination}</td>
            <td><span class="badge ${badgeClass}">${w.status}</span></td>
          </tr>
        `;
      });
    }
  }

  // Income Segment Renderer
  async function renderIncomeData() {
    await fetchUserContext();
    const db = userContext;

    document.getElementById('inc-total-val').textContent = `${db.incomeBreakdown.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    document.getElementById('inc-card-direct').textContent = `${db.incomeBreakdown.direct.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    document.getElementById('inc-card-referral').textContent = `${db.incomeBreakdown.referral.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    document.getElementById('inc-card-level').textContent = `${db.incomeBreakdown.level.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    renderIncomeCharts(db);

    const tbody = document.getElementById('income-history-body');
    tbody.innerHTML = '';
    const incomes = db.transactions.filter(t => t.type === 'credit' && t.category.includes('Income'));

    if (incomes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No MLM payout logs registered yet.</td></tr>';
    } else {
      incomes.forEach(t => {
        tbody.innerHTML += `
          <tr>
            <td class="font-space">${t.txid}</td>
            <td>${new Date(t.date).toLocaleString()}</td>
            <td><strong>${t.category}</strong></td>
            <td><span style="font-size:11px; color:var(--text-muted);">${t.note}</span></td>
            <td class="font-space text-green">+${t.amount.toFixed(2)} COIN</td>
          </tr>
        `;
      });
    }
  }

  // Support View Renderer
  async function renderSupportData() {
    await fetchUserContext();
    const db = userContext;

    const raiseForm = document.getElementById('raise-issue-form');
    let screenshotBase64 = "";

    const fileUploaderBox = document.getElementById('file-uploader-box');
    const fileInput = document.getElementById('ticket-attachment');
    const previewContainer = document.getElementById('attachment-preview-container');
    const previewName = document.getElementById('attachment-name');
    const removeBtn = document.getElementById('attachment-remove-btn');

    if (fileUploaderBox && fileInput) {
      // Click on box triggers file select
      fileUploaderBox.onclick = (e) => {
        if (e.target.id !== 'ticket-attachment') {
          fileInput.click();
        }
      };

      const handleFile = (file) => {
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
            screenshotBase64 = reader.result;
            if (previewContainer && previewName) {
              previewName.textContent = file.name;
              previewContainer?.classList.remove('hidden');
            }
          };
          reader.readAsDataURL(file);
        } else {
          showToast("Invalid File", "Please select or drag an image file.", "error");
        }
      };

      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          handleFile(file);
        }
      };

      // Drag and drop events
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileUploaderBox.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        fileUploaderBox.addEventListener(eventName, () => {
          fileUploaderBox?.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        fileUploaderBox.addEventListener(eventName, () => {
          fileUploaderBox?.classList.remove('drag-active');
        }, false);
      });

      fileUploaderBox.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file) {
          handleFile(file);
        }
      }, false);
    }

    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        screenshotBase64 = "";
        if (fileInput) fileInput.value = "";
        if (previewContainer) previewContainer?.classList.add('hidden');
      };
    }

    raiseForm.onsubmit = async (e) => {
      e.preventDefault();
      const category = document.getElementById('ticket-category').value;
      const description = document.getElementById('ticket-description').value.trim();

      try {
        const res = await apiCall('/api/user/ticket', 'POST', { category, description, screenshot: screenshotBase64 });
        showToast("Success", res.message, "success");
        raiseForm.reset();
        screenshotBase64 = "";
        if (previewContainer) previewContainer?.classList.add('hidden');
        renderSupportData();
      } catch (err) {}
    };

    // User tickets history
    const container = document.getElementById('tickets-history-container');
    container.innerHTML = '';
    if (db.supportTickets.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No queries recorded.</div>';
    } else {
      db.supportTickets.forEach(t => {
        let badgeClass = 'badge-warning';
        if (t.status === 'Resolved') badgeClass = 'badge-success';
        if (t.status === 'Closed') badgeClass = 'badge-danger';
        
        let chatHtml = '';
        if (t.chat && t.chat.length > 0) {
          chatHtml += '<div class="ticket-chat-container" style="display:flex; flex-direction:column; gap:8px; margin-top:15px; border-top:1px solid rgba(255,255,255,0.05); padding-top:15px;">';
          t.chat.forEach(msg => {
            const isUser = msg.sender === 'User';
            chatHtml += `
              <div style="align-self: ${isUser ? 'flex-start' : 'flex-end'}; max-width: 85%; background: ${isUser ? 'rgba(255,255,255,0.05)' : 'rgba(38,161,123,0.1)'}; border: 1px solid ${isUser ? 'transparent' : 'rgba(38,161,123,0.2)'}; padding: 10px 12px; border-radius: 8px;">
                <strong style="color: ${isUser ? 'var(--sky-primary)' : 'var(--accent-green)'}; font-size: 12px;">${isUser ? 'You' : 'Core Admin'}</strong>
                <p style="font-size: 13px; margin-top: 4px; color: #ddd;">${msg.text}</p>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">${new Date(msg.time).toLocaleString()}</div>
              </div>
            `;
          });
          chatHtml += '</div>';
        } else if (t.reply) { // Fallback for old mock data
          chatHtml = `
            <div class="admin-ticket-reply-box" style="margin-top:15px;">
              <span class="admin-reply-lbl">Core Admin Answer</span>
              <p class="admin-reply-content">${t.reply}</p>
            </div>
          `;
        } else {
          chatHtml = `<div style="margin-top:15px;"><span style="font-size:11px; color:var(--text-muted); font-style:italic;">Awaiting administrative verification...</span></div>`;
        }

        const replyFormHtml = t.status !== 'Closed' ? `
          <div style="margin-top: 15px; display:flex; gap:10px;">
            <input type="text" id="reply-input-${t.id}" placeholder="Type a reply..." style="flex:1; background:rgba(0,0,0,0.2); border:1px solid var(--border-glass); border-radius:6px; padding:8px 12px; color:white; font-size:13px;">
            <button class="btn btn-primary sky-gradient-btn" onclick="sendTicketReply('${t.id}')" style="padding: 8px 16px;">Reply</button>
          </div>
        ` : `<div style="margin-top: 15px; font-size:12px; color:var(--accent-red);">This ticket is closed and cannot be replied to.</div>`;

        container.innerHTML += `
          <div class="ticket-node-card glassmorphism">
            <div class="ticket-node-header">
              <h4>Ticket Reference: ${t.id} <span class="badge badge-sky" style="margin-left:8px;">${t.category}</span></h4>
              <span class="badge ${badgeClass}">${t.status}</span>
            </div>
            <p class="desc"><strong>Original Issue:</strong> ${t.description}</p>
            ${t.screenshot ? `
              <div style="margin-bottom:10px;">
                <img src="${t.screenshot}" class="admin-screenshot-thumbnail" onclick="window.open('${t.screenshot}', '_blank')">
              </div>
            ` : ''}
            ${chatHtml}
            ${replyFormHtml}
          </div>
        `;
      });
    }
  }

  // Handle user ticket replies
  window.sendTicketReply = async function(ticketId) {
    const input = document.getElementById(`reply-input-${ticketId}`);
    if (!input || !input.value.trim()) return;

    try {
      const res = await apiCall('/api/user/ticket-reply', 'POST', { ticketId, replyText: input.value });
      showToast("Success", res.message, "success");
      renderSupportData();
    } catch (e) {}
  };

  // Profile View Renderer
  function renderProfileData() {
    if (!currentUser) return;
    
    const setContent = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setContent('prof-name-lbl', currentUser.name);
    setContent('prof-title-name', currentUser.name);
    setContent('prof-title-userid', currentUser.userId);
    setContent('prof-large-avatar', currentUser.name.split(' ').map(n => n[0]).join(''));
    setContent('prof-userid-lbl', currentUser.userId);
    setContent('prof-email-lbl', currentUser.email);
    setContent('prof-mobile-lbl', currentUser.mobile);
    setContent('prof-role-badge', currentUser.role === 'admin' ? 'Platform Administrator' : 'Verified Wealth Node Member');

    // Account details fields
    setValue('prof-name', currentUser.name);
    setValue('prof-email', currentUser.email);
    setValue('prof-mobile', currentUser.mobile);
    setValue('prof-userid', currentUser.userId);

    const profileDetailsForm = document.getElementById('profile-details-form');
    if (profileDetailsForm) {
      profileDetailsForm.onsubmit = (e) => {
        e.preventDefault();
        showToast("Security Block", "Core identifier profile details locked for vault security.", "error");
      };
    }

    // Update login password
    const passwordForm = document.getElementById('profile-password-form');
    if (passwordForm) {
      passwordForm.onsubmit = async (e) => {
      e.preventDefault();
      const oldPassword = document.getElementById('prof-old-pass').value;
      const newPassword = document.getElementById('prof-new-pass').value;
      const confirmPass = document.getElementById('prof-new-pass-confirm').value;

      if (newPassword !== confirmPass) {
        showToast("Mismatch", "Vault security credentials mismatch.", "error");
        return;
      }

      try {
        const res = await apiCall('/api/user/update-password', 'POST', { oldPassword, newPassword });
        showToast("Success", res.message, "success");
        document.getElementById('profile-password-form').reset();
      } catch (err) {}
    };
  }

    // Update security PIN
    const txPasswordForm = document.getElementById('profile-tx-password-form');
    if (txPasswordForm) {
      txPasswordForm.onsubmit = async (e) => {
        e.preventDefault();
        const pin = document.getElementById('prof-tx-pass').value;
        const pinConf = document.getElementById('prof-tx-pass-confirm').value;

        if (pin !== pinConf) {
          showToast("Mismatch", "Vault security PIN mismatch.", "error");
          return;
        }

        try {
          const res = await apiCall('/api/user/update-pin', 'POST', { pin });
          showToast("Success", res.message, "success");
          txPasswordForm.reset();
          await fetchUserContext();
          renderProfileData();
        } catch (err) {}
      };
    }
  }

  // ==========================================================================
  // VIEW: ADMIN SPECIFIC DATA LOADERS
  // ==========================================================================

  async function renderAdminData() {
    const stats = await apiCall('/api/admin/dashboard');
    
    document.getElementById('admin-stat-users').textContent = stats.totalUsers;
    document.getElementById('admin-stat-active-users').textContent = stats.activeUsers;
    document.getElementById('admin-stat-pending-users').textContent = stats.pendingUsers;
    document.getElementById('admin-stat-deposits').textContent = `${stats.totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    document.getElementById('admin-stat-withdrawals').textContent = stats.totalWithdrawals ? `${stats.totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN` : '0.00 COIN';
    document.getElementById('admin-stat-volume').textContent = `${stats.totalGrossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    const activeTab = document.querySelector('.admin-tab-btn.active').getAttribute('data-admin-tab');
    refreshAdminTabContent(activeTab);
  }

  // Admin tabs switching binding
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b?.classList.remove('active'));
      btn?.classList.add('active');

      const targetTab = btn.getAttribute('data-admin-tab');
      document.querySelectorAll('.admin-tab-content').forEach(c => c?.classList.remove('active', 'hidden'));
      document.querySelectorAll('.admin-tab-content').forEach(c => {
        if (c.id === `admin-tab-${targetTab}`) c?.classList.add('active');
        else c?.classList.add('hidden');
      });

      refreshAdminTabContent(targetTab);
    };
  });

  async function refreshAdminTabContent(tabName) {
    if (!tabName) {
      tabName = document.querySelector('.admin-tab-btn.active').getAttribute('data-admin-tab');
    }
    
    const db = await apiCall('/api/admin/context');
    if (!db) return;

    // 1. Activation Verification Board
    if (tabName === 'activations') {
      const tbody = document.getElementById('admin-activations-table-body');
      tbody.innerHTML = '';

      const pendingList = await apiCall('/api/admin/activations-pending');

      if (pendingList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">No pending verification deposits found.</td></tr>';
        return;
      }

      pendingList.forEach(u => {
        const req = u.activationRequest || {};
        const depositAmt = req.depositAmount ? `${parseFloat(req.depositAmount).toFixed(2)} COIN` : '1000.00 COIN';
        tbody.innerHTML += `
          <tr>
            <td class="font-space text-sky">${u.userId}</td>
            <td>
              <strong>${u.name}</strong><br>
              <span class="text-muted" style="font-size:11px;">${u.email}</span><br>
              <span class="text-muted" style="font-size:11px;">${u.mobile}</span>
            </td>
            <td>${new Date(u.registrationDate).toLocaleDateString()}</td>
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <strong style="color:var(--sky-primary); font-size:14px;">${depositAmt}</strong>
                <span style="font-size:9px; color:var(--text-muted);">COIN</span>
              </div>
            </td>
            <td>
              ${req.screenshot ? `
                <img src="${req.screenshot}" class="admin-screenshot-thumbnail" onclick="window.open('${req.screenshot}', '_blank')" title="Click to view fullscreen" style="max-width:80px; max-height:60px; border-radius:4px; cursor:pointer; border:1px solid var(--border-sky);">
              ` : '<span class="text-muted" style="font-size:11px;">No screenshot</span>'}
            </td>
            <td>
              <strong>Hash:</strong> <span class="font-space" style="font-size:11px;">${req.txid || 'Unspecified'}</span><br>
              <strong>Pay Date:</strong> <span style="font-size:11px;">${req.payDate || 'N/A'}</span><br>
              <strong>Pay Time:</strong> <span style="font-size:11px;">${req.payTime || 'N/A'}</span><br>
              <strong>Notes:</strong> <span style="font-size:11px;">${req.notes || 'None'}</span>
            </td>
            <td>${new Date(req.createdAt).toLocaleString()}</td>
            <td><span class="badge badge-warning">${u.status}</span></td>
            <td>
              <div class="admin-action-remarks-box">
                <textarea id="act-remarks-${u._id}" placeholder="Audit remarks..."></textarea>
                <div class="admin-action-btns-row">
                  <button class="btn btn-primary btn-act-approve" style="padding:6px 12px; font-size:11px;" data-user-id="${u._id}">✓ Approve &amp; Activate</button>
                  <button class="btn btn-gold-outline btn-act-reject" style="padding:6px 12px; font-size:11px; border-color:var(--accent-red); color:var(--accent-red);" data-user-id="${u._id}">✗ Reject</button>
                </div>
              </div>
            </td>
          </tr>
        `;
      });

      // Bind approve — now auto-activates user
      document.querySelectorAll('.btn-act-approve').forEach(btn => {
        btn.onclick = async () => {
          const userId = btn.getAttribute('data-user-id');
          const remarks = document.getElementById(`act-remarks-${userId}`).value.trim() || "Audited and Verified";
          try {
            const res = await apiCall('/api/admin/approve-deposit', 'POST', { userId, remarks });
            showToast("Deposit Approved", res.message, "success");
            refreshAdminTabContent('activations');
          } catch (e) {}
        };
      });

      // Bind reject
      document.querySelectorAll('.btn-act-reject').forEach(btn => {
        btn.onclick = async () => {
          const userId = btn.getAttribute('data-user-id');
          const remarks = document.getElementById(`act-remarks-${userId}`).value.trim() || "Receipt failed verification.";
          try {
            const res = await apiCall('/api/admin/reject-deposit', 'POST', { userId, remarks });
            showToast("Deposit Rejected", res.message, "error");
            refreshAdminTabContent('activations');
          } catch (e) {}
        };
      });
    }

    // 2. User Database Directory
    if (tabName === 'users') {
      const tbody = document.getElementById('admin-users-table-body');
      tbody.innerHTML = '';

      const searchInput = document.getElementById('admin-users-search');
      const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.oninput = () => {
          refreshAdminTabContent('users');
        };
      }

      let filteredUsers = db.users;
      if (searchQuery) {
        filteredUsers = db.users.filter(u => 
          u.name.toLowerCase().includes(searchQuery) ||
          u.email.toLowerCase().includes(searchQuery) ||
          u.mobile.includes(searchQuery) ||
          u.userId.toLowerCase().includes(searchQuery)
        );
      }

      filteredUsers.forEach(u => {
        let statusBadge = '';
        if (u.status === 'Active') statusBadge = '<span class="badge badge-success" style="font-size:8px;">Active</span>';
        else if (u.status === 'Suspended') statusBadge = '<span class="badge badge-danger" style="font-size:8px;background-color:#ef4444;">Suspended</span>';
        else if (u.status === 'Pending Verification') statusBadge = '<span class="badge badge-warning" style="font-size:8px;">Pending</span>';
        else statusBadge = '<span class="badge badge-danger" style="font-size:8px;">Inactive</span>';

        const actDate = u.activationDate ? new Date(u.activationDate).toLocaleDateString() : '—';

        tbody.innerHTML += `
          <tr>
            <td class="font-space text-sky">${u.userId}</td>
            <td>
              <strong>${u.name}</strong> <span class="badge badge-sky" style="font-size:8px;">${u.role}</span>
              ${statusBadge}
            </td>
            <td style="font-size:11px;">${u.email}<br><span class="font-space" style="color:var(--text-muted);">${u.mobile}</span></td>
            <td class="font-space" style="font-size:11px;">${u.parentReferral || '—'}</td>
            <td>${statusBadge}</td>
            <td class="font-space" style="color:#26a17b;">${(u.fundBalance||0).toFixed(2)}</td>
            <td class="font-space text-sky">${(u.balance||0).toFixed(2)}</td>
            <td class="font-space" style="color:#fbbf24;">${(u.abBalance||0).toFixed(2)}</td>
            <td class="font-space">${(u.earnings||0).toFixed(2)}</td>
            <td style="text-align:center;">${u.totalDirects||0} <span style="color:#10b981;">(${u.activeDirects||0})</span></td>
            <td style="font-size:11px;">${actDate}</td>
            <td>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;gap:4px;align-items:center;">
                  <input type="number" id="adj-bal-${u.id}" placeholder="Set Bal" style="width:70px;padding:4px 6px;font-size:11px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text-primary);">
                  <button class="btn btn-primary btn-icon btn-adj-bal" data-user-id="${u.id}" title="Set Balance" style="padding:4px 8px;font-size:11px;"><i data-lucide="check"></i></button>
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  <button class="btn btn-gold-outline btn-user-edit" data-user-id="${u.id}" style="padding:4px 8px;font-size:10px;">Edit</button>
                  <button class="btn btn-gold-outline btn-user-toggle-suspend" data-user-id="${u.id}" style="padding:4px 8px;font-size:10px;${u.status==='Suspended'?'color:#10b981;border-color:#10b981;':'color:#ef4444;border-color:#ef4444;'}">${u.status==='Suspended'?'Unsuspend':'Suspend'}</button>
                  <button class="btn btn-gold-outline btn-user-delete" data-user-id="${u.id}" style="padding:4px 8px;font-size:10px;color:#ef4444;border-color:#ef4444;">Delete</button>
                </div>
              </div>
            </td>
          </tr>
        `;
      });
      
      lucide.createIcons();

      // Adjust balances click
      document.querySelectorAll('.btn-adj-bal').forEach(btn => {
        btn.onclick = async () => {
          const userId = btn.getAttribute('data-user-id');
          const targetBalance = parseFloat(document.getElementById(`adj-bal-${userId}`).value);
          if (isNaN(targetBalance)) return;

          try {
            await apiCall('/api/admin/adjust-balance', 'POST', { userId, targetBalance });
            showToast("Adjustment Saved", "Account ledger calibrated successfully.", "success");
            refreshAdminTabContent('users');
          } catch (e) {}
        };
      });

      // Edit profiles click
      document.querySelectorAll('.btn-user-edit').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.getAttribute('data-user-id');
          const u = db.users.find(usr => usr.id === uid);
          if (!u) return;

          openModal(`
            <div class="edit-profile-modal" style="padding: 12px 0; text-align: left;">
              <h3 style="color:var(--sky-primary); font-family:var(--font-mono); margin-bottom:16px; font-size:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">Edit User Profile Node</h3>
              <form id="admin-edit-user-form" class="standard-form">
                <div class="input-group" style="margin-bottom:12px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Full Name</label>
                  <input type="text" id="edit-user-name" value="${u.name}" required style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px;">
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Email Address</label>
                  <input type="email" id="edit-user-email" value="${u.email}" required style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px;">
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Mobile Number</label>
                  <input type="text" id="edit-user-mobile" value="${u.mobile}" required style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px;">
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Sponsor Referral Code</label>
                  <input type="text" id="edit-user-sponsor" value="${u.parentReferral || ''}" style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px;">
                </div>
                <div class="input-group" style="margin-bottom:12px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Security Role</label>
                  <select id="edit-user-role" style="width:100%; padding:8px 12px; background:rgba(0,0,0,0.3); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px; color-scheme:dark;">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User / Member</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin / Executive</option>
                  </select>
                </div>
                <div class="input-group" style="margin-bottom:16px;">
                  <label style="font-size:11px; margin-bottom:4px; display:block;">Access Password (Leave blank to keep unchanged)</label>
                  <input type="text" id="edit-user-pass" placeholder="Enter new password" style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:6px; color:var(--text-primary); font-size:13px;">
                </div>
                <button type="submit" class="btn btn-primary btn-full sky-gradient-btn">Save Vault Modifications</button>
              </form>
            </div>
          `);

          document.getElementById('admin-edit-user-form').onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-user-name').value.trim();
            const email = document.getElementById('edit-user-email').value.trim();
            const mobile = document.getElementById('edit-user-mobile').value.trim();
            const parentReferral = document.getElementById('edit-user-sponsor').value.trim();
            const role = document.getElementById('edit-user-role').value;
            const password = document.getElementById('edit-user-pass').value;

            try {
              const res = await apiCall('/api/admin/edit-profile', 'POST', { id: uid, name, email, mobile, parentReferral, role, password });
              showToast("Profile Updated", res.message, "success");
              closeModal();
              refreshAdminTabContent('users');
            } catch (err) {}
          };
        };
      });

      // Toggle suspension click
      document.querySelectorAll('.btn-user-toggle-suspend').forEach(btn => {
        btn.onclick = async () => {
          const userId = btn.getAttribute('data-user-id');
          try {
            const res = await apiCall('/api/admin/toggle-suspension', 'POST', { userId });
            showToast("Vault Calibrated", `User status changed to: ${res.status}`, "warning");
            refreshAdminTabContent('users');
          } catch (e) {}
        };
      });

      // Delete click
      document.querySelectorAll('.btn-user-delete').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-user-id');
          if (confirm("Are you sure you want to permanently delete this user node and wipe their balances/trees?")) {
            try {
              const res = await apiCall(`/api/admin/user/${id}`, 'DELETE');
              showToast("User Deleted", res.message, "error");
              refreshAdminTabContent('users');
            } catch (e) {}
          }
        };
      });
    }

    // 3. Rewards & Income Tab
    if (tabName === 'rewards-income') {
      const riIncome  = document.getElementById('ri-total-income');
      const riAb      = document.getElementById('ri-total-ab');
      const riActive  = document.getElementById('ri-active-users');
      const riClub    = document.getElementById('ri-club-count');
      const tbody     = document.getElementById('admin-rewards-table-body');
      const abTbody   = document.getElementById('admin-ab-rewards-table-body');

      if (!tbody) return;
      tbody.innerHTML = '';
      if (abTbody) abTbody.innerHTML = '';

      let totalIncome = 0, totalAb = 0, activeCount = 0, clubCount = 0;

      db.users.forEach(u => {
        totalIncome += u.earnings || 0;
        totalAb     += u.abBalance || 0;
        if (u.status === 'Active') activeCount++;
        // Club: 15+ active directs (approximate from data)
        if ((u.activeDirects || 0) >= 15) clubCount++;

        const inc = u.incomeBreakdown || {};
        const statusColor = u.status === 'Active' ? '#10b981' : u.status === 'Suspended' ? '#ef4444' : '#fbbf24';
        tbody.innerHTML += `
          <tr>
            <td class="font-space" style="color:var(--sky-primary);">${u.userId}</td>
            <td><strong>${u.name}</strong></td>
            <td><span style="color:${statusColor};font-size:11px;font-weight:700;">${u.status}</span></td>
            <td class="font-space">${(inc.referral||0).toFixed(2)}</td>
            <td class="font-space">${(inc.level||0).toFixed(2)}</td>
            <td class="font-space">${(inc.club||0).toFixed(2)}</td>
            <td class="font-space">${(inc.rewards||0).toFixed(2)}</td>
            <td class="font-space">${(inc.auto||0).toFixed(2)}</td>
            <td class="font-space" style="color:#a78bfa;font-weight:700;">${(u.earnings||0).toFixed(2)}</td>
            <td class="font-space" style="color:var(--sky-primary);">${(u.balance||0).toFixed(2)}</td>
            <td class="font-space" style="color:#26a17b;">${(u.fundBalance||0).toFixed(2)}</td>
            <td class="font-space" style="color:#fbbf24;">${(u.abBalance||0).toFixed(2)}</td>
            <td style="text-align:center;">${u.totalDirects||0} <span style="color:#10b981;">(${u.activeDirects||0})</span></td>
            <td>${(u.activeDirects||0)>=15 ? '<span style="color:#fbbf24;font-weight:700;font-size:11px;">👑 QUALIFIED</span>' : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}</td>
          </tr>`;
      });

      if (riIncome) riIncome.textContent = totalIncome.toFixed(2) + ' COIN';
      if (riAb)     riAb.textContent     = totalAb.toFixed(2) + ' COIN';
      if (riActive) riActive.textContent = activeCount;
      if (riClub)   riClub.textContent   = clubCount;

      // AB Rewards records
      if (abTbody && db.rewardClaims && db.rewardClaims.length > 0) {
        abTbody.innerHTML = '';
        db.rewardClaims.forEach(r => {
          const remaining = (r.reward - r.transferred).toFixed(2);
          const statusColor = r.status === 'transferred' ? '#10b981' : r.status === 'unlocked' ? '#fbbf24' : r.status === 'locked' ? '#ef4444' : '#a78bfa';
          abTbody.innerHTML += `
            <tr>
              <td class="font-space" style="color:var(--sky-primary);">${r.userInfo?.userId||'?'}</td>
              <td>${r.userInfo?.name||'?'}</td>
              <td style="text-align:center;"><strong style="color:#a78bfa;">L${r.level}</strong></td>
              <td class="font-space">${(r.reward||0).toFixed(2)} COIN</td>
              <td class="font-space" style="color:#10b981;">${(r.transferred||0).toFixed(2)} COIN</td>
              <td class="font-space" style="color:#fbbf24;">${remaining} COIN</td>
              <td><span style="color:${statusColor};font-size:11px;font-weight:700;text-transform:capitalize;">${r.status}</span></td>
              <td style="font-size:11px;">${r.releaseDate ? new Date(r.releaseDate).toLocaleDateString() : '—'}</td>
            </tr>`;
        });
      } else if (abTbody) {
        abTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">No Auto Blaster records found.</td></tr>';
      }
    }

    // 4. Fund Management Tab
    if (tabName === 'fund-management') {
      const form = document.getElementById('admin-fund-mgmt-form');
      if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.onsubmit = async (e) => {
          e.preventDefault();
          const userIdVal  = document.getElementById('fm-userid').value.trim();
          const actionType = document.getElementById('fm-action').value;
          const walletType = document.getElementById('fm-wallet').value;
          const amount     = parseFloat(document.getElementById('fm-amount').value);
          const remark     = document.getElementById('fm-remark').value.trim();
          const resultEl   = document.getElementById('fm-result');

          // Find the user by userId string
          const matchedUser = db.users.find(u => u.userId.toLowerCase() === userIdVal.toLowerCase());
          if (!matchedUser) {
            resultEl.innerHTML = '<p style="color:#ef4444;font-size:13px;">❌ User ID not found in system.</p>';
            return;
          }

          try {
            const res = await apiCall('/api/admin/fund-management', 'POST', {
              targetUserId: matchedUser.id,
              actionType, walletType, amount, remark
            });
            resultEl.innerHTML = `<p style="color:#10b981;font-size:13px;">✅ ${res.message}</p>`;
            showToast('Fund Operation', res.message, 'success');
            form.reset();
          } catch (err) {
            resultEl.innerHTML = `<p style="color:#ef4444;font-size:13px;">❌ ${err.message || 'Operation failed.'}</p>`;
          }
        };
      }
    }

    // 5. Withdrawals Board Portal
    if (tabName === 'withdrawals') {
      const tbody = document.getElementById('admin-withdrawals-table-body');
      tbody.innerHTML = '';

      if (db.withdrawals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">No withdrawal requests registered.</td></tr>';
        return;
      }

      db.withdrawals.forEach(w => {
        let badgeClass = 'badge-warning';
        if (w.status === 'Processing') badgeClass = 'badge-info';
        if (w.status === 'Completed') badgeClass = 'badge-success';
        if (w.status === 'Rejected') badgeClass = 'badge-danger';

        tbody.innerHTML += `
          <tr>
            <td class="font-space">${w.id}</td>
            <td class="font-space text-sky">${w.userId}</td>
            <td><strong>${w.name}</strong><br><span class="text-muted font-space" style="font-size:11px;">${w.mobile}</span></td>
            <td class="font-space text-sky">${w.amount.toFixed(2)} COIN</td>
            <td><span style="font-size:11px; max-width:140px; display:block; text-overflow:ellipsis; overflow:hidden;" title="${w.destination}">${w.destination}</span></td>
            <td>${new Date(w.createdAt).toLocaleString()}</td>
            <td><span class="badge ${badgeClass}">${w.status}</span></td>
            <td>
              <select class="glass-select admin-withdraw-status-select" data-withdraw-id="${w.id}">
                <option value="" disabled selected>Update</option>
                <option value="Processing">Mark Processing</option>
                <option value="Completed">Approve / Complete</option>
                <option value="Rejected">Reject</option>
              </select>
            </td>
          </tr>
        `;
      });

      document.querySelectorAll('.admin-withdraw-status-select').forEach(sel => {
        sel.onchange = async (e) => {
          const withdrawId = sel.getAttribute('data-withdraw-id');
          const status = e.target.value;
          try {
            const res = await apiCall('/api/admin/withdrawal-status', 'POST', { withdrawId, status });
            showToast("Withdrawal Updated", res.message, "success");
            refreshAdminTabContent('withdrawals');
          } catch (err) {}
        };
      });
    }

    // 4. Support Tickets replies
    if (tabName === 'support-tickets') {
      const grid = document.getElementById('admin-tickets-grid');
      grid.innerHTML = '';

      if (db.tickets.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:32px; color:var(--text-muted);">No support tickets raised.</div>';
        return;
      }

      db.tickets.forEach(t => {
        let badgeClass = 'badge-warning';
        if (t.status === 'Resolved') badgeClass = 'badge-success';
        if (t.status === 'Closed') badgeClass = 'badge-danger';

        const ui = t.userInfo || {};
        
        grid.innerHTML += `
          <div class="ticket-node-card glassmorphism">
            <div class="ticket-node-header">
              <h4>Ticket: ${t.id} <span class="badge badge-sky" style="margin-left:8px;">${t.category}</span></h4>
              <span class="badge ${badgeClass}">${t.status}</span>
            </div>

            <!-- User Info Row -->
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; padding:8px 10px; background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.1); border-radius:6px;">
              <div style="font-size:11px;">
                <span style="color:var(--text-muted);">User ID</span><br>
                <strong style="color:var(--sky-primary); font-family:var(--font-mono);">${ui.userId || '—'}</strong>
              </div>
              <div style="font-size:11px;">
                <span style="color:var(--text-muted);">Name</span><br>
                <strong>${ui.name || '—'}</strong>
              </div>
              <div style="font-size:11px; flex:1; min-width:120px;">
                <span style="color:var(--text-muted);">Email</span><br>
                <strong style="font-size:10px;">${ui.email || '—'}</strong>
              </div>
              <div style="font-size:11px;">
                <span style="color:var(--text-muted);">Mobile</span><br>
                <strong style="font-size:10px;">${ui.mobile || '—'}</strong>
              </div>
            </div>

            <p class="desc" style="margin-bottom:8px;">
              <strong>Issue Description:</strong> ${t.description}
            </p>

            ${t.screenshot ? `
              <div style="margin-bottom:10px;">
                <span style="font-size:10px; color:var(--text-muted); display:block; margin-bottom:4px;">UPLOADED DOCUMENT / SCREENSHOT</span>
                <img src="${t.screenshot}" class="admin-screenshot-thumbnail" onclick="window.open('${t.screenshot}', '_blank')" style="max-width:120px; max-height:90px; border-radius:6px; border:1px solid var(--border-sky); cursor:pointer;" title="Click to open full size">
              </div>
            ` : '<p style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">No document attached</p>'}

            ${t.reply ? `
              <div class="admin-ticket-reply-box" style="margin-bottom:12px;">
                <span class="admin-reply-lbl">Admin Response</span>
                <p class="admin-reply-content">${t.reply}</p>
              </div>
            ` : ''}
            <form class="admin-ticket-reply-form" data-ticket-id="${t.id}">
              <textarea id="reply-text-${t.id}" placeholder="Write response answer..." required></textarea>
              <div class="admin-ticket-actions" style="display:flex; justify-content:space-between; margin-top:8px;">
                <select class="glass-select admin-tkt-status-select" id="status-select-${t.id}">
                  <option value="Open" ${t.status === 'Open' ? 'selected' : ''}>Open</option>
                  <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                  <option value="Resolved" ${t.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                  <option value="Closed" ${t.status === 'Closed' ? 'selected' : ''}>Closed</option>
                </select>
                <button type="submit" class="btn btn-primary" style="padding:6px 12px; font-size:11px;">Send Reply</button>
              </div>
            </form>
          </div>
        `;
      });

      document.querySelectorAll('.admin-ticket-reply-form').forEach(frm => {
        frm.onsubmit = async (e) => {
          e.preventDefault();
          const ticketId = frm.getAttribute('data-ticket-id');
          const replyText = document.getElementById(`reply-text-${ticketId}`).value.trim();
          const status = document.getElementById(`status-select-${ticketId}`).value;

          try {
            const res = await apiCall('/api/admin/ticket-reply', 'POST', { ticketId, replyText, status });
            showToast("Reply Transmitted", res.message, "success");
            refreshAdminTabContent('support-tickets');
          } catch (err) {}
        };
      });

      // Bind Broadcast Announcement Form Submissions
      const broadcastForm = document.getElementById('admin-send-notification-form');
      if (broadcastForm && !broadcastForm.dataset.bound) {
        broadcastForm.dataset.bound = "true";
        broadcastForm.onsubmit = async (e) => {
          e.preventDefault();
          const targetUserId = document.getElementById('admin-notif-target').value.trim();
          const broadcastAll = document.getElementById('admin-notif-all').checked;
          const message = document.getElementById('admin-notif-msg').value.trim();

          try {
            const res = await apiCall('/api/admin/broadcast-notification', 'POST', { targetUserId, broadcastAll, message });
            showToast("Broadcast Sent", res.message, "success");
            broadcastForm.reset();
            document.getElementById('admin-notif-target').disabled = false;
          } catch (err) {}
        };
      }
    }

    // 5. Transaction Auditing Monitor
    if (tabName === 'transactions') {
      const tbody = document.getElementById('admin-transactions-table-body');
      tbody.innerHTML = '';

      if (db.auditLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">No transaction logs logged.</td></tr>';
        return;
      }

      db.auditLogs.forEach(t => {
        const isCredit = t.type === 'credit';
        tbody.innerHTML += `
          <tr>
            <td class="font-space">${t.txid}</td>
            <td class="font-space text-sky">${t.userId}</td>
            <td><strong>${t.name}</strong><br><span class="text-muted" style="font-size:11px;">${t.email || ''}</span></td>
            <td><strong>${t.category}</strong><br><span class="text-muted" style="font-size:11px;">${t.note || ''}</span></td>
            <td class="font-space ${isCredit ? 'text-green' : 'text-red'}">${isCredit ? '+' : '-'}${t.amount.toFixed(2)} COIN</td>
            <td><span class="badge ${isCredit ? 'badge-success' : 'badge-danger'}">${isCredit ? 'CREDIT' : 'DEBIT'}</span></td>
            <td>${new Date(t.date).toLocaleString()}</td>
            <td><span class="badge badge-success">${t.status}</span></td>
          </tr>
        `;
      });
    }

    // 6. Referral & Network Tree
    if (tabName === 'network') {
      const rootSelect = document.getElementById('admin-network-root-select');
      const treeContainer = document.getElementById('admin-network-tree-container');
      const rootLabel = document.getElementById('admin-network-root-id');
      
      // Populate select dropdown
      rootSelect.innerHTML = '';
      db.users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.userId} - ${u.name}`;
        rootSelect.appendChild(opt);
      });

      // Default root is ADMIN001
      const defaultRoot = db.users.find(usr => usr.userId === 'ADMIN001') || db.users[0];
      if (defaultRoot && !rootSelect.value) {
        rootSelect.value = defaultRoot.id;
      }

      rootSelect.onchange = () => {
        renderVisualNetworkTree(rootSelect.value, db);
      };

      renderVisualNetworkTree(rootSelect.value, db);
    }

    // 7. Reports & Analytics View
    if (tabName === 'reports') {
      renderReportsDashboard(db);
    }

    // 8. P2P Transfer Management View
    if (tabName === 'p2p') {
      try {
        const p2pRes = await apiCall('/api/admin/p2p-transfers', 'GET');
        const transfers = p2pRes.transfers || [];
        const stats = p2pRes.stats || {};
        
        // Populate stats
        document.getElementById('admin-p2p-total-count').textContent = stats.totalTransfers || 0;
        document.getElementById('admin-p2p-total-coins').textContent = (stats.totalCoins || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
        document.getElementById('admin-p2p-today-count').textContent = stats.todayTransfers || 0;
        document.getElementById('admin-p2p-today-coins').textContent = (stats.todayCoins || 0).toLocaleString('en-US', {minimumFractionDigits: 2});

        const tbody = document.getElementById('admin-p2p-table-body');
        
        const renderTable = (data) => {
          if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No P2P transfers found.</td></tr>';
            return;
          }
          tbody.innerHTML = data.map(t => `
            <tr>
              <td class="font-space">${t.transferId}</td>
              <td><strong>${t.senderName}</strong><br><span class="text-muted" style="font-size:11px; font-family:var(--font-mono);">${t.senderId}</span></td>
              <td><strong>${t.receiverName}</strong><br><span class="text-muted" style="font-size:11px; font-family:var(--font-mono);">${t.receiverId}</span></td>
              <td class="font-space text-sky" style="font-weight:700;">${t.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              <td><span style="font-size:11px; text-transform:uppercase; color:var(--text-secondary); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${t.walletType || 'Fund'}</span></td>
              <td>${new Date(t.date).toLocaleString()}</td>
              <td><span class="badge badge-success">${t.status}</span></td>
            </tr>
          `).join('');
        };

        renderTable(transfers);

        // Search/Filter logic
        const searchInput = document.getElementById('admin-p2p-search');
        if (searchInput) {
          searchInput.oninput = (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = transfers.filter(t => 
              t.transferId.toLowerCase().includes(query) ||
              t.senderId.toLowerCase().includes(query) ||
              t.receiverId.toLowerCase().includes(query) ||
              t.senderName.toLowerCase().includes(query) ||
              t.receiverName.toLowerCase().includes(query)
            );
            renderTable(filtered);
          };
        }
      } catch (err) {
        document.getElementById('admin-p2p-table-body').innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:20px;">Error loading P2P transfers: ${err.message}</td></tr>`;
      }
    }
  }

  // Visual MLM Tree Renderer
  async function renderVisualNetworkTree(rootId, db) {
    const treeContainer = document.getElementById('admin-network-tree-container');
    const rootLabel = document.getElementById('admin-network-root-id');
    
    const rootUserObj = db.users.find(usr => usr.id === rootId);
    if (!rootUserObj) return;

    rootLabel.textContent = `${rootUserObj.userId} (${rootUserObj.name})`;

    // Track statistics for this specific subtree root
    const l1Users = db.users.filter(usr => usr.parentReferral === rootUserObj.referralCode);
    const l1Referrals = l1Users.map(usr => usr.referralCode);

    const l2Users = db.users.filter(usr => l1Referrals.includes(usr.parentReferral));
    const l2Referrals = l2Users.map(usr => usr.referralCode);

    const l3Users = db.users.filter(usr => l2Referrals.includes(usr.parentReferral));

    const totalNetSize = l1Users.length + l2Users.length + l3Users.length;
    const activeNetCount = [...l1Users, ...l2Users, ...l3Users].filter(usr => usr.status === 'Active').length;

    document.getElementById('admin-net-stat-l1').textContent = l1Users.length;
    document.getElementById('admin-net-stat-indirect').textContent = l2Users.length + l3Users.length;
    document.getElementById('admin-net-stat-total').textContent = totalNetSize;
    document.getElementById('admin-net-stat-active').textContent = activeNetCount;

    // Payout commissions audit logs for this user
    const auditData = await apiCall(`/api/admin/user-audit/${rootUserObj.id}`);
    const commList = document.getElementById('admin-net-commissions-list');
    commList.innerHTML = '';
    
    let totalCommissions = 0;
    const commissions = auditData.userTx.filter(t => t.category.includes('Income'));

    if (commissions.length === 0) {
      commList.innerHTML = '<span class="text-muted" style="text-align:center; padding:12px; display:block;">No network payouts logged.</span>';
    } else {
      commissions.forEach(c => {
        totalCommissions += c.amount;
        commList.innerHTML += `
          <div style="background:rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 8px 10px; border-radius:6px; margin-bottom:6px;">
            <div style="display:flex; justify-content:space-between; font-weight: 600; margin-bottom: 2px;">
              <span>${c.category}</span>
              <span class="text-sky">+${c.amount.toFixed(2)} COIN</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px;">${c.note}</div>
            <div style="color:var(--text-muted); font-size:10px; margin-top:4px;">${new Date(c.date).toLocaleString()}</div>
          </div>
        `;
      });
    }
    document.getElementById('admin-net-stat-commissions').textContent = `${totalCommissions.toFixed(2)} COIN`;

    // Draw visual tree elements
    treeContainer.innerHTML = '';
    
    const rootNodeWrapper = document.createElement('div');
    rootNodeWrapper.style.display = 'flex';
    rootNodeWrapper.style.flexDirection = 'column';
    rootNodeWrapper.style.alignItems = 'center';
    rootNodeWrapper.style.width = '100%';

    let statusColor = 'var(--text-muted)';
    if (rootUserObj.status === 'Active') statusColor = 'var(--accent-green)';
    else if (rootUserObj.status === 'Suspended') statusColor = '#ef4444';
    else if (rootUserObj.status === 'Pending Verification') statusColor = 'var(--accent-gold)';

    rootNodeWrapper.innerHTML = `
      <div class="network-tree-node glassmorphism" style="border: 1px solid var(--sky-primary); box-shadow: 0 0 10px rgba(212,175,55,0.1); padding: 12px; border-radius: 8px; min-width: 200px; text-align: center; position: relative;">
        <span class="badge badge-sky" style="position: absolute; top:-10px; left:50%; transform:translateX(-50%); font-size:9px; border:1px solid var(--sky-primary);">ROOT</span>
        <strong style="color:var(--text-primary); font-size:13px; font-family:var(--font-mono);">${rootUserObj.userId}</strong>
        <div style="font-size:12px; font-weight:600; margin-top:2px;">${rootUserObj.name}</div>
        <div style="font-size:10px; margin-top: 4px; display:flex; justify-content:center; gap:6px; align-items:center;">
          <span style="color:var(--sky-primary);">${rootUserObj.balance.toFixed(2)} COIN</span>
          <span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:${statusColor};"></span>
          <span style="color:var(--text-secondary);">${rootUserObj.status}</span>
        </div>
      </div>
      
      ${l1Users.length > 0 ? `<div class="tree-vertical-line" style="width:2px; height:24px;"></div>` : ''}
    `;

    treeContainer.appendChild(rootNodeWrapper);

    if (l1Users.length > 0) {
      const l1Row = document.createElement('div');
      l1Row.style.display = 'flex';
      l1Row.style.justifyContent = 'center';
      l1Row.style.gap = '16px';
      l1Row.style.width = '100%';

      l1Users.forEach(child => {
        const childCol = document.createElement('div');
        childCol.style.display = 'flex';
        childCol.style.flexDirection = 'column';
        childCol.style.alignItems = 'center';

        let childColor = 'var(--text-muted)';
        if (child.status === 'Active') childColor = 'var(--accent-green)';
        else if (child.status === 'Suspended') childColor = '#ef4444';

        const childL2 = db.users.filter(usr => usr.parentReferral === child.referralCode);

        childCol.innerHTML = `
          <div class="network-tree-node glassmorphism child-node" data-focus-id="${child.id}" style="border: 1px solid var(--border-glass); padding: 10px; border-radius: 8px; min-width: 170px; text-align: center; cursor: pointer; transition: all 0.2s;">
            <span style="color:var(--text-muted); font-size:8px; display:block;">LEVEL 1 (DIRECT)</span>
            <strong style="color:var(--text-primary); font-size:11px; font-family:var(--font-mono);">${child.userId}</strong>
            <div style="font-size:11px;">${child.name}</div>
            <div style="font-size:9px; margin-top: 3px; display:flex; justify-content:center; gap:6px; align-items:center;">
              <span style="color:var(--sky-primary);">${child.balance.toFixed(2)} COIN</span>
              <span style="display:inline-block; width:4px; height:4px; border-radius:50%; background:${childColor};"></span>
              <span style="color:var(--text-secondary);">${child.status}</span>
            </div>
          </div>
          
          ${childL2.length > 0 ? `<div class="tree-vertical-line" style="width:2px; height:16px;"></div>` : ''}
        `;

        if (childL2.length > 0) {
          const l2Container = document.createElement('div');
          l2Container.style.display = 'flex';
          l2Container.style.flexDirection = 'column';
          l2Container.style.gap = '8px';
          l2Container.style.alignItems = 'center';

          childL2.forEach(l2Node => {
            let l2Color = 'var(--text-muted)';
            if (l2Node.status === 'Active') l2Color = 'var(--accent-green)';
            
            const l3Count = db.users.filter(usr => usr.parentReferral === l2Node.referralCode).length;

            const l2El = document.createElement('div');
            l2El.className = 'network-tree-node glassmorphism child-node';
            l2El.setAttribute('data-focus-id', l2Node.id);
            l2El.style.border = '1px solid rgba(255,255,255,0.03)';
            l2El.style.padding = '8px';
            l2El.style.borderRadius = '6px';
            l2El.style.minWidth = '150px';
            l2El.style.textAlign = 'center';
            l2El.style.cursor = 'pointer';
            l2El.style.fontSize = '10px';

            l2El.innerHTML = `
              <span style="color:var(--text-muted); font-size:7px; display:block;">LEVEL 2 (INDIRECT)</span>
              <strong style="color:var(--text-primary); font-family:var(--font-mono);">${l2Node.userId}</strong>
              <div>${l2Node.name}</div>
              <div style="font-size:9px; margin-top:2px; display:flex; justify-content:center; gap:4px; align-items:center;">
                <span style="color:var(--sky-primary);">${l2Node.balance.toFixed(2)} COIN</span>
                <span style="display:inline-block; width:4px; height:4px; border-radius:50%; background:${l2Color};"></span>
                <span style="color:var(--text-secondary);">${l2Node.status}</span>
              </div>
              ${l3Count > 0 ? `<div style="color:var(--sky-primary); font-size:8px; margin-top: 4px;">+ ${l3Count} nodes (L3)</div>` : ''}
            `;
            l2Container.appendChild(l2El);
          });
          childCol.appendChild(l2Container);
        }

        l1Row.appendChild(childCol);
      });
      treeContainer.appendChild(l1Row);
    } else {
      const noDownlineEl = document.createElement('div');
      noDownlineEl.style.color = 'var(--text-muted)';
      noDownlineEl.style.fontSize = '12px';
      noDownlineEl.style.padding = '20px';
      noDownlineEl.textContent = 'No downlines registered for this node.';
      treeContainer.appendChild(noDownlineEl);
    }

    // Bind shift click focus
    document.querySelectorAll('.network-tree-node.child-node').forEach(node => {
      node.onclick = () => {
        const focusId = node.getAttribute('data-focus-id');
        document.getElementById('admin-network-root-select').value = focusId;
        renderVisualNetworkTree(focusId, db);
      };
    });
  }

  // Reports Dashboard Generator
  async function renderReportsDashboard(db) {
    // 1. Calculate registration growth over time
    const userGrowth = {};
    db.users.forEach(u => {
      const dateKey = new Date(u.registrationDate || new Date()).toLocaleDateString();
      userGrowth[dateKey] = (userGrowth[dateKey] || 0) + 1;
    });

    const growthLabels = Object.keys(userGrowth);
    const growthData = Object.values(userGrowth);

    // 2. Deposit vs Withdrawal activity
    const flows = {};
    db.auditLogs.forEach(t => {
      const dateKey = new Date(t.date || new Date()).toLocaleDateString();
      if (!flows[dateKey]) {
        flows[dateKey] = { deposits: 0, withdrawals: 0 };
      }
      if (t.category === 'COIN Deposit' && t.status === 'Approved') {
        flows[dateKey].deposits += t.amount;
      }
      if (t.category === 'Withdrawal' && t.status === 'Completed') {
        flows[dateKey].withdrawals += t.amount;
      }
    });

    const flowLabels = Object.keys(flows);
    const flowDeposits = flowLabels.map(k => flows[k].deposits);
    const flowWithdrawals = flowLabels.map(k => flows[k].withdrawals);

    // 3. Profit shares
    const activatedUsersCount = db.users.filter(u => u.idStatus === 'Activated').length;
    const totalFeesCollected = activatedUsersCount * 1000.00;
    
    let totalCommissionsDistributed = 0;
    db.auditLogs.forEach(t => {
      if (t.category.includes('Income') && t.status === 'Approved') {
        totalCommissionsDistributed += t.amount;
      }
    });

    const netProfitReserve = Math.max(0, totalFeesCollected - totalCommissionsDistributed);

    // Render KPIs
    const activeCount = db.users.filter(u => u.status === 'Active').length;
    const conversionRate = db.users.length ? ((activeCount / db.users.length) * 100).toFixed(1) : '0.0';
    document.getElementById('admin-report-kpi-conversion').textContent = `${conversionRate}%`;

    const totalDeps = flowDeposits.reduce((acc, v) => acc + v, 0);
    const avgDep = db.users.length ? (totalDeps / db.users.length).toFixed(2) : '0.00';
    document.getElementById('admin-report-kpi-avg-dep').textContent = `${avgDep} COIN`;

    document.getElementById('admin-report-kpi-profit').textContent = `${netProfitReserve.toFixed(2)} COIN`;
    document.getElementById('admin-report-kpi-commissions').textContent = `${totalCommissionsDistributed.toFixed(2)} COIN`;

    // Liability pending
    const withdrawalsPending = db.withdrawals.filter(w => w.status === 'Pending' || w.status === 'Processing');
    const liability = withdrawalsPending.reduce((acc, w) => acc + w.amount, 0);
    document.getElementById('admin-report-kpi-pending-withdraw').textContent = `${liability.toFixed(2)} COIN`;

    // Draw growth chart (Line)
    if (chartInstances.growthReport) chartInstances.growthReport.destroy();
    const ctxGrowth = document.getElementById('admin-report-growth-chart').getContext('2d');
    chartInstances.growthReport = new Chart(ctxGrowth, {
      type: 'line',
      data: {
        labels: growthLabels,
        datasets: [{
          label: 'Registrations',
          data: growthData,
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212, 175, 55, 0.05)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
          x: { grid: { display: false }, ticks: { color: '#888' } }
        }
      }
    });

    // Draw flow chart (Bar)
    if (chartInstances.flowReport) chartInstances.flowReport.destroy();
    const ctxFlow = document.getElementById('admin-report-flow-chart').getContext('2d');
    chartInstances.flowReport = new Chart(ctxFlow, {
      type: 'bar',
      data: {
        labels: flowLabels.length ? flowLabels : ['GENESIS'],
        datasets: [
          {
            label: 'COIN Deposits',
            data: flowDeposits.length ? flowDeposits : [0],
            backgroundColor: '#10b981'
          },
          {
            label: 'Withdrawals',
            data: flowWithdrawals.length ? flowWithdrawals : [0],
            backgroundColor: '#ef4444'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#fff' } } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
          x: { grid: { display: false }, ticks: { color: '#888' } }
        }
      }
    });

    // Draw doughnut profit allocation share
    if (chartInstances.revenueReport) chartInstances.revenueReport.destroy();
    const ctxRev = document.getElementById('admin-report-revenue-chart').getContext('2d');
    chartInstances.revenueReport = new Chart(ctxRev, {
      type: 'doughnut',
      data: {
        labels: ['Commissions Paid', 'Platform Net Profit'],
        datasets: [{
          data: [totalCommissionsDistributed, netProfitReserve],
          backgroundColor: ['#ef4444', '#d4af37'],
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 } } }
        }
      }
    });
  }

  // ==========================================================================
  // DASHBOARD & INCOME CHARTS RENDER PIPELINES
  // ==========================================================================

  function renderDashboardCharts(db) {
    // 1. Direct Analytics earnings (Bar)
    if (chartInstances.earnings) chartInstances.earnings.destroy();
    const ctx1 = document.getElementById('dash-earnings-chart').getContext('2d');
    
    chartInstances.earnings = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['Direct Inc', 'Level Inc', 'Club Payout', 'Rewards', 'Autopool'],
        datasets: [{
          label: 'Earning segments ($)',
          data: [
            db.incomeBreakdown.direct,
            db.incomeBreakdown.level,
            db.incomeBreakdown.club,
            db.incomeBreakdown.rewards,
            db.incomeBreakdown.auto
          ],
          backgroundColor: '#d4af37',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
          x: { grid: { display: false }, ticks: { color: '#888' } }
        }
      }
    });

    // 2. Team downline sizes growth
    if (chartInstances.team) chartInstances.team.destroy();
    const ctx2 = document.getElementById('dash-team-chart').getContext('2d');
    
    chartInstances.team = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Direct Team', 'Indirect Network'],
        datasets: [{
          data: [db.teamData.activeRefs.length, Math.max(0, db.teamData.totalTeamSize - db.teamData.activeRefs.length)],
          backgroundColor: ['#d4af37', 'rgba(255,255,255,0.05)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#fff', boxWidth: 12 } }
        }
      }
    });
  }

  function renderIncomeCharts(db) {
    if (chartInstances.incomeMonthly) chartInstances.incomeMonthly.destroy();
    const ctx = document.getElementById('income-monthly-chart').getContext('2d');
    
    chartInstances.incomeMonthly = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Direct Income', 'Level Income', 'Club Pool', 'System Rewards', 'Autopool'],
        datasets: [{
          label: 'Income ($)',
          data: [
            db.incomeBreakdown.direct,
            db.incomeBreakdown.level,
            db.incomeBreakdown.club,
            db.incomeBreakdown.rewards,
            db.incomeBreakdown.auto
          ],
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212,175,55,0.05)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
          x: { grid: { display: false }, ticks: { color: '#888' } }
        }
      }
    });
  }

  // Render Activation Banner module state
  function renderActivationBanner() {
    const banner = document.getElementById('activation-card-banner');
    if (!banner) return;
    
    if (currentUser.status === 'Active') {
      banner?.classList.add('hidden');
    } else {
      banner?.classList.remove('hidden');
      
      const bStatus = document.getElementById('banner-account-status');
      const isPending = currentUser.status === 'Pending Verification';
      bStatus.textContent = isPending ? 'Pending Verification' : 'INACTIVE';
      bStatus.className = isPending ? 'text-sky' : 'text-red';
      
      const uploadArea = document.getElementById('banner-verification-proof-area');
      if (isPending) {
        uploadArea.innerHTML = `
          <div class="pending-notice" style="text-align:center; padding:16px; font-size:13px; color:var(--text-secondary);">
            <i data-lucide="clock" class="sky-icon" style="width:24px; height:24px; margin-bottom:8px;"></i>
            <p>Verification transaction hash is submitted. Administrative verification in progress.</p>
          </div>
        `;
        lucide.createIcons();
      } else {
        uploadArea.innerHTML = `
          <form id="activation-payment-form" class="standard-form">
            <!-- Auto-populated User Identity details -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="input-group" style="margin-bottom:0;">
                <label style="font-size:11px; margin-bottom:4px; display:block; color:var(--text-muted);">User ID (Auto)</label>
                <input type="text" readonly value="${currentUser.userId}" style="width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px solid var(--border-glass); border-radius:4px; color:var(--sky-primary); font-family:var(--font-mono); outline:none;">
              </div>
              <div class="input-group" style="margin-bottom:0;">
                <label style="font-size:11px; margin-bottom:4px; display:block; color:var(--text-muted);">Full Name (Auto)</label>
                <input type="text" readonly value="${currentUser.name}" style="width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary); outline:none;">
              </div>
            </div>
            <div class="input-group" style="margin-bottom:12px;">
              <label style="font-size:11px; margin-bottom:4px; display:block; color:var(--text-muted);">Email Address (Auto)</label>
              <input type="text" readonly value="${currentUser.email}" style="width:100%; padding:8px; background:rgba(255,255,255,0.05); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary); outline:none;">
            </div>

            <!-- Deposit Amount Field -->
            <div class="input-group" style="margin-bottom:12px;">
              <label style="font-size:11px; margin-bottom:4px; display:block; color:var(--sky-primary); font-weight:600;">Deposit Amount (Min 1000.00 COIN)*</label>
              <div style="position:relative;">
                <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--sky-primary); font-weight:700; font-size:14px;">$</span>
                <input type="number" id="act-deposit-amount" required min="1000" step="0.01" placeholder="1000.00" style="width:100%; padding:8px 8px 8px 24px; background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.3); border-radius:4px; color:var(--text-primary); font-size:14px; font-weight:600;">
              </div>
              <p style="font-size:10px; color:var(--text-muted); margin-top:4px;">You can deposit any amount ≥ 1000 COIN. Activation fee (1000 COIN) is deducted. Remainder goes to your wallet balance.</p>
            </div>

            <!-- Auto-populated Payment Date & Time -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="input-group" style="margin-bottom:0;">
                <label style="font-size:11px; margin-bottom:4px; display:block;">Payment Date*</label>
                <input type="date" id="act-pay-date" required style="width:100%; padding:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary);">
              </div>
              <div class="input-group" style="margin-bottom:0;">
                <label style="font-size:11px; margin-bottom:4px; display:block;">Payment Time*</label>
                <input type="time" id="act-pay-time" required style="width:100%; padding:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary);">
              </div>
            </div>
            
            <div class="input-group" style="margin-bottom:12px;">
              <label style="font-size:11px; margin-bottom:4px; display:block;">Blockchain Transaction ID (TXID)*</label>
              <input type="text" id="act-txid" required placeholder="Enter 64-char transaction hash..." style="width:100%; padding:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary);">
            </div>
            
            <div class="input-group" style="margin-bottom:16px;">
              <label style="font-size:11px; margin-bottom:4px; display:block;">Upload Payment Screenshot / Document*</label>
              <input type="file" id="act-screenshot" required accept="image/*" style="width:100%; padding:6px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:4px; color:var(--text-primary);">
            </div>
            
            <button type="submit" class="btn btn-primary sky-gradient-btn btn-full">Submit Deposit Proof →  Await Admin Approval</button>
          </form>
        `;

        // Auto-populate date & time
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        document.getElementById('act-pay-date').value = `${yyyy}-${mm}-${dd}`;
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('act-pay-time').value = `${hh}:${min}`;

        let screenshotBase64 = "";
        const bannerFile = document.getElementById('act-screenshot');
        if (bannerFile) {
          bannerFile.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => { screenshotBase64 = reader.result; };
              reader.readAsDataURL(file);
            }
          };
        }

        document.getElementById('activation-payment-form').onsubmit = async (e) => {
          e.preventDefault();
          const txid = document.getElementById('act-txid').value.trim();
          const payDate = document.getElementById('act-pay-date').value;
          const payTime = document.getElementById('act-pay-time').value;
          const depositAmount = parseFloat(document.getElementById('act-deposit-amount').value);

          if (isNaN(depositAmount) || depositAmount < 1000) {
            showToast("Invalid Amount", "Minimum deposit amount is 1000.00 COIN.", "error");
            return;
          }

          if (!screenshotBase64) {
            showToast("Missing Proof", "Please upload a payment screenshot or document.", "error");
            return;
          }

          try {
            const res = await apiCall('/api/user/activation-request', 'POST', { 
              txid, payDate, payTime, 
              depositAmount,
              screenshot: screenshotBase64 
            });
            showToast("Proof Submitted", res.message, "success");
            await fetchUserContext();
            renderDashboardData();
          } catch (err) {}
        };
      }
    }
  }

  // Verification dialog modal
  function triggerSuccessModalCheck() {
    // Modal congratulating active node states is controlled via the dashboard context hasSeen flag if needed
  }

  // Copy referral address triggers
  const copyWalletBtn = document.getElementById('wallet-copy-address-btn');
  if (copyWalletBtn) {
    copyWalletBtn.onclick = () => {
      const address = document.getElementById('activation-wallet-address').textContent.trim();
      navigator.clipboard.writeText(address);
      showToast("Clipboard", "Wallet address copied.", "success");
    };
  }

  // ==========================================================================
  // VIEW: NOTIFICATIONS DROPDOWN MODAL
  // ==========================================================================

  notificationsBell.onclick = (e) => {
    e.stopPropagation();
    notificationsDropdown?.classList.toggle('hidden');
    loadNotificationsDropdown();
  };

  document.onclick = () => notificationsDropdown?.classList.add('hidden');
  notificationsDropdown.onclick = (e) => e.stopPropagation();

  function loadNotificationsDropdown() {
    if (!userContext) return;
    const list = userContext.notifications;

    notificationsDropdownList.innerHTML = '';
    if (list.length === 0) {
      notificationsDropdownList.innerHTML = '<li class="dropdown-item text-muted" style="text-align:center;">No notifications logged.</li>';
    } else {
      list.forEach(n => {
        notificationsDropdownList.innerHTML += `
          <li class="dropdown-item">
            <span class="content">${n.message}</span>
            <span class="time">${new Date(n.time).toLocaleTimeString()}</span>
          </li>
        `;
      });
    }
  }

  clearNotificationsBtn.onclick = async () => {
    try {
      await apiCall('/api/user/clear-notifications', 'POST');
      showToast("Notifications Cleared", "Audit alerts removed.", "success");
      await fetchUserContext();
      loadNotificationsDropdown();
      loadNotificationsBellBadge();
    } catch (e) {}
  };

  // ==========================================================================
  // SIDEBAR NAVIGATION BINDINGS
  // ==========================================================================

  navItems.forEach(item => {
    item.onclick = () => {
      const targetView = item.getAttribute('data-view');
      routeTo(targetView);
    };
  });

  document.querySelectorAll('[data-goto-view]').forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-goto-view');
      routeTo(target);
    };
  });

  // ==========================================================================
  // INTERNAL TRANSFER (Withdraw → Fund) — Standalone Binding
  // ==========================================================================
  const internalTransferForm = document.getElementById('internal-transfer-form');
  if (internalTransferForm) {
    internalTransferForm.onsubmit = async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('internal-amount').value);
      const pin = document.getElementById('internal-tx-password').value;

      if (isNaN(amount) || amount <= 0) return showToast("Invalid Amount", "Enter a positive number.", "error");

      // Get latest balance
      await fetchUserContext();
      const currentBalance = userContext ? userContext.balance : 0;
      if (amount > currentBalance) return showToast("Insufficient Funds", `Withdraw Wallet balance: ${currentBalance.toFixed(2)} COIN`, "error");
      if (!pin) return showToast("PIN Required", "Please enter your Transaction Password.", "error");

      // Disable button to prevent double-click
      const submitBtn = internalTransferForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Processing...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        const res = await apiCall('/api/user/internal-transfer', 'POST', { amount, pin });
        showToast("Transfer Complete", res.message, "success");
        internalTransferForm.reset();
        // Refresh wallet data to show updated balances
        if (typeof renderWalletData === 'function') await renderWalletData();
      } catch (err) {
        showToast("Transfer Failed", err.message || "Something went wrong.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnText;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    };
  }

  if (sidebarToggle) {
    sidebarToggle.onclick = () => {
      sidebar?.classList.add('mobile-active');
    };
  }

  if (sidebarClose) {
    sidebarClose.onclick = () => {
      sidebar?.classList.remove('mobile-active');
    };
  }

  // Forgot password triggers
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const forgotBackToLogin = document.getElementById('forgot-back-to-login');
  if (forgotPasswordLink) {
    forgotPasswordLink.onclick = () => {
      showToast("Security Key", "Please contact administrative support node to reset credentials.", "warning");
    };
  }
  if (forgotBackToLogin) {
    forgotBackToLogin.onclick = () => {
      resetForgotSteps();
    };
  }

  // Swapping Login/Register views
  if (toRegister) {
    toRegister.onclick = () => {
      document.getElementById('login-form')?.classList.add('hidden');
      document.getElementById('register-form')?.classList.remove('hidden');
    };
  }

  if (toLogin) {
    toLogin.onclick = () => {
      document.getElementById('register-form')?.classList.add('hidden');
      document.getElementById('login-form')?.classList.remove('hidden');
    };
  }

  // ==========================================================================
  // GLOBAL MODALS AND TOAST SYSTEMS
  // ==========================================================================

  function openModal(contentHtml) {
    modalContent.innerHTML = contentHtml;
    globalModal?.classList.remove('hidden');
    lucide.createIcons();
  }

  if (modalClose) {
    modalClose.onclick = () => {
      closeModal();
    };
  }

  function closeModal() {
    globalModal?.classList.add('hidden');
    modalContent.innerHTML = '';
  }

  function openCongratulationsModal() {
    openModal(`
      <div class="success-checkmark-wrapper" style="padding: 24px 0; text-align: center;">
        <div class="checkmark-circle" style="width: 50px; height: 50px; border-radius: 50%; background: rgba(16,185,129,0.1); border: 2px solid var(--accent-green); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;"><i data-lucide="check" style="color:var(--accent-green); width: 24px; height: 24px;"></i></div>
        <h2 class="text-sky" style="font-family:var(--font-mono); margin-top: 12px; margin-bottom:12px; font-size:20px;">Congratulations!</h2>
        <p style="font-size:16px; color:var(--text-primary); font-weight:600; margin-bottom:20px;">
          Your ID has been activated successfully.
        </p>
      </div>
    `);
  }

  function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast glassmorphism ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'error') iconName = 'x-circle';

    toast.innerHTML = `
      <div class="toast-body">
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <div class="toast-content">
          <strong class="toast-title">${title}</strong>
          <p class="toast-desc">${message}</p>
        </div>
      </div>
    `;
    toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast?.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 4000);
  }

  // Static Helpers
  function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '--:--:--';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  }

  function formatTimeTo12Hr(dateStr) {
    if (!dateStr) return '--:--:--';
    const d = new Date(dateStr);
    let hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2,'0');
    const secs = String(d.getSeconds()).padStart(2,'0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12;
    return `${String(hrs).padStart(2,'0')}:${mins}:${secs} ${ampm}`;
  }

  // ==========================================================================
  // APP INITIAL BOOTSTRAP CHECK
  // ==========================================================================

  async function checkSessionAuth() {
    const preloader = document.getElementById('preloader');

    if (jwtToken) {
      try {
        // Validate token by fetching context — sets currentUser too
        await fetchUserContext();
        initRealTimeCommunications(jwtToken);

        authContainer?.classList.add('hidden');
        appShell?.classList.remove('hidden');

        loadShellUserInfo();
        routeTo('dashboard');
      } catch (e) {
        // Token is expired or invalid — clear it and show login
        localStorage.removeItem('blulegacy_jwt_token');
        jwtToken = null;
        currentUser = null;
        userContext = null;

        authContainer?.classList.remove('hidden');
        appShell?.classList.add('hidden');
      }
    } else {
      // No token — show login
      authContainer?.classList.remove('hidden');
      appShell?.classList.add('hidden');
    }

    // Dissolve Preloader Screen
    if (preloader) {
      setTimeout(() => {
        preloader?.classList.add('fade-out');
        setTimeout(() => { preloader.style.display = 'none'; }, 500);
      }, 600);
    }
  }

  // Check for Referral Link Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    if (toRegister) {
      toRegister.click();
    }
    const sponsorInput = document.getElementById('reg-referral');
    if (sponsorInput) {
      sponsorInput.value = refCode;
      sponsorInput.dispatchEvent(new Event('input')); // Trigger validation
    }
    // Clean up the URL cosmetically so it doesn't stay in the address bar
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  
  window.renderActivationData = function() {
    try {
      if (!currentUser) return;
      const idEl = document.getElementById('act-ui-userid');
      if (idEl) idEl.textContent = currentUser.userId || 'N/A';
      const nameEl = document.getElementById('act-ui-username');
      if (nameEl) nameEl.textContent = currentUser.name || 'N/A';
      const emailEl = document.getElementById('act-ui-email');
      if (emailEl) emailEl.textContent = currentUser.email || 'N/A';
      const statusBadge = document.getElementById('act-ui-status-badge');
      const isPending = currentUser.status === 'Pending Verification';
      const isActive = currentUser.status === 'Active' || currentUser.idStatus === 'Activated';
      if (statusBadge) {
        statusBadge.textContent = isActive ? 'ACTIVE' : (isPending ? 'PENDING' : 'INACTIVE');
        statusBadge.className = isActive ? 'badge badge-success' : (isPending ? 'badge badge-warning' : 'badge badge-danger');
      }
      const actionArea = document.getElementById('act-ui-action-area');
      const successBanner = document.getElementById('act-ui-success-banner');
      const currentFundBalance = (typeof userContext !== 'undefined' && userContext && userContext.fundBalance) ? userContext.fundBalance : 0;
      if (actionArea && successBanner) {
        if (isActive) {
          actionArea.innerHTML = `<button class="btn btn-full" disabled style="background-color: var(--success); color: white; font-weight: bold; font-family: var(--font-mono); border: none;">ACTIVATED</button>`;
          successBanner?.classList.remove('hidden');
        } else {
          successBanner?.classList.add('hidden');
          const hasFunds = currentFundBalance >= 1000.00;
          actionArea.innerHTML = `
            <button class="btn btn-full" id="act-ui-btn" style="background-color: var(--danger); color: white; font-weight: bold; border: none; font-family: var(--font-mono); ${!hasFunds ? 'opacity: 0.65; cursor: not-allowed;' : 'cursor: pointer; box-shadow: 0 0 15px rgba(255,59,48,0.4);'}">
              <span>ACTIVATE ID (1000.00 COIN)</span>
            </button>
            ${!hasFunds ? `<p style="color:var(--accent-red); font-size:11px; margin-top:8px; text-align:center;">Insufficient Fund Wallet balance. Please add funds first.</p>` : `<p style="color:var(--accent-green); font-size:11px; margin-top:8px; text-align:center;">Fund Balance is ready. Click above to activate.</p>`}
          `;
          const actBtn = document.getElementById('act-ui-btn');
          if (actBtn) {
            actBtn.onclick = async function() {
              if (!hasFunds) {
                showToast("Insufficient Balance", "Insufficient Fund Wallet balance. Please add funds first.", "error");
                return;
              }
              try {
                this.disabled = true;
                this.innerHTML = '<span class="spin" style="display:inline-block; width:14px; height:14px; border:2px solid white; border-top-color:transparent; border-radius:50%; margin-right:8px; vertical-align:middle;"></span> Activating...';
                await apiCall('/api/user/activate-id', 'POST');
                showToast("Activation Success", "Your ID has been activated successfully.", "success");
                await fetchUserContext(); 
                renderActivationData();   
                if (typeof renderDashboardData === 'function') renderDashboardData();
                toggleSidebarLocks(true); 
              } catch (e) {
                this.disabled = false;
                this.innerHTML = '<span>ACTIVATE ID (1000.00 COIN)</span>';
              }
            };
          }
        }
      }
    } catch (err) { console.error(err); }
  };

  
  // ==========================================================================
  // TEAM AREA RENDERER
  // ==========================================================================
  let teamNetworkCache = null;
  let teamDirectPage = 1;
  let teamIndirectPage = 1;
  const TEAM_ITEMS_PER_PAGE = 10;
  
  window.renderTeamAreaData = async function(forceRefresh = false) {
    if (!currentUser) return;
    
    if (forceRefresh || !teamNetworkCache) {
      try {
        teamNetworkCache = await apiCall('/api/user/team-network', 'GET');
      } catch (e) {
        showToast("Error", "Could not fetch team network data.", "error");
        return;
      }
    }
    
    const summary = teamNetworkCache.summary || { totalTeamSize: 0, directCount: 0, indirectCount: 0, activeCount: 0, inactiveCount: 0 };
    const allTeam = teamNetworkCache.team || [];
    
    // 1. Update Summary Cards
    document.getElementById('team-stat-total').textContent = summary.totalTeamSize;
    document.getElementById('team-stat-direct').textContent = summary.directCount;
    document.getElementById('team-stat-indirect').textContent = summary.indirectCount;
    document.getElementById('team-stat-active').textContent = summary.activeCount;
    document.getElementById('team-stat-inactive').textContent = summary.inactiveCount;
    
    // 2. Extract Direct & Indirect Referrals
    const directReferrals = allTeam.filter(member => member.level === 1);
    const indirectReferrals = allTeam.filter(member => member.level > 1);
    
    // Get Filter states
    const searchVal = (document.getElementById('team-search')?.value || "").toLowerCase();
    const statusVal = document.getElementById('team-filter-status')?.value || "all";
    
    function applyFilters(list) {
      return list.filter(m => {
        const matchStatus = statusVal === 'all' || m.status === statusVal;
        const matchSearch = m.userId.toLowerCase().includes(searchVal) || 
                            (m.name && m.name.toLowerCase().includes(searchVal)) || 
                            (m.username && m.username.toLowerCase().includes(searchVal));
        return matchStatus && matchSearch;
      });
    }
    
    const filteredDirect = applyFilters(directReferrals);
    const filteredIndirect = applyFilters(indirectReferrals);
    
    // 3. Render Direct Table
    renderTeamTable('team-direct-tbody', filteredDirect, teamDirectPage, 'team-direct-info', 'team-direct-prev', 'team-direct-next', (p) => { teamDirectPage = p; renderTeamAreaData(false); });
    
    // 4. Render Indirect Table
    renderTeamTable('team-indirect-tbody', filteredIndirect, teamIndirectPage, 'team-indirect-info', 'team-indirect-prev', 'team-indirect-next', (p) => { teamIndirectPage = p; renderTeamAreaData(false); });
    
    // 5. Build Tree View
    buildTeamTreeView(allTeam);
    
    lucide.createIcons();
  };

  function renderTeamTable(tbodyId, data, currentPage, infoId, prevId, nextId, setPageCb) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    
    const totalPages = Math.ceil(data.length / TEAM_ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIdx = (currentPage - 1) * TEAM_ITEMS_PER_PAGE;
    const paginatedData = data.slice(startIdx, startIdx + TEAM_ITEMS_PER_PAGE);
    
    tbody.innerHTML = '';
    
    if (paginatedData.length === 0) {
      const colSpan = tbodyId === 'team-direct-tbody' ? 7 : 7;
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding: 20px; color:var(--text-secondary);">No records found.</td></tr>`;
    } else {
      paginatedData.forEach(m => {
        const badgeClass = m.status === 'Active' ? 'badge-success' : 'badge-danger';
        const actDate = m.activationDate ? new Date(m.activationDate).toLocaleDateString() : 'N/A';
        const regDate = m.registeredAt ? new Date(m.registeredAt).toLocaleDateString() : 'N/A';
        
        let rowHtml = `
          <td><strong style="font-family:var(--font-mono); color:var(--sky-primary);">${m.userId}</strong></td>
          <td>${m.username || m.name}</td>
          <td>${m.email || 'N/A'}</td>
        `;
        
        if (tbodyId === 'team-indirect-tbody') {
          rowHtml += `
            <td style="font-family:var(--font-mono); color:var(--text-secondary);">${m.sponsorId || 'N/A'}</td>
            <td>Level ${m.level}</td>
            <td>${regDate}</td>
            <td><span class="badge ${badgeClass}">${m.status}</span></td>
          `;
        } else {
          rowHtml += `
            <td>${regDate}</td>
            <td>${actDate}</td>
            <td><span class="badge ${badgeClass}">${m.status}</span></td>
            <td>Level ${m.level}</td>
          `;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
      });
    }
    
    const infoEl = document.getElementById(infoId);
    const prevBtn = document.getElementById(prevId);
    const nextBtn = document.getElementById(nextId);
    
    if (infoEl) infoEl.textContent = `Showing ${startIdx + 1 > data.length ? data.length : startIdx + 1}-${Math.min(startIdx + TEAM_ITEMS_PER_PAGE, data.length)} of ${data.length} records`;
    if (prevBtn) {
      prevBtn.disabled = currentPage === 1;
      prevBtn.onclick = () => setPageCb(currentPage - 1);
    }
    if (nextBtn) {
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.onclick = () => setPageCb(currentPage + 1);
    }
  }

  function buildTeamTreeView(allTeam) {
    const container = document.getElementById('team-tree-container');
    if (!container || !currentUser) return;
    
    // Root is currentUser
    const root = {
      userId: currentUser.userId,
      name: currentUser.name,
      status: currentUser.status === 'Active' || currentUser.idStatus === 'Activated' ? 'Active' : 'Inactive',
      children: []
    };
    
    // Map team by sponsorId
    const sponsorMap = {};
    allTeam.forEach(m => {
      if (!sponsorMap[m.sponsorId]) sponsorMap[m.sponsorId] = [];
      sponsorMap[m.sponsorId].push(m);
    });
    
    function attachChildren(node) {
      const children = sponsorMap[node.userId] || [];
      node.children = children;
      node.children.forEach(c => attachChildren(c));
    }
    
    attachChildren(root);
    
    function createTreeNodeHtml(node, isRoot = false) {
      const color = node.status === 'Active' ? 'var(--success)' : 'var(--danger)';
      const icon = node.status === 'Active' ? 'user-check' : 'user';
      
      let html = `
        <div class="tree-node" style="margin: 5px 0;">
          <div style="display:flex; align-items:center; cursor:pointer;" onclick="this.nextElementSibling?.classList.toggle('hidden');">
            ${node.children.length > 0 ? `<i data-lucide="chevron-down" style="width:14px; height:14px; margin-right:5px; color:var(--text-secondary);"></i>` : `<span style="width:19px; display:inline-block;"></span>`}
            <i data-lucide="${icon}" style="width:16px; height:16px; color:${color}; margin-right:8px;"></i>
            <span><strong style="color:var(--sky-primary);">${node.userId}</strong> - ${node.name} <span style="font-size:11px; color:var(--text-secondary); margin-left:10px;">[${node.status}]</span></span>
          </div>
          <div class="tree-children ${isRoot ? '' : 'hidden'}" style="margin-left: 20px; border-left: 1px dashed rgba(255,255,255,0.1); padding-left: 15px; margin-top: 5px;">
      `;
      
      node.children.forEach(child => {
        html += createTreeNodeHtml(child, false);
      });
      
      html += `</div></div>`;
      return html;
    }
    
    container.innerHTML = createTreeNodeHtml(root, true);
  }

  // Event Listeners for Team Area
  document.getElementById('team-tab-direct')?.parentElement?.addEventListener('click', (e) => {
    if (e.target?.classList.contains('team-tab-btn')) {
      document.querySelectorAll('.team-tab-btn').forEach(b => { b?.classList.remove('active'); b.style.color = 'var(--text-secondary)'; b.style.fontWeight = 'normal'; });
      e.target?.classList.add('active');
      e.target.style.color = 'white';
      e.target.style.fontWeight = 'bold';
      
      document.querySelectorAll('.team-tab-content').forEach(c => c?.classList.add('hidden'));
      document.getElementById(e.target.dataset.target)?.classList.remove('hidden');
    }
  });

  document.getElementById('team-search')?.addEventListener('input', () => { teamDirectPage = 1; teamIndirectPage = 1; renderTeamAreaData(false); });
  document.getElementById('team-filter-status')?.addEventListener('change', () => { teamDirectPage = 1; teamIndirectPage = 1; renderTeamAreaData(false); });
  document.getElementById('team-refresh-btn')?.addEventListener('click', () => { renderTeamAreaData(true); });


  
  // ==========================================================================
  // REFERRAL INCOME RENDERER
  // ==========================================================================
  window.renderReferralIncomeData = function() {
    if (!currentUser || !userContext) return;
    
    // Filter transactions for "Direct Income"
    const txs = userContext.transactions || [];
    const directIncomeTxs = txs.filter(t => t.category === 'Direct Income' && t.type === 'credit');
    
    // Calculate total
    const totalIncome = directIncomeTxs.reduce((sum, t) => sum + t.amount, 0);
    
    document.getElementById('ref-inc-total').textContent = `${totalIncome.toFixed(2)} COIN`;
    
    const tbody = document.getElementById('ref-inc-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (directIncomeTxs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">No referral income records found.</td></tr>`;
    } else {
      directIncomeTxs.forEach(t => {
        const dateStr = new Date(t.date).toLocaleString();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary); font-size:12px;">${t.txid}</td>
          <td>${t.note}</td>
          <td style="text-align: right; color:var(--success); font-weight:bold;">+${t.amount.toFixed(2)} COIN</td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    lucide.createIcons();
  };

  
  // ==========================================================================
  // LEVEL INCOME RENDERER
  // ==========================================================================
  window.renderLevelIncomeData = function() {
    if (!currentUser || !userContext) return;
    
    // Filter transactions for "Level Income"
    const txs = userContext.transactions || [];
    const levelIncomeTxs = txs.filter(t => t.category === 'Level Income' && t.type === 'credit');
    
    // Calculate total
    const totalIncome = levelIncomeTxs.reduce((sum, t) => sum + t.amount, 0);
    
    document.getElementById('lvl-inc-total').textContent = `${totalIncome.toFixed(2)} COIN`;
    
    const tbody = document.getElementById('lvl-inc-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (levelIncomeTxs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">No level income records found.</td></tr>`;
    } else {
      levelIncomeTxs.forEach(t => {
        const dateStr = new Date(t.date).toLocaleString();
        
        // Parse note: "Level 4 commission from node Alex (TRON123456)"
        let levelNum = "N/A";
        let originNode = "Unknown";
        
        const levelMatch = t.note.match(/Level (\d+)/i);
        if (levelMatch) levelNum = `Level ${levelMatch[1]}`;
        
        const nodeMatch = t.note.match(/from node (.*?)$/i);
        if (nodeMatch) originNode = nodeMatch[1];
        else originNode = t.note; // fallback
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td><strong style="color:var(--sky-primary);">${levelNum}</strong></td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary); font-size:12px;">${originNode}</td>
          <td style="text-align: right; color:var(--success); font-weight:bold;">+${t.amount.toFixed(2)} COIN</td>
          <td style="text-align: center;"><span class="badge badge-success">Paid</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    lucide.createIcons();
  };

  
  // ==========================================================================
  // WITHDRAW RENDERER
  // ==========================================================================
  window.renderWithdrawData = function() {
    if (!currentUser || !userContext) return;
    const db = userContext;

    // Check if account is active to show/hide lockout
    const lockout = document.getElementById('withdraw-lockout-notice');
    const mainContent = document.getElementById('withdraw-main-content');
    if (currentUser.idStatus !== 'Activated') {
      if (lockout) lockout?.classList.remove('hidden');
      if (mainContent) mainContent?.classList.add('hidden');
      return;
    } else {
      if (lockout) lockout?.classList.add('hidden');
      if (mainContent) mainContent?.classList.remove('hidden');
    }

    // Top Metrics
    const balance = db.balance || 0;
    const totalEarnings = db.incomeBreakdown?.total || 0;
    const todayEarnings = db.todayIncome || 0;

    // Calculate Pending Withdrawals
    const pendingTxs = (db.withdrawals || []).filter(w => w.status === 'Pending' || w.status === 'Processing');
    const pendingAmount = pendingTxs.reduce((sum, w) => sum + w.amount, 0);

    const wbal = document.getElementById('withdraw-wallet-balance');
    const wtot = document.getElementById('withdraw-total-earnings');
    const wtoday = document.getElementById('withdraw-today-earnings');
    const wpen = document.getElementById('withdraw-total-pending');

    if (wbal) wbal.textContent = `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wtot) wtot.textContent = `${totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wtoday) wtoday.textContent = `${todayEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;
    if (wpen) wpen.textContent = `${pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    // Auto-filled Form Fields
    const aid = document.getElementById('withdraw-auto-userid');
    const aname = document.getElementById('withdraw-auto-name');
    const amob = document.getElementById('withdraw-auto-mobile');
    const abal = document.getElementById('withdraw-auto-balance');

    if (aid) aid.value = currentUser.userId;
    if (aname) aname.value = currentUser.name;
    if (amob) amob.value = currentUser.mobile;
    if (abal) abal.value = `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} COIN`;

    // Form submission
    const reqForm = document.getElementById('withdraw-request-form');
    if (reqForm) {
      reqForm.onsubmit = async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('withdraw-amount').value);
        const destination = document.getElementById('withdraw-address').value.trim();
        const pin = document.getElementById('withdraw-pin').value;

        try {
          const res = await apiCall('/api/user/withdraw', 'POST', { amount, destination, pin });
          if (res.success) {
            showToast('Requested', 'Withdrawal sent for processing.', 'success');
            document.getElementById('withdraw-amount').value = '';
            document.getElementById('withdraw-address').value = '';
            document.getElementById('withdraw-pin').value = '';
            fetchUserContext(); // refresh data
          }
        } catch (err) {
          showToast('Failed', err.message, 'error');
        }
      };
    }

    // Render History
    const tbody = document.getElementById('withdraw-history-body');
    if (tbody) {
      tbody.innerHTML = '';
      const wList = db.withdrawals || [];
      if (wList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">No withdrawal history found.</td></tr>`;
      } else {
        wList.forEach(w => {
          const dStr = new Date(w.createdAt).toLocaleString();
          let badge = 'badge-warning';
          if (w.status === 'Approved' || w.status === 'Completed') badge = 'badge-success';
          if (w.status === 'Rejected') badge = 'badge-danger';
          
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:bold; color:var(--text-primary);">${w.amount.toFixed(2)} COIN</td>
            <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${w.destination}</td>
            <td>${dStr}</td>
            <td><span class="badge ${badge}">${w.status}</span></td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  };

  checkSessionAuth();
});
