/**
 * Centralized error mapping: convert raw technical errors to user-friendly messages.
 * Maintains structured logging for developers in console.
 */

const logStructuredError = (context, err) => {
  const errorInfo = {
    context,
    timestamp: new Date().toISOString(),
    message: err?.message ?? null,
    code: err?.code ?? null,
    status: err?.status ?? null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    stack: err?.stack ?? null,
  };
  console.error(`[${context}]`, errorInfo);
};

const ERROR_PATTERNS = {
  // Network / Connectivity
  OFFLINE: {
    regex: /offline|no internet|network disconnected/i,
    code: "OFFLINE",
  },
  FETCH_FAILED: {
    regex: /failed to fetch|network request failed/i,
    code: "NETWORK_FAILED",
  },
  TIMEOUT: { regex: /timeout|took too long/i, code: "TIMEOUT" },

  // Authentication
  AUTH_EXPIRED: {
    regex: /auth.*expired|session.*expired|jwt|unauthorized/i,
    code: "AUTH_EXPIRED",
  },
  AUTH_INVALID: {
    regex: /invalid.*credentials|wrong password|auth.*failed/i,
    code: "AUTH_INVALID",
  },

  // Supabase / Database
  RLS_DENIED: {
    regex: /rls|row level security|permission|denied/i,
    code: "RLS_DENIED",
  },
  DUPLICATE_KEY: {
    regex: /duplicate|unique constraint|23505/i,
    code: "DUPLICATE_KEY",
  },
  NOT_FOUND: { regex: /not found|no rows|pgrst116/i, code: "NOT_FOUND" },

  // Gemini / AI
  GEMINI_QUOTA: { regex: /429|quota|rate limit/i, code: "GEMINI_QUOTA" },
  GEMINI_UNAVAILABLE: {
    regex: /503|service unavailable|gemini.*down/i,
    code: "GEMINI_UNAVAILABLE",
  },
  GEMINI_INVALID_KEY: {
    regex: /api key|invalid.*key|authentication|403/i,
    code: "GEMINI_INVALID_KEY",
  },
  GEMINI_SAFETY: {
    regex: /safety|blocked|inappropriate|filter/i,
    code: "GEMINI_SAFETY",
  },
  GEMINI_PARSE_ERROR: {
    // more specific parse errors to avoid colliding with generic 'format' words
    regex:
      /invalid json|invalid json response|invalid json payload|malformed response|unexpected token|parse failed|invalid json response body/i,
    code: "GEMINI_PARSE_ERROR",
  },

  // Upload / OCR
  // image / mime specific problems (must mention image/mime)
  UNSUPPORTED_IMAGE: {
    regex:
      /unsupported image|invalid mime|invalid image type|unsupported file type|image\/jpeg|image\/png|unsupported file/i,
    code: "UNSUPPORTED_IMAGE",
  },
  IMAGE_TOO_LARGE: {
    regex: /size|too large|file.*too big/i,
    code: "IMAGE_TOO_LARGE",
  },
  OCR_FAILED: {
    regex:
      /unreadable receipt|no text detected|failed to extract|empty ocr|could not analyze receipt|struk tidak terbaca|dokumen tidak terbaca|dokumen tidak dapat diproses|ocr failed|extraction failed|no.*text|unreadable/i,
    code: "OCR_FAILED",
  },
  CAMERA_DENIED: {
    regex: /camera|permission|denied|notallowederror/i,
    code: "CAMERA_DENIED",
  },
  UPLOAD_ABORTED: { regex: /abort|cancel/i, code: "UPLOAD_ABORTED" },
};

function detectErrorPattern(err, context = "") {
  const msg =
    `${err?.message || ""} ${err?.code || ""} ${err?.details || ""}`.toLowerCase();

  const isReceiptContext = /receipt|scan|upload/i.test(context);

  // In receipt-related contexts, prioritize OCR/Gemini parse/unavailable checks
  if (isReceiptContext) {
    if (ERROR_PATTERNS.OCR_FAILED.regex.test(msg))
      return ERROR_PATTERNS.OCR_FAILED.code;
    if (ERROR_PATTERNS.GEMINI_PARSE_ERROR.regex.test(msg))
      return ERROR_PATTERNS.GEMINI_PARSE_ERROR.code;
    if (ERROR_PATTERNS.GEMINI_UNAVAILABLE.regex.test(msg))
      return ERROR_PATTERNS.GEMINI_UNAVAILABLE.code;
    if (ERROR_PATTERNS.UNSUPPORTED_IMAGE.regex.test(msg))
      return ERROR_PATTERNS.UNSUPPORTED_IMAGE.code;
  }

  for (const [key, pattern] of Object.entries(ERROR_PATTERNS)) {
    if (pattern.regex.test(msg)) {
      return pattern.code;
    }
  }

  return null;
}

/**
 * Map raw error to user-friendly error object.
 * @param {Error} error - The error to map
 * @param {string} context - Context (e.g., 'AI_CHAT', 'RECEIPT_SCAN', 'AUTH', 'SUPABASE')
 * @returns {Object} { title, message, severity, retryable, userMessage }
 */
export const mapAppError = (error, context = "UNKNOWN") => {
  logStructuredError(context, error);

  const pattern = detectErrorPattern(error, context);
  const status = error?.status ?? error?.statusCode;

  // Network / Connectivity
  if (pattern === "OFFLINE" || !navigator.onLine) {
    return {
      title: "Offline",
      message: "Sedang offline. Periksa koneksi internet Anda.",
      severity: "warning",
      retryable: true,
      userMessage: "Sedang offline. Cek koneksi internet Anda.",
    };
  }

  if (pattern === "FETCH_FAILED") {
    return {
      title: "Network Error",
      message: "Koneksi internet bermasalah.",
      severity: "error",
      retryable: true,
      userMessage: "Koneksi internet bermasalah. Coba ulang sebentar lagi.",
    };
  }

  if (pattern === "TIMEOUT") {
    return {
      title: "Request Timeout",
      message: "Permintaan memakan waktu terlalu lama.",
      severity: "error",
      retryable: true,
      userMessage: "Permintaan terlalu lama. Coba ulang.",
    };
  }

  // Authentication
  if (pattern === "AUTH_EXPIRED") {
    return {
      title: "Session Expired",
      message: "Sesi Anda sudah berakhir. Silakan login kembali.",
      severity: "error",
      retryable: false,
      userMessage: "Sesi berakhir. Silakan login kembali.",
    };
  }

  if (pattern === "AUTH_INVALID") {
    return {
      title: "Invalid Credentials",
      message: "Email atau kata sandi salah.",
      severity: "error",
      retryable: false,
      userMessage: "Email atau kata sandi salah.",
    };
  }

  // Database / Supabase
  if (pattern === "RLS_DENIED") {
    return {
      title: "Access Denied",
      message: "Anda tidak memiliki akses untuk melakukan tindakan ini.",
      severity: "error",
      retryable: false,
      userMessage: "Akses ditolak. Hubungi support jika ada masalah.",
    };
  }

  if (pattern === "DUPLICATE_KEY") {
    return {
      title: "Already Exists",
      message: "Data sudah tersimpan sebelumnya.",
      severity: "warning",
      retryable: false,
      userMessage: "Data sudah tersimpan sebelumnya.",
    };
  }

  if (pattern === "NOT_FOUND") {
    return {
      title: "Not Found",
      message: "Data tidak ditemukan.",
      severity: "error",
      retryable: false,
      userMessage: "Data tidak ditemukan.",
    };
  }

  // AI / Gemini Errors
  if (context.includes("AI") || context.includes("CHAT")) {
    if (pattern === "GEMINI_QUOTA") {
      return {
        title: "AI Quota Exceeded",
        message: "AI sedang sibuk dengan permintaan lain.",
        severity: "warning",
        retryable: true,
        userMessage: "Asisten AI sedang sibuk. Coba lagi beberapa saat.",
      };
    }

    if (pattern === "GEMINI_UNAVAILABLE") {
      return {
        title: "AI Service Unavailable",
        message: "Layanan AI sedang mengalami gangguan.",
        severity: "error",
        retryable: true,
        userMessage: "Asisten AI sedang gangguan. Coba lagi nanti.",
      };
    }

    if (pattern === "GEMINI_INVALID_KEY") {
      return {
        title: "AI Configuration Error",
        message: "API key Gemini tidak dikonfigurasi dengan benar.",
        severity: "error",
        retryable: false,
        userMessage: "Ada masalah konfigurasi. Hubungi support.",
      };
    }

    if (pattern === "GEMINI_SAFETY") {
      return {
        title: "Content Blocked",
        message: "Konten Anda diblokir oleh filter keamanan AI.",
        severity: "warning",
        retryable: true,
        userMessage: "Pesan diblokir. Coba dengan kata-kata berbeda.",
      };
    }

    if (pattern === "GEMINI_PARSE_ERROR") {
      return {
        title: "AI Response Error",
        message: "Respons dari AI tidak valid.",
        severity: "error",
        retryable: true,
        userMessage: "Asisten AI tidak mengerti. Coba ulang lagi.",
      };
    }

    // Default AI error
    return {
      title: "AI Error",
      message: "Terjadi kesalahan saat berkomunikasi dengan asisten AI.",
      severity: "error",
      retryable: true,
      userMessage: "Asisten AI sedang bermasalah. Coba lagi sebentar.",
    };
  }

  // Receipt / Upload / OCR Errors
  if (
    context.includes("RECEIPT") ||
    context.includes("SCAN") ||
    context.includes("UPLOAD")
  ) {
    // Receipt-specific AI errors (prioritize helpful fallbacks)
    if (pattern === "GEMINI_PARSE_ERROR") {
      return {
        title: "Scanner Parsing Error",
        message:
          "Scanner berhasil membaca gambar, tapi data dokumen belum bisa diproses.",
        severity: "error",
        retryable: true,
        userMessage:
          "Scanner berhasil membaca gambar, tapi data dokumen belum bisa diproses.",
      };
    }

    if (pattern === "GEMINI_UNAVAILABLE") {
      return {
        title: "Scanner AI Error",
        message: "Scanner AI sedang bermasalah. Coba lagi beberapa saat.",
        severity: "error",
        retryable: true,
        userMessage: "Scanner AI sedang bermasalah. Coba lagi beberapa saat.",
      };
    }

    if (pattern === "UNSUPPORTED_IMAGE") {
      return {
        title: "Unsupported Format",
        message: "Format gambar tidak didukung. Gunakan JPG atau PNG.",
        severity: "error",
        retryable: false,
        userMessage: "Format gambar tidak didukung. Gunakan JPG atau PNG.",
      };
    }

    if (pattern === "IMAGE_TOO_LARGE") {
      return {
        title: "File Too Large",
        message: "Ukuran gambar terlalu besar (max 5MB).",
        severity: "error",
        retryable: false,
        userMessage: "Gambar terlalu besar. Kompres dan coba lagi.",
      };
    }

    if (pattern === "OCR_FAILED") {
      return {
        title: "OCR Failed",
        message:
          "Dokumen kurang jelas dibaca. Coba foto ulang dengan cahaya lebih terang.",
        severity: "error",
        retryable: true,
        userMessage:
          "Dokumen kurang jelas dibaca. Coba foto ulang dengan cahaya lebih terang.",
      };
    }

    if (pattern === "CAMERA_DENIED") {
      return {
        title: "Camera Permission Denied",
        message: "Aplikasi membutuhkan akses kamera untuk scan dokumen.",
        severity: "error",
        retryable: false,
        userMessage: "Izin kamera ditolak. Aktifkan di pengaturan perangkat.",
      };
    }

    if (pattern === "UPLOAD_ABORTED") {
      return {
        title: "Upload Cancelled",
        message: "Upload dibatalkan.",
        severity: "info",
        retryable: true,
        userMessage: "Upload dibatalkan.",
      };
    }

    // Default OCR error
    return {
      title: "Processing Failed",
      message: "Gagal memproses dokumen. Coba gambar yang lebih jelas.",
      severity: "error",
      retryable: true,
      userMessage: "Gagal membaca dokumen. Coba ambil ulang dengan lebih jelas.",
    };
  }

  // Generic fallback
  return {
    title: "Unexpected Error",
    message: "Terjadi kesalahan yang tidak terduga.",
    severity: "error",
    retryable: true,
    userMessage: "Ada yang tidak beres. Coba lagi.",
  };
};

/**
 * Check if app is online (navigator.onLine)
 */
export const isOnline = () => typeof window !== "undefined" && navigator.onLine;

/**
 * Get retry eligibility hint
 */
export const getRetryHint = (err, context) => {
  const mapped = mapAppError(err, context);
  return mapped.retryable ? "Coba ulang" : null;
};
