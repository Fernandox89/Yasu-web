#!/usr/bin/env bash
# Prepara un servidor Ubuntu 24.04 de Vultr para VoiceGuard:
#   - Caddy en el puerto 80 (HTTP), sin límite de tamaño de cuerpo
#   - la página en /  y la API en /detect, en el mismo servidor
#   - API provisional: el servidor de ejemplo de Altur (respuesta de relleno) hasta tener la API real
#
# Uso, en el servidor y como root:
#   git clone https://github.com/Fernandox89/voiceguard-web /opt/voiceguard/web
#   bash /opt/voiceguard/web/deploy/instalar.sh
set -euo pipefail

BASE=/opt/voiceguard
WEB=$BASE/web
API=$BASE/api

if [ "$(id -u)" -ne 0 ]; then echo "Córrelo como root (o con sudo)."; exit 1; fi
if [ ! -f "$WEB/deploy/Caddyfile" ]; then echo "No encuentro $WEB. Clona primero el repo de la página ahí."; exit 1; fi

echo "== 1/6 Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q caddy git python3 python3-venv curl

echo "== 2/6 Usuario sin privilegios para la API"
id voiceguard >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin voiceguard
mkdir -p "$API"

echo "== 3/6 API provisional: servidor de ejemplo de Altur"
curl -fsSL https://raw.githubusercontent.com/alturio/hackmty26/main/scripts/example_server.py -o "$API/example_server.py"
chown -R voiceguard:voiceguard "$API"
install -m 644 "$WEB/deploy/voiceguard-api.service" /etc/systemd/system/voiceguard-api.service

echo "== 4/6 Caddy: página en / y API en /detect"
install -m 644 "$WEB/deploy/Caddyfile" /etc/caddy/Caddyfile

echo "== 5/6 Firewall del sistema (solo si ufw está activo)"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
fi

echo "== 6/6 Arrancar servicios"
systemctl daemon-reload
systemctl enable --now voiceguard-api
systemctl enable caddy
systemctl restart caddy
sleep 2

echo
echo "== Comprobación dentro del servidor"
curl -s -o /dev/null -w "  página  (/)        HTTP %{http_code}\n" http://127.0.0.1/
curl -s -o /dev/null -w "  salud   (/health)  HTTP %{http_code}\n" http://127.0.0.1/health
printf '  detect  (/detect)  '
python3 - <<'EOF'
import base64, io, json, struct, urllib.request, wave
buf = io.BytesIO()
with wave.open(buf, "wb") as w:                      # 1 s de silencio estéreo a 8 kHz, solo para probar la tubería
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(8000); w.writeframes(struct.pack("<16000h", *([0] * 16000)))
cuerpo = json.dumps({"call_id": "prueba", "audio_base64": base64.b64encode(buf.getvalue()).decode(), "sample_rate": 8000, "channels": 2}).encode()
req = urllib.request.Request("http://127.0.0.1/detect", data=cuerpo, headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=30) as r:
    print(f"HTTP {r.status} {r.read().decode()}")
EOF

IP=$(hostname -I | awk '{print $1}')
echo
echo "Listo."
echo "  Página:   http://$IP/"
echo "  Endpoint: http://$IP/detect"
