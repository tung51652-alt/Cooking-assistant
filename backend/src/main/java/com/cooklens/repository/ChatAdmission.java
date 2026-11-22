package com.cooklens.repository;

import com.cooklens.client.ChatProvider.Usage;
import com.cooklens.exception.ApiFailure;
import com.cooklens.service.ChatPricing.Quote;
import java.math.BigInteger;
import java.sql.*;
import java.time.*;
import org.slf4j.LoggerFactory;
import static com.cooklens.repository.SessionOperations.*;

public final class ChatAdmission {
    private static final long WARNING=5_000_000, LIMIT=10_000_000;
    private static String key(String session, String operation) { return fingerprint("billing",session+":"+operation,0); }
    private static String sessionKey(String session) { return fingerprint("session",session,0); }
    private static String month(long now) { return YearMonth.from(Instant.ofEpochMilli(now).atZone(ZoneOffset.UTC)).toString(); }
    public void reserve(Connection c, String session, String operation, String model, Quote quote, long now) throws SQLException {
        try (var query=c.prepareStatement("SELECT COUNT(*) FROM llm_calls WHERE session_key=? AND admitted_at>?")) {
            query.setString(1,sessionKey(session)); query.setLong(2,now-60000);
            try (var rows=query.executeQuery()) {
                rows.next(); if (rows.getLong(1)>=12) throw new ApiFailure(429,"ASSISTANT_RATE_LIMITED");
            }
        }
        String month=month(now);
        long total=total(c,month);
        if (total>=LIMIT || quote.reservedMicros()>LIMIT-total) throw new ApiFailure(503,"ASSISTANT_BUDGET_EXCEEDED");
        try (var insert=c.prepareStatement("""
                INSERT INTO llm_calls(call_key,session_key,month,admitted_at,model,reserved_micros,input_rate,output_rate,status)
                VALUES (?,?,?,?,?,?,?,?,'reserved')
                """)) {
            insert.setString(1,key(session,operation)); insert.setString(2,sessionKey(session)); insert.setString(3,month);
            insert.setLong(4,now); insert.setString(5,model); insert.setLong(6,quote.reservedMicros());
            insert.setLong(7,quote.inputRateMicrosPerMillion()); insert.setLong(8,quote.outputRateMicrosPerMillion()); insert.executeUpdate();
        }
        warn(c,month,total+quote.reservedMicros());
    }
    public void settle(Connection c, String session, String operation, Usage usage, String outcome) throws SQLException {
        String month;
        Long charge=null;
        try (var query=c.prepareStatement("SELECT * FROM llm_calls WHERE call_key=?")) {
            query.setString(1,key(session,operation));
            try (var row=query.executeQuery()) {
                if (!row.next()) throw unavailable();
                month=text(row,"month");
                String status=text(row,"status");
                if (!status.equals("reserved") && !status.equals("unknown") && !status.equals("settled")) throw unavailable();
                if (status.equals("settled")) return;
                long inputRate=integer(row,"input_rate"), outputRate=integer(row,"output_rate");
                if (inputRate<0 || outputRate<0 || integer(row,"reserved_micros")<0) throw unavailable();
                if (usage!=null && usage.inputTokens()!=null && usage.outputTokens()!=null) {
                    if (usage.inputTokens()<0 || usage.outputTokens()<0) throw unavailable();
                    try {
                        charge=BigInteger.valueOf(inputRate).multiply(BigInteger.valueOf(usage.inputTokens()))
                                .add(BigInteger.valueOf(outputRate).multiply(BigInteger.valueOf(usage.outputTokens())))
                                .add(BigInteger.valueOf(999999)).divide(BigInteger.valueOf(1000000)).longValueExact();
                    } catch (ArithmeticException e) { throw unavailable(); }
                }
            }
        }
        try (var update=c.prepareStatement("UPDATE llm_calls SET charged_micros=?,input_tokens=?,output_tokens=?,status=?,outcome=? WHERE call_key=?")) {
            update.setObject(1,charge); update.setObject(2,usage==null ? null : usage.inputTokens());
            update.setObject(3,usage==null ? null : usage.outputTokens()); update.setString(4,charge==null ? "unknown" : "settled");
            update.setString(5,outcome); update.setString(6,key(session,operation)); update.executeUpdate();
        }
        warn(c,month,total(c,month));
    }
    public void outcome(Connection c, String session, String operation, String outcome) throws SQLException {
        try (var update=c.prepareStatement("UPDATE llm_calls SET outcome=? WHERE call_key=?")) {
            update.setString(1,outcome); update.setString(2,key(session,operation)); update.executeUpdate();
        }
    }
    public void unknown(Connection c, String session, long now) throws SQLException {
        try (var update=c.prepareStatement("UPDATE llm_calls SET status='unknown',outcome='ASSISTANT_OUTCOME_UNKNOWN' WHERE session_key=? AND status='reserved' AND admitted_at<=?")) {
            update.setString(1,sessionKey(session)); update.setLong(2,now-25000); update.executeUpdate();
        }
    }
    private long total(Connection c, String month) throws SQLException {
        long total=0;
        try (var query=c.prepareStatement("SELECT reserved_micros,charged_micros FROM llm_calls WHERE month=?")) {
            query.setString(1,month);
            try (var rows=query.executeQuery()) {
                while (rows.next()) {
                    long reserved=integer(rows,"reserved_micros"); Long charged=nullableInteger(rows,"charged_micros");
                    if (reserved<0 || (charged!=null && charged<0)) throw unavailable();
                    try { total=Math.addExact(total,charged==null ? reserved : charged); }
                    catch (ArithmeticException e) { throw unavailable(); }
                }
            }
        }
        return total;
    }
    private void warn(Connection c, String month, long total) throws SQLException {
        if (total<WARNING) return;
        try (var insert=c.prepareStatement("INSERT OR IGNORE INTO llm_budget_warnings(month) VALUES (?)")) {
            insert.setString(1,month);
            if (insert.executeUpdate()==1) LoggerFactory.getLogger(ChatAdmission.class).warn("LLM monthly budget warning threshold reached");
        }
    }
    private ApiFailure unavailable() { return new ApiFailure(503,"ASSISTANT_STORAGE_UNAVAILABLE"); }
}
