package com.cooklens.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class AssistantTimingTest {
    @Test
    void durationsAreIsolatedAndRetainedWhenWorkFails() {
        var clock = new AtomicLong();
        var timing = new AssistantTiming(clock::get);
        timing.measure(
                AssistantTiming.Stage.prepare,
                () -> {
                    clock.addAndGet(2_000_000);
                    return null;
                });
        assertThrows(
                IllegalStateException.class,
                () ->
                        timing.measure(
                                AssistantTiming.Stage.provider,
                                () -> {
                                    clock.addAndGet(7_000_000);
                                    throw new IllegalStateException();
                                }));
        assertEquals(
                "assistant_prepare;dur=2.000, assistant_provider;dur=7.000,"
                        + " assistant_persist;dur=0.000, assistant_total;dur=9.000",
                timing.header());
        assertTrue(
                new AssistantTiming(clock::get).header().contains("assistant_provider;dur=0.000"));
    }
}
