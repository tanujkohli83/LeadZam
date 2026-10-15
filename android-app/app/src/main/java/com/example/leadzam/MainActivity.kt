package com.example.leadzam

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.leadzam.fcm.CallRequestManager
import com.example.leadzam.fcm.CallRequestActionHandler
import com.example.leadzam.fcm.DeviceIdentityStore
import com.example.leadzam.fcm.DeviceRegistrationClient
import com.example.leadzam.fcm.FcmTokenManager
import com.example.leadzam.fcm.NotificationHelper
import com.example.leadzam.fcm.ReceivedMessage
import com.example.leadzam.fcm.TokenUiState
import com.example.leadzam.model.CallRequest
import com.example.leadzam.model.CallRequestValidator
import com.example.leadzam.ui.theme.LeadZamTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        NotificationHelper.createNotificationChannel(this)

        handleIntentExtras(intent)

        setContent {
            LeadZamTheme {
                FcmApp()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntentExtras(intent)
    }

    private fun handleIntentExtras(intent: Intent?) {
        if (intent == null) return
        val phone = intent.getStringExtra("EXTRA_PHONE_NUMBER")
        val type = intent.getStringExtra("EXTRA_TYPE")
        if (type == CallRequest.DIAL_REQUEST_TYPE && CallRequestValidator.isValidPhoneNumber(phone)) {
            val contact = intent.getStringExtra("EXTRA_CONTACT_NAME")
            CallRequestManager.setActiveCallRequest(
                CallRequest(
                    requestId = intent.getStringExtra(CallRequestActionHandler.EXTRA_REQUEST_ID),
                    type = type,
                    phoneNumber = phone!!,
                    contactName = contact
                )
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FcmApp() {
    val context = LocalContext.current
    @Suppress("DEPRECATION")
    val clipboardManager = LocalClipboardManager.current

    val tokenState by FcmTokenManager.tokenState.collectAsState()
    val latestMessage by FcmTokenManager.latestMessage.collectAsState()
    val activeCallRequest by CallRequestManager.activeCallRequest.collectAsState()
    val initialDeviceProfile = remember { DeviceIdentityStore.load(context) }
    var deviceName by remember { mutableStateOf(initialDeviceProfile.deviceName) }
    var deviceNameInput by remember { mutableStateOf(initialDeviceProfile.deviceName) }
    var registrationMessage by remember { mutableStateOf("Device registration pending") }

    var hasNotificationPermission by remember {
        mutableStateOf(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasNotificationPermission = isGranted
        if (isGranted) {
            Toast.makeText(context, "Notification permission granted", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, "Notification permission denied", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(Unit) {
        FcmTokenManager.fetchToken()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(tokenState, deviceName) {
        val token = (tokenState as? TokenUiState.Success)?.token ?: return@LaunchedEffect
        registrationMessage = "Registering device…"
        DeviceRegistrationClient.register(context, token) { registered ->
            registrationMessage = if (registered) {
                "Registered as $deviceName"
            } else {
                "Backend registration is unavailable"
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("LeadZam - Click-to-Call") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // Permission Card (Android 13+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                NotificationPermissionCard(
                    hasPermission = hasNotificationPermission,
                    onRequestPermission = {
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                )
            }

            // Incoming Call Request Card (Phase 3)
            IncomingCallRequestCard(
                callRequest = activeCallRequest,
                onCall = { callRequest ->
                    CallRequestActionHandler.handleCall(context, callRequest)
                },
                onDismiss = { callRequest ->
                    CallRequestActionHandler.handleDismiss(context, callRequest)
                }
            )

            // FCM Token Card (Phase 2)
            FcmTokenCard(
                tokenState = tokenState,
                deviceName = deviceName,
                deviceNameInput = deviceNameInput,
                registrationMessage = registrationMessage,
                onDeviceNameChange = { deviceNameInput = it },
                onSaveDeviceName = {
                    val savedProfile = DeviceIdentityStore.saveName(context, deviceNameInput)
                    if (savedProfile == null) {
                        registrationMessage = "Device name must be between 1 and 80 characters"
                    } else {
                        deviceName = savedProfile.deviceName
                        deviceNameInput = savedProfile.deviceName
                    }
                },
                onCopyToken = { token ->
                    clipboardManager.setText(AnnotatedString(token))
                    Toast.makeText(context, "FCM Token copied to clipboard", Toast.LENGTH_SHORT).show()
                },
                onRefreshToken = {
                    FcmTokenManager.fetchToken()
                }
            )

            // Received General FCM Messages Section (Phase 2)
            ReceivedMessageCard(
                message = latestMessage,
                onClearMessage = {
                    FcmTokenManager.clearLatestMessage()
                }
            )
        }
    }
}

@Composable
fun IncomingCallRequestCard(
    callRequest: CallRequest?,
    onCall: (CallRequest) -> Unit,
    onDismiss: (CallRequest) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (callRequest != null) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Incoming Call Request",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (callRequest != null) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (callRequest != null) {
                    Text(
                        text = "LeadZam CRM",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (callRequest == null) {
                Text(
                    text = "No active call request. Incoming dial requests from LeadZam CRM will appear here.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                val contact = callRequest.contactName ?: "Unknown Contact"
                Text(
                    text = "Contact: $contact",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp
                )

                Text(
                    text = "Phone: ${callRequest.phoneNumber}",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )

                Text(
                    text = "Source: Originated from LeadZam CRM",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = { onCall(callRequest) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Text("Call")
                    }

                    OutlinedButton(
                        onClick = { onDismiss(callRequest) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Dismiss")
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationPermissionCard(
    hasPermission: Boolean,
    onRequestPermission: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (hasPermission) {
                MaterialTheme.colorScheme.surfaceVariant
            } else {
                MaterialTheme.colorScheme.errorContainer
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Notification Permission",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Text(
                    text = if (hasPermission) "Granted (Ready to receive notifications)" else "Not granted (Required for test notifications)",
                    fontSize = 13.sp,
                    color = if (hasPermission) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onErrorContainer
                )
            }
            if (!hasPermission) {
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = onRequestPermission) {
                    Text("Grant")
                }
            }
        }
    }
}

@Composable
fun FcmTokenCard(
    tokenState: TokenUiState,
    deviceName: String,
    deviceNameInput: String,
    registrationMessage: String,
    onDeviceNameChange: (String) -> Unit,
    onSaveDeviceName: () -> Unit,
    onCopyToken: (String) -> Unit,
    onRefreshToken: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "FCM Registration Token",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            OutlinedTextField(
                value = deviceNameInput,
                onValueChange = onDeviceNameChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Friendly device name") },
                supportingText = { Text("Current: $deviceName") }
            )
            Button(
                onClick = onSaveDeviceName,
                modifier = Modifier.align(Alignment.End)
            ) {
                Text("Save device name")
            }
            Text(
                text = registrationMessage,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            when (tokenState) {
                is TokenUiState.Idle, is TokenUiState.Loading -> {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        Text(text = "Retrieving FCM token...")
                    }
                }

                is TokenUiState.Success -> {
                    Text(
                        text = "Device token is active and ready for test messages:",
                        style = MaterialTheme.typography.bodyMedium
                    )

                    SelectionContainer {
                        OutlinedTextField(
                            value = tokenState.token,
                            onValueChange = {},
                            readOnly = true,
                            modifier = Modifier.fillMaxWidth(),
                            textStyle = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp
                            ),
                            maxLines = 5,
                            label = { Text("Registration Token") }
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { onCopyToken(tokenState.token) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Copy Token")
                        }

                        OutlinedButton(
                            onClick = onRefreshToken,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Refresh")
                        }
                    }
                }

                is TokenUiState.Error -> {
                    Text(
                        text = "Failed to retrieve token:",
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = tokenState.message,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp
                    )
                    Button(
                        onClick = onRefreshToken,
                        modifier = Modifier.align(Alignment.End)
                    ) {
                        Text("Retry")
                    }
                }
            }
        }
    }
}

@Composable
fun ReceivedMessageCard(
    message: ReceivedMessage?,
    onClearMessage: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (message != null) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            }
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Message Status",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            if (message == null) {
                Text(
                    text = "No messages received yet. Send a test message from Firebase Console using your FCM token above.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Text(
                    text = "Latest Test Message Received!",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )

                Text(
                    text = "Title: ${message.title}",
                    fontWeight = FontWeight.SemiBold
                )

                Text(
                    text = "Body: ${message.body}",
                    style = MaterialTheme.typography.bodyMedium
                )

                val dateFormat = remember { SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()) }
                Text(
                    text = "Received at: ${dateFormat.format(Date(message.timestampMs))}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (message.data.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Data payload (${message.data.size} items):",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp
                    )
                    message.data.forEach { (key, value) ->
                        Text(
                            text = "  • $key: $value",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp
                        )
                    }
                }

                OutlinedButton(
                    onClick = onClearMessage,
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("Clear")
                }
            }
        }
    }
}
