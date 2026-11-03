package app.gympal.health

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.text.InputType
import android.text.format.DateUtils
import android.widget.ScrollView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * One screen that walks through three steps: link to GymPal with the code from Settings,
 * allow reading steps and sleep, then sync (now, and every few hours where allowed).
 */
class MainActivity : ComponentActivity() {
    private lateinit var store: Store
    private lateinit var ui: Ui
    private val scroll by lazy { ScrollView(this) }
    private var status: String? = null
    private var busy = false
    private var nothingInHealthConnect = false

    private val requestAccess = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        lifecycleScope.launch { afterAccessChange() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        ui = Ui(this)
        setContentView(scroll)
        // Android 15+ draws the app under the status and navigation bars: keep the screen clear of them and of the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    override fun onResume() {
        super.onResume()
        // Opening the app is a sync too: it's the only way on phones without background reading.
        lifecycleScope.launch {
            render()
            if (store.linked && HealthReader.from(this@MainActivity)?.canRead() == true) syncNow(quiet = true)
        }
    }

    private suspend fun render() {
        val reader = HealthReader.from(this)
        val canRead = reader?.canRead() == true
        val col = ui.column()
        with(ui) {
            col.add(title(getString(R.string.app_name)), top = 0)
            col.add(body(getString(R.string.intro), muted = true))
            when {
                reader == null -> {
                    val missing = HealthConnectClient.getSdkStatus(this@MainActivity) == HealthConnectClient.SDK_UNAVAILABLE
                    col.add(body(getString(if (missing) R.string.hc_missing else R.string.hc_update)), top = 24)
                    col.add(button(getString(R.string.open_play), primary = true) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
                    }, top = 16)
                }
                !store.linked -> {
                    val server = field(getString(R.string.server_label), store.server ?: "https://", "https://")
                    server.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
                    val code = field(getString(R.string.code_label), "", "ABCD-EFGH")
                    code.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                    col.add(body(getString(R.string.link_help)), top = 24)
                    col.add(body(getString(R.string.server_label), muted = true), top = 20)
                    col.add(server, top = 4)
                    col.add(body(getString(R.string.code_label), muted = true), top = 16)
                    col.add(code, top = 4)
                    col.add(button(getString(if (busy) R.string.linking else R.string.link), primary = true, enabled = !busy) {
                        lifecycleScope.launch { link(server.text.toString(), code.text.toString()) }
                    }, top = 20)
                    status?.let { col.add(body(it), top = 16) }
                }
                !canRead -> {
                    col.add(body(getString(R.string.linked_as, store.server, store.account)), top = 24)
                    col.add(body(getString(R.string.grant_help)), top = 16)
                    col.add(button(getString(R.string.grant), primary = true) {
                        val wanted = if (reader.backgroundAvailable) HealthReader.READ + HealthReader.BACKGROUND else HealthReader.READ
                        requestAccess.launch(wanted)
                    }, top = 16)
                    col.add(button(getString(R.string.unlink), primary = false) { unlink() }, top = 12)
                }
                else -> {
                    col.add(body(getString(R.string.linked_as, store.server, store.account)), top = 24)
                    val last = store.lastSync
                    col.add(
                        body(
                            if (last > 0) getString(R.string.last_sync, DateUtils.getRelativeTimeSpanString(last)) else getString(R.string.never_synced),
                            muted = true,
                        ),
                        top = 8,
                    )
                    val background = reader.backgroundAvailable && HealthReader.BACKGROUND in reader.granted()
                    col.add(body(getString(if (background) R.string.background_on else R.string.background_off), muted = true), top = 8)
                    col.add(button(getString(if (busy) R.string.syncing else R.string.sync_now), primary = true, enabled = !busy) {
                        lifecycleScope.launch { syncNow(quiet = false) }
                    }, top = 20)
                    // The result sits right under the button that asked for it.
                    status?.let { col.add(body(it), top = 16) }
                    if (nothingInHealthConnect && !busy) {
                        col.add(button(getString(R.string.open_health_connect), primary = false) {
                            startActivity(HealthConnectClient.getHealthConnectManageDataIntent(this@MainActivity))
                        }, top = 12)
                    }
                    col.add(button(getString(R.string.unlink), primary = false) { unlink() }, top = 20)
                }
            }
            if (reader == null || (store.linked && !canRead)) status?.let { col.add(body(it), top = 20) }
        }
        scroll.removeAllViews()
        scroll.addView(col)
    }

    private suspend fun link(serverInput: String, code: String) {
        if (busy) return
        val server = Days.normalizeServer(serverInput)
        if (server == null) {
            status = getString(R.string.need_https)
            return render()
        }
        busy = true
        status = null
        render()
        val name = listOf(Build.MANUFACTURER.replaceFirstChar { it.uppercase() }, Build.MODEL).distinct().joinToString(" ").take(60)
        status = try {
            val linked = withContext(Dispatchers.IO) { Api.link(server, code, name) }
            store.saveLink(server, linked.token, linked.name)
            null
        } catch (e: ApiException) {
            when (e.kind) {
                ApiException.Kind.BadCode -> getString(R.string.bad_code)
                ApiException.Kind.Network -> getString(R.string.no_connection, server)
                else -> getString(R.string.server_error, server, e.status)
            }
        }
        busy = false
        render()
    }

    private suspend fun afterAccessChange() {
        val reader = HealthReader.from(this)
        if (reader != null && reader.canRead()) {
            if (reader.backgroundAvailable && HealthReader.BACKGROUND in reader.granted()) Sync.schedule(this)
            syncNow(quiet = false)
        } else {
            render()
        }
    }

    private suspend fun syncNow(quiet: Boolean) {
        if (busy) return
        busy = true
        if (!quiet) {
            status = null
            render()
        }
        val server = store.server ?: ""
        val started = SystemClock.elapsedRealtime()
        val result = Sync.run(this)
        // A quick answer still shows "Syncing…" long enough to see that the tap did something.
        if (!quiet) delay((MIN_BUSY_MS - (SystemClock.elapsedRealtime() - started)).coerceAtLeast(0))
        busy = false
        nothingInHealthConnect = result == SyncResult.NothingNew
        // Every outcome says what happened, so a tap never looks like it did nothing.
        status = when (result) {
            is SyncResult.Sent -> resources.getQuantityString(R.plurals.synced_days, result.days, result.days)
            SyncResult.NothingNew -> getString(R.string.nothing_to_send)
            SyncResult.Unlinked -> getString(R.string.unlinked_remote)
            SyncResult.ReadFailed -> getString(R.string.read_failed)
            is SyncResult.Failed ->
                if (result.error.kind == ApiException.Kind.Network) getString(R.string.no_connection, server)
                else getString(R.string.server_error, server, result.error.status)
            SyncResult.NotLinked, SyncResult.NoAccess -> null
        }
        render()
    }

    private companion object {
        const val MIN_BUSY_MS = 700L
    }

    private fun unlink() {
        // Forgetting the token here stops this phone; Settings in GymPal still lists it until unlinked there.
        store.clearLink()
        Sync.stop(this)
        status = null
        lifecycleScope.launch { render() }
    }
}
