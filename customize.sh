#!/system/bin/sh
SKIPUNZIP=1

ui_print "- 解压模块文件..."
unzip -o "$ZIPFILE" -d "$MODPATH" >&2

rm -rf "$MODPATH/META-INF"

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755

mod_name=$(grep -E '^name=' "$MODPATH/module.prop" | cut -d'=' -f2-)
mod_ver=$(grep -E '^version=' "$MODPATH/module.prop" | cut -d'=' -f2-)
target_ver="$mod_ver"
[ -z "$target_ver" ] && target_ver="当前版本"

old_moddir="/data/adb/modules/Astra_MaxRefresh_Pro"
if [ -f "$old_moddir/module.prop" ]; then
    old_vc=$(grep -E '^versionCode=' "$old_moddir/module.prop" | cut -d'=' -f2-)
    old_ver=$(grep -E '^version=' "$old_moddir/module.prop" | cut -d'=' -f2-)
    if [ -n "$old_vc" ] && [ "$old_vc" -lt 45 ] 2>/dev/null; then
        ui_print " "
        ui_print "============================================="
        ui_print " "
        ui_print "  ❌ 检测到旧版本 $old_ver (versionCode=$old_vc)"
        ui_print " "
        ui_print "  ${target_ver} 不支持从旧版本直接覆盖安装！"
        ui_print "  请按以下步骤操作："
        ui_print " "
        ui_print "  1) 进入以下路径执行使用 Root 权限执行卸载脚本："
        ui_print "     $old_moddir/uninstall.sh"
        ui_print " "
        ui_print "  2) 在 Root 管理器中删除该模块"
        ui_print " "
        ui_print "  3) 重启手机"
        ui_print " "
        ui_print "  4) 重启后再重新刷入 ${target_ver}"
        ui_print " "
        ui_print "============================================="
        ui_print " "
        abort "请先卸载旧版本再安装 ${target_ver}"
    fi
fi

ui_print "============================================="
ui_print " $mod_name $mod_ver"
ui_print " 作者: 酷安@穆远星"
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

ui_print "- 正在监测设备品牌..."

ok=0
echo "$brand" | grep -qiE "oneplus|oppo|realme|oplus" && ok=1
[ "$ok" -eq 0 ] && echo "$mfr" | grep -qiE "oneplus|oppo|realme|oplus" && ok=1
[ "$ok" -eq 0 ] && echo "$model" | grep -qiE "^PHK|^PH[A-Z]|^CPH|^RMX|^PJ[A-Z]|^PL[A-Z]|^OPD" && ok=1

if [ "$ok" -eq 0 ]; then
    ui_print " "
    ui_print "❌ 设备品牌监测失败!"
    ui_print "---------------------------------------------"
    ui_print "监测到的品牌: $brand"
    ui_print "监测到的制造商: $mfr"
    ui_print "监测到的型号: $model"
    ui_print "---------------------------------------------"
    ui_print "此模块仅支持: OnePlus / OPPO / Realme"
    ui_print "安装已取消!"
    ui_print "============================================="
    abort "设备不普通😡😡😡"
fi

ui_print "✅品牌监测通过: $brand / $mfr"

aver=$("$GP" ro.build.version.release)
romver=$("$GP" ro.build.display.id)
kver=$(uname -r)

ui_print "---------------------------------------------"
ui_print "【设备信息监测】"
ui_print "• 机型型号: $model"
ui_print "• 机型名称: $market"
ui_print "• 安卓版本: Android $aver"
ui_print "• 内核版本: $kver"
ui_print "• 系统版本: $romver"
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
ui_print "- 安装须知（必读）"
ui_print " "
ui_print "  1) 极速高刷Pro不支持除欧加真以外的机型，当你修改机型校验逻辑强行刷入后，遇到的BUG请勿向我反馈"
ui_print "  2) Alpha 及分支，请给「系统界面」与「系统桌面」Root 权限"
ui_print "  3) KernelSU 及分支，请关闭「默认卸载模块」功能"
ui_print "  4) 请勿与其它 “刷新率/VRR/LTPO” 类模块同时启用"
ui_print " "
ui_print "  [音量上] : 已阅读，继续安装"
ui_print "  [音量下] : 退出安装"
ui_print " "
ui_print "============================================="

key=$(waitkey)
if [ "$key" != "up" ]; then
    abort "未阅读须知"
fi

ui_print "============================================="
ui_print "- 请选择 LTPO 控制模式"
ui_print " "
ui_print "  [电源键] : 兼容模式 (推荐，保留LTPO/VRR，仅关闭可能冲突开关)"
ui_print "  [音量上] : 强制禁用 (高风险，可能耗电/闪屏/不稳定)"
ui_print "  [音量下] : 保留模式 (全局不生效，仅应用配置切换)"
ui_print " "
ui_print "============================================="

ltpo="compat"
ltpo_s="兼容模式"
key=$(waitkey)

case "$key" in
    down) ltpo="keep"; ltpo_s="已保留(仅应用)"; ui_print "- 已选择：保留LTPO (全局不生效)" ;;
    power) ltpo="compat"; ltpo_s="兼容模式"; ui_print "- 已选择：兼容模式" ;;
    up) ltpo="disable"; ltpo_s="强制禁用"; ui_print "- 已选择：强制禁用LTPO/VRR" ;;
    *) ltpo="compat"; ltpo_s="兼容模式"; ui_print "- 已选择：兼容模式" ;;
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
ui_print "- 监测完成，环境安全。"
ui_print "- 可以关注下我的酷安吗喵？🥹🥹🥹"
ui_print "  (作者: 穆远星 / ID: 28719807)"
ui_print " "
ui_print "  [音量上] : 好的喵 (关注并安装) 🥰"
ui_print "  [音量下] : 不要喵 (直接安装) 😤"
ui_print "============================================="

jump="false"
key=$(waitkey)

if [ "$key" = "up" ]; then
    jump="true"
    ui_print "- 感谢关注喵✋😭✋！"
else
    ui_print "- 不关注俺喵✋😭✋"
fi

if [ "$ltpo" = "keep" ]; then
    desc="为${market}(${model})提供极速高刷。LTPO状态: ${ltpo_s}。首次刷入请配置。保留LTPO模式下：全局档位不生效，仅应用配置切换生效。应用配置页面，填写目标应用包名及刷新率档位对应ID，即可为指定应用单独配置专属刷新率，实时生效。"
else
    desc="为${market}(${model})提供极速高刷。LTPO状态: ${ltpo_s}。首次刷入请配置。后续重启将自动切换至选定的全局刷新率档位。应用配置页面，填写目标应用包名及刷新率档位对应ID，即可为指定应用单独配置专属刷新率，实时生效。"
fi
desc_esc=$(echo "$desc" | sed 's/[\/&]/\\&/g')

if grep -q "^description=" "$MODPATH/module.prop"; then
    sed -i "s/^description=.*/description=${desc_esc}/" "$MODPATH/module.prop"
else
    echo "description=${desc}" >> "$MODPATH/module.prop"
fi

sleep 1
ui_print "- 已更新模块属性文件"

if [ "$jump" = "true" ]; then
    boot=$("$GP" sys.boot_completed)
    if [ "$boot" = "1" ]; then
        sleep 1
        ui_print "- 正在打开酷安..."
        am start -a android.intent.action.VIEW -d "http://www.coolapk.com/u/28719807" >/dev/null 2>&1
    fi
fi

ui_print "============================================="
ui_print "✅ 安装完成！"
ui_print "============================================="
