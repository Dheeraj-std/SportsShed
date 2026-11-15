# SportsShed — Person 4 Contribution Report

**Contributor:** Hitesh Sai (Person 4)  
**Role:** Business Rules, Loan Lifecycle, Atomic Transactions & Concurrency Safety  
**Feature Branch:** `feature/loan-rules-testing`  
**Pull Request:** [GitHub PR #2](https://github.com/Dheeraj-std/SportsShed/pull/2)  
**Repository:** [SportsShed](https://github.com/Dheeraj-std/SportsShed)  

---

## 📌 Executive Summary

As **Person 4**, I was responsible for implementing the core business logic engine for the **SportsShed - Sports Equipment Issue Management System**. 

The primary business requirement was the **No Double Booking** rule: **a sports kit cannot be issued to two players simultaneously**. In addition to enforcing this rule, I implemented the equipment return workflow, wrapped all database operations in atomic SQLite transactions with automatic rollback on failure, and implemented concurrency controls to prevent race conditions during simultaneous loan requests.

---

## 🎯 Key Responsibilities & Implementations

### 1. No Double Booking (Kit Availability Enforcement)
* **Rule**: A kit cannot have more than one active loan at any given time.
* **Active Loan Definition**: Any loan record where:
  ```sql
  status = 'ACTIVE' OR return_date IS NULL
  ```
* **Behavior**:
  * Before issuing a kit, the system checks whether an active loan exists for the requested `kit_id` and verifies that `available_quantity > 0`.
  * If the kit is currently active on loan, the request is immediately rejected with HTTP **`409 Conflict`**:
    ```json
    {
      "message": "Kit 101 (Cricket Kit) is currently on loan and cannot be double booked.",
      "conflict_reason": "ACTIVE_LOAN",
      "active_loan": { "loan_id": 1, "player_id": 1, "status": "ACTIVE" }
    }
    ```

### 2. Equipment Return Handling
* **Lifecycle**: When equipment is returned, the loan status is updated and the kit's inventory is restored.
* **Behavior**:
  * Updates `loans`: Sets `status = 'RETURNED'` and records the `return_date` (defaulting to the current date `YYYY-MM-DD`).
  * Updates `kits`: Atomically increments `available_quantity` back up by 1 (capped at total `quantity`).
  * **Duplicate Prevention**: If a player attempts to return an already returned loan, the system rejects it with HTTP **`400 Bad Request`**:
    ```json
    {
      "message": "Loan 1 has already been returned on 2026-11-14."
    }
    ```

### 3. Atomic SQLite Transactions (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`)
To prevent partial writes or inconsistent inventory counts in failure scenarios, both loan creation and return operations are wrapped in atomic transactions:
* **`BEGIN IMMEDIATE TRANSACTION`**: Locks the database for write operations upfront.
* **Automatic Rollback**: If any operation fails (e.g. player not found, kit out-of-stock, double booking, or database write error), `ROLLBACK` is immediately executed.
* **Guaranteed State**: Zero orphaned rows are created, and inventory quantities remain consistent under all failure paths.

### 4. High-Concurrency Safety & Database Constraint
To protect against race conditions when multiple players request the same kit simultaneously:
* **Transaction Queue**: Added an in-memory Promise-based serialization queue (`transactionQueue` in `services/loanRules.js`) to prevent SQLite `cannot start a transaction within a transaction` collisions on the shared connection.
* **Database-Level Partial Unique Index**: Added to `database/schema.sql`:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_kit_loan
      ON loans(kit_id)
      WHERE status = 'ACTIVE';
  ```
  Even under concurrent requests at the exact same millisecond, SQLite's storage engine guarantees that two active loans for the same kit cannot physically coexist.

---

## 📂 Files Created & Modified

### 1. `services/loanRules.js` *(Created)*
The dedicated service isolating business logic from routing:
* `withTransaction(operation)`: Manages SQLite transactions, queueing, commits, and rollbacks.
* `checkKitAvailability(kit_id, callback)`: Inspects active loans and stock levels.
* `createLoanWithValidation({ player_id, kit_id, issue_date }, callback)`: Atomically validates, checks double booking, inserts the loan, and decrements available quantity.
* `returnLoan(loan_id, return_date, callback)`: Atomically updates loan status to `RETURNED` and restores kit quantity.
* `returnLoanByKit(kit_id, return_date, callback)`: Helper to return active loans directly by kit ID.

### 2. `routes/loans.js` *(Enhanced)*
Connected the service to the REST API:
* `POST /loans`: Issues a loan with active-loan guard (returns `201 Created` or `409 Conflict`).
* `PUT /loans/:id/return` (also supporting `PATCH`, `POST`, and `PUT /loans/return/:id`): Marks loans as returned (`200 OK`).
* `POST /loans/return`: Flexible return endpoint accepting `{ loan_id }` or `{ kit_id }`.
* `GET /loans/check-availability/:kit_id`: Direct endpoint for checking kit availability.
* Preserved Venkatesh's `GET /loans` and `GET /loans/joined` endpoints.

### 3. `database/schema.sql` *(Updated)*
* Added the partial unique index `idx_unique_active_kit_loan` on `loans(kit_id) WHERE status = 'ACTIVE'`.

### 4. `database/test-loan-rules.js` *(Created)*
* Comprehensive automated test suite verifying the complete loan lifecycle, fault injection, rollback behavior, and concurrency safety.

---

## 📡 REST API Reference

### 1. Issue a Loan (With Double-Booking Check)
* **Method**: `POST`
* **URL**: `/loans`
* **Request Body**:
  ```json
  {
    "player_id": 1,
    "kit_id": 101,
    "issue_date": "2026-11-14"
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "message": "Loan created successfully",
    "loan_id": 1,
    "loan": {
      "loan_id": 1,
      "player_id": 1,
      "player_name": "Rahul",
      "kit_id": 101,
      "kit_name": "Cricket Kit",
      "issue_date": "2026-11-14",
      "return_date": null,
      "status": "ACTIVE"
    }
  }
  ```
* **Conflict Response (`409 Conflict`)**:
  ```json
  {
    "message": "Kit 101 (Cricket Kit) is currently on loan and cannot be double booked.",
    "conflict_reason": "ACTIVE_LOAN",
    "active_loan": { "loan_id": 1, "player_id": 1, "status": "ACTIVE" }
  }
  ```

### 2. Return an Equipment Loan
* **Method**: `PUT` (or `POST`)
* **URL**: `/loans/:id/return`
* **Optional Request Body**:
  ```json
  {
    "return_date": "2026-11-14"
  }
  ```
* **Success Response (`200 OK`)**:
  ```json
  {
    "message": "Kit returned successfully. Loan marked as returned.",
    "loan_id": 1,
    "kit_id": 101,
    "player_id": 1,
    "issue_date": "2026-11-14",
    "return_date": "2026-11-14",
    "status": "RETURNED"
  }
  ```
* **Duplicate Return Error (`400 Bad Request`)**:
  ```json
  {
    "message": "Loan 1 has already been returned on 2026-11-14."
  }
  ```

### 3. Check Kit Availability
* **Method**: `GET`
* **URL**: `/loans/check-availability/:kit_id`
* **Response (`200 OK`)**:
  ```json
  {
    "exists": true,
    "available": true,
    "kit": {
      "kit_id": 101,
      "kit_name": "Cricket Kit",
      "quantity": 1,
      "available_quantity": 1
    }
  }
  ```

---

## 🧪 Verification & Test Results

Run the verification suite from the project root:
```bash
node database/test-loan-rules.js
```

### Test Suite Execution Output:
```text
=================================================================
  SportsShed Person 4 - Transaction & Failure Handling Suite     
  Verification of all 4 criteria requested for PR #2 Approval:   
  1. Loan creation & quantity decrement use atomic transaction   
  2. Full rollback if either operation fails (with fault test)   
  3. Equipment return & quantity restoration are transactional   
  4. Clean DB start check & final DB state consistency check     
=================================================================

>>> CHECK 4 (Part A): Verifying Clean Database State at Start...
  ✓ Initial loans count in database: 0
  ✓ Test Fixtures Created: Player 1 (ID: 15), Player 2 (ID: 16), Kit (ID: 11)
  >>> CHECK 4 (Part A) PASSED!

>>> CHECK 1: Loan Creation & Quantity Decrement Transactional Atomicity
  [1.1] Player 1 creates a loan...
  ✓ Loan created successfully (Loan ID: 14)
  ✓ Kit state: Total=1, Available=0
  ✓ Active loan recorded: status='ACTIVE', return_date=null
  >>> CHECK 1 PASSED!

>>> CHECK 2: Full Rollback Verification Under Fault Scenarios
  [2.1] Fault Scenario 2A: Attempt double booking (Player 2 requests same kit)...
  ✓ Blocked with HTTP 409: "Kit 11 is currently on loan and cannot be double booked."
  ✓ Verified: Zero orphan loans created. State rolled back cleanly.

  [2.2] Fault Scenario 2B: Induced failure mid-transaction (Simulated crash before commit)...
  ✓ Simulated mid-transaction error caught: ROLLBACK executed.
  ✓ Loans in DB for Fault Kit: 0 (Expected: 0)
  ✓ Verified: Inserted row was completely reverted by ROLLBACK.
  >>> CHECK 2 PASSED!

>>> CHECK 3: Equipment Return & Quantity Restoration Transactional Atomicity
  [3.1] Return active loan #1...
  ✓ Return confirmed: Kit returned successfully. Loan marked as returned.
  ✓ Loan status: 'RETURNED', return_date: '2026-11-14'
  ✓ Kit available_quantity restored to: 1

  [3.2] Attempt duplicate return of already returned loan...
  ✓ Blocked duplicate return with HTTP 400: "Loan 14 has already been returned."

  [3.3] Fault Scenario 3C: Induced return failure mid-transaction...
  ✓ Simulated return error caught: ROLLBACK executed.
  ✓ Verified: Loan status remains 'RETURNED'.
  >>> CHECK 3 PASSED!

>>> BONUS: High-Concurrency Race Condition Safety (Simultaneous Requests)
  Firing 3 concurrent loan requests simultaneously for Match Football...
  ✓ Results: 1 succeeded (201), 2 rejected (409 Conflict)
  >>> CONCURRENCY CHECK PASSED!

>>> CHECK 4 (Part B): Final Database State Consistency Check
  ✓ Final loans count in database: 0 (matches initial count: 0)
  ✓ Verified: Database is completely consistent and clean.
  >>> CHECK 4 (Part B) PASSED!

=================================================================
  ALL 4 CHECKS PASSED: PR #2 IS 100% READY FOR MERGE!            
=================================================================
```

---

## 🔀 Git Commit History

The following commits represent the contribution of Person 4 on branch `feature/loan-rules-testing`:

1. `79eb3ca`: `Implement no double booking rule and equipment return handling`
2. `a241490`: `Make loan creation and equipment return atomic with SQLite transactions and concurrency safety`
3. `1dd35c8`: `Merge branch 'origin/main' into feature/loan-rules-testing`
4. `73bbd11`: `Add explicit fault injection tests for transactions, rollbacks and state checks`

All code is integrated, tested, and submitted under **Pull Request #2**.
