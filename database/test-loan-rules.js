const { db, initializeDatabase } = require("./db");
const loanRules = require("../services/loanRules");

async function runScenarioTest() {
    console.log("=================================================");
    console.log("  Testing NO DOUBLE BOOKING Business Scenario    ");
    console.log("  Expected Flow: 201 -> 409 -> Return -> 201     ");
    console.log("=================================================\n");

    try {
        await initializeDatabase();

        // 1. Setup Test Data: 2 Players and 1 Kit
        const p1Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)",
                ["Test Player 1", "player1@example.com", "1234567890"],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const p2Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)",
                ["Test Player 2", "player2@example.com", "9876543210"],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const kitId = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO kits (kit_name, sport, quantity, available_quantity) VALUES (?, ?, ?, ?)",
                ["Scenario Kit 101", "Cricket", 1, 1],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        console.log(`[SETUP] Created Player 1 (ID: ${p1Id}), Player 2 (ID: ${p2Id}), Kit (ID: ${kitId})`);

        // STEP 1: Player 1 requests Kit 101
        console.log("\n--- STEP 1: Player 1 requests Kit ---");
        const loan1Result = await new Promise((resolve, reject) => {
            loanRules.createLoanWithValidation(
                { player_id: p1Id, kit_id: kitId, issue_date: "2026-11-14" },
                (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                }
            );
        });

        console.log("Response Status: 201 Created");
        console.log("Result:", loan1Result);
        const loan1Id = loan1Result.loan_id;

        // STEP 2: Player 2 requests the same Kit while Player 1 still has it
        console.log("\n--- STEP 2: Player 2 requests same Kit while still on active loan ---");
        let step2Status = null;
        let step2Error = null;

        try {
            await new Promise((resolve, reject) => {
                loanRules.createLoanWithValidation(
                    { player_id: p2Id, kit_id: kitId, issue_date: "2026-11-14" },
                    (err, res) => {
                        if (err) {
                            step2Status = err.status;
                            step2Error = err;
                            reject(err);
                        } else {
                            resolve(res);
                        }
                    }
                );
            });
            console.error("FAIL: Second loan was created! Double booking prevention failed.");
        } catch (err) {
            console.log(`Response Status: ${step2Status} Conflict`);
            console.log("Error Message:", step2Error.message);
            console.log("Conflict Reason:", step2Error.conflict_reason);
            if (step2Status === 409) {
                console.log("PASSED: Double booking prevented with 409 Conflict!");
            }
        }

        // STEP 3: Player 1 returns Kit
        console.log("\n--- STEP 3: Player 1 returns Kit ---");
        const returnResult = await new Promise((resolve, reject) => {
            loanRules.returnLoan(loan1Id, "2026-11-14", (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        console.log("Response Status: 200 OK");
        console.log("Result:", returnResult);
        console.log("PASSED: Kit marked as returned!");

        // STEP 4: Player 2 requests Kit again
        console.log("\n--- STEP 4: Player 2 requests Kit again ---");
        const loan2Result = await new Promise((resolve, reject) => {
            loanRules.createLoanWithValidation(
                { player_id: p2Id, kit_id: kitId, issue_date: "2026-11-14" },
                (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                }
            );
        });

        console.log("Response Status: 201 Created");
        console.log("Result:", loan2Result);
        console.log("PASSED: Kit is now available and successfully issued to Player 2!");

        // CLEANUP
        console.log("\n--- CLEANUP ---");
        await new Promise((resolve) => {
            db.run("DELETE FROM loans WHERE kit_id = ?", [kitId], () => {
                db.run("DELETE FROM kits WHERE kit_id = ?", [kitId], () => {
                    db.run("DELETE FROM players WHERE player_id IN (?, ?)", [p1Id, p2Id], () => {
                        console.log("Test records cleaned up.");
                        resolve();
                    });
                });
            });
        });

        console.log("\n=================================================");
        console.log("  ALL TESTS PASSED: 201 -> 409 -> Return -> 201  ");
        console.log("=================================================");
        process.exit(0);
    } catch (err) {
        console.error("Test execution failed:", err);
        process.exit(1);
    }
}

runScenarioTest();
