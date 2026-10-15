package com.example.leadzam.fcm

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface TokenUiState {
    data object Idle : TokenUiState
    data object Loading : TokenUiState
    data class Success(val token: String) : TokenUiState
    data class Error(val message: String) : TokenUiState
}

data class ReceivedMessage(
    val title: String,
    val body: String,
    val data: Map<String, String>,
    val timestampMs: Long = System.currentTimeMillis()
)

object FcmTokenManager {
    private const val TAG = "FcmTokenManager"

    private val _tokenState = MutableStateFlow<TokenUiState>(TokenUiState.Idle)
    val tokenState: StateFlow<TokenUiState> = _tokenState.asStateFlow()

    private val _latestMessage = MutableStateFlow<ReceivedMessage?>(null)
    val latestMessage: StateFlow<ReceivedMessage?> = _latestMessage.asStateFlow()

    fun fetchToken() {
        _tokenState.value = TokenUiState.Loading
        try {
            FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (!task.isSuccessful) {
                        val exception = task.exception
                        val errorMsg = exception?.localizedMessage ?: "Failed to retrieve FCM token."
                        Log.w(TAG, "Fetching FCM registration token failed", exception)
                        _tokenState.value = TokenUiState.Error(errorMsg)
                        return@addOnCompleteListener
                    }

                    val token = task.result
                    Log.d(TAG, "FCM Token retrieved successfully (length: ${token?.length ?: 0})")
                    if (!token.isNullOrEmpty()) {
                        _tokenState.value = TokenUiState.Success(token)
                    } else {
                        _tokenState.value = TokenUiState.Error("Retrieved FCM token was empty.")
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Error initiating token retrieval", e)
            _tokenState.value = TokenUiState.Error(e.localizedMessage ?: "Unexpected error retrieving FCM token.")
        }
    }

    fun onNewToken(newToken: String) {
        Log.d(TAG, "Refreshed FCM registration token received (length: ${newToken.length})")
        _tokenState.value = TokenUiState.Success(newToken)
    }

    fun onMessageReceived(title: String?, body: String?, data: Map<String, String>) {
        val safeTitle = title?.takeIf { it.isNotBlank() } ?: "FCM Test Message"
        val safeBody = body?.takeIf { it.isNotBlank() } ?: data["message"] ?: data["body"] ?: "No body content"

        Log.d(TAG, "Message received in FcmTokenManager: $safeTitle - $safeBody")
        _latestMessage.value = ReceivedMessage(
            title = safeTitle,
            body = safeBody,
            data = data
        )
    }

    fun clearLatestMessage() {
        _latestMessage.value = null
    }
}
