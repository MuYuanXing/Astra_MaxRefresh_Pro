#!/system/bin/sh

MODID=Astra_MaxRefresh_Pro
DATA=/data/adb/${MODID}_data
SETTINGS=$DATA/settings.conf
RATES=$DATA/rates.conf
APPS=$DATA/apps.conf
STATE=$DATA/state.conf
REV=$DATA/rev
ORIG=$DATA/orig.conf
LOG=$DATA/run.log
STEP_US=50000

log() {
    [ -d "$DATA" ] || return 0
    if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 65536 ]; then
        tail -n 200 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
    fi
    echo "$(date '+%m-%d %H:%M:%S') $*" >> "$LOG"
}

is_num() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
        *) return 0 ;;
    esac
}

write_atomic() {
    cat > "$1.tmp" && mv -f "$1.tmp" "$1"
}


load_settings() {
    global_id=""
    app_switch=1
    app_interval=1
    [ -f "$SETTINGS" ] || return 0
    while IFS='=' read -r k v || [ -n "$k" ]; do
        v=$(printf %s "$v" | tr -d '\r ')
        case "$k" in
            global_id) is_num "$v" && global_id=$v ;;
            app_switch) [ "$v" = 0 ] && app_switch=0 || app_switch=1 ;;
            app_interval) is_num "$v" && [ "$v" -ge 1 ] && app_interval=$v ;;
        esac
    done < "$SETTINGS"
}

migrate_json() {
    [ -f "$SETTINGS" ] && return 0
    [ -f "$1" ] || return 0
    j=$(tr -d '\r\n\t ' < "$1")
    gid=$(printf %s "$j" | sed -nE 's/.*"globalRateId":([0-9]+).*/\1/p')
    sw=$(printf %s "$j" | sed -nE 's/.*"appSwitchEnabled":(true|false).*/\1/p')
    iv=$(printf %s "$j" | sed -nE 's/.*"appSwitchInterval":([0-9]+).*/\1/p')
    [ "$sw" = false ] && sw=0 || sw=1
    is_num "$iv" && [ "$iv" -ge 1 ] || iv=1
    printf 'global_id=%s\napp_switch=%s\napp_interval=%s\n' "$gid" "$sw" "$iv" | write_atomic "$SETTINGS"
    log "已从 $1 转换旧配置"
}

app_rate() {
    [ -n "$1" ] && [ -f "$APPS" ] || return 0
    awk -F= -v p="$1" '{ k=$1; gsub(/[[:space:]]/, "", k) } k==p { v=$2; gsub(/[[:space:]]/, "", v); print v; exit }' "$APPS"
}

has_app_rules() {
    grep -qE '^[[:space:]]*[A-Za-z][A-Za-z0-9_.]*[[:space:]]*=[[:space:]]*[0-9]+' "$APPS" 2>/dev/null
}


rate_info() {
    [ -n "$1" ] && [ -f "$RATES" ] || return 0
    awk -F: -v id="$1" '$1==id { print $5, $2, $3, ($7=="" ? 0 : $7+0); exit }' "$RATES"
}

native_base() {
    [ -f "$RATES" ] || return 0
    awk -F: -v w="$1" -v h="$2" '
        $2==w && $3==h && $5=="native" {
            if ($6=="1") { print $1; found=1; exit }
            if ($4==120 && fb=="") fb=$1
        }
        END { if (!found && fb!="") print fb }' "$RATES"
}

oc_seq() {
    [ -f "$RATES" ] || return 0
    awk -F: -v w="$1" -v h="$2" -v f="$3" -v t="$4" '
        $2==w && $3==h && $5=="overclock" && $7>0 {
            o = $7 + 0
            if (f < t ? (o > f && o <= t) : (o < f && o >= t)) print o ":" $1
        }' "$RATES" | if [ "$3" -lt "$4" ]; then sort -t: -k1,1n; else sort -t: -k1,1rn; fi | cut -d: -f2
}

scan_rates() {
    dumpsys SurfaceFlinger 2>/dev/null | grep 'id=[0-9]*, hwcId=' | awk '
        {
            id = ""; w = ""; h = ""; f = ""
            if (match($0, /id=[0-9]+,/)) id = substr($0, RSTART + 3, RLENGTH - 4)
            if (match($0, /resolution=[0-9]+x[0-9]+/)) { split(substr($0, RSTART + 11, RLENGTH - 11), a, "x"); w = a[1]; h = a[2] }
            if (match($0, /(vsyncRate|refreshRate)=[0-9.]+/)) { s = substr($0, RSTART, RLENGTH); sub(/.*=/, "", s); f = int(s + 0.5) }
            if (id != "" && w != "" && f != "" && !(id in seen)) { seen[id] = 1; print id, w, h, f }
        }' | sort -k4,4n -k2,2n | awk '
        {
            n++; id[n] = $1; w[n] = $2; h[n] = $3; f[n] = $4; k = $2 "x" $3
            if ($4 <= 120 && $4 > bf[k]) { bf[k] = $4; bi[k] = n }
        }
        END {
            for (i = 1; i <= n; i++) {
                k = w[i] "x" h[i]
                if (f[i] > 120) { o[k]++; print id[i] ":" w[i] ":" h[i] ":" f[i] ":overclock:0:" o[k] }
                else print id[i] ":" w[i] ":" h[i] ":" f[i] ":native:" (bi[k] == i ? 1 : 0) ":0"
            }
        }'
}


screen_on() {
    case "$(dumpsys power 2>/dev/null | grep -m1 -oE 'mWakefulness=[A-Za-z]+')" in
        *=Asleep|*=Dozing|*=Dreaming) return 1 ;;
    esac
    return 0
}

focus_app() {
    dumpsys activity activities 2>/dev/null | grep -E 'topResumedActivity=|mResumedActivity:' | tail -n 1 |
        sed -nE 's/.*ActivityRecord\{[^ ]+ (u[0-9]+ )?([^ /}]+)\/.*/\2/p'
}


sf_set() {
    usleep "$STEP_US" 2>/dev/null || sleep 0.05
    out=$(service call SurfaceFlinger 1035 i32 "$1" 2>&1)
    case "$out" in
        *rror*|*xception*) ;;
        *Parcel*) return 0 ;;
    esac
    log "切换档位 $1 失败：$out"
    return 1
}

backup_orig() {
    [ -f "$ORIG" ] && return 0
    {
        echo "peak=$(settings get system peak_refresh_rate 2>/dev/null)"
        echo "min=$(settings get system min_refresh_rate 2>/dev/null)"
    } | write_atomic "$ORIG"
}

widen() {
    [ "$(settings get system peak_refresh_rate 2>/dev/null)" = 240.0 ] || settings put system peak_refresh_rate 240.0 2>/dev/null
    [ "$(settings get system min_refresh_rate 2>/dev/null)" = 10.0 ] || settings put system min_refresh_rate 10.0 2>/dev/null
}

restore_orig() {
    [ -f "$ORIG" ] || return 0
    peak=$(sed -n 's/^peak=//p' "$ORIG")
    min=$(sed -n 's/^min=//p' "$ORIG")
    case "$peak" in ''|null|240.0) settings delete system peak_refresh_rate ;; *) settings put system peak_refresh_rate "$peak" ;; esac
    case "$min" in ''|null|10.0) settings delete system min_refresh_rate ;; *) settings put system min_refresh_rate "$min" ;; esac
    rm -f "$ORIG"
}

apply() {
    tid=$1
    mode=$2
    is_num "$tid" || return 1
    [ "$mode" != force ] && [ "$tid" = "$cur_id" ] && return 0

    set -- $(rate_info "$tid")
    tt=$1 tw=$2 th=$3 to=${4:-0}
    ct="" cw="" ch="" co=0
    if [ "$mode" != force ] && [ -n "$cur_id" ]; then
        set -- $(rate_info "$cur_id")
        ct=$1 cw=$2 ch=$3 co=${4:-0}
    fi

    widen
    cur_id=""

    if [ "$tt" = overclock ] && [ "$ct" = overclock ] && [ "${cw}x$ch" = "${tw}x$th" ]; then
        for i in $(oc_seq "$tw" "$th" "$co" "$to"); do sf_set "$i" || return 1; done
    else
        if [ "$ct" = overclock ]; then
            for i in $(oc_seq "$cw" "$ch" "$co" 0); do sf_set "$i" || return 1; done
            b=$(native_base "$cw" "$ch")
            [ -n "$b" ] && { sf_set "$b" || return 1; }
        fi
        if [ "$tt" = overclock ]; then
            b=$(native_base "$tw" "$th")
            if [ -z "$b" ]; then
                log "分辨率 ${tw}x$th 没有原生基准，无法切到超频档 $tid"
                return 1
            fi
            sf_set "$b" || return 1
            for i in $(oc_seq "$tw" "$th" 0 "$to"); do sf_set "$i" || return 1; done
        else
            sf_set "$tid" || return 1
        fi
    fi

    cur_id=$tid
    log "已切换到档位 $tid"
    return 0
}

release() {
    [ -n "$cur_id" ] || return 0
    set -- $(rate_info "$cur_id")
    if [ "$1" = overclock ]; then
        for i in $(oc_seq "$2" "$3" "${4:-0}" 0); do sf_set "$i"; done
        b=$(native_base "$2" "$3")
        [ -n "$b" ] && sf_set "$b"
    fi
    cur_id=""
    log "已交还系统控制"
}
