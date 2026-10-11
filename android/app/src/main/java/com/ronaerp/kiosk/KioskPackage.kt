package com.ronaerp.kiosk

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.ronaerp.kiosk.card.CardReaderModule
import com.ronaerp.kiosk.identity.KioskDeviceModule
import com.ronaerp.kiosk.kiosk.KioskModeModule

/**
 * App-local Turbo Native Modules. ZKTeco SDK modules (Phase B) get registered here too.
 */
class KioskPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      when (name) {
        KioskDeviceModule.NAME -> KioskDeviceModule(reactContext)
        KioskModeModule.NAME -> KioskModeModule(reactContext)
        CardReaderModule.NAME -> CardReaderModule(reactContext)
        else -> null
      }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    listOf(KioskDeviceModule.NAME, KioskModeModule.NAME, CardReaderModule.NAME).associateWith {
      ReactModuleInfo(
          name = it,
          className = it,
          canOverrideExistingModule = false,
          needsEagerInit = false,
          isCxxModule = false,
          isTurboModule = true,
      )
    }
  }
}
