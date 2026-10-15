package com.example.leadzam.fcm

import android.util.Log
import com.example.leadzam.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.io.IOException
import java.util.concurrent.Executors

object CallRequestAcknowledgementClient {
    private const val TAG = "CallRequestAckClient"
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val READ_TIMEOUT_MS = 5_000
    private val executor = Executors.newSingleThreadExecutor()

    private data class SendOutcome(
        val confirmed: Boolean,
        val retryable: Boolean
    )

    fun acknowledge(requestId: String?, status: String, onComplete: (Boolean) -> Unit = {}) {
        if (!com.example.leadzam.model.CallRequest.isValidRequestId(requestId)) {
            onComplete(false)
            return
        }

        executor.execute {
            val success = sendWithRetry(requestId!!, status)
            runCatching { onComplete(success) }
        }
    }

    private fun sendWithRetry(requestId: String, status: String): Boolean {
        var retriesUsed = 0
        while (true) {
            val outcome = send(requestId, status)
            if (outcome.confirmed || !NetworkRetryPolicy.canRetry(retriesUsed, outcome.retryable)) {
                return outcome.confirmed
            }
            retriesUsed += 1
        }
    }

    private fun send(requestId: String, status: String): SendOutcome {
        val request = CallRequestAcknowledgementProtocol.createRequest(
            BuildConfig.BACKEND_BASE_URL,
            requestId,
            status
        ) ?: return SendOutcome(confirmed = false, retryable = false)
        val connection = (URL(request.endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
        }

        return try {
            connection.outputStream.use { output ->
                output.write(request.body.toByteArray(StandardCharsets.UTF_8))
            }
            val responseCode = connection.responseCode
            val responseBody = if (responseCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                ""
            }
            val confirmed = CallRequestAcknowledgementProtocol.isConfirmed(
                responseCode,
                responseBody,
                status
            )
            if (!confirmed) {
                Log.w(TAG, "Acknowledgement was not confirmed by backend (HTTP $responseCode)")
            }
            SendOutcome(
                confirmed = confirmed,
                retryable = !confirmed && NetworkRetryPolicy.isRetryableHttpStatus(responseCode)
            )
        } catch (exception: IOException) {
            Log.w(TAG, "Acknowledgement request failed", exception)
            SendOutcome(confirmed = false, retryable = true)
        } catch (exception: Exception) {
            Log.w(TAG, "Acknowledgement request failed", exception)
            SendOutcome(confirmed = false, retryable = false)
        } finally {
            connection.disconnect()
        }
    }
}
