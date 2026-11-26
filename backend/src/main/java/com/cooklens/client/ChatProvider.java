package com.cooklens.client;

import com.cooklens.config.LlmSettings;
import com.cooklens.exception.ApiFailure;
import java.util.List;

public interface ChatProvider {
    enum Role { system, user, assistant }
    record Message(Role role, String text) {
        @Override public String toString() { return "Chat message (content omitted)"; }
    }
    record Prompt(List<Message> messages) {
        public Prompt { messages=List.copyOf(messages); }
        @Override public String toString() { return "Chat prompt (content omitted)"; }
    }
    record Usage(Long inputTokens, Long outputTokens) {
        public static Usage unknown() { return new Usage(null,null); }
    }
    record Completion(String text, String provider, String model, Usage usage) {
        @Override public String toString() { return "Chat completion (content omitted)"; }
    }
    // Retain safe usage metadata even when a completion cannot be shown or committed.
    final class Failure extends ApiFailure {
        private final Usage usage;
        public Failure(int status, String code, Usage usage) { super(status,code); this.usage=usage; }
        public Usage usage() { return usage; }
    }
    void requireConfigured();
    default void validate(Prompt prompt) { ChatPromptLimits.validate(prompt,6000); }
    default void validate(Prompt prompt, LlmSettings.Connection config) { validate(prompt); }
    Completion complete(Prompt prompt);
    default Completion complete(Prompt prompt, LlmSettings.Connection config) { return complete(prompt); }
}
