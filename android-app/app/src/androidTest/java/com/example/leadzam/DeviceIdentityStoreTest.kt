package com.example.leadzam

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.leadzam.fcm.DeviceIdentityStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceIdentityStoreTest {
    @Test
    fun deviceIdPersistsAndFriendlyNameCanBeUpdated() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        val firstProfile = DeviceIdentityStore.load(context)
        val secondProfile = DeviceIdentityStore.load(context)
        assertEquals(firstProfile.deviceId, secondProfile.deviceId)
        assertTrue(DeviceIdentityStore.isValidDeviceId(firstProfile.deviceId))

        val savedProfile = DeviceIdentityStore.saveName(context, "Test Android")
        assertNotNull(savedProfile)
        assertEquals("Test Android", DeviceIdentityStore.load(context).deviceName)
        assertEquals(firstProfile.deviceId, savedProfile?.deviceId)
        assertEquals(null, DeviceIdentityStore.saveName(context, "   "))
    }
}
