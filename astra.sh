#!/system/bin/sh
MODDIR=$(cd "${0%/*}" && pwd)
. "$MODDIR/common.sh"

case "$1" in
    scan)
        scan_rates
        ;;
    apps)
        pm list packages -3 2>/dev/null | tr -d '\r' | sed -n 's/^package:\(.*\)$/\1 0/p'
        pm list packages -s 2>/dev/null | tr -d '\r' | sed -n 's/^package:\(.*\)$/\1 1/p'
        ;;
    reset)
        rm -f "$SETTINGS" "$RATES" "$APPS" "$STATE" "$DATA/config.json"
        date +%s > "$REV"
        log "已清除全部配置"
        ;;
    *)
        echo "用法：astra.sh scan|apps|reset" >&2
        exit 1
        ;;
esac
