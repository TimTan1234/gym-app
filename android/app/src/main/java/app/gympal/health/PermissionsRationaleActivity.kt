package app.gympal.health

import android.os.Bundle
import android.widget.ScrollView
import androidx.activity.ComponentActivity

/** Shown from Health Connect's permission screen: what this app reads, and what happens to it. */
class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ui = Ui(this)
        val col = ui.column()
        with(ui) {
            col.add(title(getString(R.string.privacy_title)), top = 0)
            col.add(body(getString(R.string.privacy_body)), top = 16)
        }
        setContentView(ScrollView(this).apply { addView(col) })
    }
}
