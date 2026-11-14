const { db } = require("../database/db");

/**
 * Service to enforce business rules for loans with atomic SQLite transactions:
 * 1. Kit Availability & No Double Booking: Kit cannot have two active loans simultaneously.
 * 2. Atomic Loan Issuance: Wrapped in BEGIN IMMEDIATE TRANSACTION / COMMIT / ROLLBACK.
 * 3. Atomic Loan Returns: Restores kit availability and marks loan returned atomically.
 * 4. Concurrency Safety: Transaction serialization queue + DB-level partial unique index.
 */

// Serialized queue for write transactions on the shared SQLite connection
let transactionQueue = Promise.resolve();

/**
 * Execute an operation inside an atomic SQLite transaction.
 * Queues transactions to prevent 'cannot start a transaction within a transaction' error in sqlite3.
 */
function withTransaction(operation) {
    return new Promise((resolve, reject) => {
        transactionQueue = transactionQueue
            .catch(() => {}) // Prevent previous transaction failure from breaking subsequent ones
            .then(() => {
                return new Promise((txResolve, txReject) => {
                    db.run("BEGIN IMMEDIATE TRANSACTION", (beginErr) => {
                        if (beginErr) {
                            return txReject({
                                status: 500,
                                message: "Failed to begin transaction: " + beginErr.message
                            });
                        }

                        let finished = false;

                        const rollback = (err) => {
                            if (finished) return;
                            finished = true;
                            db.run("ROLLBACK", (rollbackErr) => {
                                if (rollbackErr) {
                                    console.error("Rollback error:", rollbackErr.message);
                                }
                                txReject(err);
                            });
                        };

                        const commit = (result) => {
                            if (finished) return;
                            finished = true;
                            db.run("COMMIT", (commitErr) => {
                                if (commitErr) {
                                    db.run("ROLLBACK", () => {
                                        txReject({
                                            status: 500,
                                            message: "Commit failed: " + commitErr.message
                                        });
                                    });
                                } else {
                                    txResolve(result);
                                }
                            });
                        };

                        try {
                            operation(commit, rollback);
                        } catch (exception) {
                            rollback({
                                status: 500,
                                message: "Transaction exception: " + exception.message
                            });
                        }
                    });
                });
            })
            .then(resolve, reject);
    });
}

/**
 * Read-only check to see if a kit is available.
 * An active loan is defined as status = 'ACTIVE' OR return_date IS NULL.
 */
function checkKitAvailability(kit_id, callback) {
    const kitSql = "SELECT * FROM kits WHERE kit_id = ?";
    db.get(kitSql, [kit_id], (err, kit) => {
        if (err) {
            return callback({ status: 500, message: "Error checking kit availability: " + err.message });
        }
        if (!kit) {
            return callback({ status: 404, message: "Kit not found" });
        }

        const activeLoanSql = `
            SELECT * FROM loans 
            WHERE kit_id = ? AND (status = 'ACTIVE' OR return_date IS NULL)
        `;
        db.get(activeLoanSql, [kit_id], (err, activeLoan) => {
            if (err) {
                return callback({ status: 500, message: "Error verifying active loans: " + err.message });
            }

            if (activeLoan) {
                return callback(null, {
                    exists: true,
                    available: false,
                    reason: "ACTIVE_LOAN",
                    message: `Kit ${kit_id} (${kit.kit_name}) is currently on loan and cannot be double booked.`,
                    kit,
                    activeLoan
                });
            }

            if (kit.available_quantity <= 0) {
                return callback(null, {
                    exists: true,
                    available: false,
                    reason: "OUT_OF_STOCK",
                    message: `Kit ${kit_id} (${kit.kit_name}) is currently out of stock.`,
                    kit
                });
            }

            return callback(null, {
                exists: true,
                available: true,
                kit
            });
        });
    });
}

/**
 * Atomic loan creation with double-booking prevention.
 * If any database operation fails, the entire transaction is rolled back.
 */
function createLoanWithValidation({ player_id, kit_id, issue_date }, callback) {
    if (!player_id || !kit_id || !issue_date) {
        const err = {
            status: 400,
            message: "Please provide player_id, kit_id and issue_date"
        };
        if (callback) return callback(err);
        return Promise.reject(err);
    }

    const txPromise = withTransaction((commit, rollback) => {
        // Step 1: Verify player exists
        db.get("SELECT * FROM players WHERE player_id = ?", [player_id], (err, player) => {
            if (err) {
                return rollback({ status: 500, message: "Error checking player: " + err.message });
            }
            if (!player) {
                return rollback({ status: 404, message: "Player not found" });
            }

            // Step 2: Verify kit exists
            db.get("SELECT * FROM kits WHERE kit_id = ?", [kit_id], (err, kit) => {
                if (err) {
                    return rollback({ status: 500, message: "Error checking kit: " + err.message });
                }
                if (!kit) {
                    return rollback({ status: 404, message: "Kit not found" });
                }

                // Step 3: Check for active loan (No Double Booking enforcement)
                const activeLoanSql = `
                    SELECT * FROM loans 
                    WHERE kit_id = ? AND (status = 'ACTIVE' OR return_date IS NULL)
                `;
                db.get(activeLoanSql, [kit_id], (err, activeLoan) => {
                    if (err) {
                        return rollback({ status: 500, message: "Error checking active loan: " + err.message });
                    }

                    if (activeLoan) {
                        return rollback({
                            status: 409,
                            message: `Kit ${kit_id} (${kit.kit_name}) is currently on loan and cannot be double booked.`,
                            conflict_reason: "ACTIVE_LOAN",
                            active_loan: activeLoan
                        });
                    }

                    if (kit.available_quantity <= 0) {
                        return rollback({
                            status: 409,
                            message: `Kit ${kit_id} (${kit.kit_name}) is currently out of stock.`,
                            conflict_reason: "OUT_OF_STOCK"
                        });
                    }

                    // Step 4: Insert new loan record
                    const insertLoanSql = `
                        INSERT INTO loans (player_id, kit_id, issue_date, return_date, status)
                        VALUES (?, ?, ?, NULL, 'ACTIVE')
                    `;

                    db.run(insertLoanSql, [player_id, kit_id, issue_date], function(insertErr) {
                        if (insertErr) {
                            // If UNIQUE constraint on active loan index was triggered
                            if (insertErr.message && insertErr.message.includes("UNIQUE")) {
                                return rollback({
                                    status: 409,
                                    message: `Kit ${kit_id} (${kit.kit_name}) is currently on loan and cannot be double booked.`,
                                    conflict_reason: "ACTIVE_LOAN"
                                });
                            }
                            return rollback({
                                status: 400,
                                message: "Error creating loan: " + insertErr.message
                            });
                        }

                        const newLoanId = this.lastID;

                        // Step 5: Decrement available_quantity in kits
                        const updateKitSql = `
                            UPDATE kits
                            SET available_quantity = available_quantity - 1
                            WHERE kit_id = ? AND available_quantity > 0
                        `;
                        db.run(updateKitSql, [kit_id], function(updateErr) {
                            if (updateErr) {
                                return rollback({
                                    status: 500,
                                    message: "Error updating kit availability: " + updateErr.message
                                });
                            }

                            if (this.changes === 0) {
                                return rollback({
                                    status: 409,
                                    message: "Kit is out of stock",
                                    conflict_reason: "OUT_OF_STOCK"
                                });
                            }

                            // Commit the atomic transaction
                            commit({
                                message: "Loan created successfully",
                                loan_id: newLoanId,
                                loan: {
                                    loan_id: newLoanId,
                                    player_id,
                                    player_name: player.player_name,
                                    kit_id,
                                    kit_name: kit.kit_name,
                                    issue_date,
                                    return_date: null,
                                    status: "ACTIVE"
                                }
                            });
                        });
                    });
                });
            });
        });
    });

    if (callback) {
        txPromise.then((res) => callback(null, res)).catch((err) => callback(err));
    }
    return txPromise;
}

/**
 * Atomic equipment return operation.
 * Marks loan status as 'RETURNED', populates return_date, and increments available_quantity.
 * Fully rolls back if any operation fails.
 */
function returnLoan(loan_id, return_date, callback) {
    if (!loan_id) {
        const err = { status: 400, message: "Loan ID is required to return a kit" };
        if (callback) return callback(err);
        return Promise.reject(err);
    }

    const txPromise = withTransaction((commit, rollback) => {
        // Step 1: Find the loan
        db.get("SELECT * FROM loans WHERE loan_id = ?", [loan_id], (err, loan) => {
            if (err) {
                return rollback({ status: 500, message: "Error finding loan: " + err.message });
            }
            if (!loan) {
                return rollback({ status: 404, message: "Loan not found" });
            }

            // Check if already returned
            if (loan.status === "RETURNED" || loan.return_date !== null) {
                return rollback({
                    status: 400,
                    message: `Loan ${loan_id} has already been returned on ${loan.return_date}.`
                });
            }

            const actualReturnDate = return_date || new Date().toISOString().split("T")[0];

            // Step 2: Mark loan as returned
            const updateLoanSql = `
                UPDATE loans
                SET status = 'RETURNED', return_date = ?
                WHERE loan_id = ?
            `;

            db.run(updateLoanSql, [actualReturnDate, loan_id], function(updateLoanErr) {
                if (updateLoanErr) {
                    return rollback({
                        status: 500,
                        message: "Error updating loan return: " + updateLoanErr.message
                    });
                }

                if (this.changes === 0) {
                    return rollback({
                        status: 404,
                        message: "Loan not found or already updated"
                    });
                }

                // Step 3: Increment available quantity in kits
                const updateKitSql = `
                    UPDATE kits
                    SET available_quantity = MIN(quantity, available_quantity + 1)
                    WHERE kit_id = ?
                `;
                db.run(updateKitSql, [loan.kit_id], function(updateKitErr) {
                    if (updateKitErr) {
                        return rollback({
                            status: 500,
                            message: "Error restoring kit quantity: " + updateKitErr.message
                        });
                    }

                    // Commit the atomic transaction
                    commit({
                        message: "Kit returned successfully. Loan marked as returned.",
                        loan_id: Number(loan_id),
                        kit_id: loan.kit_id,
                        player_id: loan.player_id,
                        issue_date: loan.issue_date,
                        return_date: actualReturnDate,
                        status: "RETURNED"
                    });
                });
            });
        });
    });

    if (callback) {
        txPromise.then((res) => callback(null, res)).catch((err) => callback(err));
    }
    return txPromise;
}

/**
 * Return an active loan by kit_id.
 */
function returnLoanByKit(kit_id, return_date, callback) {
    if (!kit_id) {
        const err = { status: 400, message: "Kit ID is required" };
        if (callback) return callback(err);
        return Promise.reject(err);
    }

    const p = new Promise((resolve, reject) => {
        const sql = `
            SELECT * FROM loans
            WHERE kit_id = ? AND (status = 'ACTIVE' OR return_date IS NULL)
            ORDER BY loan_id DESC
            LIMIT 1
        `;

        db.get(sql, [kit_id], (err, activeLoan) => {
            if (err) {
                return reject({ status: 500, message: "Error searching active loan: " + err.message });
            }
            if (!activeLoan) {
                return reject({ status: 404, message: `No active loan found for Kit ID ${kit_id}.` });
            }

            returnLoan(activeLoan.loan_id, return_date).then(resolve).catch(reject);
        });
    });

    if (callback) {
        p.then((res) => callback(null, res)).catch((err) => callback(err));
    }
    return p;
}

// Promise-based wrappers
function checkKitAvailabilityAsync(kit_id) {
    return new Promise((resolve, reject) => {
        checkKitAvailability(kit_id, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

function createLoanAsync(data) {
    return createLoanWithValidation(data);
}

function returnLoanAsync(loan_id, return_date) {
    return returnLoan(loan_id, return_date);
}

function returnLoanByKitAsync(kit_id, return_date) {
    return returnLoanByKit(kit_id, return_date);
}

module.exports = {
    withTransaction,
    checkKitAvailability,
    createLoanWithValidation,
    returnLoan,
    returnLoanByKit,
    checkKitAvailabilityAsync,
    createLoanAsync,
    returnLoanAsync,
    returnLoanByKitAsync
};
