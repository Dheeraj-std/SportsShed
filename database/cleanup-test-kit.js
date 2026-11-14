
const { db } = require("./db");

db.run(
    "DELETE FROM kits WHERE kit_name = ?",
    ["Test Cricket Bat"],
    function (err) {
        if (err) {
            console.error("Cleanup failed:", err.message);
        } else {
            console.log("Test kits removed:", this.changes);
        }

        db.close();
    }
);
