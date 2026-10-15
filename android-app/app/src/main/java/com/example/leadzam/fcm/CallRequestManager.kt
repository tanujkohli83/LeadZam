package com.example.leadzam.fcm

import android.util.Log
import com.example.leadzam.model.CallRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object CallRequestManager {
    private const val TAG = "CallRequestManager"

    private val _activeCallRequest = MutableStateFlow<CallRequest?>(null)
    val activeCallRequest: StateFlow<CallRequest?> = _activeCallRequest.asStateFlow()

    fun setActiveCallRequest(callRequest: CallRequest) {
        Log.d(TAG, "New active call request set for ${callRequest.phoneNumber} (${callRequest.contactName})")
        _activeCallRequest.value = callRequest
    }

    fun dismissCallRequest() {
        Log.d(TAG, "Active call request dismissed")
        _activeCallRequest.value = null
    }
}
