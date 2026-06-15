const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL || 'file:local_sqlite.db';
const authToken = process.env.TURSO_AUTH_TOKEN || '';

const client = createClient({
  url: url,
  authToken: authToken
});

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Global in-memory cache
let dbCache = null;

const defaultDb = {
  employees: [
    { id: "emp_1", name: "Aarav Mehta", pin: "1111", status: "Offline", lastUpdated: new Date().toISOString(), currentTask: null, phone: "9876543210", email: "aarav@trackflow.com", address: "Sector 15, Gurgaon", idType: "Passport", idNumber: "L8927402", salaryPerMonth: 3200, advanceBalance: 0, ledger: [] },
    { id: "emp_2", name: "Diya Sen", pin: "2222", status: "Offline", lastUpdated: new Date().toISOString(), currentTask: null, phone: "9812345678", email: "diya@trackflow.com", address: "Salt Lake, Kolkata", idType: "Aadhaar Card", idNumber: "9827-1029-4821", salaryPerMonth: 3000, advanceBalance: 0, ledger: [] },
    { id: "emp_3", name: "Kabir Kapoor", pin: "3333", status: "Offline", lastUpdated: new Date().toISOString(), currentTask: null, phone: "9988776655", email: "kabir@trackflow.com", address: "Bandra West, Mumbai", idType: "Pan Card", idNumber: "ABCDE1234F", salaryPerMonth: 3500, advanceBalance: 0, ledger: [] },
    { id: "emp_4", name: "Ananya Roy", pin: "4444", status: "Offline", lastUpdated: new Date().toISOString(), currentTask: null, phone: "9898989898", email: "ananya@trackflow.com", address: "Indiranagar, Bangalore", idType: "Driving License", idNumber: "KA03-2023-1928", salaryPerMonth: 3100, advanceBalance: 0, ledger: [] }
  ],
  logs: [
    {
      timestamp: new Date().toISOString(),
      employeeId: "system",
      employeeName: "System",
      action: "Tracker started."
    }
  ],
  attendance: [],
  productivity: {},
  requests: [],
  querySessions: [],
  tasks: []
};

// Helper to convert DB rows to matching JS types
function parseEmployee(row) {
  if (!row) return null;
  return {
    ...row,
    currentTask: row.currentTask ? JSON.parse(row.currentTask) : null,
    ledger: []
  };
}

function parseRequest(row) {
  if (!row) return null;
  return {
    ...row,
    details: row.details ? JSON.parse(row.details) : {}
  };
}

// Load database state from Turso SQL tables
async function loadFromTurso() {
  try {
    const [empRes, ledRes, attRes, prodRes, reqRes, qSessRes, taskRes, logRes] = await Promise.all([
      client.execute("SELECT * FROM employees ORDER BY name ASC"),
      client.execute("SELECT * FROM employee_ledger ORDER BY date DESC"),
      client.execute("SELECT * FROM attendance ORDER BY loginTime DESC"),
      client.execute("SELECT * FROM productivity"),
      client.execute("SELECT * FROM requests ORDER BY date DESC"),
      client.execute("SELECT * FROM query_sessions ORDER BY startedAt DESC"),
      client.execute("SELECT * FROM tasks ORDER BY createdAt DESC"),
      client.execute("SELECT * FROM logs ORDER BY timestamp DESC")
    ]);

    if (empRes.rows.length === 0) {
      return null;
    }

    const employeesMap = {};
    const employees = empRes.rows.map(row => {
      const emp = parseEmployee(row);
      employeesMap[emp.id] = emp;
      return emp;
    });

    ledRes.rows.forEach(row => {
      const led = {
        id: row.id,
        date: row.date,
        type: row.type,
        amount: row.amount,
        notes: row.notes
      };
      if (employeesMap[row.employeeId]) {
        employeesMap[row.employeeId].ledger.push(led);
      }
    });

    const attendance = attRes.rows.map(row => ({
      id: row.id,
      memberId: row.memberId,
      memberName: row.memberName,
      date: row.date,
      loginTime: row.loginTime,
      logoutTime: row.logoutTime,
      approvalStatus: row.approvalStatus || 'Approved'
    }));

    const productivity = {};
    prodRes.rows.forEach(row => {
      if (!productivity[row.date]) {
        productivity[row.date] = {};
      }
      productivity[row.date][row.memberId] = {
        Working: row.working || 0,
        Idle: row.idle || 0,
        Break: row.break || 0
      };
    });

    const requests = reqRes.rows.map(parseRequest);
    const querySessions = qSessRes.rows;
    
    const tasks = taskRes.rows.map(row => ({
      id: row.id,
      memberId: row.memberId,
      memberName: row.memberName,
      category: row.category,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignedBy: row.assignedBy,
      timeSpent: row.timeSpent || 0,
      lastStartedAt: row.lastStartedAt,
      createdAt: row.createdAt
    }));

    const logs = logRes.rows.map(row => ({
      timestamp: row.timestamp,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      action: row.action
    }));

    return {
      employees,
      logs,
      attendance,
      productivity,
      requests,
      querySessions,
      tasks
    };
  } catch (err) {
    console.error("Error loading database from Turso:", err);
    return null;
  }
}

// Write in-memory cache back to Turso SQL tables
async function syncToTurso(db) {
  try {
    const queries = [];
    
    // 1. Employees
    queries.push({ sql: "DELETE FROM employees", args: [] });
    db.employees.forEach(emp => {
      queries.push({
        sql: `INSERT INTO employees (id, name, pin, status, lastUpdated, currentTask, phone, email, address, idType, idNumber, salaryPerMonth, advanceBalance) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          emp.id, 
          emp.name, 
          emp.pin, 
          emp.status, 
          emp.lastUpdated, 
          emp.currentTask ? JSON.stringify(emp.currentTask) : null,
          emp.phone || "",
          emp.email || "",
          emp.address || "",
          emp.idType || "National ID",
          emp.idNumber || "",
          emp.salaryPerMonth || 0,
          emp.advanceBalance || 0
        ]
      });
      
      // Ledgers
      if (emp.ledger && emp.ledger.length > 0) {
        emp.ledger.forEach(led => {
          queries.push({
            sql: `INSERT INTO employee_ledger (id, employeeId, date, type, amount, notes) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [led.id, emp.id, led.date, led.type, led.amount, led.notes || ""]
          });
        });
      }
    });
    
    // 2. Attendance
    queries.push({ sql: "DELETE FROM attendance", args: [] });
    if (db.attendance) {
      db.attendance.forEach(att => {
        queries.push({
          sql: `INSERT INTO attendance (id, memberId, memberName, date, loginTime, logoutTime, approvalStatus) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [att.id, att.memberId, att.memberName, att.date, att.loginTime, att.logoutTime, att.approvalStatus || 'Approved']
        });
      });
    }
    
    // 3. Productivity
    queries.push({ sql: "DELETE FROM productivity", args: [] });
    if (db.productivity) {
      Object.keys(db.productivity).forEach(date => {
        Object.keys(db.productivity[date]).forEach(memberId => {
          const prod = db.productivity[date][memberId];
          queries.push({
            sql: `INSERT INTO productivity (date, memberId, working, idle, break) 
                  VALUES (?, ?, ?, ?, ?)`,
            args: [date, memberId, prod.Working || 0, prod.Idle || 0, prod.Break || 0]
          });
        });
      });
    }
    
    // 4. Requests
    queries.push({ sql: "DELETE FROM requests", args: [] });
    if (db.requests) {
      db.requests.forEach(req => {
        queries.push({
          sql: `INSERT INTO requests (id, memberId, memberName, type, date, status, amount, notes, details) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [req.id, req.memberId, req.memberName, req.type, req.date, req.status, req.amount, req.notes || "", JSON.stringify(req.details || {})]
        });
      });
    }
    
    // 5. Query sessions
    queries.push({ sql: "DELETE FROM query_sessions", args: [] });
    if (db.querySessions) {
      db.querySessions.forEach(qs => {
        queries.push({
          sql: `INSERT INTO query_sessions (id, memberId, memberName, category, description, startedAt, endedAt, duration) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [qs.id, qs.memberId, qs.memberName, qs.category, qs.description, qs.startedAt, qs.endedAt, qs.duration]
        });
      });
    }
    
    // 6. Tasks
    queries.push({ sql: "DELETE FROM tasks", args: [] });
    if (db.tasks) {
      db.tasks.forEach(task => {
        queries.push({
          sql: `INSERT INTO tasks (id, memberId, memberName, category, description, status, priority, assignedBy, timeSpent, lastStartedAt, createdAt) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [task.id, task.memberId, task.memberName, task.category, task.description, task.status, task.priority, task.assignedBy, task.timeSpent || 0, task.lastStartedAt, task.createdAt]
        });
      });
    }
    
    // 7. Logs
    queries.push({ sql: "DELETE FROM logs", args: [] });
    if (db.logs) {
      db.logs.forEach(log => {
        queries.push({
          sql: `INSERT INTO logs (timestamp, employeeId, employeeName, action) VALUES (?, ?, ?, ?)`,
          args: [log.timestamp, log.employeeId || 'system', log.employeeName || 'System', log.action]
        });
      });
    }

    await client.batch(queries);
  } catch (err) {
    console.error("Error syncing database to Turso:", err);
  }
}

// Startup Initialization
async function initDatabase() {
  console.log("Loading database from Turso...");
  let loaded = await loadFromTurso();
  
  if (!loaded) {
    console.log("Turso database is empty or connection failed. Initializing with defaults...");
    loaded = defaultDb;
    await syncToTurso(loaded);
  } else {
    console.log("Database successfully loaded from Turso.");
  }
  
  dbCache = loaded;
  
  // Write to local json file as sync fallback for automated tests
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
}

// Synchronous Adapter methods for server.js
function readDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading fallback db.json:", err);
  }
  return dbCache || defaultDb;
}

function writeDb(data) {
  dbCache = data;
  
  // 1. Write synchronously to local json file (so existing test scripts pass immediately)
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing to fallback db.json:", err);
  }
  
  // 2. Sync asynchronously to Turso in the background
  syncToTurso(data).catch(err => {
    console.error("Failed background sync to Turso:", err);
  });
}

module.exports = {
  initDatabase,
  readDb,
  writeDb
};
