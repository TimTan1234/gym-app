package app.gympal.health

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
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

    /** Coral for the one main action on a screen, outlined for the rest. A ripple shows the tap; a dimmed button is busy. */
    fun button(text: String, primary: Boolean, enabled: Boolean = true, onClick: () -> Unit) = Button(context).apply {
        this.text = text
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        minHeight = dp(52)
        val shape = GradientDrawable().apply {
            cornerRadius = dp(12).toFloat()
            if (primary) setColor(color(R.color.coral)) else setStroke(dp(1), color(R.color.steel))
        }
        val ripple = if (primary) 0x40FFFFFF else (color(R.color.ink) and 0x00FFFFFF) or 0x1F000000
        background = RippleDrawable(ColorStateList.valueOf(ripple), shape, null)
        setTextColor(if (primary) 0xFFFFFFFF.toInt() else color(R.color.ink))
        isEnabled = enabled
        alpha = if (enabled) 1f else 0.6f
        setOnClickListener { onClick() }
    }

    fun LinearLayout.add(view: android.view.View, top: Int = 12) {
        addView(view, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(top) })
    }
}
