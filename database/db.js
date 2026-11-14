
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Database file location
const dbPath = path.join(__dirname, "sportshed.db");

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
        return;
    }

    console.log("Connected to SportsShed SQLite database.");

    // Enable foreign key constraints
    db.run("PRAGMA foreign_keys = ON", (err) => {
        if (err) {
            console.error("Foreign key setup failed:", err.message);
            return;
        }

        // Read SQL schema file
        const schemaPath = path.join(__dirname, "schema.sql");

        try {
            const schema = fs.readFileSync(schemaPath, "utf8");

            // Execute table creation queries
            db.exec(schema, (err) => {
                if (err) {
                    console.error("Table creation failed:", err.message);
                } else {
                    console.log("All database tables created successfully.");
                }
            });

        } catch (error) {
            console.error("Schema file reading failed:", error.message);
        }
    });
});

module.exports = db;
