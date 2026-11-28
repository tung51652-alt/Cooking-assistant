package com.cooklens.repository;

import com.cooklens.dto.AssistantModels.Action;
import com.cooklens.exception.ApiFailure;
import java.nio.file.*;
import java.sql.*;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

@Repository
public class SessionStore {
    private final Path path;
    private boolean initialized;

    public SessionStore(@Value("${cooklens.assistant-db-path}") String path) {
        this.path = Path.of(path).toAbsolutePath().normalize();
    }

    @FunctionalInterface
    public interface Work<T> {
        T run(Connection connection) throws Exception;
    }

    private Connection open() throws SQLException {
        var connection = DriverManager.getConnection("jdbc:sqlite:" + path);
        try (var statement = connection.createStatement()) {
            statement.execute("PRAGMA busy_timeout=2000");
            statement.execute("PRAGMA foreign_keys=ON");
        } catch (SQLException e) {
            connection.close();
            throw e;
        }
        return connection;
    }

    private synchronized void initialize() throws Exception {
        if (initialized) return;
        Files.createDirectories(path.getParent());
        try (var connection = open();
                var statement = connection.createStatement()) {
            statement.execute("BEGIN IMMEDIATE");
            try {
                int version;
                try (var result = statement.executeQuery("PRAGMA user_version")) {
                    result.next();
                    version = result.getInt(1);
                }
                if (version < 0 || version > 3)
                    throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE");
                if (version == 0) {
                    statement.execute(
                            """
CREATE TABLE sessions (
    id TEXT PRIMARY KEY, create_operation TEXT NOT NULL UNIQUE,
    recipe_id TEXT NOT NULL, corpus_version TEXT NOT NULL, recipe_json TEXT NOT NULL,
    status TEXT NOT NULL, current_step INTEGER NOT NULL, version INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)
""");
                    statement.execute(
                            """
CREATE TABLE session_actions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL, action TEXT NOT NULL, expected_version INTEGER NOT NULL,
    version INTEGER NOT NULL, current_step INTEGER NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(session_id, operation_id))
""");
                    statement.execute("CREATE INDEX sessions_expiry ON sessions(expires_at)");
                }
                if (version < 2) migrateChat(connection);
                if (version < 3) migrateAdmission(connection);
                statement.execute("COMMIT");
                initialized = true;
            } catch (Exception e) {
                statement.execute("ROLLBACK");
                throw e;
            }
        }
    }

    private void migrateAdmission(Connection c) throws SQLException {
        try (var statement = c.createStatement()) {
            statement.execute("ALTER TABLE session_operations ADD COLUMN command_text TEXT");
            statement.execute(
                    """
CREATE TABLE llm_calls (
    call_key TEXT PRIMARY KEY, session_key TEXT NOT NULL, month TEXT NOT NULL, admitted_at INTEGER NOT NULL,
    model TEXT NOT NULL, reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),
    charged_micros INTEGER CHECK(charged_micros>=0), input_rate INTEGER NOT NULL CHECK(input_rate>=0),
    output_rate INTEGER NOT NULL CHECK(output_rate>=0), input_tokens INTEGER CHECK(input_tokens>=0),
    output_tokens INTEGER CHECK(output_tokens>=0), status TEXT NOT NULL CHECK(status IN ('reserved','settled','unknown')),
    outcome TEXT,
    CHECK((status='settled' AND charged_micros IS NOT NULL AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL)
    OR (status IN ('reserved','unknown') AND charged_micros IS NULL)))
""");
            statement.execute(
                    "CREATE INDEX llm_calls_session_time ON llm_calls(session_key,admitted_at)");
            statement.execute("CREATE INDEX llm_calls_month ON llm_calls(month)");
            statement.execute("CREATE TABLE llm_budget_warnings(month TEXT PRIMARY KEY)");
            statement.execute("PRAGMA user_version=3");
        }
    }

    private void migrateChat(Connection c) throws Exception {
        try (var statement = c.createStatement()) {
            // Reject broken revision sequences before backfilling successful operation keys.
            try (var rows =
                    statement.executeQuery(
                            """
SELECT 1 FROM sessions s WHERE typeof(s.version)<>'integer' OR s.version<0 OR s.version>100
OR s.version<>(SELECT COUNT(*) FROM session_actions a WHERE a.session_id=s.id)
UNION ALL
SELECT 1 FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY version) AS ordinal
FROM session_actions) WHERE typeof(version)<>'integer' OR version<>ordinal
OR typeof(expected_version)<>'integer' OR expected_version<>version-1
LIMIT 1
""")) {
                if (rows.next()) throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE");
            }
            statement.execute(
                    """
CREATE TABLE session_operations (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('action','message','message_action')),
    fingerprint TEXT NOT NULL, expected_version INTEGER NOT NULL CHECK(expected_version>=0),
    created_at INTEGER NOT NULL, deadline INTEGER,
    status TEXT NOT NULL CHECK(status IN ('pending','completed','failed')),
    committed_version INTEGER, error_status INTEGER, error_code TEXT,
    PRIMARY KEY(session_id,operation_id), UNIQUE(session_id,committed_version),
    CHECK((status='completed' AND committed_version IS NOT NULL AND committed_version=expected_version+1 AND error_status IS NULL AND error_code IS NULL)
    OR (status='pending' AND committed_version IS NULL AND deadline IS NOT NULL AND error_status IS NULL AND error_code IS NULL)
    OR (status='failed' AND committed_version IS NULL AND error_status IS NOT NULL AND error_code IS NOT NULL)))
""");
            statement.execute(
                    "CREATE UNIQUE INDEX session_pending_message ON session_operations(session_id)"
                            + " WHERE status='pending'");
            statement.execute(
                    """
CREATE TABLE session_chat_turns (
    session_id TEXT NOT NULL, version INTEGER NOT NULL, operation_id TEXT NOT NULL,
    expected_version INTEGER NOT NULL CHECK(version=expected_version+1),
    user_text TEXT NOT NULL, assistant_text TEXT NOT NULL, created_at INTEGER NOT NULL,
    provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
    PRIMARY KEY(session_id,version), UNIQUE(session_id,operation_id),
    FOREIGN KEY(session_id,operation_id) REFERENCES session_operations(session_id,operation_id) ON DELETE CASCADE,
    CHECK(input_tokens IS NULL OR input_tokens>=0), CHECK(output_tokens IS NULL OR output_tokens>=0))
""");
            try (var actions = statement.executeQuery("SELECT * FROM session_actions")) {
                while (actions.next()) {
                    String id = SessionOperations.text(actions, "operation_id");
                    if (!UUID.fromString(id).toString().equals(id))
                        throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE");
                    SessionOperations.completedAction(
                            c,
                            SessionOperations.text(actions, "session_id"),
                            id,
                            Action.valueOf(SessionOperations.text(actions, "action")),
                            SessionOperations.integer(actions, "expected_version"),
                            SessionOperations.integer(actions, "created_at"));
                }
            }
            statement.execute("PRAGMA user_version=2");
        }
    }

    public <T> T transact(Work<T> work) {
        try {
            initialize();
            try (var connection = open();
                    var statement = connection.createStatement()) {
                // Lock before reading versions so competing writers cannot overwrite newer state.
                statement.execute("BEGIN IMMEDIATE");
                try {
                    T result = work.run(connection);
                    statement.execute("COMMIT");
                    return result;
                } catch (Exception e) {
                    statement.execute("ROLLBACK");
                    throw e;
                }
            }
        } catch (ApiFailure e) {
            throw e;
        } catch (Exception e) {
            throw new ApiFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE");
        }
    }
}
