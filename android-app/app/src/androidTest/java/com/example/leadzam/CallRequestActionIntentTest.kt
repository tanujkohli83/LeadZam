package com.example.leadzam

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.leadzam.fcm.CallRequestActionHandler
import com.example.leadzam.fcm.CallRequestActionIntentFactory
import com.example.leadzam.model.CallRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CallRequestActionIntentTest {
    @Test
    fun actionIntentsCarryRequestSpecificExtras() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val firstRequest = CallRequest(
            requestId = "request-one",
            phoneNumber = "+919876543210",
            contactName = "First Lead"
        )
        val secondRequest = firstRequest.copy(
            requestId = "request-two",
            phoneNumber = "+919876543211"
        )

        val firstCall = CallRequestActionIntentFactory.callIntent(context, firstRequest)
        val firstDismiss = CallRequestActionIntentFactory.dismissIntent(context, firstRequest)
        val secondCall = CallRequestActionIntentFactory.callIntent(context, secondRequest)

        assertEquals(CallRequestActionHandler.ACTION_CALL, firstCall.action)
        assertEquals(CallRequestActionHandler.ACTION_DISMISS, firstDismiss.action)
        assertEquals("request-one", firstCall.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID))
        assertEquals("+919876543210", firstCall.getStringExtra(CallRequestActionHandler.EXTRA_PHONE_NUMBER))
        assertEquals("First Lead", firstCall.getStringExtra(CallRequestActionHandler.EXTRA_CONTACT_NAME))
        assertEquals("request-one", firstDismiss.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID))
        assertEquals("request-two", secondCall.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID))
        assertNotEquals(
            firstCall.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID),
            secondCall.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID)
        )
    }
}
