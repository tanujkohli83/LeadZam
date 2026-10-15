package com.example.leadzam

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.leadzam.fcm.CallRequestAcknowledgementProtocol
import com.example.leadzam.model.CallRequest
import com.example.leadzam.model.CallRequestStatus
import com.example.leadzam.model.CallRequestParser
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CallRequestProtocolTest {
    @Test
    fun malformedPhonePayloadIsRejected() {
        val request = CallRequestParser.parseFromData(
            mapOf(
                "type" to CallRequest.DIAL_REQUEST_TYPE,
                "requestId" to "request-invalid-phone",
                "phoneNumber" to "not-a-phone"
            )
        )

        assertNull(request)
    }

    @Test
    fun acknowledgementProtocolBuildsRequestAndRejectsUnsafeResponses() {
        val request = CallRequestAcknowledgementProtocol.createRequest(
            "http://localhost:3000/",
            "request-123",
            CallRequestStatus.RECEIVED
        )

        val builtRequest = request ?: error("Expected acknowledgement request")
        assertEquals(
            "http://localhost:3000/api/requests/request-123/ack",
            builtRequest.endpoint
        )
        assertEquals(CallRequestStatus.RECEIVED, JSONObject(builtRequest.body).optString("status"))
        assertNull(
            CallRequestAcknowledgementProtocol.createRequest(
                "http://localhost:3000",
                "request/id",
                CallRequestStatus.RECEIVED
            )
        )
        assertTrue(
            CallRequestAcknowledgementProtocol.isConfirmed(
                200,
                "{\"success\":true,\"status\":\"received\"}",
                CallRequestStatus.RECEIVED
            )
        )
        assertFalse(
            CallRequestAcknowledgementProtocol.isConfirmed(
                200,
                "not-json",
                CallRequestStatus.RECEIVED
            )
        )
        assertFalse(
            CallRequestAcknowledgementProtocol.isConfirmed(
                500,
                "{\"success\":true,\"status\":\"received\"}",
                CallRequestStatus.RECEIVED
            )
        )
    }
}
