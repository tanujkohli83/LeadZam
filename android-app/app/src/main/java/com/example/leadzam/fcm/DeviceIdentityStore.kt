package com.example.leadzam.fcm

import android.content.Context
import java.util.UUID

data class DeviceProfile(
    val deviceId: String,
    val deviceName: String
)

object DeviceIdentityStore {
    const val DEFAULT_DEVICE_NAME = "Android device"
    private const val PREFERENCES_NAME = "leadzam_device_preferences"
    private const val DEVICE_ID_KEY = "device_id"
    private const val DEVICE_NAME_KEY = "device_name"

    fun load(context: Context): DeviceProfile {
        val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        val storedId = preferences.getString(DEVICE_ID_KEY, null)
        val deviceId = storedId?.takeIf(::isValidDeviceId) ?: UUID.randomUUID().toString()
        val storedName = preferences.getString(DEVICE_NAME_KEY, null)
        val deviceName = storedName?.trim()?.takeIf(::isValidDeviceName) ?: DEFAULT_DEVICE_NAME

        if (storedId != deviceId || storedName != deviceName) {
            preferences.edit()
                .putString(DEVICE_ID_KEY, deviceId)
                .putString(DEVICE_NAME_KEY, deviceName)
                .apply()
        }

        return DeviceProfile(deviceId, deviceName)
    }

    fun saveName(context: Context, deviceName: String): DeviceProfile? {
        val trimmedName = deviceName.trim()
        if (!isValidDeviceName(trimmedName)) return null

        val profile = load(context)
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(DEVICE_NAME_KEY, trimmedName)
            .apply()
        return profile.copy(deviceName = trimmedName)
    }

    fun isValidDeviceId(deviceId: String): Boolean {
        return deviceId.length in 1..100 && deviceId.all { it.isLetterOrDigit() || it == '-' || it == '_' }
    }

    fun isValidDeviceName(deviceName: String): Boolean {
        return deviceName.trim().length in 1..80
    }
}
