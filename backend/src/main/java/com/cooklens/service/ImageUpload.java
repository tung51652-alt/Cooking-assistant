package com.cooklens.service;

import com.cooklens.config.RequestGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class ImageUpload {
    private final SingleFileUpload upload;

    public ImageUpload(SingleFileUpload upload) { this.upload = upload; }

    public SingleFileUpload.Media read(HttpServletRequest request) {
        return upload.read(request, RequestGuard.MAX_FILE, RequestGuard.MAX_UPLOAD, Set.of("image/png", "image/jpeg"));
    }
}
