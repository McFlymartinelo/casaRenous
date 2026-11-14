#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT="${CERT_DIR}/fullchain.pem"
KEY="${CERT_DIR}/privkey.pem"

if [ -s "$CERT" ] && [ -s "$KEY" ]; then
  echo "[casarenous] certificats TLS présents"
  exit 0
fi

echo "[casarenous] aucun certificat monté : génération d'un certificat auto-signé (développement)"
mkdir -p "$CERT_DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$KEY" \
  -out "$CERT" \
  -subj "/CN=casarenous.local" \
  -addext "subjectAltName=DNS:casarenous.local,DNS:localhost,IP:127.0.0.1" \
  2>/dev/null
chmod 600 "$KEY"
echo "[casarenous] certificat auto-signé créé. En production, montez vos certificats Let's Encrypt."
