#!/system/bin/sh
SKIPUNZIP=1

ui_print "- Extracting module files..."
unzip -o "$ZIPFILE" -d "$MODPATH" >&2

rm -rf "$MODPATH/META-INF"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755

mod_name=$(grep -E '^name=' "$MODPATH/module.prop" | cut -d'=' -f2-)
mod_ver=$(grep -E '^version=' "$MODPATH/module.prop" | cut -d'=' -f2-)

old_moddir="/data/adb/modules/Astra_MaxRefresh_Pro"
if [ -f "$old_moddir/module.prop" ]; then
    old_vc=$(grep -E '^versionCode=' "$old_moddir/module.prop" | cut -d'=' -f2-)
    old_ver=$(grep -E '^version=' "$old_moddir/module.prop" | cut -d'=' -f2-)
    if [ -n "$old_vc" ] && [ "$old_vc" -lt 45 ] 2>/dev/null; then
        ui_print " "
        ui_print "============================================="
        ui_print " "
        ui_print "  ❌ Old version detected: $old_ver (versionCode=$old_vc)"
        ui_print " "
        ui_print "  V4.5 does not support direct overwrite install from an old version!"
        ui_print "  Please follow these steps:"
        ui_print " "
        ui_print "  1) Go to the path below and run the uninstall script with root:"
        ui_print "     $old_moddir/uninstall.sh"
        ui_print " "
        ui_print "  2) Delete this module in your root manager"
        ui_print " "
        ui_print "  3) Reboot your phone"
        ui_print " "
        ui_print "  4) After rebooting, flash V4.5 again"
        ui_print " "
        ui_print "============================================="
        ui_print " "
        abort "Please uninstall the old version before installing V4.5"
    fi
fi

ui_print "============================================="
ui_print " $mod_name $mod_ver"
ui_print "============================================="

GP="/system/bin/getprop"

model=$("$GP" ro.product.model)
[ -z "$model" ] && model=$("$GP" ro.product.odm.model)

market=$("$GP" ro.vendor.oplus.market.name)
[ -z "$market" ] && market=$("$GP" ro.product.market.name)
[ -z "$market" ] && market="$model"

brand=$("$GP" ro.product.brand)
[ -z "$brand" ] && brand=$("$GP" ro.product.system.brand)
brand=$(echo "$brand" | tr '[:upper:]' '[:lower:]')

mfr=$("$GP" ro.product.manufacturer)
[ -z "$mfr" ] && mfr=$("$GP" ro.product.system.manufacturer)
mfr=$(echo "$mfr" | tr '[:upper:]' '[:lower:]')

ui_print "- Detecting device brand..."

ok=0
echo "$brand" | grep -qiE "oneplus|oppo|realme|oplus" && ok=1
[ "$ok" -eq 0 ] && echo "$mfr" | grep -qiE "oneplus|oppo|realme|oplus" && ok=1
[ "$ok" -eq 0 ] && echo "$model" | grep -qiE "^PHK|^PH[A-Z]|^CPH|^RMX|^PJ[A-Z]|^PL[A-Z]|^OPD" && ok=1

if [ "$ok" -eq 0 ]; then
    ui_print " "
    ui_print "❌ Device brand detection failed!"
    ui_print "---------------------------------------------"
    ui_print "Detected brand: $brand"
    ui_print "Detected manufacturer: $mfr"
    ui_print "Detected model: $model"
    ui_print "---------------------------------------------"
    ui_print "This module only supports: OnePlus / OPPO / Realme"
    ui_print "Installation cancelled!"
    ui_print "============================================="
    abort "Unsupported device 😡😡😡"
fi

ui_print "✅Brand check passed: $brand / $mfr"

aver=$("$GP" ro.build.version.release)
romver=$("$GP" ro.build.display.id)
kver=$(uname -r)

ui_print "---------------------------------------------"
ui_print "[ Device Info ]"
ui_print "• Model: $model"
ui_print "• Device name: $market"
ui_print "• Android version: Android $aver"
ui_print "• Kernel version: $kver"
ui_print "• ROM version: $romver"
ui_print "---------------------------------------------"

modid="Astra_MaxRefresh_Pro"
pdir="/data/adb/${modid}_data"
mkdir -p "$pdir"
set_perm "$pdir" 0 0 0755

[ -f "$pdir/config.json" ] && cp -f "$pdir/config.json" "$MODPATH/config.json"
[ -f "$pdir/apps.conf" ] && cp -f "$pdir/apps.conf" "$MODPATH/apps.conf"
[ -f "$pdir/rates.conf" ] && cp -f "$pdir/rates.conf" "$MODPATH/rates.conf"

[ ! -f "$MODPATH/config.json" ] && echo '{}' > "$MODPATH/config.json"
[ ! -f "$MODPATH/apps.conf" ] && touch "$MODPATH/apps.conf"
[ ! -f "$MODPATH/rates.conf" ] && touch "$MODPATH/rates.conf"

set_perm "$MODPATH/config.json" 0 0 0644
set_perm "$MODPATH/apps.conf" 0 0 0644
set_perm "$MODPATH/rates.conf" 0 0 0644

waitkey() {
    getevent -qt 1 >/dev/null 2>&1
    while true; do
        ev=$(getevent -lqc 1 2>/dev/null | {
            while read -r line; do
                case "$line" in
                    *KEY_VOLUMEDOWN*DOWN*) echo "down"; break ;;
                    *KEY_VOLUMEUP*DOWN*) echo "up"; break ;;
                    *KEY_POWER*DOWN*) input keyevent KEY_POWER; echo "power"; break ;;
                esac
            done
        })
        [ -n "$ev" ] && echo "$ev" && return
        usleep 30000
    done
}

ui_print "============================================="
ui_print "- Install notes (must read)"
ui_print " "
ui_print "  1) Turbo High Refresh Pro does not support devices other than Oplus. If you bypass the model check to force-flash it, do not report any bugs you encounter to me."
ui_print "  2) On Alpha and its forks, grant root to \"System UI\" and \"System Launcher\""
ui_print "  3) On KernelSU and its forks, disable the \"Default unmount modules\" option"
ui_print "  4) Do not enable together with other refresh-rate / VRR / LTPO modules"
ui_print " "
ui_print "  [Vol Up] : I have read it, continue installation"
ui_print "  [Vol Down] : Exit installation"
ui_print " "
ui_print "============================================="

key=$(waitkey)
if [ "$key" != "up" ]; then
    abort "Notes not read"
fi

ui_print "============================================="
ui_print "- Choose LTPO control mode"
ui_print " "
ui_print "  [Power] : Compatible mode (recommended; keeps LTPO/VRR, only disables conflicting toggles)"
ui_print "  [Vol Up] : Force disable (high risk; may cause battery drain / flicker / instability)"
ui_print "  [Vol Down] : Keep mode (global tier has no effect; only per-app rules switch)"
ui_print " "
ui_print "============================================="

ltpo="compat"
ltpo_s="Compatible"
key=$(waitkey)

case "$key" in
    down) ltpo="keep"; ltpo_s="Kept (per-app only)"; ui_print "- Selected: Keep LTPO (global has no effect)" ;;
    power) ltpo="compat"; ltpo_s="Compatible"; ui_print "- Selected: Compatible mode" ;;
    up) ltpo="disable"; ltpo_s="Force disabled"; ui_print "- Selected: Force disable LTPO/VRR" ;;
    *) ltpo="compat"; ltpo_s="Compatible"; ui_print "- Selected: Compatible mode" ;;
esac

write_post_fs_data() {
    case "$1" in
        disable)
            cat > "$MODPATH/post-fs-data.sh" << 'PFEOF'
#!/system/bin/sh
MODDIR=${0%/*}

resetprop -n persist.oplus.display.vrr 0
resetprop -n persist.oplus.display.vrr.adfr 0
resetprop -n debug.oplus.display.dynamic_fps_switch 0
resetprop -n sys.display.vrr.vote.support 0
resetprop -n vendor.display.enable_dpps_dynamic_fps 0
resetprop -n ro.display.brightness.brightness.mode 1
resetprop -n debug.egl.swapinterval 1
PFEOF
            ;;
        compat)
            cat > "$MODPATH/post-fs-data.sh" << 'PFEOF'
#!/system/bin/sh
MODDIR=${0%/*}

resetprop -n ro.surface_flinger.use_content_detection_for_refresh_rate false
resetprop -n vendor.display.enable_optimize_refresh 0
resetprop -n debug.oplus.display.dynamic_fps_switch 0
PFEOF
            ;;
        keep|*)
            cat > "$MODPATH/post-fs-data.sh" << 'PFEOF'
#!/system/bin/sh
MODDIR=${0%/*}
PFEOF
            ;;
    esac
}

write_post_fs_data "$ltpo"
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755

echo "$ltpo" > "$MODPATH/ltpo_mode"
set_perm "$MODPATH/ltpo_mode" 0 0 0644

sleep 1

ui_print "============================================="
ui_print "- Checks complete. Environment is safe."


if [ "$ltpo" = "keep" ]; then
    desc="Provides turbo high refresh for ${market} (${model}). LTPO status: ${ltpo_s}. Configure on first flash. In Keep-LTPO mode: the global tier has no effect; only per-app rules switch. On the Apps page, enter the target app package name and the refresh rate tier ID to assign a dedicated refresh rate per app, applied in real time."
else
    desc="Provides turbo high refresh for ${market} (${model}). LTPO status: ${ltpo_s}. Configure on first flash. After reboots it will automatically switch to the selected global refresh rate tier. On the Apps page, enter the target app package name and the refresh rate tier ID to assign a dedicated refresh rate per app, applied in real time."
fi
desc_esc=$(echo "$desc" | sed 's/[\/&]/\\&/g')

if grep -q "^description=" "$MODPATH/module.prop"; then
    sed -i "s/^description=.*/description=${desc_esc}/" "$MODPATH/module.prop"
else
    echo "description=${desc}" >> "$MODPATH/module.prop"
fi

sleep 1
ui_print "- Module properties file updated"


ui_print "============================================="
ui_print "✅ Installation complete!"
ui_print "============================================="
