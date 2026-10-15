package com.example.leadzam.fcm

import android.content.Context
import android.content.Intent
import com.example.leadzam.model.CallRequest

object CallRequestActionIntentFactory {
    fun callIntent(context: Context, callRequest: CallRequest): Intent =
        createIntent(context, CallRequestActionHandler.ACTION_CALL, callRequest)

    fun dismissIntent(context: Context, callRequest: CallRequest): Intent =
        createIntent(context, CallRequestActionHandler.ACTION_DISMISS, callRequest)

    private fun createIntent(
        context: Context,
        action: String,
        callRequest: CallRequest
    ): Intent {
        return Intent(context, CallRequestActionReceiver::class.java).apply {
            this.action = action
            putExtra(CallRequestActionHandler.EXTRA_REQUEST_ID, callRequest.requestId)
            putExtra(CallRequestActionHandler.EXTRA_PHONE_NUMBER, callRequest.phoneNumber)
            putExtra(CallRequestActionHandler.EXTRA_CONTACT_NAME, callRequest.contactName)
            putExtra(CallRequestActionHandler.EXTRA_TYPE, callRequest.type)
        }
    }
}
