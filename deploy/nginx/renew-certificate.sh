#!/bin/sh
set -eu
# Certbot's global hook directory also receives renewals for other sites.
if [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/learnbyquiz.spiritedrobot.in" ]; then
    nginx -t
    systemctl reload nginx
fi
