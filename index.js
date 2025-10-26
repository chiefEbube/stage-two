const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, setupDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

let lastRefreshedAt = null;

function getRandomMultiplier() {
  return Math.random() * (2000 - 1000) + 1000;
}

async function generateSummaryImage(total, top5) {
  const cacheDir = path.join(__dirname, 'cache');
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 800, 400);
  
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('Country GDP Summary', 50, 50);
  
  ctx.font = '20px Arial';
  ctx.fillText(`Total Countries: ${total}`, 50, 100);
  ctx.fillText(`Last Refresh: ${new Date().toISOString()}`, 50, 130);
  
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Top 5 Countries by Estimated GDP:', 50, 180);
  
  ctx.font = '18px Arial';
  let yPos = 210;
  for (const country of top5) {
    const gdpNumber = parseFloat(country.estimated_gdp);
    let gdpString = 'N/A';

    if (!isNaN(gdpNumber) && country.estimated_gdp !== null) {
        gdpString = gdpNumber.toFixed(0);
    }

    ctx.fillText(`${country.name}: $${gdpString}`, 50, yPos);
    yPos += 30;
  }
  
  const imagePath = path.join(cacheDir, 'summary.png');
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);
  console.log("Summary image generated.");
}

app.post('/countries/refresh', async (req, res) => {
  let connection;
  try {
    console.log("Starting data refresh...");
    const countriesURL = 'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies';
    const ratesURL = 'https://open.er-api.com/v6/latest/USD';
    
    const [countriesRes, ratesRes] = await Promise.all([
      axios.get(countriesURL, { timeout: 10000 }),
      axios.get(ratesURL, { timeout: 10000 })
    ]);
    
    const countries = countriesRes.data;
    const rates = ratesRes.data.rates;
    console.log(`Fetched ${countries.length} countries and ${Object.keys(rates).length} exchange rates.`);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    console.log("Updating database records...");

    for (const country of countries) {
      if (!country.name || !country.population) {
        console.warn(`Skipping country with missing name or population: ${JSON.stringify(country)}`);
        continue; 
      }
      
      let currencyCode = null;
      let exchangeRate = null;
      let estimatedGdp = 0;
      
      if (country.currencies && country.currencies.length > 0 && country.currencies[0].code) {
        currencyCode = country.currencies[0].code;
        
        if (rates[currencyCode]) {
          exchangeRate = rates[currencyCode];
          const multiplier = getRandomMultiplier();
          estimatedGdp = (country.population * multiplier) / exchangeRate;
        }
      }

      const countryData = {
        name: country.name,
        capital: country.capital || null,
        region: country.region || null,
        population: country.population,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        estimated_gdp: estimatedGdp === 0 ? null : estimatedGdp,
        flag_url: country.flag || null
      };

      const upsertSQL = `
        INSERT INTO countries (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          capital = VALUES(capital),
          region = VALUES(region),
          population = VALUES(population),
          currency_code = VALUES(currency_code),
          exchange_rate = VALUES(exchange_rate),
          estimated_gdp = VALUES(estimated_gdp),
          flag_url = VALUES(flag_url);
      `;
      
      await connection.query(upsertSQL, [
        countryData.name, countryData.capital, countryData.region,
        countryData.population, countryData.currency_code, countryData.exchange_rate,
        countryData.estimated_gdp, countryData.flag_url
      ]);
    }
    
    console.log("Generating summary image...");
    const [totalRows] = await connection.query("SELECT COUNT(*) as total FROM countries");
    const [top5Rows] = await connection.query("SELECT name, estimated_gdp FROM countries ORDER BY estimated_gdp DESC LIMIT 5");
    
    await generateSummaryImage(totalRows[0].total, top5Rows);
    
    await connection.commit();
    lastRefreshedAt = new Date().toISOString();
    console.log("Database refresh successful.");
    
    res.status(201).json({ 
      message: "Countries refreshed successfully.",
      total_updated: countries.length
    });

  } catch (error) {
    if (connection) {
      console.error("Rolling back database transaction...");
      await connection.rollback();
    }

    if (error.isAxiosError) {
      console.error("External API error:", error.message);
      return res.status(503).json({ 
        error: "External data source unavailable", 
        details: `Could not fetch data from ${error.config.url}` 
      });
    }
    
    console.error("Internal server error during refresh:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
    
  } finally {
    if (connection) {
      connection.release();
      console.log("Database connection released.");
    }
  }
});


app.get('/countries/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const sql = "SELECT * FROM countries WHERE name = ?";
    const [rows] = await pool.query(sql, [name]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Country not found" });
    }

    res.status(200).json(rows[0]);

  } catch (error) {
    console.error("Error in GET /countries/:name :", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get('/countries', async (req, res) => {
  try {
    const validSortFields = {
      'gdp_desc': 'estimated_gdp DESC',
      'gdp_asc': 'estimated_gdp ASC',
      'name_desc': 'name DESC',
      'name_asc': 'name ASC',
      'population_desc': 'population DESC',
      'population_asc': 'population ASC'
    };
    
    let sql = "SELECT * FROM countries";
    const params = [];
    const whereClauses = [];

    const { region, currency, sort } = req.query;

    if (region) {
      whereClauses.push("region = ?");
      params.push(region);
    }

    if (currency) {
      whereClauses.push("currency_code = ?");
      params.push(currency);
    }

    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }

    if (sort && validSortFields[sort]) {
      sql += ` ORDER BY ${validSortFields[sort]}`;
    }
    
    console.log(`Executing SQL: ${sql} with params: ${params}`);
    const [rows] = await pool.query(sql, params);

    res.status(200).json(rows);

  } catch (error) {
    console.error("Error in GET /countries :", error);
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(400).json({ error: "Validation failed", details: "Invalid query parameter." });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});


app.delete('/countries/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const sql = "DELETE FROM countries WHERE name = ?";
    const [result] = await pool.query(sql, [name]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Country not found" });
    }

    res.status(204).send();

  } catch (error) {
    console.error("Error in DELETE /countries/:name :", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/status', async (req, res) => {
  try {
    const sql = "SELECT COUNT(*) as total_countries FROM countries";
    const [rows] = await pool.query(sql);
    
    res.status(200).json({
      total_countries: rows[0].total_countries,
      last_refreshed_at: lastRefreshedAt 
    });
    
  } catch (error) {
    console.error("Error in GET /status :", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get('/countries/image', (req, res) => {
  const imagePath = path.join(__dirname, 'cache', 'summary.png');
  
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: "Summary image not found" });
  }
});

const startServer = async () => {
  await setupDatabase(); 
  
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();