package com.example.leadzam.fcm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.leadzam.model.CallRequest
import com.example.leadzam.model.CallRequestValidator

class CallRequestActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val request = requestFromIntent(intent)
        if (request == null) {
            pendingResult.finish()
            return
        }

        val onComplete: (Boolean) -> Unit = { pendingResult.finish() }
        when (intent.action) {
            CallRequestActionHandler.ACTION_CALL ->
                CallRequestActionHandler.handleCall(context, request, onComplete)
            CallRequestActionHandler.ACTION_DISMISS ->
                CallRequestActionHandler.handleDismiss(context, request, onComplete)
            else -> pendingResult.finish()
        }
    }

    private fun requestFromIntent(intent: Intent): CallRequest? {
        val phone = intent.getStringExtra(CallRequestActionHandler.EXTRA_PHONE_NUMBER)
        if (!CallRequestValidator.isValidPhoneNumber(phone)) return null
        return CallRequest(
            requestId = intent.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID),
            type = intent.getStringExtra(CallRequestActionHandler.EXTRA_TYPE)
                ?: CallRequest.DIAL_REQUEST_TYPE,
            phoneNumber = phone!!,
            contactName = intent.getStringExtra(CallRequestActionHandler.EXTRA_CONTACT_NAME)
        )
    }
}
