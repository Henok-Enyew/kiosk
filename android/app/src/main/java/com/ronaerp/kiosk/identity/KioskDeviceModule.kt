package com.ronaerp.kiosk.identity

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import com.facebook.fbreact.specs.NativeKioskDeviceSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.ronaerp.kiosk.BuildConfig
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Device identity (hardware-backed signing key + Key Attestation) and a small
 * encrypted key-value store. Keys never leave the Android Keystore.
 */
class KioskDeviceModule(reactContext: ReactApplicationContext) :
    NativeKioskDeviceSpec(reactContext) {

  private val io = Executors.newSingleThreadExecutor()

  override fun getName(): String = NAME

  override fun getDeviceInfo(): WritableMap {
    val context = reactApplicationContext
    val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
    return Arguments.createMap().apply {
      putString("manufacturer", Build.MANUFACTURER)
      putString("model", Build.MODEL)
      // Build.getSerial() needs privileged permissions; ANDROID_ID is stable per device + app key.
      putString(
          "serial",
          Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "")
      putString("androidVersion", Build.VERSION.RELEASE)
      putDouble("sdkInt", Build.VERSION.SDK_INT.toDouble())
      putString("appVersion", packageInfo.versionName ?: "0")
      putString("flavor", BuildConfig.FLAVOR)
    }
  }

  override fun hasKeyPair(): Boolean = keyStore().containsAlias(SIGNING_ALIAS)

  override fun generateKeyPair(attestationChallenge: String, promise: Promise) {
    io.execute {
      try {
        val store = keyStore()
        if (store.containsAlias(SIGNING_ALIAS)) store.deleteEntry(SIGNING_ALIAS)

        val challenge = Base64.decode(attestationChallenge, Base64.DEFAULT)
        val hardwareBacked =
            try {
              createSigningKey(challenge, strongBox = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
              true
            } catch (error: Exception) {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                  error is StrongBoxUnavailableException) {
                createSigningKey(challenge, strongBox = false)
                false
              } else {
                throw error
              }
            }

        val chain = store.getCertificateChain(SIGNING_ALIAS) ?: emptyArray()
        val publicKey = store.getCertificate(SIGNING_ALIAS).publicKey.encoded

        val result =
            Arguments.createMap().apply {
              putString("publicKey", Base64.encodeToString(publicKey, Base64.NO_WRAP))
              putArray(
                  "attestationChain",
                  Arguments.createArray().apply {
                    chain.forEach { pushString(Base64.encodeToString(it.encoded, Base64.NO_WRAP)) }
                  })
              putBoolean("hardwareBacked", hardwareBacked)
            }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("E_KEYGEN", error.message, error)
      }
    }
  }

  override fun deleteKeyPair(promise: Promise) {
    io.execute {
      try {
        val store = keyStore()
        if (store.containsAlias(SIGNING_ALIAS)) store.deleteEntry(SIGNING_ALIAS)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_KEY_DELETE", error.message, error)
      }
    }
  }

  override fun sign(data: String, promise: Promise) {
    io.execute {
      try {
        val privateKey =
            keyStore().getKey(SIGNING_ALIAS, null) as? PrivateKey
                ?: throw IllegalStateException("Device key is missing. Pair the kiosk again.")
        val signature =
            Signature.getInstance("SHA256withECDSA").run {
              initSign(privateKey)
              update(data.toByteArray(Charsets.UTF_8))
              sign()
            }
        promise.resolve(Base64.encodeToString(signature, Base64.NO_WRAP))
      } catch (error: Exception) {
        promise.reject("E_SIGN", error.message, error)
      }
    }
  }

  override fun sha256Hex(data: String): String =
      MessageDigest.getInstance("SHA-256")
          .digest(data.toByteArray(Charsets.UTF_8))
          .joinToString("") { "%02x".format(it) }

  override fun randomUUID(): String = UUID.randomUUID().toString()

  override fun secureGet(key: String, promise: Promise) {
    io.execute {
      try {
        val stored = prefs().getString(key, null)
        promise.resolve(stored?.let { decrypt(it) })
      } catch (error: Exception) {
        promise.reject("E_STORE_READ", error.message, error)
      }
    }
  }

  override fun secureSet(key: String, value: String, promise: Promise) {
    io.execute {
      try {
        // commit(): the offline punch queue must survive a power cut right after a punch.
        prefs().edit().putString(key, encrypt(value)).commit()
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_STORE_WRITE", error.message, error)
      }
    }
  }

  override fun secureRemove(key: String, promise: Promise) {
    io.execute {
      prefs().edit().remove(key).commit()
      promise.resolve(null)
    }
  }

  override fun secureClear(promise: Promise) {
    io.execute {
      prefs().edit().clear().commit()
      promise.resolve(null)
    }
  }

  override fun invalidate() {
    io.shutdown()
    super.invalidate()
  }

  private fun createSigningKey(challenge: ByteArray, strongBox: Boolean) {
    val builder =
        KeyGenParameterSpec.Builder(SIGNING_ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setAttestationChallenge(challenge)
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      builder.setIsStrongBoxBacked(true)
    }
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE).run {
      initialize(builder.build())
      generateKeyPair()
    }
  }

  private fun storageKey(): SecretKey {
    val store = keyStore()
    (store.getKey(STORAGE_ALIAS, null) as? SecretKey)?.let {
      return it
    }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
      init(
          KeyGenParameterSpec.Builder(
                  STORAGE_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .build())
      generateKey()
    }
  }

  private fun encrypt(plain: String): String {
    val cipher = Cipher.getInstance(AES_MODE)
    cipher.init(Cipher.ENCRYPT_MODE, storageKey())
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(sealed, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): String {
    val sealed = Base64.decode(encoded, Base64.NO_WRAP)
    val cipher = Cipher.getInstance(AES_MODE)
    cipher.init(
        Cipher.DECRYPT_MODE,
        storageKey(),
        GCMParameterSpec(128, sealed, 0, GCM_IV_LENGTH))
    return String(
        cipher.doFinal(sealed, GCM_IV_LENGTH, sealed.size - GCM_IV_LENGTH), Charsets.UTF_8)
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  private fun prefs() =
      reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  companion object {
    const val NAME = NativeKioskDeviceSpec.NAME
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val SIGNING_ALIAS = "rona_kiosk_device_signing"
    private const val STORAGE_ALIAS = "rona_kiosk_secure_store"
    private const val PREFS_NAME = "rona_kiosk_secure"
    private const val AES_MODE = "AES/GCM/NoPadding"
    private const val GCM_IV_LENGTH = 12
  }
}
