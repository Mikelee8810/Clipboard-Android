package expo.modules.shizukuclipboard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import java.io.File

/**
 * Shell-only acceptance hook used to verify background clipboard persistence
 * in release builds without making the app database generally readable.
 */
class ClipboardHistoryProofReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val sentinel = intent.getStringExtra("sentinel").orEmpty()
        val expectedHash = intent.getStringExtra("profileHash").orEmpty()
        if (sentinel.isEmpty() && expectedHash.isEmpty()) {
            resultCode = 2
            resultData = JSONObject()
                .put("ok", false)
                .put("error", "missing_sentinel")
                .toString()
            return
        }

        val databaseFile = File(context.filesDir, "SQLite/clipboard.db")
        if (!databaseFile.exists()) {
            resultCode = 3
            resultData = JSONObject()
                .put("ok", false)
                .put("error", "database_missing")
                .toString()
            return
        }

        try {
            SQLiteDatabase.openDatabase(
                databaseFile.absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY
            ).use { database ->
                database.query(
                    "clipboard_history",
                    arrayOf("text", "timestamp", "lastModified", "profileHash", "type", "fileUri", "size"),
                    if (expectedHash.isNotEmpty()) "profileHash = ? AND isDeleted = 0" else "text = ? AND isDeleted = 0",
                    arrayOf(if (expectedHash.isNotEmpty()) expectedHash else sentinel),
                    null,
                    null,
                    "timestamp DESC",
                    "1"
                ).use { cursor ->
                    if (!cursor.moveToFirst()) {
                        resultCode = 1
                        resultData = JSONObject()
                            .put("ok", true)
                            .put("found", false)
                            .toString()
                        return
                    }

                    resultCode = 0
                    resultData = JSONObject()
                        .put("ok", true)
                        .put("found", true)
                        .put("text", cursor.getString(0))
                        .put("timestamp", cursor.getLong(1))
                        .put("lastModified", cursor.getLong(2))
                        .put("profileHash", cursor.getString(3))
                        .put("type", cursor.getString(4))
                        .put("fileUri", cursor.getString(5).orEmpty())
                        .put("size", cursor.getLong(6))
                        .put(
                            "fileExists",
                            cursor.getString(5)?.removePrefix("file:")?.let(::File)?.exists() ?: false
                        )
                        .toString()
                }
            }
        } catch (error: Exception) {
            resultCode = 4
            resultData = JSONObject()
                .put("ok", false)
                .put("error", error.javaClass.simpleName)
                .put("message", error.message.orEmpty())
                .toString()
        }
    }
}
