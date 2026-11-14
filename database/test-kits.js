
const { db, initializeDatabase } = require("./db");

async function testKits() {
    try {
        await initializeDatabase();

        // Insert a kit with total and available quantity equal
        db.run(
            `INSERT INTO kits
            (kit_name, sport, quantity, available_quantity)
            VALUES (?, ?, ?, ?)`,
            ["Test Cricket Bat", "Cricket", 10, 10],
            function (err) {
                if (err) {
                    console.error("Insert failed:", err.message);
                } else {
                    console.log("Kit inserted successfully.");

                    db.get(
                        "SELECT * FROM kits WHERE kit_id = ?",
                        [this.lastID],
                        (err, row) => {
                            if (err) {
                                console.error(err.message);
                            } else {
                                console.table(row);
                                console.log(
                                    "Quantity initialization:",
                                    row.quantity === row.available_quantity
                                        ? "PASSED"
                                        : "FAILED"
                                );
                            }

                            db.close();
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.error("Test failed:", error.message);
        db.close();
    }
}

testKits();
