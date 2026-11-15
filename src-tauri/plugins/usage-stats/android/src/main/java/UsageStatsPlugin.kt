package it.matteo.usagestats

import android.Manifest
import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Tempo allo schermo sul telefono: legge la cronologia di uso delle app che Android tiene per qualche giorno
 * (UsageStatsManager), solo con il permesso "Accesso ai dati di utilizzo" che l'utente accende a mano.
 *
 * - `status`: se il permesso c'è.
 * - `openAccessSettings`: apre la pagina di Android dove si accende.
 * - `events`: gli eventi utili al conteggio tra `since` e `until` (ms), in forma compatta, più nome e categoria delle
 *   app coinvolte. Niente titoli né contenuti: Android dà solo pacchetto, classe e istante, e la classe non esce da qui.
 *
 * Lo chiama solo Rust (src-tauri/src/screen_time/android.rs); i conti li fa il frontend
 * (src/widgets/screentime/lib/androidEvents.ts). Gli errori sono frasi fisse.
 */
@TauriPlugin
class UsageStatsPlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        const val ERROR = "Cronologia delle app non disponibile"
        /** Al massimo un mese per chiamata: Android ne tiene comunque circa una settimana. */
        const val MAX_RANGE_MS = 31L * 24 * 60 * 60 * 1000

        // Tipi di UsageEvents.Event (numeri, così valgono anche sotto le API che hanno dato loro un nome).
        const val ACTIVITY_RESUMED = 1 // MOVE_TO_FOREGROUND
        const val ACTIVITY_PAUSED = 2 // MOVE_TO_BACKGROUND
        const val SCREEN_NON_INTERACTIVE = 16 // API 28
        const val KEYGUARD_SHOWN = 17 // API 28
        const val DEVICE_SHUTDOWN = 26 // API 29

        // Tipi che arrivano al frontend.
        const val OUT_FOREGROUND = 1
        const val OUT_BACKGROUND = 2
        const val OUT_SCREEN_OFF = 3
    }

    private fun granted(): Boolean {
        val ops = activity.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName)
        }
        // MODE_DEFAULT: decide il permesso normale (alcuni sistemi lo danno così)
        if (mode == AppOpsManager.MODE_DEFAULT) {
            return activity.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    @Command
    fun status(invoke: Invoke) {
        val result = JSObject()
        result.put("granted", try { granted() } catch (_: Exception) { false })
        invoke.resolve(result)
    }

    @Command
    fun openAccessSettings(invoke: Invoke) {
        // Con il pacchetto alcune versioni aprono direttamente l'interruttore dell'app; se non c'è, l'elenco.
        val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).setData(Uri.parse("package:${activity.packageName}"))
        try {
            activity.startActivity(direct)
            invoke.resolve()
            return
        } catch (_: Exception) {
            // si riprova senza
        }
        try {
            activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            invoke.resolve()
        } catch (_: Exception) {
            invoke.reject(ERROR)
        }
    }

    @Command
    fun events(invoke: Invoke) {
        val args = invoke.getArgs()
        val until = args.optLong("until", System.currentTimeMillis())
        val since = maxOf(args.optLong("since", 0L), until - MAX_RANGE_MS)
        if (!granted() || since >= until) return invoke.reject(ERROR)
        // Leggere qualche giorno di eventi può volerci un attimo: fuori dal thread dell'interfaccia.
        Thread {
            try {
                invoke.resolve(read(since, until))
            } catch (_: Exception) {
                invoke.reject(ERROR)
            }
        }.start()
    }

    private fun read(since: Long, until: Long): JSObject {
        val usm = activity.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = activity.packageManager
        val packages = ArrayList<String>()
        val index = HashMap<String, Int>()
        // Ogni schermata (pacchetto + classe) diventa un numero: serve a capire se una pausa è di quella in primo
        // piano o di una vecchia della stessa app. Il nome della classe non esce da qui.
        val screens = HashMap<String, Int>()
        val events = JSArray()

        val stream = usm.queryEvents(since, until)
        val e = UsageEvents.Event()
        while (stream.hasNextEvent()) {
            stream.getNextEvent(e)
            val type = when (e.eventType) {
                ACTIVITY_RESUMED -> OUT_FOREGROUND
                // lo "stop" arriva sempre dopo la pausa, e per una schermata vecchia chiuderebbe quella nuova
                ACTIVITY_PAUSED -> OUT_BACKGROUND
                SCREEN_NON_INTERACTIVE, KEYGUARD_SHOWN, DEVICE_SHUTDOWN -> OUT_SCREEN_OFF
                else -> continue
            }
            val pkg = if (type == OUT_SCREEN_OFF) -1 else index.getOrPut(e.packageName) {
                packages.add(e.packageName)
                packages.size - 1
            }
            val screen = if (type == OUT_SCREEN_OFF) -1 else screens.getOrPut("${e.packageName}/${e.className}") { screens.size }
            val row = JSArray()
            row.put(e.timeStamp)
            row.put(type)
            row.put(pkg)
            row.put(screen)
            events.put(row)
        }

        val apps = JSArray()
        for (name in packages) {
            val app = JSObject()
            app.put("pkg", name)
            try {
                val info = pm.getApplicationInfo(name, 0)
                app.put("label", pm.getApplicationLabel(info).toString())
                app.put("category", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) info.category else -1)
            } catch (_: Exception) {
                // app disinstallata o non visibile: nome dal pacchetto, lo decide il frontend
                app.put("category", -1)
            }
            apps.put(app)
        }

        // La Home predefinita. Non tutte quelle che si dichiarano Home: anche Impostazioni ne ha una di riserva
        // (FallbackHome, per l'avvio) e verrebbe scartata. Senza una predefinita ("android" = chiede quale) si
        // prendono le altre, tranne Impostazioni.
        val home = JSArray()
        try {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            val chosen = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
            if (chosen != null && chosen != "android") {
                home.put(chosen)
            } else {
                for (r in pm.queryIntentActivities(intent, 0)) {
                    val name = r.activityInfo.packageName
                    if (name != "com.android.settings") home.put(name)
                }
            }
        } catch (_: Exception) {
            // senza: la Home conta come un'app qualsiasi
        }

        // Da quando Android ha ancora la cronologia: serve a dire quali giorni sono andati persi.
        var oldest: Long? = null
        try {
            for (s in usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, 0, until)) {
                if (s.firstTimeStamp > 0 && (oldest == null || s.firstTimeStamp < oldest)) oldest = s.firstTimeStamp
            }
        } catch (_: Exception) {
            // si lascia vuoto
        }

        val result = JSObject()
        result.put("events", events)
        result.put("packages", apps)
        result.put("home", home)
        result.put("self", activity.packageName)
        if (oldest != null) result.put("oldest", oldest)
        return result
    }
}
