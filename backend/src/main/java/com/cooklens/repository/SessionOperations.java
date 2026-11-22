package com.cooklens.repository;

import com.cooklens.dto.AssistantModels.Action;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.sql.*;
import java.util.*;

public final class SessionOperations {
    private SessionOperations() {}
    private static final ObjectMapper MAPPER=new ObjectMapper();
    public record Operation(String id, String kind, String fingerprint, long expectedVersion, long createdAt,
                            Long deadline, String status, Long committedVersion, Integer errorStatus, String errorCode, String commandText) {}
    public static String fingerprint(String kind, String value, long expectedVersion) {
        try {
            byte[] canonical = MAPPER.writeValueAsBytes(List.of(kind, value, expectedVersion));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical));
        } catch (Exception e) { throw unavailable(); }
    }
    public static String actionFingerprint(Action action, long expectedVersion) {
        return fingerprint("action",action.name(),expectedVersion);
    }
    public static void completedAction(Connection c, String session, String operation, Action action, long expected, long now) throws SQLException {
        try (var insert=c.prepareStatement("""
                INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,status,committed_version)
                VALUES (?,?,'action',?,?,?,'completed',?)
                """)) {
            insert.setString(1,session); insert.setString(2,operation); insert.setString(3,actionFingerprint(action,expected));
            insert.setLong(4,expected); insert.setLong(5,now); insert.setLong(6,expected+1); insert.executeUpdate();
        }
    }
    public static List<Operation> read(Connection c, String session) throws SQLException {
        var operations=new ArrayList<Operation>();
        try (var query=c.prepareStatement("SELECT * FROM session_operations WHERE session_id=?")) {
            query.setString(1,session);
            try (var rows=query.executeQuery()) {
                while (rows.next()) operations.add(new Operation(text(rows,"operation_id"),text(rows,"kind"),text(rows,"fingerprint"),
                        integer(rows,"expected_version"),integer(rows,"created_at"),nullableInteger(rows,"deadline"),text(rows,"status"),
                        nullableInteger(rows,"committed_version"),nullableInt(rows,"error_status"),nullableText(rows,"error_code"),nullableText(rows,"command_text")));
            }
        }
        return operations;
    }
    public static void completedCommand(Connection c, String session, String operation, String text, long expected, long now) throws SQLException {
        try (var insert=c.prepareStatement("""
                INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,status,committed_version,command_text)
                VALUES (?,?,'message_action',?,?,?,'completed',?,?)
                """)) {
            insert.setString(1,session); insert.setString(2,operation); insert.setString(3,fingerprint("message_action",text,expected));
            insert.setLong(4,expected); insert.setLong(5,now); insert.setLong(6,expected+1); insert.setString(7,text); insert.executeUpdate();
        }
    }
    public static String text(ResultSet row, String field) throws SQLException {
        if (row.getObject(field) instanceof String value) return value;
        throw unavailable();
    }
    public static long integer(ResultSet row, String field) throws SQLException {
        Object value=row.getObject(field);
        if (value instanceof Integer || value instanceof Long) return ((Number)value).longValue();
        throw unavailable();
    }
    public static Long nullableInteger(ResultSet row, String field) throws SQLException {
        return row.getObject(field) == null ? null : integer(row,field);
    }
    private static Integer nullableInt(ResultSet row, String field) throws SQLException {
        Long value=nullableInteger(row,field);
        return value == null ? null : Math.toIntExact(value);
    }
    public static String nullableText(ResultSet row, String field) throws SQLException {
        return row.getObject(field) == null ? null : text(row,field);
    }
    private static ApiFailure unavailable() { return new ApiFailure(503,"ASSISTANT_STORAGE_UNAVAILABLE"); }
}
