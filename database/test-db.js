
const db = require("./db");

db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
    (err, rows) => {
        if (err) {
            console.error("Error:", err.message);
        } else {
            console.log("\nSportsShed Database Tables:");
            console.table(rows);
        }

        db.close();
    }
);
