package com.cooklens.service;

import com.cooklens.config.RequestGuard;
import com.cooklens.exception.ApiFailure;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import org.apache.commons.fileupload2.jakarta.servlet6.JakartaServletFileUpload;
import org.springframework.stereotype.Component;

@Component
public class SingleFileUpload {
    public record Media(byte[] bytes, String mime) {}

    public Media readAudio(HttpServletRequest request) {
        return read(request, RequestGuard.MAX_AUDIO_FILE, RequestGuard.MAX_AUDIO_UPLOAD,
                Set.of("audio/wav", "audio/x-wav", "audio/webm", "audio/mp4", "audio/m4a", "audio/x-m4a"));
    }

    Media read(HttpServletRequest request, int maxFile, int maxBody, Set<String> types) {
        if (request.getContentType() == null || !request.getContentType().split(";")[0].strip().equalsIgnoreCase("multipart/form-data"))
            throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE");
        try {
            var upload = new JakartaServletFileUpload<>();
            upload.setMaxSize(maxBody);
            upload.setMaxPartHeaderSize(8192);
            var parts = upload.getItemIterator(request);
            if (!parts.hasNext()) throw ApiFailure.invalid();
            var part = parts.next();
            if (part.isFormField() || !"file".equals(part.getFieldName())) throw ApiFailure.invalid();
            String mime = part.getContentType() == null ? "" : part.getContentType().split(";")[0].strip().toLowerCase(Locale.ROOT);
            if (!types.contains(mime)) throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE");
            byte[] bytes;
            try (var stream = part.getInputStream()) { bytes = stream.readNBytes(maxFile + 1); }
            if (bytes.length > maxFile) throw new ApiFailure(413, "UPLOAD_TOO_LARGE");
            if (parts.hasNext()) throw ApiFailure.invalid();
            return new Media(bytes, mime);
        } catch (IOException e) { throw ApiFailure.invalid(); }
    }
}
