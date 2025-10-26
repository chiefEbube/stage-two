# HNG Stage 2 - Country Currency & Exchange API

This is a Node.js and Express RESTful API built for the HNG Internship (Stage 2). The service fetches country and currency exchange rate data from external APIs, processes and merges this data, calculates an estimated GDP, and caches the results in a MySQL database. It provides endpoints to refresh the cache, retrieve country data with filtering and sorting, and view a status summary including a generated image.

## Features

* **Data Caching**: Fetches data from `restcountries.com` and `open.er-api.com`.
* **Data Processing**: Calculates estimated GDP based on population and exchange rates.
* **MySQL Persistence**: Stores processed country data in a MySQL database.
* **CRUD Operations**: Provides endpoints to refresh data, get all/specific countries, and delete countries.
* **Filtering & Sorting**: Supports filtering countries by region or currency and sorting by various fields.
* **Image Generation**: Creates a summary image (`cache/summary.png`) showing total countries, top 5 by GDP, and last refresh time.
* **Status Endpoint**: Provides a quick overview of the cache status.
* **Robust Error Handling**: Handles external API failures, database errors, and invalid requests gracefully.

---

## 1. Setup and Installation

Follow these steps to get the project running on your local machine.

1.  **Prerequisites**:
    * Node.js (v16 or later recommended)
    * npm (usually comes with Node.js)
    * MySQL Server (v8.0 or later recommended) running locally or accessible.
    * A tool to interact with MySQL (e.g., MySQL Workbench, DBeaver, or command line).

2.  **Clone the Repository**:
    ```bash
    git clone [https://github.com/chiefEbube/stage-two.git](https://github.com/chiefEbube/stage-two.git)
    cd stage-two
    ```

3.  **Install Dependencies**:
    ```bash
    npm install
    ```

4.  **Database Setup**:
    * Connect to your MySQL server using your preferred tool.
    * Create the database for this project:
        ```sql
        CREATE DATABASE hng_stage2;
        ```

5.  **Environment Variables**:
    * Create a file named `.env` in the project root.
    * Fill in your MySQL database credentials.

    ```dotenv

    PORT=3000

    DB_HOST=localhost
    DB_USER= # Or your MySQL username
    DB_PASSWORD= # Your mysql password
    DB_NAME=hng_stage2
    ```

---

## 2. List of Dependencies

This project uses the following core `npm` packages:

* **express**: Web application framework.
* **cors**: Middleware for enabling CORS.
* **axios**: Promise-based HTTP client for fetching external API data.
* **mysql2**: MySQL client library for Node.js (with Promise support).
* **dotenv**: Loads environment variables from a `.env` file.
* **canvas**: Cairo-backed Canvas implementation for Node.js (used for image generation). Requires system dependencies (see [Installation Guide](https://github.com/Automattic/node-canvas#compiling)).

---

## 3. Running the Application Locally

1.  **Start the Server**:
    ```bash
    npm start
    ```
    The server will connect to the database, automatically create the `countries` table if it doesn't exist, and start listening on the configured port (default: 3000). You should see console output like:
    `Database connection established.`
    `Table 'countries' is ready.`
    `Server is running on port 3000`

2.  **Initial Data Load**: The database starts empty. You **must** call the refresh endpoint at least once to populate it:
    * Send a `POST` request to `http://localhost:3000/countries/refresh` using Postman or `curl`.
    * This will fetch data and populate the database (takes a few seconds).

---

## 4. API Documentation

Test endpoints using an API client like Postman.

### 1. Refresh Country Data

Fetches data from external APIs, processes it, updates the database cache, and generates the summary image.

* **Endpoint**: `POST /countries/refresh`
* **Request Body**: (None)
* **Success Response (201 Created)**:
    ```json
    {
      "message": "Countries refreshed successfully.",
      "total_updated": 250
    }
    ```
* **Error Responses**:
    * `503 Service Unavailable`: If an external API fails.
    * `500 Internal Server Error`: If a database error occurs during the transaction.

### 2. Get All Countries

Retrieves all countries from the database cache, with optional filtering and sorting.

* **Endpoint**: `GET /countries`
* **Query Parameters (Optional)**:
    * `region`: (string) Filter by region (e.g., `Africa`).
    * `currency`: (string) Filter by currency code (e.g., `NGN`).
    * `sort`: (string) Sort results. Options:
        * `gdp_desc` (Default if invalid/none specified), `gdp_asc`
        * `name_desc`, `name_asc`
        * `population_desc`, `population_asc`
* **Example URL**: `http://localhost:3000/countries?region=Africa&sort=gdp_desc`
* **Success Response (200 OK)**:
    ```json
    [
      {
        "id": 1,
        "name": "Nigeria",
        "capital": "Abuja",
        "region": "Africa",
        // ... other fields
        "last_refreshed_at": "2025-10-26T15:30:00.000Z"
      },
      // ... more countries
    ]
    ```
* **Error Responses**:
    * `400 Bad Request`: For invalid query parameters.
    * `500 Internal Server Error`: For database errors.

### 3. Get Specific Country

Retrieves a single country by its name from the database cache.

* **Endpoint**: `GET /countries/:name`
* **URL Parameter**:
    * `:name` (string) - The URL-encoded name of the country (e.g., `United%20States`).
* **Example URL**: `http://localhost:3000/countries/Nigeria`
* **Success Response (200 OK)**:
    ```json
    {
      "id": 1,
      "name": "Nigeria",
      "capital": "Abuja",
      // ... other fields
      "last_refreshed_at": "2025-10-26T15:30:00.000Z"
    }
    ```
* **Error Response**:
    * `404 Not Found`: If the country name does not exist in the database.
    * `500 Internal Server Error`: For database errors.

### 4. Delete Country

Deletes a country record from the database cache by its name.

* **Endpoint**: `DELETE /countries/:name`
* **URL Parameter**:
    * `:name` (string) - The URL-encoded name of the country.
* **Example URL**: `http://localhost:3000/countries/Nigeria`
* **Success Response (204 No Content)**:
    * An empty response body.
* **Error Response**:
    * `404 Not Found`: If the country name does not exist.
    * `500 Internal Server Error`: For database errors.

### 5. Get Service Status

Returns the total number of countries currently in the cache and the timestamp of the last successful refresh.

* **Endpoint**: `GET /status`
* **Success Response (200 OK)**:
    ```json
    {
      "total_countries": 250,
      "last_refreshed_at": "2025-10-26T15:30:00.123Z" // ISO 8601 Timestamp or null if never refreshed
    }
    ```
* **Error Response**:
    * `500 Internal Server Error`: For database errors.

### 6. Get Summary Image

Serves the generated summary image (`cache/summary.png`).

* **Endpoint**: `GET /countries/image`
* **Success Response (200 OK)**:
    * The image file (`Content-Type: image/png`).
* **Error Response**:
    * `404 Not Found`: If the summary image has not been generated yet (run `POST /countries/refresh` first). Response body: `{"error": "Summary image not found"}`.