package com.example.leadzam

import com.example.leadzam.fcm.CallRequestManager
import com.example.leadzam.fcm.CallRequestAcknowledgementClient
import com.example.leadzam.fcm.NetworkRetryPolicy
import com.example.leadzam.model.CallRequest
import com.example.leadzam.model.CallRequestParser
import com.example.leadzam.model.CallRequestStatus
import com.example.leadzam.fcm.DeviceIdentityStore
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CallRequestTest {

    @Test
    fun deviceIdentityValidationAcceptsFriendlyNamesAndStableIds() {
        assertTrue(DeviceIdentityStore.isValidDeviceId("android-office_1"))
        assertTrue(DeviceIdentityStore.isValidDeviceName("Office Android"))
        assertFalse(DeviceIdentityStore.isValidDeviceId("device/id"))
        assertFalse(DeviceIdentityStore.isValidDeviceName("   "))
    }
    @After
    fun tearDown() {
        CallRequestManager.clearForTests()
    }

    @Test
    fun parsesRequestIdAndDialPayload() {
        val request = CallRequestParser.parseFromData(
            mapOf(
                "type" to CallRequest.DIAL_REQUEST_TYPE,
                "requestId" to "request-123",
                "phoneNumber" to "+91 98765 43210",
                "contactName" to "Rahul Sharma"
            )
        )

        assertNotNull(request)
        assertEquals("request-123", request?.requestId)
        assertEquals("+91 98765 43210", request?.phoneNumber)
        assertEquals("Rahul Sharma", request?.contactName)
    }

    @Test
    fun rejectsMalformedRequestIdButKeepsLegacyPayloadCompatible() {
        val malformed = CallRequestParser.parseFromData(
            mapOf(
                "type" to CallRequest.DIAL_REQUEST_TYPE,
                "requestId" to "request/id",
                "phoneNumber" to "+919876543210"
            )
        )
        val legacy = CallRequestParser.parseFromData(
            mapOf(
                "type" to CallRequest.DIAL_REQUEST_TYPE,
                "phoneNumber" to "+919876543210"
            )
        )

        assertNull(malformed)
        assertNotNull(legacy)
        assertNull(legacy?.requestId)
    }

    @Test
    fun rejectsMissingAndUnsupportedPayloadTypes() {
        assertNull(CallRequestParser.parseFromData(mapOf("phoneNumber" to "+919876543210")))
        assertNull(
            CallRequestParser.parseFromData(
                mapOf(
                    "type" to "other_message",
                    "phoneNumber" to "+919876543210"
                )
            )
        )
        assertFalse(com.example.leadzam.model.CallRequestValidator.isValidPhoneNumber("not-a-phone"))
    }

    @Test
    fun invalidAcknowledgementInputFailsWithoutStartingNetworkWork() {
        var callbackResult: Boolean? = null

        CallRequestAcknowledgementClient.acknowledge("request/id", CallRequestStatus.RECEIVED) {
            callbackResult = it
        }

        assertEquals(false, callbackResult)
    }

    @Test
    fun failedAcknowledgementAfterDialerLaunchCannotTriggerSecondLaunch() {
        assertTrue(CallRequestManager.beginDialerLaunch("request-123"))
        assertFalse(CallRequestManager.beginDialerLaunch("request-123"))

        // The dialer is marked as launched before the acknowledgement is sent.
        CallRequestManager.finishDialerLaunch("request-123", succeeded = true)

        // A failed acknowledgement must not make the request launchable again.
        assertFalse(CallRequestManager.beginDialerLaunch("request-123"))
    }

    @Test
    fun retryPolicyAllowsOnlyOneRetryForTransientFailures() {
        assertTrue(NetworkRetryPolicy.canRetry(0, retryableFailure = true))
        assertFalse(NetworkRetryPolicy.canRetry(1, retryableFailure = true))
        assertFalse(NetworkRetryPolicy.canRetry(0, retryableFailure = false))
    }

    @Test
    fun retryPolicyRetriesOnlyTransientHttpStatuses() {
        assertTrue(NetworkRetryPolicy.isRetryableHttpStatus(408))
        assertTrue(NetworkRetryPolicy.isRetryableHttpStatus(429))
        assertTrue(NetworkRetryPolicy.isRetryableHttpStatus(503))
        assertFalse(NetworkRetryPolicy.isRetryableHttpStatus(400))
        assertFalse(NetworkRetryPolicy.isRetryableHttpStatus(410))
    }
}
