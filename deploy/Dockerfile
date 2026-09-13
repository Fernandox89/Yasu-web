# Prueba de infraestructura en Railway: el servidor de ejemplo de Altur, que responde con una
# decisión de relleno. Sirve para comprobar que Railway acepta cuerpos de ~12 MB y responde a tiempo.
# El script no se copia a este repo: se descarga del repo de Altur (commit fijo) al construir.
FROM python:3.12-slim

# Que los mensajes del servidor salgan al momento en los logs de Railway
ENV PYTHONUNBUFFERED=1

WORKDIR /app
ADD https://raw.githubusercontent.com/alturio/hackmty26/429adf76b15d1bd18e26b50f371ca4f13b0585c0/scripts/example_server.py example_server.py

# Railway indica en PORT el puerto donde debe escuchar el servidor
CMD python example_server.py --host 0.0.0.0 --port ${PORT:-8000}
