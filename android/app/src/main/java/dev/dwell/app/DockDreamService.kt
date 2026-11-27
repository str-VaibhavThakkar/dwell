package dev.dwell.app

import android.annotation.SuppressLint
import android.service.dreams.DreamService
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * DreamService implementation allowing Desk Dock to run seamlessly
 * as an Android Screen Saver while charging or docked.
 */
class DockDreamService : DreamService() {
    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = true
        isFullscreen = true

        val web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            webViewClient = WebViewClient()
            loadUrl("http://127.0.0.1:8080/")
        }
        webView = web
        setContentView(web)
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        webView?.onResume()
    }

    override fun onDreamingStopped() {
        super.onDreamingStopped()
        webView?.onPause()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        webView?.destroy()
        webView = null
    }
}
