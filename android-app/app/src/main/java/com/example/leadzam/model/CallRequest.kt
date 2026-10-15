package com.example.leadzam.model

import android.util.Log

data class CallRequest(
    val requestId: String? = null,
    val type: String = DIAL_REQUEST_TYPE,
    val phoneNumber: String,
    val contactName: String? = null,
    val timestampMs: Long = System.currentTimeMillis()
) {
    companion object {
        const val DIAL_REQUEST_TYPE = "dial_request"

        fun isValidRequestId(requestId: String?): Boolean {
            return !requestId.isNullOrBlank() && requestId.length <= 100 &&
                requestId.all { it.isLetterOrDigit() || it == '-' || it == '_' }
        }
    }
}

object CallRequestStatus {
    const val RECEIVED = "received"
    const val DIALER_OPENED = "dialer_opened"
    const val DISMISSED = "dismissed"
    const val FAILED = "failed"
}

object CallRequestValidator {
    /**
     * Validates that the input is a plausible phone number.
     * Supports international numbers starting with '+', spaces, dashes, parentheses.
     * Length between 7 and 20 chars, with 7 to 15 digits.
     */
    fun isValidPhoneNumber(phoneNumber: String?): Boolean {
        if (phoneNumber.isNullOrBlank()) return false
        val trimmed = phoneNumber.trim()
        if (trimmed.length < 7 || trimmed.length > 20) return false

        val phoneRegex = Regex("""^\+?[0-9\s\-()]{7,20}$""")
        if (!phoneRegex.matches(trimmed)) return false

        val digitCount = trimmed.count { it.isDigit() }
        if (digitCount < 7 || digitCount > 15) return false

        return true
    }
}

object CallRequestParser {
    private const val TAG = "CallRequestParser"

    fun parseFromData(data: Map<String, String>): CallRequest? {
        val type = data["type"] ?: return null
        if (type != CallRequest.DIAL_REQUEST_TYPE) return null

        val rawRequestId = data["requestId"]?.trim()
        if (!rawRequestId.isNullOrEmpty() && !CallRequest.isValidRequestId(rawRequestId)) {
            return null
        }

        val rawPhone = data["phoneNumber"] ?: data["phone_number"] ?: data["phone"]
        if (!CallRequestValidator.isValidPhoneNumber(rawPhone)) {
            Log.w(TAG, "Invalid or missing phone number in dial_request: $rawPhone")
            return null
        }

        val rawContactName = data["contactName"] ?: data["contact_name"] ?: data["name"]
        val contactName = rawContactName?.trim()?.takeIf { it.isNotBlank() }

        return CallRequest(
            requestId = rawRequestId?.takeIf { it.isNotEmpty() },
            type = type,
            phoneNumber = rawPhone!!.trim(),
            contactName = contactName
        )
    }
}
