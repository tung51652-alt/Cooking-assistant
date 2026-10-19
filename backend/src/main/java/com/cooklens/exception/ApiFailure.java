package com.cooklens.exception;

public class ApiFailure extends RuntimeException {
    private final int status;
    private final String code;
    public ApiFailure(int status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }
    public int status() { return status; }
    public String code() { return code; }
    public String publicMessage() {
        return switch (code) {
            case "INVALID_IMAGE" -> "Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG hợp lệ.";
            case "UPLOAD_TOO_LARGE" -> "Yêu cầu vượt quá giới hạn dung lượng.";
            case "UNSUPPORTED_MEDIA_TYPE" -> "Định dạng yêu cầu không được hỗ trợ.";
            case "INVALID_DISH" -> "Món ăn không thuộc danh mục hỗ trợ.";
            case "VALIDATION_ERROR" -> "Dữ liệu yêu cầu không hợp lệ.";
            case "RECIPE_NOT_FOUND" -> "Không tìm thấy công thức.";
            case "SERVICE_BUSY" -> "Dịch vụ đang bận, vui lòng thử lại.";
            case "DEPENDENCY_TIMEOUT" -> "Dịch vụ phản hồi quá chậm, vui lòng thử lại.";
            case "DEPENDENCY_NOT_READY" -> "Dịch vụ chưa sẵn sàng, vui lòng thử lại.";
            default -> "Không xử lý được yêu cầu.";
        };
    }
    public static ApiFailure unavailable() { return new ApiFailure(503, "DEPENDENCY_NOT_READY"); }
    public static ApiFailure invalid() { return new ApiFailure(422, "VALIDATION_ERROR"); }
    public static ApiFailure timeout() { return new ApiFailure(504, "DEPENDENCY_TIMEOUT"); }
}
