package com.ronaerp.kiosk.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ronaerp.kiosk.MainActivity

/**
 * Brings the kiosk up after a reboot. On provisioned terminals the app is also the
 * persistent HOME activity, which is the reliable path; this is the fallback.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    context.startActivity(
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
