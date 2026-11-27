package dev.dwell.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

object LauncherManager {
    private const val TAG = "LauncherManager"

    data class LauncherInfo(
        val packageName: String,
        val activityName: String,
        val label: String,
        val isDefault: Boolean,
        val isDeskDock: Boolean
    )

    fun getInstalledLaunchers(ctx: Context): List<LauncherInfo> {
        val pm = ctx.packageManager
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)

        val resolved = pm.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
        val defaultPkg = resolved?.activityInfo?.packageName
        val defaultAct = resolved?.activityInfo?.name

        val list = pm.queryIntentActivities(homeIntent, 0)
        return list.map { ri ->
            val pkg = ri.activityInfo.packageName
            val act = ri.activityInfo.name
            val label = ri.loadLabel(pm).toString()
            val isDef = (pkg == defaultPkg && (defaultAct == null || act == defaultAct))
            val isDock = (pkg == ctx.packageName)
            LauncherInfo(pkg, act, label, isDef, isDock)
        }
    }

    fun getSummary(ctx: Context): JSONObject {
        val launchers = getInstalledLaunchers(ctx)
        val arr = JSONArray()
        var currentDef: JSONObject? = null

        launchers.forEach { l ->
            val o = JSONObject()
                .put("package", l.packageName)
                .put("activity", l.activityName)
                .put("label", l.label)
                .put("isDefault", l.isDefault)
                .put("isDeskDock", l.isDeskDock)
            arr.put(o)
            if (l.isDefault) currentDef = o
        }

        return JSONObject()
            .put("launchers", arr)
            .put("currentDefault", currentDef ?: JSONObject.NULL)
            .put("isDockDefault", currentDef?.optBoolean("isDeskDock", false) ?: false)
    }

    fun setAsDefault(pkg: String, act: String): Boolean {
        AppLogger.i(TAG, "Setting default home activity to $pkg/$act")
        val res = Root.sh("cmd package set-home-activity $pkg/$act")
        val ok = res.code == 0 && (res.out.contains("Success") || res.out.isBlank())
        if (ok) {
            AppLogger.i(TAG, "Successfully set default home activity: $pkg/$act")
        } else {
            AppLogger.w(TAG, "cmd package set-home-activity output: ${res.out}")
        }
        return ok
    }

    fun setDeskDockAsDefault(ctx: Context): Boolean {
        val ok = setAsDefault(ctx.packageName, MainActivity::class.java.name)
        launchActivity(ctx, ctx.packageName, MainActivity::class.java.name)
        return ok
    }

    fun restoreStockLauncher(ctx: Context): Boolean {
        val launchers = getInstalledLaunchers(ctx)
        val stock = launchers.firstOrNull { !it.isDeskDock }
        return if (stock != null) {
            AppLogger.i(TAG, "Restoring stock launcher: ${stock.packageName}/${stock.activityName}")
            val ok = setAsDefault(stock.packageName, stock.activityName)
            launchActivity(ctx, stock.packageName, stock.activityName)
            ok
        } else {
            AppLogger.w(TAG, "No alternative stock launcher found!")
            false
        }
    }

    fun launchActivity(ctx: Context, pkg: String, act: String): Boolean {
        return try {
            AppLogger.i(TAG, "Launching home activity: $pkg/$act")
            Root.sh("am start -n $pkg/$act -a android.intent.action.MAIN -c android.intent.category.HOME")
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                component = ComponentName(pkg, act)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to launch $pkg/$act", e)
            false
        }
    }

    fun openSystemHomeSettings(ctx: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_HOME_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to open ACTION_HOME_SETTINGS", e)
            false
        }
    }
}
