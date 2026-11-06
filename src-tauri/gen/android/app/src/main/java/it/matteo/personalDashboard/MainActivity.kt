package it.matteo.personalDashboard

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.PowerManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

/**
 * L'app disegna sotto barra di stato, barra dei gesti e tastiera (edge-to-edge, obbligatorio da Android 15).
 * La WebView riporta in `env(safe-area-inset-*)` solo il foro della fotocamera: le misure vere le passiamo noi,
 * in dp (= px CSS), e le legge src/core/system/androidInsets.ts.
 * - all'avvio: `window.__pdInsets.get()` (JSON);
 * - a ogni cambio (rotazione, tastiera che si apre): evento `pd-insets` sulla finestra.
 *
 * Uscite dall'app (stop automatico dello Studio, src/core/system/androidAway.ts): mentre l'app non è in primo piano
 * si conta il tempo a schermo acceso e sbloccato, cioè passato a usare il telefono in altre app. Al rientro arriva
 * l'evento `pd-away` con {leftAt, backAt, usedMs}. Niente permessi: solo i broadcast di schermo spento e sblocco.
 * Solo numeri: la pagina non può chiedere né cambiare altro.
 *
 * Tocco su una notifica dell'app (src/core/system/androidTaps.ts): il plugin delle notifiche manda alla pagina solo
 * "tap", senza dire quale notifica, e all'avvio a freddo l'evento arriva prima che la pagina ascolti. Qui si legge
 * l'id della notifica dall'intent: a app aperta evento `pd-notification-tap` con {id}; all'avvio resta da leggere con
 * `window.__pdLaunch.takeNotificationId()` (una volta, -1 se non c'è). La vista da aprire è scritta nell'id.
 */
class MainActivity : TauriActivity() {
  @Volatile private var lastJson = """{"top":0,"right":0,"bottom":0,"left":0,"ime":0}"""
  private var webView: WebView? = null

  /** Id della notifica toccata che ha avviato l'app, finché la pagina non lo legge (-1 = nessuna). */
  @Volatile private var launchNotificationId = -1

  /** Quando l'app è uscita dal primo piano (0 = è in primo piano). */
  private var leftAt = 0L
  /** Da quando, fuori dall'app, lo schermo è acceso e sbloccato (0 = non lo è). */
  private var usingSince = 0L
  /** Tempo già contato a usare il telefono durante questa uscita. */
  private var usedMs = 0L

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (leftAt == 0L) return
      val now = System.currentTimeMillis()
      when (intent.action) {
        Intent.ACTION_USER_PRESENT -> if (usingSince == 0L) usingSince = now
        Intent.ACTION_SCREEN_OFF -> if (usingSince != 0L) {
          usedMs += now - usingSince
          usingSince = 0L
        }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // ricreata dopo una rotazione o con l'intent già usato: non riaprire di nuovo la vista
    if (savedInstanceState == null) launchNotificationId = notificationIdOf(intent)
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val id = notificationIdOf(intent)
    if (id < 0) return
    val view = webView
    if (view == null) launchNotificationId = id
    else view.evaluateJavascript("window.dispatchEvent(new CustomEvent('pd-notification-tap',{detail:{id:$id}}))", null)
  }

  /** L'id che il plugin delle notifiche mette nell'intent del tocco ("NotificationId"); -1 se l'intent non viene da lì. */
  private fun notificationIdOf(intent: Intent?): Int {
    if (intent == null || intent.action != Intent.ACTION_MAIN) return -1
    val id = intent.getIntExtra("NotificationId", Int.MIN_VALUE)
    return if (id >= 0) id else -1
  }

  override fun onDestroy() {
    unregisterReceiver(screenReceiver)
    super.onDestroy()
  }

  override fun onStop() {
    super.onStop()
    val now = System.currentTimeMillis()
    leftAt = now
    usedMs = 0L
    // uscita verso un'altra app (schermo acceso e sbloccato) o schermo spento dentro l'app
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    usingSince = if (power.isInteractive && !keyguard.isKeyguardLocked) now else 0L
  }

  override fun onStart() {
    super.onStart()
    if (leftAt == 0L) return
    val now = System.currentTimeMillis()
    if (usingSince != 0L) usedMs += now - usingSince
    val json = """{"leftAt":$leftAt,"backAt":$now,"usedMs":$usedMs}"""
    leftAt = 0L
    usingSince = 0L
    webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('pd-away',{detail:$json}))", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(InsetsBridge(), "__pdInsets")
    webView.addJavascriptInterface(LaunchBridge(), "__pdLaunch")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = view.resources.displayMetrics.density
      fun dp(px: Int) = px / density
      // la tastiera copre anche la barra dei gesti: conta solo la parte in più
      val keyboard = max(0, ime.bottom - bars.bottom)
      lastJson = """{"top":${dp(bars.top)},"right":${dp(bars.right)},"bottom":${dp(bars.bottom)},"left":${dp(bars.left)},"ime":${dp(keyboard)}}"""
      (view as WebView).evaluateJavascript("window.dispatchEvent(new CustomEvent('pd-insets',{detail:$lastJson}))", null)
      // le insets proseguono: la WebView continua a calcolare da sola il foro della fotocamera
      ViewCompat.onApplyWindowInsets(view, insets)
    }
  }

  private inner class InsetsBridge {
    @JavascriptInterface
    fun get(): String = lastJson
  }

  private inner class LaunchBridge {
    @JavascriptInterface
    fun takeNotificationId(): Int {
      val id = launchNotificationId
      launchNotificationId = -1
      return id
    }
  }
}
