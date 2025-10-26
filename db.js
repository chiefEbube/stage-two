const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const setupDatabase = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log("Database connection established.");
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS countries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        capital VARCHAR(255),
        region VARCHAR(255),
        population BIGINT NOT NULL,
        currency_code VARCHAR(10),
        exchange_rate DECIMAL(20, 5),
        estimated_gdp DECIMAL(30, 5),
        flag_url TEXT,
        last_refreshed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;
    
    await connection.query(createTableSQL);
    console.log("Table 'countries' is ready.");
    
  } catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1); 
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { pool, setupDatabase };