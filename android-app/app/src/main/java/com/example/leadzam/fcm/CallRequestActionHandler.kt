package com.example.leadzam.fcm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.example.leadzam.model.CallRequest
import com.example.leadzam.model.CallRequestStatus

object CallRequestActionHandler {
    const val ACTION_CALL = "com.example.leadzam.action.CALL_REQUEST"
    const val ACTION_DISMISS = "com.example.leadzam.action.DISMISS_REQUEST"
    const val EXTRA_REQUEST_ID = "EXTRA_REQUEST_ID"
    const val EXTRA_PHONE_NUMBER = "EXTRA_PHONE_NUMBER"
    const val EXTRA_CONTACT_NAME = "EXTRA_CONTACT_NAME"
    const val EXTRA_TYPE = "EXTRA_TYPE"

    fun handleCall(
        context: Context,
        callRequest: CallRequest,
        onComplete: (Boolean) -> Unit = {}
    ) {
        if (!CallRequestManager.beginDialerLaunch(callRequest.requestId)) {
            onComplete(false)
            return
        }

        val dialIntent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:${callRequest.phoneNumber}")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }

        try {
            context.startActivity(dialIntent)
            CallRequestManager.finishDialerLaunch(callRequest.requestId, succeeded = true)
            CallRequestAcknowledgementClient.acknowledge(
                callRequest.requestId,
                CallRequestStatus.DIALER_OPENED,
                onComplete
            )
        } catch (exception: Exception) {
            CallRequestManager.finishDialerLaunch(callRequest.requestId, succeeded = false)
            Toast.makeText(context, "Unable to open dialer", Toast.LENGTH_SHORT).show()
            CallRequestAcknowledgementClient.acknowledge(
                callRequest.requestId,
                CallRequestStatus.FAILED,
                onComplete
            )
        }
    }

    fun handleDismiss(
        context: Context,
        callRequest: CallRequest,
        onComplete: (Boolean) -> Unit = {}
    ) {
        CallRequestManager.dismissCallRequest(callRequest.requestId)
        CallRequestAcknowledgementClient.acknowledge(
            callRequest.requestId,
            CallRequestStatus.DISMISSED,
            onComplete
        )
    }
}
