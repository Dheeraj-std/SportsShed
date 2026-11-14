
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "sportshed.db");

const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.get("PRAGMA foreign_keys = ON", (err) => {
            if (err) {
                return reject(err);
            }

            const schemaPath = path.join(__dirname, "schema.sql");

            let schema;

            try {
                schema = fs.readFileSync(schemaPath, "utf8");
            } catch (error) {
                return reject(error);
            }

            db.exec(schema, (err) => {
                if (err) {
                    return reject(err);
                }

                console.log("All database tables initialized successfully.");
                resolve();
            });
        });
    });
}

module.exports = {
    db,
    initializeDatabase
};
