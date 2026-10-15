package com.example.leadzam.fcm

import com.example.leadzam.model.CallRequest
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class AcknowledgementRequest(
    val endpoint: String,
    val body: String
)

object CallRequestAcknowledgementProtocol {
    fun createRequest(
        baseUrl: String,
        requestId: String?,
        status: String
    ): AcknowledgementRequest? {
        if (!CallRequest.isValidRequestId(requestId) || status.isBlank()) return null

        val encodedRequestId = URLEncoder.encode(requestId, StandardCharsets.UTF_8.name())
        return AcknowledgementRequest(
            endpoint = "${baseUrl.trimEnd('/')}/api/requests/$encodedRequestId/ack",
            body = JSONObject().put("status", status).toString()
        )
    }

    fun isConfirmed(responseCode: Int, responseBody: String, expectedStatus: String): Boolean {
        if (responseCode != 200 || responseBody.isBlank()) return false
        return runCatching {
            val response = JSONObject(responseBody)
            response.optBoolean("success", false) && response.optString("status") == expectedStatus
        }.getOrDefault(false)
    }
}
