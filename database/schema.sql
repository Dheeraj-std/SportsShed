
CREATE TABLE IF NOT EXISTS players (
    player_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS kits (
    kit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    kit_name TEXT NOT NULL,
    sport TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    available_quantity INTEGER NOT NULL
        CHECK (
            available_quantity >= 0
            AND available_quantity <= quantity
        )
);

CREATE TABLE IF NOT EXISTS loans (
    loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    kit_id INTEGER NOT NULL,
    issue_date TEXT NOT NULL,
    return_date TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'RETURNED')),
    FOREIGN KEY (player_id) REFERENCES players(player_id),
    FOREIGN KEY (kit_id) REFERENCES kits(kit_id)
);
