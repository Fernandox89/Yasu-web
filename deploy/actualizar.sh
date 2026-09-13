#!/usr/bin/env bash
# Trae la última versión de la página y de la configuración, y reinicia los servicios.
# Uso, en el servidor y como root:
#   bash /opt/voiceguard/web/deploy/actualizar.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Córrelo como root (o con sudo)."; exit 1; fi

git -C /opt/voiceguard/web pull --ff-only
install -m 644 /opt/voiceguard/web/deploy/Caddyfile /etc/caddy/Caddyfile
install -m 644 /opt/voiceguard/web/deploy/voiceguard-api.service /etc/systemd/system/voiceguard-api.service
systemctl daemon-reload
systemctl restart voiceguard-api
systemctl reload caddy
echo "Actualizado: $(git -C /opt/voiceguard/web log --oneline -1)"
