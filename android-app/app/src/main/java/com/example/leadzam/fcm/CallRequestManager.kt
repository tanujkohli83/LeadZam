package com.example.leadzam.fcm

import android.util.Log
import com.example.leadzam.model.CallRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object CallRequestManager {
    private const val TAG = "CallRequestManager"
    private val stateLock = Any()
    private val dialerLaunchInProgress = mutableSetOf<String>()
    private val dialerOpened = mutableSetOf<String>()

    private val _activeCallRequest = MutableStateFlow<CallRequest?>(null)
    val activeCallRequest: StateFlow<CallRequest?> = _activeCallRequest.asStateFlow()

    fun setActiveCallRequest(callRequest: CallRequest) {
        Log.d(TAG, "New active call request set for ${callRequest.phoneNumber} (${callRequest.contactName})")
        _activeCallRequest.value = callRequest
    }

    fun dismissCallRequest(requestId: String?): CallRequest? {
        val activeRequest = _activeCallRequest.value
        if (activeRequest != null && (requestId == null || activeRequest.requestId == requestId)) {
            _activeCallRequest.value = null
            Log.d(TAG, "Active call request dismissed")
            return activeRequest
        }
        return null
    }

    fun beginDialerLaunch(requestId: String?): Boolean {
        if (requestId.isNullOrBlank()) return true
        return synchronized(stateLock) {
            if (requestId in dialerLaunchInProgress || requestId in dialerOpened) {
                false
            } else {
                dialerLaunchInProgress += requestId
                true
            }
        }
    }

    fun finishDialerLaunch(requestId: String?, succeeded: Boolean) {
        if (requestId.isNullOrBlank()) return
        synchronized(stateLock) {
            dialerLaunchInProgress -= requestId
            if (succeeded) dialerOpened += requestId
        }
    }

    fun clearForTests() {
        synchronized(stateLock) {
            dialerLaunchInProgress.clear()
            dialerOpened.clear()
        }
        _activeCallRequest.value = null
    }
}
