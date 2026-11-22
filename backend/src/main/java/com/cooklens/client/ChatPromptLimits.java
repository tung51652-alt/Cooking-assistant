package com.cooklens.client;

import com.cooklens.client.ChatProvider.*;
import com.cooklens.exception.ApiFailure;
import java.nio.charset.StandardCharsets;

public final class ChatPromptLimits {
    private ChatPromptLimits() {}
    // Admission estimate only; billing must use provider usage or retain a reservation.
    public static int estimate(Message message) {
        return (message.text().getBytes(StandardCharsets.UTF_8).length+2)/3+16;
    }
    public static void validate(Prompt prompt, int maxInputTokens) {
        if (prompt == null || prompt.messages().size()<2 || prompt.messages().size()>15) throw tooLarge();
        long bytes=0, estimated=32;
        for (int i=0;i<prompt.messages().size();i++) {
            var message=prompt.messages().get(i);
            if (message == null || message.role()==null || message.text()==null || message.text().isBlank()
                    || ((i==0) != (message.role()==Role.system))) throw tooLarge();
            bytes+=message.text().getBytes(StandardCharsets.UTF_8).length; estimated+=estimate(message);
        }
        if (prompt.messages().getLast().role()!=Role.user || bytes>20000 || estimated>maxInputTokens) throw tooLarge();
    }
    public static ApiFailure tooLarge() { return new ApiFailure(422,"ASSISTANT_CONTEXT_TOO_LARGE"); }
}
