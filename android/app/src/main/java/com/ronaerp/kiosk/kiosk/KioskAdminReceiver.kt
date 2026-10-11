package com.ronaerp.kiosk.kiosk

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context

/** Device admin component used when the app is provisioned as device owner. */
class KioskAdminReceiver : DeviceAdminReceiver() {
  companion object {
    fun component(context: Context) = ComponentName(context, KioskAdminReceiver::class.java)
  }
}
