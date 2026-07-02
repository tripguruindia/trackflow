let socket = null;
let teamMembers = [];
let hrRequests = [];
let attendanceData = [];
let tasksData = [];
let productivityData = {};
let logsData = [];
let selectedMemberId = localStorage.getItem('selectedTeamMemberId') || '';
let selectedStatus = '';
let activeRequestType = 'Leave';
let financialsUnlocked = false;
let pinPurpose = 'unlock_workspace';
let lastReadLogsTimestamp = localStorage.getItem('lastReadLogsTimestamp_' + selectedMemberId) || '1970-01-01T00:00:00.000Z';
let lastProcessedLogTimestamp = null;

function getLocalDateString(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput || new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


// DOM Elements
const teamSelect = document.getElementById('team-select');
const headerLogoutBtn = document.getElementById('header-logout-btn');
const portalActions = document.getElementById('portal-actions');
const statusBanner = document.getElementById('current-status-banner');
const statusText = document.getElementById('current-status-text');
const statusButtons = document.querySelectorAll('.status-select-btn');
const attStatusText = document.getElementById('attendance-status-text');
const attActionBtn = document.getElementById('attendance-action-btn');
const workspaceCard = document.getElementById('workspace-card');
const profileSelectContainer = document.getElementById('profile-select-container');
const mainContainer = document.getElementById('main-container');

// Profile Dashboard Card Elements
const profileAvatarChar = document.getElementById('profile-avatar-char');
const profileDisplayName = document.getElementById('profile-display-name');
const profileDisplayPhone = document.getElementById('profile-display-phone');
const profileDisplayEmail = document.getElementById('profile-display-email');
const profileDisplayAddress = document.getElementById('profile-display-address');
const profileDisplaySalary = document.getElementById('profile-display-salary');
const profileDisplayAdvance = document.getElementById('profile-display-advance');

// Daily Personal Stats Elements
const statWorkingTime = document.getElementById('stat-working-time');
const statIdleTime = document.getElementById('stat-idle-time');
const statBreakTime = document.getElementById('stat-break-time');

// Task List DOM Elements
const addTaskBtn = document.getElementById('add-task-btn');
const taskCategory = document.getElementById('task-category');
const taskPriority = document.getElementById('task-priority');
const taskDescription = document.getElementById('task-description');

const taskTabActive = document.getElementById('task-tab-active');
const taskTabPending = document.getElementById('task-tab-pending');
const taskTabCompleted = document.getElementById('task-tab-completed');

const tasksActiveContainer = document.getElementById('tasks-active-container');
const tasksPendingContainer = document.getElementById('tasks-pending-container');
const tasksCompletedContainer = document.getElementById('tasks-completed-container');

const taskCountActive = document.getElementById('task-count-active');
const taskCountPending = document.getElementById('task-count-pending');
const taskCountCompleted = document.getElementById('task-count-completed');

// Personal Attendance Log Elements
const personalAttendanceTableBody = document.getElementById('personal-attendance-table-body');

// HR Request Form Elements
const reqToggleLeave = document.getElementById('req-toggle-leave');
const reqToggleAdvance = document.getElementById('req-toggle-advance');
const reqFieldsLeave = document.getElementById('req-fields-leave');
const reqFieldsAdvance = document.getElementById('req-fields-advance');
const reqLeaveStart = document.getElementById('req-leave-start');
const reqLeaveEnd = document.getElementById('req-leave-end');
const reqAdvanceAmount = document.getElementById('req-advance-amount');
const reqReason = document.getElementById('req-reason');
const submitReqBtn = document.getElementById('submit-req-btn');
const memberRequestsHistory = document.getElementById('member-requests-history');

// Member Profile Details Elements
const memberPhone = document.getElementById('member-phone');
const memberEmail = document.getElementById('member-email');
const memberAddress = document.getElementById('member-address');
const memberIdType = document.getElementById('member-idtype');
const memberIdNumber = document.getElementById('member-idnumber');
const memberPin = document.getElementById('member-pin');
const updateProfileBtn = document.getElementById('update-profile-btn');

// PIN Modal Elements
const pinModal = document.getElementById('pin-modal');
const pinInput = document.getElementById('pin-input');
const pinErrorMsg = document.getElementById('pin-error-msg');
const pinConfirmBtn = document.getElementById('pin-confirm-btn');
const pinCancelBtn = document.getElementById('pin-cancel-btn');
const lockBox = pinModal ? pinModal.querySelector('.lock-box') : null;
let pendingMemberId = '';

// Initialize WebSockets Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Connected to WebSocket server');
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'STATE_UPDATE') {
      teamMembers = message.data.employees;
      hrRequests = message.data.requests || [];
      attendanceData = message.data.attendance || [];
      tasksData = message.data.tasks || [];
      productivityData = message.data.productivity || {};
      logsData = message.data.logs || [];
      updateTeamDropdown();
      
      if (selectedMemberId) {
        checkNewLogsForToasts(logsData);
        renderTasks();
        checkProfileAuth(selectedMemberId);
      }
    }
  };

  socket.onclose = () => {
    console.log('WebSocket connection closed. Reconnecting in 3 seconds...');
    setTimeout(initWebSocket, 3000);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Populate team selector dropdown
function updateTeamDropdown() {
  const currentVal = teamSelect.value || selectedMemberId;
  
  teamSelect.innerHTML = '<option value="" disabled selected>Select your name...</option>';
  
  teamMembers.forEach(member => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    teamSelect.appendChild(option);
  });

  if (currentVal && teamMembers.some(m => m.id === currentVal)) {
    teamSelect.value = currentVal;
    selectedMemberId = currentVal;

    const isUnlocked = sessionStorage.getItem('team_member_unlocked_' + selectedMemberId) === 'true';
    if (isUnlocked) {
      teamSelect.disabled = true;
      if (headerLogoutBtn) headerLogoutBtn.style.display = 'block';
      if (workspaceCard) workspaceCard.classList.add('dashboard-active');
      if (mainContainer) mainContainer.classList.add('dashboard-active');
      if (profileSelectContainer) profileSelectContainer.style.display = 'none';
    } else {
      teamSelect.disabled = false;
      if (headerLogoutBtn) headerLogoutBtn.style.display = 'none';
      if (workspaceCard) workspaceCard.classList.remove('dashboard-active');
      if (mainContainer) mainContainer.classList.remove('dashboard-active');
      if (profileSelectContainer) profileSelectContainer.style.display = 'block';
    }
  } else {
    portalActions.style.display = 'none';
    teamSelect.disabled = false;
    if (headerLogoutBtn) headerLogoutBtn.style.display = 'none';
    if (workspaceCard) workspaceCard.classList.remove('dashboard-active');
    if (mainContainer) mainContainer.classList.remove('dashboard-active');
    if (profileSelectContainer) profileSelectContainer.style.display = 'block';
  }
}

// Sync local UI with server state for selected team member
function syncTeamMemberState() {
  const currentMember = teamMembers.find(m => m.id === selectedMemberId);
  if (!currentMember) return;

  // Update attendance control card
  const isClockedIn = attendanceData.some(att => att.memberId === selectedMemberId && att.logoutTime === null);
  if (attStatusText && attActionBtn) {
    if (isClockedIn) {
      const activeAtt = attendanceData.find(att => att.memberId === selectedMemberId && att.logoutTime === null);
      if (activeAtt && activeAtt.approvalStatus === 'Pending') {
        attStatusText.textContent = "Checked In (Pending Approval)";
        attStatusText.style.color = "var(--brand-cyan)";
      } else {
        attStatusText.textContent = "Checked In";
        attStatusText.style.color = "var(--color-working)";
      }
      attActionBtn.textContent = "Office Out";
      attActionBtn.style.background = "#ef4444";
    } else {
      attStatusText.textContent = "Not Checked In";
      attStatusText.style.color = "#ef4444";
      attActionBtn.textContent = "Office In";
      attActionBtn.style.background = "var(--color-working)";
    }
  }

  selectedStatus = currentMember.status;
  
  // Update current status banner
  statusText.textContent = getStatusLabel(currentMember.status);
  
  // Reset banner styles
  statusBanner.className = 'current-status-display';
  if (currentMember.status === 'Working') {
    statusBanner.classList.add('status-working');
    if (currentMember.currentTask) {
      statusText.textContent = `Working on: ${currentMember.currentTask.category}`;
    }
  } else if (currentMember.status === 'Idle') {
    statusBanner.classList.add('status-idle');
  } else if (currentMember.status === 'Break') {
    statusBanner.classList.add('status-break');
  } else {
    statusBanner.classList.add('status-offline');
  }

  // Highlight selected status button
  statusButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-status') === currentMember.status) {
      btn.classList.add('active');
    }
  });

  // Update Profile Card Details
  if (profileAvatarChar) profileAvatarChar.textContent = currentMember.name.charAt(0);
  if (profileDisplayName) profileDisplayName.textContent = currentMember.name;
  if (profileDisplayPhone) profileDisplayPhone.textContent = currentMember.phone || '--';
  if (profileDisplayEmail) profileDisplayEmail.textContent = currentMember.email || '--';
  if (profileDisplayAddress) profileDisplayAddress.textContent = currentMember.address || '--';
  if (profileDisplaySalary) {
    profileDisplaySalary.innerHTML = financialsUnlocked 
      ? '₹' + (currentMember.salaryPerMonth || 3000).toLocaleString() + '.00'
      : '<span style="font-size:0.75rem; font-weight:600; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;">🔒 Click to View</span>';
  }
  if (profileDisplayAdvance) {
    profileDisplayAdvance.innerHTML = financialsUnlocked
      ? '₹' + (currentMember.advanceBalance || 0).toLocaleString() + '.00'
      : '<span style="font-size:0.75rem; font-weight:600; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;">🔒 Click to View</span>';
  }

  // Render Stats & History
  renderPersonalStats(currentMember);
  renderPersonalAttendanceTable();
  renderMemberHrDetails(currentMember);
  
  // Render ledger payouts
  renderLedgerLog(currentMember);
  
  // Render notifications feed and badges
  renderNotificationsFeed();
  updateNotificationBadge();
  
  // Initialize and render attendance calendar
  initPersonalCalendarMonth();
  const calMonthSelect = document.getElementById('personal-calendar-month');
  if (calMonthSelect && calMonthSelect.value) {
    renderPersonalCalendar(calMonthSelect.value);
  }
}

// Check if team member has active authorization session
function checkProfileAuth(memberId) {
  if (sessionStorage.getItem('team_member_unlocked_' + memberId) === 'true') {
    portalActions.style.display = 'block';
    teamSelect.disabled = true;
    if (headerLogoutBtn) headerLogoutBtn.style.display = 'block';
    if (workspaceCard) workspaceCard.classList.add('dashboard-active');
    if (mainContainer) mainContainer.classList.add('dashboard-active');
    if (profileSelectContainer) profileSelectContainer.style.display = 'none';
    syncTeamMemberState();
  } else {
    pendingMemberId = memberId;
    portalActions.style.display = 'none';
    teamSelect.disabled = false;
    if (headerLogoutBtn) headerLogoutBtn.style.display = 'none';
    if (workspaceCard) workspaceCard.classList.remove('dashboard-active');
    if (mainContainer) mainContainer.classList.remove('dashboard-active');
    if (profileSelectContainer) profileSelectContainer.style.display = 'block';
    pinModal.style.display = 'flex';
    pinInput.value = '';
    pinErrorMsg.style.display = 'none';
    pinInput.focus();
  }
}

// Verify Team member PIN code
function verifyMemberPin() {
  const pin = pinInput.value;
  if (!pin || pin.length !== 4) {
    alert("Please enter a 4-digit PIN.");
    pinInput.focus();
    return;
  }

  fetch('/api/team/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pendingMemberId, pin })
  })
  .then(res => {
    if (!res.ok) throw new Error('Invalid PIN');
    return res.json();
  })
  .then(data => {
    if (data.success) {
      if (pinPurpose === 'view_financials') {
        financialsUnlocked = true;
        pinModal.style.display = 'none';
        
        // Restore default modal text
        document.getElementById('pin-modal-title').textContent = "Verification Required";
        document.getElementById('pin-modal-desc').textContent = "Please enter your 4-digit PIN to unlock your workspace.";
        
        syncTeamMemberState();
      } else {
        sessionStorage.setItem('team_member_unlocked_' + pendingMemberId, 'true');
        selectedMemberId = pendingMemberId;
        localStorage.setItem('selectedTeamMemberId', selectedMemberId);
        
        pinModal.style.display = 'none';
        portalActions.style.display = 'block';
        teamSelect.disabled = true;
        if (headerLogoutBtn) headerLogoutBtn.style.display = 'block';
        if (workspaceCard) workspaceCard.classList.add('dashboard-active');
        if (mainContainer) mainContainer.classList.add('dashboard-active');
        if (profileSelectContainer) profileSelectContainer.style.display = 'none';
        syncTeamMemberState();
      }
    }
  })
  .catch(err => {
    pinErrorMsg.style.display = 'block';
    if (lockBox) {
      lockBox.classList.add('shake-box');
      setTimeout(() => {
        lockBox.classList.remove('shake-box');
      }, 300);
    }
    pinInput.value = '';
    pinInput.focus();
  });
}

pinConfirmBtn.addEventListener('click', verifyMemberPin);
pinInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') verifyMemberPin();
});

pinCancelBtn.addEventListener('click', () => {
  pinModal.style.display = 'none';
  
  // Restore default modal text
  document.getElementById('pin-modal-title').textContent = "Verification Required";
  document.getElementById('pin-modal-desc').textContent = "Please enter your 4-digit PIN to unlock your workspace.";
  
  if (pinPurpose === 'view_financials') {
    pinPurpose = 'unlock_workspace';
    return;
  }
  
  // Reset select dropdown back to previous unlocked member if one exists
  const isUnlocked = selectedMemberId && sessionStorage.getItem('team_member_unlocked_' + selectedMemberId) === 'true';
  if (isUnlocked) {
    teamSelect.value = selectedMemberId;
    portalActions.style.display = 'block';
    if (workspaceCard) workspaceCard.classList.add('dashboard-active');
    if (mainContainer) mainContainer.classList.add('dashboard-active');
    if (profileSelectContainer) profileSelectContainer.style.display = 'none';
    syncTeamMemberState();
  } else {
    teamSelect.value = '';
    selectedMemberId = '';
    localStorage.removeItem('selectedTeamMemberId');
    portalActions.style.display = 'none';
    if (workspaceCard) workspaceCard.classList.remove('dashboard-active');
    if (mainContainer) mainContainer.classList.remove('dashboard-active');
    if (profileSelectContainer) profileSelectContainer.style.display = 'block';
  }
});

// Get clean status labels
function getStatusLabel(status) {
  switch (status) {
    case 'Working': return 'Working';
    case 'Idle': return 'Idle / Waiting';
    case 'Break': return 'On Break';
    case 'Offline': return 'Off Duty';
    default: return 'Offline';
  }
}

// Handle Team Member Selection
teamSelect.addEventListener('change', (e) => {
  const val = e.target.value;
  checkProfileAuth(val);
});

function triggerOfficeInFlow() {
  if (confirm("Are you sure you want to log your Office In attendance for today?")) {
    if (confirm("Confirm: Do you want to check in as of the current time?")) {
      fetch('/api/attendance/office-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: selectedMemberId })
      })
      .then(res => {
        if (!res.ok) throw new Error("Failed to register Office In");
        return res.json();
      })
      .then(data => {
        alert("Registered Office In attendance! Your status has been set to Idle / Waiting.");
      })
      .catch(err => {
        alert("Error: " + err.message);
      });
    }
  }
}

function triggerOfficeOutFlow() {
  if (confirm("Are you sure you want to log your Office Out attendance and end your shift?")) {
    if (confirm("Confirm: Do you want to check out as of the current time?")) {
      fetch('/api/attendance/office-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: selectedMemberId })
      })
      .then(res => {
        if (!res.ok) throw new Error("Failed to register Office Out");
        return res.json();
      })
      .then(data => {
        alert("Registered Office Out attendance! Your status has been set to Offline.");
      })
      .catch(err => {
        alert("Error: " + err.message);
        syncTeamMemberState();
      });
    } else {
      syncTeamMemberState();
    }
  } else {
    syncTeamMemberState();
  }
}

// Handle Status Button Click
statusButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetStatus = btn.getAttribute('data-status');
    const isClockedIn = attendanceData.some(att => att.memberId === selectedMemberId && att.logoutTime === null);

    if (!isClockedIn) {
      if (targetStatus === 'Offline') {
        alert("You are already Off Duty (Offline).");
        return;
      }
      alert("Please clock in (Office In) first before setting your status.");
      syncTeamMemberState();
      return;
    }

    if (targetStatus === 'Offline') {
      triggerOfficeOutFlow();
      return;
    }

    if (targetStatus === 'Working') {
      alert("To set your status to Working, please start or resume a task from your task list below.");
      syncTeamMemberState();
      return;
    }

    // Highlight locally immediately
    statusButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    sendStatusUpdate(targetStatus, null);
  });
});

// Helper to push update via WebSockets
function sendStatusUpdate(status, currentTask) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert('Connection lost. Please wait a moment and try again.');
    return;
  }

  const payload = {
    type: 'UPDATE_STATUS',
    data: {
      employeeId: selectedMemberId, // Matches backend property key 'employeeId'
      status: status,
      currentTask: currentTask
    }
  };

  socket.send(JSON.stringify(payload));
}

// Render personal productivity stats today
function renderPersonalStats(member) {
  if (!member) return;

  const todayStr = getLocalDateString();
  let todayProd = { Working: 0, Idle: 0, Break: 0 };
  
  if (productivityData && productivityData[todayStr] && productivityData[todayStr][member.id]) {
    const data = productivityData[todayStr][member.id];
    todayProd.Working = data.Working || 0;
    todayProd.Idle = data.Idle || 0;
    todayProd.Break = data.Break || 0;
  }

  // If active, add live elapsed time
  const isClockedIn = attendanceData.some(att => att.memberId === member.id && att.logoutTime === null);
  if (isClockedIn && member.status !== 'Offline') {
    const elapsedSecs = Math.floor((Date.now() - new Date(member.lastUpdated).getTime()) / 1000);
    if (elapsedSecs > 0 && todayProd[member.status] !== undefined) {
      todayProd[member.status] += elapsedSecs;
    }
  }

  if (statWorkingTime) statWorkingTime.textContent = formatHourMinSec(todayProd.Working);
  if (statIdleTime) statIdleTime.textContent = formatHourMinSec(todayProd.Idle);
  if (statBreakTime) statBreakTime.textContent = formatHourMinSec(todayProd.Break);
}

// Render personal attendance history table
function renderPersonalAttendanceTable() {
  if (!personalAttendanceTableBody) return;

  const myLogs = attendanceData.filter(att => att.memberId === selectedMemberId);
  personalAttendanceTableBody.innerHTML = '';

  if (myLogs.length === 0) {
    personalAttendanceTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem 0; font-style: italic;">No attendance logged.</td>
      </tr>
    `;
    return;
  }

  // Sort: most recent first
  const sortedLogs = [...myLogs].sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.loginTime) - new Date(a.loginTime));

  sortedLogs.forEach(log => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    tr.style.color = 'var(--text-secondary)';

    const loginStr = formatClockTime(log.loginTime);
    const logoutStr = log.logoutTime ? formatClockTime(log.logoutTime) : '<span style="color: var(--color-working);">Active</span>';
    
    let badgeColor = '';
    let statusText = '';
    if (log.approvalStatus === 'Approved') {
      badgeColor = 'var(--color-working)';
      statusText = 'Approved';
    } else {
      badgeColor = 'var(--brand-cyan)';
      statusText = 'Pending';
    }

    tr.innerHTML = `
      <td style="padding: 0.5rem 0.2rem;">${new Date(log.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</td>
      <td style="padding: 0.5rem 0.2rem;">${loginStr}</td>
      <td style="padding: 0.5rem 0.2rem;">${logoutStr}</td>
      <td style="padding: 0.5rem 0.2rem; text-align: right; font-weight: 700; color: ${badgeColor};">${statusText}</td>
    `;
    personalAttendanceTableBody.appendChild(tr);
  });
}

// Helper clock time formatting
function formatClockTime(dateString) {
  if (!dateString) return '--:--';
  const d = new Date(dateString);
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===================================================
// MEMBER HR & PAYROLL CONTROLLER
// ===================================================
function renderMemberHrDetails(member) {
  if (!member) return;

  if (profileDisplayAdvance) {
    profileDisplayAdvance.innerHTML = financialsUnlocked
      ? `₹${(member.advanceBalance || 0).toLocaleString()}.00`
      : '<span style="font-size:0.75rem; font-weight:600; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;">🔒 Click to View</span>';
  }
  if (profileDisplaySalary) {
    profileDisplaySalary.innerHTML = financialsUnlocked
      ? `₹${(member.salaryPerMonth || 0).toLocaleString()}.00`
      : '<span style="font-size:0.75rem; font-weight:600; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;">🔒 Click to View</span>';
  }

  // Populate profile fields only if they aren't currently focused (to prevent overwriting typing)
  if (document.activeElement !== memberPhone) memberPhone.value = member.phone || '';
  if (document.activeElement !== memberEmail) memberEmail.value = member.email || '';
  if (document.activeElement !== memberAddress) memberAddress.value = member.address || '';
  if (document.activeElement !== memberIdType) memberIdType.value = member.idType || 'National ID';
  if (document.activeElement !== memberIdNumber) memberIdNumber.value = member.idNumber || '';
  if (document.activeElement !== memberPin) memberPin.value = '';

  const myRequests = hrRequests.filter(r => r.memberId === member.id);
  
  memberRequestsHistory.innerHTML = '';
  if (myRequests.length === 0) {
    memberRequestsHistory.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No previous requests.</div>`;
    return;
  }

  myRequests.forEach(req => {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    div.style.padding = '0.75rem';
    div.style.border = '1px solid var(--border-glass)';
    div.style.borderRadius = '8px';
    div.style.fontSize = '0.775rem';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '0.25rem';
    div.style.background = 'var(--bg-glass)';

    let statusText = '';
    let color = '';
    if (req.status === 'Pending') {
      statusText = '⏳ Pending';
      color = 'var(--brand-cyan)';
    } else if (req.status === 'Approved') {
      statusText = '✅ Approved';
      color = 'var(--color-working)';
    } else {
      statusText = '❌ Rejected';
      color = '#ef4444';
    }

    let detailStr = '';
    if (req.type === 'Leave') {
      detailStr = `🌴 <strong>Leave:</strong> ${req.details.startDate} to ${req.details.endDate}`;
    } else {
      detailStr = `💵 <strong>Advance:</strong> ₹${req.amount}`;
    }

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-weight: 700; border-bottom: 1px dotted var(--border-glass); padding-bottom: 0.25rem; margin-bottom: 0.2rem;">
        <span style="color: ${color};">${statusText}</span>
        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">${new Date(req.date).toLocaleDateString()}</span>
      </div>
      <div style="color: var(--text-secondary); line-height: 1.35;">
        <div>${detailStr}</div>
        <div>💬 "${req.details.reason || 'No description'}"</div>
        ${req.notes ? `<div style="margin-top: 0.25rem; font-style: italic; color: var(--text-muted); border-left: 2px solid var(--border-glass); padding-left: 0.4rem;">✍️ Reply: "${req.notes}"</div>` : ''}
      </div>
    `;
    memberRequestsHistory.appendChild(div);
  });
}


function initRequestFormToggles() {
  if (!reqToggleLeave || !reqToggleAdvance) return;

  function toggleFields(activeBtn, inactiveBtn, showFields, hideFields, type) {
    activeBtn.style.background = 'var(--brand-cyan)';
    activeBtn.style.color = 'white';
    activeBtn.style.boxShadow = '0 2px 6px rgba(8, 145, 178, 0.1)';
    activeBtn.style.border = 'none';

    inactiveBtn.style.background = 'transparent';
    inactiveBtn.style.color = 'var(--text-secondary)';
    inactiveBtn.style.boxShadow = 'none';
    inactiveBtn.style.border = '1px solid var(--border-glass)';

    showFields.style.display = 'flex';
    hideFields.style.display = 'none';

    activeRequestType = type;
  }

  reqToggleLeave.addEventListener('click', () => {
    toggleFields(reqToggleLeave, reqToggleAdvance, reqFieldsLeave, reqFieldsAdvance, 'Leave');
  });

  reqToggleAdvance.addEventListener('click', () => {
    toggleFields(reqToggleAdvance, reqToggleLeave, reqFieldsAdvance, reqFieldsLeave, 'Advance');
  });
}

function submitHrRequest() {
  if (!selectedMemberId) return;

  const reason = reqReason.value.trim();
  if (!reason) {
    alert("Please enter a reason or justification.");
    reqReason.focus();
    return;
  }

  const payload = {
    memberId: selectedMemberId,
    type: activeRequestType,
    details: { reason },
    amount: null
  };

  if (activeRequestType === 'Leave') {
    const startDate = reqLeaveStart.value;
    const endDate = reqLeaveEnd.value;

    if (!startDate || !endDate) {
      alert("Please select both start and end dates.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      alert("Start date cannot be after end date.");
      return;
    }

    payload.details.startDate = startDate;
    payload.details.endDate = endDate;
  } else {
    const amount = reqAdvanceAmount.value;
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid requested advance amount.");
      reqAdvanceAmount.focus();
      return;
    }
    payload.amount = parseFloat(amount);
  }

  fetch('/api/requests/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to submit request");
    return res.json();
  })
  .then(() => {
    alert("Request submitted successfully!");
    
    // Clear inputs
    reqReason.value = '';
    reqLeaveStart.value = '';
    reqLeaveEnd.value = '';
    reqAdvanceAmount.value = '';

    // Re-render
    const member = teamMembers.find(m => m.id === selectedMemberId);
    if (member) {
      renderMemberHrDetails(member);
    }
  })
  .catch(err => {
    alert("Error submitting request: " + err.message);
  });
}

function submitProfileUpdate() {
  if (!selectedMemberId) return;

  const phone = memberPhone.value.trim();
  const email = memberEmail.value.trim();
  const address = memberAddress.value.trim();
  const idType = memberIdType.value.trim();
  const idNumber = memberIdNumber.value.trim();
  const pin = memberPin.value.trim();

  if (pin !== '' && !/^\d{4}$/.test(pin)) {
    alert("PIN code must be a 4-digit number.");
    memberPin.focus();
    return;
  }

  fetch('/api/employees/edit-hr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: selectedMemberId,
      phone,
      email,
      address,
      idType,
      idNumber,
      pin
    })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to update profile details");
    return res.json();
  })
  .then(() => {
    alert("Profile details updated successfully!");
  })
  .catch(err => {
    alert("Error updating profile: " + err.message);
  });
}

// ===================================================
// WORKSPACE TASKLIST MANAGER CONTROLLER
// ===================================================

function renderTasks() {
  if (!selectedMemberId) return;

  const myTasks = tasksData.filter(t => t.memberId === selectedMemberId);

  const activeTasks = myTasks.filter(t => t.status === 'Active');
  const pendingTasks = myTasks.filter(t => t.status === 'Pending');
  const completedTasks = myTasks.filter(t => t.status === 'Completed');

  // Update count indicators
  if (taskCountActive) taskCountActive.textContent = activeTasks.length;
  if (taskCountPending) taskCountPending.textContent = pendingTasks.length;
  if (taskCountCompleted) taskCountCompleted.textContent = completedTasks.length;

  // Render Active tasks
  if (tasksActiveContainer) {
    tasksActiveContainer.innerHTML = '';
    if (activeTasks.length === 0) {
      tasksActiveContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No active tasks. Start/resume a task below.</div>`;
    } else {
      activeTasks.forEach(task => {
        const div = createTaskCard(task);
        tasksActiveContainer.appendChild(div);
      });
    }
  }

  // Render Pending tasks
  if (tasksPendingContainer) {
    tasksPendingContainer.innerHTML = '';
    if (pendingTasks.length === 0) {
      tasksPendingContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No pending tasks.</div>`;
    } else {
      pendingTasks.forEach(task => {
        const div = createTaskCard(task);
        tasksPendingContainer.appendChild(div);
      });
    }
  }

  // Render Completed tasks
  if (tasksCompletedContainer) {
    tasksCompletedContainer.innerHTML = '';
    if (completedTasks.length === 0) {
      tasksCompletedContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No completed tasks today.</div>`;
    } else {
      completedTasks.forEach(task => {
        const div = createTaskCard(task);
        tasksCompletedContainer.appendChild(div);
      });
    }
  }
}

function createTaskCard(task) {
  const div = document.createElement('div');
  div.className = 'glass-panel';
  div.style.padding = '0.85rem';
  div.style.border = '1px solid var(--border-glass)';
  div.style.borderRadius = '10px';
  div.style.background = 'var(--bg-glass)';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.gap = '0.5rem';

  // Category Icon
  let icon = '⚙️';
  if (task.category.includes('Flight')) icon = '✈️';
  else if (task.category.includes('Hotel')) icon = '🏨';
  else if (task.category.includes('Visa')) icon = '📄';
  else if (task.category.includes('Itinerary')) icon = '🗺️';
  else if (task.category.includes('Customer')) icon = '📞';

  // Priority badge styling
  let prioColor = '';
  let prioLabel = task.priority;
  let animationStyle = '';
  if (task.priority === 'URGENT') {
    prioColor = '#ef4444'; // Red
    animationStyle = 'animation: pulse 1.5s infinite;';
  } else if (task.priority === 'HIGH') {
    prioColor = '#f59e0b'; // Amber/Orange
  } else if (task.priority === 'MEDIUM') {
    prioColor = 'var(--brand-cyan)';
  } else {
    prioColor = 'var(--text-muted)';
  }

  const prioBadge = `<span style="background: ${prioColor}; color: white; font-size: 0.65rem; font-weight: 800; padding: 0.15rem 0.45rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; height: 16px; margin-left: 0.25rem; ${animationStyle}">${prioLabel}</span>`;

  // Assigned by badge
  const sourceBadge = task.assignedBy === 'Admin'
    ? `<span style="border: 1px solid var(--brand-blue); color: var(--brand-blue); font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.25rem; display: inline-block;">Assigned by Admin</span>`
    : `<span style="border: 1px solid var(--border-glass); color: var(--text-muted); font-size: 0.65rem; font-weight: 500; padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.25rem; display: inline-block;">Self Assigned</span>`;

  // Duration Info
  let durationHtml = '';
  if (task.status === 'Active') {
    durationHtml = `<div style="font-size: 0.725rem; color: var(--color-working); font-weight: 700;">⏱️ Active: <span class="task-live-timer" data-started-at="${task.lastStartedAt}" data-base-time="${task.timeSpent || 0}">${formatHourMinSec(task.timeSpent || 0)}</span></div>`;
  } else if (task.status === 'Pending') {
    durationHtml = `<div style="font-size: 0.725rem; color: var(--text-muted);">⏱️ Paused: <span>${formatHourMinSec(task.timeSpent || 0)}</span></div>`;
  } else {
    durationHtml = `<div style="font-size: 0.725rem; color: var(--text-muted);">⏱️ Completed: <strong>${formatHourMinSec(task.timeSpent || 0)}</strong></div>`;
  }

  // Action Buttons based on status
  let actionsHtml = '';
  if (task.status === 'Active') {
    actionsHtml = `
      <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
        <button class="btn-primary pause-task-btn" data-id="${task.id}" style="background: #f59e0b; padding: 0.35rem 0.65rem; font-size: 0.725rem; font-weight: 700; border-radius: 6px;">Pause</button>
        <button class="btn-primary finish-task-btn" data-id="${task.id}" style="background: var(--color-working); padding: 0.35rem 0.65rem; font-size: 0.725rem; font-weight: 700; border-radius: 6px;">Finish</button>
      </div>
    `;
  } else if (task.status === 'Pending') {
    actionsHtml = `
      <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
        <button class="btn-primary start-task-btn" data-id="${task.id}" style="padding: 0.35rem 0.65rem; font-size: 0.725rem; font-weight: 700; border-radius: 6px;">Resume</button>
        <button class="btn-primary finish-task-btn" data-id="${task.id}" style="background: var(--color-working); padding: 0.35rem 0.65rem; font-size: 0.725rem; font-weight: 700; border-radius: 6px;">Finish</button>
      </div>
    `;
  } else {
    actionsHtml = `
      <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
        <button class="btn-primary start-task-btn" data-id="${task.id}" style="padding: 0.35rem 0.65rem; font-size: 0.725rem; font-weight: 700; border-radius: 6px;">Reopen & Resume</button>
      </div>
    `;
  }

  div.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 1px dotted var(--border-glass); padding-bottom: 0.35rem;">
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">
        <span>${icon} ${task.category}</span>
        ${prioBadge}
      </div>
      ${sourceBadge}
    </div>
    <div style="font-size: 0.775rem; color: var(--text-secondary); line-height: 1.3;">
      "${task.description}"
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.2rem; flex-wrap: wrap; gap: 0.5rem;">
      ${durationHtml}
      ${actionsHtml}
    </div>
  `;

  // Bind events to buttons inside the card
  div.querySelectorAll('.start-task-btn').forEach(btn => {
    btn.addEventListener('click', () => startTask(task.id));
  });
  div.querySelectorAll('.pause-task-btn').forEach(btn => {
    btn.addEventListener('click', () => pauseTask(task.id));
  });
  div.querySelectorAll('.finish-task-btn').forEach(btn => {
    btn.addEventListener('click', () => finishTask(task.id));
  });

  return div;
}

function initTaskTabs() {
  if (!taskTabActive || !taskTabPending || !taskTabCompleted) return;

  function setTab(activeTabBtn, showContainer, hideContainer1, hideContainer2, activeColor) {
    [taskTabActive, taskTabPending, taskTabCompleted].forEach(btn => {
      btn.classList.remove('active');
      btn.style.color = 'var(--text-secondary)';
      btn.style.fontWeight = '600';
    });
    activeTabBtn.classList.add('active');
    activeTabBtn.style.color = activeColor;
    activeTabBtn.style.fontWeight = '700';

    showContainer.style.display = 'flex';
    hideContainer1.style.display = 'none';
    hideContainer2.style.display = 'none';
  }

  taskTabActive.addEventListener('click', () => {
    setTab(taskTabActive, tasksActiveContainer, tasksPendingContainer, tasksCompletedContainer, 'var(--brand-cyan)');
  });
  taskTabPending.addEventListener('click', () => {
    setTab(taskTabPending, tasksPendingContainer, tasksActiveContainer, tasksCompletedContainer, 'var(--brand-cyan)');
  });
  taskTabCompleted.addEventListener('click', () => {
    setTab(taskTabCompleted, tasksCompletedContainer, tasksActiveContainer, tasksPendingContainer, 'var(--brand-cyan)');
  });
}

function addTask() {
  if (!selectedMemberId) return;

  const desc = taskDescription.value.trim();
  const cat = taskCategory.value;
  const prio = taskPriority.value;

  if (!desc) {
    alert("Please enter a task description.");
    taskDescription.focus();
    return;
  }

  // Check if clocked in
  const isClockedIn = attendanceData.some(att => att.memberId === selectedMemberId && att.logoutTime === null);
  if (!isClockedIn) {
    alert("Please check in (Office In) first before adding tasks.");
    return;
  }

  fetch('/api/tasks/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberId: selectedMemberId,
      category: cat,
      description: desc,
      priority: prio,
      assignedBy: 'Self'
    })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to create task");
    return res.json();
  })
  .then(data => {
    taskDescription.value = '';
    // Switch to pending tab
    taskTabPending.click();
  })
  .catch(err => {
    alert("Error adding task: " + err.message);
  });
}

function startTask(taskId) {
  fetch('/api/tasks/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to start/resume task");
    return res.json();
  })
  .then(data => {
    taskTabActive.click();
  })
  .catch(err => {
    alert("Error resuming task: " + err.message);
  });
}

function pauseTask(taskId) {
  fetch('/api/tasks/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to pause task");
    return res.json();
  })
  .then(data => {
    taskTabPending.click();
  })
  .catch(err => {
    alert("Error pausing task: " + err.message);
  });
}

function finishTask(taskId) {
  fetch('/api/tasks/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to complete task");
    return res.json();
  })
  .then(data => {
    taskTabCompleted.click();
  })
  .catch(err => {
    alert("Error completing task: " + err.message);
  });
}

// Active tasks live ticking loop & real-time stats update
setInterval(() => {
  document.querySelectorAll('.task-live-timer').forEach(el => {
    const startedAt = el.getAttribute('data-started-at');
    const baseTime = parseInt(el.getAttribute('data-base-time') || '0', 10);
    if (startedAt) {
      const elapsedSec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const totalSec = Math.max(0, baseTime + elapsedSec);
      el.textContent = formatHourMinSec(totalSec);
    }
  });

  // Ticking daily stats in real-time
  if (selectedMemberId) {
    const currentMember = teamMembers.find(m => m.id === selectedMemberId);
    if (currentMember) {
      renderPersonalStats(currentMember);
    }
  }
}, 1000);

function formatHourMinSec(totalSecs) {
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

// Initialize listeners
initRequestFormToggles();
initTaskTabs();

if (submitReqBtn) {
  submitReqBtn.addEventListener('click', submitHrRequest);
}
if (updateProfileBtn) {
  updateProfileBtn.addEventListener('click', submitProfileUpdate);
}
if (addTaskBtn) {
  addTaskBtn.addEventListener('click', addTask);
}
if (attActionBtn) {
  attActionBtn.addEventListener('click', () => {
    const isClockedIn = attendanceData.some(att => att.memberId === selectedMemberId && att.logoutTime === null);
    if (isClockedIn) {
      triggerOfficeOutFlow();
    } else {
      triggerOfficeInFlow();
    }
  });
}

if (headerLogoutBtn) {
  headerLogoutBtn.addEventListener('click', () => {
    const isClockedIn = attendanceData.some(att => att.memberId === selectedMemberId && att.logoutTime === null);
    if (isClockedIn) {
      alert("You are currently clocked in. Please clock out (Office Out) before logging out.");
      return;
    }
    
    if (confirm("Are you sure you want to log out and lock this workspace?")) {
      sessionStorage.removeItem('team_member_unlocked_' + selectedMemberId);
      localStorage.removeItem('selectedTeamMemberId');
      selectedMemberId = '';
      teamSelect.disabled = false;
      teamSelect.value = '';
      headerLogoutBtn.style.display = 'none';
      portalActions.style.display = 'none';
      if (workspaceCard) workspaceCard.classList.remove('dashboard-active');
      if (mainContainer) mainContainer.classList.remove('dashboard-active');
      if (profileSelectContainer) profileSelectContainer.style.display = 'block';
      financialsUnlocked = false; // Reset lock state
    }
  });
}

function triggerFinancialsUnlock() {
  if (financialsUnlocked) return; // Already unlocked

  pendingMemberId = selectedMemberId;
  pinPurpose = 'view_financials';
  
  // Update modal text for financials unlock
  document.getElementById('pin-modal-title').textContent = "Security Check";
  document.getElementById('pin-modal-desc').textContent = "Please enter your 4-digit PIN to view sensitive details.";
  
  pinModal.style.display = 'flex';
  pinInput.value = '';
  pinErrorMsg.style.display = 'none';
  pinInput.focus();
}

if (profileDisplaySalary) {
  profileDisplaySalary.addEventListener('click', triggerFinancialsUnlock);
  profileDisplaySalary.style.cursor = 'pointer';
  profileDisplaySalary.title = "Click to view Base Salary (PIN required)";
}
if (profileDisplayAdvance) {
  profileDisplayAdvance.addEventListener('click', triggerFinancialsUnlock);
  profileDisplayAdvance.style.cursor = 'pointer';
  profileDisplayAdvance.title = "Click to view Outstanding Advance (PIN required)";
}

// ===================================================
// PORTAL NAVIGATION & TAB SWITCHER SYSTEM
// ===================================================
function initPortalTabs() {
  const tabBtnWorkspace = document.getElementById('tab-btn-workspace');
  const tabBtnAttendance = document.getElementById('tab-btn-attendance');
  const tabBtnRequests = document.getElementById('tab-btn-requests');
  const tabBtnNotifications = document.getElementById('tab-btn-notifications');

  const viewWorkspace = document.getElementById('view-workspace');
  const viewAttendance = document.getElementById('view-attendance');
  const viewRequests = document.getElementById('view-requests');
  const viewNotifications = document.getElementById('view-notifications');

  if (!tabBtnWorkspace || !viewWorkspace) return;

  function switchTab(activeBtn, showView) {
    [viewWorkspace, viewAttendance, viewRequests, viewNotifications].forEach(v => {
      if (v) v.style.display = 'none';
    });
    [tabBtnWorkspace, tabBtnAttendance, tabBtnRequests, tabBtnNotifications].forEach(b => {
      if (b) {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
        b.style.fontWeight = '600';
        b.style.boxShadow = 'none';
      }
    });

    activeBtn.classList.add('active');
    activeBtn.style.background = 'var(--grad-brand)';
    activeBtn.style.color = 'white';
    activeBtn.style.fontWeight = '700';
    activeBtn.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.15)';
    showView.style.display = 'block';
  }

  tabBtnWorkspace.addEventListener('click', () => switchTab(tabBtnWorkspace, viewWorkspace));
  tabBtnAttendance.addEventListener('click', () => switchTab(tabBtnAttendance, viewAttendance));
  tabBtnRequests.addEventListener('click', () => switchTab(tabBtnRequests, viewRequests));
  
  tabBtnNotifications.addEventListener('click', () => {
    switchTab(tabBtnNotifications, viewNotifications);
    
    // Mark notifications as read when tab is selected
    const myLogs = logsData.filter(log => log.employeeId === selectedMemberId);
    if (myLogs.length > 0) {
      const latestTimestamp = myLogs.reduce((max, log) => new Date(log.timestamp) > new Date(max) ? log.timestamp : max, '1970-01-01T00:00:00.000Z');
      lastReadLogsTimestamp = latestTimestamp;
    } else {
      lastReadLogsTimestamp = new Date().toISOString();
    }
    localStorage.setItem('lastReadLogsTimestamp_' + selectedMemberId, lastReadLogsTimestamp);
    renderNotificationsFeed();
    updateNotificationBadge();
  });
}

initPortalTabs();

// ===================================================
// LEDGER, CALENDAR, NOTIFICATIONS & TOAST SERVICES
// ===================================================

function renderLedgerLog(member) {
  const tbody = document.getElementById('personal-ledger-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  const ledger = member.ledger || [];

  if (ledger.length === 0) {
    tbody.innerHTML = `
      <tr style="border-bottom: 1px solid var(--border-glass);">
        <td colspan="4" style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 1.5rem 0;">No ledger transactions recorded.</td>
      </tr>
    `;
    return;
  }

  ledger.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    tr.style.color = 'var(--text-secondary)';

    const dateStr = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    
    let typeBadge = '';
    let amountColor = '';
    let amountPrefix = '';

    if (item.type === 'Salary Payout') {
      typeBadge = `<span style="font-weight: 700; color: var(--color-working);">💼 Salary</span>`;
      amountColor = 'var(--color-working)';
      amountPrefix = '+';
    } else if (item.type === 'Advance Paid') {
      typeBadge = `<span style="font-weight: 700; color: #f59e0b;">💵 Advance Paid</span>`;
      amountColor = '#f59e0b';
      amountPrefix = '+';
    } else if (item.type === 'Advance Deduction') {
      typeBadge = `<span style="font-weight: 700; color: #ef4444;">📉 Advance Ded.</span>`;
      amountColor = '#ef4444';
      amountPrefix = '-';
    } else {
      typeBadge = `<span style="font-weight: 700; color: var(--text-primary);">${item.type}</span>`;
      amountColor = 'var(--text-primary)';
      amountPrefix = '';
    }

    tr.innerHTML = `
      <td style="padding: 0.6rem 0.25rem;">${dateStr}</td>
      <td style="padding: 0.6rem 0.25rem;">${typeBadge}</td>
      <td style="padding: 0.6rem 0.25rem; font-weight: 700; color: ${amountColor};">${amountPrefix}₹${item.amount.toLocaleString()}.00</td>
      <td style="padding: 0.6rem 0.25rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.notes || ''}">${item.notes || '--'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function initPersonalCalendarMonth() {
  const select = document.getElementById('personal-calendar-month');
  if (!select) return;
  if (select.children.length > 0) return;

  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opt.textContent = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    select.appendChild(opt);
  }

  select.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  select.addEventListener('change', () => {
    renderPersonalCalendar(select.value);
  });
}

function renderPersonalCalendar(monthString) {
  const container = document.getElementById('personal-calendar-grid-wrapper');
  if (!container) return;

  const [year, month] = monthString.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  let html = `<div class="personal-calendar-grid">`;
  
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  daysOfWeek.forEach(day => {
    html += `<div class="calendar-header-cell">${day}</div>`;
  });

  for (let i = 0; i < startDayOfWeek; i++) {
    html += `<div class="calendar-day-cell other-month"></div>`;
  }

  const todayStr = getLocalDateString();

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDayDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = currentDayDateStr === todayStr;
    const cellClass = isToday ? 'calendar-day-cell today' : 'calendar-day-cell';

    const dayAttendance = attendanceData.filter(att => att.memberId === selectedMemberId && att.date === currentDayDateStr);
    
    const leaveRequests = hrRequests.filter(req => {
      if (req.memberId !== selectedMemberId || req.type !== 'Leave' || req.status === 'Rejected') return false;
      const start = req.details.startDate;
      const end = req.details.endDate;
      return currentDayDateStr >= start && currentDayDateStr <= end;
    });

    let statusSymbol = '—';
    let statusClass = 'off-duty';
    let tooltip = `${day} ${firstDay.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})} - Off Duty`;

    if (dayAttendance.length > 0) {
      const approvedAtt = dayAttendance.find(att => att.approvalStatus === 'Approved');
      const pendingAtt = dayAttendance.find(att => att.approvalStatus === 'Pending');

      if (approvedAtt) {
        statusSymbol = 'P';
        statusClass = 'present';
        const inTime = formatClockTime(approvedAtt.loginTime);
        const outTime = approvedAtt.logoutTime ? formatClockTime(approvedAtt.logoutTime) : 'Active';
        tooltip = `Present\nIn: ${inTime}\nOut: ${outTime}`;
      } else if (pendingAtt) {
        statusSymbol = '⏳';
        statusClass = 'pending';
        tooltip = `Pending Approval\nChecked in at: ${formatClockTime(pendingAtt.loginTime)}`;
      }
    } else if (leaveRequests.length > 0) {
      const approvedLeave = leaveRequests.find(req => req.status === 'Approved');
      const pendingLeave = leaveRequests.find(req => req.status === 'Pending');

      if (approvedLeave) {
        statusSymbol = 'L';
        statusClass = 'on-leave';
        tooltip = `On Leave (Approved)\nReason: ${approvedLeave.details.reason}`;
      } else if (pendingLeave) {
        statusSymbol = '⏳';
        statusClass = 'pending';
        tooltip = `Leave Requested (Pending Approval)\nReason: ${pendingLeave.details.reason}`;
      }
    } else {
      const dayDate = new Date(year, month - 1, day);
      const todayDate = new Date();
      todayDate.setHours(0,0,0,0);
      if (dayDate < todayDate) {
        statusSymbol = 'A';
        statusClass = 'absent';
        tooltip = `Absent`;
      }
    }

    html += `
      <div class="${cellClass}" title="${tooltip}">
        <span class="calendar-day-number">${day}</span>
        <span class="calendar-day-status ${statusClass}">${statusSymbol}</span>
      </div>
    `;
  }

  const totalCellsSoFar = startDayOfWeek + daysInMonth;
  const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    html += `<div class="calendar-day-cell other-month"></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderNotificationsFeed() {
  const container = document.getElementById('notifications-feed-container');
  if (!container) return;

  const myLogs = logsData.filter(log => log.employeeId === selectedMemberId);
  container.innerHTML = '';

  if (myLogs.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center; padding: 2rem 0;">No notifications.</div>`;
    return;
  }

  myLogs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'glass-panel';
    div.style.padding = '0.75rem 1rem';
    div.style.border = '1px solid var(--border-glass)';
    div.style.borderRadius = '8px';
    div.style.fontSize = '0.8rem';
    div.style.background = 'var(--bg-glass)';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '0.2rem';

    const isUnread = new Date(log.timestamp) > new Date(lastReadLogsTimestamp);
    if (isUnread) {
      div.style.borderLeft = '3px solid var(--brand-cyan)';
      div.style.background = 'rgba(8, 145, 178, 0.03)';
    }

    const timeStr = new Date(log.timestamp).toLocaleString();
    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">
        <span>🔔 Alert</span>
        <span>${timeStr}</span>
      </div>
      <div style="color: var(--text-primary); font-weight: 600; line-height: 1.4;">
        ${log.action}
      </div>
    `;
    container.appendChild(div);
  });
}

function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;

  const myLogs = logsData.filter(log => log.employeeId === selectedMemberId);
  const unreadCount = myLogs.filter(log => new Date(log.timestamp) > new Date(lastReadLogsTimestamp)).length;

  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

const clearNotificationsBtn = document.getElementById('clear-notifications-btn');
if (clearNotificationsBtn) {
  clearNotificationsBtn.addEventListener('click', () => {
    const myLogs = logsData.filter(log => log.employeeId === selectedMemberId);
    if (myLogs.length > 0) {
      const latestTimestamp = myLogs.reduce((max, log) => new Date(log.timestamp) > new Date(max) ? log.timestamp : max, '1970-01-01T00:00:00.000Z');
      lastReadLogsTimestamp = latestTimestamp;
    } else {
      lastReadLogsTimestamp = new Date().toISOString();
    }
    localStorage.setItem('lastReadLogsTimestamp_' + selectedMemberId, lastReadLogsTimestamp);
    renderNotificationsFeed();
    updateNotificationBadge();
  });
}

function checkNewLogsForToasts(newLogs) {
  const myLogs = newLogs.filter(log => log.employeeId === selectedMemberId);
  if (myLogs.length === 0) return;

  const sortedLogs = [...myLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (!lastProcessedLogTimestamp) {
    lastProcessedLogTimestamp = sortedLogs[sortedLogs.length - 1].timestamp;
    return;
  }

  sortedLogs.forEach(log => {
    if (new Date(log.timestamp) > new Date(lastProcessedLogTimestamp)) {
      showToast(log.action);
    }
  });

  lastProcessedLogTimestamp = sortedLogs[sortedLogs.length - 1].timestamp;
}

function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-msg success';
  
  let icon = '🔔';
  if (message.includes('Approved') || message.includes('approved')) {
    toast.className = 'toast-msg success';
    icon = '✅';
  } else if (message.includes('Rejected') || message.includes('rejected')) {
    toast.className = 'toast-msg danger';
    icon = '❌';
  } else if (message.includes('Recorded') || message.includes('transaction') || message.includes('Payment') || message.includes('Salary')) {
    toast.className = 'toast-msg success';
    icon = '💰';
  } else if (message.includes('Leave') || message.includes('leave')) {
    toast.className = 'toast-msg warning';
    icon = '🌴';
  }

  toast.innerHTML = `
    <div style="font-size: 1.25rem;">${icon}</div>
    <div style="flex: 1; line-height: 1.3;">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 5000);
}

// Start WebSocket connection
initWebSocket();
