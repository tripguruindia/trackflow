let socket = null;
let employees = [];
let logs = [];
let attendanceData = [];
let productivityData = {};
let hrRequests = [];
let querySessions = [];
let tasksData = [];

// ChartJS Instances
let teamChart = null;
let memberChart = null;
let selectedChartMemberId = '';

// DOM Elements
const statusGrid = document.getElementById('status-grid');
const logList = document.getElementById('log-list');
const managementList = document.getElementById('management-list');
const liveIndicator = document.getElementById('live-indicator');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statWorking = document.getElementById('stat-working');
const statIdle = document.getElementById('stat-idle');
const statBreak = document.getElementById('stat-break');

// Admin Elements
const newTeamName = document.getElementById('new-team-name');
const newTeamPin = document.getElementById('new-team-pin');
const addTeamBtn = document.getElementById('add-team-btn');

// View Tabs Elements
const tabLive = document.getElementById('tab-live');
const tabAnalytics = document.getElementById('tab-analytics');
const tabHr = document.getElementById('tab-hr');
const viewLive = document.getElementById('view-live');
const viewAnalytics = document.getElementById('view-analytics');
const viewHr = document.getElementById('view-hr');
const chartMemberSelect = document.getElementById('chart-member-select');
const attendanceTbody = document.getElementById('attendance-tbody');
const querySessionsTbody = document.getElementById('query-sessions-tbody');

// Attendance Modal Elements
const attendanceModal = document.getElementById('attendance-modal');
const attendanceModalClose = document.getElementById('attendance-modal-close');
const attendanceModalTitle = document.getElementById('attendance-modal-title');
const editAttId = document.getElementById('edit-att-id');
const editAttDate = document.getElementById('edit-att-date');
const editAttLogin = document.getElementById('edit-att-login');
const editAttLogout = document.getElementById('edit-att-logout');
const editAttActive = document.getElementById('edit-att-active');
const attendanceEditSaveBtn = document.getElementById('attendance-edit-save-btn');

// Pending Attendance Log Elements
const pendingAttendanceCard = document.getElementById('pending-attendance-card');
const pendingAttendanceTbody = document.getElementById('pending-attendance-tbody');

// HR Directory & Request Elements
const hrDirectoryGrid = document.getElementById('hr-directory-grid');
const hrRequestsList = document.getElementById('hr-requests-list');

// HR Details Modal Elements
const hrModal = document.getElementById('hr-modal');
const hrModalClose = document.getElementById('hr-modal-close');
const hrModalTitle = document.getElementById('hr-modal-title');
const hrEditId = document.getElementById('hr-edit-id');
const hrEditName = document.getElementById('hr-edit-name');
const hrEditPhone = document.getElementById('hr-edit-phone');
const hrEditEmail = document.getElementById('hr-edit-email');
const hrEditAddress = document.getElementById('hr-edit-address');
const hrEditIdType = document.getElementById('hr-edit-idtype');
const hrEditIdNumber = document.getElementById('hr-edit-idnumber');
const hrEditSalary = document.getElementById('hr-edit-salary');
const hrEditPin = document.getElementById('hr-edit-pin');
const hrEditSaveBtn = document.getElementById('hr-edit-save-btn');

// HR Payout / Transaction Elements
const hrPayType = document.getElementById('hr-pay-type');
const hrPayAmount = document.getElementById('hr-pay-amount');
const hrPayNotes = document.getElementById('hr-pay-notes');
const hrPayRecordBtn = document.getElementById('hr-pay-record-btn');
const hrLedgerHistory = document.getElementById('hr-ledger-history');

// Dashboard Assign Task Elements
const assignTaskMember = document.getElementById('assign-task-member');
const assignTaskCategory = document.getElementById('assign-task-category');
const assignTaskPriority = document.getElementById('assign-task-priority');
const assignTaskDescription = document.getElementById('assign-task-description');
const assignTaskBtn = document.getElementById('assign-task-btn');

// Attendance Register Elements
const registerMonthSelect = document.getElementById('register-month-select');
const registerTable = document.getElementById('register-table');
const pastAttMember = document.getElementById('past-att-member');
const pastAttDate = document.getElementById('past-att-date');
const pastAttLogin = document.getElementById('past-att-login');
const pastAttLogout = document.getElementById('past-att-logout');
const pastAttSubmitBtn = document.getElementById('past-att-submit-btn');

// Initialize WebSockets Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Connected to WebSocket server');
    liveIndicator.textContent = '● Connected';
    liveIndicator.style.color = 'var(--color-working)';
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'STATE_UPDATE') {
      employees = message.data.employees;
      logs = message.data.logs;
      attendanceData = message.data.attendance || [];
      productivityData = message.data.productivity || {};
      hrRequests = message.data.requests || [];
      querySessions = message.data.querySessions || [];
      tasksData = message.data.tasks || [];
      
      renderStats();
      renderStatusGrid();
      renderActivityFeed();
      renderManagementList();
      updateAssignTaskMemberSelect();
      
      // Sync charts & tables if current view is analytics
      if (viewAnalytics.style.display === 'block') {
        renderCharts();
        renderAttendanceTable();
        renderPendingAttendanceTable();
        renderQuerySessionsTable();
        renderAttendanceRegister();
        updatePastAttendanceMemberSelect();
      }

      // Sync directory & requests if current view is HR
      if (viewHr.style.display === 'block') {
        renderHrDirectory();
        renderHrRequests();
      }

      // Also refresh the ledger if the detail modal is open!
      const currentOpenModalId = hrEditId.value;
      if (currentOpenModalId && hrModal.style.display === 'flex') {
        const activeEmp = employees.find(e => e.id === currentOpenModalId);
        if (activeEmp) {
          renderLedgerList(activeEmp.ledger || []);
        }
      }
    }
  };

  socket.onclose = () => {
    console.log('WebSocket connection closed. Reconnecting...');
    liveIndicator.textContent = '● Offline (Reconnecting)';
    liveIndicator.style.color = 'var(--color-break)';
    setTimeout(initWebSocket, 3000);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Render Stats counters
function renderStats() {
  const total = employees.length;
  const working = employees.filter(e => e.status === 'Working').length;
  const idle = employees.filter(e => e.status === 'Idle').length;
  const onBreak = employees.filter(e => e.status === 'Break').length;

  statTotal.textContent = total;
  statWorking.textContent = working;
  statIdle.textContent = idle;
  statBreak.textContent = onBreak;
}

// Render Status Grid cards
function renderStatusGrid() {
  statusGrid.innerHTML = '';
  
  if (employees.length === 0) {
    statusGrid.innerHTML = `
      <div class="glass-panel team-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-secondary);">
        No team members configured. Use the "Manage Team" panel to add them.
      </div>
    `;
    return;
  }

  // Sort employees: Working first, then Idle, then Break, then Offline
  const statusOrder = { 'Working': 0, 'Idle': 1, 'Break': 2, 'Offline': 3 };
  const sortedEmployees = [...employees].sort((a, b) => {
    return statusOrder[a.status] - statusOrder[b.status];
  });

  sortedEmployees.forEach(emp => {
    const card = document.createElement('div');
    card.className = `glass-panel team-card status-${emp.status.toLowerCase()}`;
    
    // Header section
    let headerHtml = `
      <div class="card-header">
        <div class="team-info">
          <h2>${emp.name}</h2>
          <div class="time-ago">Active: ${formatRelativeTime(emp.lastUpdated)}</div>
        </div>
        <div class="status-badge">
          <span class="status-dot"></span>
          ${getStatusLabel(emp.status)}
        </div>
      </div>
    `;

    // Body section (Task/Query details)
    let bodyHtml = '<div class="card-body">';
    if (emp.status === 'Working') {
      const activeTasks = (tasksData || []).filter(t => t.memberId === emp.id && t.status === 'Active');
      if (activeTasks.length > 0) {
        if (activeTasks.length === 1) {
          const task = activeTasks[0];
          bodyHtml += `
            <div class="task-container">
              <div class="task-label">Active Task</div>
              <div class="task-category">${task.category}</div>
              <div class="task-desc">"${task.description}"</div>
            </div>
            <div class="card-footer">
              <div class="elapsed-time active">
                ⏳ <span class="live-timer" data-started-at="${task.lastStartedAt}">${formatDuration(task.lastStartedAt)}</span>
              </div>
              <div class="time-ago">Started ${formatClockTime(task.lastStartedAt)}</div>
            </div>
          `;
        } else {
          const categories = activeTasks.map(t => t.category).join(', ');
          const descriptions = activeTasks.map(t => t.description).join('; ');
          const earliestStartedAt = activeTasks.reduce((earliest, task) => {
            if (!earliest || new Date(task.lastStartedAt) < new Date(earliest)) {
              return task.lastStartedAt;
            }
            return earliest;
          }, null) || new Date().toISOString();

          bodyHtml += `
            <div class="task-container">
              <div class="task-label">Active Tasks (${activeTasks.length})</div>
              <div class="task-category" style="color: var(--brand-cyan); font-weight: 700;">Working on: ${categories}</div>
              <div class="task-desc">"${descriptions}"</div>
            </div>
            <div class="card-footer">
              <div class="elapsed-time active">
                ⏳ <span class="live-timer" data-started-at="${earliestStartedAt}">${formatDuration(earliestStartedAt)}</span>
              </div>
              <div class="time-ago">Started ${formatClockTime(earliestStartedAt)}</div>
            </div>
          `;
        }
      } else if (emp.currentTask) {
        bodyHtml += `
          <div class="task-container">
            <div class="task-label">Active Query</div>
            <div class="task-category">${emp.currentTask.category}</div>
            <div class="task-desc">${emp.currentTask.description ? `"${emp.currentTask.description}"` : ''}</div>
          </div>
          <div class="card-footer">
            <div class="elapsed-time active">
              ⏳ <span class="live-timer" data-started-at="${emp.currentTask.startedAt}">${formatDuration(emp.currentTask.startedAt)}</span>
            </div>
            <div class="time-ago">Started ${formatClockTime(emp.currentTask.startedAt)}</div>
          </div>
        `;
      } else {
        bodyHtml += `
          <div class="task-container" style="border-style: dashed; background: transparent;">
            <div class="task-desc" style="color: var(--text-muted); font-style: italic;">
              Working...
            </div>
          </div>
          <div class="card-footer">
            <div class="elapsed-time inactive">--:--</div>
            <div class="time-ago">Offline</div>
          </div>
        `;
      }
    } else {
      let msg = '';
      if (emp.status === 'Idle') msg = 'Waiting for query / task assignments';
      else if (emp.status === 'Break') msg = 'Temporarily away on break';
      else msg = 'Off duty / Sign out';

      bodyHtml += `
        <div class="task-container" style="border-style: dashed; background: transparent;">
          <div class="task-desc" style="color: var(--text-muted); font-style: italic;">
            ${msg}
          </div>
        </div>
        <div class="card-footer">
          <div class="elapsed-time inactive">--:--</div>
          <div class="time-ago">Offline</div>
        </div>
      `;
    }
    bodyHtml += '</div>';

    card.innerHTML = headerHtml + bodyHtml;
    statusGrid.appendChild(card);
  });
}

// Render Activity Feed
function renderActivityFeed() {
  logList.innerHTML = '';
  
  if (logs.length === 0) {
    logList.innerHTML = '<div style="color: var(--text-muted); font-style: italic; padding: 1rem;">No recent activities logged.</div>';
    return;
  }

  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `
      <div class="log-meta">
        <span class="log-name">${log.employeeName}</span>
        <span class="log-time">${formatClockTime(log.timestamp)}</span>
      </div>
      <div class="log-action">${log.action}</div>
    `;
    logList.appendChild(item);
  });
}

// Render Team management configuration panel
function renderManagementList() {
  managementList.innerHTML = '';
  
  employees.forEach(emp => {
    const item = document.createElement('div');
    item.className = 'management-item';
    item.innerHTML = `
      <span>${emp.name} <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 500;">(PIN: ${emp.pin || 'None'})</span></span>
      <button class="btn-danger" data-id="${emp.id}">Remove</button>
    `;
    managementList.appendChild(item);
  });

  // Attach delete listeners
  managementList.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      removeTeamMember(id);
    });
  });
}

// Add team member API Call
addTeamBtn.addEventListener('click', addTeamMember);
newTeamName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addTeamMember();
});
newTeamPin.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addTeamMember();
});

function addTeamMember() {
  const name = newTeamName.value.trim();
  const pin = newTeamPin.value.trim();
  
  if (!name) {
    alert("Please enter a name.");
    newTeamName.focus();
    return;
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    alert("Please enter a 4-digit numeric PIN.");
    newTeamPin.focus();
    return;
  }

  fetch('/api/employees/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(data => { throw new Error(data.error); });
    }
    return res.json();
  })
  .then(() => {
    newTeamName.value = '';
    newTeamPin.value = '';
  })
  .catch(err => {
    alert('Error: ' + err.message);
    console.error('Error adding team member:', err);
  });
}

// Remove team member API Call
function removeTeamMember(id) {
  if (!confirm('Are you sure you want to remove this team member profile? Their current active tracking will be deleted.')) {
    return;
  }

  fetch('/api/employees/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  .catch(err => console.error('Error removing team member:', err));
}

// ===================================================
// ANALYTICS & ATTENDANCE RENDERING FUNCTIONS
// ===================================================

// Render Daily Attendance Log Table
function renderAttendanceTable() {
  attendanceTbody.innerHTML = '';
  
  let approvedAttendance = attendanceData.filter(att => att.approvalStatus === 'Approved');

  // Apply Date Filter if set
  const dateFilterInput = document.getElementById('attendance-date-filter');
  const filterDateVal = dateFilterInput ? dateFilterInput.value : '';
  if (filterDateVal) {
    approvedAttendance = approvedAttendance.filter(att => att.date === filterDateVal);
  }

  if (approvedAttendance.length === 0) {
    const msg = filterDateVal ? `No attendance logged for ${filterDateVal}.` : 'No attendance logged today.';
    attendanceTbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">${msg}</td>
      </tr>
    `;
    return;
  }

  // Sort logs by login time (most recent first)
  const sortedAttendance = [...approvedAttendance].sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

  sortedAttendance.forEach(att => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    
    const loginStr = formatClockTime(att.loginTime);
    const logoutStr = att.logoutTime ? formatClockTime(att.logoutTime) : '--:--';
    
    let durationStr = '';
    if (att.logoutTime) {
      const durSec = Math.floor((new Date(att.logoutTime) - new Date(att.loginTime)) / 1000);
      durationStr = formatHourMinSec(durSec);
    } else {
      const durSec = Math.floor((Date.now() - new Date(att.loginTime)) / 1000);
      durationStr = `<span class="live-duration-timer" data-login-time="${att.loginTime}">${formatHourMinSec(durSec)}</span>`;
    }

    const statusBadge = att.logoutTime 
      ? '<span class="status-badge" style="background: rgba(100,116,139,0.08); color: var(--text-muted); display: inline-flex;">Offline</span>'
      : '<span class="status-badge status-working" style="display: inline-flex;"><span class="status-dot"></span>Active</span>';

    tr.innerHTML = `
      <td style="padding: 1rem 0.75rem; font-weight: 600;">${att.memberName}</td>
      <td style="padding: 1rem 0.75rem;">${att.date}</td>
      <td style="padding: 1rem 0.75rem;">${loginStr}</td>
      <td style="padding: 1rem 0.75rem;">${logoutStr}</td>
      <td style="padding: 1rem 0.75rem;">${durationStr}</td>
      <td style="padding: 1rem 0.75rem;">${statusBadge}</td>
      <td style="padding: 1rem 0.75rem; text-align: right; white-space: nowrap;">
        <button class="btn-primary edit-att-btn" data-id="${att.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-radius: 6px; margin-right: 0.25rem;">Edit</button>
        <button class="btn-danger delete-att-btn" data-id="${att.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-radius: 6px;">Delete</button>
      </td>
    `;
    attendanceTbody.appendChild(tr);
  });

  // Attach edit & delete click listeners for approved logs
  attendanceTbody.querySelectorAll('.edit-att-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openAttendanceModal(id);
    });
  });
  attendanceTbody.querySelectorAll('.delete-att-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deleteAttendanceRecord(id);
    });
  });
}

// Render Completed Query Sessions Log Table
function renderQuerySessionsTable() {
  querySessionsTbody.innerHTML = '';

  if (!querySessions || querySessions.length === 0) {
    querySessionsTbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted); font-style: italic;">No query sessions logged.</td>
      </tr>
    `;
    return;
  }

  // Sort sessions by startedAt (most recent first)
  const sortedSessions = [...querySessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  sortedSessions.forEach(qs => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';

    const startStr = formatClockTime(qs.startedAt);
    const endStr = qs.endedAt ? formatClockTime(qs.endedAt) : '--:--';
    const durationStr = formatHourMinSec(qs.duration);

    tr.innerHTML = `
      <td style="padding: 1rem 0.75rem; font-weight: 600;">${qs.memberName}</td>
      <td style="padding: 1rem 0.75rem;">
        <span class="status-badge" style="background: rgba(8, 145, 178, 0.08); color: var(--brand-cyan); font-weight: 600;">${qs.category}</span>
      </td>
      <td style="padding: 1rem 0.75rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${qs.description}">
        ${qs.description}
      </td>
      <td style="padding: 1rem 0.75rem;">${startStr}</td>
      <td style="padding: 1rem 0.75rem;">${endStr}</td>
      <td style="padding: 1rem 0.75rem; font-weight: 600; color: var(--color-working);">${durationStr}</td>
      <td style="padding: 1rem 0.75rem; text-align: right;">
        <button class="btn-danger delete-qs-btn" data-id="${qs.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: 6px;">Delete</button>
      </td>
    `;
    querySessionsTbody.appendChild(tr);
  });

  // Attach delete listeners
  querySessionsTbody.querySelectorAll('.delete-qs-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteQuerySession(id);
    });
  });
}

// Delete query session with double confirmation
function deleteQuerySession(id) {
  if (confirm("Are you sure you want to delete this query session log?")) {
    if (confirm("Warning: This will permanently delete this record and deduct the time from daily analytics. Proceed?")) {
      fetch('/api/query-sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete query session');
        return res.json();
      })
      .catch(err => {
        alert('Error deleting query session: ' + err.message);
        console.error(err);
      });
    }
  }
}

// Get labels and colors matching current active theme
function getThemeTextColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#94a3b8' : '#475569';
}

function getThemeGridColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(148, 163, 184, 0.15)';
}

// Render Stacked Bar and Doughnut charts
function renderCharts() {
  if (employees.length === 0) return;

  const today = new Date().toISOString().split('T')[0];
  const dayProductivity = productivityData[today] || {};
  const textColor = getThemeTextColor();
  const gridColor = getThemeGridColor();

  // 1. Compile Stacked Bar Chart Data for all Team Members
  const teamLabels = [];
  const teamWorking = [];
  const teamIdle = [];
  const teamBreak = [];

  employees.forEach(emp => {
    teamLabels.push(emp.name);
    
    let workSec = 0;
    let idleSec = 0;
    let breakSec = 0;

    // Load recorded accumulated state durations
    if (dayProductivity[emp.id]) {
      workSec = dayProductivity[emp.id].Working || 0;
      idleSec = dayProductivity[emp.id].Idle || 0;
      breakSec = dayProductivity[emp.id].Break || 0;
    }

    // Add active running session duration if currently online and clocked in (has approved active attendance log)
    const hasActiveSession = attendanceData.some(att => att.memberId === emp.id && att.logoutTime === null && att.approvalStatus === 'Approved');
    if (emp.status !== 'Offline' && hasActiveSession) {
      const elapsedSec = Math.floor((Date.now() - new Date(emp.lastUpdated).getTime()) / 1000);
      if (elapsedSec > 0) {
        if (emp.status === 'Working') workSec += elapsedSec;
        else if (emp.status === 'Idle') idleSec += elapsedSec;
        else if (emp.status === 'Break') breakSec += elapsedSec;
      }
    }

    // Push duration in hours (rounded to 2 decimals)
    teamWorking.push(parseFloat((workSec / 3600).toFixed(2)));
    teamIdle.push(parseFloat((idleSec / 3600).toFixed(2)));
    teamBreak.push(parseFloat((breakSec / 3600).toFixed(2)));
  });

  // Render/Update Team Chart
  const teamCtx = document.getElementById('team-chart').getContext('2d');
  if (teamChart) {
    teamChart.data.labels = teamLabels;
    teamChart.data.datasets[0].data = teamWorking;
    teamChart.data.datasets[1].data = teamIdle;
    teamChart.data.datasets[2].data = teamBreak;
    teamChart.options.scales.x.ticks.color = textColor;
    teamChart.options.scales.y.ticks.color = textColor;
    teamChart.options.scales.x.grid.color = gridColor;
    teamChart.options.scales.y.grid.color = gridColor;
    teamChart.options.plugins.legend.labels.color = textColor;
    teamChart.update();
  } else {
    teamChart = new Chart(teamCtx, {
      type: 'bar',
      data: {
        labels: teamLabels,
        datasets: [
          { label: 'Working (hrs)', data: teamWorking, backgroundColor: '#059669' },
          { label: 'Idle (hrs)', data: teamIdle, backgroundColor: '#0891b2' },
          { label: 'Break (hrs)', data: teamBreak, backgroundColor: '#d97706' }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } },
          y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Outfit' } } }
        },
        plugins: {
          legend: { labels: { color: textColor, font: { family: 'Outfit', weight: '600' } } }
        }
      }
    });
  }

  // 2. Sync Individual Member Select Dropdown Options
  const prevSelectVal = chartMemberSelect.value || selectedChartMemberId;
  chartMemberSelect.innerHTML = '';
  employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name;
    chartMemberSelect.appendChild(opt);
  });

  if (prevSelectVal && employees.some(e => e.id === prevSelectVal)) {
    chartMemberSelect.value = prevSelectVal;
    selectedChartMemberId = prevSelectVal;
  } else if (employees.length > 0) {
    chartMemberSelect.value = employees[0].id;
    selectedChartMemberId = employees[0].id;
  }

  // Compile Doughnut Chart Data for the selected member
  const currentEmp = employees.find(e => e.id === selectedChartMemberId);
  let memberWork = 0;
  let memberIdle = 0;
  let memberBreak = 0;

  if (currentEmp) {
    if (dayProductivity[currentEmp.id]) {
      memberWork = dayProductivity[currentEmp.id].Working || 0;
      memberIdle = dayProductivity[currentEmp.id].Idle || 0;
      memberBreak = dayProductivity[currentEmp.id].Break || 0;
    }
    // Add active running session if currently online and clocked in (has approved active attendance log)
    const hasActiveSession = attendanceData.some(att => att.memberId === currentEmp.id && att.logoutTime === null && att.approvalStatus === 'Approved');
    if (currentEmp.status !== 'Offline' && hasActiveSession) {
      const elapsedSec = Math.floor((Date.now() - new Date(currentEmp.lastUpdated).getTime()) / 1000);
      if (elapsedSec > 0) {
        if (currentEmp.status === 'Working') memberWork += elapsedSec;
        else if (currentEmp.status === 'Idle') memberIdle += elapsedSec;
        else if (currentEmp.status === 'Break') memberBreak += elapsedSec;
      }
    }
  }

  // Convert to minutes for Doughnut
  const workMins = Math.round(memberWork / 60);
  const idleMins = Math.round(memberIdle / 60);
  const breakMins = Math.round(memberBreak / 60);
  const totalMins = workMins + idleMins + breakMins;
  
  const memberData = [workMins, idleMins, breakMins];

  // Render/Update Individual Member Chart
  const memberCtx = document.getElementById('member-chart').getContext('2d');
  const bgPalette = totalMins === 0 
    ? (document.documentElement.getAttribute('data-theme') === 'dark' ? ['#1e293b', '#334155', '#475569'] : ['#e2e8f0', '#cbd5e1', '#94a3b8'])
    : ['#059669', '#0891b2', '#d97706'];

  if (memberChart) {
    memberChart.data.datasets[0].data = memberData;
    memberChart.data.datasets[0].backgroundColor = bgPalette;
    memberChart.options.plugins.legend.labels.color = textColor;
    memberChart.update();
  } else {
    memberChart = new Chart(memberCtx, {
      type: 'doughnut',
      data: {
        labels: ['Working (mins)', 'Idle (mins)', 'Break (mins)'],
        datasets: [{
          data: memberData,
          backgroundColor: bgPalette,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Outfit', weight: '600' } } }
        }
      }
    });
  }
}

// Dropdown change listener to redraw individual doughnut chart
chartMemberSelect.addEventListener('change', (e) => {
  selectedChartMemberId = e.target.value;
  renderCharts();
});

// Reset member stats listener with double confirmation
const resetMemberStatsBtn = document.getElementById('reset-member-stats-btn');
if (resetMemberStatsBtn) {
  resetMemberStatsBtn.addEventListener('click', () => {
    const memberId = chartMemberSelect.value;
    if (!memberId) return;

    const emp = employees.find(e => e.id === memberId);
    const memberName = emp ? emp.name : 'this employee';
    const today = new Date().toISOString().split('T')[0];

    if (confirm(`Are you sure you want to reset ${memberName}'s time metrics for today to zero?`)) {
      if (confirm(`Warning: This will set their working, idle, and break hours for today to zero and delete all of today's query session logs. Proceed?`)) {
        fetch('/api/productivity/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, date: today })
        })
        .then(res => {
          if (!res.ok) throw new Error('Failed to reset member statistics');
          return res.json();
        })
        .catch(err => {
          alert('Error resetting stats: ' + err.message);
          console.error(err);
        });
      }
    }
  });
}

// ===================================================
// TAB SWITCHER CONTROLLER
// ===================================================
function initTabSwitcher() {
  // Pre-initialize date filter on tab switcher setup
  initAttendanceDateFilter();

  const tabs = [
    { btn: tabLive, view: viewLive },
    { btn: tabAnalytics, view: viewAnalytics },
    { btn: tabHr, view: viewHr }
  ];

  tabs.forEach(tab => {
    tab.btn.addEventListener('click', () => {
      tabs.forEach(t => {
        if (t.btn === tab.btn) {
          t.btn.classList.add('active');
          t.btn.style.background = 'var(--grad-brand)';
          t.btn.style.color = 'white';
          t.btn.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.15)';
          t.view.style.display = 'block';
        } else {
          t.btn.classList.remove('active');
          t.btn.style.background = 'transparent';
          t.btn.style.color = 'var(--text-secondary)';
          t.btn.style.boxShadow = 'none';
          t.view.style.display = 'none';
        }
      });

      // Special triggers on tab switch
      if (tab.btn === tabAnalytics) {
        setTimeout(() => {
          renderCharts();
          initAttendanceDateFilter();
          renderAttendanceTable();
          renderPendingAttendanceTable();
          renderQuerySessionsTable();
          initAttendanceRegisterMonthSelect();
          renderAttendanceRegister();
          updatePastAttendanceMemberSelect();
          initPastAttendanceForm();
        }, 50);
      } else if (tab.btn === tabHr) {
        renderHrDirectory();
        renderHrRequests();
      }
    });
  });

  // Initial style setup for the active tab
  tabs.forEach(t => {
    t.btn.style.transition = 'var(--transition-smooth)';
    if (t.btn.classList.contains('active')) {
      t.btn.style.background = 'var(--grad-brand)';
      t.btn.style.color = 'white';
      t.btn.style.boxShadow = '0 4px 12px rgba(8, 145, 178, 0.15)';
    } else {
      t.btn.style.background = 'transparent';
      t.btn.style.color = 'var(--text-secondary)';
      t.btn.style.boxShadow = 'none';
    }
  });
}

// Redraw charts if theme changes (updates label colors)
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
      if (viewAnalytics.style.display === 'block') {
        renderCharts();
      }
    }
  });
});
observer.observe(document.documentElement, { attributes: true });

// ===================================================
// TIMERS AND FORMATTING HELPERS
// ===================================================

// Helper: Format clocks (e.g. "02:15 PM")
function formatClockTime(dateString) {
  const date = new Date(dateString);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours}:${minutes} ${ampm}`;
}

// Helper: Format relative time ("2 mins ago")
function formatRelativeTime(dateString) {
  const start = new Date(dateString).getTime();
  const now = Date.now();
  const diffMs = now - start;
  
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return new Date(dateString).toLocaleDateString();
}

// Helper: Format active task duration (e.g. "12:34")
function formatDuration(startedAt) {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  if (diffMs < 0) return '00:00';
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

// Helper: Format hours, minutes, seconds for duration values
function formatHourMinSec(totalSecs) {
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

// Helper: Translate internal status keywords
function getStatusLabel(status) {
  switch (status) {
    case 'Working': return 'Working';
    case 'Idle': return 'Idle';
    case 'Break': return 'On Break';
    case 'Offline': return 'Offline';
    default: return 'Offline';
  }
}

// Active ticking timer loop
setInterval(() => {
  // Update live card duration timers
  document.querySelectorAll('.live-timer').forEach(el => {
    const startedAt = el.getAttribute('data-started-at');
    if (startedAt) {
      el.textContent = formatDuration(startedAt);
    }
  });

  // Update live attendance table timers
  document.querySelectorAll('.live-duration-timer').forEach(el => {
    const loginTime = el.getAttribute('data-login-time');
    if (loginTime) {
      const elapsedSecs = Math.floor((Date.now() - new Date(loginTime)) / 1000);
      el.textContent = formatHourMinSec(elapsedSecs);
    }
  });

  // Dynamically recalculate and redraw charts in real-time as tasks tick up!
  if (viewAnalytics.style.display === 'block') {
    renderCharts();
  }
}, 1000);

// ===================================================
// HR & PAYROLL MANAGEMENT CONTROLLER
// ===================================================
function renderHrDirectory() {
  hrDirectoryGrid.innerHTML = '';
  if (employees.length === 0) {
    hrDirectoryGrid.innerHTML = `
      <div class="glass-panel team-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-secondary);">
        No team members configured.
      </div>
    `;
    return;
  }

  employees.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'glass-panel team-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '0.75rem';
    card.style.padding = '1.25rem';
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid var(--border-glass); padding-bottom: 0.5rem; margin-bottom: 0.25rem;">
        <div>
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${emp.name}</h2>
          <span style="font-size: 0.725rem; color: var(--text-muted); font-weight: 500;">ID: ${emp.id}</span>
        </div>
        <span class="status-badge" style="background: rgba(8, 145, 178, 0.08); color: var(--brand-cyan); font-weight: 700; display: inline-flex;">PIN: ${emp.pin}</span>
      </div>
      
      <div style="font-size: 0.825rem; display: flex; flex-direction: column; gap: 0.35rem; color: var(--text-secondary);">
        <div>📞 <strong>Phone:</strong> ${emp.phone || '<span style="color:var(--text-muted);font-style:italic;">None</span>'}</div>
        <div>✉️ <strong>Email:</strong> ${emp.email || '<span style="color:var(--text-muted);font-style:italic;">None</span>'}</div>
        <div>🏠 <strong>Address:</strong> ${emp.address ? (emp.address.length > 25 ? emp.address.substring(0, 25) + '...' : emp.address) : '<span style="color:var(--text-muted);font-style:italic;">None</span>'}</div>
        <div>🪪 <strong>ID Document:</strong> ${emp.idType ? `${emp.idType} (${emp.idNumber || 'No No.'})` : '<span style="color:var(--text-muted);font-style:italic;">None</span>'}</div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: var(--card-sub-bg); border: 1px solid var(--card-sub-border); padding: 0.6rem; border-radius: 8px; font-size: 0.825rem; text-align: center; margin-top: 0.25rem;">
        <div>
          <div style="color: var(--text-muted); font-weight: 600; font-size: 0.7rem; text-transform: uppercase;">Salary / Month</div>
          <strong style="color: var(--color-working); font-size: 0.95rem;">₹${emp.salaryPerMonth || 0}</strong>
        </div>
        <div>
          <div style="color: var(--text-muted); font-weight: 600; font-size: 0.7rem; text-transform: uppercase;">Adv. Balance</div>
          <strong style="color: ${emp.advanceBalance > 0 ? 'var(--color-break)' : 'var(--text-muted)'}; font-size: 0.95rem;">₹${emp.advanceBalance || 0}</strong>
        </div>
      </div>

      <button class="btn-primary edit-hr-btn" data-id="${emp.id}" style="padding: 0.5rem; font-size: 0.8rem; font-weight: 600; margin-top: 0.5rem; border-radius: 8px; width: 100%;">View Profile & Ledger</button>
    `;
    hrDirectoryGrid.appendChild(card);
  });

  // Attach button click listeners
  hrDirectoryGrid.querySelectorAll('.edit-hr-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openHrModal(id);
    });
  });
}

function renderHrRequests() {
  hrRequestsList.innerHTML = '';
  const pendingRequests = hrRequests.filter(r => r.status === 'Pending');
  const pastRequests = hrRequests.filter(r => r.status !== 'Pending');

  if (hrRequests.length === 0) {
    hrRequestsList.innerHTML = `<div style="color: var(--text-muted); font-style: italic; text-align: center; padding: 2rem;">No leave or advance requests recorded.</div>`;
    return;
  }

  // Draw Pending Requests section
  if (pendingRequests.length > 0) {
    const pendTitle = document.createElement('h4');
    pendTitle.textContent = `Pending Action (${pendingRequests.length})`;
    pendTitle.style.fontSize = '0.85rem';
    pendTitle.style.fontWeight = '700';
    pendTitle.style.color = 'var(--brand-cyan)';
    pendTitle.style.textTransform = 'uppercase';
    pendTitle.style.marginBottom = '0.75rem';
    hrRequestsList.appendChild(pendTitle);

    pendingRequests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.padding = '1rem';
      card.style.border = '1px solid var(--border-glass)';
      card.style.background = 'var(--card-sub-bg)';
      card.style.borderRadius = '12px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.5rem';

      let detailsHtml = '';
      if (req.type === 'Leave') {
        detailsHtml = `
          <div>🌴 <strong>Leave Request</strong></div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.2rem 0;">📅 <strong>Dates:</strong> ${req.details.startDate} to ${req.details.endDate}</div>
        `;
      } else {
        detailsHtml = `
          <div>💵 <strong>Advance Request</strong></div>
          <div style="font-size: 0.95rem; color: var(--brand-cyan); font-weight: 700; margin: 0.2rem 0;">💰 Amount: ₹${req.amount}</div>
        `;
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; border-bottom: 1px solid var(--border-glass); padding-bottom: 0.4rem; margin-bottom: 0.25rem;">
          <span style="font-weight: 700; color: var(--text-primary);">${req.memberName}</span>
          <span style="font-size: 0.725rem; color: var(--text-muted);">${formatClockTime(req.date)}</span>
        </div>
        <div style="font-size: 0.825rem; color: var(--text-secondary); line-height: 1.4;">
          ${detailsHtml}
          <div style="margin-top: 0.25rem;">💬 <strong>Reason:</strong> "${req.details.reason || 'No reason specified'}"</div>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn-primary approve-req-btn" data-id="${req.id}" style="background: var(--color-working); padding: 0.45rem; font-size: 0.75rem; font-weight: 700; flex-grow: 1; border-radius: 6px;">Approve</button>
          <button class="btn-danger reject-req-btn" data-id="${req.id}" style="padding: 0.45rem; font-size: 0.75rem; font-weight: 700; flex-grow: 1; border-radius: 6px;">Reject</button>
        </div>
      `;
      hrRequestsList.appendChild(card);
    });
  }

  // Draw History section
  if (pastRequests.length > 0) {
    const histTitle = document.createElement('h4');
    histTitle.textContent = `Completed Requests History`;
    histTitle.style.fontSize = '0.85rem';
    histTitle.style.fontWeight = '700';
    histTitle.style.color = 'var(--text-muted)';
    histTitle.style.textTransform = 'uppercase';
    histTitle.style.marginTop = '1.25rem';
    histTitle.style.marginBottom = '0.75rem';
    hrRequestsList.appendChild(histTitle);

    pastRequests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.padding = '0.75rem 1rem';
      card.style.border = '1px solid var(--border-glass)';
      card.style.borderRadius = '10px';
      card.style.fontSize = '0.8rem';
      card.style.opacity = '0.85';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.35rem';

      let statusBadge = '';
      if (req.status === 'Approved') {
        statusBadge = `<span style="color: var(--color-working); font-weight: 700;">✅ Approved</span>`;
      } else {
        statusBadge = `<span style="color: #ef4444; font-weight: 700;">❌ Rejected</span>`;
      }

      let contentStr = '';
      if (req.type === 'Leave') {
        contentStr = `Leave: ${req.details.startDate} to ${req.details.endDate}`;
      } else {
        contentStr = `Advance of ₹${req.amount}`;
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.775rem; font-weight: 600; border-bottom: 1px dotted var(--border-glass); padding-bottom: 0.25rem;">
          <span style="color: var(--text-primary);">${req.memberName}</span>
          <span>${statusBadge}</span>
        </div>
        <div style="color: var(--text-secondary); line-height: 1.3;">
          <div><strong>Type:</strong> ${contentStr}</div>
          <div><strong>Reason:</strong> "${req.details.reason || 'None'}"</div>
          ${req.notes ? `<div style="font-style: italic; color: var(--text-muted); margin-top: 0.2rem;">✍️ <strong>Reply:</strong> "${req.notes}"</div>` : ''}
        </div>
      `;
      hrRequestsList.appendChild(card);
    });
  }

  // Attach approve/reject click listeners
  hrRequestsList.querySelectorAll('.approve-req-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      handleHrRequest(id, 'Approve');
    });
  });
  hrRequestsList.querySelectorAll('.reject-req-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      handleHrRequest(id, 'Reject');
    });
  });
}

function handleHrRequest(requestId, action) {
  const req = hrRequests.find(r => r.id === requestId);
  if (!req) return;

  const notes = prompt(`Enter optional response comments for ${req.memberName}'s request:`, "");
  if (notes === null) return; // User cancelled

  fetch('/api/requests/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action, notes })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to update request');
    return res.json();
  })
  .catch(err => {
    alert('Error handling request: ' + err.message);
    console.error(err);
  });
}

function openHrModal(memberId) {
  const emp = employees.find(e => e.id === memberId);
  if (!emp) return;

  hrEditId.value = emp.id;
  hrEditName.value = emp.name || '';
  hrModalTitle.textContent = `${emp.name} - HR Profile & Ledger`;
  hrEditPhone.value = emp.phone || '';
  hrEditEmail.value = emp.email || '';
  hrEditAddress.value = emp.address || '';
  hrEditIdType.value = emp.idType || 'National ID';
  hrEditIdNumber.value = emp.idNumber || '';
  hrEditSalary.value = emp.salaryPerMonth || 0;
  hrEditPin.value = emp.pin || '';

  // Clear payment form fields
  hrPayAmount.value = '';
  hrPayNotes.value = '';
  hrPayType.value = 'Salary';

  // Load ledger history list
  renderLedgerList(emp.ledger || []);

  hrModal.style.display = 'flex';
}

function renderLedgerList(ledger) {
  hrLedgerHistory.innerHTML = '';
  if (ledger.length === 0) {
    hrLedgerHistory.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 0.825rem; text-align: center; padding: 1rem 0;">No transaction history.</div>`;
    return;
  }

  ledger.forEach(item => {
    const div = document.createElement('div');
    div.style.fontSize = '0.8rem';
    div.style.padding = '0.5rem';
    div.style.borderBottom = '1px solid var(--border-glass)';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'start';

    let color = 'var(--text-primary)';
    let prefix = '';
    if (item.type === 'Salary') {
      color = 'var(--color-working)';
      prefix = '💰 ';
    } else if (item.type === 'Advance Paid') {
      color = 'var(--color-break)';
      prefix = '💵 ';
    } else if (item.type === 'Advance Deduction') {
      color = '#ef4444';
      prefix = '✂️ ';
    }

    const dateStr = new Date(item.date).toLocaleDateString();

    div.innerHTML = `
      <div>
        <strong style="color: ${color};">${prefix}${item.type}</strong>
        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.1rem;">${item.notes || 'No remarks'}</div>
      </div>
      <div style="text-align: right;">
        <strong style="font-size: 0.875rem; color: ${color};">₹${item.amount}</strong>
        <div style="font-size: 0.725rem; color: var(--text-muted);">${dateStr}</div>
      </div>
    `;
    hrLedgerHistory.appendChild(div);
  });
}

function closeHrModal() {
  hrModal.style.display = 'none';
}

function saveHrMaster() {
  const id = hrEditId.value;
  const name = hrEditName.value.trim();
  const phone = hrEditPhone.value;
  const email = hrEditEmail.value;
  const address = hrEditAddress.value;
  const idType = hrEditIdType.value;
  const idNumber = hrEditIdNumber.value;
  const salaryPerMonth = hrEditSalary.value;
  const pin = hrEditPin.value.trim();

  if (!id) return;

  if (pin !== '' && !/^\d{4}$/.test(pin)) {
    alert("PIN code must be a 4-digit number.");
    hrEditPin.focus();
    return;
  }

  fetch('/api/employees/edit-hr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, phone, email, address, idType, idNumber, salaryPerMonth, pin })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to save HR master data');
    return res.json();
  })
  .then(() => {
    alert('HR Master Profile Saved Successfully!');
    closeHrModal();
  })
  .catch(err => {
    alert('Error saving profile: ' + err.message);
  });
}

function recordLedgerPayment() {
  const id = hrEditId.value;
  const type = hrPayType.value;
  const amount = hrPayAmount.value;
  const notes = hrPayNotes.value;

  if (!id) return;
  if (!amount || parseFloat(amount) <= 0) {
    alert("Please enter a valid amount.");
    hrPayAmount.focus();
    return;
  }

  fetch('/api/ledger/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: id, type, amount, notes })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to log payment transaction');
    return res.json();
  })
  .then(data => {
    // Refresh ledger list in modal
    const emp = data.employee;
    if (emp) {
      renderLedgerList(emp.ledger || []);
      
      // Clear payment inputs
      hrPayAmount.value = '';
      hrPayNotes.value = '';
    }
  })
  .catch(err => {
    alert('Error logging payment: ' + err.message);
  });
}

function updateAssignTaskMemberSelect() {
  if (!assignTaskMember) return;
  const prevVal = assignTaskMember.value;
  assignTaskMember.innerHTML = '';
  
  if (employees.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No team members';
    assignTaskMember.appendChild(opt);
    return;
  }

  employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name;
    assignTaskMember.appendChild(opt);
  });

  if (prevVal && employees.some(e => e.id === prevVal)) {
    assignTaskMember.value = prevVal;
  }
}

function assignTaskFromDashboard() {
  const memberId = assignTaskMember.value;
  const category = assignTaskCategory.value;
  const priority = assignTaskPriority.value;
  const description = assignTaskDescription.value.trim();

  if (!memberId) {
    alert("Please select a team member.");
    assignTaskMember.focus();
    return;
  }
  if (!description) {
    alert("Please enter a task description.");
    assignTaskDescription.focus();
    return;
  }

  fetch('/api/tasks/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberId,
      category,
      priority,
      description,
      assignedBy: 'Admin'
    })
  })
  .then(res => {
    if (!res.ok) throw new Error("Failed to assign task");
    return res.json();
  })
  .then(data => {
    alert("Task assigned successfully!");
    assignTaskDescription.value = '';
  })
  .catch(err => {
    alert("Error assigning task: " + err.message);
  });
}

function initHrModalListeners() {
  if (hrModalClose) {
    hrModalClose.addEventListener('click', closeHrModal);
  }
  // Click outside modal content to close
  window.addEventListener('click', (e) => {
    if (e.target === hrModal) {
      closeHrModal();
    }
  });

  if (hrEditSaveBtn) {
    hrEditSaveBtn.addEventListener('click', saveHrMaster);
  }

  if (hrPayRecordBtn) {
    hrPayRecordBtn.addEventListener('click', recordLedgerPayment);
  }
}

initHrModalListeners();

if (assignTaskBtn) {
  assignTaskBtn.addEventListener('click', assignTaskFromDashboard);
}

// ===================================================
// MANAGER AUTHENTICATION ACCESS CHECK
// ===================================================
const lockScreen = document.getElementById('lock-screen');
const unlockBtn = document.getElementById('unlock-btn');
const passcodeInput = document.getElementById('passcode-input');
const lockErrorMsg = document.getElementById('lock-error-msg');
const lockBox = document.querySelector('.lock-box');

function checkAuthAndInit() {
  if (sessionStorage.getItem('admin_unlocked') === 'true') {
    lockScreen.style.display = 'none';
    initWebSocket();
    initTabSwitcher();
  } else {
    lockScreen.style.display = 'flex';
    passcodeInput.focus();
  }
}

function handleUnlock() {
  const passcode = passcodeInput.value;
  
  fetch('/api/admin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode })
  })
  .then(res => {
    if (!res.ok) throw new Error('Invalid passcode');
    return res.json();
  })
  .then(data => {
    if (data.success) {
      sessionStorage.setItem('admin_unlocked', 'true');
      lockScreen.style.opacity = '0';
      setTimeout(() => {
        lockScreen.style.display = 'none';
        initWebSocket();
        initTabSwitcher();
      }, 300);
    }
  })
  .catch(err => {
    lockErrorMsg.style.display = 'block';
    lockBox.classList.add('shake-box');
    passcodeInput.value = '';
    passcodeInput.focus();
    setTimeout(() => {
      lockBox.classList.remove('shake-box');
    }, 300);
  });
}

unlockBtn.addEventListener('click', handleUnlock);
passcodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleUnlock();
});

// ===================================================
// EDIT & DELETE ATTENDANCE LOG CONTROLLERS
// ===================================================

// Helper to format ISO string to local YYYY-MM-DDTHH:MM for datetime-local input
function formatIsoForDateTimeLocal(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localIso = new Date(date.getTime() - tzOffset).toISOString();
  return localIso.substring(0, 16);
}

function openAttendanceModal(id) {
  const att = attendanceData.find(a => a.id === id);
  if (!att) return;

  editAttId.value = att.id;
  attendanceModalTitle.textContent = `Edit Attendance Log - ${att.memberName}`;
  editAttDate.value = att.date || '';
  editAttLogin.value = formatIsoForDateTimeLocal(att.loginTime);

  if (att.logoutTime) {
    editAttLogout.value = formatIsoForDateTimeLocal(att.logoutTime);
    editAttActive.checked = false;
    editAttLogout.disabled = false;
  } else {
    editAttLogout.value = '';
    editAttActive.checked = true;
    editAttLogout.disabled = true;
  }

  attendanceModal.style.display = 'flex';
}

function closeAttendanceModal() {
  attendanceModal.style.display = 'none';
}

// Checkbox change listener
if (editAttActive) {
  editAttActive.addEventListener('change', (e) => {
    if (e.target.checked) {
      editAttLogout.disabled = true;
      editAttLogout.value = '';
    } else {
      editAttLogout.disabled = false;
      // Default to current time if unchecking
      editAttLogout.value = formatIsoForDateTimeLocal(new Date().toISOString());
    }
  });
}

// Close button listeners
if (attendanceModalClose) {
  attendanceModalClose.addEventListener('click', closeAttendanceModal);
}
window.addEventListener('click', (e) => {
  if (e.target === attendanceModal) {
    closeAttendanceModal();
  }
});

// Save changes API call
if (attendanceEditSaveBtn) {
  attendanceEditSaveBtn.addEventListener('click', () => {
    const id = editAttId.value;
    const date = editAttDate.value;
    const loginVal = editAttLogin.value;
    const logoutVal = editAttLogout.value;
    const isActive = editAttActive.checked;

    if (!id || !date || !loginVal) {
      alert("Log Date and Log In Time are required.");
      return;
    }

    if (!isActive && !logoutVal) {
      alert("Please specify a Log Off Time or check 'Still Active'.");
      return;
    }

    const loginTime = new Date(loginVal).toISOString();
    const logoutTime = isActive ? null : new Date(logoutVal).toISOString();

    fetch('/api/attendance/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, loginTime, logoutTime, date })
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to update attendance log');
      return res.json();
    })
    .then(() => {
      closeAttendanceModal();
    })
    .catch(err => {
      alert('Error updating attendance: ' + err.message);
      console.error(err);
    });
  });
}

// Delete attendance record with double confirmation
function deleteAttendanceRecord(id) {
  const att = attendanceData.find(a => a.id === id);
  if (!att) return;

  if (confirm(`Are you sure you want to delete the attendance log for ${att.memberName} on ${att.date}?`)) {
    if (confirm(`Warning: This action will permanently remove this attendance record. Proceed?`)) {
      fetch('/api/attendance/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete attendance record');
        return res.json();
      })
      .catch(err => {
        alert('Error deleting attendance record: ' + err.message);
        console.error(err);
      });
    }
  }
}

// Render Pending Attendance Table
function renderPendingAttendanceTable() {
  pendingAttendanceTbody.innerHTML = '';
  const pendingAttendance = attendanceData.filter(att => att.approvalStatus === 'Pending');

  if (pendingAttendance.length === 0) {
    pendingAttendanceCard.style.display = 'none';
    return;
  }

  // Show the card
  pendingAttendanceCard.style.display = 'block';

  // Sort logs by login time (most recent first)
  const sortedPending = [...pendingAttendance].sort((a, b) => new Date(b.loginTime) - new Date(a.loginTime));

  sortedPending.forEach(att => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    
    const loginStr = formatClockTime(att.loginTime);
    const logoutStr = att.logoutTime ? formatClockTime(att.logoutTime) : '--:--';
    
    let durationStr = '';
    if (att.logoutTime) {
      const durSec = Math.floor((new Date(att.logoutTime) - new Date(att.loginTime)) / 1000);
      durationStr = formatHourMinSec(durSec);
    } else {
      const durSec = Math.floor((Date.now() - new Date(att.loginTime)) / 1000);
      durationStr = `<span class="live-duration-timer" data-login-time="${att.loginTime}">${formatHourMinSec(durSec)}</span>`;
    }

    const statusBadge = att.logoutTime 
      ? '<span class="status-badge" style="background: rgba(245,158,11,0.08); color: var(--color-break); display: inline-flex;">Pending approval</span>'
      : '<span class="status-badge status-working" style="display: inline-flex;"><span class="status-dot"></span>Active (Pending login approval)</span>';

    tr.innerHTML = `
      <td style="padding: 1rem 0.75rem; font-weight: 600;">${att.memberName}</td>
      <td style="padding: 1rem 0.75rem;">${att.date}</td>
      <td style="padding: 1rem 0.75rem;">${loginStr}</td>
      <td style="padding: 1rem 0.75rem;">${logoutStr}</td>
      <td style="padding: 1rem 0.75rem;">${durationStr}</td>
      <td style="padding: 1rem 0.75rem;">${statusBadge}</td>
      <td style="padding: 1rem 0.75rem; text-align: right; white-space: nowrap;">
        <button class="btn-primary approve-att-btn" data-id="${att.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-radius: 6px; margin-right: 0.25rem; background: var(--color-working);">Approve</button>
        <button class="btn-danger reject-att-btn" data-id="${att.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-radius: 6px; margin-right: 0.25rem;">Reject</button>
        <button class="btn-primary edit-att-btn" data-id="${att.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-radius: 6px;">Edit</button>
      </td>
    `;
    pendingAttendanceTbody.appendChild(tr);
  });

  // Attach pending actions click listeners
  pendingAttendanceTbody.querySelectorAll('.approve-att-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      approveAttendance(id);
    });
  });
  pendingAttendanceTbody.querySelectorAll('.reject-att-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      rejectAttendance(id);
    });
  });
  pendingAttendanceTbody.querySelectorAll('.edit-att-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openAttendanceModal(id);
    });
  });
}

// Approve attendance API call
function approveAttendance(id) {
  fetch('/api/attendance/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to approve attendance log');
    return res.json();
  })
  .catch(err => {
    alert('Error approving attendance: ' + err.message);
    console.error(err);
  });
}

// Reject attendance API call
function rejectAttendance(id) {
  const att = attendanceData.find(a => a.id === id);
  if (!att) return;

  if (confirm(`Are you sure you want to reject the attendance log for ${att.memberName} on ${att.date}?`)) {
    fetch('/api/attendance/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to reject attendance log');
      return res.json();
    })
    .catch(err => {
      alert('Error rejecting attendance: ' + err.message);
      console.error(err);
    });
  }
}

// Initialize Register Month Dropdown
function initAttendanceRegisterMonthSelect() {
  if (!registerMonthSelect || registerMonthSelect.children.length > 0) return;

  const months = [];
  const date = new Date();
  
  for (let i = 0; i < 6; i++) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
    const monthVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const opt = document.createElement('option');
    opt.value = monthVal;
    opt.textContent = monthName;
    registerMonthSelect.appendChild(opt);
  }

  registerMonthSelect.addEventListener('change', () => {
    renderAttendanceRegister();
  });
}

// Initialize Date Filter for Attendance Log
function initAttendanceDateFilter() {
  const filterInput = document.getElementById('attendance-date-filter');
  const clearBtn = document.getElementById('clear-attendance-filter-btn');

  if (!filterInput || filterInput.getAttribute('data-listener-bound')) return;
  filterInput.setAttribute('data-listener-bound', 'true');

  // Default to today's date
  filterInput.value = new Date().toISOString().split('T')[0];

  filterInput.addEventListener('change', () => {
    renderAttendanceTable();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterInput.value = '';
      renderAttendanceTable();
    });
  }
}

// Populate Member Dropdown for Manual Attendance
function updatePastAttendanceMemberSelect() {
  if (!pastAttMember) return;
  const currentVal = pastAttMember.value;
  pastAttMember.innerHTML = '<option value="" disabled selected>Select member...</option>';
  
  employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = emp.name;
    pastAttMember.appendChild(opt);
  });

  if (currentVal && employees.some(e => e.id === currentVal)) {
    pastAttMember.value = currentVal;
  }
}

// Render Attendance Register Grid
function renderAttendanceRegister() {
  if (!registerTable || !registerMonthSelect) return;
  registerTable.innerHTML = '';

  const selectedMonthStr = registerMonthSelect.value;
  if (!selectedMonthStr) return;

  const [year, month] = selectedMonthStr.split('-').map(Number);
  const targetMonthIndex = month - 1;
  const numDays = new Date(year, month, 0).getDate();

  // Create Table Head
  const thead = document.createElement('thead');
  const headerTr = document.createElement('tr');
  headerTr.style.borderBottom = '1.5px solid var(--border-glass)';

  const nameTh = document.createElement('th');
  nameTh.className = 'emp-name-col';
  nameTh.textContent = 'Team Member';
  headerTr.appendChild(nameTh);

  for (let day = 1; day <= numDays; day++) {
    const dayTh = document.createElement('th');
    dayTh.textContent = day;
    const dayOfWeek = new Date(year, targetMonthIndex, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayTh.style.color = '#ef4444';
      dayTh.style.backgroundColor = 'rgba(239, 68, 68, 0.03)';
    }
    headerTr.appendChild(dayTh);
  }
  thead.appendChild(headerTr);
  registerTable.appendChild(thead);

  // Create Table Body
  const tbody = document.createElement('tbody');

  if (employees.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = numDays + 1;
    td.style.padding = '2rem';
    td.style.fontStyle = 'italic';
    td.style.color = 'var(--text-muted)';
    td.textContent = 'No team members configured.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    registerTable.appendChild(tbody);
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  employees.forEach(emp => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';

    const nameTd = document.createElement('td');
    nameTd.className = 'emp-name-col';
    nameTd.textContent = emp.name;
    tr.appendChild(nameTd);

    const approvedLeaves = hrRequests.filter(req => 
      req.memberId === emp.id && 
      req.type === 'Leave' && 
      req.status === 'Approved'
    );

    for (let day = 1; day <= numDays; day++) {
      const td = document.createElement('td');
      const dayDate = new Date(year, targetMonthIndex, day);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = dayDate.getDay();

      const isFuture = dateStr > todayStr;
      const dayLogs = attendanceData.filter(att => 
        att.memberId === emp.id && 
        att.date === dateStr
      );

      const hasApproved = dayLogs.some(l => l.approvalStatus === 'Approved');
      const hasPending = dayLogs.some(l => l.approvalStatus === 'Pending');

      const onLeave = approvedLeaves.some(req => {
        const start = req.details.startDate;
        const end = req.details.endDate;
        return dateStr >= start && dateStr <= end;
      });

      let cellHtml = '';
      if (hasApproved) {
        cellHtml = '<span class="register-status-badge present" title="Present">P</span>';
      } else if (hasPending) {
        cellHtml = '<span class="register-status-badge pending" title="Pending Approval">⏳</span>';
      } else if (onLeave) {
        cellHtml = '<span class="register-status-badge leave" title="On Leave">L</span>';
      } else if (isFuture) {
        cellHtml = '<span class="register-status-badge off">—</span>';
      } else {
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          cellHtml = '<span class="register-status-badge off" title="Weekend / Off duty">—</span>';
        } else {
          cellHtml = '<span class="register-status-badge absent" title="Absent">A</span>';
        }
      }

      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  registerTable.appendChild(tbody);
}

// Bind Log Past Attendance Form
function initPastAttendanceForm() {
  if (!pastAttSubmitBtn) return;
  
  if (pastAttSubmitBtn.getAttribute('data-listener-bound')) return;
  pastAttSubmitBtn.setAttribute('data-listener-bound', 'true');

  pastAttSubmitBtn.addEventListener('click', () => {
    const memberId = pastAttMember.value;
    const date = pastAttDate.value;
    const loginTimeStr = pastAttLogin.value;
    const logoutTimeStr = pastAttLogout.value;

    if (!memberId) {
      alert("Please select a team member.");
      return;
    }
    if (!date) {
      alert("Please select a date.");
      return;
    }
    if (!loginTimeStr) {
      alert("Please specify a Clock In time.");
      return;
    }

    const loginTime = new Date(`${date}T${loginTimeStr}:00`).toISOString();
    let logoutTime = null;
    if (logoutTimeStr) {
      logoutTime = new Date(`${date}T${logoutTimeStr}:00`).toISOString();
      if (new Date(logoutTime) < new Date(loginTime)) {
        alert("Clock Out time must be after Clock In time.");
        return;
      }
    }

    fetch('/api/attendance/add-past', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, date, loginTime, logoutTime })
    })
    .then(res => {
      if (!res.ok) {
        return res.json().then(data => { throw new Error(data.error); });
      }
      return res.json();
    })
    .then(() => {
      alert("Past attendance record added successfully!");
      pastAttDate.value = '';
      pastAttLogin.value = '';
      pastAttLogout.value = '';
    })
    .catch(err => {
      alert("Error adding past attendance: " + err.message);
      console.error(err);
    });
  });
}

// Run auth check on startup
checkAuthAndInit();
