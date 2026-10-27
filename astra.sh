#!/system/bin/sh
MODDIR=$(cd "${0%/*}" && pwd)
. "$MODDIR/common.sh"

case "$1" in
    scan)
        scan_rates
        ;;
    reset)
        rm -f "$SETTINGS" "$RATES" "$APPS" "$STATE" "$DATA/config.json"
        date +%s > "$REV"
        log "已清除全部配置"
        ;;
    *)
        echo "用法：astra.sh scan|reset" >&2
        exit 1
        ;;
esac
