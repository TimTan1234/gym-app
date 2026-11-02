package app.gympal.health

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/** Small view builders: the app is two plain screens, so no layout files or UI library. */
class Ui(private val context: Context) {
    private val density = context.resources.displayMetrics.density
    fun dp(v: Int) = (v * density).toInt()
    private fun color(id: Int) = context.getColor(id)

    fun column(): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(28), dp(20), dp(28))
    }

    /** A serif title, like GymPal's page headings. */
    fun title(text: String) = TextView(context).apply {
        this.text = text
        typeface = Typeface.SERIF
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
        setTextColor(color(R.color.ink))
    }

    fun body(text: CharSequence, muted: Boolean = false) = TextView(context).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, if (muted) 14f else 16f)
        setTextColor(color(if (muted) R.color.steel else R.color.ink))
        setLineSpacing(0f, 1.25f)
    }

    fun field(label: String, value: String, hint: String, type: Int = InputType.TYPE_CLASS_TEXT) = EditText(context).apply {
        setText(value)
        this.hint = hint
        contentDescription = label
        inputType = type
        setSingleLine(true)
        setTextColor(color(R.color.ink))
        setHintTextColor(color(R.color.steel))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    }

    /** Coral for the one main action on a screen, outlined for the rest. */
    fun button(text: String, primary: Boolean, onClick: () -> Unit) = Button(context).apply {
        this.text = text
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        minHeight = dp(52)
        background = GradientDrawable().apply {
            cornerRadius = dp(12).toFloat()
            if (primary) setColor(color(R.color.coral)) else setStroke(dp(1), color(R.color.steel))
        }
        setTextColor(if (primary) 0xFFFFFFFF.toInt() else color(R.color.ink))
        setOnClickListener { onClick() }
    }

    fun LinearLayout.add(view: android.view.View, top: Int = 12) {
        addView(view, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(top) })
    }
}
