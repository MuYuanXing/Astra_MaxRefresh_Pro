#!/system/bin/sh
MODDIR=${0%/*}

echo ""
echo "========================================"
echo "    Astra_MaxRefresh_Pro Uninstaller"
echo "========================================"
echo ""

echo "[*] Deleting config data..."
rm -rf "/data/adb/Astra_MaxRefresh_Pro_data"
rm -rf /data/local/tmp/Astra_*
echo "[✓] Config data deleted"
echo ""

mode=$(cat "$MODDIR/ltpo_mode" 2>/dev/null | tr -d '\r\n')
[ -z "$mode" ] && mode="compat"

if [ "$mode" = "disable" ]; then
    echo "[*] Releasing LTPO/VRR properties..."
    resetprop --delete persist.oplus.display.vrr
    resetprop --delete persist.oplus.display.vrr.adfr
    resetprop --delete debug.oplus.display.dynamic_fps_switch
    resetprop --delete sys.display.vrr.vote.support
    resetprop --delete vendor.display.enable_dpps_dynamic_fps
    resetprop --delete ro.display.brightness.brightness.mode
    resetprop --delete debug.egl.swapinterval
    echo "[✓] LTPO/VRR properties released"
    echo ""
elif [ "$mode" = "compat" ]; then
    echo "[*] Releasing compatibility properties..."
    resetprop --delete ro.surface_flinger.use_content_detection_for_refresh_rate
    resetprop --delete vendor.display.enable_optimize_refresh
    resetprop --delete debug.oplus.display.dynamic_fps_switch
    echo "[✓] Compatibility properties released"
    echo ""
elif [ "$mode" = "keep" ]; then
    echo "[*] Currently in Keep-LTPO mode; skipping LTPO property restore"
    echo ""
else
    echo "[*] Unrecognized LTPO mode ($mode); skipping LTPO property restore"
    echo ""
fi

echo "[*] Restoring refresh rate settings..."
settings delete system peak_refresh_rate 2>/dev/null
settings delete system min_refresh_rate 2>/dev/null
settings delete system user_refresh_rate 2>/dev/null
echo "[✓] Refresh rate settings restored"
echo ""

echo "========================================"
echo ""
echo "  ██████╗ ██╗  ██╗"
echo " ██╔═══██╗██║ ██╔╝"
echo " ██║   ██║█████╔╝ "
echo " ██║   ██║██╔═██╗ "
echo " ╚██████╔╝██║  ██╗"
echo "  ╚═════╝ ╚═╝  ╚═╝"
echo ""
echo "========================================"
echo ""
echo "  Uninstall script finished!"
echo ""
echo "========================================"
echo ""
echo "  ⚠️  IMPORTANT! IMPORTANT! IMPORTANT!"
echo ""
echo "  Please manually reboot your phone right now!"
echo ""
echo "  Settings will not fully take effect without a reboot!"
echo ""
echo "========================================"
echo ""
echo "  If you are seeing this message, the uninstall script"
echo "  ran correctly. Do not ask me again why it did not"
echo "  work — rebooting is what makes it work!"
echo ""
echo "========================================"
echo ""
