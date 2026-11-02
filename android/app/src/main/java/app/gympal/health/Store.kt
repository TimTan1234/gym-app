package app.gympal.health

import android.content.Context

/** The link to GymPal, kept in this app's private storage (and out of backups, see the manifest). */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("link", Context.MODE_PRIVATE)

    val server: String? get() = prefs.getString("server", null)
    val token: String? get() = prefs.getString("token", null)
    val account: String? get() = prefs.getString("account", null)
    val linked: Boolean get() = server != null && token != null
    val lastSync: Long get() = prefs.getLong("lastSync", 0L)

    fun saveLink(server: String, token: String, account: String) =
        prefs.edit().putString("server", server).putString("token", token).putString("account", account).remove("lastSync").apply()

    fun markSynced(at: Long) = prefs.edit().putLong("lastSync", at).apply()

    fun clearLink() = prefs.edit().remove("token").remove("account").remove("lastSync").apply()
}
