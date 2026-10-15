package com.example.leadzam.fcm

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.example.leadzam.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.io.IOException
import java.util.concurrent.Executors

object DeviceRegistrationClient {
    private const val TAG = "DeviceRegistrationClient"
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val READ_TIMEOUT_MS = 5_000
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private data class SendOutcome(
        val confirmed: Boolean,
        val retryable: Boolean
    )

    fun register(
        context: Context,
        registrationToken: String,
        onComplete: (Boolean) -> Unit = {}
    ) {
        if (registrationToken.isBlank()) {
            mainHandler.post { onComplete(false) }
            return
        }

        val applicationContext = context.applicationContext
        val profile = DeviceIdentityStore.load(applicationContext)
        executor.execute {
            val success = sendWithRetry(profile, registrationToken)
            mainHandler.post {
                runCatching { onComplete(success) }
            }
        }
    }

    private fun sendWithRetry(profile: DeviceProfile, registrationToken: String): Boolean {
        var retriesUsed = 0
        while (true) {
            val outcome = send(profile, registrationToken)
            if (outcome.confirmed || !NetworkRetryPolicy.canRetry(retriesUsed, outcome.retryable)) {
                return outcome.confirmed
            }
            retriesUsed += 1
        }
    }

    private fun send(profile: DeviceProfile, registrationToken: String): SendOutcome {
        val endpoint = "${BuildConfig.BACKEND_BASE_URL.trimEnd('/')}/api/devices/register"
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
        }

        return try {
            val payload = JSONObject()
                .put("deviceId", profile.deviceId)
                .put("deviceName", profile.deviceName)
                .put("registrationToken", registrationToken)
                .toString()
            connection.outputStream.use { output ->
                output.write(payload.toByteArray(StandardCharsets.UTF_8))
            }

            val responseCode = connection.responseCode
            val responseBody = if (responseCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                ""
            }
            val response = responseBody.takeIf { it.isNotBlank() }?.let(::JSONObject)
            val responseDevice = response?.optJSONObject("device")
            val confirmed = responseCode == HttpURLConnection.HTTP_OK &&
                response?.optBoolean("success", false) == true &&
                responseDevice?.optString("deviceId") == profile.deviceId

            if (!confirmed) {
                Log.w(TAG, "Device registration was not confirmed by backend (HTTP $responseCode)")
            }
            SendOutcome(
                confirmed = confirmed,
                retryable = !confirmed && NetworkRetryPolicy.isRetryableHttpStatus(responseCode)
            )
        } catch (exception: IOException) {
            Log.w(TAG, "Device registration request failed", exception)
            SendOutcome(confirmed = false, retryable = true)
        } catch (exception: Exception) {
            Log.w(TAG, "Device registration request failed", exception)
            SendOutcome(confirmed = false, retryable = false)
        } finally {
            connection.disconnect()
        }
    }
}
