#!/system/bin/sh
MODDIR=${0%/*}

echo ""
echo "========================================"
echo "    Astra_MaxRefresh_Pro 卸载程序"
echo "========================================"
echo ""

echo "[*] 正在删除配置数据..."
rm -rf "/data/adb/Astra_MaxRefresh_Pro_data"
rm -rf /data/local/tmp/Astra_*
echo "[✓] 配置数据已删除"
echo ""

mode=$(cat "$MODDIR/ltpo_mode" 2>/dev/null | tr -d '\r\n')
[ -z "$mode" ] && mode="compat"

if [ "$mode" = "disable" ]; then
    echo "[*] 正在释放LTPO/VRR相关属性..."
    resetprop --delete persist.oplus.display.vrr
    resetprop --delete persist.oplus.display.vrr.adfr
    resetprop --delete debug.oplus.display.dynamic_fps_switch
    resetprop --delete sys.display.vrr.vote.support
    resetprop --delete vendor.display.enable_dpps_dynamic_fps
    resetprop --delete ro.display.brightness.brightness.mode
    resetprop --delete debug.egl.swapinterval
    echo "[✓] LTPO/VRR属性已释放"
    echo ""
elif [ "$mode" = "compat" ]; then
    echo "[*] 正在释放兼容相关属性..."
    resetprop --delete ro.surface_flinger.use_content_detection_for_refresh_rate
    resetprop --delete vendor.display.enable_optimize_refresh
    resetprop --delete debug.oplus.display.dynamic_fps_switch
    echo "[✓] 兼容相关属性已释放"
    echo ""
elif [ "$mode" = "keep" ]; then
    echo "[*] 当前为保留LTPO模式，跳过LTPO属性恢复"
    echo ""
else
    echo "[*] 未识别LTPO模式($mode)，跳过LTPO属性恢复"
    echo ""
fi

echo "[*] 正在恢复刷新率设置..."
settings delete system peak_refresh_rate 2>/dev/null
settings delete system min_refresh_rate 2>/dev/null
settings delete system user_refresh_rate 2>/dev/null
echo "[✓] 刷新率设置已恢复"
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
echo "  卸载脚本已执行完成！"
echo ""
echo "========================================"
echo ""
echo "  ⚠️  重要！重要！重要！"
echo ""
echo "  请你现在立刻手动重启手机！"
echo ""
echo "  不重启的话设置不会完全生效！"
echo ""
echo "========================================"
echo ""
echo "  如果你看到这条消息，说明卸载脚本"
echo "  已经正确执行，不要再来问我为什么"
echo "  没有效果，重启就有效果了！"
echo ""
echo "========================================"
echo ""
