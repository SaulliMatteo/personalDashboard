package it.matteo.securestore

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Archivio sicuro della sessione dei Gruppi (l'equivalente Android del portachiavi del desktop).
 *
 * - Chiave AES-256-GCM generata nell'Android Keystore: non esce mai dal sistema e non si può esportare.
 *   Nessuna richiesta di impronta: la sessione si rinnova da sola in sottofondo.
 * - Ogni valore è un file `<chiave>.bin` in `noBackupFilesDir/secure-store`: privato dell'app ed escluso
 *   dal backup (tanto la chiave del Keystore non verrebbe ripristinata).
 * - Formato: versione (1 byte) + IV (12) + testo cifrato con tag. Il nome della voce è dato autenticato,
 *   così un file rinominato non si decifra.
 * - Se un valore non si decifra più (chiave persa o file rovinato) si cancella e risulta assente:
 *   meglio rifare il login che restare bloccati.
 *
 * I valori sono token: non vanno mai nei log né nei messaggi di errore, che sono frasi fisse.
 * Lo chiama solo Rust (src-tauri/src/secure_store.rs), che ha già controllato il nome della chiave.
 */
@TauriPlugin
class SecureStorePlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "personaldashboard-secure-store"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val FORMAT_VERSION: Byte = 1
        const val IV_BYTES = 12
        const val TAG_BITS = 128
        const val ERROR = "Archivio sicuro non disponibile"
        val VALID_KEY = Regex("^[a-z0-9-]{1,64}$")
    }

    private val lock = Any()

    private fun dir(): File = File(activity.noBackupFilesDir, "secure-store").apply { mkdirs() }

    private fun fileFor(key: String): File = File(dir(), "$key.bin")

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Nome della voce dagli argomenti, o null se manca o non è valido. */
    private fun keyArg(invoke: Invoke): String? {
        val key = invoke.getArgs().getString("key", null) ?: return null
        return if (VALID_KEY.matches(key)) key else null
    }

    @Command
    fun get(invoke: Invoke) {
        val key = keyArg(invoke) ?: return invoke.reject(ERROR)
        synchronized(lock) {
            val file = fileFor(key)
            val result = JSObject()
            if (!file.exists()) {
                return invoke.resolve(result)
            }
            try {
                val data = file.readBytes()
                if (data.size <= 1 + IV_BYTES || data[0] != FORMAT_VERSION) throw GeneralSecurityException()
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, data, 1, IV_BYTES))
                cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
                val plain = cipher.doFinal(data, 1 + IV_BYTES, data.size - 1 - IV_BYTES)
                result.put("value", String(plain, Charsets.UTF_8))
                invoke.resolve(result)
            } catch (_: GeneralSecurityException) {
                // non più decifrabile: si comporta come se non ci fosse
                file.delete()
                invoke.resolve(result)
            } catch (_: IOException) {
                invoke.reject(ERROR)
            }
        }
    }

    @Command
    fun set(invoke: Invoke) {
        val key = keyArg(invoke) ?: return invoke.reject(ERROR)
        val value = invoke.getArgs().getString("value", null) ?: return invoke.reject(ERROR)
        synchronized(lock) {
            val file = fileFor(key)
            val tmp = File(file.parentFile, "${file.name}.tmp")
            try {
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.ENCRYPT_MODE, secretKey())
                cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
                val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
                val iv = cipher.iv
                if (iv.size != IV_BYTES) throw GeneralSecurityException()
                tmp.writeBytes(byteArrayOf(FORMAT_VERSION) + iv + encrypted)
                // rename nella stessa cartella: chi legge vede il valore vecchio o quello nuovo, mai metà
                if (!tmp.renameTo(file)) throw IOException()
                invoke.resolve()
            } catch (_: Exception) {
                tmp.delete()
                invoke.reject(ERROR)
            }
        }
    }

    @Command
    fun remove(invoke: Invoke) {
        val key = keyArg(invoke) ?: return invoke.reject(ERROR)
        synchronized(lock) {
            val file = fileFor(key)
            if (file.exists() && !file.delete()) return invoke.reject(ERROR)
            invoke.resolve()
        }
    }
}
