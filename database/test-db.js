
const { db, initializeDatabase } = require("./db");

async function testDatabase() {
    try {
        await initializeDatabase();

        console.log("\nSportsShed Database Tables:");

        db.all(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
            (err, rows) => {
                if (err) {
                    console.error("Error:", err.message);
                } else {
                    console.table(rows);
                }

                db.close();
            }
        );
    } catch (error) {
        console.error("Database test failed:", error.message);
        db.close();
    }
}

testDatabase();
