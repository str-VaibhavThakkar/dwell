#!/system/bin/sh
export PATH=/data/data/com.termux/files/usr/bin:$PATH
export LD_PRELOAD=""
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export TMPDIR=/data/data/com.termux/files/usr/tmp
export LANG=en_US.UTF-8

cd /data/data/com.termux/files/home
exec /data/data/com.termux/files/usr/bin/bash -c "$*"
