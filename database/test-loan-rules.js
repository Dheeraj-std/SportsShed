const { db, initializeDatabase } = require("./db");
const loanRules = require("../services/loanRules");

async function runAllTests() {
    console.log("=================================================");
    console.log("  Testing SportsShed Person 4 - Complete Suite   ");
    console.log("  1. Standard 201 -> 409 -> Return -> 201 Flow   ");
    console.log("  2. Atomic Rollback Verification                ");
    console.log("  3. Concurrent Loan Requests Safety             ");
    console.log("=================================================\n");

    try {
        await initializeDatabase();

        // -------------------------------------------------------------
        // TEST 1: Standard 201 -> 409 -> Return -> 201
        // -------------------------------------------------------------
        console.log(">>> TEST 1: Standard 201 -> 409 -> Return -> 201");

        const p1Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)",
                ["Test Player 1", "test_p1@test.org", "1111111111"],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const p2Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)",
                ["Test Player 2", "test_p2@test.org", "2222222222"],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const kit1Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO kits (kit_name, sport, quantity, available_quantity) VALUES (?, ?, ?, ?)",
                ["Test Kit 101", "Cricket", 1, 1],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Step 1: Player 1 requests Kit 101
        console.log("\n  [1.1] Player 1 requests Kit 101...");
        const step1Res = await loanRules.createLoanAsync({
            player_id: p1Id,
            kit_id: kit1Id,
            issue_date: "2026-11-14"
        });
        console.log("  ✓ Status: 201 Created (Loan ID:", step1Res.loan_id + ")");

        // Check DB state: kit available_quantity should be 0
        const kitState1 = await new Promise(r => db.get("SELECT available_quantity FROM kits WHERE kit_id = ?", [kit1Id], (e, row) => r(row)));
        if (kitState1.available_quantity !== 0) throw new Error("Kit available_quantity was not decremented!");
        console.log("  ✓ Kit available_quantity decremented to 0");

        // Step 2: Player 2 requests Kit 101 while still on loan
        console.log("\n  [1.2] Player 2 requests Kit 101 (Double booking attempt)...");
        try {
            await loanRules.createLoanAsync({
                player_id: p2Id,
                kit_id: kit1Id,
                issue_date: "2026-11-14"
            });
            throw new Error("FAIL: Double booking was allowed!");
        } catch (err) {
            if (err.status !== 409) throw new Error("Expected 409 Conflict, got " + err.status);
            console.log("  ✓ Blocked with 409 Conflict:", err.message);
        }

        // Step 3: Player 1 returns Kit 101
        console.log("\n  [1.3] Player 1 returns Kit 101...");
        const returnRes = await loanRules.returnLoanAsync(step1Res.loan_id, "2026-11-14");
        console.log("  ✓ Status: 200 OK (Loan marked as RETURNED)");

        // Check DB state: kit available_quantity should be 1
        const kitState2 = await new Promise(r => db.get("SELECT available_quantity FROM kits WHERE kit_id = ?", [kit1Id], (e, row) => r(row)));
        if (kitState2.available_quantity !== 1) throw new Error("Kit available_quantity was not restored!");
        console.log("  ✓ Kit available_quantity restored to 1");

        // Step 4: Player 2 requests Kit 101 again
        console.log("\n  [1.4] Player 2 requests Kit 101 again...");
        const step4Res = await loanRules.createLoanAsync({
            player_id: p2Id,
            kit_id: kit1Id,
            issue_date: "2026-11-14"
        });
        console.log("  ✓ Status: 201 Created (Loan ID:", step4Res.loan_id + ")");
        console.log("  >>> TEST 1 PASSED!\n");

        // -------------------------------------------------------------
        // TEST 2: Atomic Rollback on Failure
        // -------------------------------------------------------------
        console.log(">>> TEST 2: Atomic Rollback on Failure");

        // Attempt loan with non-existent player -> should rollback
        const loanCountBefore = await new Promise(r => db.get("SELECT COUNT(*) as c FROM loans", (e, row) => r(row.c)));
        try {
            await loanRules.createLoanAsync({
                player_id: 999999, // non-existent player
                kit_id: kit1Id,
                issue_date: "2026-11-14"
            });
            throw new Error("Should have failed for invalid player");
        } catch (err) {
            console.log("  ✓ Rejected invalid player (Status:", err.status, "-", err.message + ")");
        }
        const loanCountAfter = await new Promise(r => db.get("SELECT COUNT(*) as c FROM loans", (e, row) => r(row.c)));
        if (loanCountBefore !== loanCountAfter) throw new Error("Rollback failed! Orphan loan was inserted.");
        console.log("  ✓ Verified: Zero orphaned rows created. Transaction rolled back cleanly.");
        console.log("  >>> TEST 2 PASSED!\n");

        // -------------------------------------------------------------
        // TEST 3: Concurrent Loan Requests Safety
        // -------------------------------------------------------------
        console.log(">>> TEST 3: Concurrent Loan Requests Safety");
        // Create a new kit with quantity 1
        const concurrentKitId = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO kits (kit_name, sport, quantity, available_quantity) VALUES (?, ?, ?, ?)",
                ["Concurrent Football", "Football", 1, 1],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Create player 3
        const p3Id = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)",
                ["Test Player 3", "test_p3@test.org", "3333333333"],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        console.log("  Firing 3 concurrent requests simultaneously for Concurrent Football...");
        const concurrentAttempts = [
            loanRules.createLoanAsync({ player_id: p1Id, kit_id: concurrentKitId, issue_date: "2026-11-14" }),
            loanRules.createLoanAsync({ player_id: p2Id, kit_id: concurrentKitId, issue_date: "2026-11-14" }),
            loanRules.createLoanAsync({ player_id: p3Id, kit_id: concurrentKitId, issue_date: "2026-11-14" })
        ];

        const results = await Promise.allSettled(concurrentAttempts);
        const fulfilled = results.filter(r => r.status === "fulfilled");
        const rejected = results.filter(r => r.status === "rejected");

        console.log(`  Results: ${fulfilled.length} succeeded, ${rejected.length} rejected`);

        if (fulfilled.length !== 1) {
            throw new Error(`Concurrency violation! Expected exactly 1 success, got ${fulfilled.length}`);
        }
        if (rejected.length !== 2) {
            throw new Error(`Expected exactly 2 rejections, got ${rejected.length}`);
        }

        rejected.forEach((rej, idx) => {
            console.log(`  ✓ Rejection ${idx + 1}: Status ${rej.reason.status} (${rej.reason.message})`);
            if (rej.reason.status !== 409) {
                throw new Error("Concurrent rejection should be 409 Conflict, got " + rej.reason.status);
            }
        });

        // Verify active loans in DB for this kit
        const activeLoans = await new Promise(r => db.all("SELECT * FROM loans WHERE kit_id = ? AND status = 'ACTIVE'", [concurrentKitId], (e, rows) => r(rows)));
        console.log(`  ✓ Active loans in DB for kit: ${activeLoans.length} (Expected: 1)`);
        if (activeLoans.length !== 1) {
            throw new Error("Double booking detected in DB!");
        }

        const finalKit = await new Promise(r => db.get("SELECT available_quantity FROM kits WHERE kit_id = ?", [concurrentKitId], (e, row) => r(row)));
        console.log(`  ✓ Available quantity in DB: ${finalKit.available_quantity} (Expected: 0)`);
        if (finalKit.available_quantity !== 0) {
            throw new Error("Kit available quantity inconsistent!");
        }

        console.log("  >>> TEST 3 PASSED!\n");

        // -------------------------------------------------------------
        // CLEANUP
        // -------------------------------------------------------------
        console.log(">>> CLEANUP");
        await new Promise(resolve => {
            db.run("DELETE FROM loans WHERE kit_id IN (?, ?)", [kit1Id, concurrentKitId], () => {
                db.run("DELETE FROM kits WHERE kit_id IN (?, ?)", [kit1Id, concurrentKitId], () => {
                    db.run("DELETE FROM players WHERE player_id IN (?, ?, ?)", [p1Id, p2Id, p3Id], () => {
                        console.log("  ✓ Test artifacts cleaned up.");
                        resolve();
                    });
                });
            });
        });

        console.log("\n=================================================");
        console.log("  ALL TESTS PASSED WITH 100% SUCCESS!            ");
        console.log("=================================================");
        process.exit(0);
    } catch (error) {
        console.error("\n❌ TEST SUITE FAILED:", error);
        process.exit(1);
    }
}

runAllTests();
