package com.cooklens.service;

import com.cooklens.config.RequestGuard;
import com.cooklens.exception.ApiFailure;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Locale;
import org.apache.commons.fileupload2.jakarta.servlet6.JakartaServletFileUpload;
import org.springframework.stereotype.Component;

@Component
public class ImageUpload {
    public record Image(byte[] bytes, String mime) {}
    public Image read(HttpServletRequest request) {
        if (request.getContentType() == null || !request.getContentType().split(";")[0].strip().equalsIgnoreCase("multipart/form-data"))
            throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE");
        try {
            var upload = new JakartaServletFileUpload<>();
            upload.setMaxSize(RequestGuard.MAX_UPLOAD);
            upload.setMaxPartHeaderSize(8192);
            var parts = upload.getItemIterator(request);
            if (!parts.hasNext()) throw ApiFailure.invalid();
            var part = parts.next();
            if (part.isFormField() || !"file".equals(part.getFieldName())) throw ApiFailure.invalid();
            String mime = part.getContentType() == null ? "" : part.getContentType().toLowerCase(Locale.ROOT);
            if (!mime.equals("image/png") && !mime.equals("image/jpeg")) throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE");
            byte[] image;
            try (var stream = part.getInputStream()) { image = stream.readNBytes(RequestGuard.MAX_FILE + 1); }
            if (image.length > RequestGuard.MAX_FILE) throw new ApiFailure(413, "UPLOAD_TOO_LARGE");
            if (parts.hasNext()) throw ApiFailure.invalid();
            return new Image(image, mime);
        } catch (IOException e) { throw ApiFailure.invalid(); }
    }
}
