#!/system/bin/sh
MODDIR=$(cd "${0%/*}" && pwd)
. "$MODDIR/common.sh"

mkdir -p "$DATA"

ltpo_mode=$(tr -d '\r\n' < "$MODDIR/ltpo_mode" 2>/dev/null)
[ -n "$ltpo_mode" ] || ltpo_mode=compat

n=0
until [ "$(getprop sys.boot_completed)" = 1 ]; do
    sleep 1
    n=$((n + 1))
    [ "$n" -eq 300 ] && log "等待开机已超过 5 分钟"
done

log "后台程序启动，LTPO 模式：$ltpo_mode"
backup_orig
migrate_json "$DATA/config.json"
migrate_json "$MODDIR/config.json"

cur_id=""
app=""
rules=0
last_rev="__none__"
screen=1
fail_id=""
fail_at=0
last_state=""

reload() {
    load_settings
    if [ ! -s "$RATES" ]; then
        scan_rates | write_atomic "$RATES"
        log "档位表为空，已自动扫描 $(grep -c . "$RATES") 个档位"
    fi
    has_app_rules && rules=1 || rules=0
}

pick_target() {
    t=""
    [ "$app_switch" = 1 ] && [ "$rules" = 1 ] && t=$(app_rate "$app")
    [ -z "$t" ] && [ "$ltpo_mode" != keep ] && t=$global_id
    echo "$t"
}

save_state() {
    s="cur_id=$cur_id
target=$1
app=$app
error=$2"
    [ "$s" = "$last_state" ] && return
    last_state=$s
    echo "$s" | write_atomic "$STATE"
}

while true; do
    if ! screen_on; then
        screen=0
        sleep 1
        continue
    fi

    force=""
    [ "$screen" = 0 ] && force=force
    screen=1

    rev=$(cat "$REV" 2>/dev/null)
    if [ "$rev" != "$last_rev" ]; then
        last_rev=$rev
        reload
        fail_id=""
    fi

    if [ "$app_switch" = 1 ] && [ "$rules" = 1 ]; then
        a=$(focus_app)
        [ -n "$a" ] && app=$a
    else
        app=""
    fi

    target=$(pick_target)
    err=""
    if [ -n "$target" ]; then
        if [ "$target" != "$cur_id" ] || [ -n "$force" ]; then
            if [ -z "$force" ] && [ "$target" = "$fail_id" ] && [ $(($(date +%s) - fail_at)) -lt 30 ]; then
                err=1
            elif apply "$target" $force; then
                fail_id=""
            else
                fail_id=$target
                fail_at=$(date +%s)
                err=1
            fi
        fi
    elif [ "$ltpo_mode" = keep ]; then
        release
    fi
    [ -n "$fail_id" ] && err=1
    save_state "$target" "$err"

    if [ "$app_switch" = 1 ] && [ "$rules" = 1 ]; then
        sleep "$app_interval"
    else
        sleep 1
    fi
done
