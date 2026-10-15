package com.example.leadzam.fcm

import android.util.Log
import com.example.leadzam.model.CallRequestParser
import com.example.leadzam.model.CallRequestStatus
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed token length: ${token.length}")
        FcmTokenManager.onNewToken(token)
        DeviceRegistrationClient.register(applicationContext, token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "From: ${remoteMessage.from}")

        val dataMap = remoteMessage.data
        if (dataMap.isNotEmpty()) {
            Log.d(TAG, "Message data payload size: ${dataMap.size}")
            val callRequest = CallRequestParser.parseFromData(dataMap)
            if (callRequest != null) {
                Log.d(TAG, "Received valid dial_request for ${callRequest.phoneNumber}")
                CallRequestManager.setActiveCallRequest(callRequest)
                CallRequestAcknowledgementClient.acknowledge(
                    callRequest.requestId,
                    CallRequestStatus.RECEIVED
                )
                NotificationHelper.showCallRequestNotification(applicationContext, callRequest)
                return
            }
        }

        // Fallback for Phase 2 general test messages
        val notificationTitle = remoteMessage.notification?.title
        val notificationBody = remoteMessage.notification?.body

        val title = notificationTitle ?: dataMap["title"] ?: "LeadZam Test Notification"
        val body = notificationBody ?: dataMap["body"] ?: dataMap["message"] ?: "New test message received"

        FcmTokenManager.onMessageReceived(
            title = title,
            body = body,
            data = dataMap
        )

        NotificationHelper.showNotification(
            context = applicationContext,
            title = title,
            body = body
        )
    }

    companion object {
        private const val TAG = "MyFirebaseMsgService"
    }
}
