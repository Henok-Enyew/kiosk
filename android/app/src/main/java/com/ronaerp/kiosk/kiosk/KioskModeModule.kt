package com.ronaerp.kiosk.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.fbreact.specs.NativeKioskModeSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.ronaerp.kiosk.MainActivity

/**
 * Terminal lock-down. Full kiosk behaviour needs the app to be device owner:
 *   adb shell dpm set-device-owner com.ronaerp.kiosk/.kiosk.KioskAdminReceiver
 * Without it, lock task falls back to Android's "screen pinning" (user can unpin).
 */
class KioskModeModule(reactContext: ReactApplicationContext) :
    NativeKioskModeSpec(reactContext) {

  override fun getName(): String = NAME

  override fun getState(): WritableMap = state()

  override fun enter(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The kiosk screen is not in the foreground.")
      return
    }
    UiThreadUtil.runOnUiThread {
      try {
        if (isDeviceOwner()) {
          val dpm = dpm()
          val admin = KioskAdminReceiver.component(activity)
          dpm.setLockTaskPackages(admin, arrayOf(activity.packageName))
          dpm.setStatusBarDisabled(admin, true)
          dpm.setKeyguardDisabled(admin, true)
          dpm.addPersistentPreferredActivity(
              admin,
              IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
              },
              ComponentName(activity, MainActivity::class.java))
        }
        hideSystemBars(activity, hide = true)
        activity.startLockTask()
        promise.resolve(state())
      } catch (error: Exception) {
        promise.reject("E_KIOSK_ENTER", error.message, error)
      }
    }
  }

  override fun exit(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    UiThreadUtil.runOnUiThread {
      try {
        if (isDeviceOwner() && activity != null) {
          val dpm = dpm()
          val admin = KioskAdminReceiver.component(activity)
          dpm.setStatusBarDisabled(admin, false)
          dpm.setKeyguardDisabled(admin, false)
          dpm.clearPackagePersistentPreferredActivities(admin, activity.packageName)
        }
        activity?.let {
          hideSystemBars(it, hide = false)
          it.stopLockTask()
        }
        promise.resolve(state())
      } catch (error: Exception) {
        promise.reject("E_KIOSK_EXIT", error.message, error)
      }
    }
  }

  override fun setKeepScreenOn(enabled: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    UiThreadUtil.runOnUiThread {
      if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  private fun hideSystemBars(activity: Activity, hide: Boolean) {
    val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
    if (hide) {
      controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  private fun state(): WritableMap {
    val am =
        reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return Arguments.createMap().apply {
      putBoolean("isDeviceOwner", isDeviceOwner())
      putBoolean(
          "isLockTaskActive", am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE)
    }
  }

  private fun isDeviceOwner(): Boolean =
      dpm().isDeviceOwnerApp(reactApplicationContext.packageName)

  private fun dpm(): DevicePolicyManager =
      reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE)
          as DevicePolicyManager

  companion object {
    const val NAME = NativeKioskModeSpec.NAME
  }
}
