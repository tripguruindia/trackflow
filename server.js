const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
let PORT = parseInt(process.env.PORT) || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbAdapter = require('./db');
const readDb = dbAdapter.readDb;
const writeDb = dbAdapter.writeDb;

function getLocalDateString(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput || new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


// REST API Endpoints

// Verify administrator passcode (Default is '2920')
app.post('/api/admin/verify', (req, res) => {
  const { passcode } = req.body;
  if (passcode === '2920') {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid passcode' });
  }
});

// Get current state
app.get('/api/state', (req, res) => {
  res.json(readDb());
});

// Add a new team member
app.post('/api/employees/add', (req, res) => {
  const { name, pin } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Team member name is required' });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be a 4-digit number' });
  }

  const db = readDb();
  const id = 'emp_' + Date.now();
  const newEmployee = {
    id,
    name: name.trim(),
    pin: pin.trim(),
    status: 'Offline',
    lastUpdated: new Date().toISOString(),
    currentTask: null
  };

  db.employees.push(newEmployee);
  
  // Log the action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: id,
    employeeName: newEmployee.name,
    action: `Team member profile added`
  });

  // Limit logs to last 100 entries
  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.status(201).json(newEmployee);
});

// Verify individual team member PIN code
app.post('/api/team/verify', (req, res) => {
  const { id, pin } = req.body;
  if (!id || !pin) {
    return res.status(400).json({ error: 'Team member ID and PIN are required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === id);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  if (employee.pin === pin.trim()) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid PIN' });
  }
});

// Edit employee HR details
app.post('/api/employees/edit-hr', (req, res) => {
  const { id, name, phone, email, address, idType, idNumber, salaryPerMonth, pin } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Team member ID is required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === id);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  let nameChanged = false;
  let oldName = employee.name;
  if (name !== undefined && name.trim() !== '') {
    const trimmedName = name.trim();
    if (employee.name !== trimmedName) {
      employee.name = trimmedName;
      nameChanged = true;
    }
  }

  if (pin !== undefined && pin.trim() !== '') {
    if (!/^\d{4}$/.test(pin.trim())) {
      return res.status(400).json({ error: 'PIN must be a 4-digit number' });
    }
    employee.pin = pin.trim();
  }

  employee.phone = phone !== undefined ? phone.trim() : (employee.phone || "");
  employee.email = email !== undefined ? email.trim() : (employee.email || "");
  employee.address = address !== undefined ? address.trim() : (employee.address || "");
  employee.idType = idType !== undefined ? idType.trim() : (employee.idType || "National ID");
  employee.idNumber = idNumber !== undefined ? idNumber.trim() : (employee.idNumber || "");
  employee.salaryPerMonth = salaryPerMonth !== undefined ? parseFloat(salaryPerMonth) || 0 : (employee.salaryPerMonth || 0);

  if (nameChanged) {
    // Cascade name changes to all matching collections to maintain consistency
    if (db.attendance) {
      db.attendance.forEach(att => {
        if (att.memberId === id) {
          att.memberName = employee.name;
        }
      });
    }
    if (db.requests) {
      db.requests.forEach(reqRec => {
        if (reqRec.memberId === id) {
          reqRec.memberName = employee.name;
        }
      });
    }
    if (db.querySessions) {
      db.querySessions.forEach(qs => {
        if (qs.memberId === id) {
          qs.memberName = employee.name;
        }
      });
    }
    if (db.tasks) {
      db.tasks.forEach(task => {
        if (task.memberId === id) {
          task.memberName = employee.name;
        }
      });
    }
    if (db.logs) {
      db.logs.forEach(log => {
        if (log.employeeId === id) {
          log.employeeName = employee.name;
        }
      });
    }
  }

  // Log the action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: id,
    employeeName: employee.name,
    action: nameChanged
      ? `Updated HR details & corrected name spelling from "${oldName}" to "${employee.name}"`
      : `Updated HR details (Salary: ₹${employee.salaryPerMonth}/mo)`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, employee });
});

// Create a new Leave or Advance request
app.post('/api/requests/create', (req, res) => {
  const { memberId, type, details, amount } = req.body;
  if (!memberId || !type) {
    return res.status(400).json({ error: 'Member ID and request type are required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === memberId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const reqAmount = type === 'Advance' ? parseFloat(amount) || 0 : null;
  const newRequest = {
    id: 'req_' + Date.now(),
    memberId,
    memberName: employee.name,
    type,
    date: new Date().toISOString(),
    status: 'Pending',
    details: details || {},
    amount: reqAmount,
    notes: ''
  };

  db.requests.unshift(newRequest);

  // Log action
  const logMsg = type === 'Advance' 
    ? `Requested an Advance of ₹${reqAmount} (${details.reason || ''})`
    : `Requested Leave from ${details.startDate} to ${details.endDate} (${details.reason || ''})`;

  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: memberId,
    employeeName: employee.name,
    action: logMsg
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.status(201).json({ success: true, request: newRequest });
});

// Handle (Approve / Reject) Leave or Advance request
app.post('/api/requests/handle', (req, res) => {
  const { requestId, action, notes } = req.body;
  if (!requestId || !action) {
    return res.status(400).json({ error: 'Request ID and action are required' });
  }

  const db = readDb();
  const request = db.requests.find(r => r.id === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const status = action === 'Approve' ? 'Approved' : 'Rejected';
  request.status = status;
  request.notes = notes ? notes.trim() : '';

  const employee = db.employees.find(emp => emp.id === request.memberId);

  // If approved and is Advance, log payment and increase outstanding advance balance
  if (status === 'Approved' && request.type === 'Advance' && employee) {
    if (!employee.ledger) employee.ledger = [];
    const amount = parseFloat(request.amount) || 0;

    employee.ledger.unshift({
      id: 'led_' + Date.now(),
      date: new Date().toISOString(),
      type: 'Advance Paid',
      amount: amount,
      notes: `Approved advance request: ${request.details.reason || 'No details'}`
    });

    employee.advanceBalance = (employee.advanceBalance || 0) + amount;
  }

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: request.memberId,
    employeeName: request.memberName,
    action: `${status} ${request.memberName}'s ${request.type} request`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, request });
});

// Log custom ledger payment (Salary, Advance Paid, Advance Deduction)
app.post('/api/ledger/payment', (req, res) => {
  const { memberId, type, amount, notes } = req.body;
  if (!memberId || !type || amount === undefined) {
    return res.status(400).json({ error: 'Member ID, transaction type, and amount are required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === memberId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const transAmount = parseFloat(amount) || 0;
  if (!employee.ledger) employee.ledger = [];

  employee.ledger.unshift({
    id: 'led_' + Date.now(),
    date: new Date().toISOString(),
    type,
    amount: transAmount,
    notes: notes ? notes.trim() : ''
  });

  // Recalculate advanceBalance
  if (type === 'Advance Paid') {
    employee.advanceBalance = (employee.advanceBalance || 0) + transAmount;
  } else if (type === 'Advance Deduction') {
    employee.advanceBalance = Math.max(0, (employee.advanceBalance || 0) - transAmount);
  }

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: memberId,
    employeeName: employee.name,
    action: `Recorded ${type} transaction (₹${transAmount}) for ${employee.name}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, employee });
});

// Delete a query session log and deduct time from productivity
app.post('/api/query-sessions/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Query session ID is required' });
  }

  const db = readDb();
  if (!db.querySessions) db.querySessions = [];

  const index = db.querySessions.findIndex(qs => qs.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Query session not found' });
  }

  const session = db.querySessions[index];
  const { memberId, duration, startedAt, category, description, memberName } = session;

  // Deduct the duration from productivity (today or the day it was created)
  const date = getLocalDateString(startedAt);
  if (db.productivity && db.productivity[date] && db.productivity[date][memberId]) {
    const originalWorking = db.productivity[date][memberId].Working || 0;
    db.productivity[date][memberId].Working = Math.max(0, originalWorking - duration);
  }

  // Remove from array
  db.querySessions.splice(index, 1);

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: memberId,
    employeeName: memberName,
    action: `Admin deleted query session log of ${memberName}: [${category}] ${description} (Deducted ${duration}s)`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true });
});

// Reset an employee's productivity statistics and delete their query sessions for a specific date
app.post('/api/productivity/reset', (req, res) => {
  const { memberId, date } = req.body;
  if (!memberId || !date) {
    return res.status(400).json({ error: 'Member ID and date are required' });
  }

  const db = readDb();
  
  // Reset productivity stats
  if (db.productivity && db.productivity[date] && db.productivity[date][memberId]) {
    db.productivity[date][memberId] = { Working: 0, Idle: 0, Break: 0 };
  }

  // Delete today's query sessions for this member
  if (db.querySessions) {
    db.querySessions = db.querySessions.filter(qs => {
      const isTargetMember = qs.memberId === memberId;
      const isTargetDate = getLocalDateString(qs.startedAt) === date;
      return !(isTargetMember && isTargetDate);
    });
  }

  // Find member name
  const employee = db.employees.find(emp => emp.id === memberId);
  const employeeName = employee ? employee.name : 'Unknown';

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: memberId,
    employeeName: employeeName,
    action: `Admin reset today's productivity stats to zero for ${employeeName}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true });
});

// Edit an attendance log entry
app.post('/api/attendance/edit', (req, res) => {
  const { id, loginTime, logoutTime, date } = req.body;
  if (!id || !loginTime || !date) {
    return res.status(400).json({ error: 'Attendance ID, login time, and date are required' });
  }

  const db = readDb();
  if (!db.attendance) db.attendance = [];

  const attRecord = db.attendance.find(att => att.id === id);
  if (!attRecord) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  attRecord.loginTime = loginTime;
  attRecord.logoutTime = logoutTime || null;
  attRecord.date = date;
  attRecord.approvalStatus = 'Approved';

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: attRecord.memberId,
    employeeName: attRecord.memberName,
    action: `Admin updated attendance log for ${attRecord.memberName} (Date: ${date})`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, attendance: attRecord });
});

// Delete an attendance log entry
app.post('/api/attendance/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Attendance ID is required' });
  }

  const db = readDb();
  if (!db.attendance) db.attendance = [];

  const index = db.attendance.findIndex(att => att.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  const attRecord = db.attendance[index];
  db.attendance.splice(index, 1);

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: attRecord.memberId,
    employeeName: attRecord.memberName,
    action: `Admin deleted attendance log for ${attRecord.memberName} on date: ${attRecord.date}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true });
});

// Add a manual past attendance log entry
app.post('/api/attendance/add-past', (req, res) => {
  const { memberId, date, loginTime, logoutTime } = req.body;
  if (!memberId || !date || !loginTime) {
    return res.status(400).json({ error: 'Member ID, date, and login time are required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === memberId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  if (!db.attendance) db.attendance = [];

  const newAtt = {
    id: 'att_' + Date.now(),
    memberId,
    memberName: employee.name,
    date,
    loginTime,
    logoutTime: logoutTime || null,
    approvalStatus: 'Approved' // Manually added by admin/manager
  };

  db.attendance.push(newAtt);

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: memberId,
    employeeName: employee.name,
    action: `Admin manually added past attendance for ${employee.name} on date: ${date}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.status(201).json({ success: true, attendance: newAtt });
});

// Approve an attendance log entry
app.post('/api/attendance/approve', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Attendance ID is required' });
  }

  const db = readDb();
  if (!db.attendance) db.attendance = [];

  const attRecord = db.attendance.find(att => att.id === id);
  if (!attRecord) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  attRecord.approvalStatus = 'Approved';

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: attRecord.memberId,
    employeeName: attRecord.memberName,
    action: `Admin approved attendance log for ${attRecord.memberName} on date: ${attRecord.date}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, attendance: attRecord });
});

// Reject (delete) an attendance log entry
app.post('/api/attendance/reject', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Attendance ID is required' });
  }

  const db = readDb();
  if (!db.attendance) db.attendance = [];

  const index = db.attendance.findIndex(att => att.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  const attRecord = db.attendance[index];
  db.attendance.splice(index, 1);

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: attRecord.memberId,
    employeeName: attRecord.memberName,
    action: `Admin rejected attendance log for ${attRecord.memberName} on date: ${attRecord.date}`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true });
});

// Remove a team member
app.post('/api/employees/remove', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Team member ID is required' });
  }

  const db = readDb();
  const employeeIndex = db.employees.findIndex(emp => emp.id === id);
  if (employeeIndex === -1) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const employeeName = db.employees[employeeIndex].name;
  db.employees.splice(employeeIndex, 1);

  // Log the action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: id,
    employeeName: employeeName,
    action: `Team member profile removed`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, message: `Removed ${employeeName}` });
});

// Employee Office In (Clock In) manual endpoint
app.post('/api/attendance/office-in', (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  if (!db.attendance) db.attendance = [];

  // Check if already clocked in
  const activeAtt = db.attendance.find(att => att.memberId === employeeId && att.logoutTime === null);
  if (activeAtt) {
    return res.status(400).json({ error: 'Already clocked in' });
  }

  const nowIso = new Date().toISOString();
  const today = getLocalDateString(nowIso);

  // Create attendance record
  const newAtt = {
    id: 'att_' + Date.now(),
    memberId: employeeId,
    memberName: employee.name,
    date: today,
    loginTime: nowIso,
    logoutTime: null,
    approvalStatus: 'Pending'
  };
  db.attendance.push(newAtt);

  // Transition employee status to Idle
  employee.status = 'Idle';
  employee.lastUpdated = nowIso;
  employee.currentTask = null;

  // Log action
  db.logs.unshift({
    timestamp: nowIso,
    employeeId: employeeId,
    employeeName: employee.name,
    action: `Logged Office In (Clocked In)`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, attendance: newAtt });
});

// Employee Office Out (Clock Out) manual endpoint
app.post('/api/attendance/office-out', (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  if (!db.attendance) db.attendance = [];

  // Find active check-in
  const activeAtt = db.attendance.find(att => att.memberId === employeeId && att.logoutTime === null);
  if (!activeAtt) {
    return res.status(400).json({ error: 'No active check-in found' });
  }

  const nowIso = new Date().toISOString();
  const today = getLocalDateString(nowIso);
  const oldStatus = employee.status;

  // 1. Calculate and save productivity time up to now
  if (oldStatus !== 'Offline') {
    const elapsedMs = Date.now() - new Date(employee.lastUpdated).getTime();
    const elapsedSecs = Math.floor(elapsedMs / 1000);

    if (elapsedSecs > 0) {
      if (!db.productivity) db.productivity = {};
      if (!db.productivity[today]) db.productivity[today] = {};
      if (!db.productivity[today][employeeId]) {
        db.productivity[today][employeeId] = { Working: 0, Idle: 0, Break: 0 };
      }
      if (db.productivity[today][employeeId][oldStatus] !== undefined) {
        db.productivity[today][employeeId][oldStatus] += elapsedSecs;
      }

      // Log completed query session if working
      if (oldStatus === 'Working' && employee.currentTask) {
        if (!db.querySessions) db.querySessions = [];
        db.querySessions.push({
          id: 'qs_' + Date.now(),
          memberId: employeeId,
          memberName: employee.name,
          category: employee.currentTask.category,
          description: employee.currentTask.description,
          startedAt: employee.currentTask.startedAt || employee.lastUpdated,
          endedAt: nowIso,
          duration: elapsedSecs
        });
      }
    }
  }

  // 1.5 Auto-pause any active tasks
  if (db.tasks) {
    db.tasks.forEach(task => {
      if (task.memberId === employeeId && task.status === 'Active') {
        const elapsedMs = Date.now() - new Date(task.lastStartedAt).getTime();
        const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
        task.timeSpent = (task.timeSpent || 0) + elapsedSecs;
        task.status = 'Pending';
        task.lastStartedAt = null;
        
        db.logs.unshift({
          timestamp: nowIso,
          employeeId: employeeId,
          employeeName: employee.name,
          action: `Paused task [${task.category}] due to clocking out.`
        });
      }
    });
  }

  // 2. Complete attendance record
  activeAtt.logoutTime = nowIso;

  // 3. Set status to Offline
  employee.status = 'Offline';
  employee.lastUpdated = nowIso;
  employee.currentTask = null;

  // Log action
  db.logs.unshift({
    timestamp: nowIso,
    employeeId: employeeId,
    employeeName: employee.name,
    action: `Logged Office Out (Clocked Out)`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, attendance: activeAtt });
});

// ===================================================
// TASK LIST MANAGEMENT ENDPOINTS
// ===================================================

// Create a new task (Self or Admin)
app.post('/api/tasks/create', (req, res) => {
  const { memberId, category, description, priority, assignedBy } = req.body;
  if (!memberId || !category || !description) {
    return res.status(400).json({ error: 'Member ID, Category, and Description are required' });
  }

  const db = readDb();
  const employee = db.employees.find(emp => emp.id === memberId);
  if (!employee) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const taskPriority = (priority || 'MEDIUM').toUpperCase();
  if (!['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(taskPriority)) {
    return res.status(400).json({ error: 'Invalid priority level' });
  }

  const creator = assignedBy === 'Admin' ? 'Admin' : 'Self';
  const nowIso = new Date().toISOString();
  
  const newTask = {
    id: 'task_' + Date.now(),
    memberId,
    memberName: employee.name,
    category: category.trim(),
    description: description.trim(),
    status: 'Pending',
    priority: taskPriority,
    assignedBy: creator,
    timeSpent: 0,
    lastStartedAt: null,
    createdAt: nowIso
  };

  if (!db.tasks) db.tasks = [];
  db.tasks.push(newTask);

  // Log action
  const logMsg = creator === 'Admin'
    ? `Admin assigned task: [${newTask.category}] ${newTask.description} (Priority: ${taskPriority})`
    : `Added task to tasklist: [${newTask.category}] ${newTask.description}`;
  
  db.logs.unshift({
    timestamp: nowIso,
    employeeId: memberId,
    employeeName: employee.name,
    action: logMsg
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.status(201).json({ success: true, task: newTask });
});

// Edit description of an assigned task
app.post('/api/tasks/edit-desc', (req, res) => {
  const { taskId, description } = req.body;
  if (!taskId || !description || description.trim() === '') {
    return res.status(400).json({ error: 'Task ID and Description are required' });
  }

  const db = readDb();
  const task = db.tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const oldDesc = task.description;
  task.description = description.trim();

  // If there's an employee currently working on this task, update their currentTask description
  const employee = db.employees.find(emp => emp.id === task.memberId);
  if (employee && employee.currentTask && employee.currentTask.id === taskId) {
    employee.currentTask.description = task.description;
  }

  // If this task was completed, search for and update corresponding query session description
  if (task.status === 'Completed' && db.querySessions) {
    const qSession = db.querySessions.find(qs => 
      qs.memberId === task.memberId && 
      qs.category === task.category && 
      qs.description === oldDesc
    );
    if (qSession) {
      qSession.description = task.description;
    }
  }

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: task.memberId,
    employeeName: task.memberName,
    action: `Admin modified task description of [${task.category}] from "${oldDesc}" to "${task.description}"`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, task });
});

// Delete a task (Active, Pending, or Completed)
app.post('/api/tasks/delete', (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const db = readDb();
  const taskIndex = db.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = db.tasks[taskIndex];
  db.tasks.splice(taskIndex, 1);

  // If employee was working on this deleted task, transition them back to 'Idle'
  const employee = db.employees.find(emp => emp.id === task.memberId);
  if (employee && employee.currentTask && employee.currentTask.id === taskId) {
    employee.currentTask = null;
    employee.status = 'Idle';
    employee.lastUpdated = new Date().toISOString();
  }

  // Log action
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    employeeId: task.memberId,
    employeeName: task.memberName,
    action: `Admin deleted task: [${task.category}] "${task.description}"`
  });

  if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

  writeDb(db);
  broadcastState(db);

  res.json({ success: true });
});

// Start or Resume a task
app.post('/api/tasks/start', (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const db = readDb();
  if (!db.tasks) db.tasks = [];

  const task = db.tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status === 'Active') {
    return res.status(400).json({ error: 'Task is already active' });
  }

  const nowIso = new Date().toISOString();
  task.status = 'Active';
  task.lastStartedAt = nowIso;

  // Sync employee status to Working
  const employee = db.employees.find(emp => emp.id === task.memberId);
  if (employee) {
    const oldStatus = employee.status;
    
    // Calculate previous status productivity if switching
    if (oldStatus !== 'Offline' && oldStatus !== 'Working') {
      const elapsedMs = Date.now() - new Date(employee.lastUpdated).getTime();
      const elapsedSecs = Math.floor(elapsedMs / 1000);
      if (elapsedSecs > 0) {
        const today = getLocalDateString(nowIso);
        if (!db.productivity) db.productivity = {};
        if (!db.productivity[today]) db.productivity[today] = {};
        if (!db.productivity[today][employee.id]) {
          db.productivity[today][employee.id] = { Working: 0, Idle: 0, Break: 0 };
        }
        if (db.productivity[today][employee.id][oldStatus] !== undefined) {
          db.productivity[today][employee.id][oldStatus] += elapsedSecs;
        }
      }
    }

    employee.status = 'Working';
    employee.lastUpdated = nowIso;
    
    // Set current task to show on dashboard status board
    employee.currentTask = {
      category: task.category,
      description: task.description,
      startedAt: nowIso
    };

    db.logs.unshift({
      timestamp: nowIso,
      employeeId: employee.id,
      employeeName: employee.name,
      action: `Started/Resumed task: [${task.category}] ${task.description}`
    });
    if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);
  }

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, task });
});

// Pause an active task
app.post('/api/tasks/pause', (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const db = readDb();
  if (!db.tasks) db.tasks = [];

  const task = db.tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status !== 'Active') {
    return res.status(400).json({ error: 'Task is not active' });
  }

  const nowIso = new Date().toISOString();
  const elapsedMs = Date.now() - new Date(task.lastStartedAt).getTime();
  const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));

  task.timeSpent = (task.timeSpent || 0) + elapsedSecs;
  task.status = 'Pending';
  task.lastStartedAt = null;

  const employee = db.employees.find(emp => emp.id === task.memberId);
  if (employee) {
    // Check if there are other active tasks for this member
    const activeTasks = db.tasks.filter(t => t.memberId === employee.id && t.status === 'Active');
    
    // Add productivity time for Working status since we are pausing
    const oldStatus = employee.status;
    const elapsedStatusMs = Date.now() - new Date(employee.lastUpdated).getTime();
    const elapsedStatusSecs = Math.floor(elapsedStatusMs / 1000);

    if (elapsedStatusSecs > 0) {
      const today = getLocalDateString(nowIso);
      if (!db.productivity) db.productivity = {};
      if (!db.productivity[today]) db.productivity[today] = {};
      if (!db.productivity[today][employee.id]) {
        db.productivity[today][employee.id] = { Working: 0, Idle: 0, Break: 0 };
      }
      if (db.productivity[today][employee.id][oldStatus] !== undefined) {
        db.productivity[today][employee.id][oldStatus] += elapsedStatusSecs;
      }
    }

    if (activeTasks.length === 0) {
      // Transition employee back to Idle if no other active tasks
      employee.status = 'Idle';
      employee.currentTask = null;
    } else {
      // Set dashboard active task display to the next active task in line
      const nextActive = activeTasks[0];
      employee.currentTask = {
        category: nextActive.category,
        description: nextActive.description,
        startedAt: nextActive.lastStartedAt || nowIso
      };
    }
    employee.lastUpdated = nowIso;

    db.logs.unshift({
      timestamp: nowIso,
      employeeId: employee.id,
      employeeName: employee.name,
      action: `Paused task: [${task.category}] ${task.description} (Spent: ${elapsedSecs}s)`
    });
    if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);
  }

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, task });
});

// Mark a task as completed/finished
app.post('/api/tasks/finish', (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  const db = readDb();
  if (!db.tasks) db.tasks = [];

  const task = db.tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const nowIso = new Date().toISOString();
  const today = getLocalDateString(nowIso);
  let sessionSecs = 0;

  if (task.status === 'Active') {
    const elapsedMs = Date.now() - new Date(task.lastStartedAt).getTime();
    sessionSecs = Math.max(0, Math.floor(elapsedMs / 1000));
    task.timeSpent = (task.timeSpent || 0) + sessionSecs;
    task.lastStartedAt = null;
  }

  task.status = 'Completed';

  // Log completed query session for the cumulative duration spent on this task!
  if (!db.querySessions) db.querySessions = [];
  db.querySessions.push({
    id: 'qs_' + Date.now(),
    memberId: task.memberId,
    memberName: task.memberName,
    category: task.category,
    description: task.description,
    startedAt: task.createdAt,
    endedAt: nowIso,
    duration: task.timeSpent
  });

  const employee = db.employees.find(emp => emp.id === task.memberId);
  if (employee) {
    const activeTasks = db.tasks.filter(t => t.memberId === employee.id && t.status === 'Active');
    
    // Add productivity time for Working status up to now
    const oldStatus = employee.status;
    const elapsedStatusMs = Date.now() - new Date(employee.lastUpdated).getTime();
    const elapsedStatusSecs = Math.floor(elapsedStatusMs / 1000);

    if (elapsedStatusSecs > 0) {
      if (!db.productivity) db.productivity = {};
      if (!db.productivity[today]) db.productivity[today] = {};
      if (!db.productivity[today][employee.id]) {
        db.productivity[today][employee.id] = { Working: 0, Idle: 0, Break: 0 };
      }
      if (db.productivity[today][employee.id][oldStatus] !== undefined) {
        db.productivity[today][employee.id][oldStatus] += elapsedStatusSecs;
      }
    }

    if (activeTasks.length === 0) {
      // Transition back to Idle if no other active tasks
      employee.status = 'Idle';
      employee.currentTask = null;
    } else {
      // Set active task details to next active task in line
      const nextActive = activeTasks[0];
      employee.currentTask = {
        category: nextActive.category,
        description: nextActive.description,
        startedAt: nextActive.lastStartedAt || nowIso
      };
    }
    employee.lastUpdated = nowIso;

    db.logs.unshift({
      timestamp: nowIso,
      employeeId: employee.id,
      employeeName: employee.name,
      action: `Finished task: [${task.category}] ${task.description} (Total Time: ${task.timeSpent}s)`
    });
    if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);
  }

  writeDb(db);
  broadcastState(db);

  res.json({ success: true, task });
});

// Create HTTP Server
const server = http.createServer(app);

// Create WebSocket Server
const wss = new WebSocket.Server({ server });
wss.on('error', (err) => {
  console.log(`⚠️ WebSocket Server warning: ${err.message}`);
});

// WebSocket Broadcaster
function broadcastState(state) {
  const message = JSON.stringify({ type: 'STATE_UPDATE', data: state });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Immediately send current state on connection
  ws.send(JSON.stringify({ type: 'STATE_UPDATE', data: readDb() }));

  ws.on('message', (messageString) => {
    try {
      const message = JSON.parse(messageString);
      
      if (message.type === 'UPDATE_STATUS') {
        const { employeeId, status, currentTask } = message.data;
        const db = readDb();
        const employee = db.employees.find(emp => emp.id === employeeId);

        if (employee) {
          const oldStatus = employee.status;
          const nowIso = new Date().toISOString();
          const today = getLocalDateString(nowIso);

          // 1. Productivity Time Allocation updates (only count if transition is from active state)
          if (oldStatus !== 'Offline') {
            const elapsedMs = Date.now() - new Date(employee.lastUpdated).getTime();
            const elapsedSecs = Math.floor(elapsedMs / 1000);
            
            if (elapsedSecs > 0) {
              if (!db.productivity) db.productivity = {};
              if (!db.productivity[today]) db.productivity[today] = {};
              if (!db.productivity[today][employeeId]) {
                db.productivity[today][employeeId] = { Working: 0, Idle: 0, Break: 0 };
              }
              // Add elapsed seconds to the previous state key
              if (db.productivity[today][employeeId][oldStatus] !== undefined) {
                db.productivity[today][employeeId][oldStatus] += elapsedSecs;
              }

              // Log completed query session
              if (oldStatus === 'Working' && employee.currentTask) {
                if (!db.querySessions) db.querySessions = [];
                db.querySessions.push({
                  id: 'qs_' + Date.now(),
                  memberId: employeeId,
                  memberName: employee.name,
                  category: employee.currentTask.category,
                  description: employee.currentTask.description,
                  startedAt: employee.currentTask.startedAt || employee.lastUpdated,
                  endedAt: nowIso,
                  duration: elapsedSecs
                });
              }
            }
          }

          // 3. Update employee state record
          employee.status = status;
          employee.lastUpdated = nowIso;
          employee.currentTask = status === 'Working' ? currentTask : null;

          let logAction = '';
          if (status === 'Working' && currentTask) {
            logAction = `Started task: [${currentTask.category}] ${currentTask.description}`;
          } else if (status === 'Idle') {
            logAction = `Status changed to Idle (waiting for queries)`;
          } else if (status === 'Break') {
            logAction = `Went on Break`;
          } else if (status === 'Offline') {
            logAction = `Went Off Duty (Offline)`;
          } else {
            logAction = `Changed status to ${status}`;
          }

          db.logs.unshift({
            timestamp: nowIso,
            employeeId: employeeId,
            employeeName: employee.name,
            action: logAction
          });

          if (db.logs.length > 100) db.logs = db.logs.slice(0, 100);

          writeDb(db);
          broadcastState(db);
        }
      }
    } catch (err) {
      console.error("Error processing WebSocket message:", err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Get local IP addresses for mobile testing
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// Start Server with EADDRINUSE fallback handling
async function startServer() {
  try {
    await dbAdapter.initDatabase();
    server.listen(PORT);
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }
}

server.on('listening', () => {
  console.log(`===================================================`);
  console.log(`   🚀 LIVE TEAM PRODUCTIVITY TRACKER STARTED 🚀   `);
  console.log(`===================================================`);
  console.log(`💻 Local Access: http://localhost:${PORT}`);
  
  const localIps = getLocalIpAddresses();
  if (localIps.length > 0) {
    console.log(`📱 Mobile Access (on the same Wi-Fi network):`);
    localIps.forEach(ip => {
      console.log(`   👉 http://${ip}:${PORT}`);
    });
  } else {
    console.log(`📱 Connect to Wi-Fi to test mobile access.`);
  }
  console.log(`===================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️ Port ${PORT} is in use. Retrying on port ${PORT + 1}...`);
    PORT++;
    startServer();
  } else {
    console.error("Server error:", err);
  }
});

startServer();
