package dev.dwell.app

import android.app.Activity
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
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

    fun isDefaultLauncher(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = ctx.getSystemService(RoleManager::class.java)
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                return roleManager.isRoleHeld(RoleManager.ROLE_HOME)
            }
        }
        val defaultPkg = getDefaultLauncherPackage(ctx) ?: return false
        return defaultPkg == ctx.packageName
    }

    fun getDefaultLauncherPackage(ctx: Context): String? {
        val pm = ctx.packageManager
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = pm.resolveActivity(homeIntent, PackageManager.MATCH_DEFAULT_ONLY)
        val pkg = resolved?.activityInfo?.packageName
        if (pkg == null || pkg == "android" || pkg.contains("resolver", ignoreCase = true)) {
            return null
        }
        return pkg
    }

    fun getDefaultLauncherLabel(ctx: Context): String {
        val defaultPkg = getDefaultLauncherPackage(ctx) ?: return "None (System Chooser)"
        if (defaultPkg == ctx.packageName) return "Desk Dock"
        return try {
            val pm = ctx.packageManager
            val appInfo = pm.getApplicationInfo(defaultPkg, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            defaultPkg
        }
    }

    fun getInstalledLaunchers(ctx: Context): List<LauncherInfo> {
        val pm = ctx.packageManager
        val homeIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)

        val defaultPkg = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = ctx.getSystemService(RoleManager::class.java)
            if (roleManager != null && roleManager.isRoleHeld(RoleManager.ROLE_HOME)) {
                ctx.packageName
            } else {
                getDefaultLauncherPackage(ctx)
            }
        } else {
            getDefaultLauncherPackage(ctx)
        }

        val list = pm.queryIntentActivities(homeIntent, 0)
        return list.map { ri ->
            val pkg = ri.activityInfo.packageName
            val act = ri.activityInfo.name
            val label = ri.loadLabel(pm).toString()
            val isDef = (pkg == defaultPkg)
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

        val isDockDefault = isDefaultLauncher(ctx)
        val defaultLabel = getDefaultLauncherLabel(ctx)

        return JSONObject()
            .put("launchers", arr)
            .put("currentDefault", currentDef ?: JSONObject.NULL)
            .put("defaultLauncherName", defaultLabel)
            .put("isDockDefault", isDockDefault)
    }

    fun requestDefaultHomeRoleOrSettings(activity: Activity): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = activity.getSystemService(RoleManager::class.java)
                if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                    if (!roleManager.isRoleHeld(RoleManager.ROLE_HOME)) {
                        val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME)
                        activity.startActivity(intent)
                        return true
                    }
                }
            }
            openSystemHomeSettings(activity)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to request home role: ${e.message}")
            openSystemHomeSettings(activity)
        }
    }

    fun openLauncherChooser(activity: Activity): Boolean {
        return openSystemHomeSettings(activity)
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
        if (!ok && ctx is Activity) {
            requestDefaultHomeRoleOrSettings(ctx)
        } else if (!ok) {
            openSystemHomeSettings(ctx)
        }
        launchActivity(ctx, ctx.packageName, MainActivity::class.java.name)
        return ok
    }

    fun launchActivity(ctx: Context, pkg: String, act: String): Boolean {
        return try {
            AppLogger.i(TAG, "Launching home activity: $pkg/$act")
            if (Root.available) {
                Root.sh("am start -n $pkg/$act -a android.intent.action.MAIN -c android.intent.category.HOME")
            }
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
            openAppDetailsSettings(ctx)
        }
    }

    fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        return pm?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false
    }

    fun openBatteryOptimizationSettings(activity: Activity): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                true
            } else {
                openAppDetailsSettings(activity)
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS failed: ${e.message}")
            try {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                true
            } catch (e2: Exception) {
                openAppDetailsSettings(activity)
            }
        }
    }

    fun openAutoStartSettings(ctx: Context): Boolean {
        val brand = Build.BRAND.lowercase()
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        // Xiaomi / Redmi / Poco (MIUI / HyperOS)
        if (brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") ||
            manufacturer.contains("xiaomi")) {
            intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")))
            intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.powercenter.PowerSettings")))
            intents.add(Intent("miui.intent.action.OP_AUTO_START").addCategory(Intent.CATEGORY_DEFAULT))
        }

        // Samsung (One UI / Smart Manager)
        if (brand.contains("samsung") || manufacturer.contains("samsung")) {
            intents.add(Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")))
            intents.add(Intent().setComponent(ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity")))
            intents.add(Intent().setComponent(ComponentName("com.samsung.android.sm", "com.samsung.android.sm.app.dashboard.SmartManagerDashBoardActivity")))
        }

        // Huawei / Honor (EMUI / HarmonyOS)
        if (brand.contains("huawei") || brand.contains("honor") || manufacturer.contains("huawei")) {
            intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")))
            intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.bootstart.BootStartActivity")))
            intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity")))
        }

        // Oppo / Realme / OnePlus (ColorOS / OxygenOS)
        if (brand.contains("oppo") || brand.contains("realme") || brand.contains("oneplus") ||
            manufacturer.contains("oppo") || manufacturer.contains("oneplus")) {
            intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")))
            intents.add(Intent().setComponent(ComponentName("com.oplus.battery", "com.oplus.battery.AppListActivity")))
            intents.add(Intent().setComponent(ComponentName("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaurd.PowerConsumptionOptimizationActivity")))
            intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")))
        }

        // Vivo / iQOO (Funtouch OS / OriginOS)
        if (brand.contains("vivo") || brand.contains("iqoo") || manufacturer.contains("vivo")) {
            intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")))
            intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")))
            intents.add(Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity")))
        }

        // Transsion (Tecno, Infinix, itel)
        if (brand.contains("tecno") || brand.contains("infinix") || brand.contains("itel")) {
            intents.add(Intent().setComponent(ComponentName("com.transsion.phonemanager", "com.transsion.phonemanager.view.AutoRunManagerActivity")))
        }

        // Try candidate OEM intents
        for (candidate in intents) {
            try {
                candidate.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (ctx.packageManager.resolveActivity(candidate, PackageManager.MATCH_DEFAULT_ONLY) != null ||
                    ctx.packageManager.queryIntentActivities(candidate, 0).isNotEmpty()) {
                    ctx.startActivity(candidate)
                    return true
                }
            } catch (_: Exception) {}
        }

        // Safe fallback: App Details Settings where the user can manage permissions and battery
        return openAppDetailsSettings(ctx)
    }

    fun openAppDetailsSettings(ctx: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${ctx.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to open application details settings", e)
            false
        }
    }

    /** Returns all launchable user apps for the minimal App Drawer sheet. */
    fun getInstalledApps(ctx: Context): JSONArray {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolveList = pm.queryIntentActivities(intent, 0)
        val sorted = resolveList.sortedBy { it.loadLabel(pm).toString().lowercase() }
        val array = JSONArray()

        for (ri in sorted) {
            val pkg = ri.activityInfo.packageName
            val label = ri.loadLabel(pm).toString()
            if (pkg == ctx.packageName) continue // Hide self from app drawer list

            val obj = JSONObject().apply {
                put("package", pkg)
                put("label", label)
            }
            array.put(obj)
        }
        return array
    }

    fun launchApp(ctx: Context, packageName: String): Boolean {
        return try {
            val pm = ctx.packageManager
            val intent = pm.getLaunchIntentForPackage(packageName) ?: return false
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error launching app $packageName: ${e.message}")
            false
        }
    }
}
