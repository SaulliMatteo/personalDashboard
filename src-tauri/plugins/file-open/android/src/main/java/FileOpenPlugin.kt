package it.matteo.fileopen

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

/**
 * Apre o condivide un file del Quaderno con le altre app.
 *
 * - Il file diventa un URI `content://` del FileProvider dell'app (`<applicationId>.fileprovider`, in
 *   gen/android/app/src/main/AndroidManifest.xml): un `file://` passato fuori dall'app è vietato da Android 7.
 * - All'app scelta si concede solo la lettura di quel file, e solo finché lo usa.
 *
 * Lo chiama solo Rust (src-tauri/src/file_open.rs), che ha già controllato che il file stia nella
 * cartella del Quaderno. Gli errori sono frasi fisse.
 */
@TauriPlugin
class FileOpenPlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        const val ERROR = "Impossibile aprire il file"
    }

    private fun uriFor(path: String): Uri =
        FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(path))

    /** Tipo MIME dall'estensione; senza, le app che si propongono sono quelle per "qualsiasi file". */
    private fun mimeOf(path: String): String {
        val ext = File(path).extension.lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
    }

    private fun pathArg(invoke: Invoke): String? = invoke.getArgs().getString("path", null)

    @Command
    fun open(invoke: Invoke) {
        val path = pathArg(invoke) ?: return invoke.reject(ERROR)
        val result = JSObject()
        try {
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uriFor(path), mimeOf(path))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.startActivity(intent)
            result.put("opened", true)
            invoke.resolve(result)
        } catch (_: ActivityNotFoundException) {
            // nessuna app per questo tipo di file: lo dice Rust con una frase sua
            result.put("opened", false)
            invoke.resolve(result)
        } catch (_: Exception) {
            invoke.reject(ERROR)
        }
    }

    @Command
    fun share(invoke: Invoke) {
        val path = pathArg(invoke) ?: return invoke.reject(ERROR)
        try {
            val uri = uriFor(path)
            val send = Intent(Intent.ACTION_SEND)
                .setType(mimeOf(path))
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // il permesso di lettura passa dal chooser all'app scelta solo se l'URI è anche nel ClipData
            send.clipData = ClipData.newRawUri(File(path).name, uri)
            activity.startActivity(Intent.createChooser(send, null))
            invoke.resolve()
        } catch (_: Exception) {
            invoke.reject(ERROR)
        }
    }
}
