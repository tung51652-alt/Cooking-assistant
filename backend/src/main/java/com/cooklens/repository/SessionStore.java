package com.cooklens.repository;

import com.cooklens.exception.ApiFailure;
import java.nio.file.*;
import java.sql.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

@Repository
public class SessionStore {
    private final Path path;
    private boolean initialized;
    public SessionStore(@Value("${cooklens.assistant-db-path}") String path) {
        this.path = Path.of(path).toAbsolutePath().normalize();
    }
    @FunctionalInterface public interface Work<T> { T run(Connection connection) throws Exception; }
    private Connection open() throws SQLException {
        var connection = DriverManager.getConnection("jdbc:sqlite:" + path);
        try (var statement = connection.createStatement()) {
            statement.execute("PRAGMA busy_timeout=2000");
            statement.execute("PRAGMA foreign_keys=ON");
        } catch (SQLException e) { connection.close(); throw e; }
        return connection;
    }
    private synchronized void initialize() throws Exception {
        if (initialized) return;
        Files.createDirectories(path.getParent());
        try (var connection = open(); var statement = connection.createStatement()) {
            statement.execute("BEGIN IMMEDIATE");
            try {
                int version;
                try (var result = statement.executeQuery("PRAGMA user_version")) { result.next(); version = result.getInt(1); }
                if (version != 0 && version != 1) throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE");
                if (version == 0) {
                    statement.execute("""
                        CREATE TABLE sessions (
                            id TEXT PRIMARY KEY, create_operation TEXT NOT NULL UNIQUE,
                            recipe_id TEXT NOT NULL, corpus_version TEXT NOT NULL, recipe_json TEXT NOT NULL,
                            status TEXT NOT NULL, current_step INTEGER NOT NULL, version INTEGER NOT NULL,
                            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)
                        """);
                    statement.execute("""
                        CREATE TABLE session_actions (
                            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                            operation_id TEXT NOT NULL, action TEXT NOT NULL, expected_version INTEGER NOT NULL,
                            version INTEGER NOT NULL, current_step INTEGER NOT NULL, created_at INTEGER NOT NULL,
                            PRIMARY KEY(session_id, operation_id))
                        """);
                    statement.execute("CREATE INDEX sessions_expiry ON sessions(expires_at)");
                    statement.execute("PRAGMA user_version=1");
                }
                statement.execute("COMMIT");
                initialized = true;
            } catch (Exception e) { statement.execute("ROLLBACK"); throw e; }
        }
    }
    public <T> T transact(Work<T> work) {
        try {
            initialize();
            try (var connection = open(); var statement = connection.createStatement()) {
                // Lock before reading versions so competing writers cannot overwrite newer state.
                statement.execute("BEGIN IMMEDIATE");
                try {
                    T result = work.run(connection);
                    statement.execute("COMMIT");
                    return result;
                } catch (Exception e) { statement.execute("ROLLBACK"); throw e; }
            }
        } catch (ApiFailure e) { throw e; }
        catch (Exception e) { throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE"); }
    }
}
