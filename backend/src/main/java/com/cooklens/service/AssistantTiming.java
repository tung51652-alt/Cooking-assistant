package com.cooklens.service;

import java.util.Locale;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Request-local durations only; never stores identifiers or chat content. */
public final class AssistantTiming {
    public enum Stage { prepare, provider, persist }
    private final LongSupplier clock;
    private final long started;
    private final long[] durations=new long[Stage.values().length];
    public AssistantTiming() { this(System::nanoTime); }
    AssistantTiming(LongSupplier clock) { this.clock=clock; started=clock.getAsLong(); }
    public <T> T measure(Stage stage, Supplier<T> work) {
        long begin=clock.getAsLong();
        try { return work.get(); }
        finally { durations[stage.ordinal()]+=Math.max(0,clock.getAsLong()-begin); }
    }
    public String header() {
        return String.format(Locale.ROOT,"assistant_prepare;dur=%.3f, assistant_provider;dur=%.3f, assistant_persist;dur=%.3f, assistant_total;dur=%.3f",
                durations[0]/1_000_000.0,durations[1]/1_000_000.0,durations[2]/1_000_000.0,
                Math.max(0,clock.getAsLong()-started)/1_000_000.0);
    }
}
