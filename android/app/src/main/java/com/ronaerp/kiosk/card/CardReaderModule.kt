package com.ronaerp.kiosk.card

import android.nfc.NfcAdapter
import android.nfc.Tag
import com.facebook.fbreact.specs.NativeCardReaderSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil

/**
 * Reads card UIDs with Android NFC reader mode (Mifare / ISO 14443 / FeliCa / ISO 15693).
 * Reader mode is bound to the foreground activity, so it is re-enabled on resume.
 */
class CardReaderModule(reactContext: ReactApplicationContext) :
    NativeCardReaderSpec(reactContext), LifecycleEventListener {

  private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(reactContext)
  private var listening = false

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NAME

  override fun isAvailable(): Boolean = adapter != null

  override fun isEnabled(): Boolean = adapter?.isEnabled == true

  override fun start() {
    listening = true
    enableReaderMode()
  }

  override fun stop() {
    listening = false
    val activity = reactApplicationContext.currentActivity ?: return
    UiThreadUtil.runOnUiThread { adapter?.disableReaderMode(activity) }
  }

  override fun onHostResume() {
    if (listening) enableReaderMode()
  }

  override fun onHostPause() {
    val activity = reactApplicationContext.currentActivity ?: return
    adapter?.disableReaderMode(activity)
  }

  override fun onHostDestroy() = Unit

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    super.invalidate()
  }

  private fun enableReaderMode() {
    val activity = reactApplicationContext.currentActivity ?: return
    val nfc = adapter ?: return
    UiThreadUtil.runOnUiThread {
      nfc.enableReaderMode(
          activity,
          { tag -> onTag(tag) },
          NfcAdapter.FLAG_READER_NFC_A or
              NfcAdapter.FLAG_READER_NFC_B or
              NfcAdapter.FLAG_READER_NFC_F or
              NfcAdapter.FLAG_READER_NFC_V or
              NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
              NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
          null)
    }
  }

  private fun onTag(tag: Tag) {
    val uid = tag.id?.joinToString("") { "%02X".format(it) } ?: return
    emitOnCard(
        Arguments.createMap().apply {
          putString("uid", uid)
          putString("technology", tag.techList.firstOrNull()?.substringAfterLast('.') ?: "")
        })
  }

  companion object {
    const val NAME = NativeCardReaderSpec.NAME
  }
}
