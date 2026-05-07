use std::path::Path;

use rusqlite::{params, Connection};

use crate::errors::AppResult;

use super::migrations::MIGRATIONS;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> AppResult<Self> {
        Ok(Self {
            connection: Connection::open(path)?,
        })
    }

    pub fn open_in_memory() -> AppResult<Self> {
        Ok(Self {
            connection: Connection::open_in_memory()?,
        })
    }

    pub fn connection(&self) -> &Connection {
        &self.connection
    }

    pub fn initialize(&self) -> AppResult<()> {
        self.connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )?;

        for migration in MIGRATIONS {
            let already_applied: bool = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
                params![migration.version],
                |row| row.get(0),
            )?;

            if !already_applied {
                self.connection.execute_batch(migration.sql)?;
                self.connection.execute(
                    "INSERT INTO schema_migrations (version) VALUES (?1)",
                    params![migration.version],
                )?;
            }
        }

        Ok(())
    }

    pub fn applied_migration_versions(&self) -> AppResult<Vec<i64>> {
        let mut statement = self
            .connection
            .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")?;
        let rows = statement.query_map([], |row| row.get(0))?;

        let mut versions = Vec::new();
        for row in rows {
            versions.push(row?);
        }

        Ok(versions)
    }

    pub fn table_exists(&self, table_name: &str) -> AppResult<bool> {
        Ok(self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            params![table_name],
            |row| row.get(0),
        )?)
    }
}
