const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL || 'file:local_sqlite.db';
const authToken = process.env.TURSO_AUTH_TOKEN || '';

const client = createClient({
  url: url,
  authToken: authToken
});

async function main() {
  console.log(`Initializing database: ${url}...`);

  // Create tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      status TEXT NOT NULL,
      lastUpdated TEXT NOT NULL,
      currentTask TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      idType TEXT,
      idNumber TEXT,
      salaryPerMonth REAL DEFAULT 0,
      advanceBalance REAL DEFAULT 0
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS employee_ledger (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      memberId TEXT NOT NULL,
      memberName TEXT NOT NULL,
      date TEXT NOT NULL,
      loginTime TEXT NOT NULL,
      logoutTime TEXT,
      approvalStatus TEXT NOT NULL,
      FOREIGN KEY (memberId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS productivity (
      date TEXT NOT NULL,
      memberId TEXT NOT NULL,
      working INTEGER DEFAULT 0,
      idle INTEGER DEFAULT 0,
      break INTEGER DEFAULT 0,
      PRIMARY KEY (date, memberId),
      FOREIGN KEY (memberId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      memberId TEXT NOT NULL,
      memberName TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL,
      notes TEXT,
      details TEXT,
      FOREIGN KEY (memberId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS query_sessions (
      id TEXT PRIMARY KEY,
      memberId TEXT NOT NULL,
      memberName TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT NOT NULL,
      duration INTEGER NOT NULL,
      FOREIGN KEY (memberId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      memberId TEXT NOT NULL,
      memberName TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      assignedBy TEXT NOT NULL,
      timeSpent INTEGER DEFAULT 0,
      lastStartedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (memberId) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      employeeId TEXT,
      employeeName TEXT,
      action TEXT NOT NULL
    )
  `);

  console.log("Tables created successfully.");

  // Check if employees table is already populated
  const empCheck = await client.execute("SELECT COUNT(*) as count FROM employees");
  const count = empCheck.rows[0].count;

  if (count === 0) {
    console.log("Seeding default clean employees...");
    const defaultEmployees = [
      { id: "emp_1", name: "Aarav Mehta", pin: "1111", status: "Offline", phone: "9876543210", email: "aarav@trackflow.com", address: "Sector 15, Gurgaon", idType: "Passport", idNumber: "L8927402", salary: 3200 },
      { id: "emp_2", name: "Diya Sen", pin: "2222", status: "Offline", phone: "9812345678", email: "diya@trackflow.com", address: "Salt Lake, Kolkata", idType: "Aadhaar Card", idNumber: "9827-1029-4821", salary: 3000 },
      { id: "emp_3", name: "Kabir Kapoor", pin: "3333", status: "Offline", phone: "9988776655", email: "kabir@trackflow.com", address: "Bandra West, Mumbai", idType: "Pan Card", idNumber: "ABCDE1234F", salary: 3500 },
      { id: "emp_4", name: "Ananya Roy", pin: "4444", status: "Offline", phone: "9898989898", email: "ananya@trackflow.com", address: "Indiranagar, Bangalore", idType: "Driving License", idNumber: "KA03-2023-1928", salary: 3100 }
    ];

    const nowIso = new Date().toISOString();
    for (const emp of defaultEmployees) {
      await client.execute({
        sql: `INSERT INTO employees (id, name, pin, status, lastUpdated, currentTask, phone, email, address, idType, idNumber, salaryPerMonth, advanceBalance) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [emp.id, emp.name, emp.pin, emp.status, nowIso, null, emp.phone, emp.email, emp.address, emp.idType, emp.idNumber, emp.salary, 0]
      });
    }

    // Seed initial startup log
    await client.execute({
      sql: `INSERT INTO logs (timestamp, employeeId, employeeName, action) VALUES (?, ?, ?, ?)`,
      args: [nowIso, 'system', 'System', 'Tracker started.']
    });

    console.log("Seeding completed.");
  } else {
    console.log("Database already has employees. Skipping seed.");
  }
}

main()
  .then(() => {
    console.log("Database initialized successfully!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Error initializing database:", err);
    process.exit(1);
  });
