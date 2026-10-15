package com.example.leadzam.fcm

object NetworkRetryPolicy {
    const val MAX_RETRIES = 1

    fun canRetry(retriesUsed: Int, retryableFailure: Boolean): Boolean =
        retryableFailure && retriesUsed < MAX_RETRIES

    fun isRetryableHttpStatus(statusCode: Int): Boolean =
        statusCode == 408 || statusCode == 429 || statusCode in 500..599
}
