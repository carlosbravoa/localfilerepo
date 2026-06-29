#!/usr/bin/env bash
# Install mysharedbucket as an always-on systemd service.
# Run from the project directory:  ./install.sh
set -euo pipefail

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="$(id -un)"
SERVICE_NAME="mysharedbucket"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

echo "Installing ${SERVICE_NAME}"
echo "  app dir : ${APPDIR}"
echo "  user    : ${USER_NAME}"
echo "  storage : ${APPDIR}/storage"

mkdir -p "${APPDIR}/storage"

# Render the unit file with real paths and the current user.
TMP_UNIT="$(mktemp)"
sed -e "s|__USER__|${USER_NAME}|g" \
    -e "s|__APPDIR__|${APPDIR}|g" \
    "${APPDIR}/${SERVICE_NAME}.service" > "${TMP_UNIT}"

sudo cp "${TMP_UNIT}" "${UNIT_PATH}"
rm -f "${TMP_UNIT}"

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

echo
echo "Done. Service status:"
sudo systemctl --no-pager --lines=0 status "${SERVICE_NAME}" || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Open in a browser on your LAN:  http://${IP:-<server-ip>}:8000"
echo "Logs:    journalctl -u ${SERVICE_NAME} -f"
echo "Restart: sudo systemctl restart ${SERVICE_NAME}"
