package com.cooklens.service;

import com.cooklens.dto.AssistantModels.Action;
import java.text.Normalizer;
import java.util.Locale;

final class CookingCommands {
    private CookingCommands() {}
    static Action parse(String text) {
        if (text==null) return null;
        return switch (Normalizer.normalize(text.trim(),Normalizer.Form.NFC).toLowerCase(Locale.ROOT)) {
            case "bắt đầu" -> Action.start;
            case "bước tiếp" -> Action.next;
            case "bước trước" -> Action.previous;
            case "nhắc lại" -> Action.repeat;
            case "kết thúc" -> Action.finish;
            default -> null;
        };
    }
}
