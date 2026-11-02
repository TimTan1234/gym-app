package app.gympal.health

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/** Why a call to the GymPal server failed, in terms the screen can explain. */
class ApiException(val kind: Kind) : Exception(kind.name) {
    enum class Kind { BadCode, Unauthorized, Network, Server }
}

/** The two endpoints the phone uses. Only https:// servers get this far (see [Days.normalizeServer]). */
object Api {
    data class Linked(val token: String, val name: String)

    fun link(server: String, code: String, deviceName: String): Linked {
        val body = "{\"code\":${Days.jsonString(code)},\"name\":${Days.jsonString(deviceName)}}"
        val (status, text) = post("$server/api/device/link", body, token = null)
        return when (status) {
            200 -> JSONObject(text).let { Linked(it.getString("token"), it.optString("name")) }
            400 -> throw ApiException(ApiException.Kind.BadCode)
            else -> throw ApiException(ApiException.Kind.Server)
        }
    }

    /** Sends daily totals; returns how many days the server saved. */
    fun sync(server: String, token: String, json: String): Int {
        val (status, text) = post("$server/api/device/sync", json, token)
        return when (status) {
            200 -> JSONObject(text).optInt("saved")
            401 -> throw ApiException(ApiException.Kind.Unauthorized)
            else -> throw ApiException(ApiException.Kind.Server)
        }
    }

    private fun post(url: String, body: String, token: String?): Pair<Int, String> {
        val conn = try {
            URL(url).openConnection() as HttpURLConnection
        } catch (e: IOException) {
            throw ApiException(ApiException.Kind.Network)
        }
        return try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(body.toByteArray()) }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } catch (e: IOException) {
            throw ApiException(ApiException.Kind.Network)
        } finally {
            conn.disconnect()
        }
    }
}
