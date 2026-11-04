package it.matteo.personalDashboard

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

/**
 * L'app disegna sotto barra di stato, barra dei gesti e tastiera (edge-to-edge, obbligatorio da Android 15).
 * La WebView riporta in `env(safe-area-inset-*)` solo il foro della fotocamera: le misure vere le passiamo noi,
 * in dp (= px CSS), e le legge src/core/system/androidInsets.ts.
 * - all'avvio: `window.__pdInsets.get()` (JSON);
 * - a ogni cambio (rotazione, tastiera che si apre): evento `pd-insets` sulla finestra.
 * Solo numeri: la pagina non può chiedere né cambiare altro.
 */
class MainActivity : TauriActivity() {
  @Volatile private var lastJson = """{"top":0,"right":0,"bottom":0,"left":0,"ime":0}"""

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(InsetsBridge(), "__pdInsets")
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
}
