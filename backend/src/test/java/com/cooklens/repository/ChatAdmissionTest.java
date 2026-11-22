package com.cooklens.repository;

import com.cooklens.client.ChatProvider.Usage;
import com.cooklens.exception.ApiFailure;
import com.cooklens.service.ChatPricing.Quote;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ChatAdmissionTest {
    @TempDir Path directory;
    private SessionStore store;
    private final ChatAdmission admission=new ChatAdmission();
    private final long now=Instant.parse("2026-11-22T00:00:00Z").toEpochMilli();
    @BeforeEach void initialize() { store=new SessionStore(directory.resolve("accounting.sqlite").toString()); }
    private String id() { return UUID.randomUUID().toString(); }
    private void reserve(String session, String operation, Quote quote, long time) {
        store.transact(c -> { admission.reserve(c,session,operation,"mock-model",quote,time); return null; });
    }
    private long scalar(String sql) {
        return store.transact(c -> { try (var st=c.createStatement(); var row=st.executeQuery(sql)) { row.next(); return row.getLong(1); } });
    }
    private void failure(String code, Runnable call) { assertEquals(code,assertThrows(ApiFailure.class,call::run).code()); }

    @Test void settlesKnownUsageOnceAndKeepsUnknownReservationAcrossRestart() {
        String session=id(), operation=id();
        reserve(session,operation,new Quote(1000,1_000_000,1_000_000),now);
        store.transact(c -> { admission.settle(c,session,operation,new Usage(120L,30L),"PROVIDER_COMPLETED"); return null; });
        assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
        store.transact(c -> { admission.settle(c,session,operation,new Usage(0L,0L),"DUPLICATE"); return null; });
        assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
        String unknown=id(); reserve(session,unknown,new Quote(500,1_000_000,1_000_000),now);
        store.transact(c -> { admission.settle(c,session,unknown,new Usage(120L,null),"ASSISTANT_PROVIDER_TIMEOUT"); return null; });
        store=new SessionStore(directory.resolve("accounting.sqlite").toString());
        assertEquals(650,scalar("SELECT SUM(COALESCE(charged_micros,reserved_micros)) FROM llm_calls"));
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls WHERE status='unknown' AND input_tokens=120 AND output_tokens IS NULL"));
    }

    @Test void budgetWarningsAndCapPersistAndUtcMonthStartsSeparately() {
        reserve(id(),id(),new Quote(9_999_500,0,0),now);
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_budget_warnings"));
        failure("ASSISTANT_BUDGET_EXCEEDED",() -> reserve(id(),id(),new Quote(501,0,0),now));
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls"));
        store=new SessionStore(directory.resolve("accounting.sqlite").toString());
        reserve(id(),id(),new Quote(500,0,0),now);
        assertEquals(10_000_000,scalar("SELECT SUM(reserved_micros) FROM llm_calls"));
        failure("ASSISTANT_BUDGET_EXCEEDED",() -> reserve(id(),id(),new Quote(0,0,0),now));
        reserve(id(),id(),new Quote(1,0,0),Instant.parse("2026-12-01T00:00:00Z").toEpochMilli());
        assertEquals(3,scalar("SELECT COUNT(*) FROM llm_calls"));
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_budget_warnings"));
    }

    @Test void rateWindowCountsFailedAndAbandonedAttemptsButNotDifferentSessions() {
        String session=id();
        for (int i=0;i<12;i++) reserve(session,id(),new Quote(0,0,0),now);
        failure("ASSISTANT_RATE_LIMITED",() -> reserve(session,id(),new Quote(0,0,0),now));
        store=new SessionStore(directory.resolve("accounting.sqlite").toString());
        failure("ASSISTANT_RATE_LIMITED",() -> reserve(session,id(),new Quote(0,0,0),now-1000));
        reserve(id(),id(),new Quote(0,0,0),now);
        reserve(session,id(),new Quote(0,0,0),now+60000);
        assertEquals(14,scalar("SELECT COUNT(*) FROM llm_calls"));
    }

    @Test void concurrentReservationsCannotOverspendSharedMonthlyBudget() throws Exception {
        reserve(id(),id(),new Quote(9_999_000,0,0),now);
        var start=new CountDownLatch(1);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var tasks=new ArrayList<Future<Boolean>>();
            for (int i=0;i<2;i++) tasks.add(executor.submit(() -> {
                start.await();
                try { reserve(id(),id(),new Quote(1000,0,0),now); return true; }
                catch (ApiFailure failure) { assertEquals("ASSISTANT_BUDGET_EXCEEDED",failure.code()); return false; }
            }));
            start.countDown(); int admitted=0;
            for (var task:tasks) if (task.get(5,TimeUnit.SECONDS)) admitted++;
            assertEquals(1,admitted);
        }
        assertEquals(10_000_000,scalar("SELECT SUM(reserved_micros) FROM llm_calls"));
    }

    @Test void expiredPendingRetainsCostAndLateUsageCanSettleWithoutSessionRecords() {
        String session=id(), operation=id(); reserve(session,operation,new Quote(1000,1_000_000,1_000_000),now);
        store.transact(c -> { admission.unknown(c,session,now+25000); return null; });
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls WHERE status='unknown' AND charged_micros IS NULL"));
        store.transact(c -> { admission.settle(c,session,operation,new Usage(100L,20L),"SESSION_EXPIRED"); return null; });
        assertEquals(120,scalar("SELECT charged_micros FROM llm_calls"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM sessions"));
    }
}
